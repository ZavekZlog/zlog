/**
 * Prepare Site Diary photo rows for DiaryPdfDocument.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'
import {
  orientedImageToDataUrlForPdf,
  PDF_PHOTO_PIPELINE_ID,
  readJpegExifOrientation,
} from './image-orientation.js'
import { applyRotationToImageSrc } from './photo-rotation.js'
import { photoTileAssignedTo, photoTileCaption } from './photo-schedule.js'
import { describeSrc, zlogPdfTrace } from './zlog-pdf-trace.js'

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
async function flattenPhotoSrcForPdf(src, meta = {}) {
  const photoIndex = meta.photoIndex ?? 0
  const photoKey = String(meta.photoKey || '')
  const sequence = meta.sequence ?? photoIndex + 1

  zlogPdfTrace('work-photo-bake-enter', {
    pipeline: PDF_PHOTO_PIPELINE_ID,
    photoIndex,
    photoKey,
    sequence,
    input: describeSrc(src),
  })

  const blob = await blobFromPhotoSrc(src)
  let exifOrientation = 1
  try {
    exifOrientation = await readJpegExifOrientation(blob)
  } catch {
    exifOrientation = 1
  }

  zlogPdfTrace('work-photo-source', {
    photoIndex,
    photoKey,
    sequence,
    exifOrientation,
    blobType: blob.type || '',
    blobSize: blob.size || 0,
  })

  const baked = await orientedImageToDataUrlForPdf(blob, 2400, 0.92)

  zlogPdfTrace('work-photo-bake-result', {
    pipeline: PDF_PHOTO_PIPELINE_ID,
    photoIndex,
    photoKey,
    sequence,
    sharedHelper: 'orientedImageToDataUrlForPdf',
    ran: true,
    exifOrientation: baked.orientation,
    decodeMode: baked.decodeMode,
    usedBrowserOrientation: baked.usedBrowserOrientation,
    flattenedWidth: baked.width,
    flattenedHeight: baked.height,
    transformApplied: 'none (browser-display flatten)',
    output: describeSrc(baked.dataUrl),
  })

  return baked.dataUrl
}

/**
 * Build PDF photo rows from saved report_photos (EXIF flatten + UI rotation baked into src).
 */
export async function buildDiaryPdfPhotos(photos = [], resolveSrc) {
  const list = Array.isArray(photos) ? photos : []
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const photo = list[i]
    const baseSrc = await resolveSrc(photo)
    if (!baseSrc) continue
    const rotationDegrees = normalizeRotationDegrees(
      photo.rotationDegrees ?? photo.rotation_degrees,
    )
    let src = baseSrc
    if (typeof document !== 'undefined') {
      try {
        src = await flattenPhotoSrcForPdf(baseSrc, {
          photoIndex: i,
          photoKey: photo.id || photo.key || photo.url,
          sequence: photo.sequence_number ?? photo.sequence ?? i + 1,
        })
      } catch (err) {
        zlogPdfTrace('work-photo-bake-fail', {
          photoIndex: i,
          photoKey: String(photo.id || photo.key || photo.url || ''),
          message: err?.message || String(err),
        })
        throw err
      }
    }
    const flattenedSrc = src
    try {
      src = await applyRotationToImageSrc(src, rotationDegrees)
      if (rotationDegrees && typeof document !== 'undefined') {
        zlogPdfTrace('work-photo-ui-rotation', {
          photoIndex: i,
          rotationDegrees,
        })
      }
    } catch {
      src = flattenedSrc
    }
    const assignedTo = photoTileAssignedTo(photo)
    out.push({
      key: photo.id || photo.key || photo.url,
      src,
      preview: src,
      url: photo.url || null,
      caption: photoTileCaption(photo),
      acceptedDescription: photo.acceptedDescription || photo.caption || '',
      assignedTo,
      assigned_to: assignedTo || null,
      layout: photo.layout || 'grid4',
      sequence_number: photo.sequence_number ?? photo.sequence ?? out.length + 1,
      rotationDegrees,
    })
  }
  return out
}
