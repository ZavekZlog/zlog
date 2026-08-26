/**
 * Final photo-schedule helpers for report generation.
 *
 * - Continuous Photo 1..N across the whole report
 * - Area boundaries come from each photo's persisted location (Location Walk /
 *   report_photos.location) via the same groupPhotosByArea reconstruction used
 *   by Edit/View — not a second guessed grouping
 * - Captions never include a separate timestamp field
 */

import { groupPhotosByArea } from './ai-annotation/area-groups.js'
import { paginatePdfPhotos } from './diary-pdf-layout.js'


function sequenceRank(photo) {
  const n = Number(photo?.sequence_number ?? photo?.sequence)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Area title for PDF grouping — persisted location / area name on the photo row.
 */
export function photoAreaName(photo) {
  if (!photo || typeof photo !== 'object') return 'Work photos'
  const raw = photo.location ?? photo.area ?? photo.areaName ?? ''
  const name = String(raw).trim()
  return name || 'Work photos'
}

/**
 * Stable report order: walk / sequence order so area boundaries stay intact.
 */
export function orderPhotosForReport(photos = []) {
  const list = Array.isArray(photos) ? photos : []
  return list
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const seqDiff = sequenceRank(a.photo) - sequenceRank(b.photo)
      if (seqDiff !== 0) return seqDiff
      return a.index - b.index
    })
    .map(({ photo }) => photo)
}

/**
 * Assign continuous reportPhotoNumber (1..N) at generation time.
 */
export function assignReportPhotoNumbers(photos = []) {
  return orderPhotosForReport(photos).map((photo, index) => ({
    ...photo,
    reportPhotoNumber: index + 1,
  }))
}

/** Display label: "Photo 1", "Photo 2", … */
export function photoReferenceLabel(number) {
  const n = Number(number)
  if (!Number.isFinite(n) || n < 1) return 'Photo'
  return `Photo ${Math.trunc(n)}`
}

export function photoTileCaption(photo) {
  if (!photo || typeof photo !== 'object') return ''
  const raw =
    photo.caption ??
    photo.description ??
    photo.acceptedDescription ??
    ''
  return String(raw).trim()
}

export function photoTileAssignedTo(photo) {
  if (!photo || typeof photo !== 'object') return ''
  const raw = photo.assignedTo ?? photo.assigned_to ?? ''
  return String(raw).trim()
}

export function photoTileAssignedToLine(photo) {
  const value = photoTileAssignedTo(photo)
  return value ? `Assigned to: ${value}` : ''
}

function layoutFromPhoto(photo) {
  const layout = photo?.layout || 'grid4'
  if (layout === 'full' || layout === 'grid6' || layout === 'grid4') return layout
  return 'grid4'
}

/**
 * Split numbered photos into layout buckets (legacy helpers / tests).
 */
export function buildPhotoSchedule(photos = []) {
  const numbered = assignReportPhotoNumbers(photos)
  return {
    all: numbered,
    full: numbered.filter((p) => layoutFromPhoto(p) === 'full'),
    grid4: numbered.filter((p) => layoutFromPhoto(p) === 'grid4'),
    grid6: numbered.filter((p) => layoutFromPhoto(p) === 'grid6'),
  }
}

/**
 * Canonical PDF area render model from prepared work photos.
 *
 * Rebuilds areas with groupPhotosByArea (same as diary hydrate), then keeps
 * prepared image fields keyed by photo identity so src/captions are preserved.
 *
 * @returns {{
 *   all: object[],
 *   areas: Array<{ areaName: string, layout: string, photos: object[] }>,
 * }}
 */
