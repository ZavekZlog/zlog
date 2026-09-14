import { NextResponse } from 'next/server'
import { labourFromOcrSheet } from '@/lib/parse-signin-sheet'
import { toDateKey } from '@/lib/labour-from-register'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `You extract rows from construction site sign-in / attendance register photos.
Return ONLY valid JSON with this shape:
{"visible_attendee_count":number,"rows":[{"source_row":number,"date":"YYYY-MM-DD","person_name":"string","trade":"string","company":"string","time_in":"HH:MM","time_out":"HH:MM"}]}

Rules:
- Inspect the table row by row from top to bottom. Do not skip the middle or stop early after a subset.
- visible_attendee_count = how many distinct populated attendee / operative lines you can see (including partially filled rows). Count the populated rows before you return JSON. rows.length must equal visible_attendee_count.
- source_row = physical row index on the sheet, starting at 1 for the first populated operative line below the header. Diagnostic only. Consecutive populated lines should have consecutive source_row values; a gap means a line was skipped.
- One object in rows per physically populated person / line on the sheet. Never merge neighbouring handwritten rows. Never copy one row's data into another. Treat each physically populated row independently.
- Prefer ISO dates. If the sheet uses DD/MM/YYYY, convert correctly (UK format).
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

function logOcrDiagnostics(payload) {
  if (process.env.NODE_ENV === 'production') return
  // No names, companies, or raw times in production; even in dev keep it structural
  console.info('[parse-signin-sheet]', {
    reportDate: payload.reportDate,
    extractedCount: payload.extractedCount,
    matchedCount: payload.matchedCount,
    ignoredCount: payload.ignoredCount,
    missingDateCount: payload.missingDateCount,
    visibleAttendeeCount: payload.visibleAttendeeCount,
    rowCountMismatch: payload.rowCountMismatch,
    warningCount: payload.warnings?.length || 0,
    sampleHours: (payload.operatives || []).slice(0, 5).map((o) => ({
      dateStatus: o.dateStatus,
      hasIn: Boolean(o.time_in),
      hasOut: Boolean(o.time_out),
      hours: o.hours,
    })),
  })
}

/**
 * TEMPORARY Android OCR clock-column experiment — development only.
 * Not production telemetry. Do not log names, companies, or other PII.
 */
function logOcrTimeReadDiagnostics(operatives) {
  if (process.env.NODE_ENV === 'production') return
  const rows = Array.isArray(operatives) ? operatives : []
  console.info('[parse-signin-sheet:diag] time-read (temporary OCR experiment, no PII)', {
    purpose: 'temporary-ocr-clock-experiment',
    rowCount: rows.length,
    rows: rows.map((row, index) => ({
      index,
      source_row: row?.source_row ?? null,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      hours: row?.hours ?? null,
      dateStatus: row?.dateStatus ?? null,
    })),
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const reportDate = toDateKey(body?.reportDate)
    const groupBy = body?.groupBy || 'trade_company'
    const image = body?.image

    if (!reportDate) {
      return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD)' }, { status: 400 })
    }
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'image data URL is required' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'OPENAI_API_KEY is not configured. Add it to the server environment to enable sign-in sheet scanning.',
        },
        { status: 503 },
      )
    }

    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract every populated sign-in row from this register photo, inspecting the table from top to bottom. The site diary report date is ${reportDate}. For each physical row return source_row, date, name, trade, company, time_in and time_out. Identify the Time In and Time Out columns first, then read each row’s own handwritten clocks — do not infer a shift or copy times between rows. Unreadable clocks and unreadable identity must be null — still return the row. Do not skip rows, merge neighbouring handwritten rows, or stop after a subset. Do not calculate hours. Do not invent people.`,
              },
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
            ],
          },
        ],
      }),
    })

    const visionJson = await visionRes.json().catch(() => ({}))
    if (!visionRes.ok) {
      const msg = visionJson?.error?.message || `Vision API error (${visionRes.status})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const content = visionJson?.choices?.[0]?.message?.content
    const parsed = extractJson(content)
    const rawRows = Array.isArray(parsed?.rows) ? parsed.rows : []
    const visibleAttendeeCount = parsed?.visible_attendee_count ?? parsed?.visibleAttendeeCount ?? null

    const result = labourFromOcrSheet(
      rawRows.map((r) => ({
        ...r,
        work_date: r.date ?? r.work_date,
      })),
      reportDate,
      { groupBy, visibleAttendeeCount },
    )

    const responseBody = {
      reportDate,
      extractedCount: result.extractedCount,
      matchedCount: result.matchedCount,
      ignoredCount: result.ignoredCount,
      missingDateCount: result.missingDateCount,
      visibleAttendeeCount: result.visibleAttendeeCount,
      rowCountMismatch: result.rowCountMismatch,
      warnings: result.warnings,
      operatives: result.operatives,
      aggregated: result.aggregated,
      labour: result.rows.map(({ trade, company, headcount, hours, notes }) => ({
        trade,
        company,
        headcount,
        hours,
        notes,
      })),
    }

    logOcrDiagnostics(responseBody)
    logOcrTimeReadDiagnostics(responseBody.operatives)

    return NextResponse.json(responseBody)
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to parse sign-in sheet' }, { status: 500 })
  }
}
