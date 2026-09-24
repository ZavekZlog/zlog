/**
 * Browser-side Site Diary PDF export job bridge (fingerprint → enqueue → poll).
 * Does not download artifacts or generate PDFs locally.
 */

import { emitShareDiag } from './share-diag-beacon.js'

/** @typedef {(stage: string, payload: Record<string, unknown>) => void} ShareTimingHook */

export const SITE_DIARY_SHARE_TIMING_STAGE = {
  fingerprint: 'share-timing-t2-fingerprint',
  enqueue: 'share-timing-t3-enqueue',
  pollComplete: 'share-timing-t4-poll-complete',
  artifactAuthorize: 'share-timing-t5-artifact-authorize',
  signedFetchResponse: 'share-timing-t6-signed-fetch-response',
  signedFetchBlob: 'share-timing-t7-signed-fetch-blob',
  shareReadyFile: 'share-timing-t8-share-ready-file',
}

/** @readonly */
export const SITE_DIARY_PDF_EXPORT_HANDOFF = {
  exportReady: 'export-ready',
  fileReady: 'file-ready',
}

export const SITE_DIARY_PDF_EXPORT_RPC = {
  enqueue: 'enqueue_site_diary_pdf_export',
  get: 'get_site_diary_pdf_export',
}

export const SITE_DIARY_PDF_EXPORT_CLIENT_CODE = {
  fingerprintHttp: 'fingerprint-http-failed',
  fingerprintInvalid: 'fingerprint-invalid-response',
  enqueueRpc: 'enqueue-rpc-failed',
  enqueueInvalid: 'enqueue-invalid-response',
  pollRpc: 'poll-rpc-failed',
  pollInvalid: 'poll-invalid-response',
  pollAborted: 'poll-aborted',
  pollTimeout: 'poll-timeout',
  exportFailed: 'export-failed',
  exportNotTerminal: 'export-not-terminal',
  artifactHttp: 'artifact-http-failed',
  artifactAborted: 'artifact-aborted',
  artifactNotPdf: 'artifact-not-pdf',
  artifactEmpty: 'artifact-empty',
  reconcileDiscarded: 'reconcile-discarded',
}

export const SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS = {
  timeoutMs: 120_000,
  initialIntervalMs: 1_500,
  maxIntervalMs: 5_000,
  backoffFactor: 1.25,
}

const TERMINAL_STATUSES = new Set(['ready', 'failed'])
const IN_FLIGHT_STATUSES = new Set(['queued', 'processing'])

const FINGERPRINT_RE = /^[0-9a-f]{64}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function trimString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {string} contentFingerprint
 */
export function shareTimingFingerprintPrefix(contentFingerprint) {
  const normalized = trimString(contentFingerprint).toLowerCase()
  if (!FINGERPRINT_RE.test(normalized)) return null
  return normalized.slice(0, 8)
}

/**
 * @param {string} stage
 * @param {number | undefined} tapStartedAt
 * @param {Record<string, unknown>} payload
 * @param {{ onShareTiming?: ShareTimingHook }} [options]
 */
function emitShareTimingStage(stage, tapStartedAt, payload = {}, options = {}) {
  if (typeof tapStartedAt !== 'number' || !Number.isFinite(tapStartedAt)) return
  const timingPayload = {
    tapStartedAt,
    elapsedMsSinceTap: Date.now() - tapStartedAt,
    ...payload,
  }
  emitShareDiag(stage, timingPayload)
  options.onShareTiming?.(stage, timingPayload)
}

/**
 * @param {unknown} row
 */
export function parseSiteDiaryPdfExportJobRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid,
      message: 'PDF export status was invalid.',
    }
  }

  const id = trimString(row.id)
  const reportId = trimString(row.report_id ?? row.reportId)
  const status = trimString(row.status).toLowerCase()
  const contentFingerprint = trimString(row.content_fingerprint ?? row.contentFingerprint).toLowerCase()

  if (!UUID_RE.test(id)) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid,
      message: 'PDF export status was invalid.',
    }
  }

  if (!status) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid,
      message: 'PDF export status was invalid.',
    }
  }

  if (contentFingerprint && !FINGERPRINT_RE.test(contentFingerprint)) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid,
      message: 'PDF export status was invalid.',
    }
  }

  return {
    ok: true,
    job: {
      id,
      reportId,
      status,
      contentFingerprint: contentFingerprint || null,
      snapshotVersion: row.snapshot_version ?? row.snapshotVersion ?? null,
      storagePath: row.storage_path ?? row.storagePath ?? null,
      byteSize: row.byte_size ?? row.byteSize ?? null,
      errorCode: row.error_code ?? row.errorCode ?? null,
      errorMessage: row.error_message ?? row.errorMessage ?? null,
      raw: row,
    },
  }
}

