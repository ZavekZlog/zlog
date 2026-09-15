/**
 * Date-filtered labour aggregation from site sign-in register records.
 *
 * Sign-in shape (flexible field names supported):
 *   { work_date|date, trade, company|subcontractor,
 *     signed_in_at|time_in, signed_out_at|time_out, person_name }
 * Hours are always calculated in app code from sign-in/out — never from OCR.
 */

import { toReportingTradeCategory, detailedTradeOccupationFromRow } from './construction-trade-reporting-category.js'

/** Normalize any date-ish value to YYYY-MM-DD (local calendar day when given a Date/ISO string). */
export function toDateKey(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const raw = value.trim()
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    if (iso) return iso[1]

    // UK / EU: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
    if (dmy) {
      let [, dd, mm, yyyy] = dmy
      if (yyyy.length === 2) yyyy = `20${yyyy}`
      const day = String(dd).padStart(2, '0')
      const month = String(mm).padStart(2, '0')
      if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
        return `${yyyy}-${month}-${day}`
      }
    }

    // "23 Jul 2026" / "23 July 2026"
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return toDateKeyFromDate(parsed)
    return ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateKeyFromDate(value)
  }
  return ''
}

function toDateKeyFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function recordWorkDate(record) {
  if (!record || typeof record !== 'object') return ''
  return toDateKey(record.work_date ?? record.date ?? record.signed_in_at ?? record.signin_at)
}

/**
 * Hours for one sign-in row.
 * ALWAYS derived in application code from sign-in / sign-out times.
 * Never trust an OCR/AI-supplied hours value.
 */
export function parseClockToMinutes(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Decimal hours as absolute? treat as invalid for clock parse
    return null
  }
  const raw = String(value).trim()
  // Full ISO / datetime — use time portion in local interpretation via Date
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes('T')) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes()
    }
  }
  // 24h clock: 7:00, 07:00, 07.00, 700 (rare)
  const m = raw.match(/^(\d{1,2})[:.](\d{2})(?:\s*(?:am|pm))?$/i)
    || raw.match(/^(\d{1,2})(\d{2})$/)
  if (!m) return null
  let hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59) return null
  const ampm = raw.match(/\b(am|pm)\b/i)
  if (ampm) {
    const ap = ampm[1].toLowerCase()
    if (ap === 'pm' && hh < 12) hh += 12
    if (ap === 'am' && hh === 12) hh = 0
  }
  if (hh < 0 || hh > 23) return null
  return hh * 60 + mm
}

/**
 * Deterministic hours on site from sign-in and sign-out.
 * Supports mixed handwritten afternoon clocks (4:00 meaning 16:00) per row,
 * and genuine overnight (22:00 → 06:00).
 * Never invents hours. No break deduction.
 * Returns null if either time is missing/ambiguous.
 */
export function hoursFromSignInOut(signedIn, signedOut) {
  const inMin = parseClockToMinutes(signedIn)
  const outMin = parseClockToMinutes(signedOut)
  if (inMin == null || outMin == null) return null

  let resolvedOut = outMin
  if (outMin < inMin) {
    // Ambiguous 12-hour-style afternoon (e.g. 4:00 / 4:15) written without PM/16:.
    // Prefer same-day +12h when that lands after sign-in; otherwise overnight.
    const outHour = Math.floor(outMin / 60)
    if (outHour >= 1 && outHour <= 11) {
      const pmCandidate = outMin + 12 * 60
      if (pmCandidate > inMin) {
        resolvedOut = pmCandidate
      } else {
        resolvedOut = outMin + 24 * 60
      }
    } else {
      resolvedOut = outMin + 24 * 60
    }
  }

  const diff = resolvedOut - inMin
  if (diff <= 0) return null
  return Math.round((diff / 60) * 100) / 100
}

/**
 * True when both Time In and Time Out are blank/absent.
 * Such rows cannot contribute labour hours and must not poison Trade + Hours.
 * @param {object|null|undefined} row
 */
