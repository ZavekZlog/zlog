/**
 * Final photo-schedule helpers for report generation.
 *
 * - Continuous Photo 1..N across the whole report (not per area / layout section)
 * - Recalculated at generation time from the photos passed in
 * - Captions never include a separate timestamp field (report date is enough)
 */

const LAYOUT_ORDER = { full: 0, grid4: 1, grid6: 2 }

function layoutRank(photo) {
  const layout = photo?.layout || 'grid4'
  return LAYOUT_ORDER[layout] ?? 99
}

function sequenceRank(photo) {
  const n = Number(photo?.sequence_number ?? photo?.sequence)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Stable report order: layout tier (full → grid4 → grid6), then sequence within tier.
 * Falls back to original array order when sequence is missing.
 */
export function orderPhotosForReport(photos = []) {
  const list = Array.isArray(photos) ? photos : []
  return list
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const layoutDiff = layoutRank(a.photo) - layoutRank(b.photo)
      if (layoutDiff !== 0) return layoutDiff
      const seqDiff = sequenceRank(a.photo) - sequenceRank(b.photo)
      if (seqDiff !== 0) return seqDiff
      return a.index - b.index
    })
    .map(({ photo }) => photo)
}

/**
 * Assign continuous reportPhotoNumber (1..N) at generation time.
 * Call this whenever photos are added, removed, or reordered before PDF output.
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

/**
 * Caption for a photo tile — description only.
 * Never appends timestamp / captured-at metadata.
 */
export function photoTileCaption(photo) {
  if (!photo || typeof photo !== 'object') return ''
  const raw =
    photo.caption ??
    photo.description ??
    photo.acceptedDescription ??
    ''
  return String(raw).trim()
}

/**
 * Split numbered photos into layout buckets for paginated schedules.
 */
export function buildPhotoSchedule(photos = []) {
  const numbered = assignReportPhotoNumbers(photos)
  return {
    all: numbered,
    full: numbered.filter((p) => (p.layout || 'grid4') === 'full'),
    grid4: numbered.filter((p) => (p.layout || 'grid4') === 'grid4'),
    grid6: numbered.filter((p) => p.layout === 'grid6'),
  }
}
