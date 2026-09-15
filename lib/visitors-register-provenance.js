/**
 * Durable provenance for Visitors created via Attendance Register "Move to Visitors".
 * Visible narrative stays in daily_reports.visitors; identity lives in visitors_register_provenance.
 */

import { formatVisitorLineFromSignInOperative } from './sign-in-trade-hours-review.js'

export const VISITORS_REGISTER_PROVENANCE_VERSION = 1

const REGISTER_DERIVED_VISITOR_LINE_RE =
  /^(.+?) · (.+?)–(.+?) · (?:Register row|Sign-in row)\s*(\d+)\s*$/i

function trimText(value) {
  return String(value ?? '').trim()
}

function normalizeClock(value) {
  return trimText(value).replace(/\s+/g, '')
}

/**
 * @param {unknown} raw
 * @returns {import('./visitors-register-provenance.js').VisitorsRegisterProvenanceEntry[]}
 */
export function normalizeVisitorsRegisterProvenance(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const evidencePath = trimText(item.evidencePath)
    const sourceRow = Number(item.sourceRow)
    if (!evidencePath || !Number.isFinite(sourceRow)) continue
    out.push({
      version: VISITORS_REGISTER_PROVENANCE_VERSION,
      evidencePath,
      sourceRow: Math.trunc(sourceRow),
      trade: trimText(item.trade) || 'Visitor',
      timeIn: trimText(item.timeIn) || '—',
      timeOut: trimText(item.timeOut) || '—',
    })
  }
  return out
}

/**
 * @param {string} evidencePath
 * @param {number} sourceRow
 */
export function visitorsRegisterProvenanceKey(evidencePath, sourceRow) {
  const path = trimText(evidencePath)
  const row = Math.trunc(Number(sourceRow))
  if (!path || !Number.isFinite(row)) return ''
  return `${path}|${row}`
}

/**
 * @param {object} entry
 */
export function formatVisitorLineFromProvenanceEntry(entry) {
  if (!entry || typeof entry !== 'object') return ''
  return formatVisitorLineFromSignInOperative(
    {
      trade: entry.trade,
      time_in: entry.timeIn,
      time_out: entry.timeOut,
      source_row: entry.sourceRow,
    },
    entry.trade,
  )
}

/**
 * @param {object} operative
 * @param {string} tradeLabel
 * @param {string} evidencePath
 */
export function buildVisitorsRegisterProvenanceEntry(operative, tradeLabel, evidencePath) {
  const path = trimText(evidencePath)
  const sourceRow = Number(operative?.source_row)
  if (!path || !Number.isFinite(sourceRow)) return null
  const trade = trimText(tradeLabel || operative?.trade) || 'Visitor'
  const timeIn = operative?.time_in ? trimText(operative.time_in) : '—'
  const timeOut = operative?.time_out ? trimText(operative.time_out) : '—'
  return {
    version: VISITORS_REGISTER_PROVENANCE_VERSION,
    evidencePath: path,
    sourceRow: Math.trunc(sourceRow),
    trade,
    timeIn,
    timeOut,
  }
}

/**
 * @param {string} line
 * @returns {{ trade: string, timeIn: string, timeOut: string, sourceRow: number }|null}
 */
export function parseRegisterDerivedVisitorLine(line) {
  const text = trimText(line)
  if (!text) return null
  const match = text.match(REGISTER_DERIVED_VISITOR_LINE_RE)
  if (!match) return null
  const sourceRow = Number(match[4])
  if (!Number.isFinite(sourceRow)) return null
  return {
    trade: trimText(match[1]),
    timeIn: trimText(match[2]),
    timeOut: trimText(match[3]),
    sourceRow: Math.trunc(sourceRow),
  }
}

export function isRegisterDerivedVisitorLine(line) {
  return parseRegisterDerivedVisitorLine(line) != null
}

/**
 * Legacy visible line matches current operative (claim into provenance on current evidence).
 * @param {string} line
 * @param {object} operative
 * @param {string} [tradeLabel]
 */
