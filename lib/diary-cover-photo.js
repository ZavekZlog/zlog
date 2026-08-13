/**
 * Site Diary cover photo hydrate / save helpers.
 * Persistence key is storagePath — preview is display-only.
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
 */
export function resolveCoverPhotoUrlForSave({
  coverPhoto = null,
  loadedCoverPath = null,
  coverRemoved = false,
} = {}) {
  if (coverRemoved) return null
  if (coverPhoto?.storagePath) return coverPhoto.storagePath
  if (coverPhoto?.file) return null // caller must upload first; path not ready
  if (loadedCoverPath) return loadedCoverPath
  return null
}
