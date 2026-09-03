/**
 * TEMPORARY — Save & Share timing collector + live CTA diagnostic wiring.
 * Proves instrumentation does not change two-tap control flow.
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

  it('keeps ShareTimingDiagPanel on a cached getSnapshot for useSyncExternalStore', () => {
    assert.match(diaryPage, /useSyncExternalStore\(/)
    assert.match(diaryPage, /subscribeShareTiming,/)
    assert.match(
      diaryPage,
      /getShareTimingSnapshot,\s*\r?\n\s*getShareTimingSnapshot,/,
    )
    const diagSrc = readFileSync(join(root, 'lib/diary-share-timing-diag.js'), 'utf8')
    assert.match(diagSrc, /export function getShareTimingSnapshot\(\) \{\s*return currentSnapshot\s*\}/)
    assert.match(diagSrc, /function commitSnapshotAndNotify\(\)/)
    assert.doesNotMatch(
      diagSrc,
      /export function getShareTimingSnapshot\(\) \{[\s\S]*?return \{\s*runId:/,
    )
  })
})

describe('live Save & Share diagnostic wiring — no control-flow change', () => {
  it('keeps two-tap prepare-then-share and never shares on the first tap', () => {
    const saveBlock = handleSaveBlock()
    assert.match(saveBlock, /startShareTimingRun/)
    assert.match(saveBlock, /fromPdfCache: false/)
    assert.match(saveBlock, /markShareTiming\('tap'\)/)
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
  })

  it('shows the temporary panel in development only, beneath Save & Share', () => {
    assert.match(diaryPage, /SAVE & SHARE DIAGNOSTIC — TEMPORARY/)
    assert.match(
      diaryPage,
      /\{process\.env\.NODE_ENV !== 'production' \? <ShareTimingDiagPanel \/> : null\}/,
    )
    const ctaIdx = diaryPage.indexOf('<PrimaryCTA')
    const panelIdx = diaryPage.indexOf('<ShareTimingDiagPanel')
    assert.ok(ctaIdx > 0 && panelIdx > ctaIdx)
  })

  it('does not add diagnostic supabase/storage/auth calls', () => {
    const saveBlock = handleSaveBlock()
    assert.doesNotMatch(saveBlock, /markShareTiming\([^)]*supabase/)
    assert.doesNotMatch(shareLib, /markShareTiming\([^)]*supabase/)
    assert.doesNotMatch(photosLib, /bumpShareTimingCount\([^)]*supabase/)
    assert.doesNotMatch(saveBlock, /startShareTimingRun\([\s\S]{0,200}supabase\.auth/)
  })

  it('starts a timing run only in development on the first tap', () => {
    const saveBlock = handleSaveBlock()
    assert.match(
      saveBlock,
      /if \(process\.env\.NODE_ENV !== 'production'\) \{\s*startShareTimingRun/,
    )
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
    assert.ok(lines.some((line) => /Fetching: 200 ms accumulated \(network; conc=6 overlap\)/.test(line)))
    assert.ok(lines.some((line) => /Decode\/bake: 300 ms accumulated \(not wall; conc=6 overlap\)/.test(line)))
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
      line.includes('19 photos / 0 local / 19 network / 19 sign paths / 1 batch / 0 individual / 19 bakes / 0 pass-through / 0 cache hits'),
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

  it('splits PDF sign/fetch/bake and reports conc=6', () => {
    assert.match(photosLib, /PDF_PHOTO_PREPARE_CONCURRENCY = 6/)
    assert.match(photosLib, /pdfSignAccumMs/)
    assert.match(photosLib, /pdfFetchAccumMs/)
    assert.match(photosLib, /pdfBakeAccumMs/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoCacheHitCount'\)/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoFetchBakeCount'\)/)
    assert.match(photosLib, /bumpShareTimingCountSilent\('photoIndividualSignRequestCount'\)/)
    assert.match(photosLib, /localPreparedPhotoSources/)
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
})