/**
 * @param {string} reportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch }} [options]
 */
export async function fetchAuthoritativeSiteDiaryPdfExportFingerprint(
  reportId,
  { signal, fetch: fetchFn = fetch } = {},
) {
  const id = trimString(reportId)
  if (!id) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintInvalid,
      message: 'This Site Diary could not be exported because it was not opened correctly.',
    }
  }

  const url = `/api/site-diary/${encodeURIComponent(id)}/pdf-export/fingerprint`

  let response
  try {
    response = await fetchFn(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (signal?.aborted) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted,
        message: 'PDF export was cancelled.',
      }
    }
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintHttp,
      message: 'We could not verify the Site Diary for PDF export. Check your connection and try again.',
      cause: err,
    }
  }

  let body
  try {
    body = await response.json()
  } catch {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintInvalid,
      message: 'We could not verify the Site Diary for PDF export. Try again.',
      httpStatus: response.status,
    }
  }

  if (!response.ok || !body?.ok) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintHttp,
      message:
        body?.message
        || 'We could not verify the Site Diary for PDF export. Try again.',
      httpStatus: response.status,
      serverCode: body?.code ?? null,
    }
  }

  const contentFingerprint = trimString(body.contentFingerprint).toLowerCase()
  const snapshotVersion = Number(body.snapshotVersion)
  const resolvedReportId = trimString(body.reportId)

  if (
    !resolvedReportId
    || resolvedReportId !== id
    || !FINGERPRINT_RE.test(contentFingerprint)
    || !Number.isInteger(snapshotVersion)
    || snapshotVersion < 1
  ) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintInvalid,
      message: 'We could not verify the Site Diary for PDF export. Try again.',
    }
  }

  return {
    ok: true,
    reportId: resolvedReportId,
    contentFingerprint,
    snapshotVersion,
  }
}

/**
 * Single enqueue RPC — no automatic retries.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ reportId: string, contentFingerprint: string, snapshotVersion: number }} params
 */
export async function enqueueSiteDiaryPdfExportJob(supabase, params) {
  const reportId = trimString(params?.reportId)
  const contentFingerprint = trimString(params?.contentFingerprint).toLowerCase()
  const snapshotVersion = Number(params?.snapshotVersion)

  if (
    !reportId
    || !FINGERPRINT_RE.test(contentFingerprint)
    || !Number.isInteger(snapshotVersion)
    || snapshotVersion < 1
  ) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueInvalid,
      message: 'PDF export could not be started.',
    }
  }

  const { data, error } = await supabase.rpc(SITE_DIARY_PDF_EXPORT_RPC.enqueue, {
    p_report_id: reportId,
    p_content_fingerprint: contentFingerprint,
    p_snapshot_version: snapshotVersion,
  })

  if (error) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueRpc,
      message: 'PDF export could not be started. Try again.',
      rpcError: error.message || null,
    }
  }

  const parsed = parseSiteDiaryPdfExportJobRow(data)
  if (!parsed.ok) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueInvalid,
      message: 'PDF export could not be started.',
    }
  }

  return {
    ok: true,
    exportId: parsed.job.id,
    job: parsed.job,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} exportId
 */
export async function getSiteDiaryPdfExportJob(supabase, exportId) {
  const id = trimString(exportId)
  if (!UUID_RE.test(id)) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid,
      message: 'PDF export status was invalid.',
    }
  }

  const { data, error } = await supabase.rpc(SITE_DIARY_PDF_EXPORT_RPC.get, {
    p_export_id: id,
  })

  if (error) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollRpc,
      message: 'We could not check PDF export progress. Try again.',
      rpcError: error.message || null,
    }
  }

  const parsed = parseSiteDiaryPdfExportJobRow(data)
  if (!parsed.ok) {
    return parsed
  }

  return {
    ok: true,
    job: parsed.job,
  }
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @param {(ms: number) => Promise<void>} [sleep]
 */
