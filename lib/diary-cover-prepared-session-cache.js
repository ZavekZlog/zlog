/**
 * Same-tab in-memory cache of canonical prepared cover JPEG Blobs.
 * Lost on full reload. Not IndexedDB. Not raw/legacy covers. Not PDF files.
 *
 * Key: immutable covers/{generation}.jpg path + processing version.
 * Path already includes userId/reportId/generation. Never keyed by signed URL.
 */

import { ZLOG_COVER_PIPELINE_ID } from './cover-pipeline.js'

/** A few concurrently opened diaries — covers are one-per-report. */
export const SESSION_PREPARED_COVER_BLOB_MAX_ENTRIES = 12

/**
 * 16 MB. Prepared covers are 2400-edge JPEGs (~0.5–2 MB). Byte budget
 * evicts before a long session of large covers can grow unbounded.
 */
export const SESSION_PREPARED_COVER_BLOB_MAX_BYTES = 16 * 1024 * 1024

export function createPreparedCoverSessionCache({
  maxEntries = SESSION_PREPARED_COVER_BLOB_MAX_ENTRIES,
  maxBytes = SESSION_PREPARED_COVER_BLOB_MAX_BYTES,
} = {}) {
  /** @type {Map<string, Blob>} */
  const map = new Map()
  let totalBytes = 0
  let evictCount = 0

  function evictWhileOverBudget() {
    while (map.size > 0 && (map.size > maxEntries || totalBytes > maxBytes)) {
      const oldest = map.keys().next().value
      const blob = map.get(oldest)
      map.delete(oldest)
      totalBytes = Math.max(0, totalBytes - (blob?.size || 0))
      evictCount += 1
    }
  }

  return {
    lookup(key) {
      if (!key || !map.has(key)) return null
      const blob = map.get(key)
      if (!(blob instanceof Blob) || blob.size < 1) {
        map.delete(key)
        return null
      }
      map.delete(key)
      map.set(key, blob)
      return blob
    },
    store(key, blob) {
      if (!key || !(blob instanceof Blob) || blob.size < 1) return false
      const previous = map.get(key)
      if (previous) {
        totalBytes = Math.max(0, totalBytes - previous.size)
        map.delete(key)
      }
      map.set(key, blob)
      totalBytes += blob.size
      evictWhileOverBudget()
      return map.has(key)
    },
    clear() {
      map.clear()
      totalBytes = 0
    },
    stats() {
      return {
        entries: map.size,
        bytes: totalBytes,
        evictCount,
        keys: [...map.keys()],
      }
    },
  }
}

const sessionCache = createPreparedCoverSessionCache()

/** @type {Map<string, Promise<Blob>>} */
const inflight = new Map()

function isCanonicalPreparedCoverPath(path) {
  const raw = String(path || '').trim()
  if (!raw) return false
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return false
  return /\/covers\/(?!raw\/)[^/]+\.jpg$/i.test(raw)
}

/**
 * @param {{
 *   coverPath?: string|null,
 *   coverProcessingVersion?: string|null,
 * }} photo
 */
export function preparedCoverSessionCacheKey({
  coverPath = null,
  coverProcessingVersion = null,
} = {}) {
  if (!isCanonicalPreparedCoverPath(coverPath)) return null
  const path = String(coverPath).trim()
  const version = String(coverProcessingVersion || '').trim() || ZLOG_COVER_PIPELINE_ID
  return `${path}::${version}`
}

export function lookupPreparedCoverSessionBlob(identity) {
  const key = preparedCoverSessionCacheKey(identity)
  if (!key) return null
  return sessionCache.lookup(key)
}

export function storePreparedCoverSessionBlob(identity, blob) {
  const key = preparedCoverSessionCacheKey(identity)
  if (!key) return false
  return sessionCache.store(key, blob)
}

export function peekPreparedCoverSessionInflight(identity) {
  const key = preparedCoverSessionCacheKey(identity)
  if (!key) return null
  return inflight.get(key) || null
}

/**
 * One active network fetch per prepared-cover cache key.
 * Failed fetches reject, clear the in-flight slot, and do not poison later retries.
 * @param {{ coverPath?: string|null, coverProcessingVersion?: string|null }} identity
 * @param {() => Promise<Blob>} startFetch
 * @returns {Promise<Blob>}
 */
export function joinPreparedCoverSessionFetch(identity, startFetch) {
  const key = preparedCoverSessionCacheKey(identity)
  if (!key || typeof startFetch !== 'function') {
    return Promise.reject(new Error('Prepared cover session fetch requires a cache key.'))
  }
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(() => startFetch())
    .then((blob) => {
      if (!(blob instanceof Blob) || blob.size < 1) {
        throw new Error('Prepared cover session fetch returned an empty blob.')
      }
      return blob
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

export function hasPreparedCoverSessionSource(identity) {
  if (lookupPreparedCoverSessionBlob(identity)) return true
  return Boolean(peekPreparedCoverSessionInflight(identity))
}

export function clearPreparedCoverSessionCache() {
  sessionCache.clear()
  inflight.clear()
}

export function getPreparedCoverSessionCacheStats() {
  return sessionCache.stats()
}

export function canSkipPreparedCoverSign({
  coverPath = null,
  coverProcessingVersion = null,
  localPreparedBlob = null,
} = {}) {
  if (!isCanonicalPreparedCoverPath(coverPath)) return false
  if (localPreparedBlob instanceof Blob && localPreparedBlob.size > 0) return true
  return Boolean(lookupPreparedCoverSessionBlob({ coverPath, coverProcessingVersion }))
}
