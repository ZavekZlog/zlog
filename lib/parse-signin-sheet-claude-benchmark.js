/**
 * TEMPORARY Claude vision labour OCR benchmark — client helper.
 * Does not replace production OpenAI OCR (`parseSignInSheetImage`).
 * Benchmark must not write to the database.
 *
 * Step B: send the original uploaded file bytes (no 1600px / 0.82 resize-reencode).
 */

/** Strongest Claude vision model confirmed available on this Anthropic account. */
export const CLAUDE_OCR_BENCHMARK_MODEL = 'claude-sonnet-4-5-20250929'

/**
 * Second-pass Company/Trade consensus uses the same confirmed model.
 * Benchmark only — does not change Name / Date / Time In / Time Out.
 */
export const CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL = CLAUDE_OCR_BENCHMARK_MODEL

/**
 * Benchmark-only second-pass prompt: Company + Trade spelling consensus from sheet context.
 * Does not re-extract the register. No project vocabulary / prior-diary dictionaries.
 */
export const CLAUDE_OCR_BENCHMARK_CONSENSUS_SYSTEM_PROMPT = `You review Company and Trade spellings on a construction site sign-in / attendance register photo.
You are given the same upright image plus the first-pass Company and Trade values for already-extracted qualified rows.
Return ONLY valid JSON with this shape:
{"rows":[{"source_row":number,"company":{"raw_value":"string|null","normalized_value":"string|null","confidence":number|null,"needs_review":boolean},"trade":{"raw_value":"string|null","normalized_value":"string|null","confidence":number|null,"needs_review":boolean}}]}

Rules:
- Company and Trade only. Do not return or alter Name, Date, Time In, or Time Out.
- Do not add or remove rows. Return exactly one object per provided source_row. Preserve every source_row you were given.
- raw_value must echo the first-pass Company/Trade text you were given for that row (or null if it was null). Never invent a different raw_value.
- normalized_value is your best sheet-supported spelling of that Company/Trade cell.
- Use the image and repeated handwriting across nearby rows as evidence for ambiguous letters (for example SAC vs SHC) only when neighbouring entries and the ink support it.
- Do not invent a company or trade merely because it is common on construction sites.
- Do not invent a company or trade to fill a null first-pass value.
- Preserve unusual but clearly written values — do not “correct” them into a more familiar name.
- If genuinely uncertain, keep normalized_value equal to raw_value and set needs_review to true.
- Sheet-context only. Do not use project dictionaries, prior diaries, or external company lists.
- confidence is optional (0 to 1). If unsure, prefer needs_review true over a confident guess.
- Return every source_row you were given.`

const HEADER_FIELD_TOKENS = new Set([
  'date',
  'name',
  'person',
  'person name',
  'operative',
  'operative name',
  'company',
  'trade',
  'time in',
  'time out',
  'timein',
  'timeout',
  'sign in',
  'sign out',
  'signature',
  'sign',
])

/**
 * Parse a browser data URL into Anthropic Messages image source parts.
 * @param {string} dataUrl
 * @returns {{ mediaType: string, data: string } | null}
 */
