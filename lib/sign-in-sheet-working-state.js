/**
 * Sign-in sheet working-state helpers (Site Diary labour scan).
 * Pure helpers for clear / replace / stale OCR protection. No DB writes.
 */

/**
 * Empty working state after Remove image (or before first selection).
 * Does not include labourMode, reportDate, labour summary rows, or other diary fields.
 */
export function emptySignInSheetWorkingState() {
  return {
    scanLoading: false,
    scanError: '',
    scanApplyError: '',
    scanApplyNotice: '',
    scanApplySaving: false,
    scanApplySaved: false,
    scanMeta: { matched: 0, ignored: 0, extracted: 0 },
    scanWarnings: [],
    scanOperatives: [],
    scanOcrProvider: null,
    scanApplyEnabled: true,
    scanLastFile: null,
    scanSheetPreview: null,
  }
}

/**
 * True when a sheet image or OCR review is currently shown.
 * @param {{
 *   scanSheetPreview?: unknown,
 *   scanOperatives?: unknown[],
 *   scanLoading?: boolean,
 *   scanLastFile?: unknown,
 *   scanError?: unknown,
 *   scanMeta?: { extracted?: unknown },
 * }} state
 */
export function hasSignInSheetWorkingContent(state = {}) {
  if (state.scanSheetPreview) return true
  if (state.scanLastFile) return true
  if (state.scanLoading) return true
  if (Array.isArray(state.scanOperatives) && state.scanOperatives.length > 0) return true
  if (state.scanError) return true
  if (Number(state.scanMeta?.extracted) > 0) return true
  return false
}

/**
 * Durable storage path on daily_reports (survives navigation / reopen).
 * @param {string|null|undefined} signInSheetStoragePath
 */
export function hasSignInSheetPersistedEvidence(signInSheetStoragePath) {
  const path = signInSheetStoragePath == null ? '' : String(signInSheetStoragePath).trim()
  return Boolean(path)
}

/**
 * Source sign-in evidence exists (persisted path or in-session scan state).
 * Controls Replace / Retry / Remove — not labourMode.
 */
export function hasSignInSheetEvidence(state = {}) {
  if (hasSignInSheetPersistedEvidence(state.signInSheetStoragePath)) return true
  return hasSignInSheetWorkingContent(state)
}

/**
 * Bump generation so in-flight OCR cannot apply after remove/replace.
 * @param {number} current
 * @returns {number}
 */
export function nextSignInSheetRequestId(current = 0) {
  const n = Number(current)
  return (Number.isFinite(n) ? n : 0) + 1
}

/**
 * @param {number} activeId
 * @param {number} requestId
 */
export function isSignInSheetRequestCurrent(activeId, requestId) {
  return Number(activeId) === Number(requestId)
}

/**
 * Cancel / empty picker must not clear an existing sheet.
 * @param {unknown} files
 */
export function shouldReplaceSignInSheet(files) {
  const file = Array.isArray(files) ? files[0] : null
  if (!file) return false
  if (typeof Blob !== 'undefined' && file instanceof Blob) return true
  return false
}
