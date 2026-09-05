/**
 * Prepare Site Diary photo rows for DiaryPdfDocument.
 *
 * Bounded concurrency for independent photo bake (Android-safe).
 * Reuses in-memory baked data URLs for unchanged photo+rotation keys.
 * Does not change orientation, crop, aspect, captions, order, or PDF layout.
 *
 * Completeness gate: every expected work photo must prepare with a usable
 * source. Silent omission is forbidden — callers must abort Report Ready.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'
import { orientedImageToDataUrlForPdf } from './image-orientation.js'
import { applyRotationToImageSrc } from './photo-rotation.js'
import { photoTileAssignedTo, photoTileCaption } from './photo-schedule.js'
import {
  isDirectlyUsablePdfSource,
  pdfSourceNeedsStorageSign,
} from './diary-share-pdf-assets.js'
import { coverBlobToPdfDataUrl } from './diary-cover-photo.js'
import { isPreparedWorkPhotoForPdfPassThrough } from './photo-workspace/persist-prepared-photo.js'
import { dedupeStoragePaths } from './photo-workspace/thumbnail-display.js'
import {
  getPreparedWorkPhotoSessionCacheStats,
  hasPreparedWorkPhotoSessionSource,
  joinPreparedWorkPhotoSessionFetch,
  lookupPreparedWorkPhotoSessionBlob,
  peekPreparedWorkPhotoSessionInflight,
  preparedWorkPhotoSessionCacheKey,
  storePreparedWorkPhotoSessionBlob,
} from './diary-pdf-prepared-photo-session-cache.js'
import {
  bumpShareTimingCountSilent,
  accumulateShareTimingMs,
  shareTimingNow,
  markShareTiming,
  flushShareTimingSnapshot,
  patchShareTimingCounts,
  beginPdfPhotoFetch,
  endPdfPhotoFetch,
  recordPdfPhotoFetchSample,
  publishPdfPhotoFetchSummary,
} from './diary-share-timing-diag.js'

/** Android-safe bound — never unbounded parallel decode/scale. */
export const PDF_PHOTO_PREPARE_CONCURRENCY = 9

/** Work-photo JPEG quality — unchanged from prior flat 2400 bake. */
const PDF_PHOTO_JPEG_QUALITY = 0.92

export const DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE =
  'We couldn’t include every photo in the PDF. Check your connection and try Share again.'

/**
 * Stable identity for PDF completeness — storage path / url preferred.
 * @param {Record<string, unknown>|null|undefined} photo
 */
export function diaryPdfPhotoIdentity(photo) {
  if (!photo || typeof photo !== 'object') return null
  const raw = photo.url ?? photo.storagePath ?? photo.key ?? photo.id ?? null
  if (raw == null) return null
  const id = String(raw).trim()
  return id || null
}

/**
 * True when a prepared PDF image source can be embedded.
 * @param {unknown} src
 */
export function isUsableDiaryPdfPhotoSrc(src) {
  if (typeof src !== 'string') return false
  const value = src.trim()
  if (!value) return false
  return (
    value.startsWith('data:image/')
    || /^https?:\/\//i.test(value)
    || value.startsWith('blob:')
  )
}

/**
 * Identity/set completeness gate for work photos in a Site Diary PDF.
 * Order-aligned: a duplicate prepared identity cannot replace a missing expected photo.
 *
 * @param {{
 *   expected?: Array<Record<string, unknown>>,
 *   prepared?: Array<Record<string, unknown>|null|undefined>,
 * }} input
 */
