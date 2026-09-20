import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { authorizeSiteDiaryReportForUser } from '@/lib/server/site-diary-report-access'
import { assembleSiteDiaryPdfDocumentProps } from '@/lib/server/assemble-site-diary-pdf-props'
import { renderSiteDiaryPdfBuffer } from '@/lib/server/render-site-diary-pdf'
import { assertDiaryPdfPhotosComplete } from '@/lib/diary-pdf-photos'

export const runtime = 'nodejs'
export const maxDuration = 300

function isDevProofAllowed() {
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.ZLOG_SERVER_PDF_DEV === '1'
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()
}

export async function POST(request, context) {
  if (!isDevProofAllowed()) {
    return NextResponse.json({ ok: false, code: 'not-available' }, { status: 404 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('mode') !== 'sync-dev-only') {
    return NextResponse.json({ ok: false, code: 'invalid-mode' }, { status: 400 })
  }

  const params = await context.params
  const reportId = params?.reportId
  const totalStart = nowMs()
  const timing = {
    authMs: 0,
    assemblyMs: 0,
    pdfRenderMs: 0,
    totalMs: 0,
    pdfBytes: 0,
    photoCount: 0,
    detail: {},
  }

  const authT0 = nowMs()
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

  const auth = await authorizeSiteDiaryReportForUser(userSupabase, admin, reportId)
  timing.authMs = nowMs() - authT0

  if (!auth.ok) {
    timing.totalMs = nowMs() - totalStart
    return NextResponse.json(
      { ok: false, code: auth.code },
      {
        status: auth.status,
        headers: { 'X-Zlog-Server-Pdf-Timing': JSON.stringify(timing) },
      },
    )
  }

  const assemblyT0 = nowMs()
  const assembled = await assembleSiteDiaryPdfDocumentProps(admin, auth.reportId)
  timing.assemblyMs = nowMs() - assemblyT0

  if (!assembled.ok) {
    timing.totalMs = nowMs() - totalStart
    timing.detail = assembled.timings || {}
    return NextResponse.json(
      { ok: false, code: 'assembly-failed', message: assembled.message },
      {
        status: 500,
        headers: { 'X-Zlog-Server-Pdf-Timing': JSON.stringify(timing) },
      },
    )
  }

  timing.detail = assembled.timings || {}
  timing.photoCount = assembled.timings?.photoCount ?? 0

  try {
    assertDiaryPdfPhotosComplete({
      expected: assembled.photoRows || [],
      prepared: assembled.props.photos,
    })
  } catch {
    timing.totalMs = nowMs() - totalStart
    return NextResponse.json(
      { ok: false, code: 'photos-incomplete' },
      {
        status: 500,
        headers: { 'X-Zlog-Server-Pdf-Timing': JSON.stringify(timing) },
      },
    )
  }

  const renderT0 = nowMs()
  let buffer
  try {
    const rendered = await renderSiteDiaryPdfBuffer(assembled.props)
    buffer = rendered.buffer
    timing.pdfRenderMs = rendered.renderMs
  } catch (err) {
    timing.pdfRenderMs = nowMs() - renderT0
    timing.totalMs = nowMs() - totalStart
    return NextResponse.json(
      { ok: false, code: 'render-failed', message: err?.message || 'PDF render failed.' },
      {
        status: 500,
        headers: { 'X-Zlog-Server-Pdf-Timing': JSON.stringify(timing) },
      },
    )
  }

  timing.pdfBytes = buffer.length
  timing.totalMs = nowMs() - totalStart

  const safeDate = String(assembled.props.reportDate || 'report').replace(/[^\d-]/g, '')
  const fileName = `Zlog-Site-Diary-Server-${safeDate || 'report'}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
      'X-Zlog-Server-Pdf-Proof': 'sync-dev-only',
      'X-Zlog-Server-Pdf-Timing': JSON.stringify(timing),
    },
  })
}
