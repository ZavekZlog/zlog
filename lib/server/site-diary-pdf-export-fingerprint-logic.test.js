import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSiteDiaryPdfExportFingerprint } from './site-diary-pdf-export-fingerprint-logic.js'
import { buildSiteDiaryPdfSnapshotRawInput } from '../site-diary-pdf-snapshot-source.js'
import {
  buildSiteDiaryPdfFingerprint,
  SITE_DIARY_PDF_SNAPSHOT_V1,
} from '../site-diary-pdf-snapshot-v1.js'

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'

function ownerUserSupabase(userId = OWNER_ID) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
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
              project_id: PROJECT_ID,
              projects: { owner_id: ownerId },
            },
            error: null,
          }),
        }),
      }),
    }),
  }
}

function sampleSnapshotLoader() {
  const bundle = {
    report: { id: REPORT_ID, project_id: PROJECT_ID },
    project: { id: PROJECT_ID, owner_id: OWNER_ID, name: 'Site' },
    labourRows: [],
    plantRows: [],
    photoRows: [],
    reportingCompany: 'Co',
  }
  const snapshotRaw = buildSiteDiaryPdfSnapshotRawInput(bundle)
  return async () => ({
    ok: true,
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    snapshotRaw,
  })
}

const root = join(import.meta.dirname, '..', '..')

describe('resolveSiteDiaryPdfExportFingerprint', () => {
  it('authenticated owner receives fingerprint and snapshot version', async () => {
    const result = await resolveSiteDiaryPdfExportFingerprint({
      userSupabase: ownerUserSupabase(),
      adminSupabase: adminForOwner(),
      reportId: REPORT_ID,
      loadSnapshotSource: sampleSnapshotLoader(),
    })

    assert.equal(result.ok, true)
    assert.equal(result.reportId, REPORT_ID)
    assert.match(result.contentFingerprint, /^[0-9a-f]{64}$/)
    assert.equal(result.snapshotVersion, SITE_DIARY_PDF_SNAPSHOT_V1.version)
  })

  it('unauthenticated request rejected', async () => {
    const result = await resolveSiteDiaryPdfExportFingerprint({
      userSupabase: {
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      },
      adminSupabase: adminForOwner(),
      reportId: REPORT_ID,
      loadSnapshotSource: sampleSnapshotLoader(),
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
    assert.equal(result.code, 'unauthenticated')
  })

  it('wrong-user report access rejected', async () => {
    const result = await resolveSiteDiaryPdfExportFingerprint({
      userSupabase: ownerUserSupabase('other-user'),
      adminSupabase: adminForOwner(OWNER_ID),
      reportId: REPORT_ID,
      loadSnapshotSource: sampleSnapshotLoader(),
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.code, 'forbidden')
  })

  it('fingerprint matches loader output via buildSiteDiaryPdfFingerprint', async () => {
    const loader = sampleSnapshotLoader()
    const loaded = await loader()
    const expected = buildSiteDiaryPdfFingerprint(loaded.snapshotRaw)

    const result = await resolveSiteDiaryPdfExportFingerprint({
      userSupabase: ownerUserSupabase(),
      adminSupabase: adminForOwner(),
      reportId: REPORT_ID,
      loadSnapshotSource: loader,
    })

    assert.equal(result.ok, true)
    assert.equal(result.contentFingerprint, expected)
  })
})

describe('pdf-export fingerprint route contract', () => {
  it('uses authorize + loadSiteDiaryPdfSnapshotSource + buildSiteDiaryPdfFingerprint', () => {
    const route = readFileSync(
      join(root, 'app/api/site-diary/[reportId]/pdf-export/fingerprint/route.js'),
      'utf8',
    )
    assert.match(route, /resolveSiteDiaryPdfExportFingerprint/)
    assert.match(route, /getSupabaseAdminClient/)
    assert.match(route, /createClient/)
    assert.doesNotMatch(route, /contentFingerprint.*request/i)
    assert.doesNotMatch(route, /searchParams.*fingerprint/i)
    assert.doesNotMatch(route, /prepareSiteDiaryPdf/)
  })

  it('logic module does not accept client-supplied fingerprint', () => {
    const logic = readFileSync(
      join(root, 'lib/server/site-diary-pdf-export-fingerprint-logic.js'),
      'utf8',
    )
    assert.doesNotMatch(logic, /p_content_fingerprint/)
    assert.match(logic, /buildSiteDiaryPdfFingerprint/)
    assert.match(logic, /loadSiteDiaryPdfSnapshotSource/)
  })
})
