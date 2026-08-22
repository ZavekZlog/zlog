/**
 * Prepare Site Diary photo rows for DiaryPdfDocument.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'
import { orientedImageToDataUrlForPdf } from './image-orientation.js'
import { applyRotationToImageSrc } from './photo-rotation.js'
import { photoTileAssignedTo, photoTileCaption } from './photo-schedule.js'

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
      src = await flattenPhotoSrcForPdf(baseSrc)
    }
    const flattenedSrc = src
    try {
      src = await applyRotationToImageSrc(src, rotationDegrees)
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
