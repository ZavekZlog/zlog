/**
 * Zlog shared photo ingest pipeline (Phase A).
 *
 * Produces orientation-normalised report + thumbnail JPEG assets from a user
 * photograph. No crop — proportional contain scaling only.
 *
 * Reuses hardened browser-display decode from lib/image-orientation.js (same path
 * as PDF work-photo flatten). Does not modify PDF or Site Diary behaviour.
 */

import { decodeBrowserDisplayImage } from '../image-orientation.js'

/** Pipeline revision — bump when derivative rules change (lazy regen key). */
export const ZLOG_PHOTO_PIPELINE_ID = 'zlog-photo-pipeline-v1'

/** Report asset — construction evidence, viewer, PDF input (Phase A default). */
export const ZLOG_REPORT_MAX_EDGE = 2400
export const ZLOG_REPORT_JPEG_QUALITY = 0.85

/**
 * Thumbnail — saved grids / compact review.
 * 0.82: readable site detail at ~512 px without print-grade bit cost.
 */
export const ZLOG_THUMB_MAX_EDGE = 512
export const ZLOG_THUMB_JPEG_QUALITY = 0.82

export const ZLOG_PHOTO_MIME = 'image/jpeg'

export class ZlogPhotoPipelineError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause = null) {
    super(message)
    this.name = 'ZlogPhotoPipelineError'
    this.code = code
    this.cause = cause
  }
}

/**
 * Proportional contain dimensions — never upscale, never crop.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} maxEdge
 * @returns {{ width: number, height: number, scale: number }}
 */
export function computeContainDimensions(sourceWidth, sourceHeight, maxEdge) {
  const w = Math.max(1, Math.round(Number(sourceWidth) || 1))
  const h = Math.max(1, Math.round(Number(sourceHeight) || 1))
  const cap = Math.max(1, Number(maxEdge) || 1)
  const longEdge = Math.max(w, h)
  const scale = longEdge > cap ? cap / longEdge : 1
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} source
 * @param {number} outW
 * @param {number} outH
 */
function drawSourceProportional(ctx, source, outW, outH) {
  ctx.drawImage(source, 0, 0, outW, outH)
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new ZlogPhotoPipelineError('export-unavailable', 'Canvas JPEG export is not available'))
      return
    }
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          reject(new ZlogPhotoPipelineError('export-failed', 'JPEG export produced no image data'))
          return
        }
        resolve(blob)
      },
      ZLOG_PHOTO_MIME,
      quality,
    )
  })
}

/**
 * @param {CanvasImageSource} source
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} maxEdge
 * @param {number} quality
 * @param {Document} documentRef
 */
async function renderJpegDerivative(source, sourceWidth, sourceHeight, maxEdge, quality, documentRef) {
  const { width, height } = computeContainDimensions(sourceWidth, sourceHeight, maxEdge)
  const canvas = documentRef.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new ZlogPhotoPipelineError('canvas-unavailable', 'Could not create canvas for photo processing')
  }
  drawSourceProportional(ctx, source, width, height)
  const blob = await canvasToJpegBlob(canvas, quality)
  return {
    blob,
    width,
    height,
    byteSize: blob.size,
    mimeType: ZLOG_PHOTO_MIME,
  }
}

function assertPhotoSource(source) {
  if (!source || !(source instanceof Blob)) {
    throw new ZlogPhotoPipelineError('invalid-input', 'Photo must be a File or Blob')
  }
  const type = typeof source.type === 'string' ? source.type.trim().toLowerCase() : ''
  if (type && !type.startsWith('image/')) {
    throw new ZlogPhotoPipelineError('invalid-input', 'Unsupported file type — expected an image')
  }
}

/**
 * Prepare Zlog report + thumbnail JPEG assets from a browser-selected photograph.
 *
 * Decodes once (browser-display orientation), then derives both derivatives from
 * the same upright source without re-decoding.
 *
 * @param {Blob | File} source
 * @param {{
 *   reportMaxEdge?: number,
 *   thumbMaxEdge?: number,
 *   reportQuality?: number,
 *   thumbQuality?: number,
 *   decode?: typeof decodeBrowserDisplayImage,
 *   document?: Document,
 * }} [options] — optional overrides (used by tests)
 * @returns {Promise<{
 *   pipelineId: string,
 *   report: { blob: Blob, width: number, height: number, byteSize: number, mimeType: string },
 *   thumbnail: { blob: Blob, width: number, height: number, byteSize: number, mimeType: string },
 *   orientation: { sourceExif: number, decodeMode: string|null, usedBrowserOrientation: boolean },
 * }>}
 */
export async function prepareZlogPhoto(source, options = {}) {
  assertPhotoSource(source)

  const reportMaxEdge = options.reportMaxEdge ?? ZLOG_REPORT_MAX_EDGE
  const thumbMaxEdge = options.thumbMaxEdge ?? ZLOG_THUMB_MAX_EDGE
  const reportQuality = options.reportQuality ?? ZLOG_REPORT_JPEG_QUALITY
  const thumbQuality = options.thumbQuality ?? ZLOG_THUMB_JPEG_QUALITY

  const decode = options.decode ?? decodeBrowserDisplayImage
  const documentRef = options.document
    ?? (typeof document !== 'undefined' ? document : null)

  if (!documentRef?.createElement) {
    throw new ZlogPhotoPipelineError(
      'environment-unavailable',
      'Canvas environment is not available for photo processing',
    )
  }

  let decoded
  try {
    decoded = await decode(source)
  } catch (err) {
    if (err instanceof ZlogPhotoPipelineError) throw err
    throw new ZlogPhotoPipelineError(
      'decode-failed',
      'Could not decode photograph',
      err,
    )
  }

  try {
    const img = decoded?.source
    const width = Number(decoded?.width) || 0
    const height = Number(decoded?.height) || 0

    if (!img || width < 1 || height < 1) {
      throw new ZlogPhotoPipelineError('invalid-dimensions', 'Photograph has invalid dimensions')
    }

    const report = await renderJpegDerivative(
      img,
      width,
      height,
      reportMaxEdge,
      reportQuality,
      documentRef,
    )
    const thumbnail = await renderJpegDerivative(
      img,
      width,
      height,
      thumbMaxEdge,
      thumbQuality,
      documentRef,
    )

    return {
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
      report,
      thumbnail,
      orientation: {
        sourceExif: Number(decoded.orientation) || 1,
        decodeMode: decoded.decodeMode ?? null,
        usedBrowserOrientation: Boolean(decoded.usedBrowserOrientation),
      },
    }
  } catch (err) {
    if (err instanceof ZlogPhotoPipelineError) throw err
    throw new ZlogPhotoPipelineError(
      'processing-failed',
      'Could not prepare photograph assets',
      err,
    )
  } finally {
    decoded?.close?.()
  }
}
