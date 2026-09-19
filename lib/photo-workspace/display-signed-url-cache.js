/**
 * Tab-scoped in-memory cache for Site Diary **display** signed URLs only.
 * Survives new createPhotoDisplaySignSession instances (review → edit rehydrate).
 * Not used by PDF preparation / batch PDF signing.
 */

export const DISPLAY_SIGNED_URL_BUCKET = 'site-photos'
export const DISPLAY_SIGNED_URL_DEFAULT_EXPIRES_SEC = 3600
/** Re-sign before Supabase expiry — 5 minutes safety margin. */
export const DISPLAY_SIGNED_URL_SAFETY_MARGIN_MS = 5 * 60 * 1000

/** @type {Map<string, { url: string, expiresAtMs: number }>} */
const displaySignedUrlByKey = new Map()

const displayCacheDiag = {
  hits: 0,
  misses: 0,
  expired: 0,
  batchSigned: 0,
}

function isBrowserDisplaySrc(src) {
  const s = String(src || '').trim()
  if (!s) return false
  return /^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')
}

/**
 * Normalize private storage path for stable cache keys (no bucket prefix).
 * @param {unknown} path
 */
export function normalizeDisplayStoragePath(path) {
  if (path == null) return null
  let raw = String(path).trim()
  if (!raw) return null
  if (isBrowserDisplaySrc(raw)) return raw
  raw = raw.replace(/^\/+/, '')
  if (/^site-photos\//i.test(raw)) {
    raw = raw.replace(/^site-photos\//i, '')
  }
  return raw || null
}

/**
 * @param {string} path
 * @param {string} [bucket]
 */
export function displaySignedUrlCacheKey(path, bucket = DISPLAY_SIGNED_URL_BUCKET) {
  const norm = normalizeDisplayStoragePath(path)
  if (!norm) return null
  if (isBrowserDisplaySrc(norm)) return null
  return `${bucket}|${norm}`
}

/**
 * @param {number} expiresInSec
 * @param {number} [signedAtMs]
 */
export function displaySignedUrlExpiresAtMs(expiresInSec, signedAtMs = Date.now()) {
  const sec = Number(expiresInSec) > 0 ? Number(expiresInSec) : DISPLAY_SIGNED_URL_DEFAULT_EXPIRES_SEC
  return signedAtMs + sec * 1000
}

/**
 * @param {{ url: string, expiresAtMs: number }} entry
 * @param {number} [nowMs]
 */
export function isDisplaySignedUrlEntryValid(entry, nowMs = Date.now()) {
  if (!entry?.url || !Number.isFinite(entry.expiresAtMs)) return false
  return entry.expiresAtMs > nowMs + DISPLAY_SIGNED_URL_SAFETY_MARGIN_MS
}

/**
 * Read a still-valid cached display URL (optional diag counters).
 * @param {string} path
 * @param {{ bucket?: string, nowMs?: number, recordStats?: boolean }} [opts]
 * @returns {string|null}
 */
export function getValidDisplaySignedUrl(path, opts = {}) {
  const bucket = opts.bucket || DISPLAY_SIGNED_URL_BUCKET
  const nowMs = opts.nowMs ?? Date.now()
  const recordStats = opts.recordStats !== false
  const norm = normalizeDisplayStoragePath(path)
  if (!norm) return null
  if (isBrowserDisplaySrc(norm)) return norm
  const key = displaySignedUrlCacheKey(norm, bucket)
  if (!key) return null
  const entry = displaySignedUrlByKey.get(key)
  if (!entry) {
    if (recordStats) displayCacheDiag.misses += 1
    return null
  }
  if (!isDisplaySignedUrlEntryValid(entry, nowMs)) {
    displaySignedUrlByKey.delete(key)
    if (recordStats) {
      displayCacheDiag.expired += 1
      displayCacheDiag.misses += 1
    }
    return null
  }
  if (recordStats) displayCacheDiag.hits += 1
  return entry.url
}

/**
 * @param {string} path
 * @param {string} url
 * @param {number} [expiresInSec]
 * @param {string} [bucket]
 */
export function storeDisplaySignedUrl(path, url, expiresInSec = DISPLAY_SIGNED_URL_DEFAULT_EXPIRES_SEC, bucket = DISPLAY_SIGNED_URL_BUCKET) {
  const norm = normalizeDisplayStoragePath(path)
  const signed = String(url || '').trim()
  if (!norm || !isBrowserDisplaySrc(signed)) return
  if (isBrowserDisplaySrc(norm)) return
  const key = displaySignedUrlCacheKey(norm, bucket)
  if (!key) return
  displaySignedUrlByKey.set(key, {
    url: signed,
    expiresAtMs: displaySignedUrlExpiresAtMs(expiresInSec),
  })
}

/**
 * Dev / test — compact counters only (no URLs).
 */
export function getDisplaySignedUrlCacheDiag() {
  return { ...displayCacheDiag }
}

/**
 * @param {number} pathCount
 */
export function recordDisplaySignedUrlBatchSigned(pathCount) {
  const n = Math.max(0, Math.round(Number(pathCount) || 0))
  if (n > 0) displayCacheDiag.batchSigned += n
}

/** Tests and auth/session boundary hooks. */
export function resetDisplaySignedUrlCache() {
  displaySignedUrlByKey.clear()
  displayCacheDiag.hits = 0
  displayCacheDiag.misses = 0
  displayCacheDiag.expired = 0
  displayCacheDiag.batchSigned = 0
}
