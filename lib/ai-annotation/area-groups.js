/**
 * Location Walk area-group model.
 * Areas own photos + layout (1 / 4 / 6 per page). Original images stay untouched;
 * annotations live as structured overlay data on each photo.
 *
 * locationWalk = [
 *   {
 *     id, areaName, createdAt, layout: 'full'|'grid4'|'grid6',
 *     photos: [{
 *       id, file?, preview, imageUrl?,
 *       acceptedDescription (caption),
 *       annotations?, overlayPreview?, overlayPath?, overlayDirty?
 *     }]
 *   }
 * ]
 */

export const LAYOUT_OPTIONS = [
  { value: 1, layout: 'full', label: '1' },
  { value: 4, layout: 'grid4', label: '4' },
  { value: 6, layout: 'grid6', label: '6' },
]

export function layoutToPerPage(layout) {
  if (layout === 'full') return 1
  if (layout === 'grid6') return 6
  return 4
}

export function perPageToLayout(n) {
  if (Number(n) === 1) return 'full'
  if (Number(n) === 6) return 'grid6'
  return 'grid4'
}

export function makeWalkId(prefix = 'area') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createAreaGroup(areaName, perPage = 4) {
  const name = String(areaName || '').trim()
  return {
    id: makeWalkId('area'),
    areaName: name,
    createdAt: new Date().toISOString(),
    layout: perPageToLayout(perPage),
    photos: [],
  }
}

export function createAreaPhoto({
  file,
  preview,
  description = '',
  imageUrl = null,
  annotations = null,
  overlayPreview = null,
  overlayPath = null,
  rotationDegrees = 0,
} = {}) {
  return {
    id: makeWalkId('photo'),
    file: file || null,
    preview: preview || imageUrl || null,
    imageUrl: imageUrl || null,
    acceptedDescription: String(description || '').trim(),
    annotations: annotations || null,
    overlayPreview: overlayPreview || null,
    overlayPath: overlayPath || null,
    overlayDirty: false,
    rotationDegrees: Number(rotationDegrees) || 0,
  }
}

/**
 * Flatten area groups → rows for storage / PDF / report_photos.
 * Continuous Photo 1..N across the whole report (area order, then photo order).
 */
export function flattenAreaGroups(locationWalk = []) {
  const rows = []
  let sequence = 0
  for (const group of locationWalk) {
    const areaName = group.areaName || ''
    const layout = group.layout || 'grid4'
    for (const photo of group.photos || []) {
      sequence += 1
      rows.push({
        key: photo.id,
        file: photo.file || null,
        preview: photo.preview || null,
        storagePath: photo.imageUrl || photo.storagePath || null,
        caption: photo.acceptedDescription || photo.caption || '',
        description: photo.acceptedDescription || photo.caption || '',
        location: areaName,
        area: areaName,
        sequence,
        sequence_number: sequence,
        layout,
        annotations: photo.annotations || null,
        overlayPath: photo.overlayPath || null,
        overlayPreview: photo.overlayPreview || null,
        overlayDirty: Boolean(photo.overlayDirty),
        areaId: group.id,
      })
    }
  }
  return rows
}

/**
 * Rebuild area groups from flat photo rows.
 * Preserves area order (first appearance), photo order, layout, captions, annotations.
 */
export function groupPhotosByArea(flatPhotos = []) {
  const order = []
  const map = new Map()

  for (const p of flatPhotos) {
    const areaName = String(p.location || p.area || '').trim() || 'Work photos'
    if (!map.has(areaName)) {
      map.set(areaName, {
        id: p.areaId || makeWalkId('area'),
        areaName,
        createdAt: p.createdAt || new Date().toISOString(),
        layout: p.layout || 'grid4',
        photos: [],
      })
      order.push(areaName)
    }
    const group = map.get(areaName)
    if (p.layout) group.layout = p.layout
    group.photos.push({
      id: p.key || p.id || makeWalkId('photo'),
      file: p.file || null,
      preview: p.preview || null,
      imageUrl: p.storagePath || p.url || p.imageUrl || null,
      acceptedDescription: p.caption || p.description || p.acceptedDescription || '',
      annotations: p.annotations || null,
      overlayPreview: p.overlayPreview || null,
      overlayPath: p.overlayPath || null,
      overlayDirty: false,
    })
  }

  return order.map((name) => map.get(name))
}

/** Photos with no usable description (caption / acceptedDescription). */
export function photosMissingDescription(locationWalk = []) {
  return flattenAreaGroups(locationWalk).filter(
    (p) => !String(p.caption || p.description || '').trim(),
  )
}

/** True when the in-memory / flat photo has a non-empty trimmed description. */
export function photoHasDescription(photo) {
  return String(
    photo?.acceptedDescription || photo?.caption || photo?.description || '',
  ).trim().length > 0
}

/**
 * First photo missing a description in walk order.
 * @returns {{ groupId: string, index: number, sequence: number } | null}
 */
export function firstIncompletePhoto(locationWalk = []) {
  let sequence = 0
  for (const group of locationWalk || []) {
    const photos = group.photos || []
    for (let index = 0; index < photos.length; index += 1) {
      sequence += 1
      if (!photoHasDescription(photos[index])) {
        return { groupId: group.id, index, sequence }
      }
    }
  }
  return null
}

export function moveItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list)) return list
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return list
  }
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

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