export async function sleepForPoll(ms, signal, sleep = defaultSleep) {
  if (!signal) {
    await sleep(ms)
    return
  }
  if (signal.aborted) {
    throw new PollAbortedError()
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new PollAbortedError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class PollAbortedError extends Error {
  constructor() {
    super('PDF export poll aborted')
    this.name = 'PollAbortedError'
    this.code = SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Poll until ready, failed, abort, or timeout. Never enqueues.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} exportId
 * @param {{
 *   signal?: AbortSignal
 *   timeoutMs?: number
 *   initialIntervalMs?: number
 *   maxIntervalMs?: number
 *   backoffFactor?: number
 *   now?: () => number
 *   sleep?: (ms: number) => Promise<void>
 * }} [options]
 */
export async function pollSiteDiaryPdfExportJobUntilTerminal(supabase, exportId, options = {}) {
  const {
    signal,
    timeoutMs = SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.timeoutMs,
    initialIntervalMs = SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.initialIntervalMs,
    maxIntervalMs = SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.maxIntervalMs,
    backoffFactor = SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.backoffFactor,
    now = () => Date.now(),
    sleep = defaultSleep,
    tapStartedAt,
    onShareTiming,
    shareTimingEnqueueReturnedStatus = null,
  } = options

  const deadline = now() + timeoutMs
  let intervalMs = initialIntervalMs
  let pollGetCallCount = 0

  while (now() < deadline) {
    if (signal?.aborted) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted,
        message: 'PDF export was cancelled.',
        exportId: trimString(exportId),
      }
    }

    pollGetCallCount += 1
    const statusResult = await getSiteDiaryPdfExportJob(supabase, exportId)
    if (!statusResult.ok) {
      return statusResult
    }

    const { job } = statusResult
    if (job.status === 'ready') {
      emitShareTimingStage(
        SITE_DIARY_SHARE_TIMING_STAGE.pollComplete,
        tapStartedAt,
        {
          exportId: trimString(exportId),
          pollGetCallCount,
          enqueueReturnedStatus: trimString(shareTimingEnqueueReturnedStatus).toLowerCase() || null,
          terminalStatus: job.status,
        },
        { onShareTiming },
      )
      return { ok: true, job }
    }
    if (job.status === 'failed') {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportFailed,
        message: job.errorMessage || 'PDF export failed. Try again.',
        job,
      }
    }

    if (!IN_FLIGHT_STATUSES.has(job.status)) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportNotTerminal,
        message: 'PDF export is in an unexpected state.',
        job,
      }
    }

    const remaining = deadline - now()
    if (remaining <= 0) {
      break
    }

    const waitMs = Math.min(intervalMs, remaining)
    try {
      await sleepForPoll(waitMs, signal, sleep)
    } catch (err) {
      if (err instanceof PollAbortedError || signal?.aborted) {
        return {
          ok: false,
          code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted,
          message: 'PDF export was cancelled.',
          exportId: trimString(exportId),
        }
      }
      throw err
    }

    intervalMs = Math.min(maxIntervalMs, Math.ceil(intervalMs * backoffFactor))
  }

  return {
    ok: false,
    code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollTimeout,
    message: 'PDF export is taking longer than expected. Try again in a moment.',
    exportId: trimString(exportId),
  }
}

/**
 * Fingerprint (once) + enqueue (once). No poll, no enqueue retries.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch }} [options]
 */