export function isSignInBothClocksAbsent(row) {
  if (!row || typeof row !== 'object') return true
  const timeIn = String(row.time_in ?? row.signed_in_at ?? row.signin_at ?? '').trim()
  const timeOut = String(row.time_out ?? row.signed_out_at ?? row.signout_at ?? '').trim()
  return !timeIn && !timeOut
}

export function signInHours(record) {
  if (!record) return 0
  const inn = record.signed_in_at || record.signin_at || record.time_in
  const out = record.signed_out_at || record.signout_at || record.time_out
  const calculated = hoursFromSignInOut(inn, out)
  return calculated == null ? 0 : calculated
}

/**
 * STRICT date filter — only records whose work date equals reportDate (YYYY-MM-DD).
 * Ignores previous and future dates. Prefer review UI over silent discard.
 */
export function filterSignInsByReportDate(signIns, reportDate) {
  const target = toDateKey(reportDate)
  if (!target) return []
  return (Array.isArray(signIns) ? signIns : []).filter((row) => recordWorkDate(row) === target)
}

/** Classify row date vs report date for review UI. */
export function dateStatusForReport(record, reportDate) {
  const target = toDateKey(reportDate)
  const key = recordWorkDate(record)
  if (!key) return 'missing'
  if (!target) return 'missing'
  return key === target ? 'match' : 'other'
}

/**
 * Per-operative review rows — never merge people, never drop rows.
 * Hours always recalculated from time_in / time_out.
 */
export function operativeReviewFromSignIns(signIns, reportDate) {
  const list = Array.isArray(signIns) ? signIns : []
  return list.map((record, index) => {
    const timeIn = record.signed_in_at || record.signin_at || record.time_in || null
    const timeOut = record.signed_out_at || record.signout_at || record.time_out || null
    const hours = hoursFromSignInOut(timeIn, timeOut)
    const dateStatus = dateStatusForReport(record, reportDate)
    return {
      id: record.id || `op-${index}`,
      person_name: String(record.person_name ?? record.name ?? '').trim() || null,
      trade: String(record.trade ?? '').trim() || null,
      company: String(record.company ?? record.subcontractor ?? '').trim() || null,
      work_date: recordWorkDate(record) || null,
      time_in: timeIn ? String(timeIn).trim() : null,
      time_out: timeOut ? String(timeOut).trim() : null,
      hours,
      dateStatus,
      source_row: Number.isFinite(Number(record.source_row)) ? Number(record.source_row) : null,
      // Include match + missing-date by default; other dates need explicit confirm
      included: dateStatus !== 'other',
    }
  })
}

/** Rebuild labour summary rows from included review operatives. */
export function labourRowsFromOperatives(operatives, { groupBy = 'trade_company', makeKey } = {}) {
  const included = (Array.isArray(operatives) ? operatives : []).filter((o) => o?.included !== false)
  const asSignIns = included.map((o) => ({
    trade: o.trade,
    company: o.company,
    signed_in_at: o.time_in,
    signed_out_at: o.time_out,
  }))
  return labourRowsFromRegister(asSignIns, null, { groupBy, makeKey })
}

function groupKey(record, groupBy) {
  const trade = String(record?.trade ?? '').trim() || 'Unspecified trade'
  const company = String(record?.company ?? record?.subcontractor ?? '').trim() || 'Unspecified company'
  if (groupBy === 'trade') return { key: `t:${trade.toLowerCase()}`, trade, company: '' }
  if (groupBy === 'company') return { key: `c:${company.toLowerCase()}`, trade: '', company }
  return { key: `tc:${trade.toLowerCase()}|${company.toLowerCase()}`, trade, company }
}

/**
 * Aggregate filtered sign-ins into labour summary rows.
 * @param {object[]} signIns — already date-filtered (or will be filtered if reportDate passed)
 * @param {{ groupBy?: 'trade'|'company'|'trade_company', reportDate?: string }} options
 * @returns {{ trade: string, company: string, headcount: number, hours: number, notes: string }[]}
 */
