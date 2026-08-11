/**
 * Site Diary Shift — protected report-level field (daily_reports.shift).
 * Setup UI: Day / Back / Night within Project Details (after author / company blocks).
 */

/** Product-approved shift options for Site Diary. */
export const SITE_DIARY_SHIFT_OPTIONS = ['Day', 'Back', 'Night']

export const DEFAULT_SITE_DIARY_SHIFT = 'Day'

/**
 * Approved setup field sequence markers (for UI order contracts).
 * Full label order is SETUP_UI_LABEL_SEQUENCE.
 */
export const SETUP_FIELD_SEQUENCE = [
  'reportingCompany',
  'reportingOnBehalfOf',
  'authorName',
  'authorRole',
  'projectDetails',
  'shift',
]

/**
 * Exact visible label order required on Site Diary setup (source / UI contract).
 * Locked hierarchy: Reporting Company → Reporting On Behalf Of → Author → Project Details.
 * Project Description / Weather omitted until approved on this screen.
 */
export const SETUP_SECTION_SEQUENCE = [
  'Reporting Company',
  'Reporting On Behalf Of',
  'Author',
  'Project Details',
]

export const SETUP_UI_LABEL_SEQUENCE = [
  'Reporting Company Name',
  'Reporting Company Logo',
  'Reporting On Behalf Of',
  'Author Name',
  'Author Role',
  'Project Name',
  'Project Address',
  'Project Manager',
  'Working Days per Week',
  'Current Phase',
  'Project Start Date',
  'Planned Completion Date',
  'Shift',
  'Project Reference',
  'Report Date',
]

/**
 * Assert setup page source contains labels in approved order (UI contract).
 * @param {string} source
 * @param {string[]} [labels]
 * @returns {{ ok: true } | { ok: false, missing?: string, outOfOrder?: string }}
 */
export function assertSetupUiLabelOrder(source, labels = SETUP_UI_LABEL_SEQUENCE) {
  if (!source || typeof source !== 'string') return { ok: false, missing: '(no source)' }
  let cursor = 0
  for (const label of labels) {
    const idx = source.indexOf(label, cursor)
    if (idx < 0) return { ok: false, missing: label }
    if (idx < cursor) return { ok: false, outOfOrder: label }
    cursor = idx + label.length
  }
  return { ok: true }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function hydrateShift(value) {
  if (value == null) return DEFAULT_SITE_DIARY_SHIFT
  const t = String(value).trim()
  return t || DEFAULT_SITE_DIARY_SHIFT
}

/**
 * Options for a <select>, including a legacy saved value if not in the approved list.
 * @param {unknown} current
 * @returns {string[]}
 */
export function shiftSelectOptions(current) {
  const opts = [...SITE_DIARY_SHIFT_OPTIONS]
  const cur = current == null ? '' : String(current).trim()
  if (cur && !opts.includes(cur)) opts.push(cur)
  return opts
}

/**
 * Value written to daily_reports.shift.
 * @param {unknown} value
 * @returns {string|null}
 */
export function shiftWriteValue(value) {
  if (value == null) return null
  const t = String(value).trim()
  return t || null
}

/**
 * True when a source string contains Shift UI with Day / Back / Night options
 * in the approved relative order (for page-source regression tests).
 * Locked hierarchy: Author precedes Project Details; Shift sits with Project Details
 * after programme dates.
 * @param {string} source
 */
export function setupSourceHasProtectedShiftUi(source) {
  if (!source || typeof source !== 'string') return false
  const dayOpt = /<option value="Day">Day<\/option>/.test(source)
  const backOpt = /<option value="Back">Back<\/option>/.test(source)
  const nightOpt = /<option value="Night">Night<\/option>/.test(source)
  const authorName = source.indexOf('Author Name')
  const authorRole = source.indexOf('Author Role')
  const projectName = source.indexOf('Project Name')
  const dates = source.indexOf('<ProjectDatesFields')
  const shift = source.indexOf('aria-label="Shift"')
  if (
    !dayOpt ||
    !backOpt ||
    !nightOpt ||
    authorName < 0 ||
    authorRole < 0 ||
    projectName < 0 ||
    dates < 0 ||
    shift < 0
  ) {
    return false
  }
  // Company/author block before project name; dates before Shift within Project Details.
  if (!(authorName < authorRole && authorRole < projectName && dates < shift && projectName < dates)) {
    return false
  }
  return true
}