export function parseVisionDataUrlForClaude(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  let mediaType = match[1].toLowerCase()
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg'
  const data = match[2].replace(/\s+/g, '')
  if (!data) return null
  return { mediaType, data }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function fieldText(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function fieldKey(value) {
  return fieldText(value).toLowerCase().replace(/\s+/g, ' ')
}

/**
 * True when the row looks like table-header metadata
 * (Date / Name / Company / Trade / Time In / Time Out / Signature),
 * not a populated operative line.
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isClaudeBenchmarkHeaderRow(row) {
  if (!row || typeof row !== 'object') return false
  const candidates = [
    row.date,
    row.work_date,
    row.day,
    row.person_name,
    row.name,
    row.operative,
    row.trade,
    row.role,
    row.company,
    row.subcontractor,
    row.time_in,
    row.signed_in_at,
    row.time_out,
    row.signed_out_at,
  ]
    .map(fieldKey)
    .filter(Boolean)

  if (candidates.length === 0) return false

  const headerHits = candidates.filter((value) => HEADER_FIELD_TOKENS.has(value))
  // Header line: every non-empty cell is a known column label.
  return headerHits.length === candidates.length && headerHits.length >= 2
}

/**
 * True when every meaningful operative field is null/blank.
 * Do not invent values merely to keep the row.
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isClaudeBenchmarkBlankOperativeRow(row) {
  if (!row || typeof row !== 'object') return true
  const date = fieldText(row.date ?? row.work_date ?? row.day)
  const name = fieldText(row.person_name ?? row.name ?? row.operative)
  const trade = fieldText(row.trade ?? row.role)
  const company = fieldText(row.company ?? row.subcontractor ?? row.employer)
  const timeIn = fieldText(row.time_in ?? row.signed_in_at ?? row.signin_at)
  const timeOut = fieldText(row.time_out ?? row.signed_out_at ?? row.signout_at)
  return !date && !name && !trade && !company && !timeIn && !timeOut
}

/**
 * True when date is populated but every operative-content field is null/blank.
 * A date alone is not an operative row.
 *
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isClaudeBenchmarkSparseDateOnlyRow(row) {
  if (!row || typeof row !== 'object') return false
  const date = fieldText(row.date ?? row.work_date ?? row.day)
  if (!date) return false
  const name = fieldText(row.person_name ?? row.name ?? row.operative)
  const trade = fieldText(row.trade ?? row.role)
  const company = fieldText(row.company ?? row.subcontractor ?? row.employer)
  const timeIn = fieldText(row.time_in ?? row.signed_in_at ?? row.signin_at)
  const timeOut = fieldText(row.time_out ?? row.signed_out_at ?? row.signout_at)
  return !name && !trade && !company && !timeIn && !timeOut
}

/**
 * Benchmark-only row qualification:
 * - drop table header/metadata rows
 * - drop entirely blank operative rows
 * - drop sparse date-only rows (date set, no name/trade/company/times)
 * - renumber source_row so 1 = first populated operative below the header
 *
 * @param {unknown[]} rawRows
 * @param {unknown} visibleAttendeeCount
 */
export function qualifyClaudeBenchmarkOperativeRows(rawRows = [], visibleAttendeeCount = null) {
  const list = Array.isArray(rawRows) ? rawRows : []
  let droppedHeaderCount = 0
  let droppedBlankCount = 0
  let droppedSparseDateOnlyCount = 0
  /** @type {Record<string, unknown>[]} */
  const kept = []

  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    if (isClaudeBenchmarkHeaderRow(row)) {
      droppedHeaderCount += 1
      continue
    }
    if (isClaudeBenchmarkBlankOperativeRow(row)) {
      droppedBlankCount += 1
      continue
    }
    if (isClaudeBenchmarkSparseDateOnlyRow(row)) {
      droppedSparseDateOnlyCount += 1
      continue
    }
    kept.push({ ...row })
  }

  const rows = kept.map((row, index) => ({
    ...row,
    source_row: index + 1,
  }))

  return {
    rows,
    visibleAttendeeCount: rows.length,
    droppedHeaderCount,
    droppedBlankCount,
    droppedSparseDateOnlyCount,
    rawVisibleAttendeeCount:
      visibleAttendeeCount != null && Number.isFinite(Number(visibleAttendeeCount))
        ? Number(visibleAttendeeCount)
        : null,
  }
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function nullableIdentityText(value) {
  const text = fieldText(value)
  return text || null
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function nullableConfidence(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 1) return null
  return n
}

/**
 * Build second-pass input from already-extracted qualified operatives.
 * Company / Trade only — no names, dates, or times.
 *
 * @param {unknown[]} operatives
 * @returns {{ source_row: number, company: string|null, trade: string|null }[]}
 */
export function buildClaudeBenchmarkCompanyTradeConsensusInput(operatives = []) {
  const list = Array.isArray(operatives) ? operatives : []
  /** @type {{ source_row: number, company: string|null, trade: string|null }[]} */
  const out = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const sourceRow = Number(row.source_row)
    if (!Number.isFinite(sourceRow)) continue
    out.push({
      source_row: sourceRow,
      company: nullableIdentityText(row.company),
      trade: nullableIdentityText(row.trade),
    })
  }
  return out
}

/**
 * Resolve one Company or Trade review field without inventing fills.
 * First-pass raw is always authoritative for the raw slot.
 *
 * @param {string|null} rawValue
 * @param {unknown} review
 */
export function resolveClaudeBenchmarkIdentityReviewField(rawValue, review) {
  const raw = nullableIdentityText(rawValue)
  if (raw == null) {
    // Never invent a company/trade merely to fill a null first-pass cell.
    return {
      raw_value: null,
      reviewed_value: null,
      needs_review: true,
      confidence: null,
    }
  }

  if (!review || typeof review !== 'object') {
    return {
      raw_value: raw,
      reviewed_value: raw,
      needs_review: true,
      confidence: null,
    }
  }

  const needsReview = review.needs_review === true
  const normalized = nullableIdentityText(review.normalized_value)
  const confidence = nullableConfidence(review.confidence)

  if (needsReview) {
    return {
      raw_value: raw,
      reviewed_value: raw,
      needs_review: true,
      confidence,
    }
  }

  return {
    raw_value: raw,
    reviewed_value: normalized != null ? normalized : raw,
    needs_review: false,
    confidence,
  }
}

/**
 * Merge Company/Trade consensus onto first-pass operatives.
 * Preserves Name, Date, Time In/Out, hours, source_row, row count, and first-pass company/trade.
 *
 * @param {unknown[]} operatives
 * @param {unknown[]} consensusRows
 */
export function applyClaudeBenchmarkCompanyTradeConsensus(operatives = [], consensusRows = []) {
  const list = Array.isArray(operatives) ? operatives : []
  /** @type {Map<number, Record<string, unknown>>} */
  const bySource = new Map()
  for (const row of Array.isArray(consensusRows) ? consensusRows : []) {
    if (!row || typeof row !== 'object') continue
    const sourceRow = Number(row.source_row)
    if (!Number.isFinite(sourceRow)) continue
    bySource.set(sourceRow, row)
  }

  return list.map((row) => {
    if (!row || typeof row !== 'object') return row

    const companyRaw = nullableIdentityText(row.company)
    const tradeRaw = nullableIdentityText(row.trade)
    const sourceRow = Number.isFinite(Number(row.source_row)) ? Number(row.source_row) : null
    const consensus = sourceRow != null ? bySource.get(sourceRow) : null

    const companyReview = resolveClaudeBenchmarkIdentityReviewField(companyRaw, consensus?.company)
    const tradeReview = resolveClaudeBenchmarkIdentityReviewField(tradeRaw, consensus?.trade)

    return {
      ...row,
      // First-pass identity fields remain intact.
      company: companyRaw,
      trade: tradeRaw,
      company_raw: companyReview.raw_value,
      company_reviewed: companyReview.reviewed_value,
      company_needs_review: companyReview.needs_review,
      company_confidence: companyReview.confidence,
      trade_raw: tradeReview.raw_value,
      trade_reviewed: tradeReview.reviewed_value,
      trade_needs_review: tradeReview.needs_review,
      trade_confidence: tradeReview.confidence,
      needs_review: companyReview.needs_review || tradeReview.needs_review,
    }
  })
}

/**
 * Benchmark-only deterministic trade slang → canonical trade.
 * Spark / Sparky only (case-insensitive, whitespace-tolerant).
 * Does not invent other mappings.
 *
 * @param {unknown} trade
 * @returns {string|null}
 */
export function normalizeClaudeBenchmarkTradeValue(trade) {
  const raw = nullableIdentityText(trade)
  if (raw == null) return null
  const key = raw.toLowerCase().replace(/\s+/g, ' ')
  if (key === 'spark' || key === 'sparky') return 'Electrician'
  return raw
}

/**
 * Attach trade_normalized from reviewed Trade (fallback: first-pass trade).
 * Never overwrites trade_raw or trade_reviewed.
 *
 * @param {unknown[]} operatives
 */
export function applyClaudeBenchmarkTradeNormalisation(operatives = []) {
  const list = Array.isArray(operatives) ? operatives : []
  return list.map((row) => {
    if (!row || typeof row !== 'object') return row
    const reviewedSource = Object.prototype.hasOwnProperty.call(row, 'trade_reviewed')
      ? row.trade_reviewed
      : row.trade
    return {
      ...row,
      trade_normalized: normalizeClaudeBenchmarkTradeValue(reviewedSource),
    }
  })
}

/** Benchmark-only break deduction options. Default = none. */
export const CLAUDE_BENCHMARK_BREAK_NONE = 'none'
export const CLAUDE_BENCHMARK_BREAK_30 = '30min'
export const CLAUDE_BENCHMARK_BREAK_60 = '60min'

export const CLAUDE_BENCHMARK_BREAK_OPTIONS = [
  { value: CLAUDE_BENCHMARK_BREAK_NONE, label: 'None', hours: 0 },
  { value: CLAUDE_BENCHMARK_BREAK_30, label: '30 min', hours: 0.5 },
  { value: CLAUDE_BENCHMARK_BREAK_60, label: '60 min', hours: 1 },
]

/**
 * Map a break selector value to hours deducted.
 * @param {unknown} value
 * @returns {number}
 */
export function breakDeductionHoursFromValue(value) {
  const key = String(value || CLAUDE_BENCHMARK_BREAK_NONE).trim().toLowerCase()
  if (key === CLAUDE_BENCHMARK_BREAK_30 || key === '30' || key === '0.5') return 0.5
  if (key === CLAUDE_BENCHMARK_BREAK_60 || key === '60' || key === '1') return 1
  return 0
}

/**
 * net_hours = max(0, gross_hours - break_deduction_hours)
 * Does not alter Time In / Time Out or gross hours.
 *
 * @param {unknown} grossHours
 * @param {unknown} breakDeductionHours
 * @returns {number|null}
 */
export function netHoursAfterBreakDeduction(grossHours, breakDeductionHours = 0) {
  if (grossHours == null || grossHours === '') return null
  const gross = Number(grossHours)
  if (!Number.isFinite(gross)) return null
  const deduct = Number(breakDeductionHours)
  const safeDeduct = Number.isFinite(deduct) && deduct > 0 ? deduct : 0
  return Math.max(0, Math.round((gross - safeDeduct) * 100) / 100)
}

/**
 * Apply one bulk break value to every included matched operative.
 * Preserves time_in / time_out / hours (gross). Adds break + net fields.
 *
 * @param {unknown[]} operatives
 * @param {unknown} breakValue
 */
export function applyBulkBreakDeductionToMatchedOperatives(
  operatives = [],
  breakValue = CLAUDE_BENCHMARK_BREAK_NONE,
) {
  const list = Array.isArray(operatives) ? operatives : []
  const deductHours = breakDeductionHoursFromValue(breakValue)
  const normalizedValue =
    deductHours === 0.5
      ? CLAUDE_BENCHMARK_BREAK_30
      : deductHours === 1
        ? CLAUDE_BENCHMARK_BREAK_60
        : CLAUDE_BENCHMARK_BREAK_NONE

  return list.map((row) => {
    if (!row || typeof row !== 'object') return row
    const isMatchedIncluded = row.dateStatus === 'match' && row.included !== false
    if (!isMatchedIncluded) {
      return {
        ...row,
        gross_hours: row.hours ?? null,
        break_deduction: CLAUDE_BENCHMARK_BREAK_NONE,
        break_deduction_hours: 0,
        net_hours: row.hours ?? null,
      }
    }
    const gross = row.hours ?? null
    return {
      ...row,
      time_in: row.time_in,
      time_out: row.time_out,
      hours: gross,
      gross_hours: gross,
      break_deduction: normalizedValue,
      break_deduction_hours: deductHours,
      net_hours: netHoursAfterBreakDeduction(gross, deductHours),
    }
  })
}

/**
 * Override break deduction for one operative (by source_row). Other rows unchanged.
 *
 * @param {unknown[]} operatives
 * @param {unknown} sourceRow
 * @param {unknown} breakValue
 */
export function applyIndividualBreakDeductionOverride(
  operatives = [],
  sourceRow,
  breakValue = CLAUDE_BENCHMARK_BREAK_NONE,
) {
  const list = Array.isArray(operatives) ? operatives : []
  const target = Number(sourceRow)
  const deductHours = breakDeductionHoursFromValue(breakValue)
  const normalizedValue =
    deductHours === 0.5
      ? CLAUDE_BENCHMARK_BREAK_30
      : deductHours === 1
        ? CLAUDE_BENCHMARK_BREAK_60
        : CLAUDE_BENCHMARK_BREAK_NONE

  return list.map((row) => {
    if (!row || typeof row !== 'object') return row
    if (!Number.isFinite(target) || Number(row.source_row) !== target) return row
    const gross = row.gross_hours ?? row.hours ?? null
    return {
      ...row,
      time_in: row.time_in,
      time_out: row.time_out,
      hours: row.hours,
      gross_hours: gross,
      break_deduction: normalizedValue,
      break_deduction_hours: deductHours,
      net_hours: netHoursAfterBreakDeduction(gross, deductHours),
    }
  })
}

/**
 * Sum net (or gross) hours for included matched operatives.
 *
 * @param {unknown[]} operatives
 * @param {'net'|'gross'} [mode='net']
 * @returns {number}
 */
export function sumClaudeBenchmarkMatchedHours(operatives = [], mode = 'net') {
  const list = Array.isArray(operatives) ? operatives : []
  let total = 0
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    if (row.dateStatus !== 'match' || row.included === false) continue
    const value =
      mode === 'gross'
        ? row.gross_hours ?? row.hours
        : row.net_hours ?? row.gross_hours ?? row.hours
    const n = Number(value)
    if (Number.isFinite(n)) total += n
  }
  return Math.round(total * 100) / 100
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read original image bytes'))
    }
    reader.onerror = () => reject(reader.error || new Error('Could not read original image bytes'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Probe decoded pixel size for diagnostics only. Does not alter the bytes sent to Claude.
 * @param {Blob} blob
 * @returns {Promise<{ width: number|null, height: number|null }>}
 */
async function probeDecodedDimensions(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const width = bitmap.width || null
      const height = bitmap.height || null
      if (typeof bitmap.close === 'function') bitmap.close()
      return { width, height }
    } catch {
      /* fall through */
    }
  }
  return { width: null, height: null }
}