export function aggregateLabourFromSignIns(signIns, options = {}) {
  const groupBy = options.groupBy || 'trade_company'
  const rows = options.reportDate
    ? filterSignInsByReportDate(signIns, options.reportDate)
    : (Array.isArray(signIns) ? signIns : [])

  const map = new Map()
  for (const record of rows) {
    const { key, trade, company } = groupKey(record, groupBy)
    const hours = signInHours(record)
    const existing = map.get(key)
    if (existing) {
      existing.headcount += 1
      existing.hours = Math.round((existing.hours + hours) * 100) / 100
    } else {
      map.set(key, {
        trade,
        company,
        headcount: 1,
        hours: Math.round(hours * 100) / 100,
        notes: '',
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const t = a.trade.localeCompare(b.trade)
    if (t !== 0) return t
    return a.company.localeCompare(b.company)
  })
}

/**
 * Build diary labour row objects from register data for a single report date.
 * @param {() => string} makeKey — uuid factory for row keys
 */
export function labourRowsFromRegister(signIns, reportDate, { groupBy = 'trade_company', makeKey } = {}) {
  const aggregated = aggregateLabourFromSignIns(signIns, { reportDate, groupBy })
  const keyFn = typeof makeKey === 'function' ? makeKey : () => `${Date.now()}-${Math.random()}`
  return aggregated.map((row) => ({
    key: keyFn(),
    trade: row.trade,
    company: row.company,
    headcount: row.headcount != null && row.headcount !== '' ? String(row.headcount) : '',
    hours: row.hours != null && row.hours !== '' ? String(row.hours) : '',
    notes: row.notes || '',
  }))
}

/**
 * Persist mapping from the Site Manager's reviewed Trade + Workers + Hours draft.
 * Does not read operative names, company, or break/net helpers.
 * Incomplete hours stay empty (persist as null) — never 0.
 *
 * @param {unknown[]} reviewRows
 * @param {{ makeKey?: () => string }} [options]
 */
export function labourRowsFromTradeHoursReview(reviewRows, { makeKey } = {}) {
  const list = Array.isArray(reviewRows) ? reviewRows : []
  const keyFn = typeof makeKey === 'function' ? makeKey : () => `${Date.now()}-${Math.random()}`
  return list
    .filter((row) => row && String(row.trade || '').trim())
    .map((row) => {
      const workers = Number(row.workers)
      const hoursComplete = row.hoursComplete === true
      const hoursNum = Number(row.hours)
      return {
        key: keyFn(),
        trade: String(row.trade).trim(),
        company: '',
        headcount:
          Number.isFinite(workers) && workers >= 0 ? String(Math.trunc(workers)) : '',
        hours:
          hoursComplete && row.hours != null && Number.isFinite(hoursNum) && hoursNum >= 0
            ? String(hoursNum)
            : '',
        notes: '',
      }
    })
}

/**
 * Apply reviewed Trade / Workers / Hours into labour-summary form rows.
 * @param {unknown[]} reviewRows
 * @param {{ makeKey?: () => string }} [options]
 */
export function applyTradeHoursReviewToLabourSummary(reviewRows, { makeKey } = {}) {
  const list = Array.isArray(reviewRows) ? reviewRows : []
  if (list.length === 0) {
    return {
      ok: false,
      reason: 'none-selected',
      message: 'Add at least one trade, then tap Apply to add them to the Labour Attendance Summary.',
      rows: [],
    }
  }
  const unresolved = list.filter((row) => tradeHoursReviewRowNeedsResolution(row))
  if (unresolved.length > 0) {
    return {
      ok: false,
      reason: 'needs-review',
      message:
        'Resolve every trade and hours marked for review before applying to the Labour Attendance Summary.',
      rows: [],
      unresolvedCount: unresolved.length,
    }
  }
  const rows = labourRowsFromTradeHoursReview(list, { makeKey })
  if (!rows.length) {
    return {
      ok: false,
      reason: 'empty-aggregate',
      message: 'Those rows could not be added to the Labour Attendance Summary. Check each trade, then try again.',
      rows: [],
    }
  }
  const totals = labourAggregateTotals(rows)
  return {
    ok: true,
    reason: 'applied',
    rows,
    includedCount: rows.length,
    totals: {
      ...totals,
      workers: totals.operatives,
    },
  }
}

export function applyOperativesToLabourSummary(operatives, { groupBy = 'trade_company', makeKey } = {}) {
  const list = Array.isArray(operatives) ? operatives : []
  const included = list.filter((row) => row?.included !== false)
  if (included.length === 0) {
    return {
      ok: false,
      reason: 'none-selected',
      message: 'Select at least one operative, then tap Apply to add them to the Labour Attendance Summary.',
      rows: [],
    }
  }
  const rows = labourRowsFromOperatives(included, { groupBy, makeKey })
  if (!rows.length) {
    return {
      ok: false,
      reason: 'empty-aggregate',
      message: 'Those rows could not be added to the Labour Attendance Summary. Check trade, company, and time in and time out on the register, then try again.',
      rows: [],
    }
  }
  return {
    ok: true,
    reason: 'applied',
    rows,
    includedCount: included.length,
    totals: labourAggregateTotals(rows),
  }
}

/** Totals for preview banners / PDF footers */
export function labourAggregateTotals(rows) {
  const list = Array.isArray(rows) ? rows : []
  let operatives = 0
  let hours = 0
  for (const row of list) {
    const hc = Number(row.headcount ?? row.count ?? 0)
    const h = Number(row.hours ?? 0)
    if (Number.isFinite(hc)) operatives += hc
    if (Number.isFinite(h)) hours += h
  }
  return {
    operatives,
    hours: Math.round(hours * 100) / 100,
    lines: list.length,
  }
}

/** User-facing label when company cannot be read reliably. */
export const SIGNIN_ILLEGIBLE_COMPANY_LABEL = 'Illegible / needs review'

/** User-facing label when trade cannot be read reliably. */
export const SIGNIN_ILLEGIBLE_TRADE_LABEL = 'Illegible / needs review'

/** Internal aggregate key for uncertain trade buckets. */
export const SIGNIN_ILLEGIBLE_TRADE_KEY = '__illegible_trade__'

/**
 * True when a Trade + Hours review row must not be applied to report_labour yet.
 * @param {object|null|undefined} row
 */
export function tradeHoursReviewRowNeedsResolution(row) {
  if (!row || typeof row !== 'object') return false
  if (row.needsReview === true) return true
  if (String(row.key || '') === SIGNIN_ILLEGIBLE_TRADE_KEY) return true
  if (String(row.trade || '').trim() === SIGNIN_ILLEGIBLE_TRADE_LABEL) return true
  return false
}

/**
 * Count resolved vs unresolved review rows (date-mismatch operatives are never in this list).
 * @param {unknown[]} reviewRows
 * @returns {{ resolvedTradeCount: number, needsReviewCount: number }}
 */
export function countSignInTradeHoursReviewRows(reviewRows = []) {
  const list = Array.isArray(reviewRows) ? reviewRows : []
  let needsReviewCount = 0
  for (const row of list) {
    if (tradeHoursReviewRowNeedsResolution(row)) needsReviewCount += 1
  }
  return {
    resolvedTradeCount: list.length - needsReviewCount,
    needsReviewCount,
  }
}

/**
 * Hours on site for one operative row = elapsed time_in → time_out.
 * No break deduction. Returns null when times are insufficient — never invents hours.
 * @param {object} row
 * @returns {number|null}
 */
export function hoursOnSiteForSignInRow(row) {
  if (!row || typeof row !== 'object') return null
  return hoursFromSignInOut(row.time_in, row.time_out)
}

/**
 * Trade key/label for Site Diary labour summary.
 * Groups by REPORTING TRADE CATEGORY (Electrical, Joinery, …).
 * Detailed occupation remains on the operative (trade_normalized / trade).
 * Uncertain or empty trade → illegible bucket (never invent a trade).
 * @param {object} row
 */
export function tradeKeyForSignInSummary(row) {
  const detailed = detailedTradeOccupationFromRow(row)
  const uncertain = row?.trade_needs_review === true || !detailed
  if (uncertain) {
    return {
      key: SIGNIN_ILLEGIBLE_TRADE_KEY,
      label: SIGNIN_ILLEGIBLE_TRADE_LABEL,
      tradeNeedsReview: true,
      detailedOccupation: detailed,
    }
  }
  const reporting = toReportingTradeCategory(detailed) || detailed
  return {
    key: `t:${String(reporting).toLowerCase()}`,
    label: reporting,
    tradeNeedsReview: false,
    detailedOccupation: detailed,
  }
}

/**
 * Aggregate included matched operatives by TRADE ONLY (company ignored).
 * Hours on site from time_in/time_out only — no break deduction.
 * Other-date / excluded rows are omitted.
 *
 * @param {unknown[]} operatives
 * @returns {{
 *   trades: Array<{
 *     tradeKey: string,
 *     trade: string,
 *     workers: number,
 *     hours: number,
 *     hoursComplete: boolean,
 *     needsReview: boolean,
 *     reviewStatus: string|null,
 *     rowIds: string[],
 *   }>,
 *   totals: { hours: number, workers: number },
 *   otherDateCount: number,
 * }}
 */
export function aggregateSignInOperativesByTrade(operatives = []) {
  const list = Array.isArray(operatives) ? operatives : []
  const otherDateCount = list.filter(
    (row) => row && row.dateStatus === 'other' && row.included !== false,
  ).length
  const matched = matchedIncludedSignInOperatives(list)
  const map = new Map()

  for (const row of matched) {
    const { key, label, tradeNeedsReview } = tradeKeyForSignInSummary(row)
    const hours = hoursOnSiteForSignInRow(row)
    const existing = map.get(key) || {
      tradeKey: key,
      trade: label,
      workers: 0,
      hours: 0,
      hoursComplete: true,
      needsReview: false,
      rowIds: [],
    }
    existing.workers += 1
    if (row.id != null) existing.rowIds.push(String(row.id))
    if (tradeNeedsReview) existing.needsReview = true
    if (hours == null) {
      // Missing/unreadable clocks → Needs review, no invented hours. Partial sums stay hidden in review.
      existing.hoursComplete = false
      existing.needsReview = true
    } else {
      existing.hours = Math.round((existing.hours + hours) * 100) / 100
    }
    map.set(key, existing)
  }

  const trades = Array.from(map.values())
    .map((t) => ({
      ...t,
      reviewStatus: t.needsReview ? 'Needs review' : null,
    }))
    .sort((a, b) => a.trade.localeCompare(b.trade))

  const totals = {
    hours: Math.round(
      trades.reduce((sum, t) => sum + (t.hoursComplete ? t.hours : 0), 0) * 100,
    ) / 100,
    workers: trades.reduce((sum, t) => sum + (Number(t.workers) || 0), 0),
  }

  return { trades, totals, otherDateCount }
}

/**
 * Included rows matching the diary report date (existing dateStatus contract).
 * @param {unknown[]} operatives
 */
export function matchedIncludedSignInOperatives(operatives = []) {
  return (Array.isArray(operatives) ? operatives : []).filter(
    (row) =>
      row
      && typeof row === 'object'
      && row.dateStatus === 'match'
      && row.included !== false
      && row.excludedFromLabour !== true,
  )
}

/**
 * Company key/label for company-only labour summary.
 * Uncertain or empty company → illegible bucket (never invent a name).
 * @param {object} row
 */
export function companyKeyForSignInSummary(row) {
  const raw = String(row?.company_reviewed ?? row?.company ?? '').trim()
  const uncertain = row?.company_needs_review === true || !raw
  if (uncertain) {
    return {
      key: '__illegible__',
      label: SIGNIN_ILLEGIBLE_COMPANY_LABEL,
      companyNeedsReview: true,
    }
  }
  return {
    key: `c:${raw.toLowerCase()}`,
    label: raw,
    companyNeedsReview: false,
  }
}

/**
 * NET hours for one operative row after break when available.
 * Returns null when times are insufficient — never invents hours.
 * Prefers existing net_hours when times are readable.
 * @param {object} row
 * @returns {number|null}
 */
export function netHoursForSignInRow(row) {
  if (!row || typeof row !== 'object') return null
  const fromTimes = hoursFromSignInOut(row.time_in, row.time_out)
  if (fromTimes == null) return null
  const net = Number(row.net_hours)
  if (row.net_hours != null && row.net_hours !== '' && Number.isFinite(net)) {
    return Math.round(net * 100) / 100
  }
  const deduct = Number(row.break_deduction_hours)
  const breakHours = Number.isFinite(deduct) ? deduct : 0
  return Math.round(Math.max(0, fromTimes - breakHours) * 100) / 100
}

/**
 * Aggregate included matched operatives by COMPANY ONLY (not trade).
 * Uses NET hours. Other-date / excluded rows are omitted.
 *
 * @param {unknown[]} operatives
 * @returns {{
 *   companies: Array<{
 *     companyKey: string,
 *     company: string,
 *     workers: number,
 *     hours: number,
 *     hoursComplete: boolean,
 *     needsReview: boolean,
 *     reviewStatus: string|null,
 *     rowIds: string[],
 *   }>,
 *   totals: { workers: number, hours: number },
 *   otherDateCount: number,
 * }}
 */
export function aggregateSignInOperativesByCompany(operatives = []) {
  const list = Array.isArray(operatives) ? operatives : []
  const otherDateCount = list.filter(
    (row) => row && row.dateStatus === 'other' && row.included !== false,
  ).length
  const matched = matchedIncludedSignInOperatives(list)
  const map = new Map()

  for (const row of matched) {
    const { key, label, companyNeedsReview } = companyKeyForSignInSummary(row)
    const hours = netHoursForSignInRow(row)
    const existing = map.get(key) || {
      companyKey: key,
      company: label,
      workers: 0,
      hours: 0,
      hoursComplete: true,
      needsReview: false,
      rowIds: [],
    }
    existing.workers += 1
    if (row.id != null) existing.rowIds.push(String(row.id))
    if (companyNeedsReview) existing.needsReview = true
    if (hours == null) {
      existing.hoursComplete = false
      existing.needsReview = true
    } else {
      existing.hours = Math.round((existing.hours + hours) * 100) / 100
    }
    map.set(key, existing)
  }

  const companies = Array.from(map.values())
    .map((c) => ({
      ...c,
      reviewStatus: c.needsReview ? 'Needs review' : null,
    }))
    .sort((a, b) => a.company.localeCompare(b.company))

  const totals = {
    workers: companies.reduce((sum, c) => sum + c.workers, 0),
    hours: Math.round(
      companies.reduce((sum, c) => sum + (c.hoursComplete ? c.hours : 0), 0) * 100,
    ) / 100,
  }

  return { companies, totals, otherDateCount }
}

/**
 * Map company summaries to labourRows shape for a later Apply step.
 * company-only grouping + NET hours. Does not invent hours when incomplete.
 * @param {ReturnType<typeof aggregateSignInOperativesByCompany>['companies']} companies
 * @param {() => string} [makeKey]
 */
export function companySummariesToLabourRows(companies = [], makeKey) {
  const keyFn =
    typeof makeKey === 'function' ? makeKey : () => `${Date.now()}-${Math.random()}`
  return (Array.isArray(companies) ? companies : []).map((c) => ({
    key: keyFn(),
    trade: '',
    company: c.company === SIGNIN_ILLEGIBLE_COMPANY_LABEL ? '' : c.company || '',
    headcount: c.workers != null ? String(c.workers) : '',
    hours: c.hoursComplete && Number.isFinite(Number(c.hours)) ? String(c.hours) : '',
    notes: c.needsReview ? 'Needs review' : '',
  }))
}
