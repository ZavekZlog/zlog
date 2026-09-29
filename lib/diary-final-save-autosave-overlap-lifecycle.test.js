/**
 * Defect #3A — final report-write ownership versus lifecycle autosave.
 *
 * Events must not start a PATCH while the final report write can still land
 * after it. A lifecycle request during that window is deferred and replayed
 * from the current payload after the write settles. PDF preparation does not
 * keep that block.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  autosavePayloadsEqual,
  buildDiaryAutosavePayload,
  createDiaryAutosaveOperationQueue,
  diaryAutosaveOwnersEqual,
} from './diary-autosave.js'
import { preparedFileMatchesFingerprint } from './diary-save-pdf-coordination.js'

const workbenchSource = readFileSync(
  join(import.meta.dirname, '..', 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)

const p1 = buildDiaryAutosavePayload({ weather: 'P1 rain' })
const p2 = buildDiaryAutosavePayload({ weather: 'P2 sun' })
const p3 = buildDiaryAutosavePayload({ weather: 'P3 wind' })
const p4 = buildDiaryAutosavePayload({ weather: 'P4 storm' })
const p5 = buildDiaryAutosavePayload({ weather: 'P5 hail' })
const ownerA = { reportId: 'report-a', projectId: 'project-a', generation: 4 }
const fingerprintF1 = 'a'.repeat(64)
const fingerprintF2 = 'b'.repeat(64)
const ownerB = { reportId: 'report-b', projectId: 'project-a', generation: 5 }

function compileClosedArrow(arrowSource, names) {
  const factory = new Function(
    ...names,
    `"use strict"; return (${arrowSource})();`,
  )
  return (values) => factory(...names.map((name) => values[name]))
}

function eventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    dispatch(type) {
      const listener = listeners.get(type)
      if (listener) listener()
    },
  }
}

function lifecycleEffectSource() {
  const marker = "window.addEventListener('pagehide', flush)"
  const markerAt = workbenchSource.indexOf(marker)
  assert.ok(markerAt >= 0, 'pagehide listener missing')
  const header = 'useEffect(() => {'
  const headerAt = workbenchSource.lastIndexOf(header, markerAt)
  assert.ok(headerAt >= 0, 'lifecycle effect missing')
  const footer = '}, [flushPendingAutosave, performAutosave])'
  const footerAt = workbenchSource.indexOf(footer, markerAt)
  assert.ok(footerAt > markerAt, 'lifecycle effect footer missing')
  return workbenchSource.slice(headerAt + 'useEffect('.length, footerAt + 1)
}

function flushCallbackSource() {
  const header = 'const flushPendingAutosave = useCallback(async () => {'
  const headerAt = workbenchSource.indexOf(header)
  const footer = '}, [editingReportId, hydrateComplete, isDiaryEditMode, performAutosave, sessionExpired])'
  const footerAt = workbenchSource.indexOf(footer, headerAt)
  assert.ok(headerAt >= 0 && footerAt > headerAt, 'flushPendingAutosave callback missing')
  return workbenchSource.slice(headerAt + 'const flushPendingAutosave = useCallback('.length, footerAt + 1)
}

const lifecycleNames = [
  'flushPendingAutosave',
  'performAutosave',
  'latestPayloadRef',
  'ackedSnapshotRef',
  'finalSaveInProgressRef',
  'reportWriteAutosaveOwnerRef',
  'deferredReportWriteAutosaveRef',
  'autosaveLifecycleOwnerRef',
  'diaryAutosaveOwnersEqual',
  'autosavePayloadsEqual',
  'window',
  'document',
]

function installLifecycleListeners(env) {
  const cleanup = compileClosedArrow(lifecycleEffectSource(), lifecycleNames)(env)
  assert.equal(typeof cleanup, 'function')
  return cleanup
}

function compileRelease() {
  const header = 'const releaseDeferredReportWriteAutosave = '
  const start = workbenchSource.indexOf(header)
  assert.ok(start >= 0, 'deferred report-write persistence is discarded')
  const end = workbenchSource.indexOf('// end releaseDeferredReportWriteAutosave', start)
  assert.ok(end > start, 'deferred report-write release is incomplete')
  const arrow = workbenchSource.slice(start + header.length, end).trim()
  const factory = new Function(
    ...lifecycleNames,
    `"use strict"; return (${arrow});`,
  )
  return (values) => factory(...lifecycleNames.map((name) => values[name]))
}

function runExplicitFlush(env) {
  return compileClosedArrow(flushCallbackSource(), [
    'autosaveTimerRef',
    'hydrateComplete',
    'editingReportId',
    'isDiaryEditMode',
    'sessionExpired',
    'latestPayloadRef',
    'ackedSnapshotRef',
    'autosavePayloadsEqual',
    'performAutosave',
    'autosaveLifecycleOwnerRef',
    'autosaveOperationQueueRef',
    'finalSaveInProgressRef',
  ])(env)
}

function listenerEnv({
  finalSaveInProgress = false,
  reportWriteActive = finalSaveInProgress,
  dirty = true,
  latest = null,
  acked = null,
  currentOwner = ownerA,
} = {}) {
  const calls = []
  const documentEvents = eventTarget()
  documentEvents.visibilityState = 'visible'
  const latestPayloadRef = { current: latest || (dirty ? p2 : p1) }
  const ackedSnapshotRef = { current: acked || p1 }
  const persistedWeathers = []
  const env = {
    flushPendingAutosave: () => {
      calls.push('flushPendingAutosave')
    },
    performAutosave: () => {
      calls.push('performAutosave')
      persistedWeathers.push(latestPayloadRef.current?.weather || null)
    },
    latestPayloadRef,
    ackedSnapshotRef,
    finalSaveInProgressRef: { current: finalSaveInProgress },
    reportWriteAutosaveOwnerRef: { current: reportWriteActive ? { ...currentOwner } : null },
    deferredReportWriteAutosaveRef: { current: null },
    autosaveLifecycleOwnerRef: { current: currentOwner ? { ...currentOwner } : null },
    diaryAutosaveOwnersEqual,
    autosavePayloadsEqual,
    window: null,
    document: documentEvents,
  }
  return {
    calls,
    persistedWeathers,
    documentEvents,
    windowEvents: eventTarget(),
    env,
  }
}

function arm(harness) {
  harness.env.window = harness.windowEvents
  return installLifecycleListeners(harness.env)
}

async function replayThroughRealFlush(harness, writeOwner) {
  const release = compileRelease()
  let flushPromise = Promise.resolve()
  const previousFlush = harness.env.flushPendingAutosave
  harness.env.flushPendingAutosave = () => {
    previousFlush()
    flushPromise = runExplicitFlush({
      ...harness.env,
      autosaveTimerRef: { current: null },
      hydrateComplete: true,
      editingReportId: harness.env.autosaveLifecycleOwnerRef.current?.reportId || 'report-a',
      isDiaryEditMode: true,
      sessionExpired: false,
      autosaveOperationQueueRef: { current: { waitFor: async () => {} } },
    })
    return flushPromise
  }
  release(harness.env)(writeOwner)
  await flushPromise
}

describe('Defect #3A — final Save blocks event autosave entry', () => {
  it('does not start autosave when online fires during final save', () => {
    const harness = listenerEnv({ finalSaveInProgress: true, dirty: true })
    harness.env.window = harness.windowEvents
    const cleanup = installLifecycleListeners(harness.env)
    harness.windowEvents.dispatch('online')
    cleanup()
    assert.deepEqual(harness.calls, [])
  })

  it('does not flush when pagehide fires during final save', () => {
    const harness = listenerEnv({ finalSaveInProgress: true })
    harness.env.window = harness.windowEvents
    const cleanup = installLifecycleListeners(harness.env)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    assert.deepEqual(harness.calls, [])
  })

  it('does not flush when the page becomes hidden during final save', () => {
    const harness = listenerEnv({ finalSaveInProgress: true })
    harness.env.window = harness.windowEvents
    const cleanup = installLifecycleListeners(harness.env)
    harness.documentEvents.visibilityState = 'hidden'
    harness.documentEvents.dispatch('visibilitychange')
    cleanup()
    assert.deepEqual(harness.calls, [])
  })

  it('still persists from online, pagehide, and hide when final save is not active', () => {
    const online = listenerEnv({ finalSaveInProgress: false, dirty: true })
    online.env.window = online.windowEvents
    const stopOnline = installLifecycleListeners(online.env)
    online.windowEvents.dispatch('online')
    stopOnline()
    assert.deepEqual(online.calls, ['performAutosave'])

    const hiddenPage = listenerEnv({ finalSaveInProgress: false, dirty: false })
    hiddenPage.env.window = hiddenPage.windowEvents
    const stopHide = installLifecycleListeners(hiddenPage.env)
    hiddenPage.windowEvents.dispatch('pagehide')
    hiddenPage.documentEvents.visibilityState = 'hidden'
    hiddenPage.documentEvents.dispatch('visibilitychange')
    stopHide()
    assert.deepEqual(hiddenPage.calls, ['flushPendingAutosave', 'flushPendingAutosave'])
  })

  it('still runs the Save-owned flush after final save has taken ownership', async () => {
    const calls = []
    const finalSaveInProgressRef = { current: true }
    const handleSaveStart = workbenchSource.indexOf('const handleSave = async')
    const handleSaveFlush = workbenchSource.indexOf('await flushPendingAutosave()', handleSaveStart)
    const eventFlush = workbenchSource.indexOf("window.addEventListener('pagehide', flush)")
    assert.ok(handleSaveFlush > handleSaveStart)
    assert.ok(eventFlush > 0 && handleSaveFlush !== eventFlush)

    await runExplicitFlush({
      autosaveTimerRef: { current: null },
      hydrateComplete: true,
      editingReportId: 'report-a',
      isDiaryEditMode: true,
      sessionExpired: false,
      latestPayloadRef: { current: p2 },
      ackedSnapshotRef: { current: p1 },
      autosavePayloadsEqual,
      performAutosave: async () => {
        calls.push('performAutosave')
      },
      autosaveLifecycleOwnerRef: { current: null },
      autosaveOperationQueueRef: { current: { waitFor: async () => {} } },
      finalSaveInProgressRef,
    })

    assert.equal(finalSaveInProgressRef.current, true)
    assert.deepEqual(calls, ['performAutosave'])
  })

  it('defers pagehide during report-write ownership and replays the current P4 payload', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p4,
      acked: p3,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerA)

    harness.env.ackedSnapshotRef.current = p3
    harness.env.latestPayloadRef.current = p4
    await replayThroughRealFlush(harness, ownerA)

    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
    assert.equal(harness.env.reportWriteAutosaveOwnerRef.current, null)
    assert.equal(harness.env.deferredReportWriteAutosaveRef.current, null)
  })

  it('defers a hidden visibility change and replays the current P4 payload', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p4,
      acked: p3,
    })
    const cleanup = arm(harness)
    harness.documentEvents.visibilityState = 'hidden'
    harness.documentEvents.dispatch('visibilitychange')
    cleanup()
    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerA)

    await replayThroughRealFlush(harness, ownerA)
    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
  })

  it('defers online during report-write ownership and replays P4 without a second online event', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p4,
      acked: p3,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('online')
    cleanup()
    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerA)

    await replayThroughRealFlush(harness, ownerA)
    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
  })

  it('coalesces pagehide, hide, and online into one deferred drain of the latest payload', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p2,
      acked: p1,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    harness.documentEvents.visibilityState = 'hidden'
    harness.documentEvents.dispatch('visibilitychange')
    harness.windowEvents.dispatch('online')
    harness.env.latestPayloadRef.current = p4
    cleanup()
    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerA)

    await replayThroughRealFlush(harness, ownerA)
    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
  })

  it('does not autosave when the saved ack already matches the latest payload', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p3,
      acked: p1,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    assert.deepEqual(harness.calls, [])

    harness.env.ackedSnapshotRef.current = p3
    await replayThroughRealFlush(harness, ownerA)
    assert.deepEqual(harness.persistedWeathers, [])
  })

  it('persists P4 when the edit lands before the deferred drain', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p3,
      acked: p1,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    harness.env.ackedSnapshotRef.current = p3
    harness.env.latestPayloadRef.current = p4
    await replayThroughRealFlush(harness, ownerA)
    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
  })

  it('releases a deferred P4 save when the final report write fails', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p4,
      acked: p1,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    assert.deepEqual(harness.calls, [])

    await replayThroughRealFlush(harness, ownerA)
    assert.equal(harness.env.reportWriteAutosaveOwnerRef.current, null)
    assert.deepEqual(harness.persistedWeathers, ['P4 storm'])
  })

  it('does not let a settled report A write flush report B', async () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: true,
      latest: p4,
      acked: p1,
      currentOwner: ownerA,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    cleanup()
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerA)

    harness.env.autosaveLifecycleOwnerRef.current = { ...ownerB }
    harness.env.reportWriteAutosaveOwnerRef.current = { ...ownerB }
    harness.env.deferredReportWriteAutosaveRef.current = { ...ownerB }
    harness.env.latestPayloadRef.current = buildDiaryAutosavePayload({ weather: 'B latest' })

    await replayThroughRealFlush(harness, ownerA)

    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.persistedWeathers, [])
    assert.deepEqual(harness.env.deferredReportWriteAutosaveRef.current, ownerB)
    assert.equal(harness.env.latestPayloadRef.current.weather, 'B latest')
    assert.deepEqual(harness.env.reportWriteAutosaveOwnerRef.current, ownerB)
  })

  it('allows lifecycle persistence during PDF preparation after the report write has settled', () => {
    const harness = listenerEnv({
      finalSaveInProgress: true,
      reportWriteActive: false,
      latest: p4,
      acked: p3,
    })
    const cleanup = arm(harness)
    harness.windowEvents.dispatch('pagehide')
    harness.documentEvents.visibilityState = 'hidden'
    harness.documentEvents.dispatch('visibilitychange')
    harness.windowEvents.dispatch('online')
    cleanup()
    assert.deepEqual(harness.calls, [
      'flushPendingAutosave',
      'flushPendingAutosave',
      'performAutosave',
    ])
  })
})

const artifactTailNames = [
  'diarySaveLog',
  'saved',
  'releaseDeferredReportWriteAutosave',
  'reportWriteOwner',
  'pdfPrepareGenerationRef',
  'pdfPrepareAbortRef',
  'localAutosaveMutationRevisionRef',
  'editingReportId',
  'saveLockRef',
  'completingRef',
  'finalSaveInProgressRef',
  'flushSync',
  'setSaving',
  'setPdfPreparing',
  'fetchAuthoritativeSiteDiaryPdfExportFingerprint',
  'retainPreparedFile',
  'shareReadyPdfRef',
  'isWorkbenchSharePrepared',
  'preparedFileMatchesFingerprint',
  'emitShareDiag',
  'projectId',
  'setShareReady',
  'setError',
  'persistUiErrorRef',
  'failPdfAfterSave',
  'userMessageForSiteDiaryPdfExportFailure',
  'joinBackgroundInFlight',
  'pdfBackgroundPrepareSchedulerRef',
  'canShareSiteDiaryPdfViaNativeFile',
  'postHydratePdfReconcileRef',
  'postHydrateReconcileArtifactJoinMatches',
  'workbenchShareEntryToPreparedResult',
  'trimPdfExportId',
  'trimPdfFingerprint',
  'supabase',
  'hydrateShareReadyArtifactFromExportIdentity',
  'tapStartedAt',
  'tapUserActivation',
  'runSiteDiaryPdfExportToShareReadyArtifact',
  'runSiteDiaryPdfExportToExportReady',
  'isSiteDiaryPdfExportUserAbortResult',
  'snapshotUserActivation',
  'console',
  'canNativeShare',
  'SITE_DIARY_PDF_EXPORT_HANDOFF',
]

function artifactTailSource() {
  const anchor = "diarySaveLog('success', { reportId: saved.id })"
  const anchorAt = workbenchSource.indexOf(anchor)
  assert.ok(anchorAt >= 0, 'save success marker missing')
  const end = workbenchSource.indexOf('} catch (err) {', anchorAt)
  assert.ok(end > anchorAt, 'save artifact tail missing')
  return workbenchSource.slice(anchorAt, end)
}

function compileArtifactTail() {
  const factory = new Function(
    ...artifactTailNames,
    `"use strict"; return (async () => {\n${artifactTailSource()}\n});`,
  )
  return (values) => factory(...artifactTailNames.map((name) => values[name]))
}

function openGate() {
  let resolveGate
  const promise = new Promise((resolve) => {
    resolveGate = resolve
  })
  return { promise, resolve: resolveGate }
}

function artifactHarness({
  releaseDeferredReportWriteAutosave = () => Promise.resolve(),
  fingerprintResponses = [
    { ok: true, contentFingerprint: fingerprintF1 },
    { ok: true, contentFingerprint: fingerprintF1 },
  ],
} = {}) {
  const stages = []
  const shareReadyValues = []
  const errors = []
  const pdfPrepareGenerationRef = { current: 2 }
  const localAutosaveMutationRevisionRef = { current: 4 }
  const shareReadyPdfRef = { current: null }
  const saveLockRef = { current: true }
  const completingRef = { current: true }
  const finalSaveInProgressRef = { current: true }
  const persistUiErrorRef = { current: '' }
  let fingerprintCall = 0
  const env = {
    diarySaveLog: () => {},
    saved: { id: 'report-a' },
    reportWriteOwner: ownerA,
    releaseDeferredReportWriteAutosave,
    pdfPrepareGenerationRef,
    pdfPrepareAbortRef: { current: null },
    localAutosaveMutationRevisionRef,
    editingReportId: 'report-a',
    saveLockRef,
    completingRef,
    finalSaveInProgressRef,
    flushSync: (fn) => fn(),
    setSaving: (value) => {
      stages.push(['setSaving', value])
    },
    setPdfPreparing: (value) => {
      stages.push(['setPdfPreparing', value])
    },
    fetchAuthoritativeSiteDiaryPdfExportFingerprint: async () => {
      stages.push('fingerprint')
      const next = fingerprintResponses[Math.min(fingerprintCall, fingerprintResponses.length - 1)]
      fingerprintCall += 1
      return next
    },
    retainPreparedFile: false,
    shareReadyPdfRef,
    isWorkbenchSharePrepared: () => false,
    preparedFileMatchesFingerprint: (entry, fingerprint) => {
      stages.push(['match', entry?.contentFingerprint || null, fingerprint || null])
      return preparedFileMatchesFingerprint(entry, fingerprint)
    },
    emitShareDiag: () => {},
    projectId: 'project-a',
    setShareReady: (value) => {
      shareReadyValues.push(value)
      stages.push(['setShareReady', value])
    },
    setError: (value) => {
      errors.push(value)
    },
    persistUiErrorRef,
    failPdfAfterSave: (message) => {
      stages.push(['failPdf', message])
    },
    userMessageForSiteDiaryPdfExportFailure: (result) => result?.message || 'pdf-failed',
    joinBackgroundInFlight: false,
    pdfBackgroundPrepareSchedulerRef: { current: null },
    canShareSiteDiaryPdfViaNativeFile: () => true,
    postHydratePdfReconcileRef: { current: null },
    postHydrateReconcileArtifactJoinMatches: () => false,
    workbenchShareEntryToPreparedResult: () => null,
    trimPdfExportId: (value) => value,
    trimPdfFingerprint: (value) => value,
    supabase: {},
    hydrateShareReadyArtifactFromExportIdentity: async () => ({ ok: false }),
    tapStartedAt: 1,
    tapUserActivation: {},
    runSiteDiaryPdfExportToShareReadyArtifact: async () => {
      stages.push('enqueue')
      return {
        ok: true,
        file: new File(['%PDF'], 'Zlog-Site-Diary.pdf', { type: 'application/pdf' }),
        blob: new Blob(['%PDF']),
        fileName: 'Zlog-Site-Diary.pdf',
        title: 'Site Diary',
        text: 'Site Diary',
        exportId: 'export-1',
        contentFingerprint: fingerprintF1,
        handoff: 'file-ready',
      }
    },
    runSiteDiaryPdfExportToExportReady: async () => {
      stages.push('enqueue')
      return { ok: false }
    },
    isSiteDiaryPdfExportUserAbortResult: () => false,
    snapshotUserActivation: () => ({}),
    console,
    canNativeShare: () => true,
    SITE_DIARY_PDF_EXPORT_HANDOFF: { fileReady: 'file-ready', exportReady: 'export-ready' },
  }
  return {
    env,
    stages,
    errors,
    shareReadyValues,
    shareReadyPdfRef,
    pdfPrepareGenerationRef,
    localAutosaveMutationRevisionRef,
    saveLockRef,
    completingRef,
    finalSaveInProgressRef,
  }
}

describe('Defect #3A — artifact snapshot boundary', () => {
  it('does not fingerprint when a mutation-only P5 edit lands during the deferred P4 drain', async () => {
    const drain = openGate()
    const harness = artifactHarness({
      releaseDeferredReportWriteAutosave: () => drain.promise,
    })
    const pending = compileArtifactTail()(harness.env)()
    await Promise.resolve()
    harness.localAutosaveMutationRevisionRef.current += 1
    harness.env.latestPayloadRef = { current: p5 }
    drain.resolve()
    await pending
    assert.equal(
      harness.stages.includes('fingerprint'),
      false,
      'mutation revision change during deferred drain must stop fingerprint',
    )
    assert.equal(
      harness.stages.includes('enqueue'),
      false,
      'mutation revision change during deferred drain must stop worker enqueue',
    )
    assert.equal(harness.shareReadyPdfRef.current, null)
    assert.equal(harness.shareReadyValues.includes(true), false)
    assert.deepEqual(harness.errors, [])
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'failPdf'), false)
  })

  it('does not fingerprint when PDF invalidation bumps generation during the deferred P4 drain', async () => {
    const drain = openGate()
    const harness = artifactHarness({
      releaseDeferredReportWriteAutosave: () => drain.promise,
    })
    const startedGeneration = harness.pdfPrepareGenerationRef.current
    const pending = compileArtifactTail()(harness.env)()
    await Promise.resolve()
    harness.pdfPrepareGenerationRef.current = startedGeneration + 1
    drain.resolve()
    await pending
    assert.notEqual(harness.pdfPrepareGenerationRef.current, startedGeneration)
    assert.equal(
      harness.stages.includes('fingerprint'),
      false,
      'generation captured before the deferred wait must not fingerprint after it is superseded',
    )
    assert.equal(harness.stages.includes('enqueue'), false)
    assert.equal(harness.shareReadyPdfRef.current, null)
    assert.equal(harness.shareReadyValues.includes(true), false)
    assert.deepEqual(harness.errors, [])
  })

  it('does not adopt an F1 file when the fingerprint after preparation is F2', async () => {
    const harness = artifactHarness({
      fingerprintResponses: [
        { ok: true, contentFingerprint: fingerprintF1 },
        { ok: true, contentFingerprint: fingerprintF2 },
      ],
    })
    await compileArtifactTail()(harness.env)()
    assert.equal(harness.shareReadyPdfRef.current, null)
    assert.equal(harness.shareReadyValues.includes(true), false)
    assert.equal(
      harness.stages.some((stage) => (
        Array.isArray(stage)
        && stage[0] === 'match'
        && stage[1] === fingerprintF1
        && stage[2] === fingerprintF2
        && preparedFileMatchesFingerprint(
          { contentFingerprint: stage[1] },
          stage[2],
        ) === false
      )),
      true,
      'F1 bytes must be checked with preparedFileMatchesFingerprint against F2 and refused',
    )
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'failPdf'), false)
    assert.deepEqual(harness.errors, [])
  })

  it('waits for P5 queued behind held P4 and then dismisses the prepare when revision moved', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    queue.setActive(ownerA)
    const latestPayloadRef = { current: p4 }
    const ackedSnapshotRef = { current: p3 }
    const p4Entered = openGate()
    const releaseP4 = openGate()
    const executes = []
    let p5Executed = false
    const performAutosave = () => {
      const payload = latestPayloadRef.current
      return queue.enqueue({
        owner: ownerA,
        payload,
        execute: async () => {
          executes.push(payload.weather)
          if (payload.weather === 'P4 storm') {
            p4Entered.resolve()
            await releaseP4.promise
            return { ok: true, acked: payload }
          }
          p5Executed = true
          return { ok: true, acked: payload }
        },
        commit: () => {},
      })
    }
    const releaseEnv = {
      flushPendingAutosave: () => runExplicitFlush({
        autosaveTimerRef: { current: null },
        hydrateComplete: true,
        editingReportId: 'report-a',
        isDiaryEditMode: true,
        sessionExpired: false,
        latestPayloadRef,
        ackedSnapshotRef,
        autosavePayloadsEqual,
        performAutosave,
        autosaveLifecycleOwnerRef: { current: { ...ownerA } },
        autosaveOperationQueueRef: { current: queue },
        finalSaveInProgressRef: { current: true },
      }),
      performAutosave,
      latestPayloadRef,
      ackedSnapshotRef,
      finalSaveInProgressRef: { current: true },
      reportWriteAutosaveOwnerRef: { current: { ...ownerA } },
      deferredReportWriteAutosaveRef: { current: { ...ownerA } },
      autosaveLifecycleOwnerRef: { current: { ...ownerA } },
      diaryAutosaveOwnersEqual,
      autosavePayloadsEqual,
      window: eventTarget(),
      document: eventTarget(),
    }
    const harness = artifactHarness({
      releaseDeferredReportWriteAutosave: (owner) => compileRelease()(releaseEnv)(owner),
    })
    const pending = compileArtifactTail()(harness.env)()
    await p4Entered.promise
    assert.equal(
      harness.stages.includes('fingerprint'),
      false,
      'fingerprint must not begin before queued P5 execute completes',
    )
    assert.equal(harness.stages.includes('enqueue'), false)
    latestPayloadRef.current = p5
    harness.localAutosaveMutationRevisionRef.current += 1
    void performAutosave()
    let settled = false
    pending.finally(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(settled, false, 'Save must still be awaiting the physical lane that holds P5')
    assert.equal(p5Executed, false)
    releaseP4.resolve()
    await pending
    assert.equal(p5Executed, true)
    assert.deepEqual(executes, ['P4 storm', 'P5 hail'])
    assert.equal(harness.stages.includes('fingerprint'), false)
    assert.equal(harness.stages.includes('enqueue'), false)
    assert.equal(harness.shareReadyPdfRef.current, null)
    assert.equal(harness.shareReadyValues.includes(true), false)
    assert.deepEqual(harness.errors, [])
  })
})
