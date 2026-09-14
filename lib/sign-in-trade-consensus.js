/**
 * Sign-in OCR — rich internal row-context consensus for TRADE review.
 * Optional person_name + company are VISUAL/STRUCTURAL anchors only.
 * They are never published. Dates and clocks are immutable.
 * No fuzzy trade matching; construction aliases apply AFTER this pass.
 */

import {
  CLAUDE_OCR_BENCHMARK_MODEL,
  resolveClaudeBenchmarkTradeReviewField,
} from './parse-signin-sheet-claude-benchmark.js'

export const SIGNIN_RICH_TRADE_CONSENSUS_MODEL = CLAUDE_OCR_BENCHMARK_MODEL

/** @deprecated Use SIGNIN_RICH_TRADE_CONSENSUS_MODEL — former trade-only name retired. */
export const SIGNIN_TRADE_CONSENSUS_MODEL = SIGNIN_RICH_TRADE_CONSENSUS_MODEL

/**
 * Second-pass: re-examine Trade using optional name/company as row anchors only.
 * Does not publish names/companies. Does not infer trade from identity/employer.
 */
export const SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT = `You review TRADE cells on a UK construction site sign-in / attendance register photo.
You are given the same upright image plus first-pass row anchors for already-extracted qualified rows:
source_row, work_date, time_in, time_out, trade (may be null), and optional person_name / optional company.
Return ONLY valid JSON with this shape:
{"rows":[{"source_row":number,"trade":{"raw_value":"string|null","normalized_value":"string|null","confidence":number|null,"needs_review":boolean}}]}

Rules:
- Your job is to re-examine the TRADE cell for each row.
- source_row, work_date, time_in, and time_out are ROW LOCATION ANCHORS ONLY — use them together to find the correct physical row and Trade cell on the sheet. Do NOT infer or guess trade from the date or clock times themselves.
- person_name and company (when present) are optional VISUAL / STRUCTURAL ROW ANCHORS only — use them to help locate the row. Do not depend on them when they are null.
- Do NOT infer trade from a worker's identity. Forbidden: assuming a trade because of who the person is, or because of a previous diary / roster.
- Do NOT infer trade from the employer / company. Forbidden: assuming Scaffolder because the company often employs scaffolders, or Electrician because another row's company looks electrical.
- Do NOT infer trade from neighbouring workers, common site patterns, or how often other trades appear on the sheet.
- Do NOT return or alter Name, Company, Date, Time In, or Time Out. Return TRADE review fields only.
- Do not add or remove rows. Return exactly one object per provided source_row.
- raw_value must echo the first-pass Trade text you were given for that row (or null if it was null). Never invent a different raw_value.
- normalized_value is your best sheet-supported reading of that Trade cell from the ink in the image.
- Use the image as primary evidence. Row anchors help alignment; they must not manufacture a trade.
- Do not invent a trade merely because it is common on construction sites.
- When first-pass trade is null: independently inspect the Trade cell for that row. Use source_row + work_date + time_in + time_out to locate the row. Do NOT treat "first pass was blank" as a reason to skip a second visual read. If the handwritten trade is clearly readable, return normalized_value and needs_review false. If genuinely unclear, normalized_value null and needs_review true. Do not guess.
- If first-pass trade is present but wrong (for example misread Scaff when the ink is Spark/Sparky), you may correct normalized_value when the handwritten Trade cell clearly supports the correction.
- If handwriting is genuinely ambiguous, keep needs_review true and do not invent certainty.
- confidence is optional (0 to 1). If unsure, prefer needs_review true over a confident guess.
- Return every source_row you were given.`

function fieldText(value) {
  if (value == null) return ''
  return String(value).trim().replace(/\s+/g, ' ')
}

function nullableText(value) {
  const text = fieldText(value)
  return text || null
}

function extractJson(text) {
  if (!text) return null
  const trimmed = String(text).trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * Rich consensus input — row location anchors (no PII required) + optional name/company.
 * Dates/clocks are for locating the row on the image, not for inferring trade.
 *
 * @param {unknown[]} operatives
 * @returns {{
 *   source_row: number,
 *   work_date: string|null,
 *   time_in: string|null,
 *   time_out: string|null,
 *   trade: string|null,
 *   person_name: string|null,
 *   company: string|null,
 * }[]}
 */
export function buildSignInRichTradeConsensusInput(operatives = []) {
  const list = Array.isArray(operatives) ? operatives : []
  const out = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const sourceRow = Number(row.source_row)
    if (!Number.isFinite(sourceRow)) continue
    out.push({
      source_row: sourceRow,
      work_date: nullableText(row.work_date ?? row.date),
      time_in: nullableText(row.time_in ?? row.signed_in_at),
      time_out: nullableText(row.time_out ?? row.signed_out_at),
      trade: nullableText(row.trade),
      person_name: nullableText(row.person_name ?? row.name),
      company: nullableText(row.company),
    })
  }
  return out
}

