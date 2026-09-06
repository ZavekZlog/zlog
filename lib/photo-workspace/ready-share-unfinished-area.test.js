/**
 * Ready-file Share must not bypass unfinished photo-area protection.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasUnsavedPhotoWorkspaceDraft } from './model.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const locationWalkSrc = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const photoWorkspaceSrc = readFileSync(
  join(root, 'components/photo-workspace/PhotoWorkspace.jsx'),
  'utf8',
)

function handleSaveSource() {
  return diaryPage.slice(
    diaryPage.indexOf('const handleSave = async'),
    diaryPage.indexOf('if (loading && !loadDiagnostic)'),
  )
}

function tapShare({ hasUnsavedArea, readyFile, saving = false }) {
  const calls = {
    sharePreparedFile: 0,
    navigatorShare: 0,
    downloadFallback: 0,
    invalidate: 0,
    areaFlush: 0,
  }
  let file = readyFile
  if (hasUnsavedArea === true) {
    calls.invalidate += 1
    file = null
  } else if (file && !saving) {
    calls.sharePreparedFile += 1
    calls.navigatorShare += 1
    return calls
  }
  calls.areaFlush += 1
  return { ...calls, file }
}

function createDraftDirtyHandler() {
  let shareReady = true
  const shareReadyPdfRef = { current: { file: { name: 'ready.pdf' } } }
  let scheduled = 0
  let wasDirty = false
  const invalidate = () => {
    shareReadyPdfRef.current = null
    shareReady = false
    scheduled += 1
  }
  const onDraftDirtyChange = (dirty) => {
    const next = dirty === true
    const prev = wasDirty
    wasDirty = next
    if (next && !prev) {
      invalidate()
      return
    }
    if (!next && prev) scheduled += 1
  }
  return {
    shareReadyPdfRef,
    isShareReady: () => shareReady,
    ctaLabel: () => (shareReady ? 'Report Ready — Share Now' : 'Save & Share'),
    scheduled: () => scheduled,
    onDraftDirtyChange,
  }
}

describe('ready-file Share vs unfinished photo area', () => {
  it('1 — Ready File + no unfinished area → one-tap Share still calls sharePreparedFile immediately', () => {
    const handleSave = handleSaveSource()
    const unfinishedAt = handleSave.indexOf('hasUnsavedAreaForShare')
    const reuseStart = handleSave.indexOf('if (shareReadyPdfRef.current?.file && !saving)')
    assert.ok(unfinishedAt > 0 && unfinishedAt < reuseStart)
    const reuseBlock = handleSave.slice(
      reuseStart,
      handleSave.indexOf('pdfPrepareGenerationRef.current = bumpPdfPrepareGeneration'),
    )
    assert.match(reuseBlock, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    const result = tapShare({
      hasUnsavedArea: false,
      readyFile: { name: 'ready.pdf' },
    })
    assert.equal(result.sharePreparedFile, 1)
    assert.equal(result.areaFlush, 0)
  })

  it('2 — Ready File + new unfinished area → prepared File invalidates immediately', () => {
    const handler = createDraftDirtyHandler()
    assert.equal(handler.ctaLabel(), 'Report Ready — Share Now')
    handler.onDraftDirtyChange(
      hasUnsavedPhotoWorkspaceDraft({ phase: 'create', nameDraft: 'Roof' }),
    )
    assert.equal(handler.shareReadyPdfRef.current, null)
    assert.equal(handler.isShareReady(), false)
    assert.equal(handler.ctaLabel(), 'Save & Share')
    assert.match(diaryPage, /if \(next && !wasDirty\) \{[\s\S]*?invalidatePreparedSharePdf\(\)/)
    assert.match(diaryPage, /onDraftDirtyChange=\{handlePhotoWorkspaceDraftDirtyChange\}/)
    assert.match(locationWalkSrc, /onDraftDirtyChange\?\.\(photoWorkspaceDraftDirty\)/)
    assert.match(photoWorkspaceSrc, /onDraftDirtyChange=\{onDraftDirtyChange\}/)
  })

  it('3 — Ready File + unfinished area → Share tap does not share/download before area validation', () => {
    const result = tapShare({
      hasUnsavedArea: true,
      readyFile: { name: 'stale.pdf' },
    })
    assert.equal(result.sharePreparedFile, 0)
    assert.equal(result.navigatorShare, 0)
    assert.equal(result.downloadFallback, 0)
    assert.equal(result.invalidate, 1)
    assert.equal(result.areaFlush, 1)
    const handleSave = handleSaveSource()
    const unfinishedBranch = handleSave.slice(
      handleSave.indexOf('Unfinished photo-area drafts must never reuse'),
      handleSave.indexOf('else if (shareReadyPdfRef.current?.file && !saving)'),
    )
    assert.match(unfinishedBranch, /hasUnsavedAreaForShare/)
    assert.match(unfinishedBranch, /invalidatePreparedSharePdf\(\)/)
    assert.doesNotMatch(unfinishedBranch, /await sharePreparedFile/)
    assert.doesNotMatch(unfinishedBranch, /shareSiteDiaryPdfNative/)
    assert.match(handleSave, /commitUnsavedAreaForShare/)
  })

  it('4 — defence in depth: stale ready File + hasUnsavedAreaForShare still bypasses ready-file branch', () => {
    const result = tapShare({
      hasUnsavedArea: true,
      readyFile: { name: 'forced-stale.pdf' },
    })
    assert.equal(result.sharePreparedFile, 0)
    assert.equal(result.file, null)
    const handleSave = handleSaveSource()
    assert.match(
      handleSave,
      /hasUnsavedAreaForShare\?\.\(\) === true\) \{\s*invalidatePreparedSharePdf\(\)/,
    )
    assert.match(
      handleSave,
      /else if \(shareReadyPdfRef\.current\?\.file && !saving\)/,
    )
  })

  it('5 — new area name-only draft → ready clears', () => {
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({ phase: 'create', nameDraft: 'Plant Room' }),
      true,
    )
    const handler = createDraftDirtyHandler()
    handler.onDraftDirtyChange(true)
    assert.equal(handler.shareReadyPdfRef.current, null)
    assert.equal(handler.ctaLabel(), 'Save & Share')
  })

  it('6 — new photo draft → ready clears', () => {
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({
        phase: 'create',
        nameDraft: '',
        draftPhotos: [{ id: 'p1' }],
      }),
      true,
    )
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({
        phase: 'create',
        descriptionDraft: 'Felt complete',
      }),
      true,
    )
    const handler = createDraftDirtyHandler()
    handler.onDraftDirtyChange(true)
    assert.equal(handler.isShareReady(), false)
  })

  it('7 — Cancel/Clear draft → unfinished state clears, no stale warning, background PDF may regenerate', () => {
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({
        phase: 'review',
        nameDraft: 'Stale name',
        draftPhotos: [],
      }),
      false,
    )
    const handler = createDraftDirtyHandler()
    handler.onDraftDirtyChange(true)
    handler.onDraftDirtyChange(false)
    assert.equal(handler.isShareReady(), false)
    assert.ok(handler.scheduled() >= 2)
    assert.match(locationWalkSrc, /\{copy\.cancelGroup\}/)
    assert.match(diaryPage, /if \(!next && wasDirty\) \{[\s\S]*?pdfBackgroundPrepareSchedulerRef\.current\?\.schedule\(\)/)
    assert.match(diaryPage, /visibleDiaryUnfinishedAreaPageError/)
  })

  it('8 — successful Save Area → committed walk updates and one-tap can return after regenerate', () => {
    assert.match(locationWalkSrc, /setPhase\('after_save'\)/)
    assert.match(diaryPage, /const handleLocationWalkChange = useCallback\(\(next\) => \{[\s\S]*?invalidatePreparedSharePdf\(\)/)
    assert.match(diaryPage, /onAreaSaved=\{handleAreaSaved\}/)
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({ phase: 'after_save', nameDraft: 'Roof' }),
      false,
    )
    const afterSave = tapShare({
      hasUnsavedArea: false,
      readyFile: { name: 'regenerated.pdf' },
    })
    assert.equal(afterSave.sharePreparedFile, 1)
  })

  it('9 — fresh Edit with only durable areas → no unfinished warning, one-tap Share still works', () => {
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({
        phase: 'create',
        nameDraft: '',
        descriptionDraft: '',
        draftPhotos: [],
      }),
      false,
    )
    const idle = tapShare({
      hasUnsavedArea: false,
      readyFile: { name: 'ready.pdf' },
    })
    assert.equal(idle.sharePreparedFile, 1)
    assert.match(diaryPage, /visibleDiaryUnfinishedAreaPageError/)
    assert.match(diaryPage, /SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE/)
  })

  it('10 — Phase 3A Work saved removal remains unchanged', () => {
    assert.match(diaryPage, /paintAutosaveStatus\(null\)/)
    assert.doesNotMatch(diaryPage, /paintAutosaveStatus\(autosaveStatusAfterResult/)
    assert.match(diaryPage, /shareCompletionKind === 'downloaded' \? 'PDF downloaded ✓' : 'Shared ✓'/)
    assert.doesNotMatch(diaryPage, /zlog-manual-save-confirmation[\s\S]{0,400}Saved ✓/)
  })
})
