/**
 * HARD FAIL — Edit This Diary / Edit Report Details hydration journeys A–D.
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
  editReportDetailsHref,
  editThisDiaryHref,
  hydrateEditModeCoverAndReference,
  loadEditDiarySetupSources,
  newDiaryInheritsFromProject,
} from './diary-edit-hydrate.js'
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
  it('setup Edit Report Details uses loadEditDiarySetupSources', () => {
    assert.match(setupPage, /loadEditDiarySetupSources/)
    assert.match(setupPage, /loaded\.hydration\.projectReference/)
    assert.match(setupPage, /coverFormStateFromReport/)
    // Must not require project query param alone — report id is enough to hydrate.
    assert.match(setupPage, /if \(editingReportId\)/)
  })

  it('diary Edit This Diary reloads form and hydrates cover + reference from helpers', () => {
    assert.match(diaryPage, /hydrateEditModeCoverAndReference/)
    assert.match(diaryPage, /handleEnterEditMode/)
    assert.match(diaryPage, /setFormReloadToken/)
    assert.match(diaryPage, /editHydration\.coverStoragePath/)
    assert.match(diaryPage, /editHydration\.projectReference/)
    assert.match(diaryPage, /editReportDetailsHref/)
  })

  it('Edit This Diary and Edit Report Details URLs keep the same report id', () => {
    assert.equal(
      editThisDiaryHref('proj-1', 'rep-1'),
      '/dashboard/project/proj-1/diary?report=rep-1&edit=1',
    )
    assert.equal(
      editReportDetailsHref('proj-1', 'rep-1'),
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
