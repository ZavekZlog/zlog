/**
 * Same-tab in-memory cache of persisted Attendance Register prepared JPEG Blobs.
 * Lost on full reload. Not IndexedDB. Not signed URLs. Not OCR payloads.
 *
 * Key: immutable daily_reports.sign_in_sheet_url storage path
 * (userId/reportId/sign-in-sheet/{generation}.jpg).
 */

import { isSafeSignInSheetCleanupPath } from './diary-sign-in-sheet-evidence.js'

/** A few concurrently opened diaries — one register per report. */
export const SESSION_SIGN_IN_SHEET_BLOB_MAX_ENTRIES = 8

/** Prepared register JPEGs (~0.5–4 MB at 1600-edge / q0.82). */
export const SESSION_SIGN_IN_SHEET_BLOB_MAX_BYTES = 24 * 1024 * 1024

/** Full-image GET must not hang silently in the Attendance evidence chrome. */
export const SIGN_IN_SHEET_EVIDENCE_FETCH_TIMEOUT_MS = 15_000

export function signInSheetSessionCacheKey(storagePath) {
  const raw = String(storagePath || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return null
  }
  return isSafeSignInSheetCleanupPath(raw) ? raw : null
}

export function createSignInSheetSessionCache({
  maxEntries = SESSION_SIGN_IN_SHEET_BLOB_MAX_ENTRIES,
  maxBytes = SESSION_SIGN_IN_SHEET_BLOB_MAX_BYTES,
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
    evict(key) {
      if (!key || !map.has(key)) return false
      const blob = map.get(key)
      map.delete(key)
      totalBytes = Math.max(0, totalBytes - (blob?.size || 0))
      return true
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

const sessionCache = createSignInSheetSessionCache()

/** @type {Map<string, Promise<Blob>>} */
const inflight = new Map()

export function lookupSignInSheetSessionBlob(storagePath) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key) return null
  return sessionCache.lookup(key)
}

export function storeSignInSheetSessionBlob(storagePath, blob) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key) return false
  return sessionCache.store(key, blob)
}

export function evictSignInSheetSessionEvidence(storagePath) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key) return false
  return sessionCache.evict(key)
}

export function peekSignInSheetSessionInflight(storagePath) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key) return null
  return inflight.get(key) || null
}

/**
 * Fetch prepared Attendance evidence with a hard abort ceiling (fetch + body).
 * @param {string} signedUrl
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function fetchSignInSheetEvidenceBlob(
  signedUrl,
  {
    fetch: fetchFn = globalThis.fetch,
    timeoutMs = SIGN_IN_SHEET_EVIDENCE_FETCH_TIMEOUT_MS,
  } = {},
) {
  const url = String(signedUrl || '').trim()
  if (!url) {
    throw new Error('sign-in-sheet-signed-url-failed')
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('sign-in-sheet-fetch-unavailable')
  }

  const ms = Number(timeoutMs)
  const controller = new AbortController()
  let timer
  if (Number.isFinite(ms) && ms > 0) {
    timer = setTimeout(() => {
      controller.abort()
    }, ms)
  }

  try {
    const res = await fetchFn(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`sign-in-sheet-fetch-failed:${res.status}`)
    }
    const blob = await res.blob()
    if (!(blob instanceof Blob) || blob.size < 1) {
      throw new Error('Sign-in sheet session fetch returned an empty blob.')
    }
    return blob
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      throw new Error('sign-in-sheet-fetch-timeout')
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function joinSignInSheetSessionFetch(storagePath, startFetch) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key || typeof startFetch !== 'function') {
    return Promise.reject(new Error('Sign-in sheet session fetch requires a cache key.'))
  }
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(() => startFetch())
    .then((blob) => {
      if (!(blob instanceof Blob) || blob.size < 1) {
        throw new Error('Sign-in sheet session fetch returned an empty blob.')
      }
      return blob
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

/**
 * Load prepared evidence: session cache hit, or one signed-URL fetch.
 * @returns {Promise<{ blob: Blob|null, cacheHit: boolean, networkFetchCount: number }>}
 */
export async function loadSignInSheetPreparedEvidence(
  storagePath,
  {
    signedUrlForPath,
    supabase,
    fetch: fetchFn = globalThis.fetch,
    /** @internal test hook — production omits (defaults to 15s) */
    evidenceFetchTimeoutMs,
  } = {},
) {
  const key = signInSheetSessionCacheKey(storagePath)
  if (!key) {
    throw new Error('sign-in-sheet-invalid-storage-path')
  }

  const cached = sessionCache.lookup(key)
  if (cached) {
    return { blob: cached, cacheHit: true, networkFetchCount: 0 }
  }

  let networkFetchCount = 0
  const blob = await joinSignInSheetSessionFetch(key, async () => {
    if (typeof signedUrlForPath !== 'function' || !supabase) {
      throw new Error('sign-in-sheet-signed-url-missing-deps')
    }
    const signedUrl = await signedUrlForPath(supabase, key)
    if (!signedUrl) {
      throw new Error('sign-in-sheet-signed-url-failed')
    }
    if (typeof fetchFn !== 'function') {
      throw new Error('sign-in-sheet-fetch-unavailable')
    }
    networkFetchCount += 1
    const timeoutMs =
      evidenceFetchTimeoutMs !== undefined
        ? evidenceFetchTimeoutMs
        : SIGN_IN_SHEET_EVIDENCE_FETCH_TIMEOUT_MS
    return fetchSignInSheetEvidenceBlob(signedUrl, { fetch: fetchFn, timeoutMs })
  })

  sessionCache.store(key, blob)
  return { blob, cacheHit: false, networkFetchCount }
}

export function rememberSignInSheetSessionEvidence(storagePath, blob) {
  return storeSignInSheetSessionBlob(storagePath, blob)
}

export function clearSignInSheetSessionCache() {
  sessionCache.clear()
  inflight.clear()
}

export function getSignInSheetSessionCacheStats() {
  return sessionCache.stats()
}
