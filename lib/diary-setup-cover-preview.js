/**
 * PHOTO-001 — Site Diary setup Cover photo preview presentation.
 *
 * 1. Content: complete image, no crop, no distortion.
 * 2. Presentation: available width is the cover card width; height follows
 *    the photograph's aspect ratio. No fixed landscape letterbox stage.
 *
 * Does not alter persist, PDF, or stored JPEG bytes.
 */

/** CSS object-fit / background-size values that crop the image to fill a box. */
const CROP_FIT_VALUES = new Set(['cover'])

/**
 * Photograph fills usable cover width; height is intrinsic from aspect ratio.
 */
export const SETUP_COVER_PREVIEW_IMG_STYLE = {
  display: 'block',
  width: '100%',
  height: 'auto',
  maxWidth: '100%',
  objectFit: 'contain',
  marginBottom: 10,
}

function readObjectFit(style) {
  if (!style || typeof style !== 'object') return ''
  return String(style.objectFit || style['object-fit'] || '')
    .trim()
    .toLowerCase()
}

function readBackgroundSize(style) {
  if (!style || typeof style !== 'object') return ''
  return String(style.backgroundSize || style['background-size'] || '')
    .trim()
    .toLowerCase()
}

/** True when a style would crop a user photo to fill its box. */
export function photoStyleCrops(style) {
  const fit = readObjectFit(style)
  if (CROP_FIT_VALUES.has(fit)) return true
  const bg = readBackgroundSize(style)
  if (bg === 'cover' || bg.startsWith('cover ')) return true
  return false
}

/** Content contract: scaled to fit without cropping or stretching. */
export function isContainEquivalentPhotoStyle(style) {
  if (!style || typeof style !== 'object') return false
  if (photoStyleCrops(style)) return false
  const fit = readObjectFit(style)
  if (fit === 'fill') return false
  return fit === 'contain'
}

/** Presentation contract: full available width, height auto, no fixed stage. */
export function isAspectAwareCoverPreviewStyle(style) {
  if (!style || typeof style !== 'object') return false
  if (style.width !== '100%') return false
  if (style.height !== 'auto') return false
  if (style.maxWidth !== '100%') return false
  if (Number.isFinite(Number(style.maxHeight))) return false
  if (photoStyleCrops(style)) return false
  return isContainEquivalentPhotoStyle(style)
}

/**
 * Used preview size: full available width, height from source aspect.
 * No height cap — that would recreate a landscape letterbox and side bands.
 */
export function usedSetupCoverPreviewBox(sourceWidth, sourceHeight, availableWidth) {
  const srcW = Math.max(1, Number(sourceWidth) || 1)
  const srcH = Math.max(1, Number(sourceHeight) || 1)
  const width = Math.max(1, Number(availableWidth) || 1)
  const height = width * (srcH / srcW)
  return {
    width,
    height,
    scale: width / srcW,
    aspectRatio: srcW / srcH,
    usedAspectRatio: width / height,
    sideBandWidth: 0,
  }
}

export function setupCoverPreviewImgProps(src) {
  return {
    src,
    alt: 'Cover',
    style: SETUP_COVER_PREVIEW_IMG_STYLE,
  }
}
