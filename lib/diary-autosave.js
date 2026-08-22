/**
 * Interruption-safe Site Diary content autosave.
 *
 * Updates the existing daily_reports row only. Never INSERT. Never writes is_draft.
 * Final Save / Share remains finalizeSiteDiarySave.
 */

import {
  hsIncidentHasData,
  rfiHasData,
  temporaryWorkHasData,
  variationHasData,
  TEMPORARY_WORKS_CHECK_RESULTS,
  TEMPORARY_WORKS_SCAFFOLD_CHECKS,
  TEMPORARY_WORKS_SCAFFOLD_TYPE,
  TEMPORARY_WORKS_STATUSES,
  TEMPORARY_WORKS_TYPES,
  HS_INCIDENT_STATUSES,
  RFI_STATUSES,
  VARIATION_STATUSES,
} from './diary-daily-records.js'
import { LIVE_DAILY_REPORTS } from './live-diary-schema.js'
import { isCoverAutosavePendingToken } from './diary-cover-photo.js'

export const DIARY_AUTOSAVE_LOG = '[zlog:diary-autosave]'
export const DIARY_AUTOSAVE_DEBOUNCE_MS = 1500

export const AUTOSAVE_STATUS_SAVING = 'Saving your work…'
export const AUTOSAVE_STATUS_SAVED = 'Work saved'
/** Genuine offline / transport failure only — not auth, RLS, or schema errors. */
export const AUTOSAVE_STATUS_FAILED_NETWORK = 'Work not saved. Check your connection.'
export const AUTOSAVE_STATUS_FAILED_AUTH =
  'Your sign-in has timed out. Sign in again to keep editing.'
export const AUTOSAVE_STATUS_FAILED_DB = 'Work not saved. Try again in a moment.'
export const AUTOSAVE_STATUS_CONFLICT = 'Updated from your last saved copy.'
/** @deprecated Use classified failure messages — kept for contract grep compatibility. */
export const AUTOSAVE_STATUS_FAILED = AUTOSAVE_STATUS_FAILED_NETWORK

/** Phase 1 workbench content columns that exist on live daily_reports. */
export const DIARY_AUTOSAVE_COLUMNS = [
  'weather',
  'site_summary',
  'visitors',
  'delays_issues',
  'actions',
  'equipment_hire',
  'hs_incidents',
  'rfis',
  'variations',
  'cover_photo_url',
]

/**
 * Present in app/migrations and the stale live-schema snapshot, but NOT in the
 * 2026-08-18 production PostgREST OpenAPI. Selecting or PATCHing them returns
 * PGRST204 and aborts the entire autosave UPDATE (weather included).
 */
export const DIARY_AUTOSAVE_ABSENT_ON_LIVE = [
  'temporary_works_applicable',
  'temporary_works',
]

const AUTOSAVE_COLUMN_SET = new Set(DIARY_AUTOSAVE_COLUMNS)

export const DIARY_AUTOSAVE_FORBIDDEN_KEYS = [
  'id',
  'owner_id',
  'created_at',
  'project_id',
  'report_date',
  'shift',
  'creator_name',
  'creator_role',
  'company_reporting_for',
  'current_phase',
  'branding_id',
  'brand_color',
  'brand_logo_url',
  'signature_url',
  'is_draft',
  'updated_at',
]

function textOrNull(value) {
  const text = value == null ? '' : String(value).trim()
  return text || null
}

