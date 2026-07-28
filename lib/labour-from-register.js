/**
 * Date-filtered labour aggregation from site sign-in register records.
 *
 * Sign-in shape (flexible field names supported):
 *   { work_date|date, trade, company|subcontractor,
 *     signed_in_at|time_in, signed_out_at|time_out, person_name }
 * Hours are always calculated in app code from sign-in/out — never from OCR.
 */

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
 * Supports overnight (sign-out after midnight → add 24h).
 * Returns null if either time is missing/ambiguous.
 */
export function hoursFromSignInOut(signedIn, signedOut) {
  const inMin = parseClockToMinutes(signedIn)
  const outMin = parseClockToMinutes(signedOut)
  if (inMin == null || outMin == null) return null
  let diff = outMin - inMin
  if (diff < 0) diff += 24 * 60 // overnight
  if (diff <= 0) return null
  return Math.round((diff / 60) * 100) / 100
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
    headcount: row.headcount ? String(row.headcount) : '',
    hours: row.hours ? String(row.hours) : '',
    notes: row.notes || '',
  }))
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
