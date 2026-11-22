/**
 * Issued-PDF photo rotation. Detection runs after EXIF orientation is baked.
 * A landscape photograph that is not already a 3:4 portrait is turned once,
 * anticlockwise, so a 4:3 landscape fills the portrait frame.
 *
 * Canvas and sharp both take positive angles clockwise, so the anticlockwise
 * quarter-turn is 270.
 */

export const PORTRAIT_FRAME_RATIO = 0.75
export const PORTRAIT_FRAME_TOLERANCE = 0.03
export const FRAME_ROTATION_DEGREES = 270

/** Reference frame the badge and tag were drawn against. */
export const SPEC_FRAME_W = 221.1
export const SPEC_FRAME_H = 294.8
/** Issued Zlog frame, including its caption bar. */
export const ZLOG_FRAME_W = 253.6
export const ZLOG_FRAME_H = 316.2

/**
 * Landscape, and not already within 0.03 of a 3:4 portrait.
 * A 3:4 portrait, a narrower portrait, and a square are left alone.
 */
export function photoNeedsFrameRotation(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!(w > 0) || !(h > 0)) return false
  if (!(w > h)) return false
  return Math.abs(w / h - PORTRAIT_FRAME_RATIO) > PORTRAIT_FRAME_TOLERANCE
}

/** One scale, so the badge stays square on the wider Zlog frame. */
export function frameMarkScale() {
  return Math.sqrt((ZLOG_FRAME_W / SPEC_FRAME_W) * (ZLOG_FRAME_H / SPEC_FRAME_H))
}

export function scaledFrameMark(points) {
  return Math.round(Number(points) * frameMarkScale() * 100) / 100
}

/**
 * Badge, tag and inset for one frame. The spec marks were drawn on a 221.1pt
 * wide 3:4 image, so they follow this frame's image width.
 */
export function frameMarksForImage(imageW) {
  const width = Number(imageW)
  const scale = width > 0 ? width / SPEC_FRAME_W : frameMarkScale()
  const mark = (points) => Math.round(Number(points) * scale * 100) / 100
  return {
    scale,
    badge: mark(21),
    inset: mark(6),
    border: mark(1),
    tagSize: mark(7.5),
  }
}

export const ROTATION_BADGE_SIZE = scaledFrameMark(21)
export const ROTATION_BADGE_INSET = scaledFrameMark(6)
export const ROTATION_BADGE_BORDER = scaledFrameMark(1)
export const AREA_TAG_SIZE = scaledFrameMark(7.5)
export const AREA_TAG_INSET = scaledFrameMark(6)

/**
 * User-set area label. Missing, blank, and non-text values stay unset.
 * @param {Record<string, unknown>|null|undefined} photo
 * @returns {string|null}
 */
export function photoFrameTag(photo) {
  const raw = photo?.options && typeof photo.options === 'object'
    ? photo.options.tag
    : undefined
  const value = raw !== undefined ? raw : photo?.tag
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}
