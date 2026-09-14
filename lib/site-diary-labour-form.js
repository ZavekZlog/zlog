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
  return {
    key: makeKey(),
    trade: row.trade ?? '',
    company: '',
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
