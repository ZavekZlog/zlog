/**
 * Edit-existing diary hydration — Cover Photo + Project Reference.
 *
 * Canonical sources (never session draft / hard-coded defaults):
 * - Cover Photo     → daily_reports.cover_photo_url
 * - Project Reference → projects.project_reference (legacy report extras = fallback only)
 *
 * Used by “Project & Report Details” and diary “Edit This Diary” loaders.
 */

import { resolveProjectReference } from './project-sticky-fields.js'
import { coverPhotoStateFromSaved, normalizeCoverStoragePath } from './diary-cover-photo.js'
import { diaryEditHref } from './diary-view-mode.js'

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function coverStoragePathFromReport(report) {
  return normalizeCoverStoragePath(report?.cover_photo_url)
}

/**
 * Pure form values for edit-mode Cover + Project Reference.
 *
 * @param {{
 *   report?: Record<string, unknown>|null,
 *   projectRow?: Record<string, unknown>|null,
 *   reportExtras?: { projectReference?: string }|null,
 * }} [opts]
 * @returns {{
 *   coverStoragePath: string|null,
 *   projectReference: string,
 *   hasCover: boolean,
 *   hasProjectReference: boolean,
 * }}
 */
export function hydrateEditModeCoverAndReference({
  report = null,
  projectRow = null,
  reportExtras = null,
} = {}) {
  const coverStoragePath = coverStoragePathFromReport(report)
  const projectReference = resolveProjectReference({
    projectRow,
    reportExtras,
  })
  return {
    coverStoragePath,
    projectReference,
    hasCover: Boolean(coverStoragePath),
    hasProjectReference: Boolean(projectReference),
  }
}

/**
 * Immediate UI cover state from a saved report (preview may be filled async).
 * Ensures edit forms never start as “empty upload” when a path exists.
 */
export function coverFormStateFromReport(report, previewUrl = null) {
  const path = coverStoragePathFromReport(report)
  return coverPhotoStateFromSaved(path, previewUrl)
}

/**
 * Edit This Diary keeps the same report; setup details use projectAndReportDetailsHref.
 */
export function editThisDiaryHref(projectId, reportId) {
  return diaryEditHref(projectId, reportId)
}

/**
 * Journey D — new diary must not inherit prior cover; Project Reference may.
 */
export function newDiaryInheritsFromProject({
  projectReference = '',
  coverStoragePath = null,
} = {}) {
  return {
    projectReference: String(projectReference || '').trim(),
    coverStoragePath: null,
    // Explicit: cover must stay null for a new diary even if a prior path was passed.
    rejectedCover: coverStoragePath || null,
  }
}

/**
 * Columns for a resilient project hydrate select (sticky + identity).
 * Prefer full sticky list; callers may fall back if project_reference is unavailable.
 */
export function projectHydrateSelectColumns({ includeProjectReference = true } = {}) {
  const sticky = includeProjectReference
    ? 'site_address, client_pm, working_days_per_week, project_reference'
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
 * Fetch a project row for edit hydrate. Retries without project_reference when
 * PostgREST schema cache has not picked up the additive column yet.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 */
export async function fetchProjectRowForEditHydrate(supabase, projectId) {
  if (!projectId) return null
  const full = await supabase
    .from('projects')
    .select(projectHydrateSelectColumns({ includeProjectReference: true }))
    .eq('id', projectId)
    .maybeSingle()

  if (!full.error) return full.data || null

  const msg = full.error.message || ''
  if (/project_reference/i.test(msg) || /column/i.test(msg)) {
    const fallback = await supabase
      .from('projects')
      .select(projectHydrateSelectColumns({ includeProjectReference: false }))
      .eq('id', projectId)
      .maybeSingle()
    if (fallback.error) return null
    return fallback.data || null
  }

  return null
}

/**
 * Load report + project for Project & Report Details / edit-mode hydrate.
 * If `project` query param is missing, derives project_id from the report row.
 */
export async function loadEditDiarySetupSources(supabase, {
  reportId,
  projectId = null,
  readExtras = null,
} = {}) {
  if (!reportId) {
    return {
      ok: false,
      reason: 'missing-report-id',
      report: null,
      project: null,
      extras: null,
      hydration: hydrateEditModeCoverAndReference({}),
    }
  }

  let reportQuery = supabase
    .from('daily_reports')
    .select('*')
    .eq('id', reportId)

  if (projectId) {
    reportQuery = reportQuery.eq('project_id', projectId)
  }

  const { data: report, error: reportError } = await reportQuery.maybeSingle()
  if (reportError) {
    return {
      ok: false,
      reason: 'report-error',
      message: reportError.message,
      report: null,
      project: null,
      extras: null,
      hydration: hydrateEditModeCoverAndReference({}),
    }
  }
  if (!report) {
    return {
      ok: false,
      reason: 'report-not-found',
      report: null,
      project: null,
      extras: null,
      hydration: hydrateEditModeCoverAndReference({}),
    }
  }

  const resolvedProjectId = projectId || report.project_id || null
  const project = resolvedProjectId
    ? await fetchProjectRowForEditHydrate(supabase, resolvedProjectId)
    : null

  const extras = typeof readExtras === 'function' ? readExtras(reportId) : null
  const hydration = hydrateEditModeCoverAndReference({
    report,
    projectRow: project,
    reportExtras: extras,
  })

  return {
    ok: true,
    reason: null,
    report,
    project,
    projectId: resolvedProjectId,
    extras,
    hydration,
  }
}

/** Safety net so signed-URL / PostgREST hangs cannot leave the workbench on Loading. */
export const DIARY_WORKBENCH_LOAD_TIMEOUT_MS = 15000
export const DIARY_PREVIEW_URL_TIMEOUT_MS = 5000

export const DIARY_WORKBENCH_LOAD_FAILED_COPY =
  'We couldn’t open this Site Diary. Go back to Saved Diaries and try again.'

/**
 * User-facing load failure plus a dev diagnostic. Never leave an infinite Loading screen.
 */
export function describeDiaryWorkbenchLoadFailure({
  stage = 'load',
  reportId = null,
  projectId = null,
  error = null,
} = {}) {
  const message = error?.message || String(error || 'unknown')
  const code = error?.code ? ` code=${error.code}` : ''
  return {
    userMessage: DIARY_WORKBENCH_LOAD_FAILED_COPY,
    diagnostic: `[zlog:diary-load] stage=${stage} report=${reportId || 'none'} project=${projectId || 'none'}${code} ${message}`,
  }
}

/** Latest in-flight load owns loading/error state; cancelled generations must not clear it. */
export function shouldCommitDiaryLoadState({
  cancelled = false,
  generation = 0,
  activeGeneration = 0,
} = {}) {
  return !cancelled && generation === activeGeneration
}

/**
 * Reject if `promise` does not settle in `ms`. The original work may still finish later.
 */
export function withTimeout(promise, ms, label = 'timed out') {
  const timeoutMs = Number(ms)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.resolve(promise)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label))
    }, timeoutMs)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
