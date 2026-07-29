/**
 * Shared persistence helpers for AI annotation photo items.
 * Modules decide when to call these — no report-specific branching here.
 */

/**
 * Upload one annotation image to site-photos storage.
 * @returns {Promise<string>} storage path
 */
export async function uploadAnnotationImage(supabase, { userId, projectId, folder, file, index = 0 }) {
  if (!file) throw new Error('No file to upload')
  const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg'
  const storagePath = `${userId}/${projectId}/${folder}/${Date.now()}-${index}.${ext}`
  const { error } = await supabase.storage
    .from('site-photos')
    .upload(storagePath, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return storagePath
}

/**
 * Convert in-memory annotation items to persistable JSON rows.
 * Uploads new files; keeps existing storagePath.
 */
export async function persistAnnotationItems(supabase, {
  userId,
  projectId,
  folder,
  items = [],
}) {
  const out = []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item.file) {
      const url = await uploadAnnotationImage(supabase, {
        userId,
        projectId,
        folder,
        file: item.file,
        index: i,
      })
      out.push({
        url,
        description: item.description || '',
        location: item.area || item.location || '',
        area: item.area || item.location || '',
        sequence: i + 1,
      })
    } else if (item.storagePath || item.url) {
      out.push({
        url: item.storagePath || item.url,
        description: item.description || '',
        location: item.area || item.location || '',
        area: item.area || item.location || '',
        sequence: i + 1,
      })
    }
  }
  return out
}

export function makeAnnotationItemKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
