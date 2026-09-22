import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET,
  SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS,
  assertSafeSiteDiaryPdfExportStoragePath,
  buildSiteDiaryPdfExportFileName,
  resolveReadySiteDiaryPdfExportArtifact,
} from './site-diary-pdf-export-access-logic.js'

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const EXPORT_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_USER = '55555555-5555-4555-8555-555555555555'
const FINGERPRINT = 'a'.repeat(64)
const STORAGE_PATH = `${OWNER_ID}/${REPORT_ID}/${FINGERPRINT}.pdf`
const SIGNED_URL = 'https://storage.example/object/sign/site-diary-pdf-exports/file.pdf?token=abc'

const root = join(import.meta.dirname, '..', '..')

function userSupabase(userId) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
  }
}

function adminForOwner(ownerId = OWNER_ID) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: REPORT_ID,
              project_id: '33333333-3333-4333-8333-333333333333',
              projects: { owner_id: ownerId },
            },
            error: null,
          }),
        }),
      }),
    }),
  }
}

function readyRow(overrides = {}) {
  return {
    id: EXPORT_ID,
    report_id: REPORT_ID,
    owner_id: OWNER_ID,
    project_id: '33333333-3333-4333-8333-333333333333',
    content_fingerprint: FINGERPRINT,
    status: 'ready',
    storage_bucket: SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET,
    storage_path: STORAGE_PATH,
    ...overrides,
  }
}

function depsForRow(row, signResult = { data: { signedUrl: SIGNED_URL }, error: null }) {
  let signCalls = 0
  return {
    loadExportRow: async () => ({ data: row, error: null }),
    loadReportMeta: async () => ({ reportDate: '2026-08-24', projectName: 'Alpha Site' }),
    signStorageObject: async (_admin, bucket, path, expiresIn) => {
      signCalls += 1
      assert.equal(bucket, SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET)
      assert.equal(path, STORAGE_PATH)
      assert.equal(expiresIn, SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS)
      return signResult
    },
    getSignCalls: () => signCalls,
  }
}

describe('resolveReadySiteDiaryPdfExportArtifact', () => {
  it('unauthenticated → rejected', async () => {
    const deps = depsForRow(readyRow())
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(null),
      adminSupabase: adminForOwner(),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
    assert.equal(deps.getSignCalls(), 0)
  })

  it('wrong owner → rejected', async () => {
    const deps = depsForRow(readyRow())
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OTHER_USER),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(deps.getSignCalls(), 0)
  })

  it('export/report mismatch → rejected', async () => {
    const deps = depsForRow(readyRow({ report_id: '99999999-9999-4999-8999-999999999999' }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.code, 'export-report-mismatch')
    assert.equal(deps.getSignCalls(), 0)
  })

  it('queued export → no signed URL', async () => {
    const deps = depsForRow(readyRow({ status: 'queued', storage_path: null }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.code, 'export-not-ready')
    assert.equal(deps.getSignCalls(), 0)
  })

  it('processing export → no signed URL', async () => {
    const deps = depsForRow(readyRow({ status: 'processing' }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(deps.getSignCalls(), 0)
  })

  it('failed export → no signed URL', async () => {
    const deps = depsForRow(readyRow({ status: 'failed' }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.code, 'export-failed')
    assert.equal(deps.getSignCalls(), 0)
  })

  it('ready without storage_path → safe failure', async () => {
    const deps = depsForRow(readyRow({ storage_path: null }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.code, 'export-artifact-missing')
    assert.equal(deps.getSignCalls(), 0)
  })

  it('ready + correct owner/report/path → signed URL metadata only (Unicode share text)', async () => {
    const deps = depsForRow(readyRow())
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, true)
    assert.equal(result.signedUrl, SIGNED_URL)
    assert.equal(result.expiresInSeconds, SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS)
    assert.equal(result.fileName, buildSiteDiaryPdfExportFileName('2026-08-24'))
    assert.equal(result.title, 'Site Diary')
    assert.equal(result.text, 'Alpha Site — Site Diary')
    assert.equal(deps.getSignCalls(), 1)
    assert.equal('buffer' in result, false)
  })

  it('arbitrary client storage path cannot be supplied — path mismatch rejected', async () => {
    const deps = depsForRow(readyRow({ storage_path: `${OTHER_USER}/evil.pdf` }))
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'artifact-path-mismatch')
    assert.equal(deps.getSignCalls(), 0)
  })

  it('sign failure → safe 502', async () => {
    const deps = depsForRow(readyRow(), { data: null, error: { message: 'sign failed' } })
    const result = await resolveReadySiteDiaryPdfExportArtifact({
      userSupabase: userSupabase(OWNER_ID),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      ...deps,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 502)
    assert.equal(result.code, 'artifact-sign-failed')
    assert.equal(deps.getSignCalls(), 1)
  })
})

describe('artifact route contract', () => {
  it('uses server session + signed URL JSON; no PDF body proxy', () => {
    const route = readFileSync(
      join(root, 'app/api/site-diary/[reportId]/pdf-export/[exportId]/route.js'),
      'utf8',
    )
    const logic = readFileSync(
      join(root, 'lib/server/site-diary-pdf-export-access-logic.js'),
      'utf8',
    )
    assert.match(route, /createClient/)
    assert.match(route, /resolveReadySiteDiaryPdfExportArtifact/)
    assert.match(route, /NextResponse\.json/)
    assert.match(route, /signedUrl/)
    assert.doesNotMatch(route, /result\.buffer/)
    assert.doesNotMatch(route, /searchParams.*storage/)
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.match(logic, /createSignedUrl/)
    assert.doesNotMatch(logic, /\.download\(/)
  })

  it('assertSafeSiteDiaryPdfExportStoragePath rejects traversal', () => {
    const bad = assertSafeSiteDiaryPdfExportStoragePath('../secrets.pdf', {
      ownerId: OWNER_ID,
      reportId: REPORT_ID,
      contentFingerprint: FINGERPRINT,
    })
    assert.equal(bad.ok, false)
  })
})
