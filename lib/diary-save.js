/**
 * Authoritative Site Diary final-save contract — single atomic RPC.
 *
 * Live schema source: docs/LIVE_SCHEMA_DAILY_REPORTS.json (PostgREST OpenAPI).
 * Payload keys are generated ONLY from lib/live-diary-schema.js allowlists.
 */

import {
  LIVE_DAILY_REPORTS,
  LIVE_REPORT_PHOTOS,
  buildLiveDailyReportUpdatePayload,
  pickLiveColumns,
} from './live-diary-schema.js'
import { markShareTiming, patchShareTimingCounts } from './diary-share-timing-diag.js'
import {
  labourPersistRowsEqual,
  plantPersistRowsEqual,
  reportPersistNeedsWrite,
} from './diary-save-dirty.js'

export const FINALIZE_SITE_DIARY_SAVE_RPC = 'finalize_site_diary_save'

const PHOTO_DESIRED_COLUMNS = LIVE_REPORT_PHOTOS.columns.filter(
  (c) => !['id', 'owner_id', 'report_id', 'created_at'].includes(c),
)

export const DIARY_SAVE_LOG = '[zlog:diary-save]'

export class DiarySaveError extends Error {
  constructor(code, message, details = null) {
    super(message)
    this.name = 'DiarySaveError'
    this.code = code
    this.details = details
  }
}

function log(stage, detail) {
  if (process.env.NODE_ENV === 'production') return
  if (detail !== undefined) {
    console.log(DIARY_SAVE_LOG, stage, detail)
  } else {
    console.log(DIARY_SAVE_LOG, stage)
  }
}

/** Live columns this reconcile UPDATE path may write (same pick as the UPDATE). */
const PHOTO_RECONCILE_UPDATE_COLUMNS = LIVE_REPORT_PHOTOS.columns.filter(
  (c) => c !== 'id' && c !== 'owner_id',
)

const PHOTO_TEXT_METADATA_KEYS = new Set([
  'url',
  'caption',
  'location',
  'category',
  'assigned_to',
  'thumbnail_path',
])

/**
 * Canonical metadata for reconcile equality.
 * Empty strings match null; rotation null matches 0; layout null/blank matches grid4.
 * @param {string} key
 * @param {unknown} value
 */
export function normalizeReportPhotoReconcileValue(key, value) {
  if (key === 'rotation_degrees') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (key === 'sequence') {
    if (value == null || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (key === 'layout') {
    const s = value == null ? '' : String(value).trim()
    return s || 'grid4'
  }
  if (PHOTO_TEXT_METADATA_KEYS.has(key)) {
    if (value == null) return null
    const s = String(value).trim()
    return s === '' ? null : s
  }
  if (value === '') return null
  return value
}

/**
 * True when an existing report_photos row must be UPDATEd to match desired metadata.
 * Identity is url (canonical report.jpg path) — caller looks up the row.
 * Missing selected columns on the existing row force UPDATE (cannot prove equality).
 * @param {object|null|undefined} existingRow
 * @param {object} desiredFields
 */
export function reportPhotoMetadataNeedsUpdate(existingRow, desiredFields) {
  if (!existingRow) return true
  const desired = pickLiveColumns(desiredFields || {}, PHOTO_RECONCILE_UPDATE_COLUMNS)
  const keys = Object.keys(desired)
  if (keys.length === 0) return false
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(existingRow, key)) return true
    const left = normalizeReportPhotoReconcileValue(key, existingRow[key])
    const right = normalizeReportPhotoReconcileValue(key, desired[key])
    if (left !== right) return true
  }
  return false
}

function samePhotoUrlSet(left, right) {
  if (left.length !== right.length) return false
  const set = new Set(left)
  if (set.size !== left.length) return false
  return right.every((url) => set.has(url))
}

/**
 * True when photo LIST/reconcile can be skipped: no inserts, no deletes,
 * no metadata patches vs the last persisted photo snapshot.
 * Missing baseline is not skippable.
 */
