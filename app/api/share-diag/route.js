import { NextResponse } from 'next/server'

import {
  isShareDiagLoggingEnabled,
  logShareDiagSafely,
  parseShareDiagRequestBody,
} from '@/lib/server/share-diag-route-logic.js'

export const runtime = 'nodejs'

/**
 * TEMPORARY — receives client Share timing diagnostics.
 * Enabled on local dev and Vercel Preview only; production returns 404 with no log.
 */
export async function POST(request) {
  if (!isShareDiagLoggingEnabled(process.env)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  let body = { stage: 'unknown' }
  try {
    const raw = await request.text()
    body = parseShareDiagRequestBody(raw)
  } catch {
    body = { stage: 'unknown', parseError: true }
  }

  logShareDiagSafely(body)

  return NextResponse.json({ ok: true })
}
