/**
 * TEMPORARY Claude vision labour OCR benchmark.
 * Isolated from production OpenAI route: /api/parse-signin-sheet
 * No database writes. Fetch-only Anthropic Messages API (no SDK).
 */

import { NextResponse } from 'next/server'
import { labourFromOcrSheet } from '@/lib/parse-signin-sheet'
import { toDateKey } from '@/lib/labour-from-register'
import {
  CLAUDE_OCR_BENCHMARK_MODEL,
  CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
  CLAUDE_OCR_BENCHMARK_CONSENSUS_SYSTEM_PROMPT,
  applyClaudeBenchmarkCompanyTradeConsensus,
  applyClaudeBenchmarkTradeNormalisation,
  buildClaudeBenchmarkCompanyTradeConsensusInput,
  parseVisionDataUrlForClaude,
  qualifyClaudeBenchmarkOperativeRows,
} from '@/lib/parse-signin-sheet-claude-benchmark'

export const runtime = 'nodejs'
export const maxDuration = 180

const SYSTEM_PROMPT = `You extract rows from construction site sign-in / attendance register photos.
Return ONLY valid JSON with this shape:
{"visible_attendee_count":number,"rows":[{"source_row":number,"date":"YYYY-MM-DD","person_name":"string","trade":"string","company":"string","time_in":"HH:MM","time_out":"HH:MM"}]}

Rules:
- Inspect the table row by row from top to bottom. Do not skip the middle or stop early after a subset.
- Inspect every physical row independently.
- visible_attendee_count = how many distinct populated attendee / operative lines you can see (including partially filled rows). Count the populated rows before you return JSON. rows.length must equal visible_attendee_count.
- source_row = physical row index on the sheet, starting at 1 for the first populated operative line below the header. Diagnostic only. Consecutive populated lines should have consecutive source_row values; a gap means a line was skipped.
- One object in rows per physically populated person / line on the sheet. Never merge neighbouring handwritten rows. Never copy one row's data into another. Treat each physically populated row independently.
- Prefer ISO dates. If the sheet uses DD/MM/YYYY, convert correctly (UK format).
- Keep rows for different calendar dates distinct (for example 5 Sep and 6 Sep must remain separate rows).
- company = employer / subcontractor if shown. If name, trade or company is unreadable, use null. Do not invent identity.
- Time In / Time Out:
  - First identify the exact physical Time In column and Time Out column on the sheet (header labels). Do not read a different column.
  - time_in / time_out = 24-hour clock strings as written on the sheet. Preserve the handwritten minutes exactly.
  - Read each row’s own handwritten clocks independently from those two columns only.
  - Never infer a standard shift. Never copy a time pair from another row. Never convert an unclear time into a plausible common site time (do not “correct” to 07:00, 08:00, 15:30, 16:00, or 16:30).
  - Distinguish carefully between handwritten 5 and 7, and between 0, 3, 5, and 8.
  - If a clock value is genuinely unreadable, return null for that field. Still return the row.
- Do NOT calculate, estimate, or invent hours. Never include an hours field. The application calculates hours from time_in and time_out.
- If a field is missing or unreadable, use null. Still return the row. Do not drop a populated line because one cell is unreadable.
- Do not invent people who are not on the sheet. Do not infer or fabricate missing people.
- Never invent or infer names, trades, companies or times.
- Never copy values from neighbouring rows.
- Include the date column value for EVERY row even when the sheet groups by date headers.
- Return every populated operative row.`

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
 * PII-safe diagnostics only — no names, companies, trades, or raw identity text.
 */
