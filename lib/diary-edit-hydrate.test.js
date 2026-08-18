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
    assert.doesNotMatch(setupPage, /Cover photo|coverFormStateFromReport|coverPhoto/)
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
