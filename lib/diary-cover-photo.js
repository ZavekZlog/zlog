/**
 * Site Diary cover photo hydrate / save helpers.
 * Persistence key is storagePath — preview is display-only.
 *
 * CRITICAL: an untouched cover must NEVER become cover_photo_url: null on UPDATE.
 * Only explicit Remove clears the DB field. Prefer omitting the key when unknown.
 */

/**
 * Build UI cover state from a saved storage path.
 * Always retains storagePath when present so save does not wipe the cover.
 */
export function coverPhotoStateFromSaved(storagePath, previewUrl = null) {
  if (!storagePath) return null
  return {
    file: null,
    preview: previewUrl || null,
    storagePath: String(storagePath),
  }
}

/**
 * Resolve a displayable URL for a storage path or absolute URL.
 * @param {{ storage: { from: (bucket: string) => { createSignedUrl: Function } } }} supabase
 */
export async function resolveCoverPhotoPreviewUrl(supabase, path) {
  if (!path) return null
  const raw = String(path)
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  try {
    const { data, error } = await supabase.storage.from('site-photos').createSignedUrl(raw, 3600)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
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
    return { needsUpload: false, file: null, patch: { cover_photo_url: null } }
  }

  if (uploadedPath) {
    return {
      needsUpload: false,
      file: null,
      patch: { cover_photo_url: String(uploadedPath) },
    }
  }

  if (coverPhoto?.file) {
    return { needsUpload: true, file: coverPhoto.file, patch: null }
  }

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
    return base
  }
  return {
    ...base,
    cover_photo_url: plan.patch.cover_photo_url,
  }
}