export async function requestFingerprintAndEnqueueSiteDiaryPdfExport(
  supabase,
  reportId,
  options = {},
) {
  const { tapStartedAt, onShareTiming } = options
  const fingerprint = await fetchAuthoritativeSiteDiaryPdfExportFingerprint(reportId, options)
  if (!fingerprint.ok) {
    return fingerprint
  }

  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.fingerprint,
    tapStartedAt,
    {
      reportId: fingerprint.reportId,
      fingerprintPrefix: shareTimingFingerprintPrefix(fingerprint.contentFingerprint),
    },
    { onShareTiming },
  )

  const enqueued = await enqueueSiteDiaryPdfExportJob(supabase, {
    reportId: fingerprint.reportId,
    contentFingerprint: fingerprint.contentFingerprint,
    snapshotVersion: fingerprint.snapshotVersion,
  })

  if (enqueued.ok) {
    emitShareTimingStage(
      SITE_DIARY_SHARE_TIMING_STAGE.enqueue,
      tapStartedAt,
      {
        exportId: enqueued.exportId,
        status: enqueued.job?.status ?? null,
        fingerprintPrefix: shareTimingFingerprintPrefix(fingerprint.contentFingerprint),
      },
      { onShareTiming },
    )
  }

  return enqueued
}

/**
 * @param {string} fileName
 */
export function buildShareReadySiteDiaryPdfFileName(fileName) {
  const base = trimString(fileName) || 'Zlog-Site-Diary.pdf'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

/**
 * @param {Blob} blob
 * @param {{ fileName?: string, title?: string, text?: string }} [meta]
 */
export function buildShareReadySiteDiaryPdfFromBlob(blob, meta = {}) {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactEmpty,
      message: 'PDF export file was empty.',
    }
  }

  const fileName = buildShareReadySiteDiaryPdfFileName(meta.fileName)
  const title = trimString(meta.title) || 'Site Diary'
  const text = trimString(meta.text) || title
  const file = new File([blob], fileName, { type: 'application/pdf' })

  return {
    ok: true,
    blob,
    file,
    fileName,
    title,
    text,
  }
}

/**
 * Authenticated artifact authorize (JSON). Returns a one-shot signed URL for immediate download only.
 * Callers must not persist signedUrl in refs, logs, or diagnostics.
 *
 * @param {string} reportId
 * @param {string} exportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch, tapStartedAt?: number, onShareTiming?: ShareTimingHook }} [options]
 */
export async function fetchSiteDiaryPdfExportAuthorization(reportId, exportId, options = {}) {
  const { signal, fetch: fetchFn = fetch, tapStartedAt, onShareTiming } = options
  const rid = trimString(reportId)
  const eid = trimString(exportId)

  if (!UUID_RE.test(rid) || !UUID_RE.test(eid)) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'PDF export could not be downloaded.',
    }
  }

  const authorizeUrl = `/api/site-diary/${encodeURIComponent(rid)}/pdf-export/${encodeURIComponent(eid)}`

  let authorizeResponse
  try {
    authorizeResponse = await fetchFn(authorizeUrl, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (signal?.aborted) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactAborted,
        message: 'PDF export download was cancelled.',
      }
    }
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Check your connection and try again.',
      cause: err,
    }
  }

  let authorizeBody
  try {
    authorizeBody = await authorizeResponse.json()
  } catch {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Try again.',
      httpStatus: authorizeResponse.status,
    }
  }

  if (!authorizeResponse.ok || !authorizeBody?.ok) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: authorizeBody?.message || 'Could not download the PDF export. Try again.',
      httpStatus: authorizeResponse.status,
      serverCode: authorizeBody?.code ?? null,
    }
  }

  const signedUrl = trimString(authorizeBody.signedUrl)
  if (!signedUrl) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Try again.',
      httpStatus: authorizeResponse.status,
    }
  }

  const fileName =
    buildShareReadySiteDiaryPdfFileName(authorizeBody.fileName) || buildShareReadySiteDiaryPdfFileName(null)
  const title = trimString(authorizeBody.title) || 'Site Diary'
  const text = trimString(authorizeBody.text) || title

  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.artifactAuthorize,
    tapStartedAt,
    {
      exportId: trimString(authorizeBody.exportId) || eid,
      reportId: trimString(authorizeBody.reportId) || rid,
    },
    { onShareTiming },
  )

  return {
    ok: true,
    signedUrl,
    fileName,
    title,
    text,
    exportId: trimString(authorizeBody.exportId) || eid,
    reportId: trimString(authorizeBody.reportId) || rid,
  }
}

