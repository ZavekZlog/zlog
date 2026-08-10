/**
 * Site Diary PROJECT card — sticky project info + programme dates + Project Day.
 * Values come from public.projects via the diary's project_id.
 */

import {
  computeProjectDay,
  formatProjectDateDisplay,
  toDateInputValue,
} from './project-day.js'
import {
  stickyProjectSelectColumns,
  toTextInputValue,
  toWorkingDaysInputValue,
} from './project-sticky-fields.js'

/** Explicit columns for the linked project on the diary form. */
export function diaryLinkedProjectSelectColumns() {
  return [
    'id',
    'name',
    'client_name',
    'status',
    'start_date',
    'planned_completion_date',
    'created_at',
    stickyProjectSelectColumns(),
  ].join(', ')
}

/**
 * Columns for the project selector list — must include sticky + programme fields
 * so the visible PROJECT card can render them without a second fetch.
 */
export function diaryProjectSelectorSelectColumns() {
  return [
    'id',
    'name',
    'client_name',
    'status',
    'start_date',
    'planned_completion_date',
    stickyProjectSelectColumns(),
  ].join(', ')
}

/**
 * Build read-only copy for the visible PROJECT card (under the selector).
 * Sticky fields: only include populated values.
 * Programme dates: protected Project Dates display rules (incl. not-set).
 *
 * Display order:
 * Project Address → Project Manager → Start → Planned Completion →
 * Working Days → Current Phase → Project Day
 *
 * @param {Record<string, unknown> | null | undefined} project
 * @param {string|null|undefined} [asOfDate]
 */
export function programmeDatesForProjectDetails(project, asOfDate = null) {
  const startDate = toDateInputValue(project?.start_date) || null
  const plannedCompletionDate = toDateInputValue(project?.planned_completion_date) || null

  const address = toTextInputValue(project?.site_address) || null
  const projectManager = toTextInputValue(project?.client_pm) || null
  const workingDaysRaw = toWorkingDaysInputValue(project?.working_days_per_week)
  const workingDaysPerWeek = workingDaysRaw
    ? `${workingDaysRaw} day${workingDaysRaw === '1' ? '' : 's'}`
    : null
  const currentPhase = toTextInputValue(project?.current_phase) || null

  /** @type {{ key: string, label: string, value: string }[]} */
  const stickyRows = []
  if (address) stickyRows.push({ key: 'address', label: 'Project Address', value: address })
  if (projectManager) {
    stickyRows.push({ key: 'projectManager', label: 'Project Manager', value: projectManager })
  }

  /** @type {{ key: string, label: string, value: string }[]} */
  const afterDateStickyRows = []
  if (workingDaysPerWeek) {
    afterDateStickyRows.push({
      key: 'workingDays',
      label: 'Working Days Per Week',
      value: workingDaysPerWeek,
    })
  }
  if (currentPhase) {
    afterDateStickyRows.push({ key: 'phase', label: 'Current Phase', value: currentPhase })
  }

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
      address,
      projectManager,
      workingDaysPerWeek,
      currentPhase,
      stickyRows,
      afterDateStickyRows,
      hasAnySticky: stickyRows.length > 0 || afterDateStickyRows.length > 0,
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
    projectDayLine: bothSet ? day.headline : null,
    missingMessage: null,
    address,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
    stickyRows,
    afterDateStickyRows,
    hasAnySticky: stickyRows.length > 0 || afterDateStickyRows.length > 0,
  }
}

/**
 * Confirm the diary still points at the expected project (no duplicate invent).
 */
export function diaryRetainsProjectId(report, expectedProjectId) {
  if (!report?.project_id || !expectedProjectId) return false
  return String(report.project_id) === String(expectedProjectId)
}
