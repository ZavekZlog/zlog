/**
 * Project Day — calendar-day programme time (shared utility).
 *
 * Rules (initial version):
 * - Project Start Date = Project Day 1
 * - Total planned days = inclusive calendar days from start to planned completion
 * - Current Project Day = inclusive calendar days from start to report/current date
 * - Date-only (YYYY-MM-DD); UTC noon math avoided — use UTC date components only
 *
 * Not physical % complete, construction progress, or programme performance.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * @param {unknown} value
 * @returns {{ y: number, m: number, d: number } | null}
 */
export function parseDateOnly(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim().slice(0, 10)
  const match = DATE_ONLY.exec(raw)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  // Reject impossible calendar dates (e.g. 2023-02-29)
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (
    probe.getUTCFullYear() !== y
    || probe.getUTCMonth() !== m - 1
    || probe.getUTCDate() !== d
  ) {
    return null
  }
  return { y, m, d }
}

/**
 * @param {{ y: number, m: number, d: number }} parts
 * @returns {string}
 */
export function formatDateOnly(parts) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`
}

/**
 * Normalize a stored/API date for `<input type="date">` (YYYY-MM-DD or '').
 * Accepts date-only strings and ISO timestamps (uses the calendar date prefix).
 * @param {unknown} value
 * @returns {string}
 */
export function toDateInputValue(value) {
  if (value == null || value === '') return ''
  const parsed = parseDateOnly(value)
  return parsed ? formatDateOnly(parsed) : ''
}

/**
 * Normalize a date for writing to `projects.start_date` / `planned_completion_date`.
 * @param {unknown} value
 * @returns {string|null}
 */
export function toDateColumnValue(value) {
  return toDateInputValue(value) || null
}

/**
 * Signed whole calendar days from `from` to `to` (to − from), not inclusive.
 * @param {{ y: number, m: number, d: number }} from
 * @param {{ y: number, m: number, d: number }} to
 */
export function calendarDaysBetween(from, to) {
  const a = Date.UTC(from.y, from.m - 1, from.d)
  const b = Date.UTC(to.y, to.m - 1, to.d)
  return Math.round((b - a) / 86400000)
}

/**
 * Inclusive day count from start through end (start = day 1 of the span).
 */
export function inclusiveCalendarDays(start, end) {
  return calendarDaysBetween(start, end) + 1
}

/**
 * @param {string} wordSingular
 * @param {number} n
 */
export function pluralDays(n, wordSingular = 'day') {
  const abs = Math.abs(Number(n))
  return abs === 1 ? `${abs} ${wordSingular}` : `${abs} ${wordSingular}s`
}

/**
 * Validate project dates. Does not mutate inputs.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateProjectDates(startDate, plannedCompletionDate) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(plannedCompletionDate)
  if (start && end && calendarDaysBetween(start, end) < 0) {
    return {
      ok: false,
      message: 'Planned Completion Date cannot be earlier than Project Start Date.',
    }
  }
  return { ok: true }
}

/**
 * @typedef {object} ProjectDayResult
 * @property {'missing'|'invalid_range'|'before_start'|'in_progress'|'beyond'} status
 * @property {string|null} startDate
 * @property {string|null} plannedCompletionDate
 * @property {string|null} asOfDate
 * @property {number|null} totalDays
 * @property {number|null} currentDay
 * @property {number|null} plannedDaysRemaining
 * @property {number|null} daysUntilStart
 * @property {number|null} daysBeyond
 * @property {string} headline
 * @property {string|null} detail
 * @property {string[]} lines
 */

/**
 * Compute Project Day display state for a report/current date.
 *
 * @param {object} opts
 * @param {string|null|undefined} opts.startDate
 * @param {string|null|undefined} opts.plannedCompletionDate
 * @param {string|null|undefined} [opts.asOfDate] — report or “today” (YYYY-MM-DD)
 * @returns {ProjectDayResult}
 */
export function computeProjectDay({
  startDate = null,
  plannedCompletionDate = null,
  asOfDate = null,
} = {}) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(plannedCompletionDate)
  const asOf = parseDateOnly(asOfDate) || parseDateOnly(todayDateOnly())

  const base = {
    startDate: start ? formatDateOnly(start) : null,
    plannedCompletionDate: end ? formatDateOnly(end) : null,
    asOfDate: asOf ? formatDateOnly(asOf) : null,
    totalDays: null,
    currentDay: null,
    plannedDaysRemaining: null,
    daysUntilStart: null,
    daysBeyond: null,
    detail: null,
  }

  if (!start || !end) {
    return {
      ...base,
      status: 'missing',
      headline: 'Project dates not set',
      lines: ['Project dates not set'],
    }
  }

  const rangeCheck = validateProjectDates(formatDateOnly(start), formatDateOnly(end))
  if (!rangeCheck.ok) {
    return {
      ...base,
      status: 'invalid_range',
      headline: rangeCheck.message,
      lines: [rangeCheck.message],
    }
  }

  const totalDays = inclusiveCalendarDays(start, end)
  const currentDay = inclusiveCalendarDays(start, asOf)

  if (currentDay < 1) {
    const daysUntilStart = calendarDaysBetween(asOf, start)
    return {
      ...base,
      status: 'before_start',
      totalDays,
      currentDay: null,
      plannedDaysRemaining: totalDays,
      daysUntilStart,
      headline: `Project starts in ${pluralDays(daysUntilStart)}`,
      lines: [`Project starts in ${pluralDays(daysUntilStart)}`],
    }
  }

  if (currentDay > totalDays) {
    const daysBeyond = currentDay - totalDays
    return {
      ...base,
      status: 'beyond',
      totalDays,
      currentDay,
      plannedDaysRemaining: 0,
      daysBeyond,
      headline: `Project Day: ${currentDay} of ${totalDays}`,
      detail: `${pluralDays(daysBeyond)} beyond planned completion`,
      lines: [
        `Project Day: ${currentDay} of ${totalDays}`,
        `${pluralDays(daysBeyond)} beyond planned completion`,
      ],
    }
  }

  const plannedDaysRemaining = totalDays - currentDay
  return {
    ...base,
    status: 'in_progress',
    totalDays,
    currentDay,
    plannedDaysRemaining,
    headline: `Project Day: ${currentDay} of ${totalDays}`,
    lines: [`Project Day: ${currentDay} of ${totalDays}`],
  }
}

/** Local calendar YYYY-MM-DD without UTC shift from toISOString(). */
export function todayDateOnly(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  return formatDateOnly({ y, m, d })
}

/**
 * Format a stored date-only string for display (en-GB), timezone-safe.
 * @param {string|null|undefined} value
 */
export function formatProjectDateDisplay(value) {
  const parts = parseDateOnly(value)
  if (!parts) return '—'
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
