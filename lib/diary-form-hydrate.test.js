import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  emptyPlantFormRows,
  hydrateAuthorName,
  hydrateAuthorRole,
  hydratePlantFormRows,
  linkedProjectForSavedDiary,
  postSaveDiaryHref,
  saveKeepsSameDiaryId,
  shouldShowBrandingSelector,
  shouldShowRecentDiariesOnReportPage,
} from './diary-form-hydrate.js'
import {
  diaryModeBanner,
  resolveDiaryInteractionMode,
} from './diary-view-mode.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let key = 0
const makeKey = () => `k${++key}`

describe('saved diary opens in View / Edit same id', () => {
  it('saved diary opens in View mode', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-a', editQuery: null, isDraft: false }),
      'view',
    )
  })

  it('Edit This Diary edits the same diary ID', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-a', editQuery: '1', isDraft: false }),
      'edit',
    )
    assert.equal(saveKeepsSameDiaryId('rep-a', 'rep-a'), true)
  })

  it('wording uses saved Site Diary (not today’s) in View and Edit', () => {
    const view = diaryModeBanner({ mode: 'view', projectName: 'North Site' })
    const edit = diaryModeBanner({ mode: 'edit', projectName: 'North Site' })
    assert.match(view.text, /viewing the saved Site Diary for North Site/i)
    assert.match(edit.text, /editing the saved Site Diary for North Site/i)
    assert.doesNotMatch(edit.text, /today’s Site Diary/i)
  })
})

describe('branding on existing diary', () => {
  it('normal branding selectors are not shown in Edit/View for an existing report', () => {
    assert.equal(shouldShowBrandingSelector({ hasReportId: true, allowChangeBranding: false }), false)
    assert.equal(shouldShowBrandingSelector({ hasReportId: true }), false)
  })

  it('branding selector remains available when there is no open report id', () => {
    assert.equal(shouldShowBrandingSelector({ hasReportId: false }), true)
  })
})

describe('linked project retained', () => {
  it('linked project name and project_id remain present', () => {
    const linked = linkedProjectForSavedDiary({
      reportProjectId: 'proj-1',
      routeProjectId: 'proj-1',
      projectName: 'North Site',
    })
    assert.equal(linked.linked, true)
    assert.equal(linked.projectId, 'proj-1')
    assert.equal(linked.projectName, 'North Site')
  })

  it('existing diary cannot silently lose its project association', () => {
    const linked = linkedProjectForSavedDiary({
      reportProjectId: 'proj-1',
      routeProjectId: 'proj-other',
      projectName: 'North Site',
    })
    assert.equal(linked.projectId, 'proj-1')
    assert.equal(linked.linked, true)
  })
})

describe('author role hydrate', () => {
  it('saved Author Role reloads in View and Edit hydrate', () => {
    assert.equal(hydrateAuthorRole({ creator_role: 'Contracts Manager' }), 'Contracts Manager')
    assert.equal(hydrateAuthorName({ creator_name: 'Alex' }), 'Alex')
  })

  it('missing Author Role remains blank (no Site Manager invent)', () => {
    assert.equal(hydrateAuthorRole({ creator_role: null }), '')
    assert.equal(hydrateAuthorRole({ creator_role: '' }), '')
    assert.equal(hydrateAuthorRole({}), '')
    assert.doesNotMatch(hydrateAuthorRole({ creator_role: null }), /Site Manager/i)
  })
})

describe('plant/equipment isolation', () => {
  it('diary A never receives plant data from diary B', () => {
    const plantA = [{ item: 'Excavator', ref: '1', status: '8', notes: 'A' }]
    const plantB = [{ item: 'Crane', ref: '2', status: '4', notes: 'B' }]
    const rowsA = hydratePlantFormRows(plantA, makeKey)
    const rowsB = hydratePlantFormRows(plantB, makeKey)
    assert.equal(rowsA[0].plant_type, 'Excavator')
    assert.equal(rowsB[0].plant_type, 'Crane')
    assert.notEqual(rowsA[0].notes, rowsB[0].notes)
  })

  it('a normal new diary starts with no plant/equipment entries', () => {
    const empty = emptyPlantFormRows(makeKey)
    assert.equal(empty.length, 1)
    assert.equal(empty[0].plant_type, '')
    assert.equal(empty[0].quantity, '')
    assert.equal(empty[0].hours, '')
    assert.equal(empty[0].notes, '')
  })
})

describe('post-save View + no recent list on report page', () => {
  it('saving an edited diary returns to that diary in View mode', () => {
    assert.equal(
      postSaveDiaryHref('proj-1', 'rep-1'),
      '/dashboard/project/proj-1/diary?report=rep-1',
    )
    assert.doesNotMatch(postSaveDiaryHref('proj-1', 'rep-1'), /edit=|compose=|complete/)
  })

  it('Recent Diaries are not rendered on the saved diary page', () => {
    assert.equal(shouldShowRecentDiariesOnReportPage({ hasOpenReport: true }), false)
    assert.equal(shouldShowRecentDiariesOnReportPage({ hasOpenReport: false }), true)
  })

  it('no duplicate diary is created when editing', () => {
    assert.equal(saveKeepsSameDiaryId('rep-1', 'rep-1'), true)
    assert.equal(saveKeepsSameDiaryId('rep-1', 'rep-2'), false)
  })

  it('diary page wires hydrate helpers and hides branding selector / recent list on report', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    assert.match(page, /hydrateAuthorRole|hydratePlantFormRows|postSaveDiaryHref/)
    assert.match(page, /shouldShowBrandingSelector/)
    assert.match(page, /shouldShowRecentDiariesOnReportPage/)
    assert.ok(existsSync(join(root, 'lib/diary-form-hydrate.js')))
  })
})
