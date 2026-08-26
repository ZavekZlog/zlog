/**
 * Phase D — saved-diary review display helpers (thumbnail-first + batch signing).
 *
 * Grid hydration signs ONLY:
 *   - thumbnail_path when present (Phase C)
 *   - canonical url when thumbnail_path is null (legacy)
 *
 * Phase C report.jpg is NOT signed during grid hydrate.
 * Viewer resolves the report asset on demand and caches it for the session.
 *
 * Never place a private storage path in <img src>.
 */

/** Soft chunk size for createSignedUrls — keeps payloads moderate on large diaries. */
export const PHOTO_DISPLAY_SIGN_BATCH_SIZE = 100

/** Legacy full-size tiles: only the first N (global order) are eager. */
export const LEGACY_REVIEW_EAGER_COUNT = 12

/** Moderate diary: all durable thumbs may be eager. */
export const MODERATE_DIARY_PHOTO_COUNT = 40

/**
 * True when the string is safe to assign to <img src> in a browser.
 * @param {unknown} src
 */
export function isBrowserDisplaySrc(src) {
  const s = String(src || '').trim()
  if (!s) return false
  return /^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')
}

/**
 * Classify whether the grid will prefer a durable thumbnail asset.
 * @param {object} photo
 */
export function usesDurableThumbnailForGrid(photo = {}) {
  return Boolean(String(photo.thumbnailPath || photo.thumbnail_path || '').trim())
}

/**
 * Storage path used for the saved-review grid tile.
 * Phase C → thumbnail_path; legacy → canonical url.
 * @param {object} photo
 */
export function gridDisplayStoragePath(photo = {}) {
  const thumb = String(photo.thumbnailPath || photo.thumbnail_path || '').trim()
  if (thumb) return thumb
  return String(photo.storagePath || photo.url || photo.imageUrl || '').trim() || null
}

/**
 * Canonical report storage path for full viewer (never the thumb).
 * @param {object} photo
 */
export function reportStoragePath(photo = {}) {
  return String(photo.storagePath || photo.url || photo.imageUrl || '').trim() || null
}

/**
 * Grid / review tile display source — browser-safe only.
 * Prefer signed thumbnailPreview; fall back to signed/local preview.
 * @param {object} photo
 */
export function gridImageSrc(photo = {}) {
  const candidates = [photo.thumbnailPreview, photo.preview]
  for (const candidate of candidates) {
    if (isBrowserDisplaySrc(candidate)) return String(candidate).trim()
  }
  if (isBrowserDisplaySrc(photo.imageUrl)) return String(photo.imageUrl).trim()
  return ''
}

/**
 * Full viewer source — canonical report (or local blob), never the 512px thumb.
 * @param {object} photo
 */
export function viewerImageSrc(photo = {}) {
  if (isBrowserDisplaySrc(photo.preview)) return String(photo.preview).trim()
  if (isBrowserDisplaySrc(photo.imageUrl)) return String(photo.imageUrl).trim()
  return ''
}

/**
 * Eager/lazy policy for saved-review tiles.
 * Durable thumbs: eager (always for moderate diaries; always preferred when tiny).
 * Legacy full-size: only first LEGACY_REVIEW_EAGER_COUNT by global index.
 *
 * @param {object} photo
 * @param {number} globalIndex
 * @param {{ photoCount?: number, legacyEagerCount?: number, moderateMax?: number }} [opts]
 */
export function shouldEagerLoadSavedReviewThumb(photo, globalIndex, opts = {}) {
  const legacyEager = Number.isFinite(Number(opts.legacyEagerCount))
    ? Number(opts.legacyEagerCount)
    : LEGACY_REVIEW_EAGER_COUNT
  if (usesDurableThumbnailForGrid(photo)) {
    // Tiny 512px assets — do not leave them lazy merely because index > 12.
    return true
  }
  return Number(globalIndex) < legacyEager
}