/**
 * @param {{
 *   reportId: string
 *   exportId: string
 *   fileName: string
 *   title: string
 *   text: string
 * }} fields
 */
export function buildSiteDiaryPdfExportReadyDescriptor(fields) {
  return {
    ok: true,
    handoff: SITE_DIARY_PDF_EXPORT_HANDOFF.exportReady,
    reportId: trimString(fields.reportId),
    exportId: trimString(fields.exportId),
    fileName: buildShareReadySiteDiaryPdfFileName(fields.fileName),
    title: trimString(fields.title) || 'Site Diary',
    text: trimString(fields.text) || trimString(fields.title) || 'Site Diary',
  }
}

/**
 * Download a ready export artifact via the authorized server route only.
 *
 * @param {string} reportId
 * @param {string} exportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch }} [options]
 */
export async function fetchSiteDiaryPdfExportArtifact(reportId, exportId, options = {}) {
  const { signal, fetch: fetchFn = fetch, tapStartedAt, onShareTiming } = options

  const authorized = await fetchSiteDiaryPdfExportAuthorization(reportId, exportId, options)
  if (!authorized.ok) {
    return authorized
  }

  const { signedUrl, fileName, title, text, exportId: eid, reportId: rid } = authorized

  let pdfResponse
  try {
    pdfResponse = await fetchFn(signedUrl, {
      method: 'GET',
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (signal?.aborted) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactAborted,
        message: 'PDF export download was cancelled.',
      }
    }
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Check your connection and try again.',
      cause: err,
    }
  }

  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.signedFetchResponse,
    tapStartedAt,
    {
      exportId: eid,
      httpStatus: pdfResponse.status,
      ok: pdfResponse.ok,
    },
    { onShareTiming },
  )

  if (!pdfResponse.ok) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Try again.',
      httpStatus: pdfResponse.status,
    }
  }

  const contentType = trimString(pdfResponse.headers.get('content-type')).toLowerCase()
  if (contentType && !contentType.startsWith('application/pdf')) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactNotPdf,
      message: 'PDF export download was not a valid PDF.',
      httpStatus: pdfResponse.status,
    }
  }

  let blob
  try {
    blob = await pdfResponse.blob()
  } catch (err) {
    if (signal?.aborted) {
      return {
        ok: false,
        code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactAborted,
        message: 'PDF export download was cancelled.',
      }
    }
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp,
      message: 'Could not download the PDF export. Try again.',
      cause: err,
    }
  }

  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.signedFetchBlob,
    tapStartedAt,
    {
      exportId: eid,
      blobSize: blob instanceof Blob ? blob.size : null,
      blobType: blob instanceof Blob ? blob.type || null : null,
    },
    { onShareTiming },
  )

  if (!(blob instanceof Blob) || blob.size <= 0) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactEmpty,
      message: 'PDF export file was empty.',
    }
  }

  if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactNotPdf,
      message: 'PDF export download was not a valid PDF.',
    }
  }

  return {
    ok: true,
    blob,
    fileName,
    title,
    text,
    exportId: eid,
    reportId: rid,
  }
}

/**
 * Artifact download shaped for sharePreparedFile / shareReadyPdfRef.
 *
 * @param {string} reportId
 * @param {string} exportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch }} [options]
 */
export async function fetchSiteDiaryPdfExportShareReadyArtifact(
  reportId,
  exportId,
  options = {},
) {
  const downloaded = await fetchSiteDiaryPdfExportArtifact(reportId, exportId, options)
  if (!downloaded.ok) {
    return downloaded
  }

  const shareReady = buildShareReadySiteDiaryPdfFromBlob(downloaded.blob, {
    fileName: downloaded.fileName,
    title: downloaded.title,
    text: downloaded.text,
  })

  if (!shareReady.ok) {
    return shareReady
  }

  const { tapStartedAt, onShareTiming } = options
  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.shareReadyFile,
    tapStartedAt,
    {
      exportId: downloaded.exportId,
      reportId: downloaded.reportId,
      fileName: shareReady.fileName,
      fileSize: shareReady.file?.size ?? shareReady.blob?.size ?? null,
    },
    { onShareTiming },
  )

  return {
    ok: true,
    ...shareReady,
    exportId: downloaded.exportId,
    reportId: downloaded.reportId,
  }
}

