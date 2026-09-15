/**
 * Durable evidence path bound to a committed Attendance Register OCR/review generation.
 * Pure helper — hook sets state only when operatives/review are committed.
 */

function trimPath(value) {
  const path = value == null ? '' : String(value).trim()
  return path || null
}

/**
 * @param {{
 *   persistEvidence?: boolean,
 *   editingReportId?: string|null,
 *   projectId?: string|null,
 *   persistedStoragePathForGeneration?: string|null,
 *   sessionPersistedPath?: string|null,
 * }} args
 * @returns {string|null}
 */
export function scanReviewEvidencePathForCommittedGeneration({
  persistEvidence = true,
  editingReportId = null,
  projectId = null,
  persistedStoragePathForGeneration = null,
  sessionPersistedPath = null,
} = {}) {
  const mustPersist = Boolean(persistEvidence && editingReportId && projectId)
  if (mustPersist) {
    return trimPath(persistedStoragePathForGeneration)
  }
  if (persistEvidence === false) {
    return trimPath(sessionPersistedPath)
  }
  return null
}
