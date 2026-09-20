import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSharePdfFingerprint } from './diary-pdf-cache.js'
import {
  SITE_DIARY_PDF_SNAPSHOT_V1,
  SITE_DIARY_PDF_FINGERPRINT_NAMESPACE,
  normalizeSiteDiaryPdfSnapshot,
  siteDiaryPdfSnapshotCanonicalJson,
  buildSiteDiaryPdfFingerprint,
  siteDiaryPdfFingerprintFromNormalized,
} from './site-diary-pdf-snapshot-v1.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEGACY_CACHE = readFileSync(join(root, 'lib/diary-pdf-cache.js'), 'utf8')

function baseInput(overrides = {}) {
  return {
    report: {
      id: 'report-db-a',
      report_date: '2026-08-24',
      weather: 'Clear',
      shift: 'Day',
      site_summary: 'Pour slab',
      creator_name: 'Alex Author',
      creator_role: 'Site Manager',
      company_reporting_for: 'Client Co',
      brand_color: '#112233',
      brand_logo_url: 'user-1/branding/logo.png',
      cover_photo_url: 'user-1/report-a/covers/prepared.jpg',
      cover_processing_version: 'cover-pipeline-1',
      signature_url: 'user-1/report-a/signature.png',
      sign_in_sheet_url: 'user-1/report-a/sign-in-sheet/1000.jpg',
    },
    project: {
      id: 'project-db-a',
      name: 'Alpha Site',
      project_reference: 'PR-100',
      site_address: '1 Site Road',
      client_pm: 'Pat Manager',
      start_date: '2026-01-01',
      planned_completion_date: '2026-12-31',
      working_days_per_week: 5,
    },
    reportingCompany: 'Build Co',
    labour: [
      { sequence: 1, trade: 'Labourer', company: 'Sub Co', count: 4, hours: 8 },
    ],
    plant: [
      { sequence: 1, item: 'Telehandler', ref: 'TH-1', status: 'On hire' },
    ],
    equipment_hire: [
      { description: 'Generator', supplier: 'Hire Co', quantity: 1, status: 'Active' },
    ],
    temporary_works_applicable: true,
    temporary_works: [
      {
        id: 'tw-1',
        sequence: 1,
        type: 'Scaffold',
        scaffoldCheck: 'Checked today — satisfactory',
        scaffoldTag: 'Bay A',
        status: 'In place',
      },
    ],
    permits: [
      {
        id: 'permit-1',
        sequence: 1,
        permitType: 'Hot works',
        reference: 'HW-1',
        status: 'Issued',
        formPhotoPath: 'user-1/report-a/permits/hw-1.jpg',
      },
    ],
    photos: [
      {
        url: 'user-1/report-a/photos/1/report.jpg',
        processing_version: 'photo-pipeline-1',
        report_byte_size: 240000,
        sequence: 1,
        caption: 'North elevation',
        location: 'Block A',
        layout: 'grid4',
        rotation_degrees: 0,
        assigned_to: 'Concrete',
      },
    ],
    updated_at: '2026-08-24T09:00:00.000Z',
    signedCoverUrl: 'https://signed.example/cover.jpg',
    ...overrides,
  }
}

