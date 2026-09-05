/**
 * Quiet same-tab prewarm of durable prepared PDF photo/cover Blobs.
 * Fills the existing session Blob caches before Save & Share.
 * Does not write Save & Share timing counters. Does not change PDF appearance.
 */

import { PDF_PHOTO_PREPARE_CONCURRENCY, mapWithConcurrency } from './diary-pdf-photos.js'
import {
  canonicalPreparedReportStoragePath,
  joinPreparedWorkPhotoSessionFetch,
  lookupPreparedWorkPhotoSessionBlob,
  peekPreparedWorkPhotoSessionInflight,
  preparedWorkPhotoSessionCacheKey,
  storePreparedWorkPhotoSessionBlob,
} from './diary-pdf-prepared-photo-session-cache.js'
import {
  joinPreparedCoverSessionFetch,
  lookupPreparedCoverSessionBlob,
  peekPreparedCoverSessionInflight,
  preparedCoverSessionCacheKey,
  storePreparedCoverSessionBlob,
} from './diary-cover-prepared-session-cache.js'
import { isPreparedCoverStoragePath } from './diary-cover-photo.js'
import { pdfSourceNeedsStorageSign } from './diary-share-pdf-assets.js'
import { SHADOW_PREPARE_STATUS } from './photo-workspace/shadow-ingest.js'

export const PDF_ASSET_PREWARM_CONCURRENCY = PDF_PHOTO_PREPARE_CONCURRENCY

function isCurrentGeneration(isCurrent) {
  if (typeof isCurrent !== 'function') return true
  try {
    return isCurrent() !== false
  } catch {
    return false
  }
}

function preparedPhotoIdentity(photo) {
  const url = String(photo?.url || photo?.storagePath || '').trim()
  return {
    url: url || null,
    processing_version: photo?.processing_version || photo?.processingVersion || null,
    report_byte_size: photo?.report_byte_size ?? photo?.reportByteSize ?? null,
    rotation_degrees: photo?.rotation_degrees ?? photo?.rotationDegrees ?? 0,
  }
}

function hasLocalReadyPreparedReportBlob(photo) {
  const sp = photo?.shadowPrepare
  if (!sp || sp.status !== SHADOW_PREPARE_STATUS.READY) return false
  const blob = sp.report?.blob
  return blob instanceof Blob && blob.size > 0
}

/**
 * Durable prepared report.jpg rows that the PDF session Blob cache can store.
 * Thumbs, legacy, wrong pipeline, and non-zero rotation are excluded.
 */
export function selectCacheablePreparedPdfPhotos(photos = []) {
  const out = []
  const seen = new Set()
  const list = Array.isArray(photos) ? photos : []
  for (const photo of list) {
    if (hasLocalReadyPreparedReportBlob(photo)) continue
    const identity = preparedPhotoIdentity(photo)
    if (!canonicalPreparedReportStoragePath(identity.url)) continue
    const key = preparedWorkPhotoSessionCacheKey(identity)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(identity)
  }
  return out
}

function normalizeBatchSignResult(result) {
  if (result instanceof Map) return result
  if (result?.urlByPath instanceof Map) return result.urlByPath
  return new Map()
}

async function quietFetchBlob(src, fetchBlob) {
  if (typeof fetchBlob === 'function') {
    const blob = await fetchBlob(src)
    if (!(blob instanceof Blob) || blob.size < 1) {
      throw new Error('Prepared PDF asset was empty.')
    }
    return blob
  }
  const res = await fetch(String(src))
  if (!res.ok) throw new Error('Could not download prepared PDF asset.')
  const blob = await res.blob()
  if (!(blob instanceof Blob) || blob.size < 1) {
    throw new Error('Prepared PDF asset was empty.')
  }
  return blob
}

