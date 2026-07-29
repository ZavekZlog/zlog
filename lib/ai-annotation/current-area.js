/**
 * Persistent Current Area context for the AI annotation engine.
 *
 * Every photograph inherits this area until the user explicitly changes it.
 * Scope is typically `${projectId}:${contextId}` so each module keeps its own
 * walk area, while sharing the same service API across all five reports.
 */

const STORAGE_PREFIX = 'zlog:current-area:v1:'

function storageKey(scopeKey) {
  return `${STORAGE_PREFIX}${scopeKey}`
}

/** @param {string} scopeKey */
export function readCurrentArea(scopeKey) {
  if (!scopeKey || typeof window === 'undefined') return ''
  try {
    const raw = window.sessionStorage.getItem(storageKey(scopeKey))
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed?.area === 'string' ? parsed.area.trim() : ''
  } catch {
    return ''
  }
}

/** @param {string} scopeKey @param {string} area */
export function writeCurrentArea(scopeKey, area) {
  if (!scopeKey || typeof window === 'undefined') return
  const next = typeof area === 'string' ? area.trim() : ''
  try {
    if (!next) {
      window.sessionStorage.removeItem(storageKey(scopeKey))
      return
    }
    window.sessionStorage.setItem(
      storageKey(scopeKey),
      JSON.stringify({ area: next, updatedAt: Date.now() }),
    )
  } catch {
    // Private mode / quota — ignore; in-memory consumers still work
  }
}

/** @param {string} scopeKey */
export function clearCurrentArea(scopeKey) {
  if (!scopeKey || typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey(scopeKey))
  } catch {
    // ignore
  }
}

/**
 * Build a stable scope key for Current Area persistence.
 * @param {{ projectId: string, contextId?: string, shared?: boolean }} opts
 *   shared=true → one area for the whole project across all modules
 */
export function currentAreaScopeKey({ projectId, contextId = 'diary', shared = false }) {
  if (!projectId) return ''
  if (shared) return String(projectId)
  return `${projectId}:${contextId}`
}
