/**
 * Phase C — durable persistence helpers for prepared report + thumbnail assets.
 *
 * Path convention (site-photos bucket):
 *   {userId}/{reportId}/photos/{photoId}/report.jpg
 *   {userId}/{reportId}/photos/{photoId}/thumb.jpg
 *
 * `url` on report_photos remains the canonical report asset path.
 * Thumbnail is optional/nullable — report must never be lost if thumb fails.
 */

import {
  prepareZlogPhoto,
  ZLOG_PHOTO_MIME,
  ZLOG_PHOTO_PIPELINE_ID,
  normalizeEditSessionRotationDegrees,
} from './image-pipeline.js'
import { SHADOW_PREPARE_STATUS } from './shadow-ingest.js'

export { ZLOG_PHOTO_PIPELINE_ID }

/**
 * Sanitize a client photo id for storage path segments.
 * @param {unknown} photoId
 */
export function sanitizePhotoStorageId(photoId) {
  const raw = String(photoId || '').trim()
  if (!raw) return null
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || null
}

/**
 * @param {string} userId
 * @param {string} reportId
 * @param {string} photoId
 */
export function preparedReportStoragePath(userId, reportId, photoId) {
  const id = sanitizePhotoStorageId(photoId)
  if (!userId || !reportId || !id) return null
  return `${userId}/${reportId}/photos/${id}/report.jpg`
}

/**
 * @param {string} userId
 * @param {string} reportId
 * @param {string} photoId
 */
export function preparedThumbnailStoragePath(userId, reportId, photoId) {
  const id = sanitizePhotoStorageId(photoId)
  if (!userId || !reportId || !id) return null
  return `${userId}/${reportId}/photos/${id}/thumb.jpg`
}

/**
 * True when Phase B shadowPrepare carries usable report (+ thumb) blobs.
 * Edit-session rotation is baked at persist, not kept as a display transform.
 * Annotations remain overlay/JSON and do not invalidate a READY pair.
 *
 * @param {object|null|undefined} photo
 */
export function isPreparedPhotoReadyForPersist(photo) {
  const sp = photo?.shadowPrepare
  if (!sp || sp.status !== SHADOW_PREPARE_STATUS.READY) return false
  if (!(sp.report?.blob instanceof Blob) || sp.report.blob.size < 1) return false
  if (!(sp.thumbnail?.blob instanceof Blob) || sp.thumbnail.blob.size < 1) return false
  return true
}

export function persistedWorkPhotoRotationDegrees(photo) {
  return normalizeEditSessionRotationDegrees(
    photo?.rotationDegrees ?? photo?.rotation_degrees,
  )
}

/**
 * Newly prepared saved photos (pipeline version + neutral rotation) skip PDF bake.
 * Non-zero rotation is the defensive legacy path. Local READY blobs with
 * rotation 0 are treated as prepared even before processing_version is queried.
 */
export function isPreparedWorkPhotoForPdfPassThrough(photo, { hasLocalPreparedBlob = false } = {}) {
  if (persistedWorkPhotoRotationDegrees(photo) !== 0) return false
  const version = String(photo?.processing_version || photo?.processingVersion || '').trim()
  if (version === ZLOG_PHOTO_PIPELINE_ID) return true
  return hasLocalPreparedBlob === true
}

/**
 * Collect storage paths owned by a report_photos row (report + optional thumb).
 * @param {{ url?: string|null, thumbnail_path?: string|null, thumbnailPath?: string|null }} row
 * @returns {string[]}
 */
export function storagePathsForPhotoRow(row = {}) {
  const paths = []
  const report = String(row.url || row.storagePath || '').trim()
  const thumb = String(row.thumbnail_path || row.thumbnailPath || '').trim()
  if (report && !/^https?:|^data:|^blob:/i.test(report)) paths.push(report)
  if (thumb && !/^https?:|^data:|^blob:/i.test(thumb) && thumb !== report) paths.push(thumb)
  return paths
}

