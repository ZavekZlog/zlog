/**
 * HARD FAIL — Edit This Diary / Project & Report Details hydration journeys A–D.
 *
 * Tests actual loaded form state from canonical saved sources, not only DB writes.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coverFormStateFromReport,
  coverStoragePathFromReport,
  describeDiaryWorkbenchLoadFailure,
  DIARY_WORKBENCH_LOAD_FAILED_COPY,
  DIARY_WORKBENCH_LOAD_TIMEOUT_MS,
  editThisDiaryHref,
  hydrateEditModeCoverAndReference,
  loadEditDiarySetupSources,
  newDiaryInheritsFromProject,
  shouldCommitDiaryLoadState,
  withTimeout,
} from './diary-edit-hydrate.js'
import { projectAndReportDetailsHref } from './diary-routing.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'
import { planCoverPhotoPersistence } from './diary-cover-photo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

const REPORT_WITH_COVER = {
  id: 'rep-1',
  project_id: 'proj-1',
  cover_photo_url: 'user-1/rep-1/cover.jpg',
  site_summary: 'Pour complete',
  creator_name: 'Alex',
}

const PROJECT_WITH_REF = {
  id: 'proj-1',
  name: 'North Site',
  project_reference: 'X',
  site_address: '1 Site Rd',
}

describe('Edit-mode hydration — wiring (canonical loaders)', () => {
  it('Project & Report Details uses loadEditDiarySetupSources', () => {
    assert.match(setupPage, /loadEditDiarySetupSources/)
    assert.match(setupPage, /loaded\.hydration\.projectReference/)
    assert.match(setupPage, /title="Cover photo"/)
    assert.match(setupPage, /coverPhoto/)
    assert.doesNotMatch(setupPage, /coverFormStateFromReport/)
    // Must not require project query param alone — report id is enough to hydrate.
    assert.match(setupPage, /if \(editingReportId\)/)
  })

  it('diary Edit This Diary reloads form and hydrates cover + reference from helpers', () => {
    assert.match(diaryPage, /hydrateEditModeCoverAndReference/)
    assert.match(diaryPage, /handleEnterEditMode/)
    assert.match(diaryPage, /setFormReloadToken/)
    assert.match(diaryPage, /editHydration\.coverStoragePath/)
    assert.match(diaryPage, /editHydration\.projectReference/)
    assert.match(diaryPage, /projectAndReportDetailsHref/)
  })

  it('Edit This Diary and Project & Report Details URLs keep the same report id', () => {
    assert.equal(
      editThisDiaryHref('proj-1', 'rep-1'),
      '/dashboard/project/proj-1/diary?report=rep-1&edit=1',
    )
    assert.equal(
      projectAndReportDetailsHref('proj-1', 'rep-1'),
      '/dashboard/diary/setup?report=rep-1&project=proj-1',
    )
  })
})

describe('Journey A — Cover Photo visible on Edit This Diary', () => {
  it('loaded form state includes cover storagePath immediately (preview optional)', () => {
    const hydration = hydrateEditModeCoverAndReference({
      report: REPORT_WITH_COVER,
      projectRow: PROJECT_WITH_REF,
    })
    assert.equal(hydration.hasCover, true)
    assert.equal(hydration.coverStoragePath, 'user-1/rep-1/cover.jpg')

    const formCover = coverFormStateFromReport(REPORT_WITH_COVER, null)
    assert.equal(formCover.storagePath, 'user-1/rep-1/cover.jpg')
    assert.equal(formCover.preview, null)
    // UI treats storagePath as “attached” even without signed preview.
    assert.ok(formCover.storagePath)
  })

  it('cover path is read from report.cover_photo_url only (not session defaults)', () => {
    assert.equal(coverStoragePathFromReport({ cover_photo_url: '  a/b/cover.jpg  ' }), 'a/b/cover.jpg')
    assert.equal(coverStoragePathFromReport({ cover_photo_url: null }), null)
    assert.equal(coverStoragePathFromReport(null), null)
  })
})

describe('Journey B — Project Reference X prefilled on edit', () => {
  it('edit form state prefills X from projects.project_reference', () => {
    const hydration = hydrateEditModeCoverAndReference({
      report: REPORT_WITH_COVER,
      projectRow: PROJECT_WITH_REF,
      reportExtras: { projectReference: 'STALE' },
    })
    assert.equal(hydration.projectReference, 'X')
    assert.equal(hydration.hasProjectReference, true)
  })

  it('loadEditDiarySetupSources returns form hydration with X + cover', async () => {
    const supabase = {
      from(table) {
        if (table === 'daily_reports') {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: REPORT_WITH_COVER, error: null }),
                      }
                    },
                    maybeSingle: async () => ({ data: REPORT_WITH_COVER, error: null }),
                  }
                },
              }
            },
          }
        }
        if (table === 'projects') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: PROJECT_WITH_REF, error: null }),
                  }
                },
              }
            },
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const loaded = await loadEditDiarySetupSources(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      readExtras: () => ({ projectReference: 'LEGACY' }),
    })
    assert.equal(loaded.ok, true)
    assert.equal(loaded.hydration.projectReference, 'X')
    assert.equal(loaded.hydration.coverStoragePath, 'user-1/rep-1/cover.jpg')
  })
})

describe('Journey C — unrelated edit keeps Cover + Project Reference', () => {
  it('re-hydrate after unrelated field change still returns same cover + X', () => {
    const before = hydrateEditModeCoverAndReference({
      report: REPORT_WITH_COVER,
      projectRow: PROJECT_WITH_REF,
    })
    const afterUnrelatedSave = hydrateEditModeCoverAndReference({
      report: { ...REPORT_WITH_COVER, site_summary: 'Updated summary only' },
      projectRow: PROJECT_WITH_REF,
    })
    assert.equal(afterUnrelatedSave.coverStoragePath, before.coverStoragePath)
    assert.equal(afterUnrelatedSave.projectReference, before.projectReference)

    const keepPlan = planCoverPhotoPersistence({
      coverPhoto: coverFormStateFromReport(REPORT_WITH_COVER, null),
      loadedCoverPath: before.coverStoragePath,
      coverRemoved: false,
    })
    assert.deepEqual(keepPlan.patch, { cover_photo_url: 'user-1/rep-1/cover.jpg' })
  })
})

describe('existing diary workbench load must not stick on Loading', () => {
  it('describes a failed row fetch with a Site Manager message and a diagnostic', () => {
    const failure = describeDiaryWorkbenchLoadFailure({
      stage: 'daily_reports',
      reportId: 'rep-1',
      projectId: 'proj-1',
      error: { message: "Could not find the 'temporary_works' column", code: 'PGRST204' },
    })
    assert.equal(failure.userMessage, DIARY_WORKBENCH_LOAD_FAILED_COPY)
    assert.match(failure.diagnostic, /daily_reports/)
    assert.match(failure.diagnostic, /rep-1/)
    assert.match(failure.diagnostic, /PGRST204/)
    assert.doesNotMatch(failure.userMessage, /PGRST|SELECT|UUID/i)
  })

  it('cancelled or stale generations must not clear the latest load', () => {
    assert.equal(shouldCommitDiaryLoadState({
      cancelled: true,
      generation: 1,
      activeGeneration: 1,
    }), false)
    assert.equal(shouldCommitDiaryLoadState({
      cancelled: false,
      generation: 1,
      activeGeneration: 2,
    }), false)
    assert.equal(shouldCommitDiaryLoadState({
      cancelled: false,
      generation: 2,
      activeGeneration: 2,
    }), true)
  })

  it('withTimeout rejects hung fetches so Loading can end', async () => {
    const hung = new Promise(() => {})
    await assert.rejects(
      () => withTimeout(hung, 20, 'diary-load-timeout'),
      /diary-load-timeout/,
    )
  })

  it('withTimeout resolves when the fetch finishes first', async () => {
    const value = await withTimeout(Promise.resolve({ id: 'rep-1' }), 100, 'diary-load-timeout')
    assert.equal(value.id, 'rep-1')
  })

  it('workbench has a load timeout longer than a normal row fetch', () => {
    assert.equal(DIARY_WORKBENCH_LOAD_TIMEOUT_MS >= 8000, true)
  })
})

describe('Journey D — new diary same project: reference yes, cover no', () => {
  it('new setup prefills Project Reference from project; cover stays empty', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      reportDate: '2026-08-14',
      existingProject: PROJECT_WITH_REF,
    })
    assert.equal(state.projectReference, 'X')

    const inherit = newDiaryInheritsFromProject({
      projectReference: state.projectReference,
      coverStoragePath: REPORT_WITH_COVER.cover_photo_url,
    })
    assert.equal(inherit.projectReference, 'X')
    assert.equal(inherit.coverStoragePath, null)
  })
})

describe('Phase 1 — saved-diary Edit first paint vs display hydrate', () => {
  const composePaint = diaryPage.indexOf(
    '// First usable paint — secondary media/selector work continues below.',
  )
  const editPaint = diaryPage.indexOf('} else if (progressiveEdit) {')
  const viewRecent = diaryPage.indexOf('let logsQuery = supabase', editPaint)
  const applySignatureBlocking = diaryPage.indexOf('await applySignature(existing.signature_url)')
  const childFetch = diaryPage.indexOf("supabase.from('report_labour')")
  const projectFetch = diaryPage.indexOf('fetchProjectRowForEditHydrate')
  const reportFetch = diaryPage.indexOf("from('daily_reports')")

  it('detects ?edit=1 as progressiveEdit without using SDSC for UI', () => {
    assert.match(diaryPage, /const progressiveEdit =/)
    assert.match(
      diaryPage,
      /editFlag === '1' \|\| editFlag === 'true' \|\| editFlag === 'edit'/,
    )
    assert.doesNotMatch(diaryPage, /getSiteDiarySessionSnapshot\(/)
    assert.match(diaryPage, /runSiteDiaryShadowWorkbenchMerge\(/)
  })

  it('edit still waits for project, report, and child rows before first paint', () => {
    assert.ok(projectFetch > 0 && reportFetch > projectFetch)
    assert.ok(childFetch > reportFetch)
    assert.ok(editPaint > childFetch)
    const labourApply = diaryPage.indexOf('setLabourRows(labour.map')
    const plantApply = diaryPage.indexOf('setPlantRows(hydratePlantFormRows(plant')
    const photoApply = diaryPage.indexOf('reportPhotos.map(mapPhotoRowWithoutPreview)')
    const editLoadingOff = diaryPage.indexOf('setLoading(false)', editPaint)
    assert.ok(labourApply > childFetch && labourApply < editPaint)
    assert.ok(plantApply > labourApply && plantApply < editPaint)
    assert.ok(photoApply > plantApply && photoApply < editPaint)
    assert.ok(editLoadingOff > editPaint)
  })

  it('edit does not await the unused project-selector list', () => {
    assert.match(
      diaryPage,
      /if \(!progressiveCompose && !progressiveEdit\) \{[\s\S]*?diaryProjectSelectorSelectColumns\(\)/,
    )
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.doesNotMatch(editBlock, /diaryProjectSelectorSelectColumns/)
    assert.doesNotMatch(editBlock, /allProjectsPromise/)
    assert.match(diaryPage, /allProjectsPromise = progressiveCompose/)
  })

  it('edit does not fetch or await recent diaries', () => {
    assert.match(diaryPage, /recentDiariesPromise = progressiveCompose/)
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.doesNotMatch(editBlock, /recentDiariesPromise/)
    assert.doesNotMatch(editBlock, /setRecentDiaries/)
    assert.match(diaryPage.slice(viewRecent), /setRecentDiaries\(logs \|\| \[\]\)/)
  })

  it('edit applies cover storage path without waiting for a signed preview', () => {
    assert.match(
      diaryPage,
      /if \(progressiveCompose \|\| progressiveEdit\) \{[\s\S]*?applyCoverPathOnly\(editHydration\.coverStoragePath\)/,
    )
    assert.match(diaryPage, /await applyCover\(editHydration\.coverStoragePath\)/)
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.match(editBlock, /resolveCoverPhotoPreviewUrl/)
    const pathOnly = diaryPage.indexOf('applyCoverPathOnly(editHydration.coverStoragePath)')
    assert.ok(pathOnly > 0 && pathOnly < editPaint)
  })

  it('edit photo rows keep ids/paths/captions/rotation/order before signed URLs', () => {
    const mapper = diaryPage.slice(
      diaryPage.indexOf('const mapPhotoRowWithoutPreview'),
      diaryPage.indexOf('photoDisplaySignRef.current'),
    )
    assert.match(mapper, /key: p\.id \|\| p\.url/)
    assert.match(mapper, /storagePath: p\.url/)
    assert.match(mapper, /thumbnailPath: p\.thumbnail_path/)
    assert.match(mapper, /caption: p\.caption/)
    assert.match(mapper, /rotationDegrees: p\.rotation_degrees/)
    assert.match(mapper, /sequence_number: p\.sequence/)
    assert.match(mapper, /preview: null/)
    assert.match(
      diaryPage,
      /if \(progressiveCompose \|\| progressiveEdit\) \{[\s\S]*?mapPhotoRowWithoutPreview/,
    )
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.match(editBlock, /signReportPhotoRows\(reportPhotos\)/)
    const photoRowsApplied = diaryPage.indexOf('reportPhotos.map(mapPhotoRowWithoutPreview)')
    const photoSignInEdit = diaryPage.indexOf('signReportPhotoRows(reportPhotos)', editPaint)
    assert.ok(photoRowsApplied < editPaint && photoSignInEdit > editPaint)
  })

  it('edit keeps branding/logo path before signed logo preview', () => {
    assert.match(
      diaryPage,
      /if \(!progressiveCompose && !progressiveEdit\) \{[\s\S]*?signedUrlForPath\(supabase, logoPath\)/,
    )
    assert.match(diaryPage, /brandLogoUrl: existing\.brand_logo_url \|\| null/)
    const branding = diaryPage.indexOf('setBrandingSelection({')
    const editLoadingOff = diaryPage.indexOf('setLoading(false)', editPaint)
    assert.ok(branding > 0 && branding < editPaint && editLoadingOff > editPaint)
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.match(editBlock, /signedUrlForPath\(supabase, logoPath\)/)
  })

  it('edit keeps signature signed preview blocking before first paint', () => {
    assert.match(
      diaryPage,
      /if \(progressiveCompose\) \{[\s\S]*?applySignaturePathOnly\(existing\.signature_url\)[\s\S]*?await applySignature\(existing\.signature_url\)/,
    )
    assert.ok(applySignatureBlocking > 0 && applySignatureBlocking < editPaint)
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.doesNotMatch(editBlock, /applySignaturePathOnly/)
    assert.doesNotMatch(editBlock, /await applySignature/)
  })

  it('edit hydrateComplete stays after background display hydrate, not first paint', () => {
    const editLoadingOff = diaryPage.indexOf('setLoading(false)', editPaint)
    const editHydrateDone = diaryPage.indexOf('setHydrateComplete(true)', editPaint)
    assert.ok(editLoadingOff > editPaint)
    assert.ok(editHydrateDone > editLoadingOff)
    const editBlock = diaryPage.slice(editPaint, viewRecent)
    assert.match(editBlock, /resolveCoverPhotoPreviewUrl/)
    assert.match(editBlock, /signReportPhotoRows/)
    assert.ok(diaryPage.indexOf('signReportPhotoRows(reportPhotos)', editPaint) < editHydrateDone)
    assert.match(diaryPage, /suppressAutosaveRef\.current = true/)
    assert.match(diaryPage, /hydrateComplete/)
  })

  it('compose first-paint split is unchanged', () => {
    assert.ok(composePaint > 0 && composePaint < editPaint)
    const composeLoadingOff = diaryPage.indexOf('setLoading(false)', composePaint)
    const composeHydrateDone = diaryPage.indexOf('setHydrateComplete(true)', composePaint)
    assert.ok(composeLoadingOff > composePaint && composeLoadingOff < composeHydrateDone)
    const composeBlock = diaryPage.slice(composePaint, editPaint)
    assert.match(composeBlock, /allProjectsPromise/)
    assert.match(composeBlock, /await applySignature\(existing\.signature_url\)/)
    assert.match(composeBlock, /recentDiariesPromise/)
    assert.match(diaryPage, /applySignaturePathOnly\(existing\.signature_url\)/)
  })
})
