/**
 * Authoritative Site Diary final-save contract (M0).
 *
 * Live schema source: docs/LIVE_SCHEMA_DAILY_REPORTS.json (PostgREST OpenAPI).
 * Payload keys are generated ONLY from lib/live-diary-schema.js allowlists.
 *
 * Proven root cause of non-persistence:
 *   Writing `is_draft` (absent on live) → PGRST204 → entire UPDATE aborted.
 *
 * Contract:
 *   UPDATE daily_reports WHERE id = reportId → SELECT same id → verify field.
 *   Never INSERT into daily_reports on final save.
 */

import {
  LIVE_DAILY_REPORTS,
  LIVE_REPORT_LABOUR,
  LIVE_REPORT_PHOTOS,
  LIVE_REPORT_PLANT,
  buildLiveDailyReportUpdatePayload,
  isMissingPreparedAssetColumnError,
  omitPreparedAssetColumns,
  pickLiveColumns,
} from './live-diary-schema.js'
import { storagePathsForPhotoRow } from './photo-workspace/persist-prepared-photo.js'
import { markShareTiming, patchShareTimingCounts } from './diary-share-timing-diag.js'

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

function summarizeSupabaseResult(result) {
  return {
    data: result?.data ?? null,
    error: result?.error
      ? {
          message: result.error.message || null,
          code: result.error.code || null,
          details: result.error.details || null,
          hint: result.error.hint || null,
        }
      : null,
    status: result?.status ?? null,
    statusText: result?.statusText ?? null,
    count: result?.count ?? null,
  }
}

function rowsAffectedFromResult(result) {
  if (typeof result?.count === 'number') return result.count
  if (result?.error && isZeroRowError(result.error)) return 0
  if (Array.isArray(result?.data)) return result.data.length
  if (result?.data?.id) return 1
  if (result?.error) return 0
  return null
}

function isZeroRowError(error) {
  if (!error) return false
  if (error.code === 'PGRST116') return true
  return /0 rows|no rows|multiple \(or no\) rows/i.test(error.message || '')
}

/** Live columns this reconcile UPDATE path may write (same pick as the UPDATE). */
const PHOTO_RECONCILE_UPDATE_COLUMNS = LIVE_REPORT_PHOTOS.columns.filter(
  (c) => c !== 'id' && c !== 'owner_id',
)

const PHOTO_RECONCILE_LIST_SELECT =
  'id, url, caption, location, category, sequence, layout, rotation_degrees, assigned_to, thumbnail_path'

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

/**
 * UPDATE-only write + immediate re-read verification.
 * Emits a numbered execution trace for one manual Save diagnosis.
 */
