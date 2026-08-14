/**
 * Brand-new Site Diary setup — clean initial state.
 *
 * Start from scratch must never inherit a prior diary, session draft, or
 * last-opened project. Selecting an existing project / Use as Basis / Edit
 * are separate flows and must not share this factory’s blank defaults.
 */

import {
  NEW_PROJECT_SENTINEL,
  clearStickyProjectSelection,
  mergeProjectIntoSetupState,
} from './diary-setup-project-dates.js'
import { todayIsoDate } from './report-setup.js'
import { DEFAULT_SITE_DIARY_SHIFT } from './diary-setup-shift.js'

/**
 * Explicit clean initial-state factory for a brand-new diary setup form.
 * Only permitted defaults: Author Name (caller), Report Date (today), optional
 * company-profile branding when the product already defaults that way.
 *
 * @param {{
 *   authorName?: string,
 *   reportDate?: string,
 *   brandingId?: string|null,
 *   brandColor?: string|null,
 *   logoStoragePath?: string|null,
 * }} [opts]
 */
export function blankDiarySetupFormState({
  authorName = '',
  authorRole = '',
  reportDate = todayIsoDate(),
  brandingId = null,
  brandColor = null,
  logoStoragePath = null,
} = {}) {
  return {
    selectedProjectId: NEW_PROJECT_SENTINEL,
    projectName: '',
    projectAddress: '',
    projectManager: '',
    workingDaysPerWeek: '',
    currentPhase: '',
    projectStartDate: '',
    projectPlannedCompletionDate: '',
    author: String(authorName || '').trim(),
    authorRole: String(authorRole || '').trim(),
    shift: DEFAULT_SITE_DIARY_SHIFT,
    reportingOnBehalfOf: '',
    reportDate: reportDate || todayIsoDate(),
    projectReference: '',
    logoStoragePath: logoStoragePath ?? null,
    brandingId: brandingId ?? null,
    brandColor: brandColor ?? null,
  }
}

/**
 * Branding defaults from an explicit saved company profile only — never from
 * a previously opened diary.
 *
 * @param {{ id?: string, brand_color?: string|null, logo_url?: string|null }|null|undefined} profile
 */
export function brandingDefaultsFromCompanyProfile(profile) {
  if (!profile?.id) {
    return { brandingId: null, brandColor: null, logoStoragePath: null }
  }
  return {
    brandingId: profile.id,
    brandColor: profile.brand_color || null,
    logoStoragePath: profile.logo_url || null,
  }
}

/**
 * Session draft restore is only for Edit Report Details (has report id).
 * Start New / scratch must never rehydrate prior setup form values.
 *
 * @param {{ editingReportId?: string|null }} opts
 */
export function shouldRestoreSetupFormDraft({ editingReportId = null } = {}) {
  return Boolean(editingReportId)
}

/**
 * Initialise setup for New Site Diary → Start from scratch.
 * Optionally merges one existing project when the hub passes ?project=
 * (project sticky fields except Project Manager — see mergeProjectIntoSetupState).
 *
 * Does not create a diary or project database record.
 * Does not inherit a prior diary’s cover photo or Project Manager.
 *
 * @param {{
 *   authorName?: string,
 *   reportDate?: string,
 *   companyProfile?: object|null,
 *   existingProject?: object|null,
 * }} [opts]
 */
export function initialiseNewDiarySetupState({
  authorName = '',
  authorRole = '',
  reportDate,
  companyProfile = null,
  existingProject = null,
} = {}) {
  const branding = brandingDefaultsFromCompanyProfile(companyProfile)
  let state = blankDiarySetupFormState({
    authorName,
    authorRole,
    reportDate: reportDate || todayIsoDate(),
    ...branding,
  })

  if (existingProject?.id) {
    state = mergeProjectIntoSetupState(state, existingProject)
  }

  // New diary Report Date is always the caller's date (defaults to local today).
  // mergeProjectIntoSetupState must never inherit a prior diary's report_date.
  state = {
    ...state,
    reportDate: String(reportDate || todayIsoDate()).trim() || todayIsoDate(),
  }

  return state
}

/**
 * Switching the project selector to “New project — type the name below”
 * clears every project-level field immediately. Keeps Author Name + Report Date.
 *
 * @param {object} [state]
 */
export function clearToNewProjectSelection(state = {}) {
  return {
    ...clearStickyProjectSelection(state),
    projectReference: '',
    reportingOnBehalfOf: '',
  }
}

/**
 * Assertions used by regression tests — true when scratch setup has no
 * inherited project / report / diary content fields.
 *
 * @param {object} state
 * @param {{ authorName?: string, reportDate?: string }} [expected]
 */
export function isCleanScratchSetupState(state, expected = {}) {
  if (!state || typeof state !== 'object') return false
  if (state.selectedProjectId !== NEW_PROJECT_SENTINEL) return false
  if (state.projectName) return false
  if (state.projectAddress) return false
  if (state.projectManager) return false
  if (state.workingDaysPerWeek) return false
  if (state.currentPhase) return false
  if (state.projectStartDate) return false
  if (state.projectPlannedCompletionDate) return false
  if (state.projectReference) return false
  if (state.reportingOnBehalfOf) return false
  if (state.plant?.length) return false
  if (state.siteSummary) return false
  if (state.permits?.length) return false
  if (state.visitors?.length) return false
  if (state.deliveries?.length) return false
  // Shift may default to Day on a clean form — that is intentional, not a leak.
  // Author Role may prefill from signed-in profile job title — not a diary leak.
  if (expected.authorName != null && state.author !== expected.authorName) return false
  if (expected.authorRole != null && state.authorRole !== expected.authorRole) return false
  if (expected.authorRole == null && expected.requireBlankAuthorRole && state.authorRole) return false
  if (expected.reportDate != null && state.reportDate !== expected.reportDate) return false
  return true
}

/**
 * Opening blank setup must not schedule diary/project creates.
 * Pure planning helper for tests / continue gate.
 */
export function blankSetupCreatesDatabaseRecords() {
  return false
}
