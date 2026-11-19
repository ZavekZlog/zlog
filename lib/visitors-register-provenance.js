/**
 * Durable provenance for Visitors created via Attendance Register "Move to Visitors".
 * Visible narrative stays in daily_reports.visitors; identity lives in visitors_register_provenance.
 */

import {
  formatVisitorLineFromSignInOperative,
  visitorCompanyLabel,
} from './sign-in-trade-hours-review.js'

export const VISITORS_REGISTER_PROVENANCE_VERSION = 1

const REGISTER_DERIVED_VISITOR_LINE_RE =
  /^(.+?) · (.+?)[–-](.+?) · (?:Register row|Sign-in row)\s*(\d+)\s*$/i

function trimText(value) {
  return String(value ?? '').trim()
}

function normalizeClock(value) {
  const text = trimText(value).replace(/\s+/g, '')
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return text
  return `${match[1].padStart(2, '0')}:${match[2]}`
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
  return formatVisitorLineFromSignInOperative({
    company: entry.trade,
    time_in: entry.timeIn,
    time_out: entry.timeOut,
    source_row: entry.sourceRow,
  })
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
  const trade = visitorCompanyLabel(operative)
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
 * How many ledger entries display as each company · times line.
 * A matching visible line is already represented by provenance and is not kept again.
 * Extra copies beyond that count stay, so a hand-typed line is not removed.
 * @param {object[]} entries
 */
function provenanceDisplaySlots(entries) {
  const slots = new Map()
  for (const entry of entries) {
    const shown = formatVisitorLineFromProvenanceEntry(entry)
    if (!shown) continue
    slots.set(shown, (slots.get(shown) || 0) + 1)
  }
  return slots
}

function takeProvenanceDisplaySlot(slots, line) {
  const count = slots.get(line) || 0
  if (count <= 0) return false
  slots.set(line, count - 1)
  return true
}

/**
 * @param {string} visitorsText
 * @param {object[]} entries
 * @param {object|null} [operative]
 * @param {string} [tradeLabel]
 */
function partitionVisitorLines(visitorsText, entries, operative = null, tradeLabel = '') {
  const displaySlots = provenanceDisplaySlots(entries)
  const manual = []
  const orphanScan = []
  for (const line of splitVisitorLines(visitorsText)) {
    const parsed = parseRegisterDerivedVisitorLine(line)
    if (parsed) {
      if (operative && legacyRegisterVisitorLineMatchesOperative(line, operative, tradeLabel)) {
        continue
      }
      const claimedByLedger = entries.some((row) => provenanceEntryMatchesParsedLine(row, parsed))
      if (claimedByLedger) continue
      orphanScan.push(line)
      continue
    }
    if (takeProvenanceDisplaySlot(displaySlots, line)) continue
    manual.push(line)
  }
  return { manual, orphanScan }
}

/**
 * Rebuild visible visitors text from manual lines, unclaimed legacy scan lines, and provenance ledger.
 * @param {string} visitorsText
 * @param {unknown[]} provenance
 */
export function mergeVisitorsTextWithRegisterProvenance(visitorsText, provenance) {
  const entries = normalizeVisitorsRegisterProvenance(provenance)
  const { manual, orphanScan } = partitionVisitorLines(visitorsText, entries)
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

  const { manual, orphanScan } = partitionVisitorLines(
    visitorsText,
    provenance,
    operative,
    tradeLabel,
  )

  const fromProvenance = provenance.map((row) => formatVisitorLineFromProvenanceEntry(row))
  const nextVisitorsText = [...manual, ...orphanScan, ...fromProvenance].filter(Boolean).join('\n')

  return {
    visitorsText: nextVisitorsText,
    visitorsRegisterProvenance: provenance,
  }
}
