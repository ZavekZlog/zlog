import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSiteDiaryPdfSnapshotSource } from '../load-site-diary-pdf-snapshot-source.js'
import { buildSiteDiaryPdfSnapshotRawInput } from '../site-diary-pdf-snapshot-source.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'

function createMockAdmin(handlers) {
  return {
    from(table) {
      const handler = handlers[table]
      if (!handler) {
        throw new Error(`unexpected table ${table}`)
      }
      return handler()
    },
  }
}

describe('loadSiteDiaryPdfSnapshotSource', () => {
  it('returns report_not_found when report row is missing', async () => {
    const admin = createMockAdmin({
      daily_reports: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    })
    const result = await loadSiteDiaryPdfSnapshotSource(admin, REPORT_ID)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'report_not_found')
  })

  it('loads child tables and builds snapshot raw without signing or downloads', async () => {
    const report = {
      id: REPORT_ID,
      project_id: PROJECT_ID,
      report_date: '2026-08-24',
      weather: 'Clear',
      branding_id: null,
      equipment_hire: [],
      temporary_works: [],
      hs_incidents: [],
      rfis: [],
      variations: [],
      visitors_register_provenance: [],
      projects: {
        id: PROJECT_ID,
        owner_id: OWNER_ID,
        name: 'Site',
        project_reference: 'PR',
        site_address: 'Addr',
        client_pm: 'PM',
        working_days_per_week: 5,
      },
    }

    const admin = createMockAdmin({
      daily_reports: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: report, error: null }),
          }),
        }),
      }),
      report_labour: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      report_plant: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      report_photos: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{ url: 'user/photo.jpg', sequence: 1 }],
              error: null,
            }),
          }),
        }),
      }),
    })

    const result = await loadSiteDiaryPdfSnapshotSource(admin, REPORT_ID)
    assert.equal(result.ok, true)
    assert.equal(result.reportId, REPORT_ID)
    assert.equal(result.projectId, PROJECT_ID)
    assert.equal(result.ownerId, OWNER_ID)
    assert.equal(result.snapshotRaw.photos[0].url, 'user/photo.jpg')
  })

  it('does not import PDF assembler or renderer', () => {
    const src = readFileSync(join(root, 'lib/load-site-diary-pdf-snapshot-source.js'), 'utf8')
    assert.doesNotMatch(src, /assemble-site-diary-pdf-props/)
    assert.doesNotMatch(src, /render-site-diary-pdf/)
    assert.doesNotMatch(src, /createSignedUrl/)
    assert.doesNotMatch(src, /\.download\(/)
  })

  it('uses shared buildSiteDiaryPdfSnapshotRawInput adapter', () => {
    const loaderSrc = readFileSync(join(root, 'lib/load-site-diary-pdf-snapshot-source.js'), 'utf8')
    assert.match(loaderSrc, /buildSiteDiaryPdfSnapshotRawInput/)
    const adapterSrc = readFileSync(join(root, 'lib/site-diary-pdf-snapshot-source.js'), 'utf8')
    assert.doesNotMatch(adapterSrc, /assemble-site-diary-pdf-props/)
  })
})

describe('buildSiteDiaryPdfSnapshotRawInput enqueue parity', () => {
  it('exported from shared module for future enqueue path', () => {
    const mod = readFileSync(join(root, 'lib/site-diary-pdf-snapshot-source.js'), 'utf8')
    assert.match(mod, /export function buildSiteDiaryPdfSnapshotRawInput/)
  })
})
