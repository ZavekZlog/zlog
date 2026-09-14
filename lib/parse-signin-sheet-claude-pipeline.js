/**
 * Accepted Claude sign-in OCR pipeline (production).
 * First-pass may read optional name/company as internal row anchors.
 * Rich second-pass consensus reviews TRADE using those anchors.
 * Post-consensus construction aliases → Trade + Hours only (names/companies stripped).
 * No break deduction. No database writes.
 */

import { hoursFromSignInOut } from './labour-from-register.js'
import { labourFromOcrSheet } from './parse-signin-sheet.js'
import {
  CLAUDE_OCR_BENCHMARK_MODEL,
  applyClaudeBenchmarkTradeNormalisation,
  parseVisionDataUrlForClaude,
  qualifyClaudeBenchmarkOperativeRows,
} from './parse-signin-sheet-claude-benchmark.js'
import { runSignInRichTradeConsensusPass } from './sign-in-trade-consensus.js'

export const CLAUDE_SIGNIN_OCR_MODEL = CLAUDE_OCR_BENCHMARK_MODEL

/**
 * Calm first-pass extraction. Optional name/company are internal anchors only.
 * Do NOT prime with construction vocabulary. Do NOT force canonical trades here.
 */
const SYSTEM_PROMPT = `You extract genuine operative rows from construction site sign-in / attendance register photos.
Return ONLY valid JSON with this shape:
{"visible_attendee_count":number,"rows":[{"source_row":number,"date":"YYYY-MM-DD","person_name":"string|null","company":"string|null","trade":"string|null","time_in":"HH:MM|null","time_out":"HH:MM|null"}]}

Rules:
- Inspect the table row by row from top to bottom. Do not skip the middle or stop early after a subset.
- Inspect every physical row independently.
- Do NOT treat the table heading row (Date / Name / Company / Trade / Time In / Time Out / Signature) as an operative. Skip that heading row entirely.
- visible_attendee_count = how many distinct populated operative lines you can see (including partially filled rows). Count the populated operative rows before you return JSON. rows.length must equal visible_attendee_count. Do not count the heading row.
- source_row = physical operative-line index on the sheet, starting at 1 for the first populated operative line below the header. Diagnostic only. Consecutive populated lines should have consecutive source_row values; a gap means a line was skipped.
- One object in rows per physically populated operative line. Never merge neighbouring handwritten rows. Never copy one row's data into another.
- Prefer ISO dates. If the sheet uses DD/MM/YYYY, convert correctly (UK format).
- Keep rows for different calendar dates distinct (for example 5 Sep and 6 Sep must remain separate rows).
- person_name = optional handwritten name if clearly readable; otherwise null. Do not invent a name.
- company = optional employer / subcontractor if clearly readable; otherwise null. Do not invent a company.
- Unreadable person_name or company must not cause you to drop the row. Still return date, trade, and clocks when those cells are present.
- trade = the trade / role cell as handwritten on the sheet. Read it accurately. Do not force a canonical trade label. If trade is unreadable, use null. Do not invent a plausible trade.
- Do NOT extract signatures. Do NOT extract break information.
- Time In / Time Out:
  - First identify the exact physical Time In column and Time Out column on the sheet (header labels). Do not read a different column.
  - time_in / time_out = clock strings as written on the sheet (examples: 08:00, 8.00, 16:15, 4:30). Preserve the handwritten minutes exactly.
  - Read each row’s own handwritten clocks independently from those two columns only. Do not assume every row uses the same clock style.
  - Never infer a standard shift. Never copy a time pair from another row. Never convert an unclear time into a plausible common site time (do not “correct” to 07:00, 08:00, 15:30, 16:00, or 16:30).
  - Distinguish carefully between handwritten 5 and 7, and between 0, 3, 5, and 8.
  - If a clock value is genuinely unreadable, return null for that field. Still return the row.
- Do NOT calculate, estimate, or invent hours. Never include an hours field. The application calculates hours from time_in and time_out.
- If a field is missing or unreadable, use null. Still return the row. Do not drop a populated line because one cell is unreadable.
- Do not invent people who are not on the sheet.
- Never copy values from neighbouring rows.
- Include the date column value for EVERY row even when the sheet groups by date headers.
- Return every populated operative row (not the heading row).`

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
 * Shape operatives for Site Diary Trade + Hours review.
 * Publishes reviewed/canonical trade + hours only.
 * Strips person_name / company so they never reach the product UI.
 *
 * @param {unknown[]} operatives
 */
export function shapeClaudePhaseAReviewOperatives(operatives = []) {
  return (Array.isArray(operatives) ? operatives : []).map((row) => {
    if (!row || typeof row !== 'object') return row
    const tradeNormalized =
      row.trade_normalized ?? row.trade_reviewed ?? row.trade ?? null
    const hoursOnSite = hoursFromSignInOut(row.time_in, row.time_out)
    const tradeRaw = Object.prototype.hasOwnProperty.call(row, 'trade_raw')
      ? row.trade_raw
      : row.trade ?? null
    return {
      ...row,
      trade_raw: tradeRaw,
      trade: tradeNormalized,
      hours: hoursOnSite,
      hours_on_site: hoursOnSite,
      // Internal anchors discarded before user-facing Trade + Hours.
      person_name: null,
      name: null,
      company: null,
      company_raw: null,
      company_reviewed: null,
      company_needs_review: false,
      company_confidence: null,
    }
  })
}