async function prewarmPreparedWorkPhotos({
  photos = [],
  isCurrent,
  batchSignStoragePaths,
  fetchBlob,
  concurrency = PDF_ASSET_PREWARM_CONCURRENCY,
} = {}) {
  const selected = selectCacheablePreparedPdfPhotos(photos)
  if (!selected.length) return
  const pending = []
  for (const photo of selected) {
    if (lookupPreparedWorkPhotoSessionBlob(photo)) continue
    pending.push(photo)
  }
  if (!pending.length) return

  const needSign = []
  for (const photo of pending) {
    const key = preparedWorkPhotoSessionCacheKey(photo)
    if (peekPreparedWorkPhotoSessionInflight(key)) continue
    const path = photo.url
    if (pdfSourceNeedsStorageSign(path)) needSign.push(path)
  }

  const signedByPath = new Map()
  if (needSign.length && typeof batchSignStoragePaths === 'function') {
    try {
      const signed = normalizeBatchSignResult(await batchSignStoragePaths(needSign))
      for (const [path, url] of signed) {
        if (!path || !url) continue
        signedByPath.set(path, url)
        signedByPath.set(String(path).trim(), url)
      }
    } catch {
      /* signing failure is non-fatal; photos without a URL are skipped */
    }
  }

  const limit = Math.min(PDF_ASSET_PREWARM_CONCURRENCY, Math.max(1, Number(concurrency) || 1))
  await mapWithConcurrency(pending, limit, async (photo) => {
    const key = preparedWorkPhotoSessionCacheKey(photo)
    if (!key) return
    if (!isCurrentGeneration(isCurrent) && !peekPreparedWorkPhotoSessionInflight(key)) return
    if (lookupPreparedWorkPhotoSessionBlob(photo)) return
    const src = signedByPath.get(photo.url) || signedByPath.get(String(photo.url || '').trim()) || null
    const inflight = peekPreparedWorkPhotoSessionInflight(key)
    if (!inflight && !src) return
    try {
      const blob = await joinPreparedWorkPhotoSessionFetch(key, async () => {
        if (!src) throw new Error('Prepared photo prewarm has no signed URL.')
        return quietFetchBlob(src, fetchBlob)
      })
      storePreparedWorkPhotoSessionBlob(photo, blob)
    } catch {
      /* non-fatal — later PDF prepare may retry */
    }
  })
}

async function prewarmPreparedCover({
  coverPath = null,
  coverProcessingVersion = null,
  localPreparedCoverBlob = null,
  isCurrent,
  batchSignStoragePaths,
  fetchBlob,
} = {}) {
  if (localPreparedCoverBlob instanceof Blob && localPreparedCoverBlob.size > 0) return
  if (!isPreparedCoverStoragePath(coverPath)) return
  const identity = { coverPath, coverProcessingVersion }
  const key = preparedCoverSessionCacheKey(identity)
  if (!key) return
  if (lookupPreparedCoverSessionBlob(identity)) return
  if (!isCurrentGeneration(isCurrent) && !peekPreparedCoverSessionInflight(identity)) return

  let src = null
  if (!peekPreparedCoverSessionInflight(identity) && pdfSourceNeedsStorageSign(coverPath)
    && typeof batchSignStoragePaths === 'function') {
    try {
      const signed = normalizeBatchSignResult(await batchSignStoragePaths([coverPath]))
      src = signed.get(coverPath) || signed.get(String(coverPath).trim()) || null
    } catch {
      src = null
    }
  }
  const inflight = peekPreparedCoverSessionInflight(identity)
  if (!inflight && !src) return
  try {
    const blob = await joinPreparedCoverSessionFetch(identity, async () => {
      if (!src) throw new Error('Prepared cover prewarm has no signed URL.')
      return quietFetchBlob(src, fetchBlob)
    })
    storePreparedCoverSessionBlob(identity, blob)
  } catch {
    /* non-fatal */
  }
}

/**
 * Background prewarm. Never throws. Never navigates. Never writes timing counters.
 *
 * @param {{
 *   photos?: Array<Record<string, unknown>>,
 *   coverPath?: string|null,
 *   coverProcessingVersion?: string|null,
 *   localPreparedCoverBlob?: Blob|null,
 *   generation?: number,
 *   isCurrent?: () => boolean,
 *   batchSignStoragePaths?: (paths: string[]) => Promise<Map<string, string>|{ urlByPath?: Map<string, string> }>,
 *   fetchBlob?: (src: string) => Promise<Blob>,
 *   concurrency?: number,
 * }} [options]
 */
export async function prewarmDiaryPdfSessionAssets(options = {}) {
  try {
    await Promise.all([
      prewarmPreparedWorkPhotos(options),
      prewarmPreparedCover(options),
    ])
  } catch {
    /* swallow — workbench must stay usable */
  }
}
