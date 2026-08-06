/**
 * Site Diary navigation paths (routing contract).
 * Existing diaries always open with ?report= on the project diary page.
 */

/**
 * @param {string} projectId
 * @param {string} reportId
 * @returns {string | null}
 */
export function existingDiaryHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}`
}

/**
 * @param {{ projectId?: string | null, missing?: boolean }} [opts]
 * @returns {string}
 */
export function diaryHubHref(opts = {}) {
  const params = new URLSearchParams()
  if (opts.projectId) params.set('project', opts.projectId)
  if (opts.missing) params.set('missing', '1')
  const q = params.toString()
  return q ? `/dashboard/diary?${q}` : '/dashboard/diary'
}

export const DIARY_MISSING_MESSAGE =
  'That Site Diary could not be found. Choose Open Latest Diary or Start New Site Diary.'
