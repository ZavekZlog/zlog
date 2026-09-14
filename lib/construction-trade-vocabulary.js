/**
 * Controlled UK construction trade vocabulary for Sign-in OCR.
 * Deterministic aliases → canonical trade labels only.
 * No fuzzy / Levenshtein nearest-trade matching.
 * Image evidence remains primary; this never invents a trade from uncertainty.
 */

/** Canonical display labels (UK site diary convention). */
export const CONSTRUCTION_TRADE_CANONICALS = Object.freeze([
  'Electrician',
  'Joiner',
  'Carpenter',
  'Labourer',
  'Painter',
  'Decorator',
  'Painter & Decorator',
  'Plumber',
  'Scaffolder',
  'Bricklayer',
  'Plasterer',
  'Dryliner',
  'Groundworker',
  'Steel fixer',
  'Rebar fixer',
  'Concrete operative',
  'Shuttering carpenter',
  'Formwork carpenter',
  'Roofer',
  'Tiler',
  'Floor layer',
  'Ceiling fixer',
  'Partition fixer',
  'Glazier',
  'Welder',
  'Fabricator',
  'Pipefitter',
  'Mechanical fitter',
  'Duct fitter',
  'Ductworker',
  'Sprinkler fitter',
  'Fire stopper',
  'Insulation operative',
  'Cladder',
  'Curtain wall installer',
  'Window installer',
  'Mason',
  'Stone mason',
  'Pavior',
  'Kerb layer',
  'Drainage operative',
  'Plant operator',
  'Crane operator',
  'Banksman',
  'Slinger / Signaller',
  'Traffic marshal',
  'Telehandler operator',
  'MEWP operator',
  'Demolition operative',
  'Asbestos operative',
  'Cleaner',
])

/**
 * Exact alias / spelling keys (already lowercased, single-spaced) → canonical.
 * Intentionally never maps scaff/scaffold/scaffolder aliases to Electrician.
 */
const CONSTRUCTION_TRADE_ALIAS_TO_CANONICAL = Object.freeze({
  // Electrician
  electrician: 'Electrician',
  electrical: 'Electrician',
  spark: 'Electrician',
  sparky: 'Electrician',

  // Joiner / Carpenter (kept distinct; chippy → Joiner per Zlog UK site convention)
  joiner: 'Joiner',
  carpenter: 'Carpenter',
  chippy: 'Joiner',

  // Labourer
  labourer: 'Labourer',
  laborer: 'Labourer',
  'general labourer': 'Labourer',
  'general laborer': 'Labourer',

  // Painter / Decorator
  painter: 'Painter',
  decorator: 'Decorator',
  'painter & decorator': 'Painter & Decorator',
  'painter and decorator': 'Painter & Decorator',
  'painter/decorator': 'Painter & Decorator',

  // Plumber
  plumber: 'Plumber',
  plumbing: 'Plumber',

  // Scaffolder — never maps to Electrician
  scaff: 'Scaffolder',
  scaffold: 'Scaffolder',
  scaffolder: 'Scaffolder',
  scaffolding: 'Scaffolder',

  // Bricklayer
  bricklayer: 'Bricklayer',
  brickie: 'Bricklayer',
  bricklaying: 'Bricklayer',

  // Plasterer
  plasterer: 'Plasterer',
  plastering: 'Plasterer',

  // Dryliner
  dryliner: 'Dryliner',
  'dry liner': 'Dryliner',
  'dry lining': 'Dryliner',
  drylining: 'Dryliner',
  fixer: 'Dryliner',

  // Groundworker
  groundworker: 'Groundworker',
  groundwork: 'Groundworker',
  groundworks: 'Groundworker',

  // Steel / rebar / concrete / formwork
  'steel fixer': 'Steel fixer',
  steelfixer: 'Steel fixer',
  'rebar fixer': 'Rebar fixer',
  rebar: 'Rebar fixer',
  'concrete operative': 'Concrete operative',
  concretor: 'Concrete operative',
  'shuttering carpenter': 'Shuttering carpenter',
  shuttering: 'Shuttering carpenter',
  'formwork carpenter': 'Formwork carpenter',
  formwork: 'Formwork carpenter',

  // Finishes / envelope
  roofer: 'Roofer',
  roofing: 'Roofer',
  tiler: 'Tiler',
  tiling: 'Tiler',
  'floor layer': 'Floor layer',
  floorlayer: 'Floor layer',
  'ceiling fixer': 'Ceiling fixer',
  'partition fixer': 'Partition fixer',
  glazier: 'Glazier',
  glazing: 'Glazier',
  welder: 'Welder',
  welding: 'Welder',
  fabricator: 'Fabricator',
  fabrication: 'Fabricator',

  // M&E
  pipefitter: 'Pipefitter',
  'pipe fitter': 'Pipefitter',
  'mechanical fitter': 'Mechanical fitter',
  'duct fitter': 'Duct fitter',
  ductworker: 'Ductworker',
  'duct worker': 'Ductworker',
  'sprinkler fitter': 'Sprinkler fitter',
  'fire stopper': 'Fire stopper',
  firestopper: 'Fire stopper',
  'insulation operative': 'Insulation operative',
  insulator: 'Insulation operative',

  // Cladding / windows
  cladder: 'Cladder',
  cladding: 'Cladder',
  'curtain wall installer': 'Curtain wall installer',
  'window installer': 'Window installer',

  // Masonry / ground
  mason: 'Mason',
  'stone mason': 'Stone mason',
  stonemason: 'Stone mason',
  pavior: 'Pavior',
  paver: 'Pavior',
  paviour: 'Pavior',
  'kerb layer': 'Kerb layer',
  kerblayer: 'Kerb layer',
  'drainage operative': 'Drainage operative',

  // Plant / traffic
  'plant operator': 'Plant operator',
  'crane operator': 'Crane operator',
  banksman: 'Banksman',
  banksmen: 'Banksman',
  slinger: 'Slinger / Signaller',
  signaller: 'Slinger / Signaller',
  'slinger / signaller': 'Slinger / Signaller',
  'slinger/signaller': 'Slinger / Signaller',
  'traffic marshal': 'Traffic marshal',
  'telehandler operator': 'Telehandler operator',
  telehandler: 'Telehandler operator',
  'mewp operator': 'MEWP operator',
  mewp: 'MEWP operator',

  // Specialist / site support
  'demolition operative': 'Demolition operative',
  demolition: 'Demolition operative',
  'asbestos operative': 'Asbestos operative',
  cleaner: 'Cleaner',
  cleaning: 'Cleaner',
})

