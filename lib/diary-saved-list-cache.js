/**
 * In-memory Saved Diaries compact-list snapshot.
 * Survives hub unmount while the JS session lives (open diary → return).
 * Stores list-row metadata only — never photos, PDFs, or full diary payloads.
 */

export const SAVED_DIARY_LIST_CACHE_PAGE_SIZE = 50

function cacheKey({ mode = '', filterProjectId = null } = {}) {
  const listMode = String(mode || '')
  const project = listMode === 'saved' ? '' : String(filterProjectId || '')
  return `${listMode}::${project}`
}

/** @type {Map<string, { reports: object[], totalCount: number, storedAt: number }>} */
const snapshots = new Map()

/**
 * Compact one Saved Diaries browsing row.
 * @param {object} row
 */
export function compactSavedDiaryListRow(row) {
  const project = row?.projects && typeof row.projects === 'object'
    ? {
      id: row.projects.id ?? null,
      name: row.projects.name ?? null,
    }
    : null
  return {
    id: row?.id ?? null,
    project_id: row?.project_id ?? null,
    report_date: row?.report_date ?? null,
    shift: row?.shift ?? null,
    site_summary: row?.site_summary ?? null,
    projects: project,
  }
}

export function compactSavedDiaryListRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => compactSavedDiaryListRow(row))
}

export function savedDiaryListSnapshotKey(opts = {}) {
  return cacheKey(opts)
}

/**
 * First-paint state for Saved Diaries.
 * No snapshot → initial loading is allowed.
 * Snapshot → render retained rows; do not show the initial loading replacement.
 */
export function savedDiaryListPaintState(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.reports)) {
    return {
      reports: [],
      totalCount: 0,
      initialLoading: true,
      fromSnapshot: false,
    }
  }
  return {
    reports: snapshot.reports,
    totalCount: Number.isFinite(Number(snapshot.totalCount))
      ? Number(snapshot.totalCount)
      : snapshot.reports.length,
    initialLoading: false,
    fromSnapshot: true,
  }
}

export function readSavedDiaryListSnapshot(opts = {}) {
  const snap = snapshots.get(cacheKey(opts))
  if (!snap || !Array.isArray(snap.reports)) return null
  return {
    reports: snap.reports,
    totalCount: snap.totalCount,
    storedAt: snap.storedAt,
  }
}

export function writeSavedDiaryListSnapshot(opts, { reports, totalCount } = {}) {
  const compacted = compactSavedDiaryListRows(reports)
  const snap = {
    reports: compacted,
    totalCount: Number.isFinite(Number(totalCount)) ? Number(totalCount) : compacted.length,
    storedAt: Date.now(),
  }
  snapshots.set(cacheKey(opts), snap)
  return snap
}

export function clearSavedDiaryListSnapshot(opts) {
  if (opts == null) {
    snapshots.clear()
    return
  }
  snapshots.delete(cacheKey(opts))
}

/**
 * Refresh enough rows to replace the currently shown list without shrinking
 * a Load-more-expanded snapshot back to one page.
 */
export function savedDiaryListRefreshRange(loadedCount, pageSize = SAVED_DIARY_LIST_CACHE_PAGE_SIZE) {
  const size = Number(pageSize) > 0 ? Number(pageSize) : SAVED_DIARY_LIST_CACHE_PAGE_SIZE
  const loaded = Math.max(0, Number(loadedCount) || 0)
  const count = Math.max(size, loaded)
  return { from: 0, to: count - 1 }
}

export function snapshotHasForbiddenListPayload(snapshot) {
  const json = JSON.stringify(snapshot || {})
  return /data:image\/|application\/pdf|"photos"|"pdf_cache"|"signed_url"/i.test(json)
}
