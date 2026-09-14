/**
 * Reporting trade categories for Site Diary labour summary.
 * Maps detailed canonical occupations → concise management categories.
 * Applied only at aggregation / publish time — never during OCR consensus.
 */

import { canonicalizeConstructionTrade } from './construction-trade-vocabulary.js'

/** Approved user-facing labour reporting categories. */
export const CONSTRUCTION_TRADE_REPORTING_CATEGORIES = Object.freeze([
  'Electrical',
  'Joinery',
  'Mechanical',
  'Decoration',
  'Labour',
  'Scaffolding',
  'Masonry',
  'Drylining',
  'Groundworks',
  'Plastering',
  'Roofing',
  'Tiling',
  'Flooring',
  'Steelwork',
  'Concrete / Formwork',
  'Cladding',
  'Glazing',
  'Fire Stopping',
  'Insulation',
  'Demolition',
  'Plant',
  'Lifting Operations',
  'Cleaning',
])

/**
 * Detailed canonical occupation (lower key) → reporting category.
 * No Scaff → Electrical. Unrelated trades are not collapsed.
 */
const DETAILED_OCCUPATION_TO_REPORTING_CATEGORY = Object.freeze({
  electrician: 'Electrical',

  joiner: 'Joinery',
  carpenter: 'Joinery',

  plumber: 'Mechanical',
  pipefitter: 'Mechanical',
  'mechanical fitter': 'Mechanical',
  'duct fitter': 'Mechanical',
  ductworker: 'Mechanical',
  'sprinkler fitter': 'Mechanical',

  painter: 'Decoration',
  decorator: 'Decoration',
  'painter & decorator': 'Decoration',

  labourer: 'Labour',

  scaffolder: 'Scaffolding',

  bricklayer: 'Masonry',
  mason: 'Masonry',
  'stone mason': 'Masonry',

  dryliner: 'Drylining',
  'ceiling fixer': 'Drylining',
  'partition fixer': 'Drylining',

  groundworker: 'Groundworks',
  pavior: 'Groundworks',
  'kerb layer': 'Groundworks',
  'drainage operative': 'Groundworks',

  plasterer: 'Plastering',

  roofer: 'Roofing',

  tiler: 'Tiling',

  'floor layer': 'Flooring',

  'steel fixer': 'Steelwork',
  'rebar fixer': 'Steelwork',
  welder: 'Steelwork',
  fabricator: 'Steelwork',

  'concrete operative': 'Concrete / Formwork',
  'shuttering carpenter': 'Concrete / Formwork',
  'formwork carpenter': 'Concrete / Formwork',

  cladder: 'Cladding',
  'curtain wall installer': 'Cladding',
  'window installer': 'Cladding',

  glazier: 'Glazing',

  'fire stopper': 'Fire Stopping',

  'insulation operative': 'Insulation',

  'demolition operative': 'Demolition',
  'asbestos operative': 'Demolition',

  'plant operator': 'Plant',
  'telehandler operator': 'Plant',
  'mewp operator': 'Plant',

  'crane operator': 'Lifting Operations',
  banksman: 'Lifting Operations',
  'slinger / signaller': 'Lifting Operations',
  'traffic marshal': 'Lifting Operations',

  cleaner: 'Cleaning',
})

const REPORTING_CATEGORY_BY_LOWER = Object.freeze(
  Object.fromEntries(
    CONSTRUCTION_TRADE_REPORTING_CATEGORIES.map((label) => [label.toLowerCase(), label]),
  ),
)

/**
 * Detailed occupation string from an operative row (internal evidence).
 * Does not apply reporting-category mapping.
 *
 * @param {object|null|undefined} row
 * @returns {string|null}
 */
export function detailedTradeOccupationFromRow(row) {
  if (!row || typeof row !== 'object') return null
  const raw = String(row.trade_normalized ?? row.trade_reviewed ?? row.trade ?? '').trim()
  if (!raw) return null
  return canonicalizeConstructionTrade(raw)
}

/**
 * Map a detailed occupation (or alias) to the Site Diary reporting category.
 * Unknown occupations are preserved as a sensible detailed label — not invented categories.
 *
 * @param {unknown} trade
 * @returns {string|null}
 */
export function toReportingTradeCategory(trade) {
  if (trade == null) return null
  const trimmed = String(trade).trim().replace(/\s+/g, ' ')
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  if (REPORTING_CATEGORY_BY_LOWER[lower]) return REPORTING_CATEGORY_BY_LOWER[lower]

  const detailed = canonicalizeConstructionTrade(trimmed)
  if (!detailed) return null

  const detailedKey = detailed.toLowerCase()
  if (REPORTING_CATEGORY_BY_LOWER[detailedKey]) return REPORTING_CATEGORY_BY_LOWER[detailedKey]

  const mapped = DETAILED_OCCUPATION_TO_REPORTING_CATEGORY[detailedKey]
  if (mapped) return mapped

  // No approved category — keep the detailed occupation label.
  return detailed
}
