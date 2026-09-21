import { COMPLETE_RPC_NAME, FAIL_RPC_NAME, SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET } from './env.js'
import { validateExportJob, WorkerPdfProcessorError } from './process-site-diary-pdf-export-core.js'
import { SiteDiaryPdfExportPreflightError, preflightErrorMessage } from './preflight-site-diary-pdf-export-core.js'

export class ClaimedSiteDiaryPdfExportExecutionError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {{ failRpcSucceeded?: boolean }} [meta]
   */
  constructor(message, code, meta = {}) {
    super(message)
    this.name = 'ClaimedSiteDiaryPdfExportExecutionError'
    this.code = code
    this.failRpcSucceeded = Boolean(meta.failRpcSucceeded)
  }
}

const FAIL_MESSAGES = {
  snapshot_version_mismatch: preflightErrorMessage('snapshot_version_mismatch'),
  report_not_found: preflightErrorMessage('report_not_found'),
  ownership_mismatch: preflightErrorMessage('ownership_mismatch'),
  content_changed: preflightErrorMessage('content_changed'),
  snapshot_load_failed: preflightErrorMessage('snapshot_load_failed'),
  assembly_failed: 'Site Diary PDF assembly failed.',
  photo_incomplete: 'Site Diary photos are not ready for PDF export.',
  render_failed: 'Site Diary PDF rendering failed.',
  processing_failed: 'Site Diary PDF processing failed.',
  storage_bucket_mismatch: 'PDF export storage bucket is not valid.',
  storage_upload_failed: 'PDF export could not be saved.',
}

const DEFAULT_FAIL_MESSAGE = 'PDF export could not be completed.'

/**
 * @param {string} code
 */
export function executionFailMessageForCode(code) {
  const key = String(code || '').trim()
  return FAIL_MESSAGES[key] || DEFAULT_FAIL_MESSAGE
}

/**
 * @param {{
 *   ownerId: string
 *   reportId: string
 *   contentFingerprint: string
 * }} identity
 */
export function buildSiteDiaryPdfExportStoragePath(identity) {
  const ownerId = String(identity.ownerId || '').trim()
  const reportId = String(identity.reportId || '').trim()
  const fingerprint = String(identity.contentFingerprint || '').trim().toLowerCase()
  return `${ownerId}/${reportId}/${fingerprint}.pdf`
}

/**
 * @param {unknown} err
 */
export function classifyExecutionFailure(err) {
  if (err instanceof SiteDiaryPdfExportPreflightError && err.code) {
    return { code: err.code, message: executionFailMessageForCode(err.code) }
  }

  if (err instanceof WorkerPdfProcessorError) {
    const raw = String(err.code || '').trim()
    if (raw === 'assembly-failed') {
      return { code: 'assembly_failed', message: executionFailMessageForCode('assembly_failed') }
    }
    if (raw === 'report-identity-mismatch' || raw === 'project-identity-mismatch') {
      return { code: 'processing_failed', message: executionFailMessageForCode('processing_failed') }
    }
    if (raw === 'invalid-export-job') {
      return { code: 'processing_failed', message: executionFailMessageForCode('processing_failed') }
    }
    return { code: 'processing_failed', message: executionFailMessageForCode('processing_failed') }
  }

  if (err && typeof err === 'object' && err.name === 'DiaryPdfPhotosIncompleteError') {
    return { code: 'photo_incomplete', message: executionFailMessageForCode('photo_incomplete') }
  }

  return { code: 'processing_failed', message: executionFailMessageForCode('processing_failed') }
}

/**
 * @param {string} bucket
 */
export function assertExpectedExportStorageBucket(bucket) {
  const normalized = String(bucket || '').trim()
  if (normalized !== SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET) {
    throw new ClaimedSiteDiaryPdfExportExecutionError(
      executionFailMessageForCode('storage_bucket_mismatch'),
      'storage_bucket_mismatch',
    )
  }
  return normalized
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} workerId
 * @param {string} exportId
 * @param {string} code
 * @param {string} message
 */