async function updateDailyReportRow(supabase, { reportId, projectId, reportPayload }) {
  const execution = {
    mode: 'UPDATE',
    table: LIVE_DAILY_REPORTS.table,
    reportId,
    projectId,
    insertUsed: false,
    steps: [],
    firstFailingStep: null,
  }
  const step = (name, detail = {}) => {
    const entry = { name, at: new Date().toISOString(), ...detail }
    execution.steps.push(entry)
    log(`exec:${name}`, detail)
    return entry
  }

  step('1_clicked_contract_entered', { reportId, mode: 'UPDATE', insertUsed: false })
  markShareTiming('finalize_report_start')

  const { data: authData, error: authErr } = await supabase.auth.getUser()
  const userId = authData?.user?.id || null
  step('auth', { userId, authError: authErr?.message || null })
  markShareTiming('finalize_report_auth_done')

  const before = await supabase
    .from(LIVE_DAILY_REPORTS.table)
    .select('*')
    .eq('id', reportId)
    .maybeSingle()

  const beforeSummary = summarizeSupabaseResult(before)
  step('before_select', {
    site_summary: before.data?.site_summary ?? null,
    supabase: beforeSummary,
  })
  markShareTiming('finalize_report_select_before_done')

  if (before.error) {
    execution.firstFailingStep = 'before_select'
    throw new DiarySaveError(
      'PREFLIGHT_FAILED',
      `Could not read report before update: ${before.error.message}`,
      {
        stage: 'before-select',
        table: LIVE_DAILY_REPORTS.table,
        reportId,
        projectId,
        userId,
        supabase: beforeSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  if (!before.data) {
    execution.firstFailingStep = 'before_select'
    throw new DiarySaveError(
      'PREFLIGHT_ZERO_ROWS',
      `Save failed: no ${LIVE_DAILY_REPORTS.table} row for id=${reportId}.`,
      {
        stage: 'before-select',
        table: LIVE_DAILY_REPORTS.table,
        reportId,
        projectId,
        userId,
        supabase: beforeSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  const live = before.data
  if (projectId && live.project_id && live.project_id !== projectId) {
    execution.firstFailingStep = 'project_mismatch'
    throw new DiarySaveError(
      'PROJECT_MISMATCH',
      `Save failed: report ${reportId} belongs to project ${live.project_id}, page project is ${projectId}.`,
      {
        stage: 'before-select',
        reportId,
        projectId,
        liveProjectId: live.project_id,
        liveOwnerId: live.owner_id ?? null,
        userId,
        supabase: beforeSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  const { payload, dropped } = buildLiveDailyReportUpdatePayload({
    ...reportPayload,
    project_id: projectId || live.project_id,
  })

  // Hard anti-wipe: never invent cover_photo_url:null when the caller omitted the key.
  // Untouched covers must remain whatever is already on the live row.
  if (
    !Object.prototype.hasOwnProperty.call(reportPayload || {}, 'cover_photo_url') &&
    Object.prototype.hasOwnProperty.call(payload, 'cover_photo_url') &&
    payload.cover_photo_url == null
  ) {
    delete payload.cover_photo_url
  }

  step('4_exact_payload', {
    mode: 'UPDATE',
    insertUsed: false,
    filter: { id: reportId },
    payload,
    dropped,
    beforeSiteSummary: live.site_summary ?? null,
  })

  const updateRes = await supabase
    .from(LIVE_DAILY_REPORTS.table)
    .update(payload)
    .eq('id', reportId)
    .select('*', { count: 'exact' })
    .single()

  const updateSummary = summarizeSupabaseResult(updateRes)
  const rowsAffected = rowsAffectedFromResult(updateRes)
  step('5_supabase_update_response', {
    mode: 'UPDATE',
    filter: { id: reportId },
    status: updateSummary.status,
    statusText: updateSummary.statusText,
    data: updateSummary.data,
    error: updateSummary.error,
    count: updateSummary.count,
    rowsAffected,
  })
  markShareTiming('finalize_report_update_done')

  if (updateRes.error || !updateRes.data?.id) {
    const zero = isZeroRowError(updateRes.error) || !updateRes.data
    execution.firstFailingStep = '5_supabase_update_response'
    throw new DiarySaveError(
      zero ? 'UPDATE_ZERO_ROWS' : 'UPDATE_FAILED',
      zero
        ? `Save failed: UPDATE ${LIVE_DAILY_REPORTS.table} returned zero rows for id=${reportId}.`
        : `Save failed: ${updateRes.error?.message || 'update did not return the updated record'}`,
      {
        stage: 'update',
        ok: false,
        table: LIVE_DAILY_REPORTS.table,
        mode: 'UPDATE',
        insertUsed: false,
        reportId,
        projectId,
        userId,
        filter: { id: reportId },
        payload,
        payloadKeys: Object.keys(payload),
        dropped,
        rowsAffected,
        liveOwnerId: live.owner_id ?? null,
        liveProjectId: live.project_id ?? null,
        beforeSiteSummary: live.site_summary ?? null,
        supabase: updateSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  if (updateRes.data.id !== reportId) {
    execution.firstFailingStep = 'id_mismatch'
    throw new DiarySaveError(
      'ID_MISMATCH',
      `Save returned id ${updateRes.data.id} but edited id was ${reportId}.`,
      {
        stage: 'update',
        reportId,
        returnedId: updateRes.data.id,
        payload,
        rowsAffected,
        supabase: updateSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  const after = await supabase
    .from(LIVE_DAILY_REPORTS.table)
    .select('*')
    .eq('id', reportId)
    .single()

  const afterSummary = summarizeSupabaseResult(after)
  const expectedSummary = payload.site_summary
  const readMatches = Object.prototype.hasOwnProperty.call(payload, 'site_summary')
    ? after.data?.site_summary === expectedSummary
    : !!after.data?.id

  step('8_subsequent_read', {
    expectedSiteSummary: expectedSummary ?? null,
    readSiteSummary: after.data?.site_summary ?? null,
    readMatchesUpdatedValue: readMatches,
    sameReportId: after.data?.id === reportId,
    supabase: afterSummary,
  })
  markShareTiming('finalize_report_select_verify_done')

  if (after.error || !after.data) {
    execution.firstFailingStep = '8_subsequent_read'
    throw new DiarySaveError(
      'VERIFY_SELECT_FAILED',
      `UPDATE appeared to succeed but re-read failed: ${after.error?.message || 'no row'}`,
      {
        stage: 'after-select',
        reportId,
        payload,
        rowsAffected,
        update: updateSummary,
        supabase: afterSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, 'site_summary') &&
    after.data.site_summary !== payload.site_summary
  ) {
    execution.firstFailingStep = '8_subsequent_read'
    throw new DiarySaveError(
      'VERIFY_MISMATCH',
      `Fresh SELECT site_summary did not match UPDATE payload. before=${JSON.stringify(live.site_summary)} updateResponse=${JSON.stringify(updateRes.data.site_summary)} freshSelect=${JSON.stringify(after.data.site_summary)}`,
      {
        stage: 'after-select',
        ok: false,
        reportId,
        expected: payload.site_summary,
        before: live.site_summary,
        updateResponse: updateRes.data.site_summary,
        freshSelect: after.data.site_summary,
        payload,
        rowsAffected,
        update: updateSummary,
        supabase: afterSummary,
        appBelievesSucceeded: false,
        execution,
      },
    )
  }

  step('7_app_success', {
    appBelievesSucceeded: true,
    rowsAffected,
    verifiedSiteSummary: after.data.site_summary ?? null,
  })

  log('update:success', {
    reportId: after.data.id,
    site_summary: after.data.site_summary ?? null,
    rowsAffected,
  })
  markShareTiming('finalize_report_done')

  return {
    row: after.data,
    diagnostic: {
      stage: 'update-verified',
      ok: true,
      table: LIVE_DAILY_REPORTS.table,
      mode: 'UPDATE',
      insertUsed: false,
      reportId,
      projectId: after.data.project_id || projectId,
      userId,
      filter: { id: reportId },
      payload,
      payloadKeys: Object.keys(payload),
      dropped,
      rowsAffected,
      liveOwnerId: after.data.owner_id ?? null,
      beforeSiteSummary: live.site_summary ?? null,
      verifiedSiteSummary: after.data.site_summary ?? null,
      readMatchesUpdatedValue: true,
      appBelievesSucceeded: true,
      supabase: updateSummary,
      afterSelect: afterSummary,
      execution,
    },
  }
}

async function replaceLabour(supabase, reportId, labourPayload) {
  const { error: delError } = await supabase.from(LIVE_REPORT_LABOUR.table).delete().eq('report_id', reportId)
  if (delError) throw new DiarySaveError('LABOUR_DELETE_FAILED', delError.message)

  if (!labourPayload.length) return

  const rows = labourPayload.map((row) => pickLiveColumns(row, LIVE_REPORT_LABOUR.columns.filter((c) => c !== 'id')))
  const { error } = await supabase.from(LIVE_REPORT_LABOUR.table).insert(rows)
  if (error) throw new DiarySaveError('LABOUR_INSERT_FAILED', error.message)
}

async function replacePlant(supabase, reportId, plantPayload) {
  const { error: delError } = await supabase.from(LIVE_REPORT_PLANT.table).delete().eq('report_id', reportId)
  if (delError) throw new DiarySaveError('PLANT_DELETE_FAILED', delError.message)

  if (!plantPayload.length) return

  // Live `ref` / `status` are text — coerce so numeric form values still write.
  const rows = plantPayload.map((row) => {
    const picked = pickLiveColumns(row, LIVE_REPORT_PLANT.columns.filter((c) => c !== 'id'))
    if (picked.ref != null) picked.ref = String(picked.ref)
    if (picked.status != null) picked.status = String(picked.status)
    return picked
  })
  const { error } = await supabase.from(LIVE_REPORT_PLANT.table).insert(rows)
  if (error) throw new DiarySaveError('PLANT_INSERT_FAILED', error.message)
}

async function bestEffortRemovePhotoStorage(supabase, rows) {
  const paths = []
  for (const row of rows || []) {
    for (const path of storagePathsForPhotoRow(row)) {
      if (!paths.includes(path)) paths.push(path)
    }
  }
  if (paths.length === 0) return
  try {
    await supabase.storage.from('site-photos').remove(paths)
    log('photos:storage-cleanup', { count: paths.length })
  } catch (err) {
    log('photos:storage-cleanup-warning', { message: err?.message || String(err) })
  }
}

async function listExistingPhotoRowsForReconcile(supabase, reportId) {
  const full = await supabase
    .from(LIVE_REPORT_PHOTOS.table)
    .select(PHOTO_RECONCILE_LIST_SELECT)
    .eq('report_id', reportId)
  if (!full.error) return full.data

  if (isMissingPreparedAssetColumnError(full.error)) {
    const withoutThumb = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .select('id, url, caption, location, category, sequence, layout, rotation_degrees, assigned_to')
      .eq('report_id', reportId)
    if (withoutThumb.error) throw new DiarySaveError('PHOTOS_LIST_FAILED', withoutThumb.error.message)
    return withoutThumb.data
  }

  if (/assigned_to/i.test(full.error.message || '')) {
    const withoutAssigned = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .select('id, url, caption, location, category, sequence, layout, rotation_degrees, thumbnail_path')
      .eq('report_id', reportId)
    if (withoutAssigned.error) throw new DiarySaveError('PHOTOS_LIST_FAILED', withoutAssigned.error.message)
    return withoutAssigned.data
  }

  if (/rotation_degrees/i.test(full.error.message || '')) {
    const withoutRotation = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .select('id, url, caption, location, category, sequence, layout, assigned_to, thumbnail_path')
      .eq('report_id', reportId)
    if (withoutRotation.error) throw new DiarySaveError('PHOTOS_LIST_FAILED', withoutRotation.error.message)
    return withoutRotation.data
  }

  throw new DiarySaveError('PHOTOS_LIST_FAILED', full.error.message)
}

async function reconcilePhotos(supabase, {
  reportId,
  keptStoragePaths,
  photoRecords,
  updateExistingPhotos,
}) {
  markShareTiming('finalize_photos_start')
  const existingPhotoRows = await listExistingPhotoRowsForReconcile(supabase, reportId)
  markShareTiming('finalize_photos_list_done')

  const toRemove = (existingPhotoRows || []).filter((row) => !keptStoragePaths.includes(row.url))
  if (toRemove.length > 0) {
    log('photos:delete', { count: toRemove.length })
    const { error: deletePhotosError } = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .delete()
      .in('id', toRemove.map((row) => row.id))
    if (deletePhotosError) throw new DiarySaveError('PHOTOS_DELETE_FAILED', deletePhotosError.message)
    // Best-effort: remove report (+ thumbnail when present). Exact known paths only.
    await bestEffortRemovePhotoStorage(supabase, toRemove)
  }
  patchShareTimingCounts({ photoDeleteCount: toRemove.length })
  markShareTiming('finalize_photos_delete_done')

  const existingByUrl = new Map()
  for (const row of existingPhotoRows || []) {
    const url = String(row?.url || '').trim()
    if (url) existingByUrl.set(url, row)
  }

  const patchesToApply = []
  for (const patch of updateExistingPhotos || []) {
    const url = String(patch?.url || '').trim()
    if (!url) continue
    const fields = pickLiveColumns(patch.fields, PHOTO_RECONCILE_UPDATE_COLUMNS)
    if (reportPhotoMetadataNeedsUpdate(existingByUrl.get(url), fields)) {
      patchesToApply.push({ url, fields })
    }
  }

  markShareTiming('finalize_photos_update_start')
  patchShareTimingCounts({ photoUpdateCallCount: patchesToApply.length })
  for (const patch of patchesToApply) {
    const { error } = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .update(patch.fields)
      .eq('report_id', reportId)
      .eq('url', patch.url)
    if (error) {
      log('photos:update-warning', { url: patch.url, error: error.message })
    }
  }
  markShareTiming('finalize_photos_update_done')

  markShareTiming('finalize_photos_insert_start')
  patchShareTimingCounts({ photoInsertCount: (photoRecords || []).length })
  if (photoRecords.length === 0) {
    markShareTiming('finalize_photos_insert_done')
    markShareTiming('finalize_photos_done')
    return
  }

  const columnList = LIVE_REPORT_PHOTOS.columns.filter((c) => c !== 'id')
  let rows = photoRecords.map((row) => pickLiveColumns(row, columnList))
  log('photos:insert', { count: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [] })
  let { error: photosError } = await supabase.from(LIVE_REPORT_PHOTOS.table).insert(rows)

  // Legacy / pre-migration: strip Phase C columns and retry. Canonical url still saves.
  if (photosError && isMissingPreparedAssetColumnError(photosError)) {
    log('photos:insert-prepared-columns-fallback', { message: photosError.message })
    rows = rows.map((row) => omitPreparedAssetColumns(row))
    const retry = await supabase.from(LIVE_REPORT_PHOTOS.table).insert(rows)
    photosError = retry.error
  }

  if (photosError) throw new DiarySaveError('PHOTOS_INSERT_FAILED', photosError.message)
  markShareTiming('finalize_photos_insert_done')
  markShareTiming('finalize_photos_done')
}

/**
 * Finalize (save) an existing Site Diary report — UPDATE only.
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
}) {
  log('start', {
    reportId: reportId || null,
    projectId: projectId || null,
    mode: 'update',
    table: LIVE_DAILY_REPORTS.table,
    labour: labourPayload.length,
    plant: plantPayload.length,
    newPhotos: photoRecords.length,
    inboundKeys: Object.keys(reportPayload || {}),
  })

  if (!reportId) {
    throw new DiarySaveError(
      'MISSING_REPORT_ID',
      'Cannot save: missing report id. Editing must open with ?report=… and never create a new row.',
      { stage: 'guard', mode: 'UPDATE', reportId: null, projectId },
    )
  }
  if (!projectId) {
    throw new DiarySaveError('MISSING_PROJECT_ID', 'Cannot save: missing project id.', {
      stage: 'guard',
      mode: 'UPDATE',
      reportId,
      projectId: null,
    })
  }

  const { row, diagnostic } = await updateDailyReportRow(supabase, {
    reportId,
    projectId,
    reportPayload,
  })

  if (!row?.id || row.id !== reportId) {
    throw new DiarySaveError('ID_MISMATCH', 'Save returned a different report id than the one being edited.', {
      ...diagnostic,
      ok: false,
      expected: reportId,
      got: row?.id ?? null,
    })
  }

  log('children:labour-plant')
  markShareTiming('finalize_labour_plant_start')
  await Promise.all([
    (async () => {
      markShareTiming('finalize_labour_start')
      await replaceLabour(supabase, reportId, labourPayload)
      markShareTiming('finalize_labour_done')
    })(),
    (async () => {
      markShareTiming('finalize_plant_start')
      await replacePlant(supabase, reportId, plantPayload)
      markShareTiming('finalize_plant_done')
    })(),
  ])
  markShareTiming('finalize_labour_plant_done')

  log('children:photos')
  await reconcilePhotos(supabase, {
    reportId,
    keptStoragePaths,
    photoRecords,
    updateExistingPhotos,
  })

  log('success', { reportId, verifiedSiteSummary: row.site_summary ?? null })
  return { id: reportId, diagnostic, row }
}

/** @deprecated kept for tests that imported the old helper name */
export function adaptReportPayloadForLiveRow(reportPayload, _liveRow) {
  const { payload, dropped, liveColumns } = buildLiveDailyReportUpdatePayload(reportPayload)
  return { payload, skipped: dropped, liveColumns }
}
