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
  bumpPdfPrepareGeneration,
  shouldAdoptBackgroundPreparedPdf,
  shouldRunBackgroundPdfPrepare,
  workerArtifactHasShareReadyBytes,
} from './diary-pdf-background-prepare.js'
import {
  SAVE_CTA_IDLE_LABEL,
  SAVE_CTA_SHARE_READY_LABEL,
} from './diary-save-pdf-coordination.js'

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
    const existingAt = obtain.indexOf('runSiteDiaryPdfExportToShareReadyArtifact(')
    assert.ok(identityAt > 0)
    assert.ok(joinAt > identityAt)
    assert.ok(existingAt > joinAt)
    assert.ok(obtain.indexOf('authoritativeIdentity') > existingAt)
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

function workerPdfBlob(contents = '%PDF-1.4 worker') {
  return new Blob([contents], { type: 'application/pdf' })
}

function workbenchApplyAuthUser() {
  const start = diaryPage.indexOf('const applyAuthUser = (user) => {')
  const end = diaryPage.indexOf('void verifyDiaryWorkbenchAuthUser', start)
  assert.ok(start > 0 && end > start, 'applyAuthUser missing')
  const source = diaryPage.slice(start, end)
  return new Function(
    'cancelled',
    'authUserIdRef',
    'setSessionExpired',
    'setError',
    'SESSION_EXPIRED_SAVE_MESSAGE',
    'persistUiErrorRef',
    'setSaving',
    'setJustSaved',
    'setShowSaveBanner',
    'saveLockRef',
    'completingRef',
    'pdfPrepareAbortRef',
    'pdfBackgroundPrepareAbortRef',
    'postHydratePdfReconcileAbortRef',
    'shareReadyPdfRef',
    'pdfPrepareGenerationRef',
    'bumpPdfPrepareGeneration',
    'setShareReady',
    'pdfBackgroundPrepareSchedulerRef',
    'authOwnershipRef',
    'setAuthOwnershipResolved',
    `${source}\nreturn applyAuthUser;`,
  )
}

function authTransitionHarness(userId = 'USER-A', options = {}) {
  const resolved = options.resolved !== false
  const resident = options.resident !== false
  const ownerId = resolved ? userId : null
  const userFile = {
    handoff: 'file-ready',
    file: new File([`%PDF-${userId || 'none'}`], 'ready.pdf', { type: 'application/pdf' }),
    exportId: 'export-1',
    reportId: 'report-1',
  }
  const refs = {
    authUserIdRef: { current: ownerId },
    authOwnershipRef: { current: { resolved, userId: ownerId } },
    authOwnershipResolved: resolved,
    shareReadyPdfRef: { current: resident ? userFile : null },
    pdfPrepareGenerationRef: { current: 4, authResolved: resolved, authUserId: ownerId },
    pdfPrepareAbortRef: { current: new AbortController() },
    pdfBackgroundPrepareAbortRef: { current: new AbortController() },
    postHydratePdfReconcileAbortRef: { current: new AbortController() },
    saveLockRef: { current: true },
    completingRef: { current: true },
    persistUiErrorRef: { current: '' },
    cancels: 0,
    schedules: 0,
    shareReady: resident,
    sessionExpired: false,
    error: '',
  }
  refs.pdfBackgroundPrepareSchedulerRef = {
    current: {
      cancel() { refs.cancels += 1 },
      schedule() { refs.schedules += 1 },
    },
  }
  const setShareReady = (value) => {
    refs.shareReady = typeof value === 'function' ? value(refs.shareReady) : value
  }
  const apply = workbenchApplyAuthUser()(
    false,
    refs.authUserIdRef,
    (value) => { refs.sessionExpired = value },
    (value) => {
      refs.error = typeof value === 'function' ? value(refs.error) : value
    },
    'Your sign-in has timed out.',
    refs.persistUiErrorRef,
    () => {},
    () => {},
    () => {},
    refs.saveLockRef,
    refs.completingRef,
    refs.pdfPrepareAbortRef,
    refs.pdfBackgroundPrepareAbortRef,
    refs.postHydratePdfReconcileAbortRef,
    refs.shareReadyPdfRef,
    refs.pdfPrepareGenerationRef,
    bumpPdfPrepareGeneration,
    setShareReady,
    refs.pdfBackgroundPrepareSchedulerRef,
    refs.authOwnershipRef,
    () => { refs.authOwnershipResolved = true },
  )
  return { refs, apply, userFile }
}

function workbenchPdfPublicationAuthority(refs) {
  const start = diaryPage.indexOf('const workerPdfAuthorityAllowsPublication = useCallback(')
  const end = diaryPage.indexOf('\n  useLayoutEffect(', start)
  assert.ok(start > 0 && end > start, 'publication authority missing')
  const source = diaryPage.slice(start, end)
  const authority = new Function(
    'useCallback',
    'authOwnershipRef',
    'authUserIdRef',
    `${source}\nreturn workerPdfAuthorityAllowsPublication;`,
  )((fn) => fn, refs.authOwnershipRef, refs.authUserIdRef)
  return authority
}

function autoPrepareTriggerWouldRun() {
  return shouldRunBackgroundPdfPrepare({
    hydrateComplete: true,
    writable: true,
    reportId: 'report-1',
    sessionExpired: false,
    shareInProgress: false,
    hasUnsavedArea: false,
    alreadyHasCurrentFile: false,
    diaryPersistedClean: true,
    nativeFileShareCapable: true,
    autosaveInFlight: false,
  })
}

function runProductionReconcileEffect(env) {
  const start = diaryPage.indexOf('    if (!authOwnershipResolved || !authUserIdRef.current) return undefined')
  const marker = '    void runPostHydratePdfReconcile()'
  const end = diaryPage.indexOf(marker, start)
  assert.ok(start > 0 && end > start, 'reconcile effect gate missing')
  const source = `${diaryPage.slice(start, end)}\n${marker}`
  return new Function(
    'authOwnershipResolved',
    'authUserIdRef',
    'hydrateComplete',
    'isDiaryEditMode',
    'editingReportId',
    'sessionExpired',
    'diaryPersistedClean',
    'saving',
    'finalSaveInProgressRef',
    'postHydratePdfReconcileStartedRef',
    'locationWalkRef',
    'canShareSiteDiaryPdfViaNativeFile',
    'runPostHydratePdfReconcile',
    source,
  )(
    env.authOwnershipResolved,
    env.authUserIdRef,
    true,
    true,
    'report-1',
    false,
    true,
    false,
    { current: false },
    env.startedRef,
    { current: null },
    () => true,
    env.runPostHydratePdfReconcile,
  )
}

function workbenchSavePdfDismiss(pdfPrepareGenerationRef) {
  const start = diaryPage.indexOf('      const startedPrepareGeneration = pdfPrepareGenerationRef.current')
  const end = diaryPage.indexOf('      const deferredPersist = await releaseDeferredReportWriteAutosave', start)
  assert.ok(start > 0 && end > start, 'save PDF dismiss missing')
  const source = diaryPage.slice(start, end)
  return new Function(
    'pdfPrepareGenerationRef',
    'localAutosaveMutationRevisionRef',
    'editingReportId',
    'saved',
    'pdfPrepareAbortRef',
    'saveLockRef',
    'completingRef',
    'finalSaveInProgressRef',
    'flushSync',
    'setSaving',
    'setPdfPreparing',
    'saveTailCompletionRef',
    `${source}\nreturn dismissStaleWorkerPrepare;`,
  )(
    pdfPrepareGenerationRef,
    { current: 1 },
    'report-1',
    { id: 'report-1' },
    { current: null },
    { current: false },
    { current: false },
    { current: false },
    (fn) => fn(),
    () => {},
    () => {},
    { current: null },
  )
}

function workbenchUnmountCleanup() {
  const marker = 'Do not cancel an in-flight handoff to Report Complete'
  const markerAt = diaryPage.indexOf(marker)
  const start = diaryPage.lastIndexOf('return () => {', markerAt)
  const end = diaryPage.indexOf('}, [])', markerAt)
  assert.ok(start > 0 && end > start, 'unmount cleanup missing')
  const source = diaryPage.slice(start, end)
  return new Function(
    'completingRef',
    'pdfPrepareAbortRef',
    'pdfBackgroundPrepareAbortRef',
    'postHydratePdfReconcileAbortRef',
    'saveNavTimerRef',
    source,
  )
}

