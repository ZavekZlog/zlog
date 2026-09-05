/**
 * Same-tab in-memory cache of canonical prepared work-photo report.jpg Blobs.
 * Lost on full reload. Not IndexedDB. Not thumbnails. Not PDF files.
 *
 * Key: canonical storage path + processing_version + report_byte_size.
 * Path already includes userId/reportId/photoId. Never keyed by signed URL.
 */

import { pdfSourceNeedsStorageSign } from './diary-share-pdf-assets.js'
import { isPreparedWorkPhotoForPdfPassThrough } from './photo-workspace/persist-prepared-photo.js'

/** Matches existing baked-src entry cap — enough for several typical diaries, not 50+ unbounded. */
export const SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_ENTRIES = 48

/**
 * ~48 MB. Observed 9-photo payload is ~4.3 MB; a 50-photo diary at ~0.5 MB
 * still fits. Larger JPEGs evict by bytes before leaking Android RAM.
 */
export const SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_BYTES = 48 * 1024 * 1024

const CANONICAL_REPORT_JPG = /\/photos\/[^/]+\/report\.jpg$/i

export function createPreparedWorkPhotoSessionCache({
  maxEntries = SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_ENTRIES,
  maxBytes = SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_BYTES,
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

const sessionCache = createPreparedWorkPhotoSessionCache()

/** @type {Map<string, Promise<Blob>>} */
const inflight = new Map()

export function canonicalPreparedReportStoragePath(path) {
  const raw = String(path || '').trim()
  if (!raw || !pdfSourceNeedsStorageSign(raw)) return null
  if (!CANONICAL_REPORT_JPG.test(raw)) return null
  return raw
}

export function preparedWorkPhotoSessionCacheBytes(photo, blob = null) {
  const meta = Number(photo?.report_byte_size ?? photo?.reportByteSize)
  if (Number.isFinite(meta) && meta > 0) return Math.round(meta)
  if (blob instanceof Blob && blob.size > 0) return blob.size
  return 0
}

/**
 * Stable prepared-photo identity. Not a signed URL.
 * @param {Record<string, unknown>|null|undefined} photo
 * @param {Blob|null} [blob]
 */
export function preparedWorkPhotoSessionCacheKey(photo, blob = null) {
  if (!isPreparedWorkPhotoForPdfPassThrough(photo, { hasLocalPreparedBlob: false })) {
    return null
  }
  const path = canonicalPreparedReportStoragePath(photo?.url ?? photo?.storagePath)
  if (!path) return null
  const version = String(photo?.processing_version || photo?.processingVersion || '').trim()
  if (!version) return null
  const bytes = preparedWorkPhotoSessionCacheBytes(photo, blob)
  if (!bytes) return null
  return `${path}::${version}::${bytes}`
}

export function lookupPreparedWorkPhotoSessionBlob(photo) {
  const key = preparedWorkPhotoSessionCacheKey(photo)
  if (!key) return null
  return sessionCache.lookup(key)
}

export function storePreparedWorkPhotoSessionBlob(photo, blob) {
  const key = preparedWorkPhotoSessionCacheKey(photo, blob)
  if (!key) return false
  const metaBytes = preparedWorkPhotoSessionCacheBytes(photo, blob)
  if (blob instanceof Blob && metaBytes && blob.size !== metaBytes && Number(photo?.report_byte_size ?? photo?.reportByteSize) > 0) {
    return false
  }
  return sessionCache.store(key, blob)
}

export function peekPreparedWorkPhotoSessionInflight(key) {
  if (!key) return null
  return inflight.get(key) || null
}

/**
 * One active network fetch per prepared-photo cache key.
 * Failed fetches reject, clear the in-flight slot, and do not poison later retries.
 * @param {string} key
 * @param {() => Promise<Blob>} startFetch
 * @returns {Promise<Blob>}
 */
export function joinPreparedWorkPhotoSessionFetch(key, startFetch) {
  if (!key || typeof startFetch !== 'function') {
    return Promise.reject(new Error('Prepared photo session fetch requires a cache key.'))
  }
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(() => startFetch())
    .then((blob) => {
      if (!(blob instanceof Blob) || blob.size < 1) {
        throw new Error('Prepared photo session fetch returned an empty blob.')
      }
      return blob
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

export function hasPreparedWorkPhotoSessionSource(photo) {
  if (lookupPreparedWorkPhotoSessionBlob(photo)) return true
  const key = preparedWorkPhotoSessionCacheKey(photo)
  return Boolean(key && peekPreparedWorkPhotoSessionInflight(key))
}

export function clearPreparedWorkPhotoSessionCache() {
  sessionCache.clear()
  inflight.clear()
}

export function getPreparedWorkPhotoSessionCacheStats() {
  return sessionCache.stats()
}
