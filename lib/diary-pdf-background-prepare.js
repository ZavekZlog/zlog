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

export function shouldAdoptBackgroundPreparedPdf({
  prepared,
  startedGeneration,
  currentGeneration,
  startedReportId,
  currentReportId,
  shareInProgress,
} = {}) {
  if (!prepared?.ok || !(prepared.file instanceof File || prepared.file)) return false
  if (shareInProgress) return false
  if (startedGeneration !== currentGeneration) return false
  if (!startedReportId || String(startedReportId) !== String(currentReportId || '')) return false
  return true
}

export function shouldRunBackgroundPdfPrepare({
  hydrateComplete,
  writable,
  reportId,
  sessionExpired,
  shareInProgress,
  hasUnsavedArea,
  alreadyHasCurrentFile,
} = {}) {
  if (!hydrateComplete || !writable) return false
  if (!reportId) return false
  if (sessionExpired) return false
  if (shareInProgress) return false
  if (hasUnsavedArea) return false
  if (alreadyHasCurrentFile) return false
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