function logClaudeBenchmarkDiagnostics(payload) {
  if (process.env.NODE_ENV === 'production') return
  const rows = Array.isArray(payload.operatives) ? payload.operatives : []
  const imageMeta = payload.imageMeta && typeof payload.imageMeta === 'object' ? payload.imageMeta : null
  const consensusPass =
    payload.consensusPass && typeof payload.consensusPass === 'object' ? payload.consensusPass : null
  console.info('[parse-signin-sheet-claude-benchmark]', {
    purpose: 'temporary-claude-vision-ocr-benchmark',
    model: CLAUDE_OCR_BENCHMARK_MODEL,
    consensusModel: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
    consensusPass: consensusPass
      ? {
          status: consensusPass.status ?? null,
          inputRowCount: consensusPass.inputRowCount ?? null,
          reviewedRowCount: consensusPass.reviewedRowCount ?? null,
        }
      : null,
    reportDate: payload.reportDate,
    imageMeta: imageMeta
      ? {
          width: imageMeta.width ?? null,
          height: imageMeta.height ?? null,
          byteSize: imageMeta.byteSize ?? null,
          mediaType: imageMeta.mediaType ?? null,
          resized: imageMeta.resized === true,
          reencoded: imageMeta.reencoded === true,
          pipeline: imageMeta.pipeline || null,
        }
      : null,
    rowCount: rows.length,
    extractedCount: payload.extractedCount,
    matchedCount: payload.matchedCount,
    ignoredCount: payload.ignoredCount,
    missingDateCount: payload.missingDateCount,
    visibleAttendeeCount: payload.visibleAttendeeCount,
    rowCountMismatch: payload.rowCountMismatch,
    droppedHeaderCount: payload.droppedHeaderCount ?? 0,
    droppedBlankCount: payload.droppedBlankCount ?? 0,
    droppedSparseDateOnlyCount: payload.droppedSparseDateOnlyCount ?? 0,
    rawVisibleAttendeeCount: payload.rawVisibleAttendeeCount ?? null,
    rows: rows.map((row) => ({
      source_row: row?.source_row ?? null,
      date: row?.work_date ?? null,
      dateStatus: row?.dateStatus ?? null,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      hasName: Boolean(String(row?.person_name || '').trim()),
      hasTrade: Boolean(String(row?.trade || '').trim()),
      hasCompany: Boolean(String(row?.company || '').trim()),
      needs_review: row?.needs_review === true,
      company_needs_review: row?.company_needs_review === true,
      trade_needs_review: row?.trade_needs_review === true,
      hours: row?.hours ?? null,
    })),
  })
}

/**
 * Second Claude pass — Company / Trade spelling consensus only.
 * Soft-fails: first-pass result remains usable if this call fails.
 */
