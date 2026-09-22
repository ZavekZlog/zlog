/**
 * Save + PDF preparation coordination for the Site Diary workbench CTA.
 * Pure helpers — no React, no I/O.
 */

import {
  hasAdoptableWorkbenchShareFile,
  isDiaryPersistedCleanForBackgroundPdf,
} from './diary-pdf-background-prepare.js'

export const SAVE_CTA_IDLE_LABEL = 'Save'
export const SAVE_CTA_SAVING_LABEL = 'Saving…'
export const SAVE_CTA_PREPARING_LABEL = 'Preparing report…'
export const SAVE_CTA_SHARE_READY_LABEL = 'Report Ready — Share Now'

export const DIARY_SAVED_PDF_PREPARE_FAILED_PREFIX =
  'Your Site Diary is saved. '

/**
 * @param {{ current: boolean }} saveLockRef
 * @returns {boolean} true when this call acquired the lock
 */
export function tryAcquireSaveOperationLock(saveLockRef) {
  if (!saveLockRef || saveLockRef.current === true) {
    return false
  }
  saveLockRef.current = true
  return true
}

/**
 * @param {{
 *   saveLockRef: { current: boolean }
 *   finalSaveInProgressRef?: { current: boolean }
 * }} refs
 */
export function isSaveOperationActive(refs) {
  return Boolean(refs?.saveLockRef?.current || refs?.finalSaveInProgressRef?.current)
}

/**
 * @param {{
 *   saveLockRef: { current: boolean }
 *   finalSaveInProgressRef?: { current: boolean }
 *   sharePrepared?: boolean
 *   saving?: boolean
 * }} input
 */
export function shouldIgnoreDuplicateSaveTap(input) {
  if (input?.sharePrepared && !input?.saving) {
    return false
  }
  return isSaveOperationActive(input)
}

/**
 * @param {{
 *   diaryPersistedClean?: boolean
 *   preparedEntry?: unknown
 *   reportId?: string | null
 * }} input
 */
export function shouldRetainPreparedFileOnSave(input) {
  const reportId = input?.reportId
  const entry = input?.preparedEntry
  if (!input?.diaryPersistedClean) return false
  if (!hasAdoptableWorkbenchShareFile(entry)) return false
  if (!reportId || String(entry.reportId || '') !== String(reportId)) return false
  const fingerprint = normalizeFingerprint(entry.contentFingerprint)
  return Boolean(fingerprint)
}

/**
 * @param {unknown} preparedEntry
 * @param {string | null | undefined} contentFingerprint
 */
export function preparedFileMatchesFingerprint(preparedEntry, contentFingerprint) {
  const a = normalizeFingerprint(preparedEntry?.contentFingerprint)
  const b = normalizeFingerprint(contentFingerprint)
  return Boolean(a && b && a === b)
}

/**
 * @param {{
 *   latestPayload?: unknown
 *   ackedSnapshot?: unknown
 *   payloadsEqual?: (a: unknown, b: unknown) => boolean
 *   photoWorkspaceDraftDirty?: boolean
 * }} input
 */
export function isDiaryCleanForSaveRetainCheck(input) {
  return isDiaryPersistedCleanForBackgroundPdf({
    latestPayload: input?.latestPayload,
    ackedSnapshot: input?.ackedSnapshot,
    payloadsEqual: input?.payloadsEqual,
    photoWorkspaceDraftDirty: input?.photoWorkspaceDraftDirty,
  })
}

/**
 * @param {{
 *   retainCurrentPreparedFile: boolean
 *   bumpGeneration: (n: number) => number
 *   pdfPrepareGenerationRef: { current: number }
 *   pdfPrepareAbortRef: { current: AbortController | null }
 *   pdfBackgroundPrepareAbortRef: { current: AbortController | null }
 *   pdfBackgroundPrepareSchedulerRef: { current: { cancel?: () => void, isInFlight?: () => boolean } | null }
 * }} input
 * @returns {{ joinBackgroundInFlight: boolean, invalidatedPrepared: boolean }}
 */
export function coordinateBackgroundPdfOnSaveStart(input) {
  const scheduler = input.pdfBackgroundPrepareSchedulerRef?.current
  scheduler?.cancel?.()

  if (input.retainCurrentPreparedFile) {
    const joinBackgroundInFlight = Boolean(scheduler?.isInFlight?.())
    return { joinBackgroundInFlight, invalidatedPrepared: false }
  }

  input.pdfPrepareGenerationRef.current = input.bumpGeneration(
    input.pdfPrepareGenerationRef.current,
  )
  input.pdfPrepareAbortRef?.current?.abort?.()
  input.pdfPrepareAbortRef.current = null
  input.pdfBackgroundPrepareAbortRef?.current?.abort?.()
  input.pdfBackgroundPrepareAbortRef.current = null

  return { joinBackgroundInFlight: false, invalidatedPrepared: true }
}

/**
 * @param {{ code?: string }} result
 */
export function isPdfPrepareFailureAfterDiarySave(result) {
  if (!result || result.ok) return false
  return true
}

/**
 * @param {string} message
 */
export function diarySavedPdfPrepareFailureMessage(message) {
  const body = String(message || '').trim()
    || 'We couldn’t prepare the PDF report. Try Save again in a moment.'
  if (body.startsWith(DIARY_SAVED_PDF_PREPARE_FAILED_PREFIX)) {
    return body
  }
  return `${DIARY_SAVED_PDF_PREPARE_FAILED_PREFIX}${body}`
}

function normalizeFingerprint(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}
