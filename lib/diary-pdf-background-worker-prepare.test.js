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
  joinInFlightReadyArtifactHydration,
  joinPendingReadyArtifactHydration,
  shouldAdoptBackgroundPreparedPdf,
  shouldRunBackgroundPdfPrepare,
  workerArtifactHasShareReadyBytes,
} from './diary-pdf-background-prepare.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')

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

  it('I — same ready export joins one artifact hydration', async () => {
    const slot = { current: null }
    let starts = 0
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const start = () => {
      starts += 1
      return pending
    }
    const first = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-ready',
      start,
    })
    const second = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-ready',
      start,
    })
    assert.equal(starts, 1)
    const result = { ok: true, exportId: 'export-ready', blobSize: 5736477 }
    release(result)
    const [a, b] = await Promise.all([first, second])
    assert.equal(a, result)
    assert.equal(b, result)
    assert.equal(slot.current, null)
  })

  it('J — a different export does not join the pending hydration', async () => {
    const slot = { current: null }
    let starts = 0
    let releaseOld
    const oldPending = new Promise((resolve) => {
      releaseOld = resolve
    })
    const oldHydration = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-old',
      start: () => {
        starts += 1
        return oldPending
      },
    })
    const newHydration = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-new',
      start: () => {
        starts += 1
        return Promise.resolve({ ok: true, exportId: 'export-new' })
      },
    })
    assert.equal(starts, 2)
    const newResult = await newHydration
    releaseOld({ ok: true, exportId: 'export-old' })
    const oldResult = await oldHydration
    assert.equal(oldResult.exportId, 'export-old')
    assert.equal(newResult.exportId, 'export-new')
  })

  it('K — a failed hydration clears the slot so a retry starts again', async () => {
    const slot = { current: null }
    let starts = 0
    const first = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-ready',
      start: () => {
        starts += 1
        return Promise.reject(new Error('download failed'))
      },
    })
    await assert.rejects(first, /download failed/)
    assert.equal(slot.current, null)
    const second = await joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-ready',
      start: () => {
        starts += 1
        return Promise.resolve({ ok: true, exportId: 'export-ready' })
      },
    })
    assert.equal(starts, 2)
    assert.equal(second.ok, true)
  })

  it('L — a pending result for the previous report is not adopted after a report change', async () => {
    const slot = { current: null }
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const stale = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-ready',
      start: () => pending,
    })
    const current = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-b',
      exportId: 'export-ready',
      start: () => Promise.resolve({
        ok: true,
        file: new File(['b'], 'b.pdf', { type: 'application/pdf' }),
        exportId: 'export-ready',
      }),
    })
    const currentResult = await current
    release({
      ok: true,
      file: new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      exportId: 'export-ready',
    })
    const staleResult = await stale
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: staleResult,
        startedGeneration: 1,
        currentGeneration: 1,
        startedReportId: 'report-a',
        currentReportId: 'report-b',
        shareInProgress: false,
      }),
      false,
    )
    assert.equal(
      shouldAdoptBackgroundPreparedPdf({
        prepared: currentResult,
        startedGeneration: 2,
        currentGeneration: 2,
        startedReportId: 'report-b',
        currentReportId: 'report-b',
        shareInProgress: false,
      }),
      true,
    )
  })

  it('M — reconcile and the background scheduler share one ready-artifact flight', () => {
    const reconcile = diaryPage.slice(
      diaryPage.indexOf('const runPostHydratePdfReconcile = useCallback'),
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
    )
    const background = diaryPage.slice(
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
      diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    )
    assert.match(diaryPage, /joinInFlightReadyArtifactHydration\(readyArtifactHydrationRef/)
    assert.match(reconcile, /hydrateReadyArtifactSingleFlight\(/)
    assert.match(background, /hydrateReadyArtifactSingleFlight\(/)
    assert.doesNotMatch(reconcile, /hydrateShareReadyArtifactFromExportIdentity\(/)
    assert.doesNotMatch(background, /hydrateShareReadyArtifactFromExportIdentity\(/)
  })

  it('N — Save joins a pending same-export artifact hydration', async () => {
    const slot = { current: null }
    let starts = 0
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const flight = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
      start: () => {
        starts += 1
        return pending
      },
    })
    const saveJoin = joinPendingReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
    })
    assert.equal(saveJoin, flight)
    assert.equal(starts, 1)
    const result = {
      ok: true,
      exportId: 'export-e1',
      file: new File(['%PDF-e1'], 'e1.pdf', { type: 'application/pdf' }),
    }
    release(result)
    const saved = await saveJoin
    assert.equal(saved, result)
    assert.equal(await flight, result)
    assert.ok(saved.file instanceof File && saved.file.size > 0)
  })

  it('O — Save does not join a different export', async () => {
    const slot = { current: null }
    let releaseE1
    const e1Pending = new Promise((resolve) => {
      releaseE1 = resolve
    })
    const e1 = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
      start: () => e1Pending,
    })
    const saveJoin = joinPendingReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e2',
    })
    assert.equal(saveJoin, null)
    let e2Starts = 0
    const e2 = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e2',
      start: () => {
        e2Starts += 1
        return Promise.resolve({
          ok: true,
          exportId: 'export-e2',
          file: new File(['%PDF-e2'], 'e2.pdf', { type: 'application/pdf' }),
        })
      },
    })
    assert.equal(e2Starts, 1)
    const e2Result = await e2
    releaseE1({
      ok: true,
      exportId: 'export-e1',
      file: new File(['%PDF-e1'], 'e1.pdf', { type: 'application/pdf' }),
    })
    const e1Result = await e1
    assert.equal(e2Result.exportId, 'export-e2')
    assert.equal(e1Result.exportId, 'export-e1')
    assert.notEqual(e2Result, e1Result)
  })

  it('P — a rejected same-export flight clears the slot so Save can retry', async () => {
    const slot = { current: null }
    let starts = 0
    const flight = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
      start: () => {
        starts += 1
        return Promise.reject(new Error('download failed'))
      },
    })
    const saveJoin = joinPendingReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
    })
    flight.catch(() => {})
    assert.equal(saveJoin, flight)
    await assert.rejects(saveJoin, /download failed/)
    assert.equal(slot.current, null)
    const retried = await joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
      start: () => {
        starts += 1
        return Promise.resolve({
          ok: true,
          exportId: 'export-e1',
          file: new File(['%PDF-retry'], 'retry.pdf', { type: 'application/pdf' }),
        })
      },
    })
    assert.equal(starts, 2)
    assert.equal(retried.ok, true)
    assert.ok(retried.file.size > 0)
  })

  it('Q — an older flight finally does not clear the newer slot', async () => {
    const slot = { current: null }
    let releaseE1
    const e1Pending = new Promise((resolve) => {
      releaseE1 = resolve
    })
    let releaseE2
    const e2Pending = new Promise((resolve) => {
      releaseE2 = resolve
    })
    const e1 = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e1',
      start: () => e1Pending,
    })
    const e2 = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-a',
      exportId: 'export-e2',
      start: () => e2Pending,
    })
    assert.equal(slot.current.exportId, 'export-e2')
    releaseE1({ ok: true, exportId: 'export-e1' })
    await e1
    assert.equal(slot.current?.exportId, 'export-e2')
    assert.equal(slot.current?.promise, e2)
    releaseE2({ ok: true, exportId: 'export-e2' })
    await e2
    assert.equal(slot.current, null)
  })

  it('R — Save reads the slot only after the current export id is known', () => {
    const obtain = diaryPage.slice(
      diaryPage.indexOf('const obtainPreparedPdfForSave = async () =>'),
      diaryPage.indexOf('const prepared = await obtainPreparedPdfForSave()'),
    )
    const identityAt = obtain.indexOf('requestFingerprintAndEnqueueSiteDiaryPdfExport')
    const joinAt = obtain.indexOf('joinPendingReadyArtifactHydration(')
    const existingAt = obtain.indexOf('runPreparedShareExport(')
    assert.ok(identityAt > 0)
    assert.ok(joinAt > identityAt)
    assert.ok(existingAt > joinAt)
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