/**
 * Merge trade review from rich consensus. Dates/clocks/source_row immutable.
 * Does not publish or rewrite name/company from the consensus payload.
 *
 * @param {unknown[]} operatives
 * @param {unknown[]} consensusRows
 */
export function applySignInRichTradeConsensus(operatives = [], consensusRows = []) {
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

    const tradeRaw = nullableText(row.trade)
    const sourceRow = Number.isFinite(Number(row.source_row)) ? Number(row.source_row) : null
    const consensus = sourceRow != null ? bySource.get(sourceRow) : null
    const tradeReview = resolveClaudeBenchmarkTradeReviewField(tradeRaw, consensus?.trade)

    return {
      ...row,
      trade: tradeRaw,
      trade_raw: tradeReview.raw_value,
      trade_reviewed: tradeReview.reviewed_value,
      trade_needs_review: tradeReview.needs_review,
      trade_confidence: tradeReview.confidence,
      // Immutable operational fields
      date: row.date,
      work_date: row.work_date,
      time_in: row.time_in,
      time_out: row.time_out,
      source_row: row.source_row,
      // First-pass anchors preserved for this pass only; stripped before UI publish.
      person_name: row.person_name,
      company: row.company,
    }
  })
}

/**
 * Second Claude pass — TRADE review with rich optional name/company row anchors.
 *
 * @param {{
 *   apiKey: string,
 *   visionImage: { mediaType: string, data: string },
 *   operatives: unknown[],
 * }} args
 */
export async function runSignInRichTradeConsensusPass({ apiKey, visionImage, operatives }) {
  const consensusInput = buildSignInRichTradeConsensusInput(operatives)
  if (consensusInput.length === 0) {
    return {
      operatives,
      tradeConsensusPass: {
        status: 'skipped',
        reason: 'no-rows',
        inputRowCount: 0,
        reviewedRowCount: 0,
        mode: 'rich-row-context',
      },
    }
  }

  const consensusRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: SIGNIN_RICH_TRADE_CONSENSUS_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Re-examine the Trade cell for each already-extracted row. Use source_row with work_date, time_in, and time_out as row-location anchors to find the correct row on the image — not to infer trade from clocks or date. Optional person_name and company may help locate the row when present. Do not infer trade from identity, employer, neighbouring workers, or site patterns. Do not change Date, Time In, Time Out, Name, or Company. Do not add or remove rows. When first-pass trade is null, independently read that row's Trade cell from the image; if clearly readable set normalized_value and needs_review false; if unclear set normalized_value null and needs_review true. Do not skip a second read because the first pass was blank. Do not guess.\n\nFirst-pass row anchors by source_row:\n${JSON.stringify({ rows: consensusInput })}`,
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: visionImage.mediaType,
                data: visionImage.data,
              },
            },
          ],
        },
      ],
    }),
  })

  const consensusJson = await consensusRes.json().catch(() => ({}))
  if (!consensusRes.ok) {
    const message =
      consensusJson?.error?.message ||
      `Claude rich trade consensus API error (${consensusRes.status})`
    return {
      operatives,
      tradeConsensusPass: {
        status: 'error',
        error: message,
        inputRowCount: consensusInput.length,
        reviewedRowCount: 0,
        mode: 'rich-row-context',
      },
    }
  }

  const contentBlocks = Array.isArray(consensusJson?.content) ? consensusJson.content : []
  const textBlock = contentBlocks.find((block) => block?.type === 'text')
  const parsed = extractJson(textBlock?.text || '')
  const consensusRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  const merged = applySignInRichTradeConsensus(operatives, consensusRows)

  return {
    operatives: merged,
    tradeConsensusPass: {
      status: 'ok',
      inputRowCount: consensusInput.length,
      reviewedRowCount: consensusRows.length,
      mode: 'rich-row-context',
    },
  }
}