/**
 * Fingerprint → enqueue (once) → poll → share-ready artifact. No automatic re-enqueue.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{
 *   signal?: AbortSignal
 *   fetch?: typeof fetch
 *   timeoutMs?: number
 *   initialIntervalMs?: number
 *   maxIntervalMs?: number
 *   backoffFactor?: number
 *   now?: () => number
 *   sleep?: (ms: number) => Promise<void>
 * }} [options]
 */
/**
 * @param {{ ok?: boolean, code?: string, message?: string }} result
 */
export function isSiteDiaryPdfExportUserAbortResult(result) {
  if (!result || result.ok) return false
  return (
    result.code === SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted
    || result.code === SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactAborted
  )
}

/**
 * @param {{ ok?: boolean, code?: string, message?: string }} result
 */
export function userMessageForSiteDiaryPdfExportFailure(result) {
  if (!result || result.ok) {
    return 'We couldn’t prepare the PDF. Check your connection and try again.'
  }

  switch (result.code) {
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintHttp:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.fingerprintInvalid:
      return 'We couldn’t verify the Site Diary for PDF export. Check your connection and try again.'
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueRpc:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueInvalid:
      return 'We couldn’t start PDF export. Try again.'
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollTimeout:
      return result.message || 'PDF export is taking longer than expected. Try again in a moment.'
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportFailed:
      return 'We couldn’t prepare the PDF. Try again.'
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactEmpty:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactNotPdf:
      return 'Could not download the PDF export. Check your connection and try again.'
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollRpc:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid:
    case SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportNotTerminal:
      return 'We couldn’t check PDF export progress. Try again.'
    default:
      return result.message || 'We couldn’t prepare the PDF. Check your connection and try again.'
  }
}

/**
 * After a successful enqueue, poll only when the job is not already ready.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{ ok: true, exportId: string, job: { status?: string } }} enqueued
 * @param {Record<string, unknown>} [options]
 */
export async function completeSiteDiaryPdfExportToShareReadyAfterEnqueue(
  supabase,
  reportId,
  enqueued,
  options = {},
) {
  if (!enqueued?.ok) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueInvalid,
      message: 'PDF export could not be started.',
    }
  }

  const { tapStartedAt, onShareTiming, signal } = options
  const enqueueStatus = trimString(enqueued.job?.status).toLowerCase()

  if (signal?.aborted) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted,
      message: 'PDF export was cancelled.',
      exportId: enqueued.exportId,
    }
  }

  if (enqueueStatus === 'ready') {
    emitShareTimingStage(
      SITE_DIARY_SHARE_TIMING_STAGE.pollComplete,
      tapStartedAt,
      {
        exportId: trimString(enqueued.exportId),
        pollGetCallCount: 0,
        enqueueReturnedStatus: enqueueStatus,
        terminalStatus: 'ready',
      },
      { onShareTiming },
    )
    const artifact = await fetchSiteDiaryPdfExportShareReadyArtifact(
      reportId,
      enqueued.exportId,
      options,
    )
    if (!artifact.ok) {
      return artifact
    }
    return {
      ...artifact,
      contentFingerprint: trimString(enqueued.job?.contentFingerprint).toLowerCase() || null,
      enqueueReturnedStatus: enqueueStatus,
    }
  }

  if (enqueueStatus === 'failed') {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportFailed,
      message: enqueued.job?.errorMessage || 'PDF export failed. Try again.',
      job: enqueued.job,
    }
  }

  const polled = await pollSiteDiaryPdfExportJobUntilTerminal(supabase, enqueued.exportId, {
    ...options,
    shareTimingEnqueueReturnedStatus: enqueued.job?.status ?? null,
  })
  if (!polled.ok) {
    return polled
  }

  const artifact = await fetchSiteDiaryPdfExportShareReadyArtifact(
    reportId,
    enqueued.exportId,
    options,
  )
  if (!artifact.ok) {
    return artifact
  }

  return {
    ...artifact,
    contentFingerprint: trimString(enqueued.job?.contentFingerprint).toLowerCase() || null,
    enqueueReturnedStatus: enqueueStatus || trimString(enqueued.job?.status).toLowerCase() || null,
  }
}

