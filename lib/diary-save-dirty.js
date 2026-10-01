/**
 * Domain change detection for Finalize Save.
 * Compares persist-shaped snapshots only — never object identity.
 */

import { stableStringify } from './diary-autosave.js'
import { buildLiveDailyReportUpdatePayload } from './live-diary-schema.js'

function textOrNull(value) {
  const text = value == null ? '' : String(value).trim()
  return text || null
}

function parseNullableNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function labourRowHasPersistData(row) {
  if (!row) return false
  const trade = textOrNull(row.trade)
  const company = textOrNull(row.company)
  const notes = textOrNull(row.notes)
  const count = row.headcount ?? row.count
  const hours = row.hours
  return Boolean(trade || company || count || hours || notes)
}

export function plantRowHasPersistData(row) {
  if (!row) return false
  const item = textOrNull(row.plant_type ?? row.item)
  const notes = textOrNull(row.notes)
  const quantity = row.quantity ?? row.ref
  const hours = row.hours ?? row.status
  return Boolean(item || quantity || hours || notes)
}

/**
 * Canonical labour rows for equality / persist.
 * Sequence is the filtered array index (form save contract).
 */
export function labourFormToPersistRows(rows, reportId) {
  return (rows || [])
    .filter(labourRowHasPersistData)
    .map((row, index) => ({
      report_id: reportId,
      trade: textOrNull(row.trade),
      company: textOrNull(row.company),
      count: parseNullableNumber(row.headcount ?? row.count),
      hours: parseNullableNumber(row.hours),
      notes: textOrNull(row.notes),
      sequence: index,
    }))
}

/**
 * Canonical plant rows. `ref` / `status` are live text columns.
 */
export function plantFormToPersistRows(rows, reportId) {
  return (rows || [])
    .filter(plantRowHasPersistData)
    .map((row, index) => {
      const refSource = Object.prototype.hasOwnProperty.call(row, 'ref')
        ? row.ref
        : (row.quantity ? parseInt(row.quantity, 10) : null)
      const statusSource = Object.prototype.hasOwnProperty.call(row, 'status')
        ? row.status
        : (row.hours ? parseFloat(row.hours) : null)
      return {
        report_id: reportId,
        item: textOrNull(row.plant_type ?? row.item),
        ref: refSource == null || refSource === '' ? null : String(refSource),
        status: statusSource == null || statusSource === '' ? null : String(statusSource),
        notes: textOrNull(row.notes),
        sequence: index,
      }
    })
}

export function labourPersistRowsEqual(left, right) {
  return stableStringify(left || []) === stableStringify(right || [])
}

export function plantPersistRowsEqual(left, right) {
  return stableStringify(left || []) === stableStringify(right || [])
}

/**
 * True when daily_reports UPDATE would change a field present in the next payload.
 * Keys omitted from the next payload (cover anti-wipe omit) are not compared.
 */
export function reportPersistNeedsWrite(reportPayload, baselineRow) {
  if (!baselineRow?.id) return true
  const { payload: next } = buildLiveDailyReportUpdatePayload(reportPayload || {})
  const { payload: prev } = buildLiveDailyReportUpdatePayload(baselineRow)
  for (const key of Object.keys(next)) {
    if (stableStringify(next[key]) !== stableStringify(prev[key])) return true
  }
  return false
}

export const WARM_HANDOFF_REPORT_CHANGED_MESSAGE =
  'This diary changed after you opened it. Open it again and review it before saving.'

/**
 * True when every report value this final Save can overwrite still matches the
 * acknowledged baseline. Keys come from the patch buildRpcReportPatch already
 * built. Identity columns and other metadata are not compared.
 */
export function warmHandoffReportBaselineIsCurrent({
  liveRow = null,
  baselineRow = null,
  reportPatch = null,
  projectId = '',
  reportId = '',
} = {}) {
  if (!liveRow?.id || !baselineRow?.id) return false
  if (String(liveRow.id) !== String(reportId || '')) return false
  if (String(baselineRow.id) !== String(reportId || '')) return false
  if (String(liveRow.project_id || '') !== String(projectId || '')) return false
  if (
    baselineRow.project_id
    && String(baselineRow.project_id) !== String(projectId || '')
  ) return false
  const { payload: live } = buildLiveDailyReportUpdatePayload(liveRow)
  const { payload: base } = buildLiveDailyReportUpdatePayload(baselineRow)
  for (const key of Object.keys(reportPatch || {})) {
    if (stableStringify(live[key]) !== stableStringify(base[key])) return false
  }
  return true
}

export async function readDailyReportRowForWarmFinalSave(supabase, {
  reportId = '',
  projectId = '',
} = {}) {
  if (!reportId || !projectId || !supabase) {
    return { ok: false, reason: 'read-failed', row: null }
  }
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('id', reportId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error || !data) return { ok: false, reason: 'read-failed', row: null }
    return { ok: true, reason: 'read', row: data }
  } catch {
    return { ok: false, reason: 'read-failed', row: null }
  }
}

/**
 * Warm core-row handoff only. A stale autosave result cannot pass, even when
 * that autosave has already copied live autosave columns into the baseline.
 */
export function decideWarmHandoffFinalSave({
  autosaveResult = null,
  liveRead = null,
  baselineRow = null,
  reportPatch = null,
  projectId = '',
  reportId = '',
} = {}) {
  if (autosaveResult?.reason === 'stale') {
    return { proceed: false, reason: 'stale' }
  }
  if (!liveRead || liveRead.error || !liveRead.row) {
    return { proceed: false, reason: 'read-failed' }
  }
  const current = warmHandoffReportBaselineIsCurrent({
    liveRow: liveRead.row,
    baselineRow,
    reportPatch,
    projectId,
    reportId,
  })
  if (!current) return { proceed: false, reason: 'changed' }
  return { proceed: true, reason: 'current' }
}

export function photoRowsToBaseline(rows) {
  return (rows || [])
    .map((row) => ({
      url: String(row?.url || '').trim(),
      caption: row?.caption ?? null,
      location: row?.location ?? null,
      category: row?.category ?? null,
      sequence: row?.sequence ?? null,
      layout: row?.layout ?? null,
      rotation_degrees: row?.rotation_degrees ?? 0,
      assigned_to: row?.assigned_to ?? null,
      thumbnail_path: row?.thumbnail_path ?? null,
    }))
    .filter((row) => row.url)
}

export function durablePhotosToBaseline(photos) {
  return (photos || [])
    .filter((photo) => photo?.storagePath)
    .map((photo) => ({
      url: String(photo.storagePath).trim(),
      caption: textOrNull(photo.caption),
      sequence: photo.sequence_number ?? photo.sequence ?? null,
      layout: photo.layout || 'grid4',
      location: photo.location || photo.area || null,
      category: photo.category || null,
      rotation_degrees: Number(photo.rotationDegrees) || 0,
      assigned_to: textOrNull(photo.assignedTo || photo.assigned_to),
      thumbnail_path: photo.thumbnailPath || photo.thumbnail_path || null,
    }))
    .filter((row) => row.url)
}

export function mergeAutosaveAckIntoReportRow(reportRow, acked) {
  if (!reportRow) return reportRow
  if (!acked) return reportRow
  const next = { ...reportRow }
  for (const key of [
    'weather',
    'site_summary',
    'visitors',
    'visitors_register_provenance',
    'delays_issues',
    'actions',
    'equipment_hire',
    'hs_incidents',
    'rfis',
    'variations',
    'cover_photo_url',
  ]) {
    if (Object.prototype.hasOwnProperty.call(acked, key)) {
      next[key] = acked[key]
    }
  }
  return next
}
