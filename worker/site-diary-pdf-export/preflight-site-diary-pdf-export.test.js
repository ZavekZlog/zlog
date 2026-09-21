import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSiteDiaryPdfFingerprint } from '../../lib/site-diary-pdf-snapshot-v1.js'
import { buildSiteDiaryPdfSnapshotRawInput } from '../../lib/site-diary-pdf-snapshot-source.js'
import {
  preflightSiteDiaryPdfExportCore,
  SiteDiaryPdfExportPreflightError,
} from './preflight-site-diary-pdf-export-core.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const VALID_JOB = {
  id: '11111111-1111-4111-8111-111111111111',
  report_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  owner_id: '44444444-4444-4444-8444-444444444444',
  content_fingerprint: 'a'.repeat(64),
  snapshot_version: 1,
}

function sampleSnapshotRaw() {
  return buildSiteDiaryPdfSnapshotRawInput({
    report: {
      id: VALID_JOB.report_id,
      project_id: VALID_JOB.project_id,
      report_date: '2026-08-24',
      weather: 'Sun',
      equipment_hire: [],
      temporary_works: [],
      hs_incidents: [],
      rfis: [],
      variations: [],
      visitors_register_provenance: [],
    },
    project: {
      id: VALID_JOB.project_id,
      owner_id: VALID_JOB.owner_id,
      name: 'Site',
      working_days_per_week: 5,
    },
    labourRows: [],
    plantRows: [],
    photoRows: [],
    reportingCompany: null,
  })
}

function mockLoader(overrides = {}) {
  const raw = sampleSnapshotRaw()
  const fingerprint = buildSiteDiaryPdfFingerprint(raw)
  const base = {
    ok: true,
    reportId: VALID_JOB.report_id,
    projectId: VALID_JOB.project_id,
    ownerId: VALID_JOB.owner_id,
    snapshotRaw: raw,
    fingerprint,
  }
  return async () => ({ ...base, ...overrides })
}

describe('preflightSiteDiaryPdfExportCore', () => {
  it('A — report missing → report_not_found', async () => {
    await assert.rejects(
      () =>
        preflightSiteDiaryPdfExportCore({
          admin: {},
          exportJob: VALID_JOB,
          loadSnapshotSource: async () => ({ ok: false, code: 'report_not_found' }),
        }),
      (err) => {
        assert.ok(err instanceof SiteDiaryPdfExportPreflightError)
        assert.equal(err.code, 'report_not_found')
        assert.doesNotMatch(err.message, /Sun/)
        return true
      },
    )
  })

  it('B — DB project differs → ownership_mismatch', async () => {
    await assert.rejects(
      () =>
        preflightSiteDiaryPdfExportCore({
          admin: {},
          exportJob: VALID_JOB,
          loadSnapshotSource: mockLoader({ projectId: '99999999-9999-4999-8999-999999999999' }),
        }),
      (err) => err.code === 'ownership_mismatch',
    )
  })

  it('C — DB owner differs → ownership_mismatch', async () => {
    await assert.rejects(
      () =>
        preflightSiteDiaryPdfExportCore({
          admin: {},
          exportJob: VALID_JOB,
          loadSnapshotSource: mockLoader({ ownerId: '55555555-5555-4555-8555-555555555555' }),
        }),
      (err) => err.code === 'ownership_mismatch',
    )
  })

  it('D — snapshot version mismatch before load', async () => {
    let loaded = false
    await assert.rejects(
      () =>
        preflightSiteDiaryPdfExportCore({
          admin: {},
          exportJob: { ...VALID_JOB, snapshot_version: 99 },
          loadSnapshotSource: async () => {
            loaded = true
            return { ok: true }
          },
        }),
      (err) => err.code === 'snapshot_version_mismatch',
    )
    assert.equal(loaded, false)
  })

  it('E — fingerprint mismatch → content_changed', async () => {
    await assert.rejects(
      () =>
        preflightSiteDiaryPdfExportCore({
          admin: {},
          exportJob: VALID_JOB,
          loadSnapshotSource: mockLoader(),
        }),
      (err) => err.code === 'content_changed',
    )
  })

  it('F — matching fingerprint passes', async () => {
    const loader = mockLoader()
    const loaded = await loader()
    const job = {
      ...VALID_JOB,
      content_fingerprint: loaded.fingerprint,
    }
    const result = await preflightSiteDiaryPdfExportCore({
      admin: {},
      exportJob: job,
      loadSnapshotSource: loader,
    })
    assert.deepEqual(result, {
      reportId: VALID_JOB.report_id,
      projectId: VALID_JOB.project_id,
      ownerId: VALID_JOB.owner_id,
      contentFingerprint: loaded.fingerprint,
      snapshotVersion: 1,
    })
  })

  it('G — uses buildSiteDiaryPdfFingerprint from snapshot-v1', () => {
    const coreSrc = readFileSync(join(here, 'preflight-site-diary-pdf-export-core.js'), 'utf8')
    assert.match(coreSrc, /buildSiteDiaryPdfFingerprint/)
    assert.match(coreSrc, /site-diary-pdf-snapshot-v1/)
  })

  it('K/L — no assembler or renderer imports in preflight modules', () => {
    for (const rel of [
      'preflight-site-diary-pdf-export-core.js',
      'preflight-site-diary-pdf-export.js',
    ]) {
      const src = readFileSync(join(here, rel), 'utf8')
      assert.doesNotMatch(src, /assemble-site-diary-pdf-props/)
      assert.doesNotMatch(src, /render-site-diary-pdf/)
    }
  })

  it('M/N — no Storage or worker RPCs', () => {
    const src = readFileSync(join(here, 'preflight-site-diary-pdf-export.js'), 'utf8')
    assert.doesNotMatch(src, /fail_site_diary_pdf_export/)
    assert.doesNotMatch(src, /complete_site_diary_pdf_export/)
    assert.doesNotMatch(src, /claim_next_site_diary_pdf_export/)
    assert.doesNotMatch(src, /\.upload\(/)
    assert.doesNotMatch(src, /createSignedUrl/)
  })

  it('P — generic errors contain no report content', async () => {
    try {
      await preflightSiteDiaryPdfExportCore({
        admin: {},
        exportJob: VALID_JOB,
        loadSnapshotSource: mockLoader(),
      })
      assert.fail('expected throw')
    } catch (err) {
      assert.doesNotMatch(String(err.message), /Pour slab|North elevation|user-1/)
    }
  })

  it('Q — shared adapter module exists for enqueue', () => {
    const adapter = readFileSync(join(root, 'lib/site-diary-pdf-snapshot-source.js'), 'utf8')
    assert.match(adapter, /export function buildSiteDiaryPdfSnapshotRawInput/)
  })
})
