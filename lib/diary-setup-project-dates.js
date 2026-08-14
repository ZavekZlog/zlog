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
export function projectsSetupSelectColumns({ includeProjectReference = true } = {}) {
  const sticky = includeProjectReference
    ? stickyProjectSelectColumns()
    : 'site_address, client_pm, working_days_per_week, current_phase'
  return [
    'id',
    'name',
    'client_name',
    'status',
    'created_at',
    'start_date',
    'planned_completion_date',
    sticky,
  ].join(', ')
}

/**
 * List projects for setup. Falls back without project_reference when the column
 * is missing from PostgREST schema cache (additive migration lag).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchProjectsForSetup(supabase) {
  const full = await supabase
    .from('projects')
    .select(projectsSetupSelectColumns({ includeProjectReference: true }))
    .order('created_at', { ascending: false })

  if (!full.error) return full.data || []

  const msg = full.error.message || ''
  if (/project_reference/i.test(msg) || /column/i.test(msg)) {
    const fallback = await supabase
      .from('projects')
      .select(projectsSetupSelectColumns({ includeProjectReference: false }))
      .order('created_at', { ascending: false })
    if (fallback.error) return []
    return fallback.data || []
  }

  // Network / other errors — return empty list (caller may still continue new-diary setup).
  return []
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
  projectReference = '',
} = {}) {
  return {
    ...projectDatesWritePayload(startDate, plannedCompletionDate),
    ...stickyWritePayload({
      projectAddress,
      projectManager,
      workingDaysPerWeek,
      currentPhase,
      projectReference,
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
  projectReference = '',
}) {
  const fields = projectWritePayload({
    startDate,
    plannedCompletionDate,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
    projectReference,
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
 * Merge a loaded project into setup form state (new diary / select existing).
 * Does not clear unrelated fields (author, report date, branding, etc.).
 *
 * Project Manager is intentionally NOT copied here for NEW diary defaulting:
 * PM often varies between reports, and silently inheriting a prior value risks
 * incorrect formal reporting. Edit-existing hydrates PM separately via
 * hydrateStickyFromRow on the edit loader — do not conflate the two paths.
 *
 * Project Reference, address, phase, dates remain project-level sticky.
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
    projectAddress: sticky.projectAddress,
    // New-diary / select-existing: leave PM blank (do not inherit prior diary/project PM).
    projectManager: '',
    workingDaysPerWeek: sticky.workingDaysPerWeek,
    currentPhase: sticky.currentPhase,
    projectReference: sticky.projectReference,
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
    projectReference: state.projectReference || '',
  }
}

/**
 * Programme date fields belong on setup for both new and existing projects
 * (including Edit Report Details).
 */
export function showProjectDatesOnSetup() {
  return true
}