function textValue(value) {
  return value == null ? '' : String(value).trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stableId(row) {
  return row?.id || row?.key || null
}

function stableHsIncidents(rows) {
  return asArray(rows)
    .filter(hsIncidentHasData)
    .map((row) => ({
      id: stableId(row),
      description: textOrNull(row.description),
      actionTaken: textOrNull(row.actionTaken ?? row.action_taken),
      assignedTo: textOrNull(row.assignedTo ?? row.assigned_to),
      status: HS_INCIDENT_STATUSES.includes(row.status) ? row.status : 'Open',
      photoUrl: row.photoUrl ?? null,
    }))
}

function stableRfis(rows) {
  return asArray(rows)
    .filter(rfiHasData)
    .map((row) => ({
      id: stableId(row),
      reference: textOrNull(row.reference),
      description: textOrNull(row.description),
      raisedTo: textOrNull(row.raisedTo ?? row.raised_to),
      status: RFI_STATUSES.includes(row.status) ? row.status : 'Open',
    }))
}

function stableVariations(rows) {
  return asArray(rows)
    .filter(variationHasData)
    .map((row) => ({
      id: stableId(row),
      reference: textOrNull(row.reference),
      description: textOrNull(row.description),
      instructedBy: textOrNull(row.instructedBy ?? row.instructed_by),
      status: VARIATION_STATUSES.includes(row.status) ? row.status : 'Identified',
    }))
}

function stableTemporaryWorks(rows) {
  return asArray(rows)
    .filter(temporaryWorkHasData)
    .map((row) => {
      const type = TEMPORARY_WORKS_TYPES.includes(row.type) ? row.type : ''
      const isScaffold = type === TEMPORARY_WORKS_SCAFFOLD_TYPE
      const scaffoldCheck = textValue(row.scaffoldCheck)
      return {
        id: stableId(row),
        type: type || null,
        item: type || null,
        location: textOrNull(row.location),
        status: TEMPORARY_WORKS_STATUSES.includes(row.status) ? row.status : null,
        reference: textOrNull(row.reference),
        checkResult: TEMPORARY_WORKS_CHECK_RESULTS.includes(row.checkResult)
          ? row.checkResult
          : null,
        notes: textOrNull(row.notes),
        scaffoldCheck:
          isScaffold && TEMPORARY_WORKS_SCAFFOLD_CHECKS.includes(scaffoldCheck)
            ? scaffoldCheck
            : isScaffold
              ? (scaffoldCheck || null)
              : null,
        scaffoldTag: isScaffold ? textOrNull(row.scaffoldTag) : null,
      }
    })
}

function stableEquipmentHire(rows) {
  return asArray(rows)
    .filter((row) => (
      textValue(row?.description)
      || textValue(row?.supplier)
      || row?.quantity
      || (row?.status && row.status !== 'Active')
    ))
    .map((row) => ({
      description: textOrNull(row.description),
      supplier: textOrNull(row.supplier),
      quantity: row.quantity ? parseInt(row.quantity, 10) : (row.quantity ?? null),
      status: row.status || 'Active',
    }))
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function autosavePayloadsEqual(left, right) {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  return stableStringify(pickDiaryAutosavePayload(left))
    === stableStringify(pickDiaryAutosavePayload(right))
}

function pickKeys(obj, keys) {
  const out = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, key)) out[key] = obj[key]
  }
  return out
}

/**
 * Strip anything that must never be written by autosave, including is_draft.
 */
export function pickDiaryAutosavePayload(input) {
  const src = input || {}
  return {
    weather: Object.prototype.hasOwnProperty.call(src, 'weather') ? src.weather : null,
    site_summary: Object.prototype.hasOwnProperty.call(src, 'site_summary') ? src.site_summary : '',
    visitors: Object.prototype.hasOwnProperty.call(src, 'visitors') ? src.visitors : null,
    delays_issues: Object.prototype.hasOwnProperty.call(src, 'delays_issues') ? src.delays_issues : null,
    actions: Object.prototype.hasOwnProperty.call(src, 'actions') ? src.actions : null,
    equipment_hire: src.equipment_hire == null ? [] : asArray(src.equipment_hire),
    hs_incidents: src.hs_incidents == null ? [] : asArray(src.hs_incidents),
    rfis: src.rfis == null ? [] : asArray(src.rfis),
    variations: src.variations == null ? [] : asArray(src.variations),
    cover_photo_url: Object.prototype.hasOwnProperty.call(src, 'cover_photo_url')
      ? src.cover_photo_url
      : null,
  }
}

/**
 * Canonical autosave snapshot — must match buildDiaryAutosavePayload() so debounce,
 * stale detection, and post-UPDATE verification compare the same shape.
 */
export function snapshotFromLiveRow(row) {
  const live = row || {}
  return buildDiaryAutosavePayload({
    weather: live.weather ?? '',
    siteSummary: live.site_summary ?? '',
    visitors: live.visitors ?? '',
    delaysIssues: live.delays_issues ?? '',
    actions: live.actions ?? live.actions_required ?? '',
    equipmentHireRows: asArray(live.equipment_hire),
    hsIncidents: asArray(live.hs_incidents),
    rfis: asArray(live.rfis),
    variations: asArray(live.variations),
    coverPhotoUrl: live.cover_photo_url ?? null,
  })
}

