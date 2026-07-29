/**
 * Overlay PNG + derived flatten helpers.
 * Original photograph is never overwritten — flatten is export-only.
 */

import { normalizeAnnotationDoc, hasAnnotations } from './model'
import { drawAnnotationDoc } from './render'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('No image source'))
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/**
 * Render annotations onto a transparent canvas matching the original pixel size.
 * @returns {Promise<HTMLCanvasElement | null>}
 */
export async function renderTransparentOverlayCanvas(annotationDoc, imageWidth, imageHeight) {
  const doc = normalizeAnnotationDoc(annotationDoc, imageWidth, imageHeight)
  if (!hasAnnotations(doc)) return null
  const w = Math.max(1, Math.round(imageWidth || doc.imageWidth || 1))
  const h = Math.max(1, Math.round(imageHeight || doc.imageHeight || 1))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  drawAnnotationDoc(ctx, doc, w, h)
  return canvas
}

/** Transparent PNG Blob from structured annotations. */
export async function annotationDocToOverlayPng(annotationDoc, imageWidth, imageHeight) {
  const canvas = await renderTransparentOverlayCanvas(annotationDoc, imageWidth, imageHeight)
  if (!canvas) return null
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

/** Transparent PNG data URL from structured annotations. */
export async function annotationDocToOverlayDataUrl(annotationDoc, imageWidth, imageHeight) {
  const canvas = await renderTransparentOverlayCanvas(annotationDoc, imageWidth, imageHeight)
  if (!canvas) return null
  return canvas.toDataURL('image/png')
}

/**
 * Derived flatten for PDF/export only — does not replace the stored original.
 * Scales original + overlay together (same canvas size) so alignment is preserved.
 * @returns {Promise<string | null>} JPEG data URL
 */
export async function compositeFlattenedDataUrl({
  originalSrc,
  annotationDoc = null,
  overlaySrc = null,
  maxEdge = 2400,
  quality = 0.9,
}) {
  if (!originalSrc) return null
  const base = await loadImage(originalSrc)
  const naturalW = base.naturalWidth || base.width
  const naturalH = base.naturalHeight || base.height
  const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH))
  const w = Math.max(1, Math.round(naturalW * scale))
  const h = Math.max(1, Math.round(naturalH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(base, 0, 0, w, h)

  const doc = normalizeAnnotationDoc(annotationDoc, naturalW, naturalH)
  if (hasAnnotations(doc)) {
    // Draw structured annotations scaled into the export canvas (exact alignment)
    drawAnnotationDoc(ctx, doc, w, h)
  } else if (overlaySrc) {
    const overlay = await loadImage(overlaySrc)
    ctx.drawImage(overlay, 0, 0, w, h)
  }

  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Resolve the image URL to use in a PDF tile.
 * Prefer a derived flatten when annotations exist; otherwise the original.
 */
export async function resolvePdfPhotoSrc(photo) {
  const original =
    photo?.src || photo?.preview || photo?.originalSrc || photo?.url || null
  if (!original) return null

  const doc = photo?.annotations || photo?.annotationDoc || null
  if (hasAnnotations(doc) || photo?.overlaySrc || photo?.overlayPreview) {
    try {
      const flat = await compositeFlattenedDataUrl({
        originalSrc: original,
        annotationDoc: doc,
        overlaySrc: photo.overlaySrc || photo.overlayPreview || null,
      })
      if (flat) return flat
    } catch {
      // fall through to original
    }
  }
  return original
}

/**
 * Prepare photo list for PDF — derived flatten only when annotations exist.
 * Original storage paths are never replaced.
 */
export async function preparePhotosForPdf(photos = []) {
  const list = Array.isArray(photos) ? photos : []
  return Promise.all(
    list.map(async (photo) => {
      const src = await resolvePdfPhotoSrc(photo)
      return { ...photo, src: src || photo.src || photo.preview || photo.url }
    }),
  )
}