export async function invokeFailSiteDiaryPdfExport(admin, workerId, exportId, code, message) {
  return admin.rpc(FAIL_RPC_NAME, {
    p_export_id: exportId,
    p_error_code: code,
    p_error_message: message,
    p_worker_id: workerId,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} workerId
 * @param {string} exportId
 * @param {string} storagePath
 * @param {number} byteSize
 */
export async function invokeCompleteSiteDiaryPdfExport(admin, workerId, exportId, storagePath, byteSize) {
  return admin.rpc(COMPLETE_RPC_NAME, {
    p_export_id: exportId,
    p_storage_path: storagePath,
    p_byte_size: byteSize,
    p_worker_id: workerId,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} bucket
 * @param {string} storagePath
 * @param {Buffer} buffer
 */
export async function uploadSiteDiaryPdfExportObject(admin, bucket, storagePath, buffer) {
  return admin.storage.from(bucket).upload(storagePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
}

/**
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   workerId: string
 *   exportJob: Record<string, unknown>
 *   preflight?: Function
 *   processExport?: Function
 *   uploadObject?: typeof uploadSiteDiaryPdfExportObject
 *   completeExport?: typeof invokeCompleteSiteDiaryPdfExport
 *   failExport?: typeof invokeFailSiteDiaryPdfExport
 * }} input
 */
export async function executeClaimedSiteDiaryPdfExportCore({
  admin,
  workerId,
  exportJob,
  preflight,
  processExport,
  uploadObject = uploadSiteDiaryPdfExportObject,
  completeExport = invokeCompleteSiteDiaryPdfExport,
  failExport = invokeFailSiteDiaryPdfExport,
}) {
  const validated = validateExportJob(exportJob)

  /**
   * @param {string} code
   * @param {string} message
   */
  async function failTerminal(code, message) {
    const failResult = await failExport(admin, workerId, validated.exportId, code, message)
    if (failResult?.error) {
      throw new ClaimedSiteDiaryPdfExportExecutionError(
        'Could not update export failure state.',
        'fail_update_failed',
      )
    }
    throw new ClaimedSiteDiaryPdfExportExecutionError(message, code, { failRpcSucceeded: true })
  }

  let bucket
  try {
    bucket = assertExpectedExportStorageBucket(exportJob.storage_bucket)
  } catch (err) {
    if (err instanceof ClaimedSiteDiaryPdfExportExecutionError && err.code === 'storage_bucket_mismatch') {
      await failTerminal(err.code, err.message)
    }
    throw err
  }

  const runPreflight = preflight
  const runProcess = processExport
  if (typeof runPreflight !== 'function' || typeof runProcess !== 'function') {
    throw new ClaimedSiteDiaryPdfExportExecutionError(
      executionFailMessageForCode('processing_failed'),
      'processing_failed',
    )
  }

  let preflightResult
  try {
    preflightResult = await runPreflight({ admin, exportJob })
  } catch (err) {
    const { code, message } = classifyExecutionFailure(err)
    await failTerminal(code, message)
  }

  let processed
  try {
    processed = await runProcess({ admin, exportJob })
  } catch (err) {
    const { code, message } = classifyExecutionFailure(err)
    await failTerminal(code, message)
  }

  const storagePath = buildSiteDiaryPdfExportStoragePath({
    ownerId: preflightResult.ownerId,
    reportId: preflightResult.reportId,
    contentFingerprint: preflightResult.contentFingerprint,
  })

  const uploadResult = await uploadObject(admin, bucket, storagePath, processed.buffer)
  if (uploadResult?.error) {
    const message = executionFailMessageForCode('storage_upload_failed')
    await failTerminal('storage_upload_failed', message)
  }

  const byteSize = processed.byteSize ?? processed.buffer?.length ?? 0
  const completeResult = await completeExport(
    admin,
    workerId,
    validated.exportId,
    storagePath,
    byteSize,
  )

  if (completeResult?.error) {
    throw new ClaimedSiteDiaryPdfExportExecutionError(
      'PDF export could not be marked ready.',
      'complete_failed',
    )
  }

  return {
    ok: true,
    exportId: validated.exportId,
    reportId: preflightResult.reportId,
    storageBucket: bucket,
    storagePath,
    byteSize,
  }
}
