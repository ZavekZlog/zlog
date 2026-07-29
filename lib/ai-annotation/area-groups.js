/**
 * Shared Location Walk area-group model.
 * Used by Diary, Survey, Progress, Snags, and H&S consumers.
 *
 * locationWalk = [
 *   { id, areaName, createdAt, photos: [{ id, file?, preview, imageUrl?, acceptedDescription, timestamp }] }
 * ]
 */

export function makeWalkId(prefix = 'area') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createAreaGroup(areaName) {
  const name = String(areaName || '').trim()
  return {
    id: makeWalkId('area'),
    areaName: name,
    createdAt: new Date().toISOString(),
    photos: [],
  }
}

export function createAreaPhoto({ file, preview, description, imageUrl = null }) {
  return {
    id: makeWalkId('photo'),
    file: file || null,
    preview: preview || imageUrl || null,
    imageUrl: imageUrl || null,
    acceptedDescription: String(description || '').trim(),
    timestamp: new Date().toISOString(),
  }
}

/** Flatten area groups → rows for storage / report_photos */
export function flattenAreaGroups(locationWalk = []) {
  const rows = []
  let sequence = 0
  for (const group of locationWalk) {
    const areaName = group.areaName || ''
    for (const photo of group.photos || []) {
      sequence += 1
      rows.push({
        key: photo.id,
        file: photo.file || null,
        preview: photo.preview || null,
        storagePath: photo.imageUrl || null,
        caption: photo.acceptedDescription || '',
        description: photo.acceptedDescription || '',
        location: areaName,
        area: areaName,
        sequence,
        layout: 'grid4',
      })
    }
  }
  return rows
}

/**
 * Rebuild area groups from flat photo rows that carry a location/area.
 * Order preserved by first appearance of each area name.
 */
export function groupPhotosByArea(flatPhotos = []) {
  const order = []
  const map = new Map()

  for (const p of flatPhotos) {
    const areaName = String(p.location || p.area || '').trim()
    if (!areaName) continue
    if (!map.has(areaName)) {
      const group = {
        id: makeWalkId('area'),
        areaName,
        createdAt: p.timestamp || new Date().toISOString(),
        photos: [],
      }
      map.set(areaName, group)
      order.push(areaName)
    }
    map.get(areaName).photos.push({
      id: p.key || p.id || makeWalkId('photo'),
      file: p.file || null,
      preview: p.preview || null,
      imageUrl: p.storagePath || p.url || p.imageUrl || null,
      acceptedDescription: p.caption || p.description || p.acceptedDescription || '',
      timestamp: p.timestamp || new Date().toISOString(),
    })
  }

  return order.map((name) => map.get(name))
}

/** Recently used area names (newest first), unique. */
export function collectRecentAreaNames(locationWalk = [], extra = [], limit = 8) {
  const seen = new Set()
  const out = []
  const candidates = [
    ...[...locationWalk].reverse().map((g) => g.areaName),
    ...extra,
  ]
  for (const name of candidates) {
    const n = String(name || '').trim()
    if (!n) continue
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
    if (out.length >= limit) break
  }
  return out
}

const RECENT_STORAGE_PREFIX = 'zlog:recent-areas:v1:'

export function readRecentAreas(projectId) {
  if (!projectId || typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(`${RECENT_STORAGE_PREFIX}${projectId}`)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()) : []
  } catch {
    return []
  }
}

export function rememberRecentArea(projectId, areaName) {
  if (!projectId || typeof window === 'undefined') return
  const name = String(areaName || '').trim()
  if (!name) return
  try {
    const prev = readRecentAreas(projectId)
    const next = collectRecentAreaNames([], [name, ...prev], 12)
    window.sessionStorage.setItem(`${RECENT_STORAGE_PREFIX}${projectId}`, JSON.stringify(next))
  } catch {
    // ignore
  }
}