/**
 * Build the Phase 1 autosave payload from workbench form state.
 * Uses stable row ids (id or key) so debounce comparison does not churn.
 */
export function buildDiaryAutosavePayload({
  weather = '',
  siteSummary = '',
  visitors = '',
  delaysIssues = '',
  actions = '',
  equipmentHireRows = [],
  hsIncidents = [],
  rfis = [],
  variations = [],
  coverPhotoUrl = null,
} = {}) {
  return pickDiaryAutosavePayload({
    weather: textOrNull(weather),
    site_summary: String(siteSummary || '').trim(),
    visitors: textOrNull(visitors),
    delays_issues: textOrNull(delaysIssues),
    actions: textOrNull(actions),
    equipment_hire: Array.isArray(equipmentHireRows) && equipmentHireRows[0]?.description !== undefined
      ? stableEquipmentHire(equipmentHireRows)
      : asArray(equipmentHireRows),
    hs_incidents: stableHsIncidents(hsIncidents),
    rfis: stableRfis(rfis),
    variations: stableVariations(variations),
    cover_photo_url: coverPhotoUrl == null || coverPhotoUrl === ''
      ? null
      : String(coverPhotoUrl),
  })
}

export function shouldRunDiaryAutosave({
  hydrateComplete = false,
  writable = false,
  reportId = null,
  sessionExpired = false,
  finalSaveInProgress = false,
  payload = null,
  ackedSnapshot = null,
} = {}) {
  if (!hydrateComplete || !writable || !reportId || sessionExpired || finalSaveInProgress) {
    return false
  }
  if (!payload) return false
  return !autosavePayloadsEqual(payload, ackedSnapshot)
}

/**
 * After hydrate, skip one pass if the form already matches the loaded row.
 * If it does not match, lift suppress so debounce can persist the dirty form.
 */
export function resolveHydrateAutosaveSuppress(suppress, payload, ackedSnapshot) {
  if (!suppress) return { suppress: false, block: false }
  if (autosavePayloadsEqual(payload, ackedSnapshot)) {
    return { suppress: false, block: true }
  }
  return { suppress: false, block: false }
}

function assertNoForbiddenKeys(payload) {
  for (const key of Object.keys(payload || {})) {
    if (DIARY_AUTOSAVE_FORBIDDEN_KEYS.includes(key) || !AUTOSAVE_COLUMN_SET.has(key)) {
      throw new Error(`Diary autosave refused to write ${key}`)
    }
  }
}

function summarizeSupabaseError(error) {
  if (!error) return null
  return {
    message: error.message || null,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }
}

function autosaveLog(stage, detail) {
  if (process.env.NODE_ENV === 'production') return
  if (detail !== undefined) {
    console.log(DIARY_AUTOSAVE_LOG, stage, detail)
  } else {
    console.log(DIARY_AUTOSAVE_LOG, stage)
  }
}

function missingLiveColumnFromError(error) {
  const msg = String(error?.message || '')
  const match = msg.match(/Could not find the '([^']+)' column of 'daily_reports'/i)
  return match?.[1] || null
}

function isAutosaveNetworkError(error) {
  if (!error) return false
  if (error instanceof TypeError) return true
  const msg = String(error.message || '')
  return /failed to fetch|networkerror|network request failed|load failed|offline|timed out/i.test(msg)
}

function isAutosaveAuthError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '')
  return /^(401|403|PGRST301)$/.test(code)
    || /jwt|session|not authenticated|invalid claim|auth session/i.test(msg)
}

/**
 * Map autosave failure reason + Supabase error to user-safe status copy.
 * @returns {{ kind: 'network'|'auth'|'db'|'conflict', message: string, diagnostic: string }}
 */
