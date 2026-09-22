/**
 * Worker-backed workbench background PDF prepare helpers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildWorkbenchShareReadyFromWorkerArtifact,
  hasAdoptableWorkbenchShareFile,
  isDiaryPersistedCleanForBackgroundPdf,
  shouldAdoptBackgroundPreparedPdf,
  shouldRunBackgroundPdfPrepare,
  workerArtifactHasShareReadyBytes,
} from './diary-pdf-background-prepare.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

function payloadsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

describe('worker background PDF prepare helpers', () => {
  it('A — clean stable diary gate requires persisted autosave match', () => {
    assert.equal(
      isDiaryPersistedCleanForBackgroundPdf({
        latestPayload: { a: 1 },
        ackedSnapshot: { a: 1 },
        payloadsEqual,
        photoWorkspaceDraftDirty: false,
      }),
      true,
    )
    assert.equal(
      isDiaryPersistedCleanForBackgroundPdf({
        latestPayload: { a: 1 },
        ackedSnapshot: { a: 2 },
        payloadsEqual,
        photoWorkspaceDraftDirty: false,
      }),
      false,
    )
    assert.equal(
      isDiaryPersistedCleanForBackgroundPdf({
        latestPayload: { a: 1 },
        ackedSnapshot: { a: 1 },
        payloadsEqual,
        photoWorkspaceDraftDirty: true,
      }),
      false,
    )
  })

  it('B — background run requires native file-share capability and clean diary', () => {
    assert.equal(
      shouldRunBackgroundPdfPrepare({
        hydrateComplete: true,
        writable: true,
        reportId: 'r1',
        sessionExpired: false,
        shareInProgress: false,
        hasUnsavedArea: false,
        alreadyHasCurrentFile: false,
        diaryPersistedClean: true,
        nativeFileShareCapable: true,
        autosaveInFlight: false,
      }),
      true,
    )
    assert.equal(
      shouldRunBackgroundPdfPrepare({
        hydrateComplete: true,
        writable: true,
        reportId: 'r1',
        sessionExpired: false,
        shareInProgress: false,
        hasUnsavedArea: false,
        alreadyHasCurrentFile: false,
        diaryPersistedClean: true,
        nativeFileShareCapable: false,
        autosaveInFlight: false,
      }),
      false,
    )
  })

  it('C — worker artifact builds file-ready share ref shape', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })
    const entry = buildWorkbenchShareReadyFromWorkerArtifact(
      {
        ok: true,
        blob,
        fileName: 'Zlog-Site-Diary-2026-09-06.pdf',
        title: 'Site Diary',
        text: 'Site Diary',
        exportId: 'exp-1',
        reportId: 'rep-1',
      },
      { fileReadyHandoff: 'file-ready' },
    )
    assert.ok(entry)
    assert.equal(entry.handoff, 'file-ready')
    assert.equal(entry.file instanceof File, true)
    assert.equal(entry.file.size, 3)
    assert.equal(entry.exportId, 'exp-1')
  })

  it('D — adoptable workbench share file rejects export-ready handoff', () => {
    assert.equal(hasAdoptableWorkbenchShareFile({ handoff: 'export-ready', exportId: 'x' }), false)
    assert.equal(
      hasAdoptableWorkbenchShareFile({ handoff: 'file-ready', file: new File(['x'], 'a.pdf') }),
      true,
    )
  })

  it('E — stale generation cannot adopt worker artifact', () => {
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: true, file: new File(['pdf'], 'a.pdf', { type: 'application/pdf' }) },
        startedGeneration: 1,
        currentGeneration: 2,
        startedReportId: 'r1',
        currentReportId: 'r1',
        shareInProgress: false,
      }),
      false,
    )
  })

  it('F — live diary wires worker background prepare and adoption', () => {
    const runBackground = diaryPage.slice(
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
      diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    )
    assert.match(runBackground, /runSiteDiaryPdfExportToShareReadyArtifact/)
    assert.match(runBackground, /shouldAdoptBackgroundPreparedPdf/)
    assert.match(runBackground, /buildWorkbenchShareReadyFromWorkerArtifact/)
    assert.match(runBackground, /background-pdf-prepare-start/)
    assert.match(runBackground, /background-pdf-ready/)
    assert.match(runBackground, /setShareReady\(true\)/)
    assert.doesNotMatch(runBackground, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(runBackground, /navigator\.share/)
  })

  it('G — share CTA with prepared file does not re-download artifact', () => {
    const shareBlock = diaryPage.slice(
      diaryPage.indexOf('const sharePreparedFile = async'),
      diaryPage.indexOf('// Second tap — native share'),
    )
    assert.match(shareBlock, /share-cta-prepared-file/)
    assert.match(shareBlock, /canSharePdfFile\(pdfFile\)/)
    assert.match(shareBlock, /shareSiteDiaryPdfNative/)
    const nativeBranchEnd = shareBlock.indexOf('prepared.handoff === SITE_DIARY_PDF_EXPORT_HANDOFF.exportReady')
    const nativeOnly = nativeBranchEnd > 0 ? shareBlock.slice(0, nativeBranchEnd) : shareBlock
    assert.doesNotMatch(nativeOnly, /fetchSiteDiaryPdfExportAuthorization/)
    assert.doesNotMatch(nativeOnly, /response\.blob\(\)/)
  })

  it('H — workerArtifactHasShareReadyBytes accepts File or Blob', () => {
    assert.equal(workerArtifactHasShareReadyBytes({ ok: true, file: new File(['a'], 'a.pdf') }), true)
    assert.equal(
      workerArtifactHasShareReadyBytes({ ok: true, blob: new Blob(['a'], { type: 'application/pdf' }) }),
      true,
    )
    assert.equal(workerArtifactHasShareReadyBytes({ ok: true }), false)
  })
})