/**
 * Step B — original uploaded image for Claude benchmark only.
 * - No maxEdge resize
 * - No JPEG quality re-encode
 * - FileReader data URL of the original file bytes (EXIF orientation tag preserved in JPEG)
 *
 * @param {File|Blob} file
 */
export async function fileToOriginalClaudeBenchmarkImage(file) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('image file is required')
  }

  const byteSize = Number(file.size) || 0
  const dataUrl = await blobToDataUrl(file)
  const parsed = parseVisionDataUrlForClaude(dataUrl)
  if (!parsed) {
    throw new Error('original image must be a supported image type')
  }

  const declaredType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : ''
  const mediaType =
    declaredType === 'image/jpg'
      ? 'image/jpeg'
      : declaredType.startsWith('image/')
        ? declaredType
        : parsed.mediaType

  const { width, height } = await probeDecodedDimensions(file)

  return {
    dataUrl,
    byteSize,
    mediaType,
    width,
    height,
    resized: false,
    reencoded: false,
    pipeline: 'original-file-bytes-v1',
  }
}

/**
 * Call the temporary Claude OCR benchmark API with original-image bytes.
 * No Apply / persistence.
 */
export async function parseSignInSheetImageClaudeBenchmark({
  dataUrl,
  reportDate,
  groupBy = 'trade_company',
  imageMeta = null,
} = {}) {
  const res = await fetch('/api/parse-signin-sheet-claude-benchmark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, reportDate, groupBy, imageMeta }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || `Claude OCR benchmark failed (${res.status})`)
  }
  return payload
}
