/**
 * Date-filtered labour aggregation from site sign-in register records.
 *
 * Sign-in shape (flexible field names supported):
 *   { work_date|date|signed_in_at, trade, company|subcontractor, hours,
 *     signed_in_at, signed_out_at, person_name }
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
 * Hours for one sign-in row. Prefer explicit hours; else derive from in/out timestamps.
 */
export function signInHours(record) {
  if (!record) return 0
  if (record.hours != null && record.hours !== '') {
    const n = Number(record.hours)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const inn = record.signed_in_at || record.signin_at
  const out = record.signed_out_at || record.signout_at
  if (!inn || !out) return 0
  const a = new Date(inn).getTime()
  const b = new Date(out).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round(((b - a) / 3600000) * 100) / 100
}

/**
 * STRICT date filter — only records whose work date equals reportDate (YYYY-MM-DD).
 * Ignores previous and future dates.
 */
export function filterSignInsByReportDate(signIns, reportDate) {
  const target = toDateKey(reportDate)
  if (!target) return []
  return (Array.isArray(signIns) ? signIns : []).filter((row) => recordWorkDate(row) === target)
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
