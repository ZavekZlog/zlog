/**
 * Reviewed Trade + Hours summary for Sign-in OCR.
 * OCR operatives stay untouched; this layer is the Site Manager's editable draft.
 */

import {
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
  aggregateSignInOperativesByTrade,
  hoursOnSiteForSignInRow,
} from './labour-from-register.js'
import {
  applyRegisterVisitorMoveFromSignIn,
  normalizeVisitorsRegisterProvenance,
} from './visitors-register-provenance.js'

/**
 * @typedef {{
 *   key: string,
 *   trade: string,
 *   workers: number,
 *   hours: number|null,
 *   hoursComplete: boolean,
 *   needsReview: boolean,
 *   rowIds?: string[],
 *   hoursManuallyEdited?: boolean,
 *   workersManuallyEdited?: boolean,
 * }} SignInTradeHoursReviewRow
 */

/**
 * @param {unknown[]} operatives
 * @returns {{ rows: SignInTradeHoursReviewRow[], otherDateCount: number }}
 */
export function initSignInTradeHoursReviewFromOperatives(operatives = []) {
  const { trades, otherDateCount } = aggregateSignInOperativesByTrade(operatives)
  return {
    otherDateCount,
    rows: (Array.isArray(trades) ? trades : []).map((t, index) => ({
      key: String(t.tradeKey || `trade-${index}`),
      trade: String(t.trade || ''),
      workers: Number.isFinite(Number(t.workers)) ? Math.trunc(Number(t.workers)) : 0,
      hours: t.hoursComplete === true && Number.isFinite(Number(t.hours)) ? Number(t.hours) : null,
      hoursComplete: t.hoursComplete === true,
      needsReview: t.needsReview === true || t.hoursComplete !== true,
      rowIds: Array.isArray(t.rowIds) ? t.rowIds.map(String) : [],
      hoursManuallyEdited: false,
      workersManuallyEdited: false,
    })),
  }
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 * @returns {number}
 */
export function totalSignInTradeHoursReview(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  let sum = 0
  for (const row of list) {
    if (!row || row.hoursComplete !== true) continue
    const hours = Number(row.hours)
    if (!Number.isFinite(hours) || hours < 0) continue
    sum += hours
  }
  return Math.round(sum * 100) / 100
}

/**
 * User-facing labour hours: preserve quarter-hours (66.75), no one-decimal rounding.
 * @param {unknown} hours
 * @returns {string}
 */
export function formatLabourHoursForDisplay(hours) {
  const value = Number(hours)
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  const fixed = rounded.toFixed(2)
  return fixed.replace(/\.?0+$/, '') || '0'
}

/**
 * Accept non-negative hour values such as 8, 7.5, 7.75, 3.75.
 * @param {unknown} raw
 * @returns {{ ok: true, hours: number } | { ok: false, hours: null }}
 */
export function parseSignInTradeHoursInput(raw) {
  if (raw == null) return { ok: false, hours: null }
  const text = String(raw).trim().replace(',', '.')
  if (!text || text === '—' || text === '-') return { ok: false, hours: null }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, hours: null }
  const hours = Number(text)
  if (!Number.isFinite(hours) || hours < 0) return { ok: false, hours: null }
  return { ok: true, hours: Math.round(hours * 100) / 100 }
}

/**
 * @param {string} trade
 */
