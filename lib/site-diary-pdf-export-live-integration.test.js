/**
 * Unit 3 — live Site Diary Save & Share worker changeover (source contracts).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const diaryPage = readFileSync(
  join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)
const viewPage = readFileSync(
  join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx'),
  'utf8',
)
const completePage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/complete/page.jsx'),
  'utf8',
)
const client = readFileSync(join(root, 'lib/site-diary-pdf-export-client.js'), 'utf8')

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const handleSave = sliceFn(diaryPage, 'const handleSave = async', 'if (loading && !loadDiagnostic)')
const runBackground = sliceFn(
  diaryPage,
  'const runBackgroundPdfPrepare = useCallback',
  'pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare',
)
const sharePreparedFile = sliceFn(diaryPage, 'const sharePreparedFile = async', '    // Second tap')

describe('Unit 3 — live Save & Share worker integration', () => {
  it('handleSave uses runSiteDiaryPdfExportToShareReadyArtifact after persist', () => {
    const finalizeIdx = handleSave.indexOf('finalizeSiteDiarySave')
    const workerIdx = handleSave.indexOf('await runSiteDiaryPdfExportToShareReadyArtifact')
    assert.ok(finalizeIdx > 0 && workerIdx > finalizeIdx)
    assert.match(handleSave, /runSiteDiaryPdfExportToShareReadyArtifact\(supabase, saved\.id/)
  })

  it('handleSave does not invoke prepareSiteDiaryPdf for live PDF production', () => {
    assert.doesNotMatch(handleSave, /await prepareSiteDiaryPdf/)
    assert.doesNotMatch(handleSave, /prepareSiteDiaryPdf\(/)
  })

  it('no silent fallback to local PDF generation in handleSave', () => {
    assert.doesNotMatch(handleSave, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(handleSave, /catch[\s\S]{0,400}prepareSiteDiaryPdf/)
  })

  it('runBackgroundPdfPrepare uses worker share-ready artifact only when native file share is available', () => {
    assert.doesNotMatch(runBackground, /prepareSiteDiaryPdf/)
    assert.match(runBackground, /runSiteDiaryPdfExportToShareReadyArtifact/)
    assert.match(runBackground, /canShareSiteDiaryPdfViaNativeFile/)
    assert.match(runBackground, /shouldAdoptBackgroundPreparedPdf/)
    assert.match(runBackground, /background-pdf-ready/)
    assert.doesNotMatch(runBackground, /shareSiteDiaryPdfNative/)
  })

  it('composer invoked once per save attempt with AbortSignal', () => {
    assert.match(handleSave, /const prepareAbort = new AbortController\(\)/)
    assert.match(handleSave, /signal: prepareAbort\.signal/)
    assert.match(handleSave, /canShareSiteDiaryPdfViaNativeFile\(\)/)
    const workerCalls = handleSave.match(/runSiteDiaryPdfExportToShareReadyArtifact/g) || []
    const exportReadyCalls = handleSave.match(/runSiteDiaryPdfExportToExportReady/g) || []
    assert.equal(workerCalls.length, 1)
    assert.equal(exportReadyCalls.length, 1)
  })

  it('repeated tap protection remains via save locks during preparation', () => {
    assert.match(handleSave, /saveLockRef\.current/)
    assert.match(handleSave, /finalSaveInProgressRef\.current/)
    assert.match(handleSave, /shouldIgnoreDuplicateSaveTap/)
    assert.match(handleSave, /tryAcquireSaveOperationLock/)
    assert.match(handleSave, /duplicate-save-tap-ignored/)
    assert.doesNotMatch(handleSave, /Save is already in progress/)
  })

  it('successful worker result populates shareReadyPdfRef and shareReady', () => {
    const afterWorker = handleSave.slice(handleSave.indexOf('useNativeFileShareOnPrepare'))
    assert.match(afterWorker, /shareReadyPdfRef\.current = \{/)
    assert.match(afterWorker, /setShareReady\(true\)/)
    assert.match(afterWorker, /SITE_DIARY_PDF_EXPORT_HANDOFF\.fileReady/)
    assert.match(afterWorker, /SITE_DIARY_PDF_EXPORT_HANDOFF\.exportReady/)
    assert.match(afterWorker, /title: prepared\.title/)
  })

  it('existing second-tap sharePreparedFile remains intact', () => {
    assert.match(handleSave, /Second tap — native share/)
    assert.match(sharePreparedFile, /shareSiteDiaryPdfNative/)
    assert.match(sharePreparedFile, /canSharePdfFile\(pdfFile\)/)
    assert.match(sharePreparedFile, /downloadSiteDiaryPdfViaSignedUrl/)
    assert.match(sharePreparedFile, /Do NOT silent-download/)
  })

  it('worker failure routes to failSave with mapped user message', () => {
    assert.match(handleSave, /userMessageForSiteDiaryPdfExportFailure\(prepared\)/)
    assert.match(handleSave, /failSave\(userMessageForSiteDiaryPdfExportFailure/)
    assert.doesNotMatch(handleSave, /failSave\(prepared\.message/)
  })

  it('stale generation / report change dismisses without misleading failSave', () => {
    assert.match(handleSave, /dismissStaleWorkerPrepare/)
    assert.match(handleSave, /startedPrepareGeneration/)
    assert.match(handleSave, /startedPrepareReportId/)
    assert.match(handleSave, /isSiteDiaryPdfExportUserAbortResult/)
  })

  it('abort and generation invalidation wired to pdfPrepareAbortRef', () => {
    assert.match(diaryPage, /pdfPrepareAbortRef/)
    assert.match(diaryPage, /pdfPrepareAbortRef\.current\?\.abort\(\)/)
    assert.match(diaryPage, /invalidatePreparedSharePdf[\s\S]{0,200}pdfPrepareAbortRef/)
  })

  it('no service-role client exposure on live diary page', () => {
    assert.doesNotMatch(diaryPage, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(diaryPage, /supabase-admin/)
  })

  it('saved-view and complete flows still use legacy prepareSiteDiaryPdf', () => {
    assert.match(viewPage, /prepareSiteDiaryPdf/)
    assert.match(completePage, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(viewPage, /runSiteDiaryPdfExportToShareReadyArtifact/)
  })

  it('temporary DEV PDF Worker Auth control removed', () => {
    assert.doesNotMatch(diaryPage, /DEV: Check PDF Worker Auth/)
    assert.doesNotMatch(diaryPage, /handleDevPdfWorkerAuthCheck/)
  })

  it('client composer remains free of prepareSiteDiaryPdf', () => {
    assert.doesNotMatch(client, /prepareSiteDiaryPdf/)
    assert.match(client, /runSiteDiaryPdfExportToShareReadyArtifact/)
  })
})