function productionReadyArtifactFns() {
  const start = diaryPage.indexOf('const hydrateShareReadyArtifactFromExportIdentity =')
  const end = diaryPage.indexOf('const runPostHydratePdfReconcile = useCallback')
  assert.ok(start > 0 && end > start, 'cache-aware artifact functions missing')
  const source = diaryPage.slice(start, end)
  assert.match(source, /hydrateReadyArtifactSingleFlight\(reportId, identity, options\)/)
  assert.match(source, /resolveAuthoritativeSiteDiaryPdfExportIdentity/)
  assert.doesNotMatch(source, /downloadShareReadyArtifactFromExportIdentity/)
  return (hydrateReadyArtifactSingleFlight, resolveAuthoritativeSiteDiaryPdfExportIdentity) => new Function(
    'hydrateReadyArtifactSingleFlight',
    'resolveAuthoritativeSiteDiaryPdfExportIdentity',
    'useCallback',
    `${source}\nreturn { hydrateShareReadyArtifactFromExportIdentity, runSiteDiaryPdfExportToShareReadyArtifact };`,
  )(
    hydrateReadyArtifactSingleFlight,
    resolveAuthoritativeSiteDiaryPdfExportIdentity,
    (fn) => fn,
  )
}

async function openCountedWorkerCache(options = {}) {
  const cache = await import('./diary-pdf-cache.js')
  const prepare = await import('./diary-pdf-background-prepare.js')
  const idb = createWorkerMemoryIndexedDb()
  const db = await cache.openSharePdfCacheDatabase(idb)
  const slot = { current: null }
  const counts = { cacheReads: 0, auth: 0, storage: 0, blob: 0 }
  let failLoad = false
  let releaseDownload = () => {}
  const gate = options.holdDownload
    ? new Promise((resolve) => {
      releaseDownload = resolve
    })
    : null
  const flight = (reportId, identity, flightOptions) => prepare.joinInFlightReadyArtifactHydration(slot, {
    reportId,
    exportId: identity?.exportId,
    start: () => prepare.hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId,
      identity,
      isStillCurrent: flightOptions?.isStillCurrent,
      loadCached: async (query) => {
        counts.cacheReads += 1
        if (failLoad) throw new Error('indexeddb blocked')
        return cache.loadWorkerReadyPdfArtifact(query, { db })
      },
      download: async () => {
        counts.auth += 1
        if (gate) await gate
        counts.storage += 1
        counts.blob += 1
        return residentDownload(
          identity.exportId,
          identity.contentFingerprint,
          `%PDF-${identity.exportId}`,
        )
      },
      persist: (entry) => cache.storeWorkerReadyPdfArtifact({
        reportId: entry.reportId,
        userId: entry.userId,
        exportId: entry.exportId,
        contentFingerprint: entry.contentFingerprint,
        blob: entry.blob,
        fileName: entry.fileName,
      }, {
        db,
        attemptStartedAt: entry.attemptStartedAt,
        isStillCurrent: entry.isStillCurrent,
      }),
    }),
  })
  return {
    cache,
    db,
    slot,
    counts,
    flight,
    setFailLoad(value) {
      failLoad = value
    },
    releaseDownload,
  }
}

function residentDownload(exportId, fingerprint, contents = '%PDF-1.4 worker') {
  const blob = workerPdfBlob(contents)
  return {
    ok: true,
    blob,
    file: new File([blob], `${exportId}.pdf`, { type: 'application/pdf' }),
    fileName: `${exportId}.pdf`,
    exportId,
    contentFingerprint: fingerprint,
    reportId: 'report-1',
  }
}

