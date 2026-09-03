/**
 * PHOTO-001 — user-photo content vs presentation.
 *
 * Content: complete photograph, original aspect ratio, no crop, no distortion.
 * Presentation: each surface may size/frame differently; a fixed frame may
 * letterbox, but must never discard photograph content.
 *
 * Does not alter persist, PDF layout, autosave, share, or annotation tools.
 */

import { isContainEquivalentPhotoStyle, photoStyleCrops } from '../diary-setup-cover-preview.js'

export { isContainEquivalentPhotoStyle, photoStyleCrops }

/** Pending capture preview: full-width frame, capped height, contain (letterbox OK). */
export const ANNOTATION_PENDING_PREVIEW_FRAME = {
  height: 220,
}

export const ANNOTATION_PENDING_PREVIEW_IMG_STYLE = {
  width: '100%',
  height: ANNOTATION_PENDING_PREVIEW_FRAME.height,
  maxHeight: ANNOTATION_PENDING_PREVIEW_FRAME.height,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#0b0d12',
  borderRadius: 10,
  border: '1px solid var(--edge)',
  marginBottom: 12,
  display: 'block',
}

/** Active-area photo card thumbnail outer frame. */
export const ANNOTATION_PHOTO_CARD_THUMB_FRAME = {
  width: 88,
  height: 88,
}

export const ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE = {
  width: ANNOTATION_PHOTO_CARD_THUMB_FRAME.width,
  height: ANNOTATION_PHOTO_CARD_THUMB_FRAME.height,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#0b0d12',
  borderRadius: 8,
  border: '1px solid var(--edge)',
  display: 'block',
}

/** Saved-at-locations list thumbnail outer frame. */
export const ANNOTATION_SAVED_LIST_THUMB_FRAME = {
  width: 72,
  height: 72,
}

export const ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE = {
  width: ANNOTATION_SAVED_LIST_THUMB_FRAME.width,
  height: ANNOTATION_SAVED_LIST_THUMB_FRAME.height,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#0b0d12',
  borderRadius: 8,
  border: '1px solid var(--edge)',
  display: 'block',
}

/**
 * Annotation editor user photo.
 * Position/size still come from fitContain (keeps overlay coordinates aligned).
 * objectFit is contain so the bitmap cannot stretch if that box ever diverges.
 */
export function annotationEditorUserPhotoStyle(fit) {
  const box = fit && typeof fit === 'object' ? fit : {}
  return {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    objectFit: 'contain',
    objectPosition: 'center',
    userSelect: 'none',
    pointerEvents: 'none',
  }
}

/**
 * JSX / layout modules that render user photographs.
 * Decorative landing imagery is intentionally absent.
 */
export const PHOTO_001_OWNING_SURFACES = [
  'components/ai-annotation/AnnotationPendingReview.jsx',
  'components/ai-annotation/AnnotationPhotoCard.jsx',
  'components/ai-annotation/AnnotationSavedList.jsx',
  'components/ai-annotation/AreaPhotoViewer.jsx',
  'components/photo-workspace/CaptureThumbnailGrid.jsx',
  'components/photo-workspace/CapturePhotoPreview.jsx',
  'components/photo-annotations/PhotoAnnotationViewer.jsx',
  'components/photo-annotations/PhotoAnnotationEditor.jsx',
  'lib/diary-setup-cover-preview.js',
  'app/dashboard/diary/setup/page.jsx',
  'app/dashboard/project/[id]/diary/page.jsx',
  'app/dashboard/project/[id]/diary/view/page.jsx',
  'components/pdf/DiaryPdfDocument.jsx',
  'lib/diary-pdf-layout.js',
]

/** Surfaces scanned for crop CSS assignments (detector modules excluded). */
export const PHOTO_001_CROP_SCAN_SURFACES = PHOTO_001_OWNING_SURFACES.filter(
  (path) => path !== 'lib/diary-setup-cover-preview.js',
)

/**
 * Proven decorative/system imagery that may crop. Not user photographs.
 * A new crop/fill outside this list must be classified before it can ship.
 */
export const PHOTO_001_DECORATIVE_CROP_ALLOWLIST = Object.freeze([
  {
    path: 'app/page.tsx',
    reason: 'Landing hero silhouette — not a user photograph',
  },
])

