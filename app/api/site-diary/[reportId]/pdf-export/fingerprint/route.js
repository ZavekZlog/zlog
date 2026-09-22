import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { resolveSiteDiaryPdfExportFingerprint } from '@/lib/server/site-diary-pdf-export-fingerprint-logic.js'

export const runtime = 'nodejs'

export async function GET(_request, context) {
  const params = await context.params
  const reportId = params?.reportId

  const userSupabase = await createClient()
  let admin
  try {
    admin = getSupabaseAdminClient()
  } catch (err) {
    return NextResponse.json(
      { ok: false, code: 'server-config', message: err?.message || 'Server misconfigured.' },
      { status: 503 },
    )
  }

  const result = await resolveSiteDiaryPdfExportFingerprint({
    userSupabase,
    adminSupabase: admin,
    reportId,
  })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message || undefined },
      { status: result.status },
    )
  }

  return NextResponse.json({
    ok: true,
    reportId: result.reportId,
    contentFingerprint: result.contentFingerprint,
    snapshotVersion: result.snapshotVersion,
  })
}
