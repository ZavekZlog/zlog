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

/** Android-safe bound — never unbounded parallel decode/scale. */
export const PDF_PHOTO_PREPARE_CONCURRENCY = 2

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
  const res = await fetch(String(src))
  if (!res.ok) throw new Error('Could not download photo for the PDF.')
  const blob = await res.blob()
  if (!blob?.size) throw new Error('Photo for the PDF was empty.')
  return blob
}

/**
 * Flatten work/progress photo pixels for @react-pdf (same path as cover bake).
 * Browser/app visual orientation is baked into JPEG before react-pdf embed.
 */
async function flattenPhotoSrcForPdf(src, maxEdge) {
  const blob = await blobFromPhotoSrc(src)
  const baked = await orientedImageToDataUrlForPdf(blob, maxEdge, PDF_PHOTO_JPEG_QUALITY)
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

/**
 * Build PDF photo rows from saved report_photos (EXIF flatten + UI rotation baked into src).
 * Fails closed when any expected photo cannot be prepared — never silently omits.
 */
export async function buildDiaryPdfPhotos(photos = [], resolveSrc) {
  const list = Array.isArray(photos) ? photos : []
  const concurrency = Math.min(PDF_PHOTO_PREPARE_CONCURRENCY, Math.max(1, list.length || 1))

  const prepared = await mapWithConcurrency(list, concurrency, async (photo, i) => {
    const identity = diaryPdfPhotoIdentity(photo)
    try {
      const baseSrc = await resolveSrc(photo)
      if (!baseSrc) {
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
      const layout = photo.layout || 'grid4'
      const maxEdge = pdfWorkPhotoMaxEdgeForLayout(layout)
      const cacheKey = photoBakeCacheKey(baseSrc, rotationDegrees, maxEdge)
      let src = bakedPhotoSrcCache.get(cacheKey) || null
      if (!src) {
        if (typeof document !== 'undefined') {
          src = await flattenPhotoSrcForPdf(baseSrc, maxEdge)
          const flattenedSrc = src
          try {
            src = await applyRotationToImageSrc(src, rotationDegrees)
          } catch {
            src = flattenedSrc
          }
          rememberBakedSrc(cacheKey, src)
        } else {
          src = baseSrc
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
        rotationDegrees,
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
  return out
}
