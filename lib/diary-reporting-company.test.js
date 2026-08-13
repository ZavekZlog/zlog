/**
 * Anti-regression: Reporting Company coherence + Cover Photo persistence journeys A–F.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  reportingCompanyIdentityIsCoherent,
  resolveReportingCompanyIdentity,
  stickyReportingCompanyFromLatest,
} from './diary-reporting-company.js'
import { brandingPayload } from './branding-payload.js'
import {
  coverPhotoStateFromSaved,
  resolveCoverPhotoUrlForSave,
} from './diary-cover-photo.js'
import { clearedDiaryContentFields, reusableDiaryFields } from './diary-draft.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const diaryShare = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const pdfDoc = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')
const brandingPayloadSrc = readFileSync(join(root, 'lib/branding-payload.js'), 'utf8')

describe('A. Latest company stickiness — name + logo from same identity', () => {
  it('Diary3 inherits Outsource Pro name+logo after Diary2 saved that pair (not CBRE name + OP logo)', () => {
    const diary1 = {
      branding_id: 'brand-cbre',
      brand_logo_url: 'logos/cbre.png',
      brand_color: '#FF5000',
    }
    const brandingCbre = {
      id: 'brand-cbre',
      company_name: 'CBRE',
      logo_url: 'logos/cbre.png',
      brand_color: '#FF5000',
    }
    const after1 = resolveReportingCompanyIdentity({
      report: diary1,
      brandingRow: brandingCbre,
    })
    assert.equal(after1.companyName, 'CBRE')
    assert.equal(after1.logoStoragePath, 'logos/cbre.png')

    // Diary 2 saved as Outsource Pro + OP logo (company_brandings updated + report snapshot).
    const diary2 = {
      branding_id: 'brand-op',
      brand_logo_url: 'logos/outsource-pro.png',
      brand_color: '#FF5000',
    }
    const brandingOp = {
      id: 'brand-op',
      company_name: 'Outsource Pro',
      logo_url: 'logos/outsource-pro.png',
      brand_color: '#FF5000',
    }
    const sticky = stickyReportingCompanyFromLatest({
      latestReport: diary2,
      latestBrandingRow: brandingOp,
      defaultProfile: brandingCbre, // stale default must NOT win name alone
    })
    assert.equal(sticky.companyName, 'Outsource Pro')
    assert.equal(sticky.logoStoragePath, 'logos/outsource-pro.png')
    assert.equal(
      reportingCompanyIdentityIsCoherent({
        companyName: sticky.companyName,
        logoStoragePath: sticky.logoStoragePath,
        expectedName: 'Outsource Pro',
        expectedLogoPath: 'logos/outsource-pro.png',
      }),
      true,
    )
    // HARD FAIL: CBRE name with Outsource Pro logo
    assert.equal(
      reportingCompanyIdentityIsCoherent({
        companyName: 'CBRE',
        logoStoragePath: 'logos/outsource-pro.png',
        expectedName: 'Outsource Pro',
        expectedLogoPath: 'logos/outsource-pro.png',
      }),
      false,
    )
  })

  it('never pairs default-profile name with a different report logo', () => {
    const resolved = resolveReportingCompanyIdentity({
      report: { brand_logo_url: 'logos/outsource-pro.png', branding_id: null },
      defaultProfile: {
        id: 'brand-cbre',
        company_name: 'CBRE',
        logo_url: 'logos/cbre.png',
      },
    })
    assert.equal(resolved.logoStoragePath, 'logos/outsource-pro.png')
    assert.notEqual(resolved.companyName, 'CBRE')
  })
})

describe('B. Edit company persistence — reopen keeps same name/logo pair', () => {
  it('edit hydrate prefers linked branding row name with report logo snapshot', () => {
    const resolved = resolveReportingCompanyIdentity({
      report: {
        branding_id: 'brand-op',
        brand_logo_url: 'logos/outsource-pro.png',
        brand_color: '#111',
      },
      brandingRow: {
        id: 'brand-op',
        company_name: 'Outsource Pro',
        logo_url: 'logos/outsource-pro.png',
        brand_color: '#FF5000',
      },
      defaultProfile: {
        id: 'brand-cbre',
        company_name: 'CBRE',
        logo_url: 'logos/cbre.png',
      },
    })
    assert.equal(resolved.companyName, 'Outsource Pro')
    assert.equal(resolved.logoStoragePath, 'logos/outsource-pro.png')
  })

  it('setup wires sticky fetch + persistReportingCompanyIdentity on continue', () => {
    assert.match(setupPage, /fetchStickyReportingCompany/)
    assert.match(setupPage, /fetchReportingCompanyForReport/)
    assert.match(setupPage, /persistReportingCompanyIdentity/)
  })
})

describe('C–E. Cover photo save / edit / review', () => {
  it('C. create → add cover → save payload keeps storage path', () => {
    const afterUpload = resolveCoverPhotoUrlForSave({
      coverPhoto: { file: null, preview: 'https://x', storagePath: 'u/r/cover.jpg' },
      loadedCoverPath: 'u/r/cover.jpg',
      coverRemoved: false,
    })
    assert.equal(afterUpload, 'u/r/cover.jpg')
    assert.match(diaryPage, /cover_photo_url: coverPhotoUrl/)
  })

  it('D. edit unrelated field — untouched cover path preserved', () => {
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: coverPhotoStateFromSaved('u/r/cover.jpg', 'https://signed/cover'),
        loadedCoverPath: 'u/r/cover.jpg',
        coverRemoved: false,
      }),
      'u/r/cover.jpg',
    )
  })

  it('E. review/edit hydrate loads cover_photo_url; new diary does not inherit cover', () => {
    assert.match(diaryPage, /applyCover\(existing\.cover_photo_url\)/)
    assert.match(setupPage, /cover_photo_url/)
    const cleared = clearedDiaryContentFields()
    assert.equal(cleared.cover_photo_url, null)
    const reused = reusableDiaryFields({
      brand_logo_url: 'logos/op.png',
      cover_photo_url: 'u/old/cover.jpg',
      company_reporting_for: 'Client',
    })
    assert.equal(reused.brand_logo_url, 'logos/op.png')
    assert.equal(Object.prototype.hasOwnProperty.call(reused, 'cover_photo_url'), false)
  })
})

describe('F. Cover photo PDF + brandingPayload must not wipe', () => {
  it('PDF prepare selects cover_photo_url and passes coverPhotoUrl into the document', () => {
    assert.match(diaryShare, /cover_photo_url/)
    assert.match(diaryShare, /coverPhotoUrl/)
    assert.match(pdfDoc, /coverPhotoUrl/)
  })

  it('brandingPayload(null) does not wipe logo/cover sibling keys', () => {
    assert.deepEqual(brandingPayload(null), {})
    assert.deepEqual(brandingPayload(undefined), {})
    assert.deepEqual(
      brandingPayload({
        brandingId: null,
        brandLogoUrl: 'logos/outsource-pro.png',
        brandColor: '#FF5000',
      }),
      {
        branding_id: null,
        brand_color: '#FF5000',
        brand_logo_url: 'logos/outsource-pro.png',
      },
    )
    assert.match(brandingPayloadSrc, /Never invent wipe-all-nulls/)
  })
})
