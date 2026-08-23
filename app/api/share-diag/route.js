import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * TEMPORARY — receives client Share diagnostics and prints them in the dev terminal.
 * Remove after Android user-activation investigation is complete.
 */
export async function POST(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  let body = {}
  try {
    const raw = await request.text()
    body = raw ? JSON.parse(raw) : { emptyBody: true }
  } catch {
    body = { parseError: true }
  }

  const stage = body.stage || 'unknown'
  console.log('')
  console.log('========== ZLOG SHARE DIAG ==========')
  console.log(`stage: ${stage}`)
  console.log(JSON.stringify(body, null, 2))
  console.log('=====================================')
  console.log('')

  return NextResponse.json({ ok: true })
}