async function runCompanyTradeConsensusPass({ apiKey, visionImage, operatives }) {
  const consensusInput = buildClaudeBenchmarkCompanyTradeConsensusInput(operatives)
  if (consensusInput.length === 0) {
    return {
      operatives: applyClaudeBenchmarkTradeNormalisation(operatives),
      consensusPass: {
        status: 'skipped',
        model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
        inputRowCount: 0,
        reviewedRowCount: 0,
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
      model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: CLAUDE_OCR_BENCHMARK_CONSENSUS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Review Company and Trade spellings only for these already-extracted qualified rows. Use the image and repeated handwriting across nearby rows as evidence. Do not change Name, Date, Time In, or Time Out. Do not add or remove rows. Do not invent companies or trades. If uncertain, keep the raw value and set needs_review true.\n\nFirst-pass Company/Trade by source_row:\n${JSON.stringify({ rows: consensusInput })}`,
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
    const msg =
      consensusJson?.error?.message || `Claude consensus API error (${consensusRes.status})`
    return {
      operatives: applyClaudeBenchmarkTradeNormalisation(
        applyClaudeBenchmarkCompanyTradeConsensus(operatives, []),
      ),
      consensusPass: {
        status: 'failed',
        model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
        inputRowCount: consensusInput.length,
        reviewedRowCount: 0,
        error: msg,
      },
    }
  }

  const contentBlocks = Array.isArray(consensusJson?.content) ? consensusJson.content : []
  const textBlock = contentBlocks.find((block) => block?.type === 'text')
  const parsed = extractJson(textBlock?.text || '')
  const consensusRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  const merged = applyClaudeBenchmarkTradeNormalisation(
    applyClaudeBenchmarkCompanyTradeConsensus(operatives, consensusRows),
  )

  return {
    operatives: merged,
    consensusPass: {
      status: 'ok',
      model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
      inputRowCount: consensusInput.length,
      reviewedRowCount: consensusRows.length,
    },
  }
}

export async function POST(request) {
  try {
    // Temporary benchmark — keep out of production deploys unless explicitly enabled.
    if (process.env.NODE_ENV === 'production' && process.env.ZLOG_CLAUDE_OCR_BENCHMARK !== '1') {
      return NextResponse.json({ error: 'Claude OCR benchmark is not enabled' }, { status: 404 })
    }

    const body = await request.json()
    const reportDate = toDateKey(body?.reportDate)
    const groupBy = body?.groupBy || 'trade_company'
    const image = body?.image
    const imageMeta =
      body?.imageMeta && typeof body.imageMeta === 'object'
        ? {
            width: body.imageMeta.width ?? null,
            height: body.imageMeta.height ?? null,
            byteSize: body.imageMeta.byteSize ?? null,
            mediaType: body.imageMeta.mediaType ?? null,
            resized: body.imageMeta.resized === true,
            reencoded: body.imageMeta.reencoded === true,
            pipeline: body.imageMeta.pipeline || null,
          }
        : null

    if (!reportDate) {
      return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD)' }, { status: 400 })
    }
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'image data URL is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY is not configured. Add it to the server environment for the Claude OCR benchmark.',
        },
        { status: 503 },
      )
    }

    const visionImage = parseVisionDataUrlForClaude(image)
    if (!visionImage) {
      return NextResponse.json({ error: 'image data URL must be a base64 image' }, { status: 400 })
    }

    const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_OCR_BENCHMARK_MODEL,
        max_tokens: 8192,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract every populated sign-in row from this register photo, inspecting the table from top to bottom. The site diary report date is ${reportDate}. For each physical row return source_row, date, name, trade, company, time_in and time_out. Identify the Time In and Time Out columns first, then read each row’s own handwritten clocks — do not infer a shift or copy times between rows. Keep different dates (for example 5 Sep and 6 Sep) as distinct rows. Unreadable clocks and unreadable identity must be null — still return the row. Do not skip rows, merge neighbouring handwritten rows, or stop after a subset. Do not calculate hours. Do not invent people.`,
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
      const msg = visionJson?.error?.message || `Claude Vision API error (${visionRes.status})`
      return NextResponse.json(
        { error: msg, model: CLAUDE_OCR_BENCHMARK_MODEL },
        { status: 502 },
      )
    }

    const contentBlocks = Array.isArray(visionJson?.content) ? visionJson.content : []
    const textBlock = contentBlocks.find((block) => block?.type === 'text')
    const content = textBlock?.text || ''
    const parsed = extractJson(content)
    const rawRows = Array.isArray(parsed?.rows) ? parsed.rows : []
    const rawVisibleAttendeeCount =
      parsed?.visible_attendee_count ?? parsed?.visibleAttendeeCount ?? null

    // Benchmark-only: drop header / blank / sparse date-only rows; renumber source_row from 1.
    const qualified = qualifyClaudeBenchmarkOperativeRows(rawRows, rawVisibleAttendeeCount)

    // Same post-OCR contract as production (hours / date filter / review shape). No DB writes.
    const result = labourFromOcrSheet(
      qualified.rows.map((r) => ({
        ...r,
        work_date: r.date ?? r.work_date,
      })),
      reportDate,
      { groupBy, visibleAttendeeCount: qualified.visibleAttendeeCount },
    )

    // Second pass: Company / Trade consensus only. Does not re-qualify rows or alter Name/Date/Times.
    let operatives = result.operatives
    let consensusPass = {
      status: 'skipped',
      model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
      inputRowCount: 0,
      reviewedRowCount: 0,
    }
    try {
      const consensusResult = await runCompanyTradeConsensusPass({
        apiKey,
        visionImage,
        operatives: result.operatives,
      })
      operatives = consensusResult.operatives
      consensusPass = consensusResult.consensusPass
    } catch (err) {
      operatives = applyClaudeBenchmarkTradeNormalisation(
        applyClaudeBenchmarkCompanyTradeConsensus(result.operatives, []),
      )
      consensusPass = {
        status: 'failed',
        model: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
        inputRowCount: buildClaudeBenchmarkCompanyTradeConsensusInput(result.operatives).length,
        reviewedRowCount: 0,
        error: err?.message || 'Company/Trade consensus pass failed',
      }
    }

    operatives = applyClaudeBenchmarkTradeNormalisation(operatives)

    const responseBody = {
      benchmark: true,
      provider: 'anthropic',
      model: CLAUDE_OCR_BENCHMARK_MODEL,
      consensusModel: CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
      consensusPass,
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
      warnings: result.warnings,
      operatives,
      aggregated: result.aggregated,
      labour: result.rows.map(({ trade, company, headcount, hours, notes }) => ({
        trade,
        company,
        headcount,
        hours,
        notes,
      })),
    }

    logClaudeBenchmarkDiagnostics(responseBody)

    return NextResponse.json(responseBody)
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to run Claude sign-in sheet benchmark' },
      { status: 500 },
    )
  }
}
