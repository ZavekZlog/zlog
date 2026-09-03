/**
 * Site Diary cover photo hydrate / save helpers.
 * Persistence key is storagePath — preview is display-only.
 *
 * CRITICAL: an untouched cover must NEVER become cover_photo_url: null on UPDATE.
 * Only explicit Remove clears the DB field. Prefer omitting the key when unknown.
 */

import {
  prepareCanonicalCoverBlob,
  preparedCoverStoragePath,
  rawCoverStoragePath,
  ZLOG_COVER_MIME,
  ZLOG_COVER_PIPELINE_ID,
} from './cover-pipeline.js'
import {
  markShareTiming,
  patchShareTimingCounts,
} from './diary-share-timing-diag.js'

export { preparedCoverStoragePath, rawCoverStoragePath, ZLOG_COVER_PIPELINE_ID }

/** Pending local files use this non-writable sentinel so autosave dirties and uploads first. */
export const COVER_AUTOSAVE_PENDING_PREFIX = '__cover_pending__:'

export function isCoverAutosavePendingToken(value) {
  return typeof value === 'string' && value.startsWith(COVER_AUTOSAVE_PENDING_PREFIX)
}

/**
 * Durable cover storage path / absolute URL for hydrate + review.
 * Strips accidental bucket prefixes; rejects autosave pending sentinels.
 */
