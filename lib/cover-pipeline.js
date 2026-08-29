/**
 * Phase C1 — canonical Site Diary cover preparation (upload-time only).
 *
 * Produces orientation-normalised, EXIF-independent JPEG bytes for durable storage.
 * No crop — proportional contain scaling only. Does not alter PDF behaviour (Phase C2).
 */

import { decodeBrowserDisplayImage } from './image-orientation.js'
import { computeContainDimensions } from './photo-workspace/image-pipeline.js'

/** Bump when derivative rules change. */
export const ZLOG_COVER_PIPELINE_ID = 'zlog-cover-pipeline-v1'

export const ZLOG_COVER_MAX_EDGE = 2400
export const ZLOG_COVER_JPEG_QUALITY = 0.85
export const ZLOG_COVER_MIME = 'image/jpeg'

export class ZlogCoverPipelineError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause = null) {
    super(message)
    this.name = 'ZlogCoverPipelineError'
    this.code = code
    this.cause = cause
  }
}

/**
 * Immutable prepared-cover storage object key.
 * @param {string} userId
 * @param {string} reportId
 * @param {string} generation F2B pending-cover generation UUID
 */
export function preparedCoverStoragePath(userId, reportId, generation) {
  const uid = String(userId || '').trim()
  const rid = String(reportId || '').trim()
  const gen = String(generation || '').trim()
  if (!uid || !rid || !gen) return null
  return `${uid}/${rid}/covers/${gen}.jpg`
}

/**
 * Immutable raw fallback storage key when canonical prepare fails (version NULL).
 * @param {string} userId
 * @param {string} reportId
 * @param {string} generation F2B pending-cover generation UUID
 */
export function rawCoverStoragePath(userId, reportId, generation) {
  const uid = String(userId || '').trim()
  const rid = String(reportId || '').trim()
  const gen = String(generation || '').trim()
  if (!uid || !rid || !gen) return null
  return `${uid}/${rid}/covers/raw/${gen}.jpg`
}

function assertCoverSource(source) {
  if (!source || !(source instanceof Blob)) {
    throw new ZlogCoverPipelineError('invalid-input', 'Cover must be a File or Blob')
  }
  if (source.size < 1) {
    throw new ZlogCoverPipelineError('invalid-input', 'Cover image was empty')
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new ZlogCoverPipelineError('export-unavailable', 'Canvas JPEG export is not available'))
      return
    }
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          reject(new ZlogCoverPipelineError('export-failed', 'Cover JPEG export produced no image data'))
          return
        }
        resolve(blob)
      },
      ZLOG_COVER_MIME,
      quality,
    )
  })
}

/**
 * Prepare canonical upright cover JPEG bytes from a raw user selection.
 *
 * @param {Blob} source
 * @param {{
 *   decode?: typeof decodeBrowserDisplayImage,
 *   document?: Document,
 *   maxEdge?: number,
 *   quality?: number,
 * }} [options]
 * @returns {Promise<{
 *   blob: Blob,
 *   width: number,
 *   height: number,
 *   byteSize: number,
 *   mimeType: string,
 *   pipelineId: string,
 *   orientation: { sourceExif: number, decodeMode: string, usedBrowserOrientation: boolean },
 * }>}
 */
export async function prepareCanonicalCoverBlob(source, options = {}) {
  assertCoverSource(source)

  const decode = options.decode || decodeBrowserDisplayImage
  const documentRef = options.document
    || (typeof globalThis !== 'undefined' ? globalThis.document : null)
  const maxEdge = options.maxEdge ?? ZLOG_COVER_MAX_EDGE
  const quality = options.quality ?? ZLOG_COVER_JPEG_QUALITY

  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new ZlogCoverPipelineError('document-unavailable', 'Cover preparation requires a browser document')
  }

  let decoded
  try {
    decoded = await decode(source)
  } catch (error) {
    throw new ZlogCoverPipelineError('decode-failed', 'Could not decode cover photo for preparation', error)
  }

  const { source: imageSource, width, height, orientation, usedBrowserOrientation, decodeMode } = decoded
  const { width: outW, height: outH } = computeContainDimensions(width, height, maxEdge)

  const canvas = documentRef.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    decoded.close?.()
    throw new ZlogCoverPipelineError('canvas-unavailable', 'Could not create canvas for cover preparation')
  }

  ctx.drawImage(imageSource, 0, 0, outW, outH)
  decoded.close?.()

  const blob = await canvasToJpegBlob(canvas, quality)

  return {
    blob,
    width: outW,
    height: outH,
    byteSize: blob.size,
    mimeType: ZLOG_COVER_MIME,
    pipelineId: ZLOG_COVER_PIPELINE_ID,
    orientation: {
      sourceExif: orientation,
      decodeMode,
      usedBrowserOrientation,
    },
  }
}
