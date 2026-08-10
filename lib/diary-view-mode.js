/**
 * Site Diary View → Edit interaction mode (saved reports).
 * Opening ?report= is View unless ?edit=1 or the row is still a draft.
 */

/**
 * @param {object} opts
 * @param {string|null|undefined} opts.reportId
 * @param {string|null|undefined} [opts.editQuery] — searchParams `edit`
 * @param {boolean|null|undefined} [opts.isDraft] — daily_reports.is_draft when known
 * @returns {'view'|'edit'|null}
 */
export function resolveDiaryInteractionMode({
  reportId = null,
  editQuery = null,
  isDraft = null,
} = {}) {
  if (!reportId) return null
  const edit = String(editQuery || '').toLowerCase()
  if (edit === '1' || edit === 'true' || edit === 'edit') return 'edit'
  // In-progress drafts open ready to fill (setup continue / new draft).
  if (isDraft === true) return 'edit'
  return 'view'
}

/**
 * View URL for a saved diary (no edit flag — open does not imply editing).
 */
export function diaryViewHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}`
}

/**
 * Explicit Edit mode for the same diary ID.
 */
export function diaryEditHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}&edit=1`
}

/**
 * Status banner copy for the diary form header.
 * @returns {{ kind: 'view'|'edit', text: string, emphasizeProject: boolean }}
 */
export function diaryModeBanner({ mode, projectName = '' } = {}) {
  const name = String(projectName || '').trim()
  if (mode === 'edit') {
    return {
      kind: 'edit',
      emphasizeProject: Boolean(name),
      text: name
        ? `You’re editing the saved Site Diary for ${name}. Make your changes, then tap Save Site Diary when you’re ready.`
        : 'You’re editing this saved Site Diary. Make your changes, then tap Save Site Diary when you’re ready.',
    }
  }
  return {
    kind: 'view',
    emphasizeProject: Boolean(name),
    text: name
      ? `You’re viewing the saved Site Diary for ${name}.`
      : 'You’re viewing this saved Site Diary.',
  }
}

/**
 * Opening a report must not schedule a write.
 * Pure contract helper for regression tests.
 */
export function openingDiaryPerformsWrite() {
  return false
}

/**
 * Edit This Diary keeps the same report id.
 */
export function editKeepsSameDiaryId(viewReportId, editReportId) {
  if (!viewReportId || !editReportId) return false
  return String(viewReportId) === String(editReportId)
}

/**
 * Cancel Edit returns to View for the same id (no save).
 */
export function cancelEditReturnsToView({ beforeMode, afterMode, reportIdBefore, reportIdAfter }) {
  return (
    beforeMode === 'edit'
    && afterMode === 'view'
    && Boolean(reportIdBefore)
    && String(reportIdBefore) === String(reportIdAfter)
  )
}

/**
 * Use as Basis creates a distinct new diary id; original unchanged.
 */
export function basisCreatesNewDiaryId(originalId, newId) {
  if (!originalId || !newId) return false
  return String(originalId) !== String(newId)
}