describe('worker artifact cache reuse after identity', () => {
  it('S — single-flight cache hit does not authorize or download', async () => {
    const prepare = await import('./diary-pdf-background-prepare.js')
    const hydrate = prepare.hydrateReadyArtifactFromPersistentCacheOrNetwork
    assert.equal(typeof hydrate, 'function', 'missing hydrateReadyArtifactFromPersistentCacheOrNetwork')
    const slot = { current: null }
    let downloads = 0
    let loads = 0
    const file = new File(['%PDF-hit'], 'hit.pdf', { type: 'application/pdf' })
    const start = () => hydrate({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: async () => {
        loads += 1
        return {
          ok: true,
          fromWorkerArtifactCache: true,
          file,
          blob: file,
          exportId: 'export-1',
          contentFingerprint: 'fingerprint-1',
          reportId: 'report-1',
        }
      },
      download: async () => {
        downloads += 1
        return residentDownload('export-1', 'fingerprint-1')
      },
    })
    const first = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-1',
      exportId: 'export-1',
      start,
    })
    const second = joinInFlightReadyArtifactHydration(slot, {
      reportId: 'report-1',
      exportId: 'export-1',
      start,
    })
    assert.equal(first, second)
    const adopted = await first
    assert.equal(loads, 1)
    assert.equal(downloads, 0)
    assert.equal(adopted.file, file)
    assert.equal(shouldAdoptBackgroundPreparedPdf({
      prepared: adopted,
      startedGeneration: 1,
      currentGeneration: 1,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    }), true)
  })

  it('T — a different export misses and uses the network path', async () => {
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    let downloads = 0
    const result = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-2', contentFingerprint: 'fingerprint-2' },
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => {
        downloads += 1
        return residentDownload('export-2', 'fingerprint-2')
      },
    })
    assert.equal(downloads, 1)
    assert.equal(result.exportId, 'export-2')
    assert.equal(result.fromWorkerArtifactCache, undefined)
  })

  it('U — a malformed cache hit falls through to the network path', async () => {
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    let downloads = 0
    const result = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => {
        downloads += 1
        return residentDownload('export-1', 'fingerprint-1')
      },
    })
    assert.equal(downloads, 1)
    assert.equal(result.ok, true)
    assert.equal(result.file.size > 0, true)
  })

  it('V — cache persistence does not delay the resident file and ignores a rejected write', async () => {
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    let persistStarted = false
    let releasePersist
    const persistGate = new Promise((resolve) => {
      releasePersist = resolve
    })
    const pending = hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => residentDownload('export-1', 'fingerprint-1'),
      persist: () => {
        persistStarted = true
        return persistGate
      },
    })
    const result = await pending
    assert.equal(result.ok, true)
    assert.equal(result.file.size > 0, true)
    assert.equal(persistStarted, true)
    releasePersist({ ok: true })

    const rejected = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => residentDownload('export-1', 'fingerprint-1'),
      persist: () => Promise.reject(new Error('quota')),
    })
    assert.equal(rejected.ok, true)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('W — a stale download does not persist', async () => {
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    let writes = 0
    const result = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      isStillCurrent: () => false,
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => residentDownload('export-1', 'fingerprint-1'),
      persist: () => {
        writes += 1
        return { ok: true }
      },
    })
    assert.equal(result.ok, true)
    assert.equal(writes, 0)
  })

  it('X — a later Workbench reuses the stored artifact and does not download again', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    assert.equal(typeof cache.storeWorkerReadyPdfArtifact, 'function', 'missing storeWorkerReadyPdfArtifact')
    assert.equal(typeof cache.loadWorkerReadyPdfArtifact, 'function', 'missing loadWorkerReadyPdfArtifact')
    const idb = createWorkerMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    let downloads = 0
    const identity = {
      ok: true,
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    const openWorkbench = () => hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity,
      loadCached: (query) => cache.loadWorkerReadyPdfArtifact(query, { db }),
      download: async () => {
        downloads += 1
        return residentDownload('export-1', 'fingerprint-1', '%PDF-remount')
      },
      persist: (entry) => cache.storeWorkerReadyPdfArtifact({
        reportId: entry.reportId,
        userId: entry.userId,
        exportId: entry.exportId,
        contentFingerprint: entry.contentFingerprint,
        blob: entry.blob,
        fileName: entry.fileName,
      }, {
        db,
        attemptStartedAt: entry.attemptStartedAt,
        isStillCurrent: entry.isStillCurrent,
      }),
    })

    const first = await openWorkbench()
    assert.equal(downloads, 1)
    assert.equal(first.ok, true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await openWorkbench()
    assert.equal(downloads, 1)
    assert.equal(second.ok, true)
    assert.equal(second.fromWorkerArtifactCache, true)
    assert.equal(second.file instanceof File, true)
    assert.equal(second.file.size > 0, true)
    assert.equal(second.exportId, 'export-1')
  })

  it('Z — unmount aborts the post-hydrate reconcile controller', () => {
    const marker = 'Do not cancel an in-flight handoff to Report Complete'
    const start = diaryPage.indexOf(marker)
    const cleanup = diaryPage.slice(start, diaryPage.indexOf('}, [])', start))
    const guardAt = cleanup.indexOf('if (completingRef.current) return')
    const prepareAbortAt = cleanup.indexOf('pdfPrepareAbortRef.current?.abort()')
    const reconcileAbortAt = cleanup.indexOf('postHydratePdfReconcileAbortRef.current?.abort()')
    assert.ok(guardAt >= 0)
    assert.ok(prepareAbortAt > guardAt)
    assert.ok(reconcileAbortAt > guardAt)
  })

  it('AK — Workbench unmount aborts the scheduler-owned controller', () => {
    const background = new AbortController()
    const saveOwned = new AbortController()
    const reconcile = new AbortController()
    const pdfBackgroundPrepareAbortRef = { current: background }
    workbenchUnmountCleanup()(
      { current: false },
      { current: saveOwned },
      pdfBackgroundPrepareAbortRef,
      { current: reconcile },
      { current: null },
    )()
    assert.equal(background.signal.aborted, true)
    assert.equal(pdfBackgroundPrepareAbortRef.current, null)
    assert.equal(saveOwned.signal.aborted, true)
    assert.equal(reconcile.signal.aborted, true)
  })

  it('AL — an in-flight scheduler prepare cannot publish Report Ready after unmount', () => {
    const background = new AbortController()
    let storageAbortSeen = false
    background.signal.addEventListener('abort', () => {
      storageAbortSeen = true
    })
    const pdfBackgroundPrepareAbortRef = { current: background }
    workbenchUnmountCleanup()(
      { current: false },
      { current: new AbortController() },
      pdfBackgroundPrepareAbortRef,
      { current: new AbortController() },
      { current: null },
    )()

    const runBackground = diaryPage.slice(
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
      diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    )
    const gate = runBackground.slice(
      runBackground.indexOf('if (prepareAbort.signal.aborted)'),
      runBackground.indexOf('}, [editingReportId'),
    )
    const shareReadyPdfRef = { current: null }
    let readyPublished = false
    const adopt = new Function(
      'prepareAbort',
      'prepared',
      'live',
      'saveLockRef',
      'completingRef',
      'finalSaveInProgressRef',
      'shouldAdoptBackgroundPreparedPdf',
      'startedGeneration',
      'pdfPrepareGenerationRef',
      'startedReportId',
      'editingReportId',
      'buildWorkbenchShareReadyFromWorkerArtifact',
      'SITE_DIARY_PDF_EXPORT_HANDOFF',
      'shareReadyPdfRef',
      'flushSync',
      'setShareReady',
      'emitShareDiag',
      'backgroundStartedAt',
      gate,
    )
    adopt(
      background,
      {
        ok: true,
        file: new File(['%PDF-abandoned'], 'abandoned.pdf', { type: 'application/pdf' }),
        exportId: 'export-1',
        fileName: 'abandoned.pdf',
      },
      { saving: false, projectId: 'project-1' },
      { current: false },
      { current: false },
      { current: false },
      shouldAdoptBackgroundPreparedPdf,
      2,
      { current: 2 },
      'report-1',
      'report-1',
      buildWorkbenchShareReadyFromWorkerArtifact,
      { fileReady: 'file-ready' },
      shareReadyPdfRef,
      (fn) => fn(),
      () => {
        readyPublished = true
      },
      () => {},
      1,
    )
    assert.equal(storageAbortSeen, true)
    assert.equal(background.signal.aborted, true)
    assert.equal(readyPublished, false)
    assert.equal(shareReadyPdfRef.current, null)
  })

  it('AM — Save handoff unmount still aborts scheduler prepare and keeps the Save controller', () => {
    const background = new AbortController()
    const saveOwned = new AbortController()
    const reconcile = new AbortController()
    const pdfBackgroundPrepareAbortRef = { current: background }
    workbenchUnmountCleanup()(
      { current: true },
      { current: saveOwned },
      pdfBackgroundPrepareAbortRef,
      { current: reconcile },
      { current: null },
    )()
    assert.equal(background.signal.aborted, true)
    assert.equal(pdfBackgroundPrepareAbortRef.current, null)
    assert.equal(saveOwned.signal.aborted, false)
    assert.equal(reconcile.signal.aborted, false)
  })

  it('AN — unmount cancels a scheduler timer that has not started', async () => {
    const { createDiaryPdfBackgroundPrepareScheduler } = await import('./diary-pdf-background-prepare.js')
    let cleared = 0
    let started = 0
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: 3000,
      setTimer: (fn) => fn,
      clearTimer: () => {
        cleared += 1
      },
      run: async () => {
        started += 1
      },
    })
    scheduler.schedule()
    assert.equal(scheduler.hasPendingTimer(), true)
    scheduler.cancel()
    assert.equal(scheduler.hasPendingTimer(), false)
    assert.equal(cleared, 1)
    assert.equal(started, 0)
    const timerEffect = diaryPage.slice(
      diaryPage.indexOf('const scheduler = createDiaryPdfBackgroundPrepareScheduler'),
      diaryPage.indexOf('pdfBackgroundPrepareSchedulerRef.current = scheduler'),
    )
    const timerCleanup = diaryPage.slice(
      diaryPage.indexOf('pdfBackgroundPrepareSchedulerRef.current = scheduler'),
      diaryPage.indexOf('if (!hydrateComplete || !isDiaryEditMode'),
    )
    assert.match(timerEffect, /idleMs: DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS/)
    assert.match(timerCleanup, /scheduler\.cancel\(\)/)
  })

  it('AO — aborted scheduler transfer does not persist, and the next open can reuse cache', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    const idb = createWorkerMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: workerPdfBlob('%PDF-cached'),
      fileName: 'cached.pdf',
    }, { db })
    const abandoned = new AbortController()
    let storageBodies = 0
    let writes = 0
    const abandonedFlight = hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: () => new Promise((resolve) => {
        const finish = () => {
          if (abandoned.signal.aborted) {
            resolve({ ok: false, code: 'artifact_aborted' })
            return
          }
          storageBodies += 1
          resolve(residentDownload('export-1', 'fingerprint-1'))
        }
        if (abandoned.signal.aborted) finish()
        else abandoned.signal.addEventListener('abort', finish, { once: true })
      }),
      persist: () => {
        writes += 1
        return { ok: true }
      },
    })
    workbenchUnmountCleanup()(
      { current: false },
      { current: new AbortController() },
      { current: abandoned },
      { current: new AbortController() },
      { current: null },
    )()
    const abandonedResult = await abandonedFlight
    assert.equal(abandoned.signal.aborted, true)
    assert.equal(abandonedResult.ok, false)
    assert.equal(abandonedResult.code, 'artifact_aborted')
    assert.equal(storageBodies, 0)
    assert.equal(writes, 0)
    const reopened = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      loadCached: (query) => cache.loadWorkerReadyPdfArtifact(query, { db }),
      download: async () => {
        storageBodies += 1
        return residentDownload('export-1', 'fingerprint-1', '%PDF-reopen')
      },
      persist: () => {
        writes += 1
        return { ok: true }
      },
    })
    assert.equal(reopened.ok, true)
    assert.equal(reopened.fromWorkerArtifactCache, true)
    assert.equal(reopened.file instanceof File, true)
    assert.equal(reopened.file.size > 0, true)
    assert.equal(storageBodies, 0)
    assert.equal(writes, 0)
  })

  it('AA — an aborted reconcile download does not persist a worker artifact', async () => {
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    let writes = 0
    const controller = new AbortController()
    const settled = await hydrateReadyArtifactFromPersistentCacheOrNetwork({
      userId: 'USER-A',
      reportId: 'report-1',
      identity: { ok: true, exportId: 'export-1', contentFingerprint: 'fingerprint-1' },
      isStillCurrent: () => !controller.signal.aborted,
      loadCached: async () => ({ ok: false, reason: 'miss' }),
      download: async () => {
        controller.abort()
        return { ok: false, code: 'artifact-aborted' }
      },
      persist: () => {
        writes += 1
        return { ok: true }
      },
    })
    assert.equal(settled.ok, false)
    assert.equal(writes, 0)
  })

  it('Y — Workbench reads the worker cache only after authoritative identity', () => {
    const single = diaryPage.slice(
      diaryPage.indexOf('const hydrateReadyArtifactSingleFlight = useCallback'),
      diaryPage.indexOf('const runPostHydratePdfReconcile = useCallback'),
    )
    const reconcile = diaryPage.slice(
      diaryPage.indexOf('const runPostHydratePdfReconcile = useCallback'),
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
    )
    const identityAt = reconcile.indexOf('resolveAuthoritativeSiteDiaryPdfExportIdentity')
    const flightAt = reconcile.indexOf('hydrateReadyArtifactSingleFlight(')
    assert.ok(identityAt > 0)
    assert.ok(flightAt > identityAt)
    assert.match(single, /hydrateReadyArtifactFromPersistentCacheOrNetwork\(/)
    assert.match(single, /loadWorkerReadyPdfArtifact\(/)
    assert.match(single, /storeWorkerReadyPdfArtifact\(/)
    assert.doesNotMatch(reconcile, /loadWorkerReadyPdfArtifact\(/)
    assert.doesNotMatch(reconcile, /hydrateShareReadyArtifactFromExportIdentity\(/)
  })

  it('AB — post-invalidation scheduler reads the same export from the worker cache', async () => {
    const background = diaryPage.slice(
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
      diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    )
    const branchAt = background.indexOf('let prepared')
    const branchEnd = background.indexOf('if (prepareAbort.signal.aborted)')
    const branch = background.slice(branchAt, branchEnd)
    const harness = await openCountedWorkerCache()
    await harness.cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: workerPdfBlob('%PDF-cached'),
      fileName: 'cached.pdf',
    }, { db: harness.db })
    const sameIdentity = {
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    let resolves = 0
    const fns = productionReadyArtifactFns()(harness.flight, async () => {
      resolves += 1
      return sameIdentity
    })
    const run = new Function(
      'reconcileOp',
      'startedReportId',
      'startedGeneration',
      'hydrateReadyArtifactSingleFlight',
      'prepareAbort',
      'runSiteDiaryPdfExportToShareReadyArtifact',
      'supabase',
      'pdfPrepareGenerationRef',
      'editingReportId',
      `return (async () => {\n${branch}\nreturn prepared\n});`,
    )
    const prepared = await run(
      {
        reportId: 'report-1',
        generation: 1,
        identity: { ok: true, exportId: 'export-stale', contentFingerprint: 'fingerprint-stale' },
        identityPromise: Promise.resolve(null),
      },
      'report-1',
      2,
      harness.flight,
      { signal: new AbortController().signal },
      fns.runSiteDiaryPdfExportToShareReadyArtifact,
      {},
      { current: 2 },
      'report-1',
    )()
    assert.equal(resolves, 1)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.file instanceof File, true)
    assert.equal(prepared.file.size > 0, true)
    assert.equal(prepared.exportId, 'export-1')
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=0|storage=0|blob=0',
    )
  })

  it('AC — Save fallback reads the worker cache for the same export', async () => {
    const start = diaryPage.indexOf('const obtainPreparedPdfForSave = async () => {')
    const end = diaryPage.indexOf('const prepared = await obtainPreparedPdfForSave()')
    const source = diaryPage.slice(start, end)
    const harness = await openCountedWorkerCache()
    await harness.cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: workerPdfBlob('%PDF-cached'),
      fileName: 'cached.pdf',
    }, { db: harness.db })
    const fns = productionReadyArtifactFns()(harness.flight, async () => {
      throw new Error('Save already has authoritative identity')
    })
    const identity = {
      ok: true,
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    const run = new Function(
      'joinedExportIdentity',
      'postHydrateReconcileArtifactJoinMatches',
      'saveReconcileOp',
      'startedReportId',
      'startedPrepareGeneration',
      'workbenchShareEntryToPreparedResult',
      'shareReadyPdfRef',
      'trimPdfExportId',
      'trimPdfFingerprint',
      'emitShareDiag',
      'saved',
      'projectId',
      'pdfPrepareGenerationRef',
      'editingReportId',
      'supabase',
      'hydrateShareReadyArtifactFromExportIdentity',
      'prepareAbort',
      'tapStartedAt',
      'useNativeFileShareOnPrepare',
      'requestFingerprintAndEnqueueSiteDiaryPdfExport',
      'joinPendingReadyArtifactHydration',
      'readyArtifactHydrationRef',
      'runPreparedShareExport',
      'runSiteDiaryPdfExportToExportReady',
      'runSiteDiaryPdfExportToShareReadyArtifact',
      `${source}\nreturn obtainPreparedPdfForSave;`,
    )
    const obtain = run(
      identity,
      () => true,
      {
        reportId: 'report-1',
        generation: 2,
        identity,
        artifactPromise: Promise.resolve({ ok: false }),
        artifactSettled: true,
      },
      'report-1',
      2,
      () => null,
      { current: null },
      (value) => String(value || '').trim(),
      (value) => String(value || '').trim().toLowerCase(),
      () => {},
      { id: 'report-1' },
      'project-1',
      { current: 2 },
      'report-1',
      {},
      fns.hydrateShareReadyArtifactFromExportIdentity,
      { signal: new AbortController().signal },
      1,
      () => true,
      async () => ({ ok: false }),
      () => null,
      { current: null },
      async () => {
        throw new Error('direct share export must not run')
      },
      async () => {
        throw new Error('export-ready handoff must not run')
      },
      fns.runSiteDiaryPdfExportToShareReadyArtifact,
    )
    const prepared = await obtain()
    assert.equal(prepared.ok, true)
    assert.equal(prepared.file instanceof File, true)
    assert.equal(prepared.file.size > 0, true)
    assert.equal(prepared.exportId, 'export-1')
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=0|storage=0|blob=0',
    )
  })

  it('AD — Save enqueue fallback uses the worker cache for the same export', async () => {
    const start = diaryPage.indexOf('const obtainPreparedPdfForSave = async () => {')
    const end = diaryPage.indexOf('const prepared = await obtainPreparedPdfForSave()')
    const source = diaryPage.slice(start, end)
    const harness = await openCountedWorkerCache()
    await harness.cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: workerPdfBlob('%PDF-cached'),
      fileName: 'cached.pdf',
    }, { db: harness.db })
    let resolves = 0
    const fns = productionReadyArtifactFns()(harness.flight, async () => {
      resolves += 1
      return {
        ok: true,
        exportId: 'export-1',
        contentFingerprint: 'fingerprint-1',
      }
    })
    const run = new Function(
      'joinedExportIdentity',
      'postHydrateReconcileArtifactJoinMatches',
      'saveReconcileOp',
      'startedReportId',
      'startedPrepareGeneration',
      'workbenchShareEntryToPreparedResult',
      'shareReadyPdfRef',
      'trimPdfExportId',
      'trimPdfFingerprint',
      'emitShareDiag',
      'saved',
      'projectId',
      'pdfPrepareGenerationRef',
      'editingReportId',
      'supabase',
      'hydrateShareReadyArtifactFromExportIdentity',
      'prepareAbort',
      'tapStartedAt',
      'useNativeFileShareOnPrepare',
      'requestFingerprintAndEnqueueSiteDiaryPdfExport',
      'joinPendingReadyArtifactHydration',
      'readyArtifactHydrationRef',
      'runPreparedShareExport',
      'runSiteDiaryPdfExportToExportReady',
      'runSiteDiaryPdfExportToShareReadyArtifact',
      `${source}\nreturn obtainPreparedPdfForSave;`,
    )
    const obtain = run(
      null,
      () => false,
      null,
      'report-1',
      2,
      () => null,
      { current: null },
      (value) => String(value || '').trim(),
      (value) => String(value || '').trim().toLowerCase(),
      () => {},
      { id: 'report-1' },
      'project-1',
      { current: 2 },
      'report-1',
      {},
      fns.hydrateShareReadyArtifactFromExportIdentity,
      { signal: new AbortController().signal },
      1,
      () => true,
      async () => ({
        ok: true,
        exportId: 'export-1',
        job: { status: 'ready', contentFingerprint: 'fingerprint-1' },
      }),
      () => null,
      { current: null },
      async () => {
        throw new Error('direct share export must not run')
      },
      async () => {
        throw new Error('export-ready handoff must not run')
      },
      fns.runSiteDiaryPdfExportToShareReadyArtifact,
    )
    const prepared = await obtain()
    assert.equal(resolves, 0)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.exportId, 'export-1')
    assert.equal(prepared.file.size > 0, true)
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=0|storage=0|blob=0',
    )
  })

  it('AE — a different export after invalidation misses E1 and downloads once', async () => {
    const harness = await openCountedWorkerCache()
    await harness.cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: workerPdfBlob('%PDF-e1'),
      fileName: 'e1.pdf',
    }, { db: harness.db })
    const fns = productionReadyArtifactFns()(harness.flight, async () => ({
      ok: true,
      reportId: 'report-1',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
    }))
    const prepared = await fns.runSiteDiaryPdfExportToShareReadyArtifact({}, 'report-1', {})
    assert.equal(prepared.ok, true)
    assert.equal(prepared.exportId, 'export-2')
    assert.equal(prepared.fromWorkerArtifactCache, undefined)
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AF — first open with no worker record downloads once', async () => {
    const harness = await openCountedWorkerCache()
    const fns = productionReadyArtifactFns()(harness.flight, async () => ({
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }))
    const prepared = await fns.runSiteDiaryPdfExportToShareReadyArtifact({}, 'report-1', {})
    assert.equal(prepared.ok, true)
    assert.equal(prepared.file instanceof File, true)
    assert.equal(prepared.file.size > 0, true)
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AG — a cache read failure still uses one network download', async () => {
    const harness = await openCountedWorkerCache()
    harness.setFailLoad(true)
    const fns = productionReadyArtifactFns()(harness.flight, async () => ({
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }))
    const prepared = await fns.runSiteDiaryPdfExportToShareReadyArtifact({}, 'report-1', {})
    assert.equal(prepared.ok, true)
    assert.equal(prepared.exportId, 'export-1')
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AH — scheduler and Save share one hydration for the same export', async () => {
    const harness = await openCountedWorkerCache({ holdDownload: true })
    const identity = {
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    const fns = productionReadyArtifactFns()(harness.flight, async () => identity)
    const scheduler = fns.runSiteDiaryPdfExportToShareReadyArtifact({}, 'report-1', {})
    const save = fns.hydrateShareReadyArtifactFromExportIdentity({}, 'report-1', identity, {})
    for (let i = 0; i < 8 && harness.counts.auth < 1; i += 1) {
      await Promise.resolve()
    }
    assert.equal(harness.counts.auth, 1)
    harness.releaseDownload()
    const [schedulerResult, saveResult] = await Promise.all([scheduler, save])
    assert.equal(schedulerResult, saveResult)
    assert.equal(schedulerResult.ok, true)
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AI — a wrong fingerprint misses and downloads the current export once', async () => {
    const harness = await openCountedWorkerCache()
    await harness.cache.storeWorkerReadyPdfArtifact({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-old',
      blob: workerPdfBlob('%PDF-old'),
      fileName: 'old.pdf',
    }, { db: harness.db })
    const fns = productionReadyArtifactFns()(harness.flight, async () => ({
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }))
    const prepared = await fns.runSiteDiaryPdfExportToShareReadyArtifact({}, 'report-1', {})
    assert.equal(prepared.ok, true)
    assert.equal(prepared.exportId, 'export-1')
    assert.equal(prepared.contentFingerprint, 'fingerprint-1')
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AJ — matching reconcile identity and the scheduler share one hydration', async () => {
    const background = diaryPage.slice(
      diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
      diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    )
    const branch = background.slice(
      background.indexOf('let prepared'),
      background.indexOf('if (prepareAbort.signal.aborted)'),
    )
    const harness = await openCountedWorkerCache({ holdDownload: true })
    const identity = {
      ok: true,
      reportId: 'report-1',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    const reconcile = harness.flight('report-1', identity, {})
    const run = new Function(
      'reconcileOp',
      'startedReportId',
      'startedGeneration',
      'hydrateReadyArtifactSingleFlight',
      'prepareAbort',
      'runSiteDiaryPdfExportToShareReadyArtifact',
      'supabase',
      'pdfPrepareGenerationRef',
      'editingReportId',
      `return (async () => {\n${branch}\nreturn prepared\n});`,
    )
    const scheduler = run(
      {
        reportId: 'report-1',
        generation: 2,
        identity,
        identityPromise: Promise.resolve(identity),
      },
      'report-1',
      2,
      harness.flight,
      { signal: new AbortController().signal },
      async () => {
        throw new Error('fresh export resolution must not run')
      },
      {},
      { current: 2 },
      'report-1',
    )()
    for (let i = 0; i < 8 && harness.counts.auth < 1; i += 1) {
      await Promise.resolve()
    }
    assert.equal(harness.counts.auth, 1)
    harness.releaseDownload()
    const [reconcileResult, schedulerResult] = await Promise.all([reconcile, scheduler])
    assert.equal(reconcileResult, schedulerResult)
    assert.equal(
      `cache=${harness.counts.cacheReads}|auth=${harness.counts.auth}|storage=${harness.counts.storage}|blob=${harness.counts.blob}`,
      'cache=1|auth=1|storage=1|blob=1',
    )
  })

  it('AP — SIGNED_OUT clears the resident PDF and Report Ready', () => {
    const { refs, apply } = authTransitionHarness()
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    apply(null)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.equal(refs.authUserIdRef.current, null)
    assert.equal(refs.sessionExpired, true)
    assert.ok(refs.pdfPrepareGenerationRef.current > startedGeneration)
    assert.equal(refs.pdfPrepareAbortRef.current, null)
    assert.equal(refs.pdfBackgroundPrepareAbortRef.current, null)
    assert.equal(refs.postHydratePdfReconcileAbortRef.current, null)
    assert.equal(refs.schedules, 0)
    assert.equal(hasAdoptableWorkbenchShareFile(refs.shareReadyPdfRef.current), false)
  })

  it('AQ — USER-A sign-out then USER-B cannot inherit the resident PDF', () => {
    const { refs, apply, userFile } = authTransitionHarness()
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    apply(null)
    refs.error = ''
    apply({ id: 'USER-B' })
    assert.equal(refs.authUserIdRef.current, 'USER-B')
    assert.equal(refs.sessionExpired, false)
    assert.equal(refs.error, '')
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.ok(refs.pdfPrepareGenerationRef.current > startedGeneration)
    assert.equal(shouldAdoptBackgroundPreparedPdf({
      prepared: {
        ok: true,
        file: userFile.file,
      },
      startedGeneration,
      currentGeneration: refs.pdfPrepareGenerationRef.current,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    }), false)
    assert.equal(hasAdoptableWorkbenchShareFile(refs.shareReadyPdfRef.current), false)
    assert.notEqual(refs.shareReadyPdfRef.current, userFile)
    assert.equal(refs.schedules, 0)
  })

  it('AR — an in-flight USER-A prepare cannot adopt after sign-out', () => {
    const { refs, apply } = authTransitionHarness()
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    const background = refs.pdfBackgroundPrepareAbortRef.current
    const saveOwned = refs.pdfPrepareAbortRef.current
    apply(null)
    const adopted = shouldAdoptBackgroundPreparedPdf({
      prepared: {
        ok: true,
        file: new File(['%PDF-user-a'], 'a.pdf', { type: 'application/pdf' }),
      },
      startedGeneration,
      currentGeneration: refs.pdfPrepareGenerationRef.current,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    })
    assert.equal(background.signal.aborted, true)
    assert.equal(saveOwned.signal.aborted, true)
    assert.equal(adopted, false)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
  })

  it('AS — a direct USER-A to USER-B sign-in clears PDF authority', () => {
    const { refs, apply } = authTransitionHarness()
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    apply({ id: 'USER-B' })
    assert.equal(refs.authUserIdRef.current, 'USER-B')
    assert.equal(refs.sessionExpired, false)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.ok(refs.pdfPrepareGenerationRef.current > startedGeneration)
    assert.equal(refs.pdfBackgroundPrepareAbortRef.current, null)
    assert.equal(shouldAdoptBackgroundPreparedPdf({
      prepared: {
        ok: true,
        file: new File(['%PDF-user-a'], 'a.pdf', { type: 'application/pdf' }),
      },
      startedGeneration,
      currentGeneration: refs.pdfPrepareGenerationRef.current,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    }), false)
  })

  it('AT — TOKEN_REFRESHED for the same user keeps the resident PDF', () => {
    const { refs, apply, userFile } = authTransitionHarness()
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    const background = refs.pdfBackgroundPrepareAbortRef.current
    apply({ id: 'USER-A' })
    assert.equal(refs.authUserIdRef.current, 'USER-A')
    assert.equal(refs.shareReadyPdfRef.current, userFile)
    assert.equal(refs.shareReady, true)
    assert.equal(refs.pdfPrepareGenerationRef.current, startedGeneration)
    assert.equal(background.signal.aborted, false)
    assert.equal(refs.cancels, 0)
    assert.equal(refs.sessionExpired, false)
  })

  it('AU — unresolved auth does not publish a worker PDF', () => {
    const { refs } = authTransitionHarness('USER-A', { resolved: false, resident: false })
    const allows = workbenchPdfPublicationAuthority(refs)
    let reconcileRuns = 0
    const startedRef = { current: false }
    runProductionReconcileEffect({
      authOwnershipResolved: refs.authOwnershipResolved,
      authUserIdRef: refs.authUserIdRef,
      startedRef,
      runPostHydratePdfReconcile: () => { reconcileRuns += 1 },
    })
    assert.equal(autoPrepareTriggerWouldRun(), true)
    assert.equal(reconcileRuns, 0)
    assert.equal(startedRef.current, false)
    assert.equal(allows(null), false)
    assert.equal(allows('USER-A'), false)
    assert.equal(workbenchSavePdfDismiss(refs.pdfPrepareGenerationRef)(), true)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.equal(hasAdoptableWorkbenchShareFile(refs.shareReadyPdfRef.current), false)
  })

  it('AV — unresolved then USER-B does not adopt the old result', () => {
    const { refs, apply, userFile } = authTransitionHarness('USER-A', { resolved: false, resident: true })
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    const background = refs.pdfBackgroundPrepareAbortRef.current
    const prepare = refs.pdfPrepareAbortRef.current
    const reconcile = refs.postHydratePdfReconcileAbortRef.current
    apply({ id: 'USER-B' })
    const allows = workbenchPdfPublicationAuthority(refs)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.equal(background.signal.aborted, true)
    assert.equal(prepare.signal.aborted, true)
    assert.equal(reconcile.signal.aborted, true)
    assert.notEqual(refs.pdfPrepareGenerationRef.current, startedGeneration)
    assert.equal(allows(null), false)
    assert.equal(allows('USER-A'), false)
    assert.equal(shouldAdoptBackgroundPreparedPdf({
      prepared: { ok: true, file: userFile.file },
      startedGeneration,
      currentGeneration: refs.pdfPrepareGenerationRef.current,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    }), false)
    assert.equal(hasAdoptableWorkbenchShareFile(refs.shareReadyPdfRef.current), false)
    assert.equal(refs.schedules, 0)
  })

  it('AW — unresolved then signed-out does not adopt the old result', () => {
    const { refs, apply, userFile } = authTransitionHarness('USER-A', { resolved: false, resident: true })
    const startedGeneration = refs.pdfPrepareGenerationRef.current
    apply(null)
    const allows = workbenchPdfPublicationAuthority(refs)
    assert.equal(refs.authOwnershipRef.current.resolved, true)
    assert.equal(refs.authOwnershipRef.current.userId, null)
    assert.equal(refs.authUserIdRef.current, null)
    assert.equal(refs.sessionExpired, true)
    assert.equal(refs.shareReadyPdfRef.current, null)
    assert.equal(refs.shareReady, false)
    assert.equal(allows(null), false)
    assert.equal(allows('USER-A'), false)
    assert.equal(shouldAdoptBackgroundPreparedPdf({
      prepared: { ok: true, file: userFile.file },
      startedGeneration,
      currentGeneration: refs.pdfPrepareGenerationRef.current,
      startedReportId: 'report-1',
      currentReportId: 'report-1',
      shareInProgress: false,
    }), false)
    assert.equal(refs.schedules, 0)
    assert.equal(refs.pdfBackgroundPrepareAbortRef.current, null)
  })

  it('AX — initial USER-A then allows Auto Prepare and keeps a same-user refresh', () => {
    const { refs, apply } = authTransitionHarness('USER-A', { resolved: false, resident: false })
    apply({ id: 'USER-A' })
    assert.equal(refs.authOwnershipRef.current.resolved, true)
    assert.equal(refs.authUserIdRef.current, 'USER-A')
    assert.equal(refs.sessionExpired, false)
    assert.equal(refs.schedules, 0)
    const generation = refs.pdfPrepareGenerationRef.current
    const file = new File(['%PDF-USER-A'], 'ready.pdf', { type: 'application/pdf' })
    refs.shareReadyPdfRef.current = {
      handoff: 'file-ready',
      file,
      exportId: 'export-1',
      reportId: 'report-1',
    }
    refs.shareReady = true
    const allows = workbenchPdfPublicationAuthority(refs)
    assert.equal(allows('USER-A'), true)
    let reconcileRuns = 0
    runProductionReconcileEffect({
      authOwnershipResolved: true,
      authUserIdRef: refs.authUserIdRef,
      startedRef: { current: false },
      runPostHydratePdfReconcile: () => { reconcileRuns += 1 },
    })
    assert.equal(reconcileRuns, 1)
    apply({ id: 'USER-A' })
    apply({ id: 'USER-A' })
    assert.equal(refs.shareReadyPdfRef.current.file, file)
    assert.equal(refs.shareReady, true)
    assert.equal(refs.pdfPrepareGenerationRef.current, generation)
    assert.equal(refs.cancels, 1)
    assert.equal(shouldRunBackgroundPdfPrepare({
      hydrateComplete: true,
      writable: true,
      reportId: 'report-1',
      sessionExpired: false,
      shareInProgress: false,
      hasUnsavedArea: false,
      alreadyHasCurrentFile: true,
      diaryPersistedClean: true,
      nativeFileShareCapable: true,
      autosaveInFlight: false,
    }), false)
    const dismiss = workbenchSavePdfDismiss(refs.pdfPrepareGenerationRef)
    assert.equal(dismiss(), false)
  })
})

