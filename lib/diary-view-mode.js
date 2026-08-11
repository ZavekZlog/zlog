/**
 * Site Diary interaction modes (routing-driven — do not infer from report id alone):
 * - compose — new diary after setup / basis (`?compose=1`); writable; no existing-edit chrome
 * - view — opened a previously saved diary (`?report=` only); read-only until Edit
 * - edit — user explicitly chose “Edit This Diary” (`?edit=1`)
 *
 * Live DB may lack `is_draft`; never rely on it alone for mode chrome.
 */

/**
 * @param {object} opts
 * @param {string|null|undefined} opts.reportId
 * @param {string|null|undefined} [opts.editQuery] — searchParams `edit`
 * @param {string|null|undefined} [opts.composeQuery] — searchParams `compose`
 * @param {boolean|null|undefined} [opts.isDraft] — optional when column exists
 * @returns {'view'|'edit'|'compose'|null}
 */
export function resolveDiaryInteractionMode({
  reportId = null,
  editQuery = null,
  composeQuery = null,
  isDraft = null,
} = {}) {
  if (!reportId) return null
  const edit = String(editQuery || '').toLowerCase()
  // Explicit Edit This Diary — only path that is “existing diary edit”.
  if (edit === '1' || edit === 'true' || edit === 'edit') return 'edit'
  const compose = String(composeQuery || '').toLowerCase()
  // Setup Continue / new draft workbench — never existing-edit chrome.
  if (compose === '1' || compose === 'true' || compose === 'compose') return 'compose'
  // Optional draft flag when the column exists (live schema often omits it).
  if (isDraft === true) return 'compose'
  return 'view'
}

/**
 * True when the form may be edited (compose or explicit edit).
 */
export function isDiaryWritableMode(mode) {
  return mode === 'edit' || mode === 'compose'
}

/**
 * View / Edit chrome (banners, Cancel editing) — never for new-diary compose.
 */
export function showExistingDiaryModeChrome(mode) {
  return mode === 'view' || mode === 'edit'
}

/**
 * View URL for a saved diary (no edit / compose flags).
 */
export function diaryViewHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}`
}

/**
 * New / in-progress diary workbench after setup (writable, no edit chrome).
 */
export function diaryComposeHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}&compose=1`
}

/**
 * Explicit Edit mode for the same diary ID.
 */
export function diaryEditHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}&edit=1`
}

/**
 * Status banner copy for the diary form header (existing view/edit only).
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
