/**
 * Phase B — shadow-mode photo ingest.
 *
 * Runs prepareZlogPhoto() for newly selected local Files without replacing the
 * live production photo fields (file / preview / imageUrl / upload path).
 *
 * Derivatives stay in transient `shadowPrepare` state only — no DB, storage,
 * PDF, or review-grid consumption in this phase.
 */

import { mapWithConcurrency } from '../diary-pdf-photos.js'
import {
  prepareZlogPhoto,
  ZLOG_REPORT_MAX_EDGE,
  ZLOG_THUMB_MAX_EDGE,
} from './image-pipeline.js'

/** Mobile-safe bound for concurrent canvas decode/resize. */
export const SHADOW_INGEST_CONCURRENCY = 2

export const SHADOW_PREPARE_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed',
}

/**
 * True when a photo is a newly selected local File that has not yet entered
 * shadow prepare. Saved/persisted photos must never re-enter the pipeline.
 *
 * @param {object|null|undefined} photo
 * @param {Set<string>|null} [startedIds]
 */
export function isEligibleForShadowPrepare(photo, startedIds = null) {
  if (!photo || typeof photo !== 'object') return false
  const id = photo.id != null ? String(photo.id) : ''
  if (!id) return false
  if (startedIds?.has(id)) return false
  if (!(photo.file instanceof Blob)) return false
  if (photo.imageUrl || photo.storagePath) return false
  const status = photo.shadowPrepare?.status
  if (
    status === SHADOW_PREPARE_STATUS.PENDING
    || status === SHADOW_PREPARE_STATUS.READY
    || status === SHADOW_PREPARE_STATUS.FAILED
  ) {
    return false
  }
  return true
}

/**
 * Attach pending shadowPrepare without mutating live file/preview.
 * @param {object} photo
 */
export function withShadowPreparePending(photo) {
  return {
    ...photo,
    shadowPrepare: {
      status: SHADOW_PREPARE_STATUS.PENDING,
      startedAt: Date.now(),
    },
  }
}

/**
 * @param {Awaited<ReturnType<typeof prepareZlogPhoto>>} prepared
 * @param {number} durationMs
 */
export function buildShadowPrepareReady(prepared, durationMs, completedAt = Date.now()) {
  return {
    status: SHADOW_PREPARE_STATUS.READY,
    pipelineId: prepared.pipelineId,
    durationMs: Number(durationMs) || 0,
    completedAt: Number(completedAt) || Date.now(),
    report: {
      blob: prepared.report.blob,
      width: prepared.report.width,
      height: prepared.report.height,
      byteSize: prepared.report.byteSize,
      mimeType: prepared.report.mimeType,
    },
    thumbnail: {
      blob: prepared.thumbnail.blob,
      width: prepared.thumbnail.width,
      height: prepared.thumbnail.height,
      byteSize: prepared.thumbnail.byteSize,
      mimeType: prepared.thumbnail.mimeType,
    },
    orientation: prepared.orientation || null,
  }
}

/**
 * @param {unknown} err
 * @param {number} durationMs
 */
export function buildShadowPrepareFailed(err, durationMs, completedAt = Date.now()) {
  const code = err && typeof err === 'object' && 'code' in err
    ? String(err.code || 'prepare-failed')
    : 'prepare-failed'
  const message = err instanceof Error
    ? err.message
    : 'Photo preparation failed'
  return {
    status: SHADOW_PREPARE_STATUS.FAILED,
    durationMs: Number(durationMs) || 0,
    completedAt: Number(completedAt) || Date.now(),
    code,
    message,
  }
}

/**
 * Accept a late shadow result only when it does not clobber a newer completion.
 * Pending is always overwritable. Terminal results keep the newest completedAt.
 *
 * @param {object|null|undefined} existing
 * @param {object|null|undefined} incoming
 */
