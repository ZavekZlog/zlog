/**
 * Reviewed Trade + Hours summary for Sign-in OCR.
 * OCR operatives stay untouched; this layer is the Site Manager's editable draft.
 */

import {
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
  aggregateSignInOperativesByTrade,
} from './labour-from-register.js'

/**
 * @typedef {{
 *   key: string,
 *   trade: string,
 *   workers: number,
 *   hours: number|null,
 *   hoursComplete: boolean,
 *   needsReview: boolean,
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

  const merged = normalizeTradeHoursReviewRowAfterTradeEdit({
    ...target,
    trade: label,
    key: `t:${mergeKey}`,
    workers,
    hours,
    hoursComplete,
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
export function addSignInTradeHoursRow(rows = []) {
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : []
  list.push({
    key: `manual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    trade: '',
    workers: 0,
    hours: null,
    hoursComplete: false,
    needsReview: true,
  })
  return list
}
