/**
 * Anti-regression: Reporting Company coherence + Cover Photo persistence journeys A–F.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchLatestReportingOnBehalfOf,
  fetchStickyReportingCompany,
  reportingCompanyIdentityIsCoherent,
  resolvePdfReportBrandColor,
  resolveReportBrandColor,
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

/** @param {Array<{ company_reporting_for?: string|null, created_at: string }>} reportRows newest first */
function mockRobLookupSupabase(reportRows) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      if (table === 'daily_reports') {
        return {
          select() {
            return {
              eq() { return this },
              order() { return this },
              limit(n) {
                if (n === 25) {
                  return Promise.resolve({ data: reportRows, error: null })
                }
                return this
              },
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

/** @param {Array<Record<string, unknown>>} reportRows newest first */
function mockStickySetupSupabase(reportRows) {
  const latestReport = reportRows[0] || null
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      if (table === 'company_brandings') {
        const chain = {
          select() { return chain },
          eq() { return chain },
          order() { return chain },
          limit() { return chain },
          async maybeSingle() {
            return { data: null, error: null }
          },
        }
        return chain
      }
      if (table === 'daily_reports') {
        return {
          select(columns) {
            return {
              eq() { return this },
              order() { return this },
              limit(n) {
                if (n === 25) {
                  return Promise.resolve({ data: reportRows, error: null })
                }
                if (n === 1) {
                  return {
                    async maybeSingle() {
                      return { data: latestReport, error: null }
                    },
                  }
                }
                return this
              },
              async maybeSingle() {
                return { data: latestReport, error: null }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('New Site Diary — Reporting On Behalf Of sticky (newest non-empty)', () => {
  it('1. latest row blank + older row Cwalker → setup sticky receives Cwalker', async () => {
    const supabase = mockRobLookupSupabase([
      { company_reporting_for: null, created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: 'Cwalker', created_at: '2026-08-27T12:00:00Z' },
    ])
    assert.equal(await fetchLatestReportingOnBehalfOf(supabase), 'Cwalker')

    const sticky = await fetchStickyReportingCompany(mockStickySetupSupabase([
      { company_reporting_for: null, created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: 'Cwalker', created_at: '2026-08-27T12:00:00Z' },
    ]))
    assert.equal(sticky.reportingOnBehalfOf, 'Cwalker')
  })

  it('2. latest row non-empty → newest non-empty value wins', async () => {
    const supabase = mockRobLookupSupabase([
      { company_reporting_for: 'Turner Construction', created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: 'Cwalker', created_at: '2026-08-27T12:00:00Z' },
    ])
    assert.equal(await fetchLatestReportingOnBehalfOf(supabase), 'Turner Construction')

    const sticky = await fetchStickyReportingCompany(mockStickySetupSupabase([
      { company_reporting_for: 'Turner Construction', created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: 'Cwalker', created_at: '2026-08-27T12:00:00Z' },
    ]))
    assert.equal(sticky.reportingOnBehalfOf, 'Turner Construction')
  })

  it('3. multiple recent blank rows → scans back to newest non-empty ROB', async () => {
    const supabase = mockRobLookupSupabase([
      { company_reporting_for: '', created_at: '2026-08-30T12:00:00Z' },
      { company_reporting_for: null, created_at: '2026-08-29T12:00:00Z' },
      { company_reporting_for: '   ', created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: 'Cwalker', created_at: '2026-08-27T12:00:00Z' },
    ])
    assert.equal(await fetchLatestReportingOnBehalfOf(supabase), 'Cwalker')
  })

  it('4. no previous non-empty ROB → field remains empty (no fabrication)', async () => {
    const supabase = mockRobLookupSupabase([
      { company_reporting_for: null, created_at: '2026-08-28T12:00:00Z' },
      { company_reporting_for: '', created_at: '2026-08-27T12:00:00Z' },
    ])
    assert.equal(await fetchLatestReportingOnBehalfOf(supabase), '')

    const sticky = await fetchStickyReportingCompany(mockStickySetupSupabase([
      { company_reporting_for: null, created_at: '2026-08-28T12:00:00Z' },
    ]))
    assert.equal(sticky.reportingOnBehalfOf, '')
  })

  it('fetchStickyReportingCompany delegates ROB to fetchLatestReportingOnBehalfOf', () => {
    const src = readFileSync(join(root, 'lib/diary-reporting-company.js'), 'utf8')
    const fn = src.slice(
      src.indexOf('export async function fetchStickyReportingCompany'),
      src.indexOf('export async function fetchReportingCompanyForReport'),
    )
    assert.match(fn, /fetchLatestReportingOnBehalfOf\(supabase\)/)
    assert.match(setupPage, /fetchStickyReportingCompany/)
    assert.match(setupPage, /reportingOnBehalfOf: stickyCompany\.reportingOnBehalfOf/)
    assert.match(setupPage, /reportDate: todayIsoDate\(\)/)
  })
})

describe('A. Latest company stickiness — name + logo from same identity', () => {
  it('repairs a stale report colour from the linked profile only for the exact same logo', () => {
    const brandingRow = {
      id: 'brand-op',
      logo_url: 'logos/outsource-pro.png',
      brand_color: '#1264A3',
    }
    assert.equal(
      resolveReportBrandColor({
        report: {
          brand_logo_url: 'logos/outsource-pro.png',
          brand_color: '#2E7D32',
        },
        brandingRow,
      }),
      '#1264A3',
    )
    assert.equal(
      resolveReportBrandColor({
        report: {
          brand_logo_url: 'logos/historical-company.png',
          brand_color: '#2E7D32',
        },
        brandingRow,
      }),
      '#2E7D32',
    )
  })

  it('uses neutral PDF fallback for identifiable legacy setup logos with unverified colour', () => {
    const brandingRow = {
      logo_url: 'user/branding/setup-1723700000000.png',
      brand_color: '#2E7D32',
    }
    assert.equal(
      resolvePdfReportBrandColor({
        report: {
          brand_logo_url: 'user/branding/setup-1723700000000.png',
          brand_color: '#2E7D32',
        },
        brandingRow,
      }),
      null,
    )
    assert.equal(
      resolvePdfReportBrandColor({
        report: {
          brand_logo_url: 'user/branding/setup-colour-v2-1723800000000.png',
          brand_color: '#1264A3',
        },
        brandingRow: {
          logo_url: 'user/branding/setup-colour-v2-1723800000000.png',
          brand_color: '#1264A3',
        },
      }),
      '#1264A3',
    )
  })

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

  it('extracts a replacement logo colour before persisting the company/report snapshot', () => {
    assert.match(setupPage, /extractBrandColorFromFile/)
    const extractAt = setupPage.indexOf('extractBrandColorFromFile(logoFile')
    const persistAt = setupPage.indexOf('await persistReportingCompanyIdentity')
    assert.ok(extractAt > 0 && persistAt > extractAt)
    assert.match(setupPage, /brandColor:\s*candidateBrandColor/)
    assert.match(setupPage, /branding\/setup-colour-v2-/)
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
              limit() {
                return Promise.resolve({
                  data: [{
                    company_reporting_for: 'Turner Construction',
                    created_at: '2026-08-14T09:00:00Z',
                  }],
                  error: null,
                })
              },
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
    const uploadAt = setupPage.indexOf('uploadLogoIfNeeded(user.id)')
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

  it('E. review/edit hydrate loads cover_photo_url; Use as Basis carries cover forward', () => {
    assert.match(diaryPage, /applyCover\(editHydration\.coverStoragePath\)/)
    assert.equal([...setupPage.matchAll(/title="Cover photo"/g)].length, 1)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 0)
    const cleared = clearedDiaryContentFields()
    assert.equal(cleared.cover_photo_url, null)
    const reused = reusableDiaryFields({
      brand_logo_url: 'logos/op.png',
      cover_photo_url: 'u/old/cover.jpg',
      company_reporting_for: 'Client',
    })
    assert.equal(reused.brand_logo_url, 'logos/op.png')
    assert.equal(reused.cover_photo_url, 'u/old/cover.jpg')
  })
})

describe('F. Cover photo PDF + brandingPayload must not wipe', () => {
  it('PDF prepare selects cover_photo_url and passes coverPhotoUrl into the document', () => {
    assert.match(diaryShare, /cover_photo_url/)
    assert.match(diaryShare, /coverPhotoUrl/)
    assert.match(pdfDoc, /coverPhotoUrl/)
  })

  it('PDF resolves report colour against the linked same-logo company identity', () => {
    assert.match(diaryShare, /company_name, logo_url, brand_color/)
    assert.match(diaryShare, /resolvePdfReportBrandColor\(\{ report, brandingRow \}\)/)
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