export function shouldAcceptShadowPrepareResult(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return false
  if (!existing || typeof existing !== 'object') return true
  if (existing.status === SHADOW_PREPARE_STATUS.PENDING) return true
  const prev = Number(existing.completedAt) || 0
  const next = Number(incoming.completedAt) || 0
  return next >= prev
}

/**
 * Locate a photo by stable id in draft first, then committed locationWalk.
 * Returns null when the photo was deleted (late result must be discarded).
 *
 * @param {string} photoId
 * @param {{ draftPhotos?: object[], locationWalk?: object[] }} state
 * @returns {{ container: 'draft', groupId: '__draft__' } | { container: 'group', groupId: string } | null}
 */
export function findPhotoShadowTarget(photoId, { draftPhotos = [], locationWalk = [] } = {}) {
  const id = String(photoId || '')
  if (!id) return null
  if ((Array.isArray(draftPhotos) ? draftPhotos : []).some((p) => p && String(p.id) === id)) {
    return { container: 'draft', groupId: '__draft__' }
  }
  for (const group of Array.isArray(locationWalk) ? locationWalk : []) {
    if (!group || !Array.isArray(group.photos)) continue
    if (group.photos.some((p) => p && String(p.id) === id)) {
      return { container: 'group', groupId: String(group.id) }
    }
  }
  return null
}

/**
 * Patch only shadowPrepare — never replaces file / preview / imageUrl.
 * Skips the photo when a newer terminal result is already attached.
 * @param {object[]} photos
 * @param {string} photoId
 * @param {object} shadowPrepare
 */
export function applyShadowPrepareToPhotos(photos, photoId, shadowPrepare) {
  const list = Array.isArray(photos) ? photos : []
  const id = String(photoId)
  return list.map((photo) => {
    if (!photo || String(photo.id) !== id) return photo
    if (!shouldAcceptShadowPrepareResult(photo.shadowPrepare, shadowPrepare)) return photo
    return {
      ...photo,
      file: photo.file,
      preview: photo.preview,
      imageUrl: photo.imageUrl,
      shadowPrepare,
    }
  })
}

/**
 * Apply a late shadow result wherever the photo currently lives.
 * Does not recreate missing photos. Does not move photos between containers.
 *
 * @param {{
 *   photoId: string,
 *   shadowPrepare: object,
 *   draftPhotos?: object[],
 *   locationWalk?: object[],
 * }} input
 * @returns {{
 *   found: boolean,
 *   target: ReturnType<typeof findPhotoShadowTarget>,
 *   draftPhotos: object[],
 *   locationWalk: object[],
 * }}
 */
export function resolveShadowPrepareIntoState({
  photoId,
  shadowPrepare,
  draftPhotos = [],
  locationWalk = [],
} = {}) {
  const draft = Array.isArray(draftPhotos) ? draftPhotos : []
  const walk = Array.isArray(locationWalk) ? locationWalk : []

  // Prefer committed walk so late results follow Save Area (matches AiLocationWalk).
  const walkTarget = findPhotoShadowTarget(photoId, { draftPhotos: [], locationWalk: walk })
  if (walkTarget?.container === 'group') {
    return {
      found: true,
      target: walkTarget,
      draftPhotos: draft,
      locationWalk: walk.map((group) => {
        if (!group || String(group.id) !== String(walkTarget.groupId)) return group
        return {
          ...group,
          photos: applyShadowPrepareToPhotos(group.photos || [], photoId, shadowPrepare),
        }
      }),
    }
  }

  const draftTarget = findPhotoShadowTarget(photoId, { draftPhotos: draft, locationWalk: [] })
  if (!draftTarget) {
    return { found: false, target: null, draftPhotos: draft, locationWalk: walk }
  }
  return {
    found: true,
    target: draftTarget,
    draftPhotos: applyShadowPrepareToPhotos(draft, photoId, shadowPrepare),
    locationWalk: walk,
  }
}

/**
 * Dev-only diagnostic — never logs blobs, URLs, or credentials.
 * @param {string} photoId
 * @param {object} shadowPrepare
 */