describe('SITE_DIARY_PDF_SNAPSHOT_V1', () => {
  it('exports the v1 contract surface', () => {
    assert.equal(SITE_DIARY_PDF_SNAPSHOT_V1.version, 1)
    assert.equal(SITE_DIARY_PDF_SNAPSHOT_V1.fingerprintNamespace, SITE_DIARY_PDF_FINGERPRINT_NAMESPACE)
    assert.equal(SITE_DIARY_PDF_FINGERPRINT_NAMESPACE, 'zlog-site-diary-pdf:v2:')
    assert.equal(typeof SITE_DIARY_PDF_SNAPSHOT_V1.normalize, 'function')
    assert.equal(typeof SITE_DIARY_PDF_SNAPSHOT_V1.fingerprint, 'function')
  })

  it('identical logical content yields identical fingerprint', () => {
    const a = buildSiteDiaryPdfFingerprint(baseInput())
    const b = buildSiteDiaryPdfFingerprint(baseInput({
      report: {
        ...baseInput().report,
        weather: 'Clear',
      },
    }))
    assert.equal(a, b)
    assert.match(a, /^[0-9a-f]{64}$/)
  })

  it('object key insertion order in input does not change fingerprint', () => {
    const ordered = buildSiteDiaryPdfFingerprint(baseInput())
    const shuffled = buildSiteDiaryPdfFingerprint({
      signedCoverUrl: 'https://signed.example/cover.jpg',
      photos: baseInput().photos,
      permits: baseInput().permits,
      temporary_works: baseInput().temporary_works,
      equipment_hire: baseInput().equipment_hire,
      plant: baseInput().plant,
      labour: baseInput().labour,
      reportingCompany: 'Build Co',
      project: baseInput().project,
      report: baseInput().report,
      updated_at: '2026-08-24T09:00:00.000Z',
    })
    assert.equal(ordered, shuffled)
  })

  it('null and empty string normalization is deterministic', () => {
    const withEmpty = siteDiaryPdfSnapshotCanonicalJson(baseInput({
      report: {
        ...baseInput().report,
        visitors: '',
        delays_issues: '   ',
        actions: null,
      },
      visitors: undefined,
    }))
    const withNull = siteDiaryPdfSnapshotCanonicalJson(baseInput({
      report: {
        ...baseInput().report,
        visitors: null,
        delays_issues: null,
        actions: null,
      },
    }))
    assert.equal(withEmpty, withNull)
  })

  it('does not mutate the input object', () => {
    const input = baseInput()
    const frozen = JSON.parse(JSON.stringify(input))
    normalizeSiteDiaryPdfSnapshot(input)
    buildSiteDiaryPdfFingerprint(input)
    assert.deepEqual(input, frozen)
  })

  it('excludes volatile URLs and non-content timestamps from the canonical snapshot', () => {
    const withVolatile = buildSiteDiaryPdfFingerprint(baseInput({
      updated_at: '2026-08-24T09:00:00.000Z',
      created_at: '2026-08-23T08:00:00.000Z',
      signedCoverUrl: 'https://signed.example/cover.jpg',
      photos: [
        {
          url: 'blob:https://local/photo',
          signedUrl: 'https://signed.example/photo.jpg',
          caption: 'Ignored blob',
          sequence: 99,
        },
        ...baseInput().photos,
      ],
    }))
    const stable = buildSiteDiaryPdfFingerprint(baseInput({
      updated_at: '2026-09-01T12:00:00.000Z',
      created_at: '2026-09-01T11:00:00.000Z',
      signedCoverUrl: 'https://other-signed.example/cover.jpg',
      photos: baseInput().photos,
    }))
    assert.equal(withVolatile, stable)
  })

  it('report and project database ids alone do not affect fingerprint', () => {
    const a = buildSiteDiaryPdfFingerprint(baseInput())
    const b = buildSiteDiaryPdfFingerprint(baseInput({
      report: { ...baseInput().report, id: 'report-db-b', reportId: 'report-db-c' },
      project: { ...baseInput().project, id: 'project-db-b', projectId: 'project-db-c' },
    }))
    assert.equal(a, b)
  })

  it('relevant scalar changes affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      report: { ...baseInput().report, site_summary: 'Pour slab — bay 2' },
    }))
    assert.notEqual(base, changed)
  })

  it('photo caption changes affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      photos: [{ ...baseInput().photos[0], caption: 'South elevation' }],
    }))
    assert.notEqual(base, changed)
  })

  it('photo rotation changes affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      photos: [{ ...baseInput().photos[0], rotation_degrees: 90 }],
    }))
    assert.notEqual(base, changed)
  })

  it('photo processing version changes affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      photos: [{ ...baseInput().photos[0], processing_version: 'photo-pipeline-2' }],
    }))
    assert.notEqual(base, changed)
  })

  it('meaningful photo order changes affect fingerprint', () => {
    const photoA = {
      ...baseInput().photos[0],
      sequence: 1,
      url: 'user-1/report-a/photos/a/report.jpg',
      caption: 'Photo A',
    }
    const photoB = {
      ...baseInput().photos[0],
      sequence: 2,
      url: 'user-1/report-a/photos/b/report.jpg',
      caption: 'Photo B',
    }
    const canonicalOrder = buildSiteDiaryPdfFingerprint(baseInput({ photos: [photoA, photoB] }))
    const reversedInput = buildSiteDiaryPdfFingerprint(baseInput({ photos: [photoB, photoA] }))
    assert.equal(canonicalOrder, reversedInput)

    const sequenceSwapped = buildSiteDiaryPdfFingerprint(baseInput({
      photos: [
        { ...photoA, sequence: 2 },
        { ...photoB, sequence: 1 },
      ],
    }))
    assert.notEqual(canonicalOrder, sequenceSwapped)
  })

  it('labour hours affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      labour: [{ ...baseInput().labour[0], hours: 9 }],
    }))
    assert.notEqual(base, changed)
  })

  it('plant status affects fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      plant: [{ ...baseInput().plant[0], status: 'Off hire' }],
    }))
    assert.notEqual(base, changed)
  })

  it('scaffold check and tag affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      temporary_works: [{
        ...baseInput().temporary_works[0],
        scaffoldCheck: 'Issue identified',
        scaffoldTag: 'Bay B',
      }],
    }))
    assert.notEqual(base, changed)
  })

  it('permit status, reference, and form photo path affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const statusChanged = buildSiteDiaryPdfFingerprint(baseInput({
      permits: [{ ...baseInput().permits[0], status: 'Closed' }],
    }))
    const refChanged = buildSiteDiaryPdfFingerprint(baseInput({
      permits: [{ ...baseInput().permits[0], reference: 'HW-2' }],
    }))
    const photoChanged = buildSiteDiaryPdfFingerprint(baseInput({
      permits: [{ ...baseInput().permits[0], formPhotoPath: 'user-1/report-a/permits/hw-2.jpg' }],
    }))
    assert.notEqual(base, statusChanged)
    assert.notEqual(base, refChanged)
    assert.notEqual(base, photoChanged)
  })

  it('sign-in evidence path affects fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const changed = buildSiteDiaryPdfFingerprint(baseInput({
      report: {
        ...baseInput().report,
        sign_in_sheet_url: 'user-1/report-a/sign-in-sheet/2000.jpg',
      },
    }))
    assert.notEqual(base, changed)
  })

  it('branding logo and colour affect fingerprint', () => {
    const base = buildSiteDiaryPdfFingerprint(baseInput())
    const logoChanged = buildSiteDiaryPdfFingerprint(baseInput({
      report: { ...baseInput().report, brand_logo_url: 'user-1/branding/logo-2.png' },
    }))
    const colourChanged = buildSiteDiaryPdfFingerprint(baseInput({
      report: { ...baseInput().report, brand_color: '#AABBCC' },
    }))
    assert.notEqual(base, logoChanged)
    assert.notEqual(base, colourChanged)
  })

  it('uses the v2 fingerprint namespace in the digest input', () => {
    const normalized = normalizeSiteDiaryPdfSnapshot(baseInput())
    const canonical = SITE_DIARY_PDF_SNAPSHOT_V1.canonicalSerialize(normalized)
    const withNamespace = siteDiaryPdfFingerprintFromNormalized(normalized)
    const withoutNamespace = buildSiteDiaryPdfFingerprint(baseInput())
    assert.equal(withNamespace, withoutNamespace)
    assert.notEqual(
      withNamespace,
      siteDiaryPdfFingerprintFromNormalized({
        ...normalized,
        report: { ...normalized.report, weather: 'Rain' },
      }),
    )
    assert.ok(canonical.length > 10)
    assert.ok(!canonical.includes('\n'))
  })

  it('existing buildSharePdfFingerprint implementation is unchanged', () => {
    assert.match(LEGACY_CACHE, /export function buildSharePdfFingerprint\(input = \{\}\)/)
    const legacy = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [
        { url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 },
      ],
    })
    assert.ok(legacy.includes('r1'))
    assert.ok(legacy.includes('a.jpg'))
  })
})
