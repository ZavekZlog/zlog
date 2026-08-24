/**
 * Prepare Site Diary photo rows for DiaryPdfDocument.
 *
 * Bounded concurrency for independent photo bake (Android-safe).
 * Reuses in-memory baked data URLs for unchanged photo+rotation keys.
 * Does not change orientation, crop, aspect, captions, order, or PDF layout.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'
import { orientedImageToDataUrlForPdf } from './image-orientation.js'
import { applyRotationToImageSrc } from './photo-rotation.js'
import { photoTileAssignedTo, photoTileCaption } from './photo-schedule.js'

/** Android-safe bound — never unbounded parallel decode/scale. */
export const PDF_PHOTO_PREPARE_CONCURRENCY = 2

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
async function flattenPhotoSrcForPdf(src) {
  const blob = await blobFromPhotoSrc(src)
  const baked = await orientedImageToDataUrlForPdf(blob, 2400, 0.92)
  return baked.dataUrl
}

function photoBakeCacheKey(baseSrc, rotationDegrees) {
  return `${String(baseSrc)}::${Number(rotationDegrees) || 0}::2400::0.92`
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
 */
export async function buildDiaryPdfPhotos(photos = [], resolveSrc) {
  const list = Array.isArray(photos) ? photos : []
  const concurrency = Math.min(PDF_PHOTO_PREPARE_CONCURRENCY, Math.max(1, list.length || 1))

  const prepared = await mapWithConcurrency(list, concurrency, async (photo, i) => {
    const baseSrc = await resolveSrc(photo)
    if (!baseSrc) return null

    const rotationDegrees = normalizeRotationDegrees(
      photo.rotationDegrees ?? photo.rotation_degrees,
    )
    const cacheKey = photoBakeCacheKey(baseSrc, rotationDegrees)
    let src = bakedPhotoSrcCache.get(cacheKey) || null
    if (!src) {
      if (typeof document !== 'undefined') {
        src = await flattenPhotoSrcForPdf(baseSrc)
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

    const assignedTo = photoTileAssignedTo(photo)
    return {
      key: photo.id || photo.key || photo.url,
      src,
      preview: src,
      url: photo.url || null,
      caption: photoTileCaption(photo),
      acceptedDescription: photo.acceptedDescription || photo.caption || '',
      assignedTo,
      assigned_to: assignedTo || null,
      layout: photo.layout || 'grid4',
      sequence_number: photo.sequence_number ?? photo.sequence ?? i + 1,
      rotationDegrees,
    }
  })

  const out = []
  for (const row of prepared) {
    if (row) out.push(row)
  }
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].sequence_number == null) out[i].sequence_number = i + 1
  }
  return out
}
