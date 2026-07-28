import { NextResponse } from 'next/server'
import { labourFromOcrSheet } from '@/lib/parse-signin-sheet'
import { toDateKey } from '@/lib/labour-from-register'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `You extract rows from construction site sign-in / attendance register photos.
Return ONLY valid JSON with this shape:
{"visible_attendee_count":number,"rows":[{"date":"YYYY-MM-DD","person_name":"string","trade":"string","company":"string","time_in":"HH:MM","time_out":"HH:MM"}]}

Rules:
- visible_attendee_count = how many distinct attendee / operative lines you can see on the sheet (including partially filled rows).
- One object in rows per person / line on the sheet. Never merge two people into one row.
- Prefer ISO dates. If the sheet uses DD/MM/YYYY, convert correctly (UK format).
- company = employer / subcontractor if shown.
- time_in / time_out = 24-hour clock strings as written on the sheet (e.g. "07:00", "16:00"). Use null if missing or unreadable.
- Do NOT calculate, estimate, or invent hours. Never include an hours field. The application calculates hours from time_in and time_out.
- If a field is missing, use null. Still return the row.
- Do not invent people who are not on the sheet.
- Include the date column value for EVERY row even when the sheet groups by date headers.
- Return every visible attendee row.`

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
                text: `Extract all sign-in rows from this register photo. The site diary report date is ${reportDate}. Return every visible attendee with date, name, trade, company, time_in and time_out. Do not calculate hours.`,
              },
              { type: 'image_url', image_url: { url: image } },
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

    return NextResponse.json(responseBody)
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to parse sign-in sheet' }, { status: 500 })
  }
}