/**
 * Map durable report.jpg storage paths → READY shadowPrepare.report.blob.
 * Identity is the canonical prepared report path, never array position.
 * Fail-safe: skip when READY/report-blob/path certainty is missing.
 *
 * Never uses thumbnail, preview, or original capture File.
 *
 * @param {{
 *   photos?: Array<Record<string, unknown>>,
 *   userId?: string,
 *   reportId?: string,
 * }} [args]
 * @returns {Map<string, Blob>}
 */
export function collectLocalPreparedPdfPhotoSources({ photos = [], userId, reportId } = {}) {
  const out = new Map()
  const list = Array.isArray(photos) ? photos : []
  for (const photo of list) {
    const sp = photo?.shadowPrepare
    if (!sp || sp.status !== SHADOW_PREPARE_STATUS.READY) continue
    const blob = sp.report?.blob
    if (!(blob instanceof Blob) || blob.size < 1) continue
    const photoId = photo.key || photo.id
    const expected = preparedReportStoragePath(userId, reportId, photoId)
    if (!expected) continue
    const claimed = String(photo.storagePath || photo.imageUrl || photo.url || '').trim()
    if (claimed && claimed !== expected) continue
    out.set(expected, blob)
  }
  return out
}

/**
 * Ensure a photo has a ready prepared pair.
 * Reuse READY shadow only when edit-session rotation is already 0.
 * Otherwise bake extraRotationDegrees into report.jpg / thumb.jpg.
 * @param {object} photo
 * @param {{ prepareFn?: typeof prepareZlogPhoto }} [opts]
 */
export async function ensurePreparedPhotoAssets(photo, opts = {}) {
  const extraRotation = persistedWorkPhotoRotationDegrees(photo)
  if (isPreparedPhotoReadyForPersist(photo) && extraRotation === 0) {
    return {
      ok: true,
      reused: true,
      pipelineId: photo.shadowPrepare.pipelineId || ZLOG_PHOTO_PIPELINE_ID,
      report: photo.shadowPrepare.report,
      thumbnail: photo.shadowPrepare.thumbnail,
      orientation: photo.shadowPrepare.orientation || null,
    }
  }
  const source = photo?.file instanceof Blob && photo.file.size > 0
    ? photo.file
    : (photo?.shadowPrepare?.report?.blob instanceof Blob && photo.shadowPrepare.report.blob.size > 0
      ? photo.shadowPrepare.report.blob
      : null)
  if (!source) {
    return { ok: false, reason: 'missing-source-file' }
  }
  const prepareFn = opts.prepareFn || prepareZlogPhoto
  try {
    const prepared = await prepareFn(source, { extraRotationDegrees: extraRotation })
    return {
      ok: true,
      reused: false,
      pipelineId: prepared.pipelineId || ZLOG_PHOTO_PIPELINE_ID,
      report: prepared.report,
      thumbnail: prepared.thumbnail,
      orientation: prepared.orientation || null,
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'prepare-failed',
      error: err,
    }
  }
}

/**
 * Upload report (+ optional thumbnail) with remove-then-insert for deterministic paths.
 * Report failure throws. Thumbnail failure returns report success with thumbnailPath null.
 *
 * @param {object} supabase
 * @param {{
 *   userId: string,
 *   reportId: string,
 *   photoId: string,
 *   reportBlob: Blob,
 *   thumbnailBlob?: Blob|null,
 *   reportMeta?: object,
 *   thumbnailMeta?: object,
 *   pipelineId?: string,
 *   onAssetUploadTiming?: (timing: {
 *     reportMs: number,
 *     thumbMs: number|null,
 *     wallMs: number,
 *   }) => void,
 * }} args
 */