/** Modules that mention forbidden fit values only to detect or forbid them. */
export const PHOTO_001_CROP_DETECTOR_ALLOWLIST = Object.freeze([
  'lib/diary-setup-cover-preview.js',
  'lib/photo-workspace/photo-001-no-crop.js',
])

export const PHOTO_001_FUTURE_SURFACE_SCAN_ROOTS = Object.freeze(['app', 'components', 'lib'])

const CROP_OR_DISTORT_ASSIGNMENT =
  /objectFit:\s*['"]cover['"]|object-fit:\s*cover\b|['"]object-cover['"]|\bobject-cover\b|backgroundSize:\s*['"]cover['"]|background-size:\s*cover\b|objectFit:\s*['"]fill['"]|object-fit:\s*fill\b|\bobject-fill\b|imageCropToFill:\s*true/

function finitePositive(n, fallback) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

function usedContainInFrame(sourceWidth, sourceHeight, frameWidth, frameHeight) {
  const srcW = finitePositive(sourceWidth, 1)
  const srcH = finitePositive(sourceHeight, 1)
  const frameW = finitePositive(frameWidth, 1)
  const frameH = finitePositive(frameHeight, 1)
  const scale = Math.min(frameW / srcW, frameH / srcH)
  const usedWidth = srcW * scale
  const usedHeight = srcH * scale
  return {
    frameWidth: frameW,
    frameHeight: frameH,
    usedWidth,
    usedHeight,
    scale,
    letterboxX: (frameW - usedWidth) / 2,
    letterboxY: (frameH - usedHeight) / 2,
    sourceAspect: srcW / srcH,
    usedAspect: usedWidth / usedHeight,
    crops: false,
    distorts: false,
  }
}

/** Contain-fit a photograph into a fixed frame. Letterbox allowed; crop/distort not. */
export function usedFixedFrameContainBox(sourceWidth, sourceHeight, frameWidth, frameHeight) {
  return usedContainInFrame(sourceWidth, sourceHeight, frameWidth, frameHeight)
}

/**
 * Cover-fit the same photograph into the same frame.
 * Used only to prove contain is not equivalent to crop-to-fill.
 */
export function usedFixedFrameCoverBox(sourceWidth, sourceHeight, frameWidth, frameHeight) {
  const srcW = finitePositive(sourceWidth, 1)
  const srcH = finitePositive(sourceHeight, 1)
  const frameW = finitePositive(frameWidth, 1)
  const frameH = finitePositive(frameHeight, 1)
  const scale = Math.max(frameW / srcW, frameH / srcH)
  const laidWidth = srcW * scale
  const laidHeight = srcH * scale
  const crops = laidWidth > frameW + 1e-9 || laidHeight > frameH + 1e-9
  return {
    frameWidth: frameW,
    frameHeight: frameH,
    laidWidth,
    laidHeight,
    usedWidth: frameW,
    usedHeight: frameH,
    scale,
    sourceAspect: srcW / srcH,
    usedAspect: frameW / frameH,
    crops,
    distorts: false,
  }
}

export function usedPendingPreviewContainBox(sourceWidth, sourceHeight, availableWidth) {
  return usedContainInFrame(
    sourceWidth,
    sourceHeight,
    availableWidth,
    ANNOTATION_PENDING_PREVIEW_FRAME.height,
  )
}

export function isFixedFrameContainPhotoStyle(style, frame) {
  if (!isContainEquivalentPhotoStyle(style)) return false
  if (photoStyleCrops(style)) return false
  if (Number(style.width) !== frame.width) return false
  if (Number(style.height) !== frame.height) return false
  return true
}

export function isPendingPreviewContainPhotoStyle(style) {
  if (!isContainEquivalentPhotoStyle(style)) return false
  if (photoStyleCrops(style)) return false
  if (style.width !== '100%') return false
  if (Number(style.height) !== ANNOTATION_PENDING_PREVIEW_FRAME.height) return false
  if (Number(style.maxHeight) !== ANNOTATION_PENDING_PREVIEW_FRAME.height) return false
  return true
}

export function sourceAssignsCropFit(source) {
  return CROP_OR_DISTORT_ASSIGNMENT.test(String(source || ''))
}

export function photo001ScanAllowlistPaths() {
  return [
    ...PHOTO_001_DECORATIVE_CROP_ALLOWLIST.map((entry) => entry.path),
    ...PHOTO_001_CROP_DETECTOR_ALLOWLIST,
  ]
}
