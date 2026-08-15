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
import {
  clearedDiaryContentFields,
  createBlankDiaryDraft,
  reusableDiaryFields,
} from './diary-draft.js'

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
      company_reporting_for: 'Turner Construction',
      project_id: 'project-latest',
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
    assert.equal(sticky.reportingOnBehalfOf, 'Turner Construction')
    assert.equal(sticky.latestProjectId, 'project-latest')
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
    assert.match(setupPage, /editingProjectId \|\| stickyCompany\.latestProjectId/)
    assert.match(setupPage, /find\(\(p\) => p\.id === preferredProjectId\)/)
    assert.doesNotMatch(setupPage, /setReportingOnBehalfOf\(''\)/)
  })

  it('genuinely new diary keeps company branding and latest Reporting On Behalf Of', async () => {
    let inserted = null
    let brandingOrderCalls = 0
    const brandingQuery = {
      select() { return brandingQuery },
      eq() { return brandingQuery },
      order() {
        brandingOrderCalls += 1
        return brandingOrderCalls >= 2
          ? Promise.resolve({
              data: [{
                id: 'brand-op',
                company_name: 'Outsource Pro',
                logo_url: 'logos/outsource-pro.png',
                brand_color: '#FF5000',
                is_default: true,
              }],
            })
          : brandingQuery
      },
    }
    const supabase = {
      auth: {
        async getUser() {
          return { data: { user: { id: 'user-1' } }, error: null }
        },
      },
      from(table) {
        if (table === 'company_brandings') return brandingQuery
        assert.equal(table, 'daily_reports')
        return {
          select() {
            return {
              eq() { return this },
              order() { return this },
              limit() { return this },
              async maybeSingle() {
                return {
                  data: {
                    company_reporting_for: 'Turner Construction',
                    created_at: '2026-08-14T09:00:00Z',
                  },
                  error: null,
                }
              },
            }
          },
          insert(row) {
            inserted = row
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'rep-new' }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const reportId = await createBlankDiaryDraft(supabase, 'proj-1')
    assert.equal(reportId, 'rep-new')
    assert.equal(inserted.branding_id, 'brand-op')
    assert.equal(inserted.brand_logo_url, 'logos/outsource-pro.png')
    assert.equal(inserted.company_reporting_for, 'Turner Construction')
    assert.equal(inserted.cover_photo_url, null)
  })

  it('validates setup before uploading or persisting company branding', () => {
    const validateAt = setupPage.indexOf('const formValidation = validateDiarySetupContinue')
    const uploadAt = setupPage.indexOf('brandLogoUrl = await uploadLogoIfNeeded')
    const persistAt = setupPage.indexOf('await persistReportingCompanyIdentity')
    assert.ok(validateAt > 0 && uploadAt > validateAt)
    assert.ok(persistAt > uploadAt)
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
    assert.match(diaryPage, /applyCoverPhotoPatch/)
    assert.match(diaryPage, /coverPlan/)
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
    assert.match(diaryPage, /applyCover\(editHydration\.coverStoragePath\)/)
    assert.doesNotMatch(setupPage, /Cover photo|coverPhoto|cover_photo_url/)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 1)
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