export function classifyAutosaveFailure({
  reason = null,
  error = null,
  sessionExpired = false,
} = {}) {
  if (reason === 'stale') {
    return {
      kind: 'conflict',
      message: AUTOSAVE_STATUS_CONFLICT,
      diagnostic: 'stale-write:server-newer-than-acked',
    }
  }
  if (sessionExpired) {
    return {
      kind: 'auth',
      message: AUTOSAVE_STATUS_FAILED_AUTH,
      diagnostic: 'session-expired',
    }
  }
  if (reason === 'missing-report' || reason === 'missing-project' || reason === 'missing-row') {
    return {
      kind: 'db',
      message: AUTOSAVE_STATUS_FAILED_DB,
      diagnostic: reason,
    }
  }
  if (reason === 'forbidden-is-draft') {
    return {
      kind: 'db',
      message: AUTOSAVE_STATUS_FAILED_DB,
      diagnostic: reason,
    }
  }
  const err = summarizeSupabaseError(error)
  if (isAutosaveNetworkError(error)) {
    return {
      kind: 'network',
      message: AUTOSAVE_STATUS_FAILED_NETWORK,
      diagnostic: `network:${err?.message || reason || 'unknown'}`,
    }
  }
  if (isAutosaveAuthError(error)) {
    return {
      kind: 'auth',
      message: AUTOSAVE_STATUS_FAILED_AUTH,
      diagnostic: `auth:${err?.code || ''}:${err?.message || reason || ''}`,
    }
  }
  if (reason === 'read-failed' || reason === 'update-failed' || reason === 'verify-mismatch') {
    return {
      kind: 'db',
      message: AUTOSAVE_STATUS_FAILED_DB,
      diagnostic: `${reason}:${err?.code || ''}:${err?.message || ''}`,
    }
  }
  return {
    kind: 'db',
    message: AUTOSAVE_STATUS_FAILED_DB,
    diagnostic: reason || 'unknown',
  }
}

export function autosaveStatusAfterResult(result) {
  if (result?.ok) return 'saved'
  const failure = classifyAutosaveFailure({
    reason: result?.reason,
    error: result?.error,
  })
  return failure.kind
}

export function autosaveStatusMessage(statusKind) {
  switch (statusKind) {
    case 'saving':
      return AUTOSAVE_STATUS_SAVING
    case 'saved':
      return AUTOSAVE_STATUS_SAVED
    case 'network':
      return AUTOSAVE_STATUS_FAILED_NETWORK
    case 'auth':
      return AUTOSAVE_STATUS_FAILED_AUTH
    case 'conflict':
      return AUTOSAVE_STATUS_CONFLICT
    case 'db':
    default:
      return AUTOSAVE_STATUS_FAILED_DB
  }
}

/**
 * Final Save / Share and autosave share one persist strip.
 * The UI may be only one of idle | saving | saved | error.
 */
export function diaryPersistenceUiPhase({
  error = '',
  saving = false,
  justSaved = false,
  autosaveStatus = null,
} = {}) {
  if (saving) return 'saving'
  if (error) return 'error'
  if (justSaved) return 'saved'
  if (autosaveStatus === 'saving') return 'saving'
  if (autosaveStatus === 'saved') return 'saved'
  if (
    autosaveStatus === 'network' ||
    autosaveStatus === 'auth' ||
    autosaveStatus === 'db' ||
    autosaveStatus === 'conflict'
  ) {
    return 'error'
  }
  return 'idle'
}

export function shouldShowDiaryAutosaveStatus({
  error = '',
  saving = false,
  justSaved = false,
  autosaveStatus = null,
  finalSaveInProgress = false,
} = {}) {
  if (!autosaveStatus) return false
  if (finalSaveInProgress || saving || justSaved || error) return false
  return true
}

/** Prominent manual Save / Share confirmation — never the quiet autosave line. */
export function shouldShowManualSaveConfirmation({
  error = '',
  saving = false,
  justSaved = false,
} = {}) {
  return Boolean(justSaved && !saving && !error)
}

/**
 * UPDATE the existing daily_reports row with Phase 1 content.
 * Never inserts. Never writes is_draft.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   reason: string|null,
 *   acked: object|null,
 *   wrote: boolean,
 *   error: object|null,
 * }>}
 */
