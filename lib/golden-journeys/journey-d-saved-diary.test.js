/**
 * Golden Journey D — Saved diary opens in neutral VIEW (contract layer).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diaryEditHref,
  diaryViewHref,
  isDiaryWritableMode,
  resolveDiaryInteractionMode,
} from '../diary-view-mode.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

describe('Golden Journey D — Saved Diary VIEW (contract)', () => {
  it('opening with report id alone is view — not edit, not compose', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'saved-1' }),
      'view',
    )
    assert.equal(isDiaryWritableMode('view'), false)
  })

  it('Edit This Diary explicitly enters edit mode (same diary)', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'saved-1', editQuery: '1' }),
      'edit',
    )
    assert.equal(isDiaryWritableMode('edit'), true)
    assert.match(diaryEditHref('proj-1', 'saved-1'), /edit=1/)
    assert.doesNotMatch(diaryViewHref('proj-1', 'saved-1'), /edit=1/)
  })

  it('only explicit edit mode shows edit-state UI chrome contracts', () => {
    assert.match(diaryPage, /Edit This Diary/)
    assert.match(diaryPage, /isDiaryExplicitEditMode|editQuery|edit=1/)
    assert.doesNotMatch(diaryPage, /Cancel Editing/)
  })
})
