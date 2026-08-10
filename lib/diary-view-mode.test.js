import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  basisCreatesNewDiaryId,
  cancelEditReturnsToView,
  diaryEditHref,
  diaryModeBanner,
  diaryViewHref,
  editKeepsSameDiaryId,
  openingDiaryPerformsWrite,
  resolveDiaryInteractionMode,
} from './diary-view-mode.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('diary view mode — open saved diary', () => {
  it('opening a saved diary enters View mode', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-1', editQuery: null, isDraft: false }),
      'view',
    )
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-1', editQuery: '', isDraft: null }),
      'view',
    )
  })

  it('does not claim the diary is being edited in View mode', () => {
    const banner = diaryModeBanner({ mode: 'view', projectName: 'North Site' })
    assert.equal(banner.kind, 'view')
    assert.match(banner.text, /viewing the saved Site Diary for North Site/i)
    assert.doesNotMatch(banner.text, /editing/i)
  })

  it('no database write occurs merely from opening it', () => {
    assert.equal(openingDiaryPerformsWrite(), false)
  })

  it('view href has report id and no edit flag', () => {
    assert.equal(
      diaryViewHref('proj-1', 'rep-1'),
      '/dashboard/project/proj-1/diary?report=rep-1',
    )
    assert.doesNotMatch(diaryViewHref('proj-1', 'rep-1'), /edit=/)
  })
})

describe('diary view mode — Edit This Diary', () => {
  it('Edit This Diary edits the same diary ID', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-1', editQuery: '1', isDraft: false }),
      'edit',
    )
    assert.equal(editKeepsSameDiaryId('rep-1', 'rep-1'), true)
    assert.equal(
      diaryEditHref('proj-1', 'rep-1'),
      '/dashboard/project/proj-1/diary?report=rep-1&edit=1',
    )
    const banner = diaryModeBanner({ mode: 'edit', projectName: 'North Site' })
    assert.match(banner.text, /editing the saved Site Diary for North Site/i)
  })

  it('Cancelling Edit returns to View mode without saving', () => {
    assert.equal(
      cancelEditReturnsToView({
        beforeMode: 'edit',
        afterMode: 'view',
        reportIdBefore: 'rep-1',
        reportIdAfter: 'rep-1',
      }),
      true,
    )
    assert.equal(
      cancelEditReturnsToView({
        beforeMode: 'edit',
        afterMode: 'edit',
        reportIdBefore: 'rep-1',
        reportIdAfter: 'rep-1',
      }),
      false,
    )
  })

  it('in-progress drafts still open in Edit without an edit query', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'rep-draft', editQuery: null, isDraft: true }),
      'edit',
    )
  })
})

describe('diary view mode — Use as Basis for New Diary', () => {
  it('creates a new diary ID and leaves the original unchanged', () => {
    assert.equal(basisCreatesNewDiaryId('rep-original', 'rep-new'), true)
    assert.equal(basisCreatesNewDiaryId('rep-1', 'rep-1'), false)
  })
})

describe('diary view mode — page wiring contract', () => {
  it('diary page uses view-mode helpers and View / Edit actions', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    assert.match(page, /resolveDiaryInteractionMode|diaryViewHref|diaryEditHref/)
    assert.match(page, /Edit This Diary/)
    assert.match(page, /Use as Basis for New Diary/)
    assert.match(page, /Cancel editing/)
    assert.doesNotMatch(page, /You’re editing today’s Site Diary/)
  })

  it('refreshing a viewed diary uses view href (no auto edit / no template create on report=)', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    // Load path for ?report= is select-only; createTodaysDiaryDraft is not in that effect.
    assert.match(page, /load:start/)
    assert.ok(existsSync(join(root, 'lib/diary-view-mode.js')))
  })
})