/** @deprecated use gridDisplayStoragePath */
export function gridThumbnailStoragePath(photo) {
  return gridDisplayStoragePath(photo)
}

/**
 * Deduplicate paths while preserving first-seen order.
 * @param {string[]} paths
 */
export function dedupeStoragePaths(paths = []) {
  const out = []
  const seen = new Set()
  for (const raw of paths) {
    const key = String(raw || '').trim()
    if (!key || isBrowserDisplaySrc(key) || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/**
 * Chunk an array for bounded batch signing.
 * @template T
 * @param {T[]} items
 * @param {number} size
 */
export function chunkPaths(items, size = PHOTO_DISPLAY_SIGN_BATCH_SIZE) {
  const list = Array.isArray(items) ? items : []
  const n = Math.max(1, Number(size) || PHOTO_DISPLAY_SIGN_BATCH_SIZE)
  const chunks = []
  for (let i = 0; i < list.length; i += n) chunks.push(list.slice(i, i + n))
  return chunks
}

/**
 * Normalize createSignedUrls / createSignedUrl results into path → url map.
 * Supports per-item errors without discarding siblings.
 * @param {Array<{ path?: string|null, signedUrl?: string|null, signedURL?: string|null, error?: unknown }>|null|undefined} rows
 * @param {string[]} [requestedPaths]
 */
export function mapSignedUrlResults(rows, requestedPaths = []) {
  const out = new Map()
  const list = Array.isArray(rows) ? rows : []
  list.forEach((row, index) => {
    const path = String(row?.path || requestedPaths[index] || '').trim()
    if (!path) return
    if (row?.error) return
    const url = row?.signedUrl || row?.signedURL || null
    if (isBrowserDisplaySrc(url)) out.set(path, String(url).trim())
  })
  return out
}

/**
 * Session-scoped photo display signing (memo + batch + on-demand single).
 *
 * @param {{
 *   batchSignPaths: (paths: string[], expiresIn?: number) => Promise<Array<object>|null>,
 *   singleSignPath?: (path: string) => Promise<string|null>,
 *   expiresIn?: number,
 *   batchSize?: number,
 * }} opts
 */
export function createPhotoDisplaySignSession(opts = {}) {
  const cache = new Map()
  const expiresIn = Number(opts.expiresIn) > 0 ? Number(opts.expiresIn) : 3600
  const batchSize = Number(opts.batchSize) > 0 ? Number(opts.batchSize) : PHOTO_DISPLAY_SIGN_BATCH_SIZE
  const batchSignPaths = opts.batchSignPaths
  const singleSignPath = opts.singleSignPath
  let batchApiCalls = 0
  let singleApiCalls = 0

  function peek(path) {
    const key = String(path || '').trim()
    if (!key) return null
    if (isBrowserDisplaySrc(key)) return key
    const hit = cache.get(key)
    return hit && typeof hit.then !== 'function' ? hit : null
  }

  async function resolveOne(path) {
    const key = String(path || '').trim()
    if (!key) return null
    if (isBrowserDisplaySrc(key)) return key
    if (cache.has(key)) {
      const hit = cache.get(key)
      if (hit && typeof hit.then === 'function') return hit
      if (isBrowserDisplaySrc(hit)) return hit
      // Prior null failure — allow a fresh single-sign attempt below.
    }

    const pending = (async () => {
      if (typeof singleSignPath === 'function') {
        singleApiCalls += 1
        const url = await singleSignPath(key)
        return isBrowserDisplaySrc(url) ? String(url).trim() : null
      }
      if (typeof batchSignPaths !== 'function') return null
      batchApiCalls += 1
      const rows = await batchSignPaths([key], expiresIn)
      const mapped = mapSignedUrlResults(rows, [key])
      return mapped.get(key) || null
    })().catch(() => null)

    cache.set(key, pending)
    const resolved = await pending
    cache.set(key, resolved)
    return resolved
  }

  /**
   * Batch-sign many paths; merge into session cache. Per-item failures stay null.
   * @param {string[]} paths
   */
  async function resolveMany(paths) {
    const needed = dedupeStoragePaths(paths).filter((p) => {
      if (!cache.has(p)) return true
      const hit = cache.get(p)
      if (hit && typeof hit.then === 'function') return false
      return !isBrowserDisplaySrc(hit)
    })
    if (!needed.length) {
      const out = new Map()
      for (const p of dedupeStoragePaths(paths)) {
        const v = await Promise.resolve(cache.get(p))
        if (isBrowserDisplaySrc(v)) out.set(p, v)
      }
      return out
    }

    if (typeof batchSignPaths !== 'function') {
      const out = new Map()
      for (const p of needed) {
        const url = await resolveOne(p)
        if (url) out.set(p, url)
      }
      return out
    }

    for (const chunk of chunkPaths(needed, batchSize)) {
      batchApiCalls += 1
      let rows = null
      try {
        rows = await batchSignPaths(chunk, expiresIn)
      } catch {
        rows = null
      }
      const mapped = mapSignedUrlResults(rows, chunk)
      for (const path of chunk) {
        const url = mapped.get(path) || null
        if (url) cache.set(path, url)
        else cache.delete(path)
      }
      // Fallback: any missing path may retry once via single sign if available.
      if (typeof singleSignPath === 'function') {
        for (const path of chunk) {
          if (isBrowserDisplaySrc(cache.get(path))) continue
          const url = await resolveOne(path)
          if (url) cache.set(path, url)
        }
      }
    }

    const out = new Map()
    for (const p of dedupeStoragePaths(paths)) {
      const v = cache.get(p)
      const resolved = v && typeof v.then === 'function' ? await v : v
      if (isBrowserDisplaySrc(resolved)) out.set(p, resolved)
    }
    return out
  }

  return {
    peek,
    resolveOne,
    resolveMany,
    /** @returns {{ batchApiCalls: number, singleApiCalls: number, cachedPaths: number }} */
    stats() {
      return {
        batchApiCalls,
        singleApiCalls,
        cachedPaths: cache.size,
      }
    },
  }
}

/**
 * Collect grid-only display paths for a diary photo list.
 * Phase C contributes thumbnail_path only; legacy contributes canonical url.
 * @param {object[]} rows
 */
export function collectGridDisplayPaths(rows = []) {
  const paths = []
  let thumbPaths = 0
  let legacyPaths = 0
  for (const row of rows || []) {
    const thumb = String(row.thumbnail_path || row.thumbnailPath || '').trim()
    const report = String(row.url || row.storagePath || '').trim()
    if (thumb) {
      paths.push(thumb)
      thumbPaths += 1
    } else if (report) {
      paths.push(report)
      legacyPaths += 1
    }
  }
  return {
    paths: dedupeStoragePaths(paths),
    thumbPathCount: thumbPaths,
    legacyPathCount: legacyPaths,
  }
}

/**
 * Grid hydration: batch-sign display paths only (thumb OR legacy url).
 * Does NOT sign Phase C report.jpg.
 *
 * @param {object[]} rows
 * @param {{
 *   session: ReturnType<typeof createPhotoDisplaySignSession>,
 *   mapRow?: (row: object, index: number, signed: { preview: string|null, thumbnailPreview: string|null, overlayPreview: string|null }) => object,
 * }} opts
 */
export async function signSavedPhotoGridRows(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : []
  const session = opts.session
  if (!session || typeof session.resolveMany !== 'function') {
    throw new Error('signSavedPhotoGridRows requires a photo display sign session')
  }
  const mapRow = typeof opts.mapRow === 'function' ? opts.mapRow : null

  const collected = collectGridDisplayPaths(list)
  // Overlays are not required for grid tiles; keep hydrate lean.
  const started = typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()

  const signedMap = await session.resolveMany(collected.paths)

  let thumbSigned = 0
  let legacySigned = 0
  const phaseCReportPathsInGridBatch = collected.paths.filter((p) =>
    /\/photos\/[^/]+\/report\.jpg$/i.test(p),
  ).length

  const signed = list.map((row, index) => {
    const thumbPath = String(row.thumbnail_path || row.thumbnailPath || '').trim()
    const reportPath = String(row.url || row.storagePath || '').trim()
    let thumbnailPreview = null
    let preview = null

    if (thumbPath) {
      thumbnailPreview = signedMap.get(thumbPath) || null
      if (thumbnailPreview) thumbSigned += 1
    } else if (reportPath) {
      preview = signedMap.get(reportPath) || null
      if (preview) legacySigned += 1
    }

    const payload = {
      preview,
      thumbnailPreview,
      overlayPreview: null,
    }
    return mapRow ? mapRow(row, index, payload) : { ...row, ...payload }
  })

  // Per-item thumb failure → controlled single-path fallback to report for THAT row only.
  for (let i = 0; i < signed.length; i += 1) {
    const row = list[i]
    const thumbPath = String(row.thumbnail_path || row.thumbnailPath || '').trim()
    const reportPath = String(row.url || row.storagePath || '').trim()
    if (!thumbPath || signed[i].thumbnailPreview || !reportPath) continue
    const fallback = await session.resolveOne(reportPath)
    if (!fallback) continue
    signed[i] = {
      ...signed[i],
      preview: fallback,
      thumbnailPreview: null,
    }
    legacySigned += 1
  }

  if (process.env.NODE_ENV !== 'production') {
    const ended = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()
    const stats = session.stats?.() || {}
    console.info('[zlog:photo-display] Phase D grid hydrate (thumb-first batch)', {
      photos: list.length,
      gridDisplayPaths: collected.paths.length,
      thumbnailPaths: collected.thumbPathCount,
      legacyCanonicalPaths: collected.legacyPathCount,
      thumbSigned,
      legacySigned,
      phaseCReportPathsInGridBatch,
      batchApiCalls: stats.batchApiCalls,
      singleApiCalls: stats.singleApiCalls,
      durationMs: Math.round(ended - started),
    })
  }

  return signed
}

/**
 * @deprecated Prefer signSavedPhotoGridRows + createPhotoDisplaySignSession.
 * Kept as a thin adapter for older call sites during Phase D correction.
 */
export async function signSavedPhotoDisplayRows(rows, opts = {}) {
  const signPath = opts.signPath
  const batchSignPaths = opts.batchSignPaths
  const session = createPhotoDisplaySignSession({
    batchSignPaths: batchSignPaths || (typeof signPath === 'function'
      ? async (paths) => {
          const out = []
          for (const path of paths) {
            const url = await signPath(path)
            out.push({ path, signedUrl: url, error: url ? null : 'sign-failed' })
          }
          return out
        }
      : null),
    singleSignPath: typeof signPath === 'function' ? signPath : null,
  })
  return signSavedPhotoGridRows(rows, { session, mapRow: opts.mapRow })
}

/**
 * Ensure a photo has a browser-safe report preview for the viewer.
 * Signs report path on demand; never returns the thumbnail URL.
 *
 * @param {object} photo
 * @param {{ session: ReturnType<typeof createPhotoDisplaySignSession> }} opts
 */
export async function ensureViewerReportPreview(photo, opts = {}) {
  const existing = viewerImageSrc(photo)
  if (existing) return existing
  const session = opts.session
  const path = reportStoragePath(photo)
  if (!session || !path) return ''
  const url = await session.resolveOne(path)
  return isBrowserDisplaySrc(url) ? url : ''
}

// Back-compat export name used by earlier Phase D wiring.
export const PHOTO_DISPLAY_SIGN_CONCURRENCY = 4
export const SAVED_REVIEW_EAGER_THUMB_COUNT = LEGACY_REVIEW_EAGER_COUNT