describe('unchanged Edit does not announce an existing ready export', () => {
  const isAlreadyReadyPersistedExport = new Function(
    `${diaryPage.slice(
      diaryPage.indexOf('function isAlreadyReadyPersistedExport'),
      diaryPage.indexOf('function postHydrateReconcileArtifactJoinMatches'),
    )}; return isAlreadyReadyPersistedExport`,
  )()

  const reconcileStart = diaryPage.indexOf('const runPostHydratePdfReconcile = useCallback')
  const reconcileEnd = diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback')
  const reconcile = diaryPage.slice(reconcileStart, reconcileEnd)
  const adoptStart = reconcile.indexOf('const adoptPreparedIfCurrent = (prepared) =>')
  const artifactStart = reconcile.indexOf('const artifactPromise = identityPromise.then')
  const adopt = reconcile.slice(adoptStart, artifactStart)
  const artifact = reconcile.slice(artifactStart)
  const existingReadyReturn = artifact.indexOf('if (isAlreadyReadyPersistedExport(identity))')
  const reconcileHydrate = artifact.indexOf('hydrateReadyArtifactSingleFlight')
  const reconcileAdoptCall = artifact.indexOf('adoptPreparedIfCurrent(prepared)')
  const adoptReadyGuard = adopt.indexOf('isAlreadyReadyPersistedExport(prepared)')
  const reconcileAssign = adopt.indexOf('shareReadyPdfRef.current = shareReadyEntry')
  const reconcileAnnounce = adopt.indexOf('setShareReady(true)')
  const runBackground = diaryPage.slice(
    diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
    diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
  )
  const backgroundReadyReturn = runBackground.indexOf('isAlreadyReadyPersistedExport(reconcileOp.identity)')
  const backgroundStart = runBackground.indexOf('background-pdf-prepare-start')
  const backgroundBuild = runBackground.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
  const backgroundAssign = runBackground.indexOf('shareReadyPdfRef.current = shareReadyEntry')
  const backgroundAnnounce = runBackground.indexOf('setShareReady(true)')
  const saveStart = diaryPage.indexOf('shareReadyPdfRef.current = {')
  const saveBlock = diaryPage.slice(saveStart, diaryPage.indexOf('saveLockRef.current = false', saveStart))

  function installEditShareSlot(identity, prepared) {
    const shareReadyPdfRef = { current: null }
    let announced = false
    const setShareReady = (value) => {
      announced = value === true
    }
    if (isAlreadyReadyPersistedExport(identity) || isAlreadyReadyPersistedExport(prepared)) {
      return { shareReadyPdfRef, announced }
    }
    shareReadyPdfRef.current = prepared
    setShareReady(true)
    return { shareReadyPdfRef, announced }
  }

  it('treats only an enqueue status of ready as an existing persisted export', () => {
    assert.equal(isAlreadyReadyPersistedExport({ enqueueReturnedStatus: 'ready' }), true)
    assert.equal(isAlreadyReadyPersistedExport({ enqueueReturnedStatus: ' READY ' }), true)
    assert.equal(isAlreadyReadyPersistedExport({ enqueueReturnedStatus: 'queued' }), false)
    assert.equal(isAlreadyReadyPersistedExport({ enqueueReturnedStatus: 'processing' }), false)
    assert.equal(isAlreadyReadyPersistedExport({}), false)
    assert.equal(isAlreadyReadyPersistedExport(null), false)
  })

  it('verifies an existing ready export without installing the Edit share slot', () => {
    assert.ok(existingReadyReturn > 0)
    assert.ok(existingReadyReturn < reconcileHydrate)
    assert.ok(existingReadyReturn < reconcileAdoptCall)
    assert.ok(adoptReadyGuard > 0)
    assert.ok(adoptReadyGuard < reconcileAssign)
    assert.ok(reconcileAssign < reconcileAnnounce)
    const earlyReturn = artifact.slice(
      existingReadyReturn,
      artifact.indexOf('let prepared', existingReadyReturn),
    )
    assert.match(earlyReturn, /reusedExistingReadyExport: true/)
    assert.match(earlyReturn, /ok: false/)
    assert.doesNotMatch(earlyReturn, /shareReadyPdfRef/)
    assert.doesNotMatch(earlyReturn, /setShareReady/)
    assert.doesNotMatch(earlyReturn, /storeWorkerReadyPdfArtifact/)
    assert.doesNotMatch(earlyReturn, /hydrateReadyArtifactSingleFlight/)
    const installed = installEditShareSlot(
      { ok: true, enqueueReturnedStatus: 'ready', exportId: 'exp-existing' },
      { ok: true, file: { name: 'existing.pdf' }, enqueueReturnedStatus: 'ready' },
    )
    assert.equal(installed.shareReadyPdfRef.current, null)
    assert.equal(installed.announced, false)
  })

  it('does not start a background PDF build for that existing ready export', () => {
    assert.ok(backgroundReadyReturn > 0)
    assert.ok(backgroundReadyReturn < backgroundStart)
    assert.ok(backgroundReadyReturn < backgroundBuild)
    assert.match(diaryPage, /invalidatePreparedSharePdf\('report-edit-reset'\)/)
    const invalidateHelper = diaryPage.slice(
      diaryPage.indexOf('const invalidatePreparedSharePdf'),
      diaryPage.indexOf('const markLocalAutosaveMutation'),
    )
    assert.match(invalidateHelper, /shareReadyPdfRef\.current = null/)
    assert.doesNotMatch(invalidateHelper, /storeWorkerReadyPdfArtifact/)
  })

  it('keeps an unchanged Edit on the normal Save label', () => {
    const cta = diaryPage.slice(
      diaryPage.indexOf('shareReady && !saving && !visiblePageError'),
      diaryPage.indexOf('</PrimaryCTA>', diaryPage.indexOf('shareReady && !saving')),
    )
    assert.match(cta, /✓ Report ready/)
    assert.match(cta, /shareReady \? SAVE_CTA_SHARE_READY_LABEL : SAVE_CTA_IDLE_LABEL/)
    assert.equal(SAVE_CTA_IDLE_LABEL, 'Save')
    assert.equal(SAVE_CTA_SHARE_READY_LABEL, 'Report Ready — Share Now')
    const shareReady = false
    assert.equal(shareReady ? SAVE_CTA_SHARE_READY_LABEL : SAVE_CTA_IDLE_LABEL, SAVE_CTA_IDLE_LABEL)
  })

  it('still installs a newly prepared replacement and keeps mutation invalidation', () => {
    assert.ok(reconcileAnnounce > reconcileAssign)
    assert.ok(backgroundAnnounce > backgroundAssign)
    assert.ok(backgroundAssign > runBackground.indexOf('isAlreadyReadyPersistedExport(prepared)'))
    assert.match(runBackground, /isAlreadyReadyPersistedExport\(prepared\)/)
    assert.match(saveBlock, /shareReadyPdfRef\.current = \{/)
    assert.match(
      diaryPage.slice(saveStart, saveStart + 1800),
      /setShareReady\(true\)/,
    )
    assert.match(diaryPage, /invalidatePreparedSharePdf\('committed-diary-change'\)/)
    const queued = installEditShareSlot(
      { ok: true, enqueueReturnedStatus: 'queued', exportId: 'exp-new' },
      { ok: true, file: { name: 'replacement.pdf' }, enqueueReturnedStatus: 'queued' },
    )
    assert.equal(queued.shareReadyPdfRef.current.file.name, 'replacement.pdf')
    assert.equal(queued.announced, true)
    const processing = installEditShareSlot(
      { ok: true, enqueueReturnedStatus: 'processing', exportId: 'exp-new' },
      { ok: true, file: { name: 'replacement.pdf' }, enqueueReturnedStatus: 'processing' },
    )
    assert.equal(processing.announced, true)
    assert.equal(processing.shareReadyPdfRef.current.file.name, 'replacement.pdf')
  })
})

describe('final Save authorises replacement PDF preparation', () => {
  const replacementPdfPreparationAuthorised = new Function(
    `${diaryPage.slice(
      diaryPage.indexOf('function replacementPdfPreparationAuthorised'),
      diaryPage.indexOf('function postHydrateReconcileArtifactJoinMatches'),
    )}; return replacementPdfPreparationAuthorised`,
  )()
  const runBackground = diaryPage.slice(
    diaryPage.indexOf('const runBackgroundPdfPrepare = useCallback'),
    diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
  )
  const authGate = runBackground.indexOf('if (!replacementPdfPreparationAuthorised(')
  const backgroundStart = runBackground.indexOf('background-pdf-prepare-start')
  const backgroundEnqueue = runBackground.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
  const persistAt = diaryPage.indexOf('diaryPersistSucceeded = true')
  const authoriseAt = diaryPage.indexOf('replacementPdfAuthorisationRef.current = {')
  const obtainFn = diaryPage.indexOf('const obtainPreparedPdfForSave = async () =>')
  const obtainAt = diaryPage.indexOf('const prepared = await obtainPreparedPdfForSave()')
  const savePrepare = diaryPage.slice(obtainFn, obtainAt)
  const shareAssign = diaryPage.indexOf('shareReadyPdfRef.current = {', obtainAt)
  const shareAnnounce = diaryPage.indexOf('setShareReady(true)', obtainAt)
  const beforePersist = diaryPage.slice(diaryPage.indexOf('const handleSave = async'), persistAt)
  const invalidateHelper = diaryPage.slice(
    diaryPage.indexOf('const invalidatePreparedSharePdf'),
    diaryPage.indexOf('const markLocalAutosaveMutation'),
  )
  const reportReset = diaryPage.slice(
    diaryPage.indexOf('Clear stale locks when opening/switching a report'),
    diaryPage.indexOf('eslint-enable react-hooks/set-state-in-effect'),
  )
  const cleanSchedule = diaryPage.slice(
    diaryPage.indexOf('pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare'),
    diaryPage.indexOf('const updateLabour ='),
  )

  function backgroundWouldPrepare(authorisation, reportId, generation) {
    return replacementPdfPreparationAuthorised(authorisation, reportId, generation)
  }

  it('blocks background prepare until this report and generation are authorised', () => {
    const saved = { authorised: true, reportId: 'report-1', generation: 4 }
    assert.equal(replacementPdfPreparationAuthorised(null, 'report-1', 4), false)
    assert.equal(replacementPdfPreparationAuthorised({ authorised: false, reportId: 'report-1', generation: 4 }, 'report-1', 4), false)
    assert.equal(replacementPdfPreparationAuthorised(saved, 'report-2', 4), false)
    assert.equal(replacementPdfPreparationAuthorised(saved, 'report-1', 5), false)
    assert.equal(replacementPdfPreparationAuthorised(saved, 'report-1', 4), true)
    assert.equal(backgroundWouldPrepare(null, 'report-1', 4), false)
    assert.equal(backgroundWouldPrepare(saved, 'report-1', 4), true)
  })

  it('returns before a background build or replacement enqueue when Save has not authorised it', () => {
    assert.ok(authGate > 0)
    assert.ok(authGate < backgroundStart)
    assert.ok(authGate < backgroundEnqueue)
    assert.match(invalidateHelper, /pdfBackgroundPrepareSchedulerRef\.current\?\.schedule\(\)/)
    assert.match(invalidateHelper, /shareReadyPdfRef\.current = null/)
    assert.doesNotMatch(invalidateHelper, /authorised: true/)
    assert.doesNotMatch(invalidateHelper, /runSiteDiaryPdfExportToShareReadyArtifact/)
    assert.match(cleanSchedule, /pdfBackgroundPrepareSchedulerRef\.current\?\.schedule\(\)/)
    assert.equal(backgroundWouldPrepare(null, 'report-1', 2), false)
    assert.equal(backgroundWouldPrepare(null, 'report-1', 3), false)
  })

  it('authorises preparation only after the diary save succeeds, then the Save path prepares', () => {
    assert.ok(persistAt > 0)
    assert.ok(authoriseAt > persistAt)
    assert.ok(obtainAt > authoriseAt)
    assert.equal(diaryPage.split('authorised: true').length - 1, 1)
    assert.doesNotMatch(beforePersist, /authorised: true/)
    assert.match(savePrepare, /requestFingerprintAndEnqueueSiteDiaryPdfExport|runSiteDiaryPdfExportToExportReady|hydrateShareReadyArtifactFromExportIdentity/)
    assert.ok(shareAssign > obtainAt)
    assert.ok(shareAnnounce > shareAssign)
  })

  it('clears authorisation when the report changes and ignores a stale generation', () => {
    assert.match(reportReset, /replacementPdfAuthorisationRef\.current = null/)
    assert.match(reportReset, /invalidatePreparedSharePdf\('report-edit-reset'\)/)
    assert.match(invalidateHelper, /bumpPdfPrepareGeneration/)
    const previousReport = { authorised: true, reportId: 'report-1', generation: 4 }
    assert.equal(replacementPdfPreparationAuthorised(null, 'report-1', 4), false)
    assert.equal(replacementPdfPreparationAuthorised(previousReport, 'report-9', 4), false)
    assert.equal(replacementPdfPreparationAuthorised(previousReport, 'report-1', 5), false)
  })

  it('releases Save after durable enqueue and before worker poll or artifact download', () => {
    const releaseFn = diaryPage.slice(
      diaryPage.indexOf('const releaseSaveAfterDurableEnqueue'),
      obtainFn,
    )
    const nativeEnqueue = savePrepare.indexOf('requestFingerprintAndEnqueueSiteDiaryPdfExport')
    const enqueueFailed = savePrepare.indexOf('if (!enqueued?.ok)')
    const releaseCall = savePrepare.indexOf('releaseSaveAfterDurableEnqueue(enqueued)')
    const nativeDownload = savePrepare.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
    const exportReady = savePrepare.indexOf('onDurableEnqueue: releaseSaveAfterDurableEnqueue')
    assert.ok(authoriseAt < diaryPage.indexOf('const releaseSaveAfterDurableEnqueue'))
    assert.ok(nativeEnqueue > 0)
    assert.ok(enqueueFailed > nativeEnqueue)
    assert.ok(releaseCall > enqueueFailed)
    assert.ok(nativeDownload > releaseCall)
    assert.ok(exportReady > nativeDownload)
    assert.match(releaseFn, /setSaving\(false\)/)
    assert.match(releaseFn, /setPdfPreparing\(false\)/)
    assert.match(releaseFn, /saveLockRef\.current = false/)
    assert.ok(releaseFn.indexOf('saveTailCompletionRef.current = exportId') < releaseFn.indexOf('saveLockRef.current = false'))
    assert.doesNotMatch(releaseFn, /setShareReady/)
    assert.doesNotMatch(releaseFn, /pdfPrepareAbortRef/)
    assert.match(reportReset, /acceptedDurableExportIdRef\.current = null/)
    const unmountStart = diaryPage.indexOf('Do not cancel an in-flight handoff to Report Complete')
    const unmount = diaryPage.slice(
      unmountStart,
      diaryPage.indexOf('if (saveNavTimerRef.current) clearTimeout(saveNavTimerRef.current)', unmountStart),
    )
    assert.match(unmount, /if \(completingRef\.current\) return/)
    assert.match(unmount, /pdfPrepareAbortRef\.current\?\.abort\(\)/)
    assert.doesNotMatch(unmount, /site_diary_pdf_exports|enqueue_site_diary_pdf_export|delete\(/)
    const enqueueFn = diaryPage.indexOf('enqueueSiteDiaryPdfExportJob')
    assert.equal(enqueueFn, -1)
    const client = readFileSync(join(root, 'lib/site-diary-pdf-export-client.js'), 'utf8')
    const enqueueJob = client.slice(
      client.indexOf('export async function enqueueSiteDiaryPdfExportJob'),
      client.indexOf('function exportRowRecency'),
    )
    assert.match(enqueueJob, /SITE_DIARY_PDF_EXPORT_RPC\.enqueue/)
    assert.doesNotMatch(enqueueJob, /signal/)
  })

  it('keeps final Save on Saving and lets only the Save tail adopt that export', () => {
    const cta = diaryPage.slice(
      diaryPage.indexOf('ref={saveCtaRef}'),
      diaryPage.indexOf('</PrimaryCTA>', diaryPage.indexOf('ref={saveCtaRef}')),
    )
    const savingBranch = cta.slice(cta.indexOf('saving ?'), cta.indexOf('shareReady ?'))
    assert.match(savingBranch, /SAVE_CTA_SAVING_LABEL/)
    assert.doesNotMatch(savingBranch, /SAVE_CTA_PREPARING_LABEL|Preparing report/)
    const ownerGuard = runBackground.indexOf('saveTailCompletionRef.current')
    assert.ok(ownerGuard > authGate)
    assert.ok(ownerGuard < backgroundStart)
    assert.ok(ownerGuard < backgroundEnqueue)
    const tailStart = obtainAt
    const tailEnd = diaryPage.indexOf('} catch (err)', tailStart)
    const tail = diaryPage.slice(tailStart, tailEnd)
    const shareAt = tail.indexOf('setShareReady(true)')
    const clearAt = tail.indexOf('clearSaveTailCompletionOwner()', shareAt)
    assert.ok(shareAt > 0)
    assert.equal(tail.indexOf('setShareReady(true)', shareAt + 1), -1)
    assert.ok(clearAt > shareAt)
    assert.match(invalidateHelper, /saveTailCompletionRef\.current = null/)
    assert.match(reportReset, /saveTailCompletionRef\.current = null/)
  })
})

function createWorkerMemoryIndexedDb() {
  const databases = new Map()
  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      }
      queueMicrotask(() => {
        let db = databases.get(name)
        if (!db) {
          db = createWorkerMemoryDatabase(name, 0)
          databases.set(name, db)
        }
        if (db.version < version) {
          const oldVersion = db.version
          db.version = version
          request.result = db
          request.onupgradeneeded?.({ oldVersion, newVersion: version })
        }
        request.result = db
        request.onsuccess?.()
      })
      return request
    },
  }
}

