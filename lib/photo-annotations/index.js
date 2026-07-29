export {
  ANNOTATION_VERSION,
  SHAPE_TYPES,
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH_NORM,
  makeAnnotationId,
  createEmptyAnnotationDoc,
  normalizeAnnotationDoc,
  upsertShape,
  removeShape,
  hasAnnotations,
  strokeWidthPx,
} from './model'

export {
  drawShape,
  drawAnnotationDoc,
  shapeBounds,
  hitTestShape,
} from './render'

export {
  renderTransparentOverlayCanvas,
  annotationDocToOverlayPng,
  annotationDocToOverlayDataUrl,
  compositeFlattenedDataUrl,
  resolvePdfPhotoSrc,
  preparePhotosForPdf,
} from './composite'

/** Contain-fit a source image into a container (shared by editor + viewers). */
export function fitContain(containerW, containerH, imageW, imageH) {
  if (!containerW || !containerH || !imageW || !imageH) {
    return { x: 0, y: 0, w: 0, h: 0, scale: 1 }
  }
  const scale = Math.min(containerW / imageW, containerH / imageH)
  const w = imageW * scale
  const h = imageH * scale
  return {
    x: (containerW - w) / 2,
    y: (containerH - h) / 2,
    w,
    h,
    scale,
  }
}
