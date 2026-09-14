/**
 * Production Claude sign-in OCR (Phase A).
 * Isolated from dirty OpenAI route `/api/parse-signin-sheet` and from the benchmark page URL.
 * No database writes. Apply disabled in response (`applyEnabled: false`).
 */

import { NextResponse } from 'next/server'
import { toDateKey } from '@/lib/labour-from-register'
import {
  CLAUDE_SIGNIN_OCR_MODEL,
  runAcceptedClaudeSignInPipeline,
} from '@/lib/parse-signin-sheet-claude-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 180

/**
 * PII-safe diagnostics only.
 */
function logClaudeProductionDiagnostics(payload) {
  if (process.env.NODE_ENV === 'production') return
  const rows = Array.isArray(payload.operatives) ? payload.operatives : []
  console.info('[parse-signin-sheet-claude]', {
    purpose: 'phase-a-claude-signin-ocr',
    provider: 'claude',
    applyEnabled: false,
    model: CLAUDE_SIGNIN_OCR_MODEL,
    reportDate: payload.reportDate,
    imageMeta: payload.imageMeta
      ? {
          resized: payload.imageMeta.resized === true,
          reencoded: payload.imageMeta.reencoded === true,
          pipeline: payload.imageMeta.pipeline || null,
          byteSize: payload.imageMeta.byteSize ?? null,
        }
      : null,
    rowCount: rows.length,
    matchedCount: payload.matchedCount,
    ignoredCount: payload.ignoredCount,
    rows: rows.map((row) => ({
      source_row: row?.source_row ?? null,
      date: row?.work_date ?? null,
      dateStatus: row?.dateStatus ?? null,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      hasName: Boolean(String(row?.person_name || '').trim()),
      hasCompanyReviewed: Boolean(String(row?.company_reviewed || row?.company || '').trim()),
      hasTradeNormalized: Boolean(
        String(row?.trade_normalized || row?.trade_reviewed || row?.trade || '').trim(),
      ),
      gross_hours: row?.gross_hours ?? row?.hours ?? null,
      net_hours: row?.net_hours ?? null,
      break_deduction: row?.break_deduction ?? null,
    })),
  })
}

export async function POST(request) {
  try {
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
      return NextResponse.json(
        { error: 'reportDate is required (YYYY-MM-DD) from the Site Diary' },
        { status: 400 },
      )
    }
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'image data URL is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY is not configured. Add it to the server environment for Claude sign-in OCR.',
        },
        { status: 503 },
      )
    }

    const responseBody = await runAcceptedClaudeSignInPipeline({
      apiKey,
      imageDataUrl: image,
      reportDate,
      groupBy,
      imageMeta,
    })

    logClaudeProductionDiagnostics(responseBody)
    return NextResponse.json(responseBody)
  } catch (err) {
    const status = Number(err?.status) || 500
    return NextResponse.json(
      {
        error: err?.message || 'Failed to run Claude sign-in OCR',
        model: err?.model || CLAUDE_SIGNIN_OCR_MODEL,
        provider: 'claude',
        applyEnabled: false,
      },
      { status },
    )
  }
}