export function photoReconcileCanSkip({
  baselinePhotos,
  keptStoragePaths = [],
  photoRecords = [],
  updateExistingPhotos = [],
} = {}) {
  if (baselinePhotos == null) return false
  if ((photoRecords || []).length > 0) return false
  const baselineUrls = (baselinePhotos || []).map((row) => String(row.url || '').trim()).filter(Boolean)
  const kept = (keptStoragePaths || []).map((url) => String(url || '').trim()).filter(Boolean)
  if (!samePhotoUrlSet(baselineUrls, kept)) return false

  const byUrl = new Map()
  for (const row of baselinePhotos || []) {
    const url = String(row?.url || '').trim()
    if (url) byUrl.set(url, row)
  }
  for (const patch of updateExistingPhotos || []) {
    const url = String(patch?.url || '').trim()
    if (!url) continue
    if (reportPhotoMetadataNeedsUpdate(byUrl.get(url), patch.fields || {})) return false
  }
  return true
}

const WRITABLE_DAILY_REPORT_PATCH_KEYS = LIVE_DAILY_REPORTS.columns.filter(
  (c) => !['id', 'owner_id', 'project_id', 'created_at'].includes(c),
)

/**
 * Live column keys considered "present" on inbound reportPayload (alias-aware).
 * @param {object} src
 * @returns {Set<string>}
 */
export function reportPayloadPresentLiveKeys(src) {
  const present = new Set()
  const s = src || {}
  for (const key of Object.keys(s)) {
    if (key === 'shift_type') present.add('shift')
    else if (key === 'actions_required') present.add('actions')
    else if (WRITABLE_DAILY_REPORT_PATCH_KEYS.includes(key)) present.add(key)
  }
  if (Object.prototype.hasOwnProperty.call(s, 'shift')) present.add('shift')
  if (Object.prototype.hasOwnProperty.call(s, 'shift_type')) present.add('shift')
  if (Object.prototype.hasOwnProperty.call(s, 'actions')) present.add('actions')
  if (Object.prototype.hasOwnProperty.call(s, 'actions_required')) present.add('actions')
  return present
}

function rpcPayload(data) {
  if (Array.isArray(data)) return data[0] || {}
  return data || {}
}

function cleanupJobsFromRpc(data) {
  const jobs = Array.isArray(data?.cleanupJobs)
    ? data.cleanupJobs
    : Array.isArray(data?.cleanup_jobs)
      ? data.cleanup_jobs
      : []
  return jobs
    .map((job) => ({
      id: String(job?.id || '').trim(),
      path: String(job?.path || job?.object_path || '').trim(),
    }))
    .filter((job) => job.id && job.path)
}

/**
 * JSONB patch for finalize_site_diary_save — only keys present on inbound reportPayload.
 * Values are normalized via buildLiveDailyReportUpdatePayload (aliases, allowlist).
 */
export function buildRpcReportPatch(reportPayload, projectId) {
  const src = reportPayload || {}
  const present = reportPayloadPresentLiveKeys(src)
  if (!present.size) return {}
  const { payload } = buildLiveDailyReportUpdatePayload({
    ...src,
    project_id: projectId,
  })
  const patch = {}
  for (const key of present) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      patch[key] = payload[key]
    }
  }
  return patch
}