function tradeMergeKey(trade) {
  return String(trade || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * After the Site Manager edits trade text, clear illegible sentinel state when resolved.
 * @param {SignInTradeHoursReviewRow} row
 */
export function normalizeTradeHoursReviewRowAfterTradeEdit(row) {
  if (!row || typeof row !== 'object') return row
  const trade = String(row.trade || '').trim()
  const stillIllegible =
    String(row.key || '') === SIGNIN_ILLEGIBLE_TRADE_KEY
    || trade === SIGNIN_ILLEGIBLE_TRADE_LABEL
  if (stillIllegible || !trade) {
    return { ...row, needsReview: true }
  }
  const hoursOk = row.hoursComplete === true && row.hours != null
  return {
    ...row,
    needsReview: !hoursOk,
  }
}

/**
 * @param {number} resolvedTradeCount
 * @param {number} needsReviewCount
 */
export function formatSignInTradeHoursReviewStatus(resolvedTradeCount, needsReviewCount) {
  const resolved = Math.max(0, Number(resolvedTradeCount) || 0)
  const review = Math.max(0, Number(needsReviewCount) || 0)
  const tradeWord = resolved === 1 ? 'trade' : 'trades'
  if (review > 0) {
    const reviewWord = review === 1 ? 'needs review' : 'need review'
    return `${resolved} ${tradeWord} · ${review} ${reviewWord}`
  }
  return `${resolved} ${tradeWord}`
}

/**
 * Rename a summary row's trade. Case-insensitive merge into an existing trade.
 * Does not touch OCR clocks.
 *
 * @param {SignInTradeHoursReviewRow[]} rows
 * @param {string} rowKey
 * @param {string} nextTrade
 */
export function renameSignInTradeHoursRow(rows = [], rowKey, nextTrade) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  const idx = list.findIndex((r) => r.key === rowKey)
  if (idx < 0) return list

  const label = String(nextTrade || '').trim()
  if (!label) {
    list[idx] = { ...list[idx], trade: '' }
    return list
  }

  const mergeKey = tradeMergeKey(label)
  const targetIdx = list.findIndex(
    (r, i) => i !== idx && tradeMergeKey(r.trade) === mergeKey && mergeKey !== '',
  )

  if (targetIdx < 0) {
    list[idx] = normalizeTradeHoursReviewRowAfterTradeEdit({
      ...list[idx],
      trade: label,
      key: `t:${mergeKey}`,
    })
    return list
  }

  const source = list[idx]
  const target = list[targetIdx]
  const sourceComplete = source.hoursComplete === true && source.hours != null
  const targetComplete = target.hoursComplete === true && target.hours != null
  const hoursComplete = sourceComplete && targetComplete
  const hours = hoursComplete
    ? Math.round((Number(source.hours) + Number(target.hours)) * 100) / 100
    : null
  const workers =
    (Number.isFinite(Number(source.workers)) ? Math.trunc(Number(source.workers)) : 0) +
    (Number.isFinite(Number(target.workers)) ? Math.trunc(Number(target.workers)) : 0)

  const mergedRowIds = [
    ...new Set([
      ...(Array.isArray(source.rowIds) ? source.rowIds : []).map(String),
      ...(Array.isArray(target.rowIds) ? target.rowIds : []).map(String),
    ]),
  ]
  const merged = normalizeTradeHoursReviewRowAfterTradeEdit({
    ...target,
    trade: label,
    key: `t:${mergeKey}`,
    workers,
    hours,
    hoursComplete,
    rowIds: mergedRowIds,
    hoursManuallyEdited: source.hoursManuallyEdited === true || target.hoursManuallyEdited === true,
    workersManuallyEdited: source.workersManuallyEdited === true || target.workersManuallyEdited === true,
  })

  const next = list.filter((_, i) => i !== idx && i !== targetIdx)
  next.push(merged)
  return next.sort((a, b) => String(a.trade).localeCompare(String(b.trade)))
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 * @param {string} rowKey
 * @param {unknown} rawHours
 */
export function setSignInTradeHoursRowHours(rows = [], rowKey, rawHours) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  const idx = list.findIndex((r) => r.key === rowKey)
  if (idx < 0) return list

  const parsed = parseSignInTradeHoursInput(rawHours)
  if (!parsed.ok) {
    // Blank / invalid while editing: keep row but mark incomplete (no invented hours).
    const text = String(rawHours ?? '').trim()
    if (!text || text === '—' || text === '-') {
      list[idx] = {
        ...list[idx],
        hours: null,
        hoursComplete: false,
        needsReview: true,
      }
      return list
    }
    // Reject invalid/negative — leave prior value unchanged.
    return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  }

  list[idx] = {
    ...list[idx],
    hours: parsed.hours,
    hoursComplete: true,
    needsReview: false,
    hoursManuallyEdited: true,
  }
  return list
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 * @param {string} rowKey
 */
export function removeSignInTradeHoursRow(rows = [], rowKey) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r.key !== rowKey)
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 */
/**
 * Touch/pen should activate Add trade on pointerdown — one tap on Android
 * (otherwise the first tap often only moves focus onto the button).
 * @param {unknown} pointerType
 * @param {boolean} [disabled]
 */
export function signInAddTradeUsesPointerDownActivation(pointerType, disabled = false) {
  if (disabled) return false
  const type = String(pointerType || '')
  return type === 'touch' || type === 'pen'
}

/**
 * Scan-derived review rows are tied to sign-in operatives via rowIds.
 * Workers/Hours are derived aggregates — not manual entry fields.
 * @param {object|null|undefined} row
 */
export function scanDerivedSignInTradeHoursReviewRow(row) {
  const rowIds = Array.isArray(row?.rowIds) ? row.rowIds : []
  return rowIds.length > 0
}

/**
 * Manual "+ Add trade" placeholder or other stale row with no trade, workers, hours, or scan rowIds.
 * @param {object|null|undefined} row
 */
export function isSignInTradeHoursReviewPlaceholderRow(row) {
  if (!row || typeof row !== 'object') return true
  const rowIds = Array.isArray(row.rowIds) ? row.rowIds : []
  if (rowIds.length > 0) return false
  const trade = String(row.trade || '').trim()
  if (trade) return false
  const workers = Math.trunc(Number(row.workers) || 0)
  if (workers > 0) return false
  const hasHours = row.hoursComplete === true && row.hours != null
  if (hasHours) return false
  return true
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 */
export function pruneSignInTradeHoursReviewPlaceholders(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list.filter((row) => !isSignInTradeHoursReviewPlaceholderRow(row))
}

/**
 * Drop scan buckets with no productive operatives and manual placeholder rows.
 * @param {SignInTradeHoursReviewRow[]} rows
 * @param {unknown[]} [operatives]
 */
export function pruneDepletedSignInTradeHoursReviewRows(rows = [], operatives = []) {
  const list = Array.isArray(rows) ? rows : []
  const ops = Array.isArray(operatives) ? operatives : []
  return pruneSignInTradeHoursReviewPlaceholders(
    list.filter((row) => !signInTradeHoursReviewRowIsDepleted(row, ops)),
  )
}

/**
 * @param {object|null|undefined} row
 * @param {unknown[]} operatives
 */
export function signInTradeHoursReviewRowIsDepleted(row, operatives = []) {
  if (!row || typeof row !== 'object') return true
  if (isSignInTradeHoursReviewPlaceholderRow(row)) return true
  const rowIds = Array.isArray(row.rowIds) ? row.rowIds : []
  if (rowIds.length === 0) return false
  const bucket = operativesForSignInTradeReviewRow(operatives, rowIds)
  const totals = aggregateProductiveOperativesInBucket(bucket)
  return totals.workers === 0
}

export function addSignInTradeHoursRow(rows = []) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  list.push({
    key: `manual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    trade: '',
    workers: 0,
    hours: null,
    hoursComplete: false,
    needsReview: true,
    rowIds: [],
    hoursManuallyEdited: false,
    workersManuallyEdited: false,
  })
  return list
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, workers: number } | { ok: false, workers: null }}
 */
export function parseSignInTradeWorkersInput(raw) {
  if (raw == null) return { ok: false, workers: null }
  const text = String(raw).trim()
  if (!text || text === '—' || text === '-') return { ok: false, workers: null }
  if (!/^\d+$/.test(text)) return { ok: false, workers: null }
  const workers = Number(text)
  if (!Number.isFinite(workers) || workers < 0) return { ok: false, workers: null }
  return { ok: true, workers: Math.trunc(workers) }
}

/**
 * @param {SignInTradeHoursReviewRow[]} rows
 * @param {string} rowKey
 * @param {unknown} rawWorkers
 */
export function setSignInTradeHoursRowWorkers(rows = [], rowKey, rawWorkers) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  const idx = list.findIndex((r) => r.key === rowKey)
  if (idx < 0) return list

  const parsed = parseSignInTradeWorkersInput(rawWorkers)
  if (!parsed.ok) {
    const text = String(rawWorkers ?? '').trim()
    if (!text || text === '—' || text === '-') {
      list[idx] = {
        ...list[idx],
        workers: 0,
        workersManuallyEdited: true,
      }
      return list
    }
    return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  }

  list[idx] = {
    ...list[idx],
    workers: parsed.workers,
    workersManuallyEdited: true,
  }
  return list
}

/**
 * Operatives tied to one reviewed trade row (by persisted rowIds).
 * @param {unknown[]} operatives
 * @param {string[]} rowIds
 */
export function operativesForSignInTradeReviewRow(operatives = [], rowIds = []) {
  const ids = new Set((Array.isArray(rowIds) ? rowIds : []).map(String))
  if (ids.size === 0) return []
  return (Array.isArray(operatives) ? operatives : []).filter(
    (row) => row && ids.has(String(row.id)),
  )
}

/**
 * Sum productive hours for operatives in a bucket (match date, not labour-excluded).
 * @param {unknown[]} operativesInBucket
 */
export function productiveHoursSumForOperativeBucket(operativesInBucket = []) {
  const list = Array.isArray(operativesInBucket) ? operativesInBucket : []
  let sum = 0
  let complete = true
  for (const row of list) {
    if (!row || row.dateStatus !== 'match' || row.included === false || row.excludedFromLabour === true) {
      continue
    }
    const hours = hoursOnSiteForSignInRow(row)
    if (hours == null) {
      complete = false
      continue
    }
    sum = Math.round((sum + hours) * 100) / 100
  }
  return { hours: complete ? sum : null, hoursComplete: complete }
}

/**
 * Workers + hours totals for productive operatives in one review bucket.
 * @param {unknown[]} operativesInBucket
 */
export function aggregateProductiveOperativesInBucket(operativesInBucket = []) {
  const list = Array.isArray(operativesInBucket) ? operativesInBucket : []
  const productive = list.filter(
    (row) =>
      row
      && row.dateStatus === 'match'
      && row.included !== false
      && row.excludedFromLabour !== true
      && row.movedToVisitors !== true,
  )
  let hoursComplete = true
  let needsReview = false
  let hours = 0
  for (const row of productive) {
    if (row.trade_needs_review === true) needsReview = true
    const rowHours = hoursOnSiteForSignInRow(row)
    if (rowHours == null) {
      hoursComplete = false
      needsReview = true
    } else {
      hours = Math.round((hours + rowHours) * 100) / 100
    }
  }
  return {
    workers: productive.length,
    hours: hoursComplete ? hours : null,
    hoursComplete,
    needsReview,
  }
}

/**
 * Non-PII line for Adjust people panel.
 * @param {object} operative
 * @param {string} [tradeLabel]
 */
export function formatSignInOperativeLabourLine(
  operative,
  tradeLabel = '',
  { includeTradeSuffix = true } = {},
) {
  if (!operative || typeof operative !== 'object') return 'Row'
  const sourceRow = Number.isFinite(Number(operative.source_row)) ? Number(operative.source_row) : null
  const rowLabel = sourceRow != null ? `Row ${sourceRow}` : 'Row'
  const timeIn = operative.time_in ? String(operative.time_in).trim() : '—'
  const timeOut = operative.time_out ? String(operative.time_out).trim() : '—'
  const rowHours = hoursOnSiteForSignInRow(operative)
  const hoursLabel = rowHours != null ? `${formatLabourHoursForDisplay(rowHours)} hrs` : '— hrs'
  let tradeSuffix = ''
  if (includeTradeSuffix) {
    const trade = String(tradeLabel || operative.trade || '').trim()
    tradeSuffix = trade ? ` · ${trade}` : ''
  }
  return `${rowLabel} · ${timeIn}–${timeOut} · ${hoursLabel}${tradeSuffix}`
}

export const SIGNIN_LABOUR_EXCLUSION_HOURS_CONFLICT_MESSAGE =
  'Hours on this trade were edited manually and no longer match the register rows. Adjust hours yourself, or reset them to match the register, then exclude someone again.'

export const SIGNIN_LABOUR_EXCLUSION_WORKERS_CONFLICT_MESSAGE =
  'Workers on this trade were edited manually and no longer match the register rows. Adjust workers yourself, or reset them to match the register, then exclude someone again.'

/**
 * @param {unknown[]} operatives
 * @param {string} operativeId
 * @param {boolean} excluded
 */
export function setOperativeExcludedFromLabour(operatives = [], operativeId, excluded) {
  const targetId = String(operativeId)
  return (Array.isArray(operatives) ? operatives : []).map((row) => {
    if (!row || String(row.id) !== targetId) return row
    return { ...row, excludedFromLabour: excluded === true }
  })
}

/**
 * @param {unknown[]} operatives
 * @param {string} operativeId
 */
export function setOperativeMovedToVisitors(operatives = [], operativeId) {
  const targetId = String(operativeId)
  return (Array.isArray(operatives) ? operatives : []).map((row) => {
    if (!row || String(row.id) !== targetId) return row
    return { ...row, excludedFromLabour: true, movedToVisitors: true }
  })
}

/**
 * Concise visitor register line from sign-in operative (no person/company names).
 * @param {object} operative
 * @param {string} [tradeLabel]
 */
export function formatVisitorLineFromSignInOperative(operative, tradeLabel = '') {
  if (!operative || typeof operative !== 'object') return 'Visitor'
  const role = String(tradeLabel || operative.trade || '').trim() || 'Visitor'
  const timeIn = operative.time_in ? String(operative.time_in).trim() : '—'
  const timeOut = operative.time_out ? String(operative.time_out).trim() : '—'
  const sourceRow = Number.isFinite(Number(operative.source_row)) ? Number(operative.source_row) : null
  const rowSuffix = sourceRow != null ? `Register row ${sourceRow}` : 'Register row —'
  return `${role} · ${timeIn}–${timeOut} · ${rowSuffix}`
}

/**
 * Append one visitor line to the narrative visitors field; skip exact duplicate lines.
 * @param {string} existingVisitorsText
 * @param {string} line
 */
export function appendVisitorNarrative(existingVisitorsText, line) {
  const nextLine = String(line || '').trim()
  if (!nextLine) return String(existingVisitorsText || '').trim()
  const existing = String(existingVisitorsText || '').trim()
  if (!existing) return nextLine
  const parts = existing.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)
  if (parts.some((p) => p === nextLine)) return existing
  return `${existing}\n${nextLine}`
}

/** Scan-derived visitor provenance suffix (legacy "Sign-in row" + canonical "Register row"). */
const SIGNIN_VISITOR_REGISTER_ROW_LINE_RE =
  /·\s*(?:Register row|Sign-in row)\s*(\d+)\s*$/i

/**
 * Stable identity for scan-derived visitor lines tied to Attendance Register source_row.
 * @param {object|null|undefined} operative
 * @returns {string|null}
 */
export function signInVisitorIdentityKeyForOperative(operative) {
  if (!operative || typeof operative !== 'object') return null
  const sourceRow = Number(operative.source_row)
  if (Number.isFinite(sourceRow)) return `row:${Math.trunc(sourceRow)}`
  if (operative.id != null && String(operative.id).trim()) {
    return `op:${String(operative.id)}`
  }
  return null
}

/**
 * @param {string} line
 * @returns {string|null}
 */
export function signInVisitorIdentityKeyFromLine(line) {
  const text = String(line || '').trim()
  if (!text) return null
  const rowMatch = text.match(SIGNIN_VISITOR_REGISTER_ROW_LINE_RE)
  if (rowMatch) return `row:${Math.trunc(Number(rowMatch[1]))}`
  return null
}

/**
 * Upsert one scan-derived visitor line by register source_row (or operative id fallback).
 * Manual visitor lines without register provenance are never merged or removed.
 *
 * @param {string} existingVisitorsText
 * @param {object} operative
 * @param {string} [tradeLabel]
 */
export function upsertSignInDerivedVisitorLine(existingVisitorsText, operative, tradeLabel = '') {
  const line = formatVisitorLineFromSignInOperative(operative, tradeLabel)
  const identityKey = signInVisitorIdentityKeyForOperative(operative)
  const existing = String(existingVisitorsText || '').trim()
  const parts = existing ? existing.split(/\r?\n/).map((p) => p.trim()).filter(Boolean) : []

  let kept = parts
  if (identityKey) {
    kept = parts.filter((part) => {
      const partKey = signInVisitorIdentityKeyFromLine(part)
      return partKey !== identityKey
    })
  } else if (line) {
    kept = parts.filter((part) => part !== line)
  }

  if (line && kept.some((part) => part === line)) {
    return kept.join('\n')
  }
  if (!line) return kept.join('\n')
  return kept.length ? `${kept.join('\n')}\n${line}` : line
}

/**
 * @param {SignInTradeHoursReviewRow} reviewRow
 * @param {unknown[]} operatives
 * @param {{ bucketTotalsBefore?: { workers: number }, sumBefore?: { hours: number|null, hoursComplete: boolean } }} [opts]
 * @returns {SignInTradeHoursReviewRow|null}
 */
function recomputeReviewRowAfterOperativeBucketChange(reviewRow, operatives, opts = {}) {
  if (!reviewRow || typeof reviewRow !== 'object') return null
  const rowIds = Array.isArray(reviewRow.rowIds) ? reviewRow.rowIds.map(String) : []
  if (rowIds.length === 0) {
    return scanDerivedSignInTradeHoursReviewRow(reviewRow) ? null : reviewRow
  }
  const bucket = operativesForSignInTradeReviewRow(operatives, rowIds)
  const totals = aggregateProductiveOperativesInBucket(bucket)
  if (totals.workers === 0) return null

  const bucketTotalsBefore = opts.bucketTotalsBefore
  const sumBefore = opts.sumBefore
  const hoursManuallyEdited =
    reviewRow.hoursManuallyEdited === true
    && sumBefore?.hoursComplete
    && totals.hoursComplete
      ? false
      : reviewRow.hoursManuallyEdited === true
  const workersManuallyEdited =
    reviewRow.workersManuallyEdited === true
    && bucketTotalsBefore
    && bucketTotalsBefore.workers === Math.trunc(Number(reviewRow.workers) || 0)
      ? false
      : reviewRow.workersManuallyEdited === true

  return {
    ...reviewRow,
    rowIds,
    workers: totals.workers,
    hours: totals.hours,
    hoursComplete: totals.hoursComplete,
    needsReview: totals.needsReview || totals.hoursComplete !== true,
    hoursManuallyEdited,
    workersManuallyEdited,
  }
}

/**
 * Move one operative from productive labour into the diary Visitors narrative.
 *
 * @param {{
 *   operatives: unknown[],
 *   reviewRows: SignInTradeHoursReviewRow[],
 *   reviewRowKey: string,
 *   operativeId: string,
 *   existingVisitorsText?: string,
 *   existingVisitorsRegisterProvenance?: unknown[],
 *   evidencePath?: string,
 *   tradeLabel?: string,
 * }} args
 */
export function applyOperativeMoveToVisitorsFromReview({
  operatives = [],
  reviewRows = [],
  reviewRowKey,
  operativeId,
  existingVisitorsText = '',
  existingVisitorsRegisterProvenance = [],
  evidencePath = '',
  tradeLabel = '',
}) {
  const targetId = String(operativeId)
  const rows = Array.isArray(reviewRows) ? reviewRows.map((r) => ({ ...r })) : []
  const provenanceBefore = normalizeVisitorsRegisterProvenance(existingVisitorsRegisterProvenance)

  const operative = (Array.isArray(operatives) ? operatives : []).find(
    (row) => row && String(row.id) === targetId,
  )
  if (!operative) {
    return {
      ok: false,
      reason: 'operative-not-found',
      operatives,
      reviewRows: rows,
      visitorsText: String(existingVisitorsText || ''),
      visitorsRegisterProvenance: provenanceBefore,
    }
  }
  if (operative.movedToVisitors === true) {
    const visitorUpdate = applyRegisterVisitorMoveFromSignIn({
      visitorsText: existingVisitorsText,
      visitorsRegisterProvenance: provenanceBefore,
      operative,
      tradeLabel,
      evidencePath,
    })
    return {
      ok: false,
      reason: 'already-moved',
      operatives,
      reviewRows: rows,
      visitorsText: visitorUpdate.visitorsText,
      visitorsRegisterProvenance: visitorUpdate.visitorsRegisterProvenance,
    }
  }

  const rowIdx = rows.findIndex((r) => r.key === reviewRowKey)
  if (rowIdx < 0) {
    return {
      ok: false,
      reason: 'row-not-found',
      operatives,
      reviewRows: rows,
      visitorsText: String(existingVisitorsText || ''),
      visitorsRegisterProvenance: provenanceBefore,
    }
  }

  const reviewRow = rows[rowIdx]
  const rowIds = Array.isArray(reviewRow.rowIds) ? reviewRow.rowIds.map(String) : []
  if (!rowIds.includes(targetId)) {
    return {
      ok: false,
      reason: 'operative-not-in-row',
      operatives,
      reviewRows: rows,
      visitorsText: String(existingVisitorsText || ''),
      visitorsRegisterProvenance: provenanceBefore,
    }
  }

  const bucketBefore = operativesForSignInTradeReviewRow(operatives, rowIds)
  const bucketTotalsBefore = aggregateProductiveOperativesInBucket(bucketBefore)
  const sumBefore = productiveHoursSumForOperativeBucket(bucketBefore)

  if (
    reviewRow.workersManuallyEdited === true
    && Math.trunc(Number(reviewRow.workers) || 0) !== bucketTotalsBefore.workers
  ) {
    return {
      ok: false,
      reason: 'workers-conflict',
      conflict: SIGNIN_LABOUR_EXCLUSION_WORKERS_CONFLICT_MESSAGE,
      operatives,
      reviewRows: rows,
      visitorsText: String(existingVisitorsText || ''),
      visitorsRegisterProvenance: provenanceBefore,
    }
  }

  if (
    reviewRow.hoursManuallyEdited === true
    && reviewRow.hoursComplete === true
    && reviewRow.hours != null
    && sumBefore.hoursComplete
    && Math.abs(Number(reviewRow.hours) - Number(sumBefore.hours)) > 0.001
  ) {
    return {
      ok: false,
      reason: 'hours-conflict',
      conflict: SIGNIN_LABOUR_EXCLUSION_HOURS_CONFLICT_MESSAGE,
      operatives,
      reviewRows: rows,
      visitorsText: String(existingVisitorsText || ''),
      visitorsRegisterProvenance: provenanceBefore,
    }
  }

  const nextOperatives = setOperativeMovedToVisitors(operatives, targetId)
  const strippedRows = rows.map((r) => ({
    ...r,
    rowIds: (Array.isArray(r.rowIds) ? r.rowIds : []).map(String).filter((id) => id !== targetId),
  }))

  const nextRows = []
  for (let i = 0; i < strippedRows.length; i += 1) {
    const originalRowIds = (Array.isArray(rows[i].rowIds) ? rows[i].rowIds : []).map(String)
    const rowHadTarget = originalRowIds.includes(targetId)
    const hadScanRowIds = originalRowIds.length > 0
    const nextRowIds = Array.isArray(strippedRows[i].rowIds) ? strippedRows[i].rowIds : []
    if (nextRowIds.length === 0) {
      if (hadScanRowIds || scanDerivedSignInTradeHoursReviewRow(rows[i])) continue
      if (isSignInTradeHoursReviewPlaceholderRow(strippedRows[i])) continue
      nextRows.push(strippedRows[i])
      continue
    }
    if (!rowHadTarget) {
      nextRows.push(strippedRows[i])
      continue
    }
    const recomputeOpts =
      i === rowIdx ? { bucketTotalsBefore, sumBefore } : {}
    const updated = recomputeReviewRowAfterOperativeBucketChange(
      strippedRows[i],
      nextOperatives,
      recomputeOpts,
    )
    if (updated) nextRows.push(updated)
  }

  const visitorUpdate = applyRegisterVisitorMoveFromSignIn({
    visitorsText: existingVisitorsText,
    visitorsRegisterProvenance: provenanceBefore,
    operative,
    tradeLabel: tradeLabel || reviewRow.trade,
    evidencePath,
  })
  const visitorLine = formatVisitorLineFromSignInOperative(operative, tradeLabel || reviewRow.trade)

  return {
    ok: true,
    operatives: nextOperatives,
    reviewRows: pruneDepletedSignInTradeHoursReviewRows(nextRows, nextOperatives),
    visitorsText: visitorUpdate.visitorsText,
    visitorsRegisterProvenance: visitorUpdate.visitorsRegisterProvenance,
    visitorLine,
  }
}

/**
 * Toggle labour exclusion for one operative and update only its review aggregate row.
 * Does not reinitialise unrelated review rows.
 *
 * @param {{
 *   operatives: unknown[],
 *   reviewRows: SignInTradeHoursReviewRow[],
 *   reviewRowKey: string,
 *   operativeId: string,
 *   exclude: boolean,
 * }} args
 */
export function applyOperativeLabourExclusionToReview({
  operatives = [],
  reviewRows = [],
  reviewRowKey,
  operativeId,
  exclude,
}) {
  const rows = Array.isArray(reviewRows) ? reviewRows.map((r) => ({ ...r })) : []
  const rowIdx = rows.findIndex((r) => r.key === reviewRowKey)
  if (rowIdx < 0) {
    return { ok: false, reason: 'row-not-found', operatives, reviewRows: rows }
  }
  const reviewRow = rows[rowIdx]
  const rowIds = Array.isArray(reviewRow.rowIds) ? reviewRow.rowIds.map(String) : []
  if (!rowIds.includes(String(operativeId))) {
    return { ok: false, reason: 'operative-not-in-row', operatives, reviewRows: rows }
  }

  const bucketBefore = operativesForSignInTradeReviewRow(operatives, rowIds)
  const bucketTotalsBefore = aggregateProductiveOperativesInBucket(bucketBefore)
  const sumBefore = productiveHoursSumForOperativeBucket(bucketBefore)

  if (
    reviewRow.workersManuallyEdited === true
    && Math.trunc(Number(reviewRow.workers) || 0) !== bucketTotalsBefore.workers
  ) {
    return {
      ok: false,
      reason: 'workers-conflict',
      conflict: SIGNIN_LABOUR_EXCLUSION_WORKERS_CONFLICT_MESSAGE,
      operatives,
      reviewRows: rows,
    }
  }

  if (
    reviewRow.hoursManuallyEdited === true
    && reviewRow.hoursComplete === true
    && reviewRow.hours != null
    && sumBefore.hoursComplete
    && Math.abs(Number(reviewRow.hours) - Number(sumBefore.hours)) > 0.001
  ) {
    return {
      ok: false,
      reason: 'hours-conflict',
      conflict: SIGNIN_LABOUR_EXCLUSION_HOURS_CONFLICT_MESSAGE,
      operatives,
      reviewRows: rows,
    }
  }

  const nextOperatives = setOperativeExcludedFromLabour(operatives, operativeId, exclude)
  const bucketAfter = operativesForSignInTradeReviewRow(nextOperatives, rowIds)
  const totals = aggregateProductiveOperativesInBucket(bucketAfter)

  let nextRows
  if (totals.workers === 0) {
    nextRows = rows.filter((_, i) => i !== rowIdx)
  } else {
    const hoursManuallyEdited =
      reviewRow.hoursManuallyEdited === true && sumBefore.hoursComplete && totals.hoursComplete
        ? false
        : reviewRow.hoursManuallyEdited === true
    const workersManuallyEdited =
      reviewRow.workersManuallyEdited === true
      && bucketTotalsBefore.workers === Math.trunc(Number(reviewRow.workers) || 0)
        ? false
        : reviewRow.workersManuallyEdited === true
    nextRows = rows.map((r, i) => {
      if (i !== rowIdx) return r
      return {
        ...r,
        trade: r.trade,
        workers: totals.workers,
        hours: totals.hours,
        hoursComplete: totals.hoursComplete,
        needsReview: totals.needsReview || totals.hoursComplete !== true,
        rowIds,
        hoursManuallyEdited,
        workersManuallyEdited,
      }
    })
  }

  return {
    ok: true,
    operatives: nextOperatives,
    reviewRows: pruneDepletedSignInTradeHoursReviewRows(nextRows, nextOperatives),
  }
}

/**
 * Stable signature for tying an open people panel to one review-row generation.
 * @param {{ key?: string, rowIds?: string[] } | null | undefined} row
 */
export function signInTradeReviewRowPeoplePanelAnchor(row) {
  if (!row || typeof row !== 'object') return ''
  const ids = Array.isArray(row.rowIds) ? row.rowIds : []
  return `${String(row.key ?? '')}:${ids.map(String).sort().join('|')}`
}

/**
 * @param {Array<{ key: string }>} rows
 */
export function signInTradeReviewRowsPresenceKey(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => String(r?.key ?? ''))
    .filter(Boolean)
    .sort()
    .join('|')
}

/**
 * @param {string | null | undefined} adjustPeopleRowKey
 * @param {Array<{ key: string, rowIds?: string[] }>} rows
 * @param {{ rowKey: string, anchor: string, rowsPresenceKey: string } | null | undefined} panelAnchor
 * @param {string} rowsPresenceKey
 */
export function resolveOpenAdjustPeopleRowKey(adjustPeopleRowKey, rows, panelAnchor, rowsPresenceKey) {
  const key = String(adjustPeopleRowKey ?? '').trim()
  if (!key || !panelAnchor || panelAnchor.rowKey !== key) return null
  if (panelAnchor.rowsPresenceKey !== rowsPresenceKey) return null
  const row = rows.find((r) => r.key === key)
  if (!row) return null
  if (signInTradeReviewRowPeoplePanelAnchor(row) !== panelAnchor.anchor) return null
  return key
}

/**
 * @param {{ rowsPresenceKey: string } | null | undefined} panelAnchor
 * @param {string} rowsPresenceKey
 */
export function shouldClearPeoplePanelAnchor(panelAnchor, rowsPresenceKey) {
  return Boolean(panelAnchor && panelAnchor.rowsPresenceKey !== rowsPresenceKey)
}
