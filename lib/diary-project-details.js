/**
 * Site Diary PROJECT card — programme dates + Project Day (read-only).
 * Values come from public.projects via the diary's project_id.
 */

import {
  computeProjectDay,
  formatProjectDateDisplay,
  toDateInputValue,
} from './project-day.js'

/** Explicit columns for the linked project on the diary form (includes programme dates). */
export function diaryLinkedProjectSelectColumns() {
  return 'id, name, client_name, site_address, status, start_date, planned_completion_date, created_at'
}

/**
 * Columns for the project selector list — must include programme dates so the
 * visible PROJECT card can render them for the selected row without a second fetch.
 */
export function diaryProjectSelectorSelectColumns() {
  return 'id, name, client_name, site_address, status, start_date, planned_completion_date'
}

/**
 * Build read-only programme copy for the visible PROJECT card (under the selector).
 *
 * @param {{ start_date?: unknown, planned_completion_date?: unknown } | null | undefined} project
 * @param {string|null|undefined} [asOfDate] — report date when known
 */
export function programmeDatesForProjectDetails(project, asOfDate = null) {
  const startDate = toDateInputValue(project?.start_date) || null
  const plannedCompletionDate = toDateInputValue(project?.planned_completion_date) || null

  if (!startDate && !plannedCompletionDate) {
    return {
      status: 'missing',
      startDate: null,
      plannedCompletionDate: null,
      startDisplay: null,
      plannedCompletionDisplay: null,
      startNotSet: true,
      plannedCompletionNotSet: true,
      projectDayLine: null,
      missingMessage: 'Project dates not set',
    }
  }

  const day = computeProjectDay({
    startDate,
    plannedCompletionDate,
    asOfDate,
  })

  const bothSet = Boolean(startDate && plannedCompletionDate)

  return {
    status: bothSet ? 'set' : 'partial',
    startDate,
    plannedCompletionDate,
    startDisplay: startDate ? formatProjectDateDisplay(startDate) : null,
    plannedCompletionDisplay: plannedCompletionDate
      ? formatProjectDateDisplay(plannedCompletionDate)
      : null,
    startNotSet: !startDate,
    plannedCompletionNotSet: !plannedCompletionDate,
    // Only show Project Day when both dates exist (shared utility needs both).
    projectDayLine: bothSet ? day.headline : null,
    missingMessage: null,
  }
}

/**
 * Confirm the diary still points at the expected project (no duplicate invent).
 */
export function diaryRetainsProjectId(report, expectedProjectId) {
  if (!report?.project_id || !expectedProjectId) return false
  return String(report.project_id) === String(expectedProjectId)
}