export function assertDiaryPdfPhotosComplete({ expected = [], prepared = [] } = {}) {
  const expectedList = Array.isArray(expected) ? expected : []
  const preparedList = Array.isArray(prepared) ? prepared : []
  const failures = []
  const expectedIds = []
  const preparedIds = []

  for (let i = 0; i < expectedList.length; i += 1) {
    const expectedId = diaryPdfPhotoIdentity(expectedList[i])
    if (!expectedId) {
      failures.push({
        index: i,
        photoId: null,
        storagePath: null,
        reason: 'expected-photo-missing-identity',
      })
      continue
    }
    expectedIds.push(expectedId)

    const row = preparedList[i]
    if (row == null || row.__failure) {
      failures.push({
        index: i,
        photoId: expectedId,
        storagePath: expectedList[i]?.url || expectedList[i]?.storagePath || expectedId,
        reason: row?.__failure?.reason || 'photo-skipped',
        detail: row?.__failure?.detail || null,
      })
      continue
    }

    if (!isUsableDiaryPdfPhotoSrc(row.src)) {
      failures.push({
        index: i,
        photoId: expectedId,
        storagePath: row.url || expectedList[i]?.url || expectedId,
        reason: 'unusable-photo-source',
      })
      continue
    }

    const preparedId = diaryPdfPhotoIdentity(row) || expectedId
    if (preparedId !== expectedId) {
      failures.push({
        index: i,
        photoId: expectedId,
        storagePath: expectedId,
        preparedId,
        reason: 'identity-mismatch',
      })
      continue
    }

    preparedIds.push(preparedId)
  }

  if (failures.length === 0 && preparedList.length !== expectedList.length) {
    failures.push({
      index: null,
      photoId: null,
      storagePath: null,
      reason: 'count-mismatch',
      expectedCount: expectedList.length,
      preparedCount: preparedList.length,
    })
  }

  // Multiset check: duplicates in prepared cannot hide a missing expected id.
  if (failures.length === 0) {
    const expectedBag = new Map()
    for (const id of expectedIds) {
      expectedBag.set(id, (expectedBag.get(id) || 0) + 1)
    }
    const preparedBag = new Map()
    for (const id of preparedIds) {
      preparedBag.set(id, (preparedBag.get(id) || 0) + 1)
    }
    for (const [id, count] of expectedBag) {
      if ((preparedBag.get(id) || 0) !== count) {
        failures.push({
          index: expectedIds.indexOf(id),
          photoId: id,
          storagePath: id,
          reason: 'identity-set-mismatch',
          expectedCount: count,
          preparedCount: preparedBag.get(id) || 0,
        })
      }
    }
    for (const [id, count] of preparedBag) {
      if (!expectedBag.has(id)) {
        failures.push({
          index: preparedIds.indexOf(id),
          photoId: id,
          storagePath: id,
          reason: 'unexpected-prepared-photo',
          preparedCount: count,
        })
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    expectedIds,
    preparedIds,
    expectedCount: expectedList.length,
    preparedCount: preparedIds.length,
  }
}

export class DiaryPdfPhotosIncompleteError extends Error {
  /**
   * @param {string} message
   * @param {ReturnType<typeof assertDiaryPdfPhotosComplete>} gate
   */
  constructor(message, gate) {
    super(message)
    this.name = 'DiaryPdfPhotosIncompleteError'
    this.gate = gate
  }
}

/**
 * Layout-aware longest-edge cap for work/progress photos.
 * Cover photo baking stays at 2400 in diary-share (uprightCoverSrcForPdf).
 */
export function pdfWorkPhotoMaxEdgeForLayout(layout) {
  const key = String(layout || 'grid4').toLowerCase()
  if (key === 'full') return 2200
  if (key === 'grid6') return 1000
  return 1200
}

/** @type {Map<string, string>} */
const bakedPhotoSrcCache = new Map()
const BAKED_PHOTO_CACHE_MAX = 48

async function blobFromPhotoSrc(src) {
  beginPdfPhotoFetch()
  const fetchStarted = shareTimingNow()
  try {
    const res = await fetch(String(src))
    if (!res.ok) throw new Error('Could not download photo for the PDF.')
    const blob = await res.blob()
    if (!blob?.size) throw new Error('Photo for the PDF was empty.')
    recordPdfPhotoFetchSample({
      ms: shareTimingNow() - fetchStarted,
      bytes: blob.size,
    })
    return blob
  } finally {
    endPdfPhotoFetch()
  }
}

/**
 * Flatten work/progress photo pixels for @react-pdf (same path as cover bake).
 * Browser/app visual orientation is baked into JPEG before react-pdf embed.
 */
async function flattenPhotoSrcForPdf(src, maxEdge, sourceBlob = null) {
  let blob = sourceBlob instanceof Blob && sourceBlob.size ? sourceBlob : null
  if (!blob) {
    const fetchStarted = shareTimingNow()
    blob = await blobFromPhotoSrc(src)
    accumulateShareTimingMs('pdfFetchAccumMs', shareTimingNow() - fetchStarted)
    bumpShareTimingCountSilent('photoNetworkFetchCount')
  }
  const bakeStarted = shareTimingNow()
  const baked = await orientedImageToDataUrlForPdf(blob, maxEdge, PDF_PHOTO_JPEG_QUALITY)
  const bakeMs = shareTimingNow() - bakeStarted
  accumulateShareTimingMs('pdfBakeAccumMs', bakeMs)
  if (sourceBlob instanceof Blob && sourceBlob.size) {
    accumulateShareTimingMs('pdfLocalBakeAccumMs', bakeMs)
  }
  return baked.dataUrl
}

function photoBakeCacheKey(baseSrc, rotationDegrees, maxEdge) {
  return `${String(baseSrc)}::${Number(rotationDegrees) || 0}::${maxEdge}::${PDF_PHOTO_JPEG_QUALITY}`
}

function rememberBakedSrc(key, src) {
  if (!key || !src) return
  if (bakedPhotoSrcCache.has(key)) bakedPhotoSrcCache.delete(key)
  bakedPhotoSrcCache.set(key, src)
  while (bakedPhotoSrcCache.size > BAKED_PHOTO_CACHE_MAX) {
    const oldest = bakedPhotoSrcCache.keys().next().value
    bakedPhotoSrcCache.delete(oldest)
  }
}

/**
 * Run async workers over items with a fixed concurrency limit.
 * Results preserve input order.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : []
  const limit = Math.max(1, Math.min(concurrency, list.length || 1))
  const results = new Array(list.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(list[index], index)
    }
  }

  const runners = []
  for (let i = 0; i < limit; i += 1) {
    runners.push(runWorker())
  }
  await Promise.all(runners)
  return results
}

function pdfPhotoSourcePath(photo) {
  if (!photo || photo.url == null || photo.url === '') return null
  return String(photo.url)
}

function collectPdfPhotoSignableStoragePaths(photos = [], localByPath = new Map()) {
  const raw = []
  for (const photo of photos) {
    const path = pdfPhotoSourcePath(photo)
    if (!pdfSourceNeedsStorageSign(path)) continue
    if (lookupLocalPreparedBlob(localByPath, path)) continue
    if (hasPreparedWorkPhotoSessionSource(photo)) continue
    raw.push(path)
  }
  return dedupeStoragePaths(raw)
}

function normalizeLocalPreparedPhotoSources(input) {
  const out = new Map()
  if (!input) return out
  const entries = input instanceof Map ? input.entries() : Object.entries(input)
  for (const [rawPath, blob] of entries) {
    const path = String(rawPath || '').trim()
    if (!path || !(blob instanceof Blob) || blob.size < 1) continue
    out.set(path, blob)
  }
  return out
}

function lookupLocalPreparedBlob(localByPath, path) {
  if (!path || !(localByPath instanceof Map) || localByPath.size === 0) return null
  const blob = localByPath.get(path) || localByPath.get(String(path).trim())
  if (blob instanceof Blob && blob.size > 0) return blob
  return null
}

function normalizeBatchSignResult(result) {
  if (result instanceof Map) {
    return { urlByPath: result, batchRequestCount: 1 }
  }
  const urlByPath = result?.urlByPath instanceof Map ? result.urlByPath : new Map()
  const n = Number(result?.batchRequestCount)
  return {
    urlByPath,
    batchRequestCount: Number.isFinite(n) && n >= 0 ? n : 1,
  }
}

function lookupBatchSignedUrl(signedByPath, path) {
  if (!path || !(signedByPath instanceof Map)) return null
  return signedByPath.get(path) || signedByPath.get(String(path).trim()) || null
}

function rememberPreparedSessionBlob(photo, blob) {
  const beforeEvict = getPreparedWorkPhotoSessionCacheStats().evictCount
  const stored = storePreparedWorkPhotoSessionBlob(photo, blob)
  if (!stored) return
  bumpShareTimingCountSilent('photoSessionBlobCacheStoreCount')
  const evicted = Math.max(0, getPreparedWorkPhotoSessionCacheStats().evictCount - beforeEvict)
  if (evicted) bumpShareTimingCountSilent('photoSessionBlobCacheEvictCount', evicted)
}

/**
 * Build PDF photo rows from saved report_photos (EXIF flatten + UI rotation baked into src).
 * Fails closed when any expected photo cannot be prepared — never silently omits.
 *
 * Optional `options.batchSignStoragePaths` signs signable storage paths once
 * before fetch/bake. Fetch/decode/bake concurrency stays PDF_PHOTO_PREPARE_CONCURRENCY.
 * Optional `options.localPreparedPhotoSources` maps canonical report.jpg path → Blob.
 * Same-tab prepared report Blobs are reused by path+processing_version+byte size
 * after local sources, before batch sign / network fetch.
 *
 * @param {Array<Record<string, unknown>>} photos
 * @param {(photo: Record<string, unknown>) => Promise<string|null|undefined>} resolveSrc
 * @param {{
 *   batchSignStoragePaths?: (paths: string[]) => Promise<Map<string, string>|{ urlByPath?: Map<string, string>, batchRequestCount?: number }>,
 *   localPreparedPhotoSources?: Map<string, Blob>|Record<string, Blob>|null,
 * }} [options]
 */
export async function buildDiaryPdfPhotos(photos = [], resolveSrc, options = {}) {
  const list = Array.isArray(photos) ? photos : []
  const concurrency = Math.min(PDF_PHOTO_PREPARE_CONCURRENCY, Math.max(1, list.length || 1))
  markShareTiming('pdf_photos_prep_start')

  const localByPath = normalizeLocalPreparedPhotoSources(options?.localPreparedPhotoSources)
  const signablePaths = collectPdfPhotoSignableStoragePaths(list, localByPath)
  const signedByPath = new Map()
  let photoSignBatchRequestCount = 0
  const batchSignStoragePaths = options?.batchSignStoragePaths

  if (typeof batchSignStoragePaths === 'function' && signablePaths.length > 0) {
    const signStarted = shareTimingNow()
    try {
      const signed = normalizeBatchSignResult(await batchSignStoragePaths(signablePaths))
      photoSignBatchRequestCount = signed.batchRequestCount
      for (const [path, url] of signed.urlByPath) {
        if (!path || !url) continue
        signedByPath.set(path, url)
      }
    } catch {
      photoSignBatchRequestCount = Math.max(1, photoSignBatchRequestCount)
    }
    accumulateShareTimingMs('pdfSignAccumMs', shareTimingNow() - signStarted)
  }

  let pdfLocalBlobSourceCount = 0
  let pdfNetworkSourceCount = 0
  for (const photo of list) {
    if (lookupLocalPreparedBlob(localByPath, pdfPhotoSourcePath(photo))) {
      pdfLocalBlobSourceCount += 1
    } else if (hasPreparedWorkPhotoSessionSource(photo)) {
      /* session Blob or in-flight prewarm — excluded from network / sign */
    } else {
      pdfNetworkSourceCount += 1
    }
  }

  patchShareTimingCounts({
    photoSignPathCount: signablePaths.length,
    photoSignBatchRequestCount,
    photoIndividualSignRequestCount: 0,
    pdfLocalBlobSourceCount,
    pdfNetworkSourceCount,
    photoPrepareCount: 0,
    photoNetworkFetchCount: 0,
    photoPassThroughCount: 0,
    photoBakeCount: 0,
    photoSessionBlobCacheHitCount: 0,
    photoSessionBlobCacheMissCount: 0,
    photoSessionBlobCacheStoreCount: 0,
    photoSessionBlobCacheEvictCount: 0,
    photoSessionBlobCacheBytes: getPreparedWorkPhotoSessionCacheStats().bytes,
  })

  const prepared = await mapWithConcurrency(list, concurrency, async (photo, i) => {
    const identity = diaryPdfPhotoIdentity(photo)
    try {
      const path = pdfPhotoSourcePath(photo)
      const localBlob = lookupLocalPreparedBlob(localByPath, path)
      let sessionBlob = localBlob ? null : lookupPreparedWorkPhotoSessionBlob(photo)
      if (!localBlob && !sessionBlob) {
        const inflight = peekPreparedWorkPhotoSessionInflight(preparedWorkPhotoSessionCacheKey(photo))
        if (inflight) {
          try {
            const joined = await inflight
            if (joined instanceof Blob && joined.size > 0) sessionBlob = joined
          } catch {
            sessionBlob = null
          }
        }
      }
      if (!localBlob && sessionBlob) {
        bumpShareTimingCountSilent('photoSessionBlobCacheHitCount')
      } else if (!localBlob && !sessionBlob && preparedWorkPhotoSessionCacheKey(photo)) {
        bumpShareTimingCountSilent('photoSessionBlobCacheMissCount')
      }
      const sourceBlob = localBlob || sessionBlob
      let baseSrc = null
      if (sourceBlob) {
        baseSrc = path
      } else if (path && isDirectlyUsablePdfSource(path)) {
        baseSrc = path
      } else {
        const batched = lookupBatchSignedUrl(signedByPath, path)
        if (batched) {
          baseSrc = batched
        } else {
          const signStarted = shareTimingNow()
          baseSrc = await resolveSrc(photo)
          accumulateShareTimingMs('pdfSignAccumMs', shareTimingNow() - signStarted)
          if (pdfSourceNeedsStorageSign(path)) {
            bumpShareTimingCountSilent('photoIndividualSignRequestCount')
          }
        }
      }
      if (!baseSrc && !sourceBlob) {
        return {
          __failure: {
            reason: 'unusable-photo-source',
            detail: 'resolveSrc returned empty',
          },
          url: photo.url || null,
          key: identity,
          sequence_number: photo.sequence_number ?? photo.sequence ?? i + 1,
        }
      }

      const rotationDegrees = normalizeRotationDegrees(
        photo.rotationDegrees ?? photo.rotation_degrees,
      )
      const passThrough = isPreparedWorkPhotoForPdfPassThrough(photo, {
        hasLocalPreparedBlob: Boolean(localBlob),
      })
      const layout = photo.layout || 'grid4'
      const maxEdge = pdfWorkPhotoMaxEdgeForLayout(layout)
      let src = null
      let outRotation = rotationDegrees

      if (passThrough) {
        if (sourceBlob) {
          src = await coverBlobToPdfDataUrl(sourceBlob)
          if (localBlob) rememberPreparedSessionBlob(photo, localBlob)
        } else if (!baseSrc) {
          src = null
        } else if (typeof document !== 'undefined' && /^https?:\/\//i.test(String(baseSrc))) {
          const fetchStarted = shareTimingNow()
          const cacheKey = preparedWorkPhotoSessionCacheKey(photo)
          let usedPdfNetworkFetch = !cacheKey
          const blob = cacheKey
            ? await joinPreparedWorkPhotoSessionFetch(cacheKey, async () => {
                usedPdfNetworkFetch = true
                return blobFromPhotoSrc(baseSrc)
              })
            : await blobFromPhotoSrc(baseSrc)
          if (usedPdfNetworkFetch) {
            accumulateShareTimingMs('pdfFetchAccumMs', shareTimingNow() - fetchStarted)
            bumpShareTimingCountSilent('photoNetworkFetchCount')
            rememberPreparedSessionBlob(photo, blob)
          }
          src = await coverBlobToPdfDataUrl(blob)
        } else {
          src = baseSrc
        }
        bumpShareTimingCountSilent('photoPassThroughCount')
        bumpShareTimingCountSilent('photoPrepareCount')
        outRotation = 0
      } else {
        const cacheKey = localBlob
          ? null
          : photoBakeCacheKey(baseSrc, rotationDegrees, maxEdge)
        src = cacheKey ? bakedPhotoSrcCache.get(cacheKey) || null : null
        if (!src) {
          if (typeof document !== 'undefined') {
            src = await flattenPhotoSrcForPdf(baseSrc, maxEdge, localBlob)
            bumpShareTimingCountSilent('photoFetchBakeCount')
            bumpShareTimingCountSilent('photoPrepareCount')
            bumpShareTimingCountSilent('photoBakeCount')
            const flattenedSrc = src
            const rotateStarted = shareTimingNow()
            try {
              src = await applyRotationToImageSrc(src, rotationDegrees)
            } catch {
              src = flattenedSrc
            }
            accumulateShareTimingMs('pdfBakeAccumMs', shareTimingNow() - rotateStarted)
            if (cacheKey) rememberBakedSrc(cacheKey, src)
          } else if (localBlob) {
            src = `blob:zlog-local-prepared/${encodeURIComponent(path)}`
          } else {
            src = baseSrc
          }
        } else {
          bumpShareTimingCountSilent('photoCacheHitCount')
        }
      }

      if (!isUsableDiaryPdfPhotoSrc(src)) {
        return {
          __failure: {
            reason: 'unusable-photo-source',
            detail: 'prepared src was empty or unsupported',
          },
          url: photo.url || null,
          key: identity,
          sequence_number: photo.sequence_number ?? photo.sequence ?? i + 1,
        }
      }

      const assignedTo = photoTileAssignedTo(photo)
      const areaName = String(photo.location || photo.area || '').trim() || null
      return {
        key: identity || photo.id || photo.key || photo.url,
        src,
        preview: src,
        url: photo.url || null,
        caption: photoTileCaption(photo),
        acceptedDescription: photo.acceptedDescription || photo.caption || '',
        assignedTo,
        assigned_to: assignedTo || null,
        location: areaName,
        area: areaName,
        layout: photo.layout || 'grid4',
        sequence_number: photo.sequence_number ?? photo.sequence ?? i + 1,
        rotationDegrees: outRotation,
      }
    } catch (err) {
      return {
        __failure: {
          reason: 'photo-prepare-failed',
          detail: err?.message || String(err),
        },
        url: photo.url || null,
        key: identity,
        sequence_number: photo.sequence_number ?? photo.sequence ?? i + 1,
      }
    }
  })

  const gate = assertDiaryPdfPhotosComplete({ expected: list, prepared })
  if (!gate.ok) {
    throw new DiaryPdfPhotosIncompleteError(DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE, gate)
  }

  const out = []
  for (let i = 0; i < prepared.length; i += 1) {
    const row = prepared[i]
    out.push(row)
    if (out[i].sequence_number == null) out[i].sequence_number = i + 1
  }
  patchShareTimingCounts({
    photoSessionBlobCacheBytes: getPreparedWorkPhotoSessionCacheStats().bytes,
  })
  flushShareTimingSnapshot()
  publishPdfPhotoFetchSummary()
  return out
}
