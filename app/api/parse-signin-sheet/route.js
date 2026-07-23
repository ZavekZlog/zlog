import { NextResponse } from 'next/server'
import { labourFromOcrSheet, normalizeOcrSignInRows } from '@/lib/parse-signin-sheet'
import { toDateKey } from '@/lib/labour-from-register'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `You extract rows from construction site sign-in / attendance register photos.
Return ONLY valid JSON with this shape:
{"rows":[{"date":"YYYY-MM-DD","person_name":"string","trade":"string","company":"string","hours":number}]}

Rules:
- One object per person / line on the sheet.
- Prefer ISO dates. If the sheet uses DD/MM/YYYY, convert correctly (UK format).
- company = employer / subcontractor if shown.
- hours = hours worked for that person that day (number). If only time-in/time-out, estimate decimal hours.
- If a field is missing, use null.
- Do not invent people who are not on the sheet.
- Include the date column value for EVERY row even when the sheet groups by date headers.`

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
                text: `Extract all sign-in rows from this register photo. The site diary report date is ${reportDate}. Still return every visible row with its own date so the server can strictly filter.`,
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

    // Map OCR date field → work_date for shared filter helpers
    const mapped = normalizeOcrSignInRows(
      rawRows.map((r) => ({
        ...r,
        work_date: r.date ?? r.work_date,
      })),
    )

    const result = labourFromOcrSheet(mapped, reportDate, { groupBy })

    return NextResponse.json({
      reportDate,
      matchedCount: result.matchedCount,
      ignoredCount: result.ignoredCount,
      aggregated: result.aggregated,
      labour: result.rows.map(({ trade, company, headcount, hours, notes }) => ({
        trade,
        company,
        headcount,
        hours,
        notes,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to parse sign-in sheet' }, { status: 500 })
  }
}
