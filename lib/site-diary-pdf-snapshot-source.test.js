import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSiteDiaryPdfSnapshotRawInput,
  SITE_DIARY_PDF_SNAPSHOT_RAW_CATEGORIES,
} from './site-diary-pdf-snapshot-source.js'
import { buildSiteDiaryPdfFingerprint } from './site-diary-pdf-snapshot-v1.js'

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'

function sampleDbBundle() {
  const report = {
    id: REPORT_ID,
    project_id: PROJECT_ID,
    report_date: '2026-08-24',
    weather: 'Clear',
    shift: 'Day',
    site_summary: 'Pour slab',
    creator_name: 'Alex',
    creator_role: 'SM',
    company_reporting_for: 'Client Co',
    brand_color: '#112233',
    brand_logo_url: 'user-1/branding/logo.png',
    cover_photo_url: 'user-1/report/cover.jpg',
    cover_processing_version: 'cover-v1',
    signature_url: 'user-1/report/sig.png',
    sign_in_sheet_url: 'user-1/report/sign-in.jpg',
    equipment_hire: [{ description: 'Gen', supplier: 'Hire', quantity: 1, status: 'Active' }],
    temporary_works_applicable: true,
    temporary_works: [{ id: 'tw-1', sequence: 1, type: 'Scaffold', status: 'OK' }],
    permits: [{ id: 'p-1', sequence: 1, permitType: 'Hot works', reference: 'HW-1', status: 'Issued' }],
    hs_incidents: [],
    rfis: [],
    variations: [],
    visitors_register_provenance: [],
  }
  const project = {
    id: PROJECT_ID,
    owner_id: OWNER_ID,
    name: 'Alpha Site',
    project_reference: 'PR-1',
    site_address: '1 Road',
    client_pm: 'Pat',
    start_date: '2026-01-01',
    planned_completion_date: '2026-12-31',
    working_days_per_week: 5,
  }
  return {
    report,
    project,
    labourRows: [{ sequence: 1, trade: 'Labourer', company: 'Sub', count: 4, hours: 8 }],
    plantRows: [{ sequence: 1, item: 'Telehandler', ref: 'TH-1', status: 'On hire' }],
    photoRows: [
      {
        url: 'user-1/report/photos/1/report.jpg',
        processing_version: 'photo-v1',
        report_byte_size: 240000,
        sequence: 1,
        caption: 'North',
        location: 'Block A',
        layout: 'grid4',
        rotation_degrees: 0,
        assigned_to: 'Concrete',
      },
    ],
    reportingCompany: 'Build Co',
  }
}

describe('buildSiteDiaryPdfSnapshotRawInput', () => {
  it('includes all snapshot v1 raw categories', () => {
    const raw = buildSiteDiaryPdfSnapshotRawInput(sampleDbBundle())
    for (const key of SITE_DIARY_PDF_SNAPSHOT_RAW_CATEGORIES) {
      assert.ok(Object.prototype.hasOwnProperty.call(raw, key), `missing category ${key}`)
    }
  })

  it('maps report_photos to durable url paths for fingerprinting', () => {
    const raw = buildSiteDiaryPdfSnapshotRawInput(sampleDbBundle())
    assert.equal(raw.photos.length, 1)
    assert.equal(raw.photos[0].url, 'user-1/report/photos/1/report.jpg')
    assert.doesNotMatch(String(raw.photos[0].url), /^https?:/i)
    assert.doesNotMatch(String(raw.photos[0].url), /^data:/i)
  })

  it('produces a fingerprint via existing snapshot-v1 implementation', () => {
    const raw = buildSiteDiaryPdfSnapshotRawInput(sampleDbBundle())
    const fp = buildSiteDiaryPdfFingerprint(raw)
    assert.match(fp, /^[0-9a-f]{64}$/)
  })

  it('is suitable for enqueue and worker preflight (same mapping)', () => {
    const a = buildSiteDiaryPdfFingerprint(buildSiteDiaryPdfSnapshotRawInput(sampleDbBundle()))
    const b = buildSiteDiaryPdfFingerprint(buildSiteDiaryPdfSnapshotRawInput(sampleDbBundle()))
    assert.equal(a, b)
  })
})
