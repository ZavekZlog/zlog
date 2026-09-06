/**
 * Phase 2B — workbench background PDF prepare for one-tap Share.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bumpPdfPrepareGeneration,
  createDiaryPdfBackgroundPrepareScheduler,
  DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS,
  shouldAdoptBackgroundPreparedPdf,
  shouldRunBackgroundPdfPrepare,
} from './diary-pdf-background-prepare.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const helperSrc = readFileSync(join(root, 'lib/diary-pdf-background-prepare.js'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const viewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')
const shareLib = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const prewarm = readFileSync(join(root, 'lib/diary-pdf-asset-prewarm.js'), 'utf8')
const cacheLib = readFileSync(join(root, 'lib/diary-pdf-cache.js'), 'utf8')
const invalidateLib = readFileSync(join(root, 'lib/diary-share-ready-invalidate.js'), 'utf8')

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const handleSave = sliceFn(diaryPage, 'const handleSave = async', 'if (loading && !loadDiagnostic)')
const invalidateHelper = sliceFn(
  diaryPage,
  'const invalidatePreparedSharePdf = useCallback',
  'const [hydrateComplete, setHydrateComplete]',
)
const runBackground = sliceFn(
  diaryPage,
  'const runBackgroundPdfPrepare = useCallback',
  'pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare',
)
const weatherBlock = sliceFn(diaryPage, '<GlassSection title="Weather"', '</GlassSection>')
const summaryBlock = sliceFn(diaryPage, '<GlassSection title="Site summary"', '</GlassSection>')
const walkChange = sliceFn(
  diaryPage,
  'const handleLocationWalkChange = useCallback',
  'const handleAreaNameValidationResolved',
)

function createManualClock() {
  const timers = []
  return {
    timers,
    setTimer(fn, ms) {
      const id = { fn, ms, cancelled: false }
      timers.push(id)
      return id
    },
    clearTimer(id) {
      if (id) id.cancelled = true
    },
    async fireNext() {
      const next = timers.find((t) => !t.cancelled)
      assert.ok(next, 'expected a pending timer')
      next.cancelled = true
      await next.fn()
    },
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Phase 2B — background PDF prepare helper', () => {
  it('A — background prepare is not awaited by hydrate / first paint', () => {
    assert.match(diaryPage, /void prewarmDiaryPdfSessionAssets\(/)
    assert.doesNotMatch(diaryPage, /await prewarmDiaryPdfSessionAssets/)
    assert.doesNotMatch(diaryPage, /await runBackgroundPdfPrepare/)
    assert.match(diaryPage, /pdfBackgroundPrepareSchedulerRef\.current\?\.schedule\(\)/)
    const loadKick = sliceFn(diaryPage, 'const kickPdfAssetPrewarm = () => {', '// SDSC Phase 1 shadow')
    assert.doesNotMatch(loadKick, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(loadKick, /runBackgroundPdfPrepare/)
  })

  it('B — no prepare while the user is actively editing', async () => {
    const runs = []
    const clock = createManualClock()
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: 3000,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      run: async () => { runs.push('run') },
    })
    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    const pending = clock.timers.filter((t) => !t.cancelled)
    assert.equal(pending.length, 1)
    assert.equal(runs.length, 0)
    assert.equal(scheduler.hasPendingTimer(), true)
  })

  it('C — after idle/stable delay, prepareSiteDiaryPdf is invoked once', async () => {
    const runs = []
    const clock = createManualClock()
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      run: async () => { runs.push('run') },
    })
    scheduler.schedule()
    await clock.fireNext()
    await flushMicrotasks()
    assert.equal(runs.length, 1)
    assert.match(runBackground, /prepareSiteDiaryPdf\(\{/)
    assert.match(runBackground, /skipShareCacheWrite: true/)
    assert.equal(DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS > 1500, true)
  })

  it('D — successful current generation adopts File and shareReady', () => {
    const adopted = shouldAdoptBackgroundPreparedPdf({
      prepared: { ok: true, file: { name: 'Zlog-Site-Diary.pdf' } },
      startedGeneration: 4,
      currentGeneration: 4,
      startedReportId: 'r1',
      currentReportId: 'r1',
      shareInProgress: false,
    })
    assert.equal(adopted, true)
    assert.match(runBackground, /shareReadyPdfRef\.current = \{/)
    assert.match(runBackground, /setShareReady\(true\)/)
  })

  it('E — PDF-visible edit during prepare invalidates generation and stale File is not adopted', () => {
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: true, file: { name: 'stale.pdf' } },
        startedGeneration: 2,
        currentGeneration: 3,
        startedReportId: 'r1',
        currentReportId: 'r1',
        shareInProgress: false,
      }),
      false,
    )
    assert.match(invalidateHelper, /bumpPdfPrepareGeneration/)
    assert.match(invalidateHelper, /shareReadyPdfRef\.current = null/)
    assert.match(runBackground, /shouldAdoptBackgroundPreparedPdf/)
    assert.match(runBackground, /startedGeneration/)
  })

  it('F — report switch invalidates generation and stale File is not adopted', () => {
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: true, file: { name: 'other.pdf' } },
        startedGeneration: 1,
        currentGeneration: 1,
        startedReportId: 'r-old',
        currentReportId: 'r-new',
        shareInProgress: false,
      }),
      false,
    )
    assert.match(diaryPage, /\[editingReportId, invalidatePreparedSharePdf\]/)
  })

  it('G — background prepare failure is non-fatal', async () => {
    const clock = createManualClock()
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: 10,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      run: async () => { throw new Error('pdf failed') },
    })
    scheduler.schedule()
    await clock.fireNext()
    await flushMicrotasks()
    assert.equal(scheduler.isInFlight(), false)
    assert.doesNotMatch(runBackground, /failSave\(/)
    assert.doesNotMatch(runBackground, /setError\(/)
    assert.doesNotMatch(runBackground, /router\.(push|replace)/)
  })

  it('H — navigator.share is never called from background prepare or effects', () => {
    assert.doesNotMatch(helperSrc, /navigator\.share/)
    assert.doesNotMatch(helperSrc, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(runBackground, /navigator\.share/)
    assert.doesNotMatch(runBackground, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(runBackground, /sharePreparedFile/)
    assert.doesNotMatch(diaryPage, /useEffect\([\s\S]{0,800}navigator\.share/)
    assert.doesNotMatch(viewPage, /useEffect\([\s\S]{0,400}navigator\.share/)
  })

  it('I — when a valid prepared File already exists, Share tap reuses it immediately', () => {
    const reuseStart = handleSave.indexOf('if (shareReadyPdfRef.current?.file && !saving)')
    const unfinishedAt = handleSave.indexOf('hasUnsavedAreaForShare')
    const prepareIdx = handleSave.indexOf('await prepareSiteDiaryPdf')
    const nullIdx = handleSave.indexOf('shareReadyPdfRef.current = null')
    assert.ok(reuseStart > 0)
    assert.ok(unfinishedAt > 0 && unfinishedAt < reuseStart)
    assert.ok(nullIdx > reuseStart)
    assert.ok(prepareIdx > nullIdx)
    const reuseBlock = handleSave.slice(
      reuseStart,
      handleSave.indexOf('pdfPrepareGenerationRef.current = bumpPdfPrepareGeneration'),
    )
    assert.match(reuseBlock, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    assert.doesNotMatch(reuseBlock, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(reuseBlock, /shareReadyPdfRef\.current = null/)
    assert.doesNotMatch(reuseBlock, /bumpPdfPrepareGeneration/)
  })

  it('I-behaviour — Share tap with a current File does not prepare or clear it first', async () => {
    const shareReadyPdfRef = { current: { file: { name: 'ready.pdf' } } }
    const prepareCalls = []
    const shareCalls = []
    async function sharePreparedFile(prepared) {
      shareCalls.push(prepared.file.name)
    }
    async function handleSaveTap() {
      const hasUnsavedArea = false
      if (hasUnsavedArea) {
        shareReadyPdfRef.current = null
        prepareCalls.push('slow-path')
        return
      }
      if (shareReadyPdfRef.current?.file) {
        await sharePreparedFile(shareReadyPdfRef.current)
        return
      }
      shareReadyPdfRef.current = null
      prepareCalls.push('prepare')
    }
    await handleSaveTap()
    assert.deepEqual(shareCalls, ['ready.pdf'])
    assert.deepEqual(prepareCalls, [])
    assert.equal(shareReadyPdfRef.current.file.name, 'ready.pdf')
  })

  it('J — when no prepared File exists, current two-tap fallback still works', async () => {
    assert.match(handleSave, /await prepareSiteDiaryPdf/)
    assert.match(handleSave, /setShareReady\(true\)/)
    assert.match(handleSave, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    const shareNowIdx = handleSave.indexOf('await sharePreparedFile')
    const prepareIdx = handleSave.indexOf('await prepareSiteDiaryPdf')
    assert.ok(shareNowIdx > 0 && shareNowIdx < prepareIdx)
    assert.match(diaryPage, /'Save & Share'/)
    assert.match(diaryPage, /Report Ready — Share Now/)

    const shareReadyPdfRef = { current: null }
    const prepareCalls = []
    const shareCalls = []
    async function handleSaveTap() {
      if (shareReadyPdfRef.current?.file) {
        shareCalls.push('share')
        return
      }
      shareReadyPdfRef.current = null
      prepareCalls.push('prepare')
      shareReadyPdfRef.current = { file: { name: 'fallback.pdf' } }
    }
    await handleSaveTap()
    assert.deepEqual(shareCalls, [])
    assert.deepEqual(prepareCalls, ['prepare'])
    assert.equal(shareReadyPdfRef.current.file.name, 'fallback.pdf')
    await handleSaveTap()
    assert.deepEqual(shareCalls, ['share'])
    assert.deepEqual(prepareCalls, ['prepare'])
  })

  it('K — Phase 2A invalidation still clears background-prepared File on Weather, Site Summary, photo mutation', () => {
    assert.match(invalidateHelper, /shareReadyPdfRef\.current = null/)
    assert.match(invalidateHelper, /setShareReady\(\(prev\) => \(prev \? false : prev\)\)/)
    assert.match(
      diaryPage,
      /handlePdfVisibleTextInput\(invalidatePreparedSharePdf, setWeather, event\)/,
    )
    assert.match(
      diaryPage,
      /handlePdfVisibleTextInput\(invalidatePreparedSharePdf, setSiteSummary, event\)/,
    )
    assert.match(weatherBlock, /onInput=\{handleWeatherInput\}/)
    assert.match(summaryBlock, /onInput=\{handleSiteSummaryInput\}/)
    assert.match(walkChange, /invalidatePreparedSharePdf\('committed-diary-change'\)/)
    assert.match(invalidateLib, /export function handlePdfVisibleTextInput/)
  })

  it('L — asset prewarm contract remains unchanged', () => {
    assert.match(diaryPage, /void prewarmDiaryPdfSessionAssets\(/)
    assert.doesNotMatch(diaryPage, /await prewarmDiaryPdfSessionAssets/)
    assert.doesNotMatch(viewPage, /prewarmDiaryPdfSessionAssets/)
    assert.doesNotMatch(viewPage, /diary-pdf-background-prepare/)
    assert.match(prewarm, /storePreparedWorkPhotoSessionBlob/)
    assert.match(prewarm, /PDF_ASSET_PREWARM_CONCURRENCY/)
    assert.match(cacheLib, /String\(input\.updatedAt \|\| ''\)/)
  })

  it('M — only one background prepare in flight at a time', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let concurrent = 0
    let maxConcurrent = 0
    const clock = createManualClock()
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: 10,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      run: async () => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await gate
        concurrent -= 1
      },
    })
    scheduler.schedule()
    const first = clock.fireNext()
    await flushMicrotasks()
    assert.equal(scheduler.isInFlight(), true)
    scheduler.schedule()
    await clock.fireNext()
    await flushMicrotasks()
    assert.equal(maxConcurrent, 1)
    release()
    await first
    await flushMicrotasks()
    assert.equal(maxConcurrent, 1)
  })

  it('N — repeated edits debounce into one later prepare', async () => {
    const runs = []
    const clock = createManualClock()
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: 3000,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      run: async () => { runs.push('run') },
    })
    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    assert.equal(clock.timers.filter((t) => !t.cancelled).length, 1)
    await clock.fireNext()
    await flushMicrotasks()
    assert.equal(runs.length, 1)
  })

  it('O — stale generation never sets shareReady true', () => {
    assert.equal(bumpPdfPrepareGeneration(0), 1)
    assert.equal(bumpPdfPrepareGeneration(7), 8)
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: true, file: { name: 'stale.pdf' } },
        startedGeneration: 1,
        currentGeneration: 2,
        startedReportId: 'r1',
        currentReportId: 'r1',
        shareInProgress: false,
      }),
      false,
    )
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: false, file: { name: 'x.pdf' } },
        startedGeneration: 1,
        currentGeneration: 1,
        startedReportId: 'r1',
        currentReportId: 'r1',
        shareInProgress: false,
      }),
      false,
    )
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: { ok: true, file: { name: 'busy.pdf' } },
        startedGeneration: 1,
        currentGeneration: 1,
        startedReportId: 'r1',
        currentReportId: 'r1',
        shareInProgress: true,
      }),
      false,
    )
    const adoptIdx = runBackground.indexOf('setShareReady(true)')
    const guardIdx = runBackground.indexOf('shouldAdoptBackgroundPreparedPdf')
    assert.ok(guardIdx > 0 && adoptIdx > guardIdx)
  })

  it('does not run until the workbench is hydrated, stable, and idle', () => {
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: false,
      writable: true,
      reportId: 'r1',
      sessionExpired: false,
      shareInProgress: false,
      hasUnsavedArea: false,
      alreadyHasCurrentFile: false,
    }), false)
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: true,
      writable: true,
      reportId: 'r1',
      sessionExpired: false,
      shareInProgress: true,
      hasUnsavedArea: false,
      alreadyHasCurrentFile: false,
    }), false)
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: true,
      writable: true,
      reportId: 'r1',
      sessionExpired: false,
      shareInProgress: false,
      hasUnsavedArea: true,
      alreadyHasCurrentFile: false,
    }), false)
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: true,
      writable: true,
      reportId: 'r1',
      sessionExpired: false,
      shareInProgress: false,
      hasUnsavedArea: false,
      alreadyHasCurrentFile: true,
    }), false)
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: true,
      writable: true,
      reportId: 'r1',
      sessionExpired: false,
      shareInProgress: false,
      hasUnsavedArea: false,
      alreadyHasCurrentFile: false,
    }), true)
  })

  it('fallback Save & Share cancels background work and waits for one-in-flight settle', () => {
    assert.match(handleSave, /bumpPdfPrepareGeneration/)
    assert.match(handleSave, /pdfBackgroundPrepareSchedulerRef\.current\?\.cancel\(\)/)
    assert.match(handleSave, /waitUntilIdle/)
    const reuseEnd = handleSave.indexOf('saveLockRef.current = true')
    const fallback = handleSave.slice(reuseEnd)
    assert.match(fallback, /bumpPdfPrepareGeneration/)
    assert.match(fallback, /waitUntilIdle/)
  })

  it('background prepare skips durable IndexedDB writes; tap-1 prepare still writes', () => {
    assert.match(shareLib, /skipShareCacheWrite = false/)
    assert.match(shareLib, /if \(!skipShareCacheWrite\)/)
    assert.match(runBackground, /skipShareCacheWrite: true/)
    const tapPrepare = handleSave.slice(handleSave.indexOf('await prepareSiteDiaryPdf'))
    assert.doesNotMatch(tapPrepare.slice(0, 400), /skipShareCacheWrite:\s*true/)
  })

  it('flushes settled autosave before DB-sourced prepare and does not share', () => {
    assert.match(runBackground, /await flushPendingAutosave\(\)/)
    const flushIdx = runBackground.indexOf('await flushPendingAutosave()')
    const prepareIdx = runBackground.indexOf('prepareSiteDiaryPdf')
    assert.ok(flushIdx > 0 && prepareIdx > flushIdx)
    assert.doesNotMatch(viewPage, /createDiaryPdfBackgroundPrepareScheduler/)
  })
})
