/**
 * Programme dates + sticky project fields on Site Diary setup —
 * persist to public.projects and rehydrate into Project & Report Details.
 * Pure helpers for regression tests.
 */

import { toDateColumnValue, toDateInputValue } from './project-day.js'
import {
  DEFAULT_NEW_PROJECT_WORKING_DAYS,
  emptyStickyFormFields,
  hydrateStickyFromRow,
  preserveSavedStickyFields,
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
    : 'site_address, client_pm, working_days_per_week'
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
 * Resolve the project a typed name refers to. Setup hydration and setup
 * persistence must agree, otherwise a name typed in a different case looks
 * like a new project on screen while still updating the stored project row.
 *
 * @param {Array<Record<string, unknown>>} existingProjects
 * @param {unknown} projectName
 */
export function findExistingProjectByName(existingProjects, projectName) {
  const target = String(projectName || '').trim().toLowerCase()
  if (!target) return null
  const list = Array.isArray(existingProjects) ? existingProjects : []
  return list.find((p) => String(p?.name || '').trim().toLowerCase() === target) || null
}

/**
 * Programme dates are project-level. A blank Site Diary setup field must never
 * erase a date already saved on the project — both dates are cleared only from
 * the project's own dates editor.
 *
 * @param {{ start_date?: string|null, planned_completion_date?: string|null }} fields
 * @param {Record<string, unknown>|null|undefined} project
 */
export function preserveSavedProjectDates(fields, project) {
  if (!project) return fields
  return {
    ...fields,
    start_date: fields.start_date || toDateColumnValue(project.start_date),
    planned_completion_date:
      fields.planned_completion_date || toDateColumnValue(project.planned_completion_date),
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
  projectReference = '',
} = {}) {
  return {
    ...projectDatesWritePayload(startDate, plannedCompletionDate),
    ...stickyWritePayload({
      projectAddress,
      projectManager,
      workingDaysPerWeek,
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
  projectReference = '',
}) {
  const typed = projectWritePayload({
    startDate,
    plannedCompletionDate,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    projectReference,
  })
  const name = String(projectName || '').trim()
  const list = Array.isArray(existingProjects) ? existingProjects : []

  const planForProject = (project) => {
    // `dates` kept for existing callers/tests (now includes sticky columns too).
    const fields = preserveSavedStickyFields(
      preserveSavedProjectDates(typed, project),
      project,
    )
    return {
      mode: payloadNeedsWrite(fields, project) ? 'update' : 'reuse',
      projectId: project.id,
      name: project.name || name,
      dates: fields,
      fields,
    }
  }

  if (selectedProjectId && selectedProjectId !== newProjectValue) {
    const match = list.find((p) => p.id === selectedProjectId)
    if (match) return planForProject(match)
  }

  const exact = findExistingProjectByName(list, name)
  if (exact) return planForProject(exact)

  return { mode: 'insert', projectId: null, name, dates: typed, fields: typed }
}

/**
 * Merge a loaded project into setup form state (new diary / select existing).
 * Does not clear unrelated fields (author, report date, branding, etc.).
 * Every project-owned field comes from the selected public.projects row.
 * Diary/report-specific values are deliberately excluded.
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
    projectManager: sticky.projectManager,
    workingDaysPerWeek: sticky.workingDaysPerWeek,
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
    workingDaysPerWeek: DEFAULT_NEW_PROJECT_WORKING_DAYS,
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
    projectReference: state.projectReference || '',
  }
}

/**
 * Programme date fields belong on setup for both new and existing projects
 * (including Project & Report Details).
 */
export function showProjectDatesOnSetup() {
  return true
}