/**
 * @param {{
 *   apiKey: string,
 *   imageDataUrl: string,
 *   reportDate: string,
 *   groupBy?: string,
 *   imageMeta?: object|null,
 * }} args
 */
export async function runAcceptedClaudeSignInPipeline({
  apiKey,
  imageDataUrl,
  reportDate,
  groupBy = 'trade',
  imageMeta = null,
}) {
  const visionImage = parseVisionDataUrlForClaude(imageDataUrl)
  if (!visionImage) {
    const err = new Error('image data URL must be a base64 image')
    err.status = 400
    throw err
  }

  const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_SIGNIN_OCR_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract every populated sign-in operative row from this UK construction attendance register photo, inspecting the table from top to bottom. Skip the table heading row. The site diary report date is ${reportDate}. For each physical operative row return source_row, date, person_name, company, trade, time_in and time_out. person_name and company are optional — use null when unclear; do not invent them and do not drop the row because they are unclear. Read trade and clocks accurately as written; do not force canonical trade labels. Identify the Time In and Time Out columns first, then read each row’s own handwritten clocks — do not infer a shift or copy times between rows. Keep different dates (for example 5 Sep and 6 Sep) as distinct rows. Unreadable clocks and unreadable trade must be null — still return the row. Do not skip rows, merge neighbouring handwritten rows, or stop after a subset. Do not calculate hours. Do not invent people or trades.`,
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

  const visionJson = await visionRes.json().catch(() => ({}))
  if (!visionRes.ok) {
    const err = new Error(
      visionJson?.error?.message || `Claude Vision API error (${visionRes.status})`,
    )
    err.status = 502
    err.model = CLAUDE_SIGNIN_OCR_MODEL
    throw err
  }

  const contentBlocks = Array.isArray(visionJson?.content) ? visionJson.content : []
  const textBlock = contentBlocks.find((block) => block?.type === 'text')
  const parsed = extractJson(textBlock?.text || '')
  const rawRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  const rawVisibleAttendeeCount =
    parsed?.visible_attendee_count ?? parsed?.visibleAttendeeCount ?? null

  const qualified = qualifyClaudeBenchmarkOperativeRows(rawRows, rawVisibleAttendeeCount)

  const result = labourFromOcrSheet(
    qualified.rows.map((r) => ({
      ...r,
      work_date: r.date ?? r.work_date,
      person_name: r.person_name ?? null,
      company: r.company ?? null,
    })),
    reportDate,
    { groupBy, visibleAttendeeCount: qualified.visibleAttendeeCount },
  )

  // Second pass: rich row-context TRADE consensus (optional name/company anchors only).
  let tradeConsensusPass = {
    status: 'skipped',
    reason: 'not-run',
    inputRowCount: 0,
    reviewedRowCount: 0,
    mode: 'rich-row-context',
  }
  let operatives = result.operatives
  try {
    const consensusResult = await runSignInRichTradeConsensusPass({
      apiKey,
      visionImage,
      operatives,
    })
    operatives = consensusResult.operatives
    tradeConsensusPass = consensusResult.tradeConsensusPass
  } catch (err) {
    tradeConsensusPass = {
      status: 'error',
      error: err?.message || 'Rich trade consensus pass failed',
      inputRowCount: buildSafeTradeConsensusInputCount(operatives),
      reviewedRowCount: 0,
      mode: 'rich-row-context',
    }
  }

  // Construction aliases only AFTER consensus reviewed trade.
  operatives = applyClaudeBenchmarkTradeNormalisation(operatives)
  operatives = shapeClaudePhaseAReviewOperatives(operatives)

  return {
    provider: 'claude',
    applyEnabled: false,
    model: CLAUDE_SIGNIN_OCR_MODEL,
    reportDate,
    imageMeta,
    extractedCount: result.extractedCount,
    matchedCount: result.matchedCount,
    ignoredCount: result.ignoredCount,
    missingDateCount: result.missingDateCount,
    visibleAttendeeCount: result.visibleAttendeeCount,
    rowCountMismatch: result.rowCountMismatch,
    droppedHeaderCount: qualified.droppedHeaderCount,
    droppedBlankCount: qualified.droppedBlankCount,
    droppedSparseDateOnlyCount: qualified.droppedSparseDateOnlyCount,
    rawVisibleAttendeeCount: qualified.rawVisibleAttendeeCount,
    tradeConsensusPass,
    warnings: result.warnings,
    operatives,
    aggregated: result.aggregated,
    labour: result.rows.map(({ trade, hours, notes }) => ({
      trade,
      hours,
      notes,
    })),
  }
}

function buildSafeTradeConsensusInputCount(operatives = []) {
  return (Array.isArray(operatives) ? operatives : []).filter((row) =>
    Number.isFinite(Number(row?.source_row)),
  ).length
}