function createWorkerMemoryDatabase(name, version) {
  const stores = new Map()
  return {
    name,
    version,
    objectStoreNames: {
      contains(storeName) {
        return stores.has(storeName)
      },
    },
    createObjectStore(storeName, { keyPath } = {}) {
      if (stores.has(storeName)) throw new Error(`store already exists: ${storeName}`)
      stores.set(storeName, { keyPath, records: new Map() })
    },
    transaction(storeName) {
      const store = stores.get(storeName)
      const jobs = []
      let flushed = false
      const tx = {
        error: store ? null : new Error(`missing store: ${storeName}`),
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          if (flushed) return
          flushed = true
          tx.error = tx.error || new Error('aborted')
          queueMicrotask(() => tx.onabort?.())
        },
        objectStore() {
          if (!store) throw new Error(`missing store: ${storeName}`)
          return {
            put(value) {
              store.records.set(value[store.keyPath], value)
            },
            get(key) {
              const req = { result: undefined, onsuccess: null, onerror: null }
              jobs.push(() => {
                req.result = store.records.get(key)
                req.onsuccess?.()
              })
              return req
            },
          }
        },
      }
      queueMicrotask(() => {
        if (flushed) return
        flushed = true
        if (!store) {
          tx.onerror?.()
          return
        }
        try {
          for (const job of jobs) job()
          tx.oncomplete?.()
        } catch (err) {
          tx.error = err
          tx.onerror?.()
        }
      })
      return tx
    },
  }
}
