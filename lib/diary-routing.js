/**
 * Site Diary navigation paths (routing contract).
 * Today's existing diary opens through populated Project & Report Details first.
 * Historical diaries still open with ?report= on the project diary page (View by default).
 * New diaries from setup use ?report=&compose=1 — see lib/diary-view-mode.js.
 * Explicit Edit uses ?report=&edit=1 — see lib/diary-view-mode.js.
 */

import { diaryComposeHref, diaryEditHref, diaryViewHref } from './diary-view-mode.js'
import { todayIsoDate } from './report-setup.js'

/**
 * @param {string} projectId
 * @param {string} reportId
 * @returns {string | null}
 */
export function existingDiaryHref(projectId, reportId) {
  return diaryViewHref(projectId, reportId)
}

/**
 * Populated setup/details URL for one existing diary.
 *
 * @param {string} projectId
 * @param {string} reportId
 * @returns {string | null}
 */
export function projectAndReportDetailsHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/diary/setup?report=${encodeURIComponent(reportId)}&project=${encodeURIComponent(projectId)}`
}

/**
 * Read-only viewer for one saved diary — the whole record on a single page.
 * Never opens the compose/edit workbench and never creates a row.
 *
 * @param {string} projectId
 * @param {string} reportId
 * @returns {string | null}
 */
export function savedDiaryViewerHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary/view?report=${encodeURIComponent(reportId)}`
}

export function isTodaysDiary(reportDate, today = todayIsoDate()) {
  return String(reportDate || '').trim().slice(0, 10) === today
}

/**
 * Onward edit route from the saved-diary viewer.
 * Always opens the same report in explicit Edit mode on the full workbench.
 * Edit changes editability only — it must not dump the user onto setup /
 * Project & Report Details alone (that path is for Open Latest / Use as Basis).
 *
 * @param {{ projectId?: string|null, reportId?: string|null, reportDate?: unknown, today?: string }} opts
 * @returns {string | null}
 */
export function editExistingDiaryHref({
  projectId,
  reportId,
  reportDate: _reportDate,
  today: _today,
} = {}) {
  if (!projectId || !reportId) return null
  return diaryEditHref(projectId, reportId)
}

/**
 * User-facing open route: today's diary gets a pre-flight details review;
 * historical diaries retain their direct read-only View route.
 *
 * @param {{ projectId?: string|null, reportId?: string|null, reportDate?: unknown, today?: string }} opts
 * @returns {string | null}
 */
export function openExistingDiaryHref({
  projectId,
  reportId,
  reportDate,
  today = todayIsoDate(),
} = {}) {
  if (!projectId || !reportId) return null
  if (isTodaysDiary(reportDate, today)) {
    return projectAndReportDetailsHref(projectId, reportId)
  }
  return existingDiaryHref(projectId, reportId)
}

export { diaryComposeHref, diaryEditHref, diaryViewHref }

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
