/**
 * Workbench-only background Site Diary PDF prepare.
 * Debounces after PDF-visible idle, adopts a File only for the current generation,
 * and never invokes the native share sheet.
 */

/** Longer than DIARY_AUTOSAVE_DEBOUNCE_MS (1500) so DB-sourced prepare sees settled autosave. */
export const DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS = 3000

export function bumpPdfPrepareGeneration(current) {
  const n = Number(current) || 0
  return n + 1
}

export function workerArtifactHasShareReadyBytes(prepared) {
  if (!prepared?.ok) return false
  if (prepared.file instanceof File && prepared.file.size > 0) return true
  if (prepared.blob instanceof Blob && prepared.blob.size > 0) return true
  return false
}

export function shouldAdoptBackgroundPreparedPdf({
  prepared,
  startedGeneration,
  currentGeneration,
  startedReportId,
  currentReportId,
  shareInProgress,
} = {}) {
  if (!workerArtifactHasShareReadyBytes(prepared)) return false
  if (shareInProgress) return false
  if (startedGeneration !== currentGeneration) return false
  if (!startedReportId || String(startedReportId) !== String(currentReportId || '')) return false
  return true
}

/**
 * Persisted diary matches last acked autosave snapshot (no in-flight draft edits).
 */
export function isDiaryPersistedCleanForBackgroundPdf({
  latestPayload,
  ackedSnapshot,
  payloadsEqual,
  photoWorkspaceDraftDirty,
} = {}) {
  if (photoWorkspaceDraftDirty) return false
  if (!latestPayload || !ackedSnapshot) return false
  if (typeof payloadsEqual !== 'function') return false
  return payloadsEqual(latestPayload, ackedSnapshot)
}

export function hasAdoptableWorkbenchShareFile(entry) {
  if (!entry) return false
  if (entry.handoff === 'export-ready') return false
  if (entry.file instanceof File && entry.file.size > 0) return true
  if (entry.blob instanceof Blob && entry.blob.size > 0) return true
  return false
}

/**
 * @param {Record<string, unknown>} prepared
 * @param {{ fileReadyHandoff: string }} constants
 */
export function buildWorkbenchShareReadyFromWorkerArtifact(prepared, constants) {
  if (!workerArtifactHasShareReadyBytes(prepared)) return null
  const handoff = constants?.fileReadyHandoff || 'file-ready'
  const pdfFile = prepared.file instanceof File
    ? prepared.file
    : new File(
      [prepared.blob],
      prepared.fileName || 'Zlog-Site-Diary.pdf',
      { type: 'application/pdf' },
    )
  return {
    handoff,
    file: pdfFile,
    blob: prepared.blob,
    fileName: prepared.fileName,
    title: prepared.title,
    text: prepared.text,
    exportId: prepared.exportId,
    reportId: prepared.reportId,
    contentFingerprint: prepared.contentFingerprint ?? null,
  }
}

export function shouldRunBackgroundPdfPrepare({
  hydrateComplete,
  writable,
  reportId,
  sessionExpired,
  shareInProgress,
  hasUnsavedArea,
  alreadyHasCurrentFile,
  diaryPersistedClean,
  nativeFileShareCapable,
  autosaveInFlight,
} = {}) {
  if (!hydrateComplete || !writable) return false
  if (!reportId) return false
  if (sessionExpired) return false
  if (shareInProgress) return false
  if (hasUnsavedArea) return false
  if (alreadyHasCurrentFile) return false
  if (!diaryPersistedClean) return false
  if (!nativeFileShareCapable) return false
  if (autosaveInFlight) return false
  return true
}

/**
 * One pending timer, one in-flight prepare. Edits cancel the timer and reschedule.
 * A timer that fires during in-flight work does not start a second prepare.
 */
export function createDiaryPdfBackgroundPrepareScheduler(options = {}) {
  const idleMs = options.idleMs ?? DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id))
  let timer = null
  let inFlight = false
  let inFlightPromise = null
  let rerunAfterIdle = false

  function cancel() {
    if (timer != null) {
      clearTimer(timer)
      timer = null
    }
  }

  function schedule() {
    cancel()
    timer = setTimer(() => {
      timer = null
      void start()
    }, idleMs)
  }

  async function start() {
    if (inFlight) {
      rerunAfterIdle = true
      return
    }
    inFlight = true
    rerunAfterIdle = false
    inFlightPromise = (async () => {
      try {
        await options.run?.()
      } catch {
        /* Background prepare is non-fatal. */
      }
    })()
    try {
      await inFlightPromise
    } finally {
      inFlight = false
      inFlightPromise = null
      if (rerunAfterIdle) {
        rerunAfterIdle = false
        schedule()
      }
    }
  }

  return {
    schedule,
    cancel,
    isInFlight: () => inFlight,
    hasPendingTimer: () => timer != null,
    waitUntilIdle: () => inFlightPromise || Promise.resolve(),
  }
}