export async function runDiaryAutosave(supabase, {
  reportId,
  projectId,
  payload,
  ackedSnapshot = null,
} = {}) {
  if (!reportId) {
    autosaveLog('refused', { reason: 'missing-report', reportId, projectId })
    return { ok: false, reason: 'missing-report', acked: ackedSnapshot, wrote: false, error: null }
  }
  if (!projectId) {
    autosaveLog('refused', { reason: 'missing-project', reportId, projectId })
    return { ok: false, reason: 'missing-project', acked: ackedSnapshot, wrote: false, error: null }
  }

  const next = pickDiaryAutosavePayload(payload)
  for (const key of DIARY_AUTOSAVE_ABSENT_ON_LIVE) {
    delete next[key]
  }
  // Never persist the local pending-cover sentinel as cover_photo_url.
  if (isCoverAutosavePendingToken(next.cover_photo_url)) {
    delete next.cover_photo_url
  }
  assertNoForbiddenKeys(next)
  if (Object.prototype.hasOwnProperty.call(next, 'is_draft')) {
    autosaveLog('refused', { reason: 'forbidden-is-draft', reportId, projectId })
    return { ok: false, reason: 'forbidden-is-draft', acked: ackedSnapshot, wrote: false, error: null }
  }

  let selectCols = Object.keys(next).filter((key) => AUTOSAVE_COLUMN_SET.has(key))
  if (selectCols.length < 1) {
    return { ok: false, reason: 'update-failed', acked: ackedSnapshot, wrote: false, error: null }
  }

  for (let attempt = 0; attempt < DIARY_AUTOSAVE_COLUMNS.length; attempt += 1) {
    const selectList = selectCols.join(', ')
    let read = supabase
      .from(LIVE_DAILY_REPORTS.table)
      .select(selectList)
      .eq('id', reportId)
    if (projectId) read = read.eq('project_id', projectId)
    const { data: liveRow, error: readError } = await read.maybeSingle()
    if (readError) {
      const missing = missingLiveColumnFromError(readError)
      if (missing && selectCols.includes(missing)) {
        autosaveLog('drop-missing-column', { column: missing, stage: 'read' })
        selectCols = selectCols.filter((col) => col !== missing)
        delete next[missing]
        continue
      }
      autosaveLog('read-failed', { reportId, projectId, error: summarizeSupabaseError(readError) })
      return {
        ok: false,
        reason: 'read-failed',
        acked: ackedSnapshot,
        wrote: false,
        error: summarizeSupabaseError(readError),
      }
    }
    if (!liveRow) {
      autosaveLog('missing-row', { reportId, projectId })
      return { ok: false, reason: 'missing-row', acked: ackedSnapshot, wrote: false, error: null }
    }

    const live = snapshotFromLiveRow(liveRow)
    const comparableNext = pickKeys(next, selectCols)
    const comparableAcked = ackedSnapshot == null ? null : pickKeys(pickDiaryAutosavePayload(ackedSnapshot), selectCols)
    const comparableLive = pickKeys(live, selectCols)
    if (autosavePayloadsEqual(comparableLive, comparableNext)) {
      return { ok: true, reason: 'already-saved', acked: live, wrote: false, error: null }
    }
    if (comparableAcked != null && !autosavePayloadsEqual(comparableLive, comparableAcked)) {
      autosaveLog('stale', { reportId, projectId })
      return { ok: false, reason: 'stale', acked: live, wrote: false, error: null }
    }

    let write = supabase
      .from(LIVE_DAILY_REPORTS.table)
      .update(comparableNext)
      .eq('id', reportId)
    if (projectId) write = write.eq('project_id', projectId)
    const { data: updated, error: writeError } = await write.select(selectList).maybeSingle()
    if (writeError || !updated) {
      const missing = missingLiveColumnFromError(writeError)
      if (missing && Object.prototype.hasOwnProperty.call(next, missing)) {
        autosaveLog('drop-missing-column', { column: missing, stage: 'update' })
        selectCols = selectCols.filter((col) => col !== missing)
        delete next[missing]
        continue
      }
      autosaveLog('update-failed', {
        reportId,
        projectId,
        error: summarizeSupabaseError(writeError),
        rowsReturned: updated ? 1 : 0,
      })
      return {
        ok: false,
        reason: 'update-failed',
        acked: ackedSnapshot,
        wrote: false,
        error: summarizeSupabaseError(writeError),
      }
    }

    const acked = snapshotFromLiveRow(updated)
    const written = pickKeys(comparableNext, selectCols)
    if (!autosavePayloadsEqual(pickKeys(acked, selectCols), written)) {
      autosaveLog('verify-mismatch', { reportId, projectId, sent: written, readBack: acked })
      return {
        ok: false,
        reason: 'verify-mismatch',
        acked,
        wrote: true,
        error: { message: 'verify-mismatch', code: 'VERIFY_MISMATCH' },
      }
    }
    autosaveLog('updated', { reportId, projectId, columns: selectCols })
    return { ok: true, reason: 'updated', acked, wrote: true, error: null }
  }

  return {
    ok: false,
    reason: 'update-failed',
    acked: ackedSnapshot,
    wrote: false,
    error: { message: 'no writable autosave columns remain', code: 'PGRST204' },
  }
}