/**
 * Post-hydrate authoritative re-adoption: fingerprint → idempotent enqueue → artifact when ready.
 * Does not start a second export for the same persisted fingerprint.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{
 *   signal?: AbortSignal
 *   fetch?: typeof fetch
 *   isStillValid?: () => boolean
 *   tapStartedAt?: number
 *   onShareTiming?: ShareTimingHook
 * }} [options]
 */
export async function reconcileAuthoritativeSiteDiaryPdfExportToShareReady(
  supabase,
  reportId,
  options = {},
) {
  const { isStillValid } = options
  const enqueued = await requestFingerprintAndEnqueueSiteDiaryPdfExport(supabase, reportId, options)
  if (!enqueued.ok) {
    return enqueued
  }

  if (typeof isStillValid === 'function' && !isStillValid()) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.reconcileDiscarded,
      message: 'PDF re-adoption was discarded because the Site Diary changed.',
      exportId: enqueued.exportId,
    }
  }

  const completed = await completeSiteDiaryPdfExportToShareReadyAfterEnqueue(
    supabase,
    reportId,
    enqueued,
    options,
  )

  if (!completed.ok) {
    return completed
  }

  if (typeof isStillValid === 'function' && !isStillValid()) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.reconcileDiscarded,
      message: 'PDF re-adoption was discarded because the Site Diary changed.',
      exportId: enqueued.exportId,
    }
  }

  const fingerprintFromJob = trimString(enqueued.job?.contentFingerprint).toLowerCase()
  return {
    ...completed,
    contentFingerprint: fingerprintFromJob || completed.contentFingerprint || null,
    enqueueReturnedStatus: trimString(enqueued.job?.status).toLowerCase() || null,
  }
}

export async function runSiteDiaryPdfExportToShareReadyArtifact(supabase, reportId, options = {}) {
  const enqueued = await requestFingerprintAndEnqueueSiteDiaryPdfExport(supabase, reportId, options)
  if (!enqueued.ok) {
    return enqueued
  }

  return completeSiteDiaryPdfExportToShareReadyAfterEnqueue(supabase, reportId, enqueued, options)
}

/**
 * Fingerprint → enqueue → poll → authorize metadata only (no Storage body fetch, no blob).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{ signal?: AbortSignal, fetch?: typeof fetch, tapStartedAt?: number, onShareTiming?: ShareTimingHook }} [options]
 */
export async function runSiteDiaryPdfExportToExportReady(supabase, reportId, options = {}) {
  const enqueued = await requestFingerprintAndEnqueueSiteDiaryPdfExport(supabase, reportId, options)
  if (!enqueued.ok) {
    return enqueued
  }

  if (options.signal?.aborted) {
    return {
      ok: false,
      code: SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted,
      message: 'PDF export was cancelled.',
      exportId: enqueued.exportId,
    }
  }

  const polled = await pollSiteDiaryPdfExportJobUntilTerminal(supabase, enqueued.exportId, {
    ...options,
    shareTimingEnqueueReturnedStatus: enqueued.job?.status ?? null,
  })
  if (!polled.ok) {
    return polled
  }

  const authorized = await fetchSiteDiaryPdfExportAuthorization(reportId, enqueued.exportId, options)
  if (!authorized.ok) {
    return authorized
  }

  const descriptor = buildSiteDiaryPdfExportReadyDescriptor({
    reportId: authorized.reportId,
    exportId: authorized.exportId,
    fileName: authorized.fileName,
    title: authorized.title,
    text: authorized.text,
  })

  const { tapStartedAt, onShareTiming } = options
  emitShareTimingStage(
    SITE_DIARY_SHARE_TIMING_STAGE.shareReadyFile,
    tapStartedAt,
    {
      exportId: descriptor.exportId,
      reportId: descriptor.reportId,
      fileName: descriptor.fileName,
      handoff: descriptor.handoff,
      fileSize: null,
    },
    { onShareTiming },
  )

  return descriptor
}

export { TERMINAL_STATUSES, IN_FLIGHT_STATUSES }
