/**
 * Pure helpers for saved Site Diary form hydrate / isolation / post-save.
 * Does not touch project sticky fields or programme dates.
 */

/**
 * Author role from a saved daily_reports row — never invent a default.
 * @param {{ creator_role?: unknown } | null | undefined} report
 * @returns {string}
 */
export function hydrateAuthorRole(report) {
  if (report == null) return ''
  const raw = report.creator_role
  if (raw == null) return ''
  return String(raw).trim()
}

/**
 * Author name from a saved row.
 * @param {{ creator_name?: unknown } | null | undefined} report
 * @returns {string}
 */
export function hydrateAuthorName(report) {
  if (report == null) return ''
  const raw = report.creator_name
  if (raw == null) return ''
  return String(raw).trim()
}

/**
 * Map report_plant rows into form plant rows. Empty/missing → one blank row.
 * Never merges with a previous diary’s rows — caller must replace state.
 *
 * @param {Array<{ item?: unknown, ref?: unknown, status?: unknown, notes?: unknown }>|null|undefined} plant
 * @param {() => string} makeKey
 */
export function hydratePlantFormRows(plant, makeKey) {
  const keyFn = typeof makeKey === 'function' ? makeKey : () => `plant-${Math.random()}`
  if (!Array.isArray(plant) || plant.length === 0) {
    return [{
      key: keyFn(),
      plant_type: '',
      quantity: '',
      hours: '',
      notes: '',
    }]
  }
  return plant.map((row) => ({
    key: keyFn(),
    plant_type: row?.item != null ? String(row.item) : '',
    quantity: row?.ref != null ? String(row.ref) : '',
    hours: row?.status != null ? String(row.status) : '',
    notes: row?.notes != null ? String(row.notes) : '',
  }))
}

/**
 * Empty plant section for a brand-new diary (not Use as Basis).
 */
export function emptyPlantFormRows(makeKey) {
  return hydratePlantFormRows([], makeKey)
}

/**
 * True when branding profile selector / quick-add should be shown.
 * Existing diaries keep attached branding read-only unless explicit change is allowed.
 */
export function shouldShowBrandingSelector({ hasReportId = false, allowChangeBranding = false } = {}) {
  if (!hasReportId) return true
  return Boolean(allowChangeBranding)
}

/**
 * Linked project display for an existing diary — never blank/detached.
 * @returns {{ projectId: string|null, projectName: string, linked: boolean }}
 */
export function linkedProjectForSavedDiary({ reportProjectId, routeProjectId, projectName } = {}) {
  const id = reportProjectId || routeProjectId || null
  const name = String(projectName || '').trim()
  return {
    projectId: id ? String(id) : null,
    projectName: name,
    linked: Boolean(id),
  }
}

/**
 * After saving an existing diary, stay on that diary in View mode.
 */
export function postSaveDiaryHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}`
}

/**
 * Recent-diaries list belongs on the chooser, not under a saved report.
 */
export function shouldShowRecentDiariesOnReportPage({ hasOpenReport = false } = {}) {
  return !hasOpenReport
}

/**
 * Edit save must update the same id (no duplicate insert).
 */
export function saveKeepsSameDiaryId(beforeId, afterId) {
  if (!beforeId || !afterId) return false
  return String(beforeId) === String(afterId)
}
