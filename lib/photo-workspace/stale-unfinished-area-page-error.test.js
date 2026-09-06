/**
 * Fresh Edit must not paint a stale unfinished-area Share fallback.
 * Genuine unfinished drafts must still warn.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAreaPhoto } from '../ai-annotation/area-groups.js'
import { hasUnsavedPhotoWorkspaceDraft } from './model.js'
import { SAVE_AREA_PERSIST_FAIL_MESSAGE } from './persist-save-area.js'
import {
  SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE,
  SHARE_UNSAVED_AREA_LAYOUT_MESSAGE,
  SHARE_UNSAVED_AREA_NAME_MESSAGE,
  SHARE_UNSAVED_AREA_PHOTOS_MESSAGE,
  isUnfinishedAreaFallbackPageError,
  visibleDiaryUnfinishedAreaPageError,
} from './commit-unsaved-area.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

function reportOpenResetBlock() {
  const start = diaryPage.indexOf('// Clear stale locks when opening/switching a report')
  const end = diaryPage.indexOf('[editingReportId, invalidatePreparedSharePdf]')
  return diaryPage.slice(start, end)
}

function enterEditBlock() {
  return diaryPage.slice(
    diaryPage.indexOf('const handleEnterEditMode = () => {'),
    diaryPage.indexOf('const handleCancelEditMode = () => {'),
  )
}

function staleFallbackGuardBlock() {
  const start = diaryPage.indexOf('drop stale unfinished-area Share fallback')
  const end = diaryPage.indexOf('if (loading && !loadDiagnostic)')
  return diaryPage.slice(start, end)
}

function genuineDraft() {
  return {
    phase: 'create',
    nameDraft: 'Roof',
    descriptionDraft: '',
    draftPhotos: [
      createAreaPhoto({
        file: { name: 'east.jpg' },
        preview: 'blob:east',
        description: '',
        rotationDegrees: 0,
      }),
    ],
  }
}

describe('stale unfinished-area page error — helper', () => {
  it('B — stale unfinished-area fallback + no real draft → warning not rendered', () => {
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({
        phase: 'create',
        nameDraft: '',
        descriptionDraft: '',
        draftPhotos: [],
      }),
      false,
    )
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE, false),
      '',
    )
  })

  it('C — genuine unfinished draft → warning still rendered', () => {
    const draft = genuineDraft()
    assert.equal(hasUnsavedPhotoWorkspaceDraft(draft), true)
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE, true),
      SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE,
    )
  })

  it('D — failed Save Area with draft still present → warning remains valid', () => {
    assert.equal(hasUnsavedPhotoWorkspaceDraft(genuineDraft()), true)
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE, true),
      SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE,
    )
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SAVE_AREA_PERSIST_FAIL_MESSAGE, true),
      SAVE_AREA_PERSIST_FAIL_MESSAGE,
    )
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SAVE_AREA_PERSIST_FAIL_MESSAGE, false),
      SAVE_AREA_PERSIST_FAIL_MESSAGE,
    )
  })

  it('does not erase missing-name / missing-photos / missing-layout copy', () => {
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_NAME_MESSAGE, false),
      SHARE_UNSAVED_AREA_NAME_MESSAGE,
    )
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_PHOTOS_MESSAGE, false),
      SHARE_UNSAVED_AREA_PHOTOS_MESSAGE,
    )
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_LAYOUT_MESSAGE, false),
      SHARE_UNSAVED_AREA_LAYOUT_MESSAGE,
    )
    assert.equal(isUnfinishedAreaFallbackPageError(SHARE_UNSAVED_AREA_NAME_MESSAGE), false)
    assert.equal(isUnfinishedAreaFallbackPageError(SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE), true)
  })
})

describe('stale unfinished-area page error — workbench wiring', () => {
  it('A — stale unfinished-area error is cleared on report reopen', () => {
    const block = reportOpenResetBlock()
    assert.match(block, /persistUiErrorRef\.current = ''/)
    assert.match(block, /setError\(''\)/)
    assert.match(diaryPage, /\[editingReportId, invalidatePreparedSharePdf\]/)
  })

  it('E — report switch cannot leak the previous report error', () => {
    const block = reportOpenResetBlock()
    const persistAt = block.indexOf("persistUiErrorRef.current = ''")
    const errorAt = block.indexOf("setError('')")
    assert.ok(persistAt >= 0 && errorAt >= 0, 'report-open reset must clear both error stores')
    assert.equal(
      visibleDiaryUnfinishedAreaPageError(SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE, false),
      '',
    )
  })

  it('F — entering Edit mode does not keep a stale prior error', () => {
    const enter = enterEditBlock()
    assert.match(enter, /setError\(''\)/)
    assert.match(enter, /persistUiErrorRef\.current = ''/)
    const cancel = diaryPage.slice(
      diaryPage.indexOf('const handleCancelEditMode = () => {'),
      diaryPage.indexOf('const handleUseAsBasisForNewDiary'),
    )
    assert.match(cancel, /setError\(''\)/)
  })

  it('B wiring — page hides the fallback unless PhotoWorkspace still has an unsaved area', () => {
    const guard = staleFallbackGuardBlock()
    assert.match(diaryPage, /visibleDiaryUnfinishedAreaPageError/)
    assert.match(diaryPage, /hasUnsavedAreaForShare/)
    assert.match(guard, /isUnfinishedAreaFallbackPageError\(error\)/)
    assert.match(guard, /hasUnsavedAreaForShare/)
    assert.match(guard, /setError\(''\)/)
    assert.match(diaryPage, /visiblePageError/)
    assert.match(diaryPage, /\{visiblePageError && \(/)
    assert.match(
      diaryPage,
      /areaFlush\.message\s*\|\|\s*SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE/,
    )
  })

  it('G — Phase 3A Work saved truthfulness remains unchanged', () => {
    assert.match(diaryPage, /paintAutosaveStatus\(null\)/)
    assert.doesNotMatch(diaryPage, /paintAutosaveStatus\(autosaveStatusAfterResult/)
    assert.match(diaryPage, /shareCompletionKind === 'downloaded' \? 'PDF downloaded ✓' : 'Shared ✓'/)
    assert.doesNotMatch(diaryPage, /zlog-manual-save-confirmation[\s\S]{0,400}Saved ✓/)
  })

  it('H — one-tap Share / background prepare remains unchanged', () => {
    const handleSave = diaryPage.slice(
      diaryPage.indexOf('const handleSave = async'),
      diaryPage.indexOf('if (loading && !loadDiagnostic)'),
    )
    const reuseStart = handleSave.indexOf('if (shareReadyPdfRef.current?.file && !saving)')
    const prepareIdx = handleSave.indexOf('await prepareSiteDiaryPdf')
    assert.ok(reuseStart > 0 && prepareIdx > reuseStart)
    const reuseBlock = handleSave.slice(
      reuseStart,
      handleSave.indexOf('pdfPrepareGenerationRef.current = bumpPdfPrepareGeneration'),
    )
    assert.match(reuseBlock, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    assert.doesNotMatch(reuseBlock, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(reuseBlock, /shareReadyPdfRef\.current = null/)
    assert.match(diaryPage, /shouldRunBackgroundPdfPrepare/)
    assert.match(diaryPage, /invalidatePreparedSharePdf/)
  })
})
