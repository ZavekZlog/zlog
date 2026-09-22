import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { authorizeSiteDiaryReportForUser } from './site-diary-report-access-logic.js'

const root = join(import.meta.dirname, '..', '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('site-diary server PDF security', () => {
  it('authorizeSiteDiaryReportForUser returns 401 when unauthenticated', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }
    const adminSupabase = { from: () => ({}) }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      '6846b690-b3f8-4a28-b0c1-a9a825a850f0',
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
  })

  it('authorizeSiteDiaryReportForUser returns 403 when project owner mismatches', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
      },
    }
    const adminSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'report-1',
                project_id: 'proj-1',
                projects: { owner_id: 'user-b' },
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      'report-1',
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.code, 'forbidden')
  })

  it('authorizeSiteDiaryReportForUser allows matching project owner', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
      },
    }
    const adminSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'report-1',
                project_id: 'proj-1',
                projects: { owner_id: 'user-a' },
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      'report-1',
    )
    assert.equal(result.ok, true)
    assert.equal(result.reportId, 'report-1')
  })

  it('dev PDF route is production-guarded and requires sync-dev-only mode', () => {
    const route = read('app/api/site-diary/[reportId]/pdf/route.js')
    assert.match(route, /NODE_ENV.*production/)
    assert.match(route, /sync-dev-only/)
    assert.match(route, /authorizeSiteDiaryReportForUser/)
    assert.doesNotMatch(route, /prepareSiteDiaryPdf/)
  })

  it('service role key is not referenced from client PDF path', () => {
    const share = read('lib/diary-share.js')
    assert.doesNotMatch(share, /SUPABASE_SERVICE_ROLE_KEY/)
    const client = read('lib/supabase/client.js')
    assert.doesNotMatch(client, /SERVICE_ROLE/)
  })

  it('supabase-admin is server-only and not imported by diary-share', () => {
    const admin = read('lib/server/supabase-admin.js')
    assert.match(admin, /server-only/)
    assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/)
    const share = read('lib/diary-share.js')
    assert.doesNotMatch(share, /supabase-admin/)
  })

  it('client prepare path still uses DiaryPdfDocument and pdf\\(\\).toBlob', () => {
    const share = read('lib/diary-share.js')
    assert.match(share, /prepareSiteDiaryPdf/)
    assert.match(share, /DiaryPdfDocument/)
    assert.match(share, /pdf\(doc\)\.toBlob/)
  })

  it('DiaryPdfDocument no longer requires use client directive', () => {
    const doc = read('components/pdf/DiaryPdfDocument.jsx')
    assert.doesNotMatch(doc, /^'use client'/m)
  })

  it('pdf-export fingerprint route uses session auth and does not expose service role to client', () => {
    const route = read('app/api/site-diary/[reportId]/pdf-export/fingerprint/route.js')
    assert.match(route, /createClient/)
    assert.match(route, /authorizeSiteDiaryReportForUser|resolveSiteDiaryPdfExportFingerprint/)
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(route, /enqueue_site_diary_pdf_export/)
  })

  it('site-diary-pdf-export-client does not import server-only or service role', () => {
    const client = read('lib/site-diary-pdf-export-client.js')
    assert.doesNotMatch(client, /server-only/)
    assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(client, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(client, /site-diary-pdf-snapshot-v1/)
    assert.doesNotMatch(client, /DiaryPdfDocument/)
    assert.match(client, /enqueue_site_diary_pdf_export/)
    assert.match(client, /get_site_diary_pdf_export/)
    assert.match(client, /pdf-export\/\$\{encodeURIComponent\(eid\)\}/)
  })

  it('pdf-export artifact route is authenticated JSON authorize + signed URL (no PDF proxy)', () => {
    const route = read('app/api/site-diary/[reportId]/pdf-export/[exportId]/route.js')
    assert.match(route, /createClient/)
    assert.match(route, /resolveReadySiteDiaryPdfExportArtifact/)
    assert.match(route, /signedUrl/)
    assert.match(route, /NextResponse\.json/)
    assert.doesNotMatch(route, /result\.buffer/)
    assert.doesNotMatch(route, /storage_path.*request/i)
  })

  it('artifact access logic keeps private bucket server-side and signs without download', () => {
    const logic = read('lib/server/site-diary-pdf-export-access-logic.js')
    assert.match(logic, /site-diary-pdf-exports/)
    assert.match(logic, /assertSafeSiteDiaryPdfExportStoragePath/)
    assert.match(logic, /createSignedUrl/)
    assert.doesNotMatch(logic, /\.download\(/)
    assert.doesNotMatch(logic, /public:\s*true/)
  })
})
