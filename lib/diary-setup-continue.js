/**
 * Site Diary setup continue — project link + programme dates + sticky fields + draft.
 * Pure planning helpers keep the CTA testable without the browser.
 */

import { validateProjectDates } from './project-day.js'
import {
  NEW_PROJECT_SENTINEL,
  planProjectDatePersistence,
} from './diary-setup-project-dates.js'
import { validateStickyProjectFields } from './project-sticky-fields.js'

/**
 * Validate setup fields before creating/updating a diary draft.
 * Summary / diary content is intentionally not required here.
 *
 * @returns {{ ok: true } | { ok: false, message: string, field: 'required'|'dates'|'workingDays' }}
 */
export function validateDiarySetupContinue({
  projectName = '',
  author = '',
  reportingOnBehalfOf = '',
  reportDate = '',
  startDate = '',
  plannedCompletionDate = '',
  workingDaysPerWeek = '',
}) {
  if (!String(projectName).trim() || !String(author).trim() || !String(reportingOnBehalfOf).trim() || !reportDate) {
    return {
      ok: false,
      field: 'required',
      message: 'Please complete Project Name, Report Author, Reporting On Behalf Of, and Report Date.',
    }
  }
  const dates = validateProjectDates(startDate, plannedCompletionDate)
  if (!dates.ok) {
    return { ok: false, field: 'dates', message: dates.message }
  }
  const sticky = validateStickyProjectFields({ workingDaysPerWeek })
  if (!sticky.ok) {
    return { ok: false, field: sticky.field, message: sticky.message }
  }
  return { ok: true }
}

/**
 * Build the diary URL after setup succeeds.
 * New diaries land in compose (`?compose=1`) — never existing-diary `?edit=1`.
 * Live DB may lack `is_draft`, so compose must be routing-explicit.
 */
export function diaryFormHref(projectId, reportId) {
  if (!projectId || !reportId) return null
  return `/dashboard/project/${projectId}/diary?report=${reportId}&compose=1`
}

/**
 * Persist project row for setup continue. Uses insert/update/reuse from the plan.
 * Avoids `.select()` of sticky/date columns after write — RETURNING can fail under RLS
 * even when the write succeeded.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {object} opts.plan — from planProjectDatePersistence
 * @returns {Promise<string>} project id
 */
export async function persistSetupProject({ supabase, plan }) {
  if (!plan || (plan.mode !== 'insert' && plan.mode !== 'update' && plan.mode !== 'reuse')) {
    throw new Error('We couldn’t save the project. Check your connection and try again.')
  }

  const raw = plan.fields || plan.dates || {}
  const fields = {
    start_date: raw.start_date ?? null,
    planned_completion_date: raw.planned_completion_date ?? null,
    site_address: raw.site_address ?? null,
    client_pm: raw.client_pm ?? null,
    working_days_per_week: raw.working_days_per_week ?? null,
    current_phase: raw.current_phase ?? null,
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'project_reference')) {
    fields.project_reference = raw.project_reference ?? null
  }

  if (plan.mode === 'reuse') {
    if (!plan.projectId) throw new Error('We couldn’t find that project. Choose it again and try again.')
    return plan.projectId
  }

  if (plan.mode === 'update') {
    if (!plan.projectId) throw new Error('We couldn’t find that project. Choose it again and try again.')
    const { error: updateError } = await supabase
      .from('projects')
      .update(fields)
      .eq('id', plan.projectId)
    if (updateError) {
      throw new Error(updateError.message || 'We couldn’t save the project. Check your connection and try again.')
    }
    return plan.projectId
  }

  const { data, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: plan.name,
      status: 'active',
      ...fields,
    })
    .select('id')
    .single()
  if (insertError) {
    throw new Error(insertError.message || 'We couldn’t create the project. Check your connection and try again.')
  }
  if (!data?.id) throw new Error('We couldn’t create the project. Check your connection and try again.')
  return data.id
}

/**
 * Full continue pipeline (testable with mocks).
 * Does not require Summary or other diary content fields.
 */
export async function runDiarySetupContinue({
  alreadySaving = false,
  form,
  existingProjects = [],
  selectedProjectId = NEW_PROJECT_SENTINEL,
  editingReportId = null,
  editingProjectId = null,
  getUser,
  persistProject,
  createDraft,
  updateDraft,
  writeExtras,
  clearFormDraft,
  navigate,
}) {
  if (alreadySaving) {
    return { ok: false, reason: 'busy', message: null, navigatedTo: null, reportId: null, projectId: null }
  }

  const validation = validateDiarySetupContinue(form)
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'validation',
      field: validation.field,
      message: validation.message,
      navigatedTo: null,
      reportId: null,
      projectId: null,
    }
  }

  const user = await getUser()
  if (!user) {
    return {
      ok: false,
      reason: 'auth',
      message: 'You must be signed in',
      navigatedTo: null,
      reportId: null,
      projectId: null,
    }
  }

  const plan = planProjectDatePersistence({
    selectedProjectId,
    existingProjects,
    projectName: form.projectName,
    startDate: form.startDate,
    plannedCompletionDate: form.plannedCompletionDate,
    projectAddress: form.projectAddress,
    projectManager: form.projectManager,
    workingDaysPerWeek: form.workingDaysPerWeek,
    currentPhase: form.currentPhase,
    projectReference: form.projectReference,
  })

  const projectId = await persistProject(plan)
  const fields = plan.fields || plan.dates || {}

  let reportId = editingReportId
  if (editingReportId) {
    await updateDraft({
      reportId: editingReportId,
      projectId: editingProjectId,
      fields: {
        projectId,
        reportDate: form.reportDate,
        creatorName: form.author,
        creatorRole: form.authorRole,
        shift: form.shift,
        companyReportingFor: form.reportingOnBehalfOf,
        brandLogoUrl: form.brandLogoUrl,
        brandingId: form.brandingId,
        brandColor: form.brandColor,
        ...(form.coverPhotoUrl !== undefined ? { coverPhotoUrl: form.coverPhotoUrl } : {}),
      },
    })
  } else {
    reportId = await createDraft({
      projectId,
      reportDate: form.reportDate,
      creatorName: form.author,
      creatorRole: form.authorRole,
      shift: form.shift,
      companyReportingFor: form.reportingOnBehalfOf,
      brandLogoUrl: form.brandLogoUrl,
      brandingId: form.brandingId,
      brandColor: form.brandColor,
    })
  }

  if (!reportId) {
    return {
      ok: false,
      reason: 'draft',
      message: 'We couldn’t open your Site Diary. Check your connection and try again.',
      navigatedTo: null,
      reportId: null,
      projectId,
    }
  }

  // Legacy browser extras mirror — project_reference on projects is source of truth.
  writeExtras?.(reportId, {
    projectReference: String(form.projectReference || '').trim(),
    projectName: String(form.projectName || '').trim(),
  })
  clearFormDraft?.()

  const href = diaryFormHref(projectId, reportId)
  await navigate(href)

  return {
    ok: true,
    reason: null,
    message: null,
    navigatedTo: href,
    reportId,
    projectId,
    start_date: fields.start_date,
    planned_completion_date: fields.planned_completion_date,
    site_address: fields.site_address,
    client_pm: fields.client_pm,
    working_days_per_week: fields.working_days_per_week,
    current_phase: fields.current_phase,
    project_reference: Object.prototype.hasOwnProperty.call(fields, 'project_reference')
      ? fields.project_reference
      : undefined,
  }
}
