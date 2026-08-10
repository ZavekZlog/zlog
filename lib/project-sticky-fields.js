/**
 * Sticky project information (Phase 1) — project-level, not diary fields.
 *
 * Columns:
 * - site_address          → Project Address (existing)
 * - client_pm             → Project Manager (UI); DB column name unchanged
 * - working_days_per_week → Working Days Per Week (1–7)
 * - current_phase         → Current Phase
 *
 * Programme dates remain owned by project-day / setup-date helpers.
 */

/** @typedef {{
 *   projectAddress: string,
 *   projectManager: string,
 *   workingDaysPerWeek: string,
 *   currentPhase: string,
 * }} StickyFormFields */

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: number|null } | { ok: false, message: string, value?: undefined }}
 */
export function validateWorkingDaysPerWeek(value) {
  if (value == null || value === '') {
    return { ok: true, value: null }
  }
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      message: 'Working Days Per Week must be a whole number between 1 and 7.',
    }
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    return {
      ok: false,
      message: 'Working Days Per Week must be a whole number between 1 and 7.',
    }
  }
  return { ok: true, value: n }
}

/**
 * Validate sticky fields (dates validated separately).
 * @returns {{ ok: true } | { ok: false, message: string, field: 'workingDays' }}
 */
export function validateStickyProjectFields({ workingDaysPerWeek = '' } = {}) {
  const days = validateWorkingDaysPerWeek(workingDaysPerWeek)
  if (!days.ok) {
    return { ok: false, field: 'workingDays', message: days.message }
  }
  return { ok: true }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toTextInputValue(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function toTextColumnValue(value) {
  const t = toTextInputValue(value)
  return t || null
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toWorkingDaysInputValue(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 7) return ''
  return String(n)
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function toWorkingDaysColumnValue(value) {
  const v = validateWorkingDaysPerWeek(value)
  return v.ok ? v.value : null
}

/**
 * Empty sticky form values (New Project selection).
 * @returns {StickyFormFields}
 */
export function emptyStickyFormFields() {
  return {
    projectAddress: '',
    projectManager: '',
    workingDaysPerWeek: '',
    currentPhase: '',
  }
}

/**
 * Map a projects row into sticky form inputs.
 * @param {Record<string, unknown> | null | undefined} project
 * @returns {StickyFormFields}
 */
export function hydrateStickyFromRow(project) {
  return {
    projectAddress: toTextInputValue(project?.site_address),
    projectManager: toTextInputValue(project?.client_pm),
    workingDaysPerWeek: toWorkingDaysInputValue(project?.working_days_per_week),
    currentPhase: toTextInputValue(project?.current_phase),
  }
}

/**
 * Columns written on projects insert/update for sticky fields.
 * @param {Partial<StickyFormFields>} fields
 */
export function stickyWritePayload(fields = {}) {
  return {
    site_address: toTextColumnValue(fields.projectAddress),
    client_pm: toTextColumnValue(fields.projectManager),
    working_days_per_week: toWorkingDaysColumnValue(fields.workingDaysPerWeek),
    current_phase: toTextColumnValue(fields.currentPhase),
  }
}

/**
 * Compare sticky write payload to a stored projects row.
 */
export function stickyFieldsMatchRow(payload, project) {
  const stored = stickyWritePayload(hydrateStickyFromRow(project))
  return (
    stored.site_address === (payload.site_address ?? null)
    && stored.client_pm === (payload.client_pm ?? null)
    && stored.working_days_per_week === (payload.working_days_per_week ?? null)
    && stored.current_phase === (payload.current_phase ?? null)
  )
}

/**
 * Whether any sticky column is non-empty in the write payload.
 */
export function stickyPayloadHasValues(payload) {
  return Boolean(
    payload?.site_address
    || payload?.client_pm
    || payload?.working_days_per_week != null
    || payload?.current_phase,
  )
}

/** Explicit sticky (+ identity) columns for project selects. */
export function stickyProjectSelectColumns() {
  return 'site_address, client_pm, working_days_per_week, current_phase'
}