export function legacyRegisterVisitorLineMatchesOperative(line, operative, tradeLabel = '') {
  const parsed = parseRegisterDerivedVisitorLine(line)
  if (!parsed || !operative) return false
  const sourceRow = Number(operative.source_row)
  if (!Number.isFinite(sourceRow) || parsed.sourceRow !== Math.trunc(sourceRow)) return false
  const trade = trimText(tradeLabel || operative.trade)
  if (normalizeClock(parsed.trade) !== normalizeClock(trade)) return false
  const timeIn = operative.time_in ? trimText(operative.time_in) : '—'
  const timeOut = operative.time_out ? trimText(operative.time_out) : '—'
  if (normalizeClock(parsed.timeIn) !== normalizeClock(timeIn)) return false
  if (normalizeClock(parsed.timeOut) !== normalizeClock(timeOut)) return false
  return true
}

function provenanceEntryMatchesParsedLine(entry, parsed) {
  if (!entry || !parsed) return false
  return (
    Math.trunc(Number(entry.sourceRow)) === parsed.sourceRow
    && normalizeClock(entry.trade) === normalizeClock(parsed.trade)
    && normalizeClock(entry.timeIn) === normalizeClock(parsed.timeIn)
    && normalizeClock(entry.timeOut) === normalizeClock(parsed.timeOut)
  )
}

function splitVisitorLines(visitorsText) {
  const existing = trimText(visitorsText)
  if (!existing) return []
  return existing.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)
}

/**
 * Rebuild visible visitors text from manual lines, unclaimed legacy scan lines, and provenance ledger.
 * @param {string} visitorsText
 * @param {unknown[]} provenance
 */
export function mergeVisitorsTextWithRegisterProvenance(visitorsText, provenance) {
  const entries = normalizeVisitorsRegisterProvenance(provenance)
  const lines = splitVisitorLines(visitorsText)
  const manual = []
  const orphanScan = []
  for (const line of lines) {
    const parsed = parseRegisterDerivedVisitorLine(line)
    if (!parsed) {
      manual.push(line)
      continue
    }
    const claimedByLedger = entries.some((entry) => provenanceEntryMatchesParsedLine(entry, parsed))
    if (claimedByLedger) continue
    orphanScan.push(line)
  }
  const fromProvenance = entries.map((entry) => formatVisitorLineFromProvenanceEntry(entry))
  const combined = [...manual, ...orphanScan, ...fromProvenance].filter(Boolean)
  return combined.join('\n')
}

/**
 * @param {{
 *   visitorsText?: string,
 *   visitorsRegisterProvenance?: unknown[],
 *   operative: object,
 *   tradeLabel?: string,
 *   evidencePath?: string,
 * }} args
 */
export function applyRegisterVisitorMoveFromSignIn({
  visitorsText = '',
  visitorsRegisterProvenance = [],
  operative,
  tradeLabel = '',
  evidencePath = '',
}) {
  const path = trimText(evidencePath)
  const entry = path ? buildVisitorsRegisterProvenanceEntry(operative, tradeLabel, path) : null
  let provenance = normalizeVisitorsRegisterProvenance(visitorsRegisterProvenance)

  if (entry) {
    const key = visitorsRegisterProvenanceKey(entry.evidencePath, entry.sourceRow)
    provenance = [
      ...provenance.filter(
        (row) => visitorsRegisterProvenanceKey(row.evidencePath, row.sourceRow) !== key,
      ),
      entry,
    ]
  }

  const lines = splitVisitorLines(visitorsText)
  const manual = []
  const orphanScan = []
  for (const line of lines) {
    const parsed = parseRegisterDerivedVisitorLine(line)
    if (!parsed) {
      manual.push(line)
      continue
    }
    if (legacyRegisterVisitorLineMatchesOperative(line, operative, tradeLabel)) {
      continue
    }
    const claimedByLedger = provenance.some((row) => provenanceEntryMatchesParsedLine(row, parsed))
    if (claimedByLedger) continue
    orphanScan.push(line)
  }

  const fromProvenance = provenance.map((row) => formatVisitorLineFromProvenanceEntry(row))
  const nextVisitorsText = [...manual, ...orphanScan, ...fromProvenance].filter(Boolean).join('\n')

  return {
    visitorsText: nextVisitorsText,
    visitorsRegisterProvenance: provenance,
  }
}
