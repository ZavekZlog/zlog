/**
 * Programme dates on Site Diary setup — persist to public.projects and rehydrate
 * into Edit Report Details. Pure helpers for regression tests.
 */

import { toDateColumnValue, toDateInputValue } from './project-day.js'

export const NEW_PROJECT_SENTINEL = '__new__'

/** Columns required when listing/loading projects on diary setup. */
export function projectsSetupSelectColumns() {
  return 'id, name, client_name, site_address, status, created_at, start_date, planned_completion_date'
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
 * Decide insert vs update vs reuse for the linked project.
 * Programme dates are included on insert/update. Reuse skips a no-op write.
 *
 * @returns {{ mode: 'insert'|'update'|'reuse', projectId: string|null, name: string, dates: { start_date: string|null, planned_completion_date: string|null } }}
 */
export function planProjectDatePersistence({
  selectedProjectId,
  newProjectValue = NEW_PROJECT_SENTINEL,
  existingProjects = [],
  projectName = '',
  startDate = '',
  plannedCompletionDate = '',
}) {
  const dates = projectDatesWritePayload(startDate, plannedCompletionDate)
  const name = String(projectName || '').trim()
  const list = Array.isArray(existingProjects) ? existingProjects : []
  const hasProgrammeDates = Boolean(dates.start_date || dates.planned_completion_date)

  if (selectedProjectId && selectedProjectId !== newProjectValue) {
    const match = list.find((p) => p.id === selectedProjectId)
    if (match) {
      if (!hasProgrammeDates) {
        return { mode: 'reuse', projectId: match.id, name: match.name || name, dates }
      }
      const sameAsStored =
        toDateInputValue(match.start_date) === toDateInputValue(dates.start_date)
        && toDateInputValue(match.planned_completion_date) === toDateInputValue(dates.planned_completion_date)
      if (sameAsStored) {
        return { mode: 'reuse', projectId: match.id, name: match.name || name, dates }
      }
      return { mode: 'update', projectId: match.id, name: match.name || name, dates }
    }
  }

  const exact = list.find(
    (p) => String(p.name || '').trim().toLowerCase() === name.toLowerCase(),
  )
  if (exact) {
    if (!hasProgrammeDates) {
      return { mode: 'reuse', projectId: exact.id, name: exact.name || name, dates }
    }
    return { mode: 'update', projectId: exact.id, name: exact.name || name, dates }
  }

  return { mode: 'insert', projectId: null, name, dates }
}

/**
 * Merge a loaded project into setup form state (edit details / select existing).
 * Does not clear unrelated fields.
 */
export function mergeProjectIntoSetupState(state, project) {
  if (!project?.id) return state
  const dates = hydrateProjectDatesFromRow(project)
  return {
    ...state,
    selectedProjectId: project.id,
    projectName: project.name || state.projectName || '',
    projectStartDate: dates.projectStartDate,
    projectPlannedCompletionDate: dates.projectPlannedCompletionDate,
  }
}

/**
 * Fresh-setup defaults must not blank programme dates already loaded from a project.
 */
export function applyFreshSetupDefaults(state, defaults = {}) {
  return {
    ...state,
    author: state.author || defaults.author || '',
    reportingOnBehalfOf: state.reportingOnBehalfOf || defaults.reportingOnBehalfOf || '',
    reportDate: state.reportDate || defaults.reportDate || '',
    projectStartDate: state.projectStartDate || '',
    projectPlannedCompletionDate: state.projectPlannedCompletionDate || '',
  }
}

/**
 * Programme date fields belong on setup for both new and existing projects
 * (including Edit Report Details).
 */
export function showProjectDatesOnSetup() {
  return true
}