export function buildPhotoAreaSchedule(photos = []) {
  const numbered = assignReportPhotoNumbers(photos)
  const byIdentity = new Map()
  for (const photo of numbered) {
    for (const id of [photo.key, photo.url, photo.id, photo.storagePath]) {
      if (id != null && String(id).trim()) byIdentity.set(String(id), photo)
    }
  }

  const walkGroups = groupPhotosByArea(
    numbered.map((photo, index) => ({
      key: photo.key || photo.url || photo.id || `photo-${index}`,
      id: photo.key || photo.id || null,
      url: photo.url || null,
      storagePath: photo.url || photo.storagePath || null,
      location: photo.location || photo.area || photoAreaName(photo),
      area: photo.location || photo.area || photoAreaName(photo),
      caption: photo.caption || '',
      layout: photo.layout || 'grid4',
      sequence: photo.sequence_number ?? photo.sequence ?? index + 1,
      sequence_number: photo.sequence_number ?? photo.sequence ?? index + 1,
      rotationDegrees: photo.rotationDegrees ?? 0,
      assignedTo: photo.assignedTo || '',
      preview: photo.preview || photo.src || null,
    })),
  )

  const areas = walkGroups.map((group) => {
    const photosInArea = (group.photos || []).map((walkPhoto) => {
      const candidates = [walkPhoto.id, walkPhoto.key, walkPhoto.imageUrl]
      for (const id of candidates) {
        if (id != null && byIdentity.has(String(id))) return byIdentity.get(String(id))
      }
      return {
        key: walkPhoto.id || walkPhoto.key,
        src: walkPhoto.preview || walkPhoto.imageUrl || null,
        preview: walkPhoto.preview || null,
        url: walkPhoto.imageUrl || null,
        caption: walkPhoto.acceptedDescription || '',
        location: group.areaName,
        area: group.areaName,
        layout: group.layout || 'grid4',
        rotationDegrees: walkPhoto.rotationDegrees || 0,
        assignedTo: walkPhoto.assignedTo || '',
      }
    })
    return {
      areaName: group.areaName,
      layout: group.layout || layoutFromPhoto(photosInArea[0]) || 'grid4',
      photos: photosInArea,
    }
  })

  let n = 0
  const all = []
  for (const area of areas) {
    area.photos = area.photos.map((photo) => {
      n += 1
      const row = {
        ...photo,
        reportPhotoNumber: n,
        location: area.areaName,
        area: area.areaName,
        layout: area.layout,
      }
      all.push(row)
      return row
    })
  }

  return { all, areas }
}

/**
 * Exact Work Photos PDF page schedule (one entry per emitted photo page).
 * Never yields an empty page. Multi-page areas continue with isAreaStart=false.
 * Declaration trails the final page of the final area (host only — no blank gap page).
 *
 * @param {{ areas?: Array<{ areaName: string, layout?: string, photos?: object[] }> }} schedule
 * @returns {Array<{
 *   areaName: string,
 *   layout: string,
 *   perPage: number,
 *   photos: object[],
 *   isAreaStart: boolean,
 *   isAreaEnd: boolean,
 *   hostsDeclaration: boolean,
 * }>}
 */
export function buildPhotoAreaPdfPages(schedule = {}) {
  const areas = Array.isArray(schedule.areas) ? schedule.areas : []
  const pages = []

  for (let areaIndex = 0; areaIndex < areas.length; areaIndex += 1) {
    const area = areas[areaIndex] || {}
    const areaName = String(area.areaName || '').trim() || 'Work photos'
    const layout = area.layout || 'grid4'
    const perPage = layout === 'full' ? 1 : layout === 'grid6' ? 6 : 4
    const chunks = paginatePdfPhotos(area.photos || [], perPage).filter(
      (chunk) => Array.isArray(chunk) && chunk.length > 0,
    )

    chunks.forEach((photos, pageIndex) => {
      pages.push({
        areaName,
        layout,
        perPage,
        photos,
        isAreaStart: pageIndex === 0,
        isAreaEnd: pageIndex === chunks.length - 1,
        hostsDeclaration:
          areaIndex === areas.length - 1 && pageIndex === chunks.length - 1,
      })
    })
  }

  return pages
}

/**
 * PDF presentation label for one work-photo area (stored area name unchanged).
 * Prefix "Area: " clarifies short names like "A" or "B" on the printed report.
 */
export function photographicRecordAreaTitle(areaName) {
  const name = String(areaName || '').trim() || 'Work photos'
  return `Area: ${name}`
}
