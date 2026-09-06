/**
 * Save & Share timing collector — snapshot identity and PDF/photo pipeline marks.
 * Does not change two-tap Save & Share control flow.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  startShareTimingRun,
  markShareTiming,
  patchShareTimingCounts,
  bumpShareTimingCount,
  bumpShareTimingCountSilent,
  accumulateShareTimingMs,
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  subscribeShareTiming,
  exclusiveMs,
  formatShareTimingLines,
  beginPdfPhotoFetch,
  endPdfPhotoFetch,
  recordPdfPhotoFetchSample,
  publishPdfPhotoFetchSummary,
} from './diary-share-timing-diag.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const shareLib = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const photosLib = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')

function handleSaveBlock() {
  const saveIdx = diaryPage.indexOf('const handleSave')
  assert.ok(saveIdx > 0)
  return diaryPage.slice(saveIdx, saveIdx + 32000)
}

describe('share timing collector', () => {
  beforeEach(() => {
    startShareTimingRun({ reportId: 'r1', fromPdfCache: false })
    markShareTiming('tap')
  })

  it('shares one runId and elapsed marks from first tap t0', () => {
    const first = getShareTimingSnapshot()
    markShareTiming('autosave_flush_done')
    const second = getShareTimingSnapshot()
    assert.equal(second.runId, first.runId)
    assert.ok(second.marks.tap >= 0 && second.marks.tap <= 1)
    assert.ok(second.marks.autosave_flush_done >= 0)
    assert.equal(second.counts.fromPdfCache, false)
    assert.equal(second.counts.reportId, 'r1')
  })

  it('no-ops marks when no run is active after a fresh collector reset via new run overwrite', () => {
    bumpShareTimingCount('photoSignCount', 2)
    patchShareTimingCounts({ photoCount: 10 })
    const snap = getShareTimingSnapshot()
    assert.equal(snap.counts.photoSignCount, 2)
    assert.equal(snap.counts.photoCount, 10)
    assert.equal(exclusiveMs(snap.marks, 'tap', 'autosave_flush_done'), null)
  })

  it('formats exclusive segments from adjacent marks', () => {
    const snap = getShareTimingSnapshot()
    const lines = formatShareTimingLines({
      runId: snap.runId,
      t0: snap.t0,
      marks: {
        tap: 0,
        autosave_flush_done: 40,
        file_ready: 1200,
      },
      counts: { ...snap.counts },
    })
    assert.ok(lines.some((line) => line.includes('Total Tap 1: 1200 ms')))
    assert.ok(lines.some((line) => line.includes('Autosave: 40 ms exclusive')))
    assert.ok(lines.some((line) => line.includes('fromPdfCache false')))
    assert.ok(lines.some((line) => line.includes('finalizeReportSkipped no')))
    assert.ok(lines.some((line) => line.includes('finalizeLabourSkipped no')))
    assert.ok(lines.some((line) => line.includes('finalizePlantSkipped no')))
    assert.ok(lines.some((line) => line.includes('finalizePhotosSkipped no')))
  })
})

describe('share timing snapshot cache — useSyncExternalStore contract', () => {
  it('returns the same snapshot reference when nothing has mutated', () => {
    startShareTimingRun({ reportId: 'cache-1', fromPdfCache: false })
    markShareTiming('tap')
    const snapshotA = getShareTimingSnapshot()
    const snapshotB = getShareTimingSnapshot()
    assert.equal(snapshotA, snapshotB)
  })

  it('returns a new snapshot reference after a real mark or count mutation', () => {
    startShareTimingRun({ reportId: 'cache-2', fromPdfCache: false })
    markShareTiming('tap')
    const before = getShareTimingSnapshot()
    markShareTiming('autosave_flush_done')
    const afterMark = getShareTimingSnapshot()
    assert.notEqual(afterMark, before)
    bumpShareTimingCount('photoSignCount')
    const afterBump = getShareTimingSnapshot()
    assert.notEqual(afterBump, afterMark)
    patchShareTimingCounts({ photoCount: 4 })
    const afterPatch = getShareTimingSnapshot()
    assert.notEqual(afterPatch, afterBump)
  })

  it('returns the same new reference on subsequent reads after a mutation', () => {
    startShareTimingRun({ reportId: 'cache-3', fromPdfCache: false })
    markShareTiming('tap')
    markShareTiming('file_ready')
    const snapshotA = getShareTimingSnapshot()
    const snapshotB = getShareTimingSnapshot()
    const snapshotC = getShareTimingSnapshot()
    assert.equal(snapshotA, snapshotB)
    assert.equal(snapshotB, snapshotC)
    assert.equal(snapshotA.marks.file_ready, snapshotC.marks.file_ready)
  })

  it('notifies subscribers for real changes only', () => {
    startShareTimingRun({ reportId: 'cache-4', fromPdfCache: false })
    let notifications = 0
    const unsubscribe = subscribeShareTiming(() => {
      notifications += 1
    })
    assert.equal(notifications, 0)
    markShareTiming('tap')
    assert.equal(notifications, 1)
    patchShareTimingCounts({ photoCount: 2 })
    assert.equal(notifications, 2)
    bumpShareTimingCount('photoSignCount')
    assert.equal(notifications, 3)
    unsubscribe()
    markShareTiming('auth_done')
    assert.equal(notifications, 3)
  })

  it('does not notify or mutate state on diagnostic reads', () => {
    startShareTimingRun({ reportId: 'cache-5', fromPdfCache: false })
    markShareTiming('tap')
    const before = getShareTimingSnapshot()
    let notifications = 0
    const unsubscribe = subscribeShareTiming(() => {
      notifications += 1
    })
    const readA = getShareTimingSnapshot()
    const readB = getShareTimingSnapshot()
    formatShareTimingLines(readA)
    formatShareTimingLines(readB)
    assert.equal(readA, before)
    assert.equal(readB, before)
    assert.equal(notifications, 0)
    assert.equal(getShareTimingSnapshot(), before)
    unsubscribe()
  })

  it('exports a cached getShareTimingSnapshot identity for subscribers', () => {
    const diagSrc = readFileSync(join(root, 'lib/diary-share-timing-diag.js'), 'utf8')
    assert.match(diagSrc, /export function getShareTimingSnapshot\(\) \{\s*return currentSnapshot\s*\}/)
    assert.match(diagSrc, /function commitSnapshotAndNotify\(\)/)
    assert.doesNotMatch(
      diagSrc,
      /export function getShareTimingSnapshot\(\) \{[\s\S]*?return \{\s*runId:/,
    )
    assert.doesNotMatch(diaryPage, /useSyncExternalStore\(/)
    assert.doesNotMatch(diaryPage, /ShareTimingDiagPanel/)
  })
})

describe('Save & Share two-tap control flow — production, no diagnostic UI', () => {
  it('keeps two-tap prepare-then-share and never shares on the first tap', () => {
    const saveBlock = handleSaveBlock()
    assert.doesNotMatch(saveBlock, /startShareTimingRun/)
    assert.match(saveBlock, /prepareSiteDiaryPdf/)
    assert.match(saveBlock, /setShareReady\(true\)/)
    assert.match(saveBlock, /Second tap — native share from the already-prepared file only/)
    const firstShareIdx = saveBlock.indexOf('shareSiteDiaryPdfNative')
    const prepareIdx = saveBlock.indexOf('prepareSiteDiaryPdf')
    const secondTapIdx = saveBlock.indexOf('Second tap — native share from the already-prepared file only')
    assert.ok(prepareIdx > secondTapIdx, 'PDF prepare remains on the first-tap path after the second-tap early return')
    assert.ok(firstShareIdx > 0)
    assert.ok(firstShareIdx < secondTapIdx, 'native share remains in sharePreparedFile (second tap) only')
    assert.doesNotMatch(saveBlock, /await shareSiteDiaryPdfNative\([\s\S]*prepareSiteDiaryPdf[\s\S]*shareSiteDiaryPdfNative/)
    const firstTapHandoff = saveBlock.slice(saveBlock.indexOf('const prepared = await prepareSiteDiaryPdf'))
    assert.match(firstTapHandoff, /setShareReady\(true\)/)
    assert.doesNotMatch(firstTapHandoff, /await shareSiteDiaryPdfNative/)
    assert.doesNotMatch(firstTapHandoff, /await downloadSiteDiaryPdf/)
  })

  it('does not render the temporary Save & Share diagnostic panel', () => {
    assert.doesNotMatch(diaryPage, /SAVE & SHARE DIAGNOSTIC — TEMPORARY/)
    assert.doesNotMatch(diaryPage, /ShareTimingDiagPanel/)
    assert.doesNotMatch(diaryPage, /SHARE HANDOFF/)
    assert.doesNotMatch(diaryPage, /formatShareHandoffLines/)
    assert.doesNotMatch(diaryPage, /formatPhase2bReadyLines/)
  })

  it('does not add diagnostic supabase/storage/auth calls', () => {
    const saveBlock = handleSaveBlock()
    assert.doesNotMatch(saveBlock, /markShareTiming\([^)]*supabase/)
    assert.doesNotMatch(shareLib, /markShareTiming\([^)]*supabase/)
    assert.doesNotMatch(photosLib, /bumpShareTimingCount\([^)]*supabase/)
  })

  it('invalidates a ready PDF on unfinished-area dirty and keeps native-share capability unchanged', () => {
    const walkSrc = readFileSync(join(root, 'components/ai-annotation/AiLocationWalk.jsx'), 'utf8')
    assert.match(
      walkSrc,
      /useEffect\(\(\) => \{\s*onDraftDirtyChange\?\.\(photoWorkspaceDraftDirty\)\s*\}, \[onDraftDirtyChange, photoWorkspaceDraftDirty\]\)/,
    )
    assert.doesNotMatch(walkSrc, /patchPhase2bReadyDiag/)
    assert.match(diaryPage, /invalidatePreparedSharePdf\('draft-dirty'\)/)
    assert.match(diaryPage, /invalidatePreparedSharePdf\('committed-diary-change'\)/)
    assert.match(diaryPage, /invalidatePreparedSharePdf\('report-edit-reset'\)/)
    assert.match(diaryPage, /if \(canNativeShare\(\)\) \{/)
    const saveIdx = diaryPage.indexOf('const sharePreparedFile')
    const sharePrepared = diaryPage.slice(saveIdx, saveIdx + 4000)
    assert.doesNotMatch(sharePrepared, /if \(canNativeShare\(\) &&/)
    const caps = readFileSync(join(root, 'lib/diary-share-capabilities.js'), 'utf8')
    const start = caps.indexOf('export function canNativeShare')
    const end = caps.indexOf('export function canUseSaveFilePicker')
    const impl = caps.slice(start, end)
    assert.match(impl, /return Boolean\(nav && typeof nav\.share === 'function'\)/)
    assert.doesNotMatch(impl, /isSecureContext|location\.protocol|canShare/)
    const nativeStart = shareLib.indexOf('export async function shareSiteDiaryPdfNative')
    const nativeEnd = shareLib.indexOf('function downloadPdfViaBrowser')
    const native = shareLib.slice(nativeStart, nativeEnd)
    assert.match(native, /navigator\.canShare\(\{ files: \[file\] \}\)/)
    assert.match(native, /await navigator\.share\(\{/)
    assert.match(native, /markShareTiming\('navigator_share_called'\)/)
    assert.match(native, /markShareTiming\('navigator_share_resolved'\)/)
    assert.doesNotMatch(native, /markShareTiming\('can_share_start'\)/)
    assert.doesNotMatch(native, /markShareTiming\('navigator_share_settled'\)/)
    const failAfterShare = sharePrepared.slice(
      sharePrepared.indexOf('shareResult.ok'),
      sharePrepared.indexOf('downloadSiteDiaryPdf'),
    )
    assert.match(failAfterShare, /failSave\(/)
    assert.doesNotMatch(failAfterShare, /await downloadSiteDiaryPdf/)
  })
})

describe('finalize + PDF photo breakdown marks', () => {
  it('does not notify on silent accumulate or silent bump', () => {
    startShareTimingRun({ reportId: 'accum-1', fromPdfCache: false })
    let notifications = 0
    const unsubscribe = subscribeShareTiming(() => {
      notifications += 1
    })
    accumulateShareTimingMs('pdfSignAccumMs', 12)
    bumpShareTimingCountSilent('photoSignCount')
    bumpShareTimingCountSilent('photoSignCount')
    assert.equal(notifications, 0)
    const beforeFlush = getShareTimingSnapshot()
    flushShareTimingSnapshot()
    assert.equal(notifications, 1)
    const after = getShareTimingSnapshot()
    assert.notEqual(after, beforeFlush)
    assert.equal(after.counts.pdfSignAccumMs, 12)
    assert.equal(after.counts.photoSignCount, 2)
    unsubscribe()
  })

  it('panel format includes finalize and PDF photo split lines', () => {
    startShareTimingRun({ reportId: 'fmt-1', fromPdfCache: false })
    markShareTiming('finalize_report_start')
    markShareTiming('finalize_report_done')
    markShareTiming('pdf_photos_prep_start')
    markShareTiming('pdf_photo_sign_fetch_bake_done')
    patchShareTimingCounts({
      photoUpdateCallCount: 19,
      photoInsertCount: 0,
      pdfSignAccumMs: 100,
      pdfFetchAccumMs: 200,
      pdfBakeAccumMs: 300,
      pdfLocalBakeAccumMs: 40,
      pdfPhotoCount: 19,
      pdfLocalBlobSourceCount: 0,
      pdfNetworkSourceCount: 19,
      photoSignPathCount: 19,
      photoSignBatchRequestCount: 1,
      photoIndividualSignRequestCount: 0,
      photoPrepareCount: 19,
      photoNetworkFetchCount: 19,
      photoFetchBakeCount: 19,
      photoBakeCount: 19,
      photoCacheHitCount: 0,
    })
    const lines = formatShareTimingLines(getShareTimingSnapshot())
    assert.ok(lines.includes('Finalize:'))
    assert.ok(lines.some((line) => line.startsWith('Report row:')))
    assert.ok(lines.some((line) => line.includes('Labour+plant barrier:')))
    assert.ok(lines.some((line) => line.includes('UPDATE 19 rows:')))
    assert.ok(lines.some((line) => line.includes('INSERT 0 rows:')))
    assert.ok(lines.includes('PDF photos:'))
    assert.ok(lines.some((line) => line.startsWith('Total wall:')))
    assert.ok(lines.some((line) => /Signing: 100 ms \(batch source resolution\)/.test(line)))
    assert.ok(lines.some((line) => /Local-source decode\/bake: 40 ms accumulated/.test(line)))
    assert.ok(lines.some((line) => /Fetching: 200 ms accumulated \(network; conc=9 overlap\)/.test(line)))
    assert.ok(lines.some((line) => line.startsWith('photoFetchMinMs')))
    assert.ok(lines.some((line) => line.startsWith('photoFetchMedianMs')))
    assert.ok(lines.some((line) => line.startsWith('photoFetchMaxMs')))
    assert.ok(lines.some((line) => line.startsWith('photoFetchBytesTotal')))
    assert.ok(lines.some((line) => line.startsWith('photoFetchConcurrencyPeak')))
    assert.ok(lines.some((line) => line.startsWith('photoFetchDurationsMs')))
    assert.ok(lines.some((line) => line.startsWith('photoSessionBlobCacheHitCount')))
    assert.ok(lines.some((line) => line.startsWith('photoSessionBlobCacheMissCount')))
    assert.ok(lines.some((line) => line.startsWith('photoSessionBlobCacheStoreCount')))
    assert.ok(lines.some((line) => line.startsWith('photoSessionBlobCacheEvictCount')))
    assert.ok(lines.some((line) => line.startsWith('photoSessionBlobCacheBytes')))
    assert.ok(lines.some((line) => /Decode\/bake: 300 ms accumulated \(not wall; conc=9 overlap\)/.test(line)))
    assert.ok(lines.some((line) => line === 'pdfPhotoCount 19'))
    assert.ok(lines.some((line) => line === 'pdfLocalBlobSourceCount 0'))
    assert.ok(lines.some((line) => line === 'pdfNetworkSourceCount 19'))
    assert.ok(lines.some((line) => line === 'photoSignPathCount 19'))
    assert.ok(lines.some((line) => line === 'photoSignBatchRequestCount 1'))
    assert.ok(lines.some((line) => line === 'photoIndividualSignRequestCount 0'))
    assert.ok(lines.some((line) => line === 'photoPrepareCount 19'))
    assert.ok(lines.some((line) => line === 'photoNetworkFetchCount 19'))
    assert.ok(lines.some((line) => line === 'photoFetchBakeCount 19'))
    assert.ok(lines.some((line) =>
      line.includes('19 photos / 0 local / 19 network / 19 sign paths / 1 batch / 0 individual / 19 bakes / 0 pass-through / 0 legacy/baked-cache hits / 0 session-blob-cache hits'),
    ))
  })

  it('labels branding and PDF asset/cover walls as overlapped, not exclusive adjacent time', () => {
    startShareTimingRun({ reportId: 'fmt-overlap-1', fromPdfCache: false })
    markShareTiming('pdf_report_query_done')
    markShareTiming('pdf_branding_start')
    markShareTiming('pdf_asset_prep_start')
    markShareTiming('pdf_branding_query_done')
    markShareTiming('pdf_asset_sign_done')
    markShareTiming('pdf_cover_source_start')
    markShareTiming('pdf_cover_source_done')
    patchShareTimingCounts({
      coverPreparedSource: 'local',
      coverNetworkFetchCount: 0,
      coverOrientationBakeCount: 0,
      coverPassThroughCount: 1,
    })
    markShareTiming('pdf_photo_sign_fetch_bake_done')
    markShareTiming('pdf_project_reference_done')
    markShareTiming('pdf_toBlob_start')
    markShareTiming('pdf_toBlob_done')
    markShareTiming('file_ready')
    const lines = formatShareTimingLines(getShareTimingSnapshot())
    assert.ok(lines.some((line) => line.startsWith('Total Tap 1:')))
    assert.ok(lines.some((line) => /Branding wall: .* \(overlapped\)/.test(line)))
    assert.ok(lines.some((line) => /PDF asset \+ cover wall: .* \(overlapped\)/.test(line)))
    assert.ok(lines.some((line) => line.includes('branding start @')))
    assert.ok(lines.some((line) => line.includes('asset prep start @')))
    assert.ok(lines.some((line) => line.includes('asset sign @')))
    assert.ok(lines.some((line) => line.includes('cover bake @')))
    assert.ok(lines.some((line) => line.includes('cover PDF source @')))
    assert.ok(lines.some((line) => line === 'coverPreparedSource local'))
    assert.ok(lines.some((line) => line === 'coverNetworkFetchCount 0'))
    assert.ok(lines.some((line) => line === 'coverOrientationBakeCount 0'))
    assert.ok(lines.some((line) => line === 'coverPassThroughCount 1'))
    assert.ok(lines.some((line) => line.startsWith('coverSignSkipped')))
    assert.ok(lines.some((line) => line.startsWith('coverSessionBlobCacheHitCount')))
    assert.ok(lines.some((line) => line.startsWith('coverSessionBlobCacheMissCount')))
    assert.ok(lines.some((line) => line.startsWith('coverSessionBlobCacheStoreCount')))
    assert.ok(lines.some((line) => line.startsWith('coverSessionBlobCacheEvictCount')))
    assert.ok(lines.some((line) => line.startsWith('coverSessionBlobCacheBytes')))
    assert.ok(lines.some((line) => line === 'coverMigrationNeeded no'))
    assert.ok(lines.some((line) => line === 'coverMigrationPrepareCount 0'))
    assert.ok(lines.some((line) => line === 'coverMigrationUploadCount 0'))
    assert.ok(lines.some((line) => line === 'coverMigrationPersistCount 0'))
    assert.ok(lines.some((line) => line.startsWith('Cover PDF source:')))
    assert.ok(lines.some((line) => line.includes('project_reference @')))
    assert.ok(lines.some((line) => line.startsWith('PDF toBlob:')))
    assert.ok(lines.some((line) => line.includes('File ready:')))
    assert.ok(!lines.some((line) => line.startsWith('PDF branding query:')))
    assert.ok(!lines.some((line) => line.startsWith('PDF asset signing + cover:')))
    assert.ok(shareLib.includes("markShareTiming('pdf_branding_start')"))
    assert.ok(shareLib.includes("markShareTiming('pdf_asset_prep_start')"))
    assert.ok(shareLib.includes("markShareTiming('pdf_toBlob_start')"))
    assert.ok(shareLib.includes("markShareTiming('pdf_toBlob_done')"))
  })

  it('instruments finalize sub-phases without extra supabase calls', () => {
    const saveLib = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
    assert.match(saveLib, /markShareTiming\('finalize_report_start'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_report_auth_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_report_select_before_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_report_update_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_report_select_verify_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_labour_start'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_plant_start'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_labour_plant_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_photos_list_done'\)/)
    assert.match(saveLib, /markShareTiming\('finalize_photos_update_start'\)/)
    assert.match(saveLib, /photoUpdateCallCount/)
    assert.match(saveLib, /photoInsertCount/)
    assert.doesNotMatch(saveLib, /markShareTiming\([^)]*supabase/)
    assert.match(saveLib, /await Promise\.all\(\[/)
  })

  it('splits PDF sign/fetch/bake and reports conc=9', () => {
    assert.match(photosLib, /PDF_PHOTO_PREPARE_CONCURRENCY = 9/)
    assert.match(photosLib, /pdfSignAccumMs/)
    assert.match(photosLib, /pdfFetchAccumMs/)
    assert.match(photosLib, /pdfBakeAccumMs/)
    assert.match(photosLib, /beginPdfPhotoFetch/)
    assert.match(photosLib, /recordPdfPhotoFetchSample/)
    assert.match(photosLib, /publishPdfPhotoFetchSummary/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoCacheHitCount'\)/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoFetchBakeCount'\)/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoIndividualSignRequestCount'\)/)
    assert.match(photosLib, /lookupPreparedWorkPhotoSessionBlob/)
    assert.match(photosLib, /storePreparedWorkPhotoSessionBlob/)
    assert.match(photosLib, /photoSessionBlobCacheHitCount/)
    assert.match(photosLib, /pdfLocalBlobSourceCount/)
    assert.match(photosLib, /photoNetworkFetchCount/)
    assert.match(photosLib, /markShareTiming\('pdf_photos_prep_start'\)/)
    assert.match(photosLib, /flushShareTimingSnapshot\(\)/)
    assert.match(shareLib, /batchSignedUrlsForStoragePaths/)
    const assetsLib = readFileSync(join(root, 'lib/diary-share-pdf-assets.js'), 'utf8')
    const assetsFn = assetsLib.slice(assetsLib.indexOf('export async function signPdfReportAssets'))
    assert.match(assetsLib, /createSignedUrls/)
    assert.doesNotMatch(assetsFn, /createSignedUrls/)
  })

  it('records per-fetch duration and bytes without extra network calls', () => {
    startShareTimingRun({ reportId: 'fetch-diag-1', fromPdfCache: false })
    beginPdfPhotoFetch()
    beginPdfPhotoFetch()
    recordPdfPhotoFetchSample({ ms: 2100, bytes: 400000 })
    endPdfPhotoFetch()
    recordPdfPhotoFetchSample({ ms: 5000, bytes: 800000 })
    endPdfPhotoFetch()
    publishPdfPhotoFetchSummary()
    const snap = getShareTimingSnapshot()
    assert.equal(snap.counts.photoFetchMinMs, 2100)
    assert.equal(snap.counts.photoFetchMedianMs, 3550)
    assert.equal(snap.counts.photoFetchMaxMs, 5000)
    assert.equal(snap.counts.photoFetchBytesTotal, 1200000)
    assert.equal(snap.counts.photoFetchConcurrencyPeak, 2)
    assert.equal(snap.counts.photoFetchDurationsMs, '2100,5000')
    const lines = formatShareTimingLines(snap)
    assert.ok(lines.some((line) => line === 'photoFetchMinMs 2100'))
    assert.ok(lines.some((line) => line === 'photoFetchMaxMs 5000'))
    assert.ok(lines.some((line) => line === 'photoFetchBytesTotal 1200000'))
    assert.ok(lines.some((line) => line === 'photoFetchConcurrencyPeak 2'))
  })
})