/**
 * @param {unknown} trade
 * @returns {string|null} trimmed single-spaced lower key, or null
 */
export function constructionTradeAliasKey(trade) {
  if (trade == null) return null
  const text = String(trade).trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.toLowerCase()
}

/**
 * Deterministic alias / exact-canonical canonicalisation only.
 * Unknown strings are returned trimmed (not forced into a nearby trade).
 *
 * @param {unknown} trade
 * @returns {string|null}
 */
export function canonicalizeConstructionTrade(trade) {
  const key = constructionTradeAliasKey(trade)
  if (key == null) return null

  const aliased = CONSTRUCTION_TRADE_ALIAS_TO_CANONICAL[key]
  if (aliased) return aliased

  for (const canonical of CONSTRUCTION_TRADE_CANONICALS) {
    if (canonical.toLowerCase() === key) return canonical
  }

  // Preserve OCR text when not a known alias — never invent a different trade.
  return String(trade).trim().replace(/\s+/g, ' ')
}

/**
 * Compact vocabulary block for Claude trade-reading instructions.
 * Reminds the model that aliases help interpretation; image evidence is primary.
 */
export function constructionTradeVocabularyPromptBlock() {
  const aliasesByCanonical = new Map()
  for (const [alias, canonical] of Object.entries(CONSTRUCTION_TRADE_ALIAS_TO_CANONICAL)) {
    if (alias === canonical.toLowerCase()) continue
    const list = aliasesByCanonical.get(canonical) || []
    list.push(alias)
    aliasesByCanonical.set(canonical, list)
  }

  const lines = CONSTRUCTION_TRADE_CANONICALS.map((canonical) => {
    const aliases = aliasesByCanonical.get(canonical) || []
    if (aliases.length === 0) return `- ${canonical}`
    return `- ${canonical} (also: ${aliases.join(', ')})`
  })

  return `UK construction trade vocabulary (reference for interpreting handwritten Trade cells):
${lines.join('\n')}

Vocabulary rules:
- Prefer a canonical trade label from this list when the handwriting clearly matches that trade or a listed alias (examples: Spark/Sparky → Electrician; Scaff/Scaffolder → Scaffolder; Chippy → Joiner; Brickie → Bricklayer).
- Scaff / scaffold / scaffolder means Scaffolder. It is NOT Electrician. Never substitute Scaffolder for Electrician or vice versa.
- The photograph is primary evidence. The vocabulary is a reference, not permission to guess.
- If handwriting could plausibly be more than one trade (for example Spark vs Scaff), return trade null rather than inventing certainty.
- Do not invent a trade that is not supported by the cell. Do not extract names or companies.`
}
