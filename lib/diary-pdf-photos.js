/**
 * Prepare Site Diary photo rows for DiaryPdfDocument.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'
import { applyRotationToImageSrc } from './photo-rotation.js'
import { photoTileAssignedTo, photoTileCaption } from './photo-schedule.js'

/**
 * Build PDF photo rows from saved report_photos (rotation baked into src when needed).
 */
export async function buildDiaryPdfPhotos(photos = [], resolveSrc) {
  const list = Array.isArray(photos) ? photos : []
  const out = []
  for (const photo of list) {
    const baseSrc = await resolveSrc(photo)
    if (!baseSrc) continue
    const rotationDegrees = normalizeRotationDegrees(
      photo.rotationDegrees ?? photo.rotation_degrees,
    )
    let src = baseSrc
    try {
      src = await applyRotationToImageSrc(baseSrc, rotationDegrees)
    } catch {
      src = baseSrc
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