export function logShadowPrepareDiagnostic(photoId, shadowPrepare) {
  if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'development') return
  if (typeof console === 'undefined' || typeof console.info !== 'function') return
  try {
    if (shadowPrepare?.status === SHADOW_PREPARE_STATUS.READY) {
      console.info('[zlog:shadow-prepare]', {
        photoId,
        status: 'ready',
        pipelineId: shadowPrepare.pipelineId,
        durationMs: shadowPrepare.durationMs,
        report: {
          width: shadowPrepare.report?.width,
          height: shadowPrepare.report?.height,
          byteSize: shadowPrepare.report?.byteSize,
          maxEdgeCap: ZLOG_REPORT_MAX_EDGE,
        },
        thumbnail: {
          width: shadowPrepare.thumbnail?.width,
          height: shadowPrepare.thumbnail?.height,
          byteSize: shadowPrepare.thumbnail?.byteSize,
          maxEdgeCap: ZLOG_THUMB_MAX_EDGE,
        },
      })
      return
    }
    if (shadowPrepare?.status === SHADOW_PREPARE_STATUS.FAILED) {
      console.info('[zlog:shadow-prepare]', {
        photoId,
        status: 'failed',
        code: shadowPrepare.code,
        durationMs: shadowPrepare.durationMs,
      })
    }
  } catch {
    // Diagnostics must never affect capture flow.
  }
}

/**
 * Build shadow jobs for newly selected photos (pending or fresh) and mark started.
 * Dedupes via startedIds so React Strict Mode / re-renders do not re-prepare.
 *
 * @param {object[]} photos
 * @param {Set<string>} startedIds
 * @returns {Array<{ id: string, file: Blob }>}
 */
export function collectShadowPrepareJobs(photos, startedIds) {
  const jobs = []
  for (const photo of Array.isArray(photos) ? photos : []) {
    if (!photo || typeof photo !== 'object') continue
    const id = photo.id != null ? String(photo.id) : ''
    if (!id) continue
    if (startedIds?.has(id)) continue
    if (!(photo.file instanceof Blob)) continue
    if (photo.imageUrl || photo.storagePath) continue
    const status = photo.shadowPrepare?.status
    if (
      status === SHADOW_PREPARE_STATUS.READY
      || status === SHADOW_PREPARE_STATUS.FAILED
    ) {
      continue
    }
    startedIds?.add(id)
    jobs.push({ id, file: photo.file })
  }
  return jobs
}

/**
 * Bounded concurrent shadow prepare. Failures are per-photo; never throw the batch.
 *
 * @param {Array<{ id: string, file: Blob }>} jobs
 * @param {{
 *   concurrency?: number,
 *   prepareFn?: typeof prepareZlogPhoto,
 *   onResult?: (photoId: string, shadowPrepare: object) => void,
 *   now?: () => number,
 * }} [opts]
 */
export async function runShadowPrepareJobs(jobs, opts = {}) {
  const list = Array.isArray(jobs) ? jobs : []
  if (!list.length) return []
  const concurrency = opts.concurrency ?? SHADOW_INGEST_CONCURRENCY
  const prepareFn = opts.prepareFn ?? prepareZlogPhoto
  const onResult = opts.onResult
  const now = opts.now ?? (() => Date.now())

  return mapWithConcurrency(list, concurrency, async (job) => {
    const started = now()
    let shadowPrepare
    try {
      const prepared = await prepareFn(job.file)
      shadowPrepare = buildShadowPrepareReady(prepared, now() - started)
    } catch (err) {
      shadowPrepare = buildShadowPrepareFailed(err, now() - started)
    }
    logShadowPrepareDiagnostic(job.id, shadowPrepare)
    try {
      onResult?.(job.id, shadowPrepare)
    } catch {
      // Caller patch failures must not abort remaining jobs.
    }
    return { id: job.id, shadowPrepare }
  })
}