function mergePhotoDesiredFields(base, fields) {
  const out = { ...(base || {}) }
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Build the desired final report_photos set for the atomic RPC (canonical url identity).
 */
export function buildDesiredPhotoRowsForFinalize({
  keptStoragePaths = [],
  photoRecords = [],
  updateExistingPhotos = [],
  baselinePhotos = [],
} = {}) {
  const patchesByUrl = new Map()
  for (const patch of updateExistingPhotos || []) {
    const url = String(patch?.url || '').trim()
    if (url) patchesByUrl.set(url, patch.fields || {})
  }
  const newByUrl = new Map()
  for (const row of photoRecords || []) {
    const url = String(row?.url || '').trim()
    if (url) newByUrl.set(url, row)
  }
  const baselineByUrl = new Map()
  for (const row of baselinePhotos || []) {
    const url = String(row?.url || '').trim()
    if (url) baselineByUrl.set(url, row)
  }

  const seen = new Set()
  const rows = []
  for (const rawUrl of keptStoragePaths || []) {
    const url = String(rawUrl || '').trim()
    if (!url) continue
    if (seen.has(url)) {
      throw new DiarySaveError(
        'PHOTOS_DUPLICATE_URL',
        'Cannot save: two work photos share the same storage path.',
        { url },
      )
    }
    seen.add(url)

    let base = newByUrl.get(url) || baselineByUrl.get(url)
    if (!base) {
      throw new DiarySaveError(
        'PHOTOS_MISSING_ROW',
        'Cannot save: a kept work photo is missing row data.',
        { url },
      )
    }
    base = mergePhotoDesiredFields(base, patchesByUrl.get(url))
    const picked = pickLiveColumns(base, PHOTO_DESIRED_COLUMNS)
    picked.url = url
    rows.push(picked)
  }
  return rows
}

async function processFinalizeStorageCleanup(supabase, cleanupJobs) {
  const jobs = cleanupJobsFromRpc({ cleanupJobs })
  if (!jobs.length) return { cleanupPending: false }

  let cleanupError = null
  try {
    const { error: storageError } = await supabase.storage
      .from('site-photos')
      .remove(jobs.map((job) => job.path))
    cleanupError = storageError?.message || null
    if (!cleanupError) {
      log('photos:storage-cleanup', { count: jobs.length })
    }
  } catch (err) {
    cleanupError = err?.message || 'Storage cleanup could not be completed.'
    log('photos:storage-cleanup-warning', { message: cleanupError })
  }

  const { error: markError } = await supabase.rpc('mark_report_storage_cleanup', {
    p_job_ids: jobs.map((job) => job.id),
    p_error: cleanupError,
  })

  return { cleanupPending: Boolean(cleanupError || markError) }
}

function assertRpcFinalizeIdentity(result, { reportId, projectId }) {
  const gotReportId = String(result.report_id || result.reportId || result.report?.id || '')
  const gotProjectId = String(result.project_id || result.projectId || result.report?.project_id || '')
  if (gotReportId !== String(reportId) || gotProjectId !== String(projectId)) {
    throw new DiarySaveError('ID_MISMATCH', 'Save returned a different report than the one being edited.', {
      expectedReportId: reportId,
      expectedProjectId: projectId,
      gotReportId,
      gotProjectId,
    })
  }
  if (String(result.report?.id || '') !== String(reportId)) {
    throw new DiarySaveError('ID_MISMATCH', 'Save returned a different report row id.', {
      expected: reportId,
      got: result.report?.id ?? null,
    })
  }
}

/**
 * Finalize (save) an existing Site Diary report — single atomic RPC for DB writes.
 *
 * @returns {Promise<{ id: string, diagnostic: object }>}
 */
export async function finalizeSiteDiarySave(supabase, {
  reportId,
  projectId,
  reportPayload,
  labourPayload = [],
  plantPayload = [],
  keptStoragePaths = [],
  photoRecords = [],
  updateExistingPhotos = [],
  user: _user = undefined,
  baseline = null,
}) {
  void _user
  log('start', {
    reportId: reportId || null,
    projectId: projectId || null,
    mode: 'rpc',
    labour: labourPayload.length,
    plant: plantPayload.length,
    newPhotos: photoRecords.length,
    inboundKeys: Object.keys(reportPayload || {}),
  })

  if (!reportId) {
    throw new DiarySaveError(
      'MISSING_REPORT_ID',
      'Cannot save: missing report id. Editing must open with ?report=… and never create a new row.',
      { stage: 'guard', mode: 'RPC', reportId: null, projectId },
    )
  }
  if (!projectId) {
    throw new DiarySaveError('MISSING_PROJECT_ID', 'Cannot save: missing project id.', {
      stage: 'guard',
      mode: 'RPC',
      reportId,
      projectId: null,
    })
  }

  const skipReport = !reportPersistNeedsWrite(reportPayload, baseline?.reportRow)
  const skipLabour = Array.isArray(baseline?.labour)
    && labourPersistRowsEqual(labourPayload, baseline.labour)
  const skipPlant = Array.isArray(baseline?.plant)
    && plantPersistRowsEqual(plantPayload, baseline.plant)
  const skipPhotos = photoReconcileCanSkip({
    baselinePhotos: baseline?.photos,
    keptStoragePaths,
    photoRecords,
    updateExistingPhotos,
  })

  patchShareTimingCounts({
    finalizeReportSkipped: skipReport,
    finalizeLabourSkipped: skipLabour,
    finalizePlantSkipped: skipPlant,
    finalizePhotosSkipped: skipPhotos,
  })

  if (skipReport && skipLabour && skipPlant && skipPhotos) {
    markShareTiming('finalize_report_start')
    markShareTiming('finalize_report_done')
    markShareTiming('finalize_labour_plant_start')
    markShareTiming('finalize_labour_plant_done')
    markShareTiming('finalize_photos_start')
    markShareTiming('finalize_photos_done')
    const row = baseline?.reportRow
    return {
      id: reportId,
      row,
      cleanupPending: false,
      diagnostic: {
        stage: 'finalize-skipped',
        ok: true,
        skipped: true,
        mode: 'RPC',
        reportId,
        projectId: row?.project_id || projectId,
        appBelievesSucceeded: true,
      },
      skipped: {
        report: true,
        labour: true,
        plant: true,
        photos: true,
      },
    }
  }

  let desiredPhotos = null
  if (!skipPhotos) {
    desiredPhotos = buildDesiredPhotoRowsForFinalize({
      keptStoragePaths,
      photoRecords,
      updateExistingPhotos,
      baselinePhotos: baseline?.photos,
    })
  }

  markShareTiming('finalize_report_start')
  markShareTiming('finalize_labour_plant_start')
  markShareTiming('finalize_photos_start')

  const { data, error } = await supabase.rpc(FINALIZE_SITE_DIARY_SAVE_RPC, {
    p_report_id: reportId,
    p_project_id: projectId,
    p_report_patch: skipReport ? null : buildRpcReportPatch(reportPayload, projectId),
    p_labour: skipLabour ? null : labourPayload,
    p_plant: skipPlant ? null : plantPayload,
    p_photos: skipPhotos ? null : desiredPhotos,
  })

  if (error) {
    throw new DiarySaveError('FINALIZE_RPC_FAILED', error.message || 'Finalize save failed.', {
      stage: 'rpc',
      reportId,
      projectId,
      code: error.code || null,
    })
  }

  const result = rpcPayload(data)
  if (!result.ok) {
    throw new DiarySaveError('FINALIZE_RPC_FAILED', 'Finalize save did not succeed.', {
      stage: 'rpc',
      reportId,
      projectId,
      result,
    })
  }

  assertRpcFinalizeIdentity(result, { reportId, projectId })

  const row = result.report
  const { cleanupPending } = await processFinalizeStorageCleanup(supabase, result.cleanupJobs)

  markShareTiming('finalize_report_done')
  markShareTiming('finalize_labour_plant_done')
  markShareTiming('finalize_photos_done')

  const diagnostic = {
    stage: 'rpc-finalize',
    ok: true,
    mode: 'RPC',
    insertUsed: false,
    reportId,
    projectId,
    verifiedSiteSummary: row?.site_summary ?? null,
    labourCount: result.labour_count ?? null,
    plantCount: result.plant_count ?? null,
    photoCount: result.photo_count ?? null,
    cleanupPending,
    appBelievesSucceeded: true,
  }

  log('success', { reportId, verifiedSiteSummary: row?.site_summary ?? null })
  return {
    id: reportId,
    diagnostic,
    row,
    cleanupPending,
    skipped: {
      report: skipReport,
      labour: skipLabour,
      plant: skipPlant,
      photos: skipPhotos,
    },
  }
}

/** @deprecated kept for tests that imported the old helper name */
export function adaptReportPayloadForLiveRow(reportPayload, liveRow = undefined) {
  void liveRow
  const { payload, dropped, liveColumns } = buildLiveDailyReportUpdatePayload(reportPayload)
  return { payload, skipped: dropped, liveColumns }
}