export async function uploadPreparedPhotoAssets(supabase, args = {}) {
  const {
    userId,
    reportId,
    photoId,
    reportBlob,
    thumbnailBlob = null,
    reportMeta = {},
    thumbnailMeta = {},
    pipelineId = ZLOG_PHOTO_PIPELINE_ID,
    onAssetUploadTiming,
  } = args

  const reportPath = preparedReportStoragePath(userId, reportId, photoId)
  const thumbPath = preparedThumbnailStoragePath(userId, reportId, photoId)
  if (!reportPath || !thumbPath) {
    const err = new Error('prepared-path-invalid')
    err.persistStage = 'photo'
    throw err
  }
  if (!(reportBlob instanceof Blob) || reportBlob.size < 1) {
    const err = new Error('prepared-report-missing')
    err.persistStage = 'photo'
    throw err
  }

  const bucket = supabase.storage.from('site-photos')

  async function putObject(path, blob, contentType) {
    try {
      await bucket.remove([path])
    } catch {
      /* ignore missing */
    }
    const { error } = await bucket.upload(path, blob, {
      contentType: contentType || ZLOG_PHOTO_MIME,
      upsert: false,
    })
    if (error) throw error
  }

  const hasThumb = thumbnailBlob instanceof Blob && thumbnailBlob.size > 0
  const reportContentType = reportMeta.mimeType || ZLOG_PHOTO_MIME
  const thumbContentType = thumbnailMeta.mimeType || ZLOG_PHOTO_MIME
  const wallStart = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

  async function timedPutObject(path, blob, contentType) {
    const start = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
    try {
      await putObject(path, blob, contentType)
      const end = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
      return { ok: true, ms: Math.max(0, Math.round(end - start)) }
    } catch (err) {
      const end = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
      return { ok: false, ms: Math.max(0, Math.round(end - start)), err }
    }
  }

  const reportUpload = timedPutObject(reportPath, reportBlob, reportContentType)
  const thumbUpload = hasThumb
    ? timedPutObject(thumbPath, thumbnailBlob, thumbContentType)
    : null

  const [reportResult, thumbResult] = await Promise.all([
    reportUpload,
    hasThumb ? thumbUpload : Promise.resolve({ ok: true, ms: null }),
  ])

  if (!reportResult.ok) {
    const photoErr = new Error('photo-upload-failed')
    photoErr.persistStage = 'photo'
    photoErr.cause = reportResult.err
    throw photoErr
  }

  const reportMs = reportResult.ms
  let thumbMs = null
  let thumbnailPath = null
  let thumbFailed = false
  if (hasThumb) {
    if (thumbResult.ok) {
      thumbnailPath = thumbPath
      thumbMs = thumbResult.ms
    } else {
      thumbFailed = true
      thumbMs = thumbResult.ms
    }
  }

  const wallEnd = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
  try {
    onAssetUploadTiming?.({
      reportMs,
      thumbMs: hasThumb ? thumbMs : null,
      wallMs: Math.max(0, Math.round(wallEnd - wallStart)),
    })
  } catch {
    /* timing hook must not affect upload */
  }

  return {
    reportPath,
    thumbnailPath,
    thumbFailed,
    pipelineId,
    reportWidth: Number(reportMeta.width) || null,
    reportHeight: Number(reportMeta.height) || null,
    reportByteSize: Number(reportMeta.byteSize) || reportBlob.size || null,
    thumbnailWidth: thumbnailPath ? (Number(thumbnailMeta.width) || null) : null,
    thumbnailHeight: thumbnailPath ? (Number(thumbnailMeta.height) || null) : null,
    thumbnailByteSize: thumbnailPath
      ? (Number(thumbnailMeta.byteSize) || thumbnailBlob?.size || null)
      : null,
  }
}

/**
 * Build report_photos insert fields for a newly prepared architecture photo.
 */
export function buildPreparedPhotoRecordFields(uploadResult) {
  return {
    url: uploadResult.reportPath,
    thumbnail_path: uploadResult.thumbnailPath,
    report_width: uploadResult.reportWidth,
    report_height: uploadResult.reportHeight,
    thumbnail_width: uploadResult.thumbnailWidth,
    thumbnail_height: uploadResult.thumbnailHeight,
    report_byte_size: uploadResult.reportByteSize,
    thumbnail_byte_size: uploadResult.thumbnailByteSize,
    processing_version: uploadResult.pipelineId || ZLOG_PHOTO_PIPELINE_ID,
  }
}