export function normalizeCoverStoragePath(path) {
  if (path == null) return null
  let raw = String(path).trim()
  if (!raw) return null
  if (isCoverAutosavePendingToken(raw)) return null
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  raw = raw.replace(/^\/+/, '')
  if (/^site-photos\//i.test(raw)) {
    raw = raw.replace(/^site-photos\//i, '')
  }
  return raw || null
}

/**
 * Build UI cover state from a saved storage path.
 * Always retains storagePath when present so save does not wipe the cover.
 */
export function coverPhotoStateFromSaved(storagePath, previewUrl = null, extras = {}) {
  const path = normalizeCoverStoragePath(storagePath)
  if (!path) return null
  const preparedBlob = extras?.preparedBlob instanceof Blob && extras.preparedBlob.size > 0
    ? extras.preparedBlob
    : null
  return {
    file: null,
    preview: previewUrl || null,
    storagePath: path,
    preparedBlob,
  }
}

/**
 * True when the storage object is a C1 prepared cover JPEG (`…/covers/{generation}.jpg`).
 * Excludes raw fallback (`…/covers/raw/…`) and legacy `cover.jpg`.
 */
export function isPreparedCoverStoragePath(path) {
  const raw = normalizeCoverStoragePath(path)
  if (!raw) return false
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return false
  return /\/covers\/(?!raw\/)[^/]+\.jpg$/i.test(raw)
}

/**
 * PDF may skip orientation bake when the durable object is a prepared cover,
 * or when this session still holds the prepared JPEG blob for that path.
 */
export function isPreparedCoverForPdf({
  coverPath = null,
} = {}) {
  return isPreparedCoverStoragePath(coverPath)
}

/**
 * Convert JPEG/PNG bytes to a data URL without decode/canvas (not an orientation bake).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function coverBlobToPdfDataUrl(blob) {
  if (!(blob instanceof Blob) || blob.size < 1) {
    throw new Error('Cover photo for the PDF was empty.')
  }
  if (typeof FileReader === 'function') {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read the cover photo for the PDF.'))
      reader.readAsDataURL(blob)
    })
    if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
      throw new Error('Could not read the cover photo for the PDF.')
    }
    return dataUrl
  }
  const buf = Buffer.from(await blob.arrayBuffer())
  const mime = blob.type || ZLOG_COVER_MIME
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Persist a new cover as an upright bounded JPEG. Falls back to raw bytes only
 * when preparation or prepared-object upload fails (legacy PDF bake).
 */
export async function persistCanonicalCoverUpload(supabase, {
  userId,
  reportId,
  generation,
  file,
  prepareFn = prepareCanonicalCoverBlob,
} = {}) {
  if (!supabase || !userId || !reportId || !generation || !file) {
    return {
      storagePath: null,
      error: { message: 'missing-canonical-cover-upload-args' },
      prepared: false,
      preparedBlob: null,
      coverProcessingVersion: null,
    }
  }

  markShareTiming('cover_prepare_start')
  let prepared = null
  try {
    prepared = await prepareFn(file)
  } catch (error) {
    markShareTiming('cover_prepare_failed')
    prepared = null
    const fallback = await uploadRawCoverFallbackFile(supabase, {
      userId,
      reportId,
      generation,
      file,
    })
    markShareTiming('cover_persist_done')
    return {
      storagePath: fallback.storagePath,
      error: fallback.error,
      prepared: false,
      preparedBlob: null,
      coverProcessingVersion: null,
      prepareError: error,
    }
  }

  const preparedBlob = prepared?.blob
  if (!(preparedBlob instanceof Blob) || preparedBlob.size < 1) {
    markShareTiming('cover_prepare_failed')
    const fallback = await uploadRawCoverFallbackFile(supabase, {
      userId,
      reportId,
      generation,
      file,
    })
    markShareTiming('cover_persist_done')
    return {
      storagePath: fallback.storagePath,
      error: fallback.error,
      prepared: false,
      preparedBlob: null,
      coverProcessingVersion: null,
    }
  }

  markShareTiming('cover_prepare_done')
  const uploaded = await uploadPreparedCoverFile(supabase, {
    userId,
    reportId,
    generation,
    file: preparedBlob,
  })
  if (uploaded.error || !uploaded.storagePath) {
    const fallback = await uploadRawCoverFallbackFile(supabase, {
      userId,
      reportId,
      generation,
      file,
    })
    markShareTiming('cover_persist_done')
    return {
      storagePath: fallback.storagePath,
      error: fallback.error,
      prepared: false,
      preparedBlob: null,
      coverProcessingVersion: null,
    }
  }

  markShareTiming('cover_persist_done')
  return {
    storagePath: uploaded.storagePath,
    error: null,
    prepared: true,
    preparedBlob,
    coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
    width: prepared.width,
    height: prepared.height,
  }
}

/**
 * PDF cover source: prepared JPEG pass-through (local blob or fetch, no bake);
 * legacy/raw covers keep the caller’s orientation bake.
 *
 * @param {string|null} signedCoverUrl
 * @param {{
 *   coverPath?: string|null,
 *   coverProcessingVersion?: string|null,
 *   localPreparedBlob?: Blob|null,
 *   uprightCoverFn: (url: string|null) => Promise<string|null>,
 * }} options
 */
export async function resolveCoverPdfSource(signedCoverUrl, {
  coverPath = null,
  coverProcessingVersion = null,
  localPreparedBlob = null,
  uprightCoverFn,
} = {}) {
  markShareTiming('pdf_asset_sign_done')
  markShareTiming('pdf_cover_source_start')
  const prepared = isPreparedCoverForPdf({
    coverPath,
    coverProcessingVersion,
    localPreparedBlob,
  })

  if (prepared && localPreparedBlob instanceof Blob && localPreparedBlob.size > 0) {
    patchShareTimingCounts({
      coverPreparedSource: 'local',
      coverNetworkFetchCount: 0,
      coverOrientationBakeCount: 0,
      coverPassThroughCount: 1,
    })
    const dataUrl = await coverBlobToPdfDataUrl(localPreparedBlob)
    markShareTiming('pdf_cover_source_done')
    return dataUrl
  }

  if (prepared) {
    if (!signedCoverUrl) {
      patchShareTimingCounts({
        coverPreparedSource: 'network',
        coverOrientationBakeCount: 0,
        coverPassThroughCount: 1,
      })
      markShareTiming('pdf_cover_source_done')
      return null
    }
    const raw = String(signedCoverUrl)
    if (raw.startsWith('data:')) {
      patchShareTimingCounts({
        coverPreparedSource: 'network',
        coverOrientationBakeCount: 0,
        coverPassThroughCount: 1,
      })
      markShareTiming('pdf_cover_source_done')
      return raw
    }
    const res = await fetch(raw)
    if (!res.ok) {
      throw new Error('Could not download the cover photo for the PDF.')
    }
    const blob = await res.blob()
    if (!blob || !blob.size) {
      throw new Error('Cover photo for the PDF was empty.')
    }
    patchShareTimingCounts({
      coverPreparedSource: 'network',
      coverNetworkFetchCount: 1,
      coverOrientationBakeCount: 0,
      coverPassThroughCount: 1,
    })
    const dataUrl = await coverBlobToPdfDataUrl(blob)
    markShareTiming('pdf_cover_source_done')
    return dataUrl
  }

  patchShareTimingCounts({
    coverPreparedSource: 'legacy',
    coverPassThroughCount: 0,
    coverOrientationBakeCount: 1,
  })
  if (typeof uprightCoverFn !== 'function') {
    throw new Error('Could not normalize cover photo orientation for the PDF.')
  }
  const baked = await uprightCoverFn(signedCoverUrl)
  markShareTiming('pdf_cover_source_done')
  return baked
}

/**
 * Resolve a displayable URL for a storage path or absolute URL.
 * @param {{ storage: { from: (bucket: string) => { createSignedUrl: Function } } }} supabase
 */
export async function resolveCoverPhotoPreviewUrl(supabase, path) {
  const raw = normalizeCoverStoragePath(path)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  try {
    const { data, error } = await supabase.storage.from('site-photos').createSignedUrl(raw, 3600)
    if (error || !data) return null
    // Client maps to signedUrl; tolerate signedURL if a raw/legacy payload appears.
    return data.signedUrl || data.signedURL || null
  } catch {
    return null
  }
}

/**
 * Final cover_photo_url for save — never invent; preserve loaded path unless removed/replaced.
 * @deprecated Prefer planCoverPhotoPersistence — this helper can return null and callers that
 * always write the result will wipe the DB column. Kept for transitional call sites.
 */
export function resolveCoverPhotoUrlForSave({
  coverPhoto = null,
  loadedCoverPath = null,
  coverRemoved = false,
} = {}) {
  const plan = planCoverPhotoPersistence({
    coverPhoto,
    loadedCoverPath,
    coverRemoved,
  })
  if (plan.patch && Object.prototype.hasOwnProperty.call(plan.patch, 'cover_photo_url')) {
    return plan.patch.cover_photo_url
  }
  if (plan.needsUpload) return null
  return loadedCoverPath || coverPhoto?.storagePath || null
}

/**
 * Plan how cover_photo_url should be persisted on daily_reports UPDATE.
 *
 * @returns {{
 *   needsUpload: boolean,
 *   file: object|null,
 *   patch: { cover_photo_url: string|null } | null
 * }}
 * - patch null → OMIT cover_photo_url from the UPDATE (preserve existing DB value)
 * - patch { cover_photo_url: path } → set / keep path
 * - patch { cover_photo_url: null } → explicit Remove only
 */
export function planCoverPhotoPersistence({
  coverPhoto = null,
  loadedCoverPath = null,
  coverRemoved = false,
  uploadedPath = null,
} = {}) {
  if (coverRemoved) {
    return {
      needsUpload: false,
      file: null,
      patch: { cover_photo_url: null, cover_processing_version: null },
    }
  }

  if (uploadedPath) {
    return {
      needsUpload: false,
      file: null,
      patch: { cover_photo_url: String(uploadedPath) },
    }
  }

  // A) New local File/Blob still needs upload — only when no durable path yet.
  //    After a successful upload we clear `file` and keep `storagePath`.
  //    Replacement selection clears `storagePath` in onCoverDrop before setting a new file.
  if (coverPhoto?.file && !coverPhoto?.storagePath) {
    return { needsUpload: true, file: coverPhoto.file, patch: null }
  }

  // B) Already-uploaded / reopened cover — keep the canonical path; do not re-upload.
  const existingPath =
    (coverPhoto?.storagePath && String(coverPhoto.storagePath)) ||
    (loadedCoverPath && String(loadedCoverPath)) ||
    null

  if (existingPath) {
    return {
      needsUpload: false,
      file: null,
      patch: { cover_photo_url: existingPath },
    }
  }

  // No local cover and user did not remove — do not send null (would wipe DB).
  return { needsUpload: false, file: null, patch: null }
}

/**
 * Storage object path for a report cover photo (report-scoped, not ephemeral pending/).
 */
export function coverPhotoStoragePath(userId, reportId, ext = 'jpg') {
  const safeExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  return `${userId}/${reportId}/cover.${safeExt}`
}

/**
 * Upload a cover File to the canonical report-scoped storage path.
 * Remove-then-INSERT so replacement works without a Storage UPDATE policy
 * (bucket only allows select/insert/delete). Callers must not re-upload when
 * storagePath is already set on cover state.
 */
/**
 * INSERT-only upload of a prepared canonical cover at an immutable generation path.
 * Never upserts or overwrites an existing object key.
 */
export async function uploadPreparedCoverFile(supabase, { userId, reportId, generation, file } = {}) {
  if (!supabase || !userId || !reportId || !generation || !file) {
    return { storagePath: null, error: { message: 'missing-prepared-cover-upload-args' } }
  }
  const storagePath = preparedCoverStoragePath(userId, reportId, generation)
  if (!storagePath) {
    return { storagePath: null, error: { message: 'invalid-prepared-cover-path' } }
  }
  const { error } = await supabase.storage.from('site-photos').upload(storagePath, file, {
    contentType: ZLOG_COVER_MIME,
    upsert: false,
  })
  if (error) return { storagePath: null, error }
  return { storagePath, error: null }
}

/**
 * INSERT-only upload of raw cover bytes at an immutable generation path (prepare failure).
 * Never upserts, never touches shared cover.jpg.
 */
export async function uploadRawCoverFallbackFile(supabase, { userId, reportId, generation, file } = {}) {
  if (!supabase || !userId || !reportId || !generation || !file) {
    return { storagePath: null, error: { message: 'missing-raw-cover-upload-args' } }
  }
  const storagePath = rawCoverStoragePath(userId, reportId, generation)
  if (!storagePath) {
    return { storagePath: null, error: { message: 'invalid-raw-cover-path' } }
  }
  const { error } = await supabase.storage.from('site-photos').upload(storagePath, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) return { storagePath: null, error }
  return { storagePath, error: null }
}

/**
 * Fields for updateDiarySetupFields after background cover sync.
 * @param {{ storagePath: string, coverProcessingVersion?: string|null, removed?: boolean }} args
 */
export function coverSetupFieldsFromSync({
  storagePath,
  coverProcessingVersion = undefined,
  removed = false,
} = {}) {
  if (removed) {
    return { coverPhotoUrl: null, coverProcessingVersion: null }
  }
  /** @type {{ coverPhotoUrl: string, coverProcessingVersion?: string|null }} */
  const fields = { coverPhotoUrl: storagePath }
  if (coverProcessingVersion === ZLOG_COVER_PIPELINE_ID) {
    fields.coverProcessingVersion = ZLOG_COVER_PIPELINE_ID
  } else if (coverProcessingVersion === null) {
    fields.coverProcessingVersion = null
  }
  return fields
}

/** True when a storage path is safe for best-effort post-replace cleanup. */
export function isSafeCoverCleanupPath(path) {
  const raw = normalizeCoverStoragePath(path)
  if (!raw) return false
  return /\/covers\/(?:raw\/)?[^/]+\.jpg$/i.test(raw) || /\/cover\.jpg$/i.test(raw)
}

/**
 * Best-effort remove of a superseded cover object — never throws.
 * @param {object} supabase
 * @param {string|null|undefined} storagePath
 */
export async function bestEffortRemoveCoverObject(supabase, storagePath) {
  const path = normalizeCoverStoragePath(storagePath)
  if (!supabase || !path || !isSafeCoverCleanupPath(path)) return
  try {
    await supabase.storage.from('site-photos').remove([path])
  } catch {
    /* ignore */
  }
}

export async function uploadCoverPhotoFile(supabase, { userId, reportId, file } = {}) {
  // LEGACY ONLY — pre-C1 shared mutable path. Do not call for new cover selections (C1+).
  if (!supabase || !userId || !reportId || !file) {
    return { storagePath: null, error: { message: 'missing-cover-upload-args' } }
  }
  const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg'
  const storagePath = coverPhotoStoragePath(userId, reportId, ext)
  const bucket = supabase.storage.from('site-photos')
  // Best-effort remove of any prior object at this path (ignore missing).
  try {
    await bucket.remove([storagePath])
  } catch {
    /* ignore */
  }
  const { error } = await bucket.upload(storagePath, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) return { storagePath: null, error }
  return { storagePath, error: null }
}

/**
 * Client state after a successful cover upload — durable path only (no local File).
 */
export function coverPhotoStateAfterUpload(storagePath, previewUrl = null, extras = {}) {
  return coverPhotoStateFromSaved(storagePath, previewUrl, extras)
}

/**
 * Durable cover_photo_url for autosave / form snapshot comparison.
 * Pending local files use a non-writable sentinel so autosave dirties and uploads first.
 */
export function coverPhotoUrlForAutosave({
  coverPhoto = null,
  loadedCoverPath = null,
  coverRemoved = false,
} = {}) {
  if (coverRemoved) return null
  if (coverPhoto?.storagePath) return String(coverPhoto.storagePath)
  if (coverPhoto?.file) {
    const file = coverPhoto.file
    return `${COVER_AUTOSAVE_PENDING_PREFIX}${file.name || 'cover'}:${file.size || 0}:${file.lastModified || 0}`
  }
  if (loadedCoverPath) return String(loadedCoverPath)
  return null
}

/**
 * Merge a cover patch into a report update payload without inventing null wipes.
 */
/**
 * True when a required durable cover path is actually on the saved row.
 * A missing expected path means this save did not persist cover.
 */
export function coverPhotoPersistedOnRow(row, expectedPath) {
  if (!expectedPath) return true
  return String(row?.cover_photo_url || '') === String(expectedPath)
}

export function applyCoverPhotoPatch(reportPayload, plan) {
  const base = { ...(reportPayload || {}) }
  if (!plan?.patch) {
    // Ensure we do not accidentally carry a prior null from callers.
    if (base.cover_photo_url == null) {
      delete base.cover_photo_url
    }
    if (base.cover_processing_version == null) {
      delete base.cover_processing_version
    }
    return base
  }
  const next = {
    ...base,
    cover_photo_url: plan.patch.cover_photo_url,
  }
  if (Object.prototype.hasOwnProperty.call(plan.patch, 'cover_processing_version')) {
    next.cover_processing_version = plan.patch.cover_processing_version
  }
  return next
}
