/**
 * Saved Site Diary list → viewer navigation (single-flight, immediate acknowledgement).
 */

/**
 * @param {{ current: boolean | string | null }} inFlightRef
 * @param {string} reportId
 * @returns {boolean}
 */
export function tryBeginSavedDiaryOpen(inFlightRef, reportId) {
  const id = String(reportId || '').trim()
  if (!id) return false
  if (inFlightRef.current) return false
  inFlightRef.current = id
  return true
}

/**
 * @param {{
 *   selectionMode?: boolean
 *   inFlightRef?: { current: boolean | string | null }
 * }} input
 */
export function shouldIgnoreSavedDiaryRowOpen(input) {
  if (input?.selectionMode === true) return true
  if (input?.inFlightRef?.current) return true
  return false
}

/**
 * @param {string | null | undefined} href
 * @param {{
 *   router?: { push: (href: string) => void, prefetch?: (href: string) => void }
 *   navigate?: (href: string) => void
 * }} deps
 */
export function navigateToSavedDiaryViewer(href, deps = {}) {
  const target = String(href || '').trim()
  if (!target) return false
  if (typeof deps.navigate === 'function') {
    deps.navigate(target)
    return true
  }
  if (typeof deps.router?.push === 'function') {
    deps.router.push(target)
    return true
  }
  if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
    window.location.assign(target)
    return true
  }
  return false
}

/**
 * @param {Array<{ id?: string, project_id?: string }>} reports
 * @param {(projectId: string, reportId: string) => string | null} hrefForRow
 * @param {{ prefetch?: (href: string) => void }} router
 * @param {number} [limit]
 */
export function prefetchSavedDiaryViewerRoutes(reports, hrefForRow, router, limit = 5) {
  if (typeof router?.prefetch !== 'function') return
  if (!Array.isArray(reports)) return
  const seen = new Set()
  for (const row of reports) {
    if (seen.size >= limit) break
    const href = hrefForRow(row?.project_id, row?.id)
    if (!href || seen.has(href)) continue
    seen.add(href)
    router.prefetch(href)
  }
}
