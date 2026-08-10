/**
 * Programme dates + sticky project fields on Site Diary setup —
 * persist to public.projects and rehydrate into Edit Report Details.
 * Pure helpers for regression tests.
 */

import { toDateColumnValue, toDateInputValue } from './project-day.js'
import {
  emptyStickyFormFields,
  hydrateStickyFromRow,
  stickyFieldsMatchRow,
  stickyPayloadHasValues,
  stickyProjectSelectColumns,
  stickyWritePayload,
} from './project-sticky-fields.js'

export const NEW_PROJECT_SENTINEL = '__new__'

/** Columns required when listing/loading projects on diary setup. */
export function projectsSetupSelectColumns() {
  return [
    'id',
    'name',
    'client_name',
    'status',
    'created_at',
    'start_date',
    'planned_completion_date',
    stickyProjectSelectColumns(),
  ].join(', ')
}

/**
 * Map a projects row into controlled date-input values.
 * @param {{ start_date?: unknown, planned_completion_date?: unknown } | null | undefined} project
 */
export function hydrateProjectDatesFromRow(project) {
  return {
    projectStartDate: toDateInputValue(project?.start_date),
    projectPlannedCompletionDate: toDateInputValue(project?.planned_completion_date),
  }
}

/**
 * @param {unknown} startDate
 * @param {unknown} plannedCompletionDate
 */
export function projectDatesWritePayload(startDate, plannedCompletionDate) {
  return {
    start_date: toDateColumnValue(startDate),
    planned_completion_date: toDateColumnValue(plannedCompletionDate),
  }
}

/**
 * Full projects write payload: programme dates + sticky fields.
 */
export function projectWritePayload({
  startDate = '',
  plannedCompletionDate = '',
  projectAddress = '',
  projectManager = '',
  workingDaysPerWeek = '',
  currentPhase = '',
} = {}) {
  return {
    ...projectDatesWritePayload(startDate, plannedCompletionDate),
    ...stickyWritePayload({
      projectAddress,
      projectManager,
      workingDaysPerWeek,
      currentPhase,
    }),
  }
}

function datesMatchRow(dates, project) {
  return (
    toDateInputValue(project?.start_date) === toDateInputValue(dates.start_date)
    && toDateInputValue(project?.planned_completion_date)
      === toDateInputValue(dates.planned_completion_date)
  )
}

function payloadNeedsWrite(fields, project) {
  const hasDates = Boolean(fields.start_date || fields.planned_completion_date)
  const hasSticky = stickyPayloadHasValues(fields)
  if (!hasDates && !hasSticky) return false
  if (!project) return true
  return !(datesMatchRow(fields, project) && stickyFieldsMatchRow(fields, project))
}

/**
 * Decide insert vs update vs reuse for the linked project.
 * Programme dates + sticky fields are included on insert/update.
 *
 * @returns {{
 *   mode: 'insert'|'update'|'reuse',
 *   projectId: string|null,
 *   name: string,
 *   dates: ReturnType<typeof projectWritePayload>,
 *   fields: ReturnType<typeof projectWritePayload>,
 * }}
 */
export function planProjectDatePersistence({
  selectedProjectId,
  newProjectValue = NEW_PROJECT_SENTINEL,
  existingProjects = [],
  projectName = '',
  startDate = '',
  plannedCompletionDate = '',
  projectAddress = '',
  projectManager = '',
  workingDaysPerWeek = '',
  currentPhase = '',
}) {
  const fields = projectWritePayload({
    startDate,
    plannedCompletionDate,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
  })
  // `dates` kept for existing callers/tests (now includes sticky columns too).
  const dates = fields
  const name = String(projectName || '').trim()
  const list = Array.isArray(existingProjects) ? existingProjects : []

  if (selectedProjectId && selectedProjectId !== newProjectValue) {
    const match = list.find((p) => p.id === selectedProjectId)
    if (match) {
      if (!payloadNeedsWrite(fields, match)) {
        return { mode: 'reuse', projectId: match.id, name: match.name || name, dates, fields }
      }
      return { mode: 'update', projectId: match.id, name: match.name || name, dates, fields }
    }
  }

  const exact = list.find(
    (p) => String(p.name || '').trim().toLowerCase() === name.toLowerCase(),
  )
  if (exact) {
    if (!payloadNeedsWrite(fields, exact)) {
      return { mode: 'reuse', projectId: exact.id, name: exact.name || name, dates, fields }
    }
    return { mode: 'update', projectId: exact.id, name: exact.name || name, dates, fields }
  }

  return { mode: 'insert', projectId: null, name, dates, fields }
}

/**
 * Merge a loaded project into setup form state (edit details / select existing).
 * Does not clear unrelated fields (author, report date, branding, etc.).
 */
export function mergeProjectIntoSetupState(state, project) {
  if (!project?.id) return state
  const dates = hydrateProjectDatesFromRow(project)
  const sticky = hydrateStickyFromRow(project)
  return {
    ...state,
    selectedProjectId: project.id,
    projectName: project.name || state.projectName || '',
    projectStartDate: dates.projectStartDate,
    projectPlannedCompletionDate: dates.projectPlannedCompletionDate,
    ...sticky,
  }
}

/**
 * Selecting "New project — type the name below" clears sticky project values
 * (including name, id, dates) without touching diary/report author fields.
 */
export function clearStickyProjectSelection(state = {}) {
  return {
    ...state,
    selectedProjectId: NEW_PROJECT_SENTINEL,
    projectName: '',
    projectStartDate: '',
    projectPlannedCompletionDate: '',
    ...emptyStickyFormFields(),
  }
}

/**
 * Fresh-setup defaults must not blank programme/sticky values already loaded.
 */
export function applyFreshSetupDefaults(state, defaults = {}) {
  return {
    ...state,
    author: state.author || defaults.author || '',
    reportingOnBehalfOf: state.reportingOnBehalfOf || defaults.reportingOnBehalfOf || '',
    reportDate: state.reportDate || defaults.reportDate || '',
    projectStartDate: state.projectStartDate || '',
    projectPlannedCompletionDate: state.projectPlannedCompletionDate || '',
    projectAddress: state.projectAddress || '',
    projectManager: state.projectManager || '',
    workingDaysPerWeek: state.workingDaysPerWeek || '',
    currentPhase: state.currentPhase || '',
  }
}

/**
 * Programme date fields belong on setup for both new and existing projects
 * (including Edit Report Details).
 */
export function showProjectDatesOnSetup() {
  return true
}
