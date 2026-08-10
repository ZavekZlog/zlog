/**
 * Site Diary setup — Report Author fields (report-level, not project-level).
 * Reuses daily_reports.creator_name / creator_role (live schema already has both).
 */

/** Sticky + programme fields shown as Project Information before Report Author. */
export const SETUP_PROJECT_INFORMATION_ORDER = [
  'projectAddress',
  'projectManager',
  'workingDaysPerWeek',
  'currentPhase',
  // Project Description is not in the current projects schema — omitted until approved.
  'projectStartDate',
  'plannedCompletionDate',
]

/** Report Author block immediately after Shift (see SETUP_FIELD_SEQUENCE). */
export const SETUP_REPORT_AUTHOR_ORDER = [
  'authorName',
  'authorRole',
]

/**
 * Author Role is free text on the diary row — never written to public.projects.
 * @returns {'daily_reports.creator_role'}
 */
export function authorRoleColumn() {
  return 'daily_reports.creator_role'
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function authorRoleWriteValue(value) {
  if (value == null) return null
  const t = String(value).trim()
  return t || null
}

/**
 * Payload keys for create/update diary from setup (not projects columns).
 */
export function diaryAuthorWriteFields({ authorName = '', authorRole = '' } = {}) {
  return {
    creatorName: String(authorName || '').trim() || null,
    creatorRole: authorRoleWriteValue(authorRole),
  }
}

/**
 * Confirm projects write payloads never include author role.
 */
export function projectsPayloadExcludesAuthorRole(payload = {}) {
  const keys = Object.keys(payload || {})
  return !keys.some((k) => /creator_role|author_role|authorRole|creatorRole/i.test(k))
}
