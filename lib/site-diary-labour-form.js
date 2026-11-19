const UNPRINTED_LABOUR_LABELS = new Set([
  'trade not printed',
  'illegible / needs review',
  'not on register',
])

export function blankUnprintedLabourText(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '—') return ''
  if (UNPRINTED_LABOUR_LABELS.has(text.toLowerCase())) return ''
  return text
}

/** Company stays the printed register company. Trade is empty when none was printed. */
export function savedLabourTradeAndCompany(row) {
  const company = blankUnprintedLabourText(row?.company)
  let trade = row?.tradeAbsent === true ? '' : blankUnprintedLabourText(row?.trade)
  if (company && trade.toLowerCase() === company.toLowerCase()) trade = ''
  return { trade, company }
}

/**
 * Summary display. A trade that is really another row's company is shown under Company.
 * The returned trade is empty, which the summary renders as "Not on register".
 */
export function displayLabourSummaryRow(row, rows) {
  const list = Array.isArray(rows) ? rows : []
  const companyNames = new Set()
  for (const item of list) {
    const company = blankUnprintedLabourText(item?.company)
    if (company) companyNames.add(company.toLowerCase())
  }
  const company = blankUnprintedLabourText(row?.company)
  const trade = blankUnprintedLabourText(row?.trade)
  if (!company && trade && companyNames.has(trade.toLowerCase())) {
    return { trade: '', company: trade }
  }
  if (company && trade && trade.toLowerCase() === company.toLowerCase()) {
    return { trade: '', company }
  }
  return { trade, company }
}

export function createEmptyLabourRow(key) {
  return {
    key,
    trade: '',
    company: '',
    headcount: '',
    hours: '',
    notes: '',
  }
}

export function labourFromDbRow(row, makeKey) {
  const identity = savedLabourTradeAndCompany(row)
  return {
    key: makeKey(),
    trade: identity.trade,
    company: identity.company,
    headcount: row.count != null ? String(row.count) : '',
    hours: row.hours != null ? String(row.hours) : '',
    notes: row.notes ?? '',
  }
}

export function labourRowHasData(row) {
  return Boolean(
    row.trade.trim()
    || row.company.trim()
    || row.headcount
    || row.hours
    || row.notes.trim(),
  )
}

export function mapLabourRowsFromDb(rows, makeKey) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  return rows.map((row) => labourFromDbRow(row, makeKey))
}
