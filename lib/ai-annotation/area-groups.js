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
 *       assignedTo (optional responsibility),
 *       rotationDegrees (0|90|180|270),
 *       annotations?, overlayPreview?, overlayPath?, overlayDirty?
 *     }]
 *   }
 * ]
 */

import { normalizeRotationDegrees } from '../diary-pdf-layout.js'

const AREA_NOTES_CATEGORY_PREFIX = 'zlog-area-notes:v1:'

export function encodeAreaNotesCategory(notes) {
  const value = String(notes || '').trim()
  return value ? `${AREA_NOTES_CATEGORY_PREFIX}${value}` : null
}

export function decodeAreaNotesCategory(category) {
  const value = String(category || '')
  if (!value.startsWith(AREA_NOTES_CATEGORY_PREFIX)) return ''
  return value.slice(AREA_NOTES_CATEGORY_PREFIX.length)
}

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

/**
 * Stable area id across progressive hydrate / reopen.
 * DB does not store areaId — location name is the durable key.
 * Prefer an explicit areaId when present (in-session create/edit).
 */
export function stableAreaGroupId(areaName, areaId = null) {
  if (areaId != null && String(areaId).trim()) return String(areaId).trim()
  const name = String(areaName || '').trim() || 'Work photos'
  return `area:${name}`
}

/**
 * Stable photo id from persisted identity (db id → storage path → row key).
 * Must not invent a fresh UUID on every hydrate, or Edit / delete lose the row.
 */
export function stablePhotoId(row = {}, fallbackIndex = 0) {
  const candidates = [
    row.id,
    row.key,
    row.storagePath,
    row.url,
    row.imageUrl,
  ]
  for (const value of candidates) {
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return makeWalkId(`photo-${fallbackIndex}`)
}

/**
 * Resolve a saved area for the canonical Edit composer.
 * @returns {{
 *   group: object,
 *   groupId: string,
 *   nameDraft: string,
 *   descriptionDraft: string,
 *   perPageDraft: number,
 * } | null}
 */
export function openSavedAreaForEdit(locationWalk = [], groupId) {
  if (groupId == null || groupId === '') return null
  const walk = Array.isArray(locationWalk) ? locationWalk : []
  const group = walk.find((g) => g && g.id === groupId) || null
  if (!group) return null
  return {
    group,
    groupId: group.id,
    nameDraft: String(group.areaName || ''),
    descriptionDraft: String(group.description || ''),
    perPageDraft: layoutToPerPage(group.layout),
  }
}

export function createAreaGroup(areaName, perPage = 4) {
  const name = String(areaName || '').trim()
  return {
    id: makeWalkId('area'),
    areaName: name,
    createdAt: new Date().toISOString(),
    layout: perPageToLayout(perPage),
    description: '',
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
  assignedTo = '',
} = {}) {
  return {
    id: makeWalkId('photo'),
    file: file || null,
    preview: preview || imageUrl || null,
    imageUrl: imageUrl || null,
    acceptedDescription: String(description || '').trim(),
    assignedTo: String(assignedTo || '').trim(),
    annotations: annotations || null,
    overlayPreview: overlayPreview || null,
    overlayPath: overlayPath || null,
    overlayDirty: false,
    rotationDegrees: normalizeRotationDegrees(rotationDegrees),
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
    const category = encodeAreaNotesCategory(group.description)
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
        assignedTo: String(photo.assignedTo || photo.assigned_to || '').trim(),
        location: areaName,
        area: areaName,
        category,
        sequence,
        sequence_number: sequence,
        layout,
        annotations: photo.annotations || null,
        overlayPath: photo.overlayPath || null,
        overlayPreview: photo.overlayPreview || null,
        overlayDirty: Boolean(photo.overlayDirty),
        areaId: group.id,
        rotationDegrees: normalizeRotationDegrees(
          photo.rotationDegrees ?? photo.rotation_degrees,
        ),
        // Phase C: transient prepare + durable prepared-asset metadata (passthrough).
        shadowPrepare: photo.shadowPrepare || null,
        thumbnailPath: photo.thumbnailPath || null,
        reportWidth: photo.reportWidth ?? null,
        reportHeight: photo.reportHeight ?? null,
        thumbnailWidth: photo.thumbnailWidth ?? null,
        thumbnailHeight: photo.thumbnailHeight ?? null,
        reportByteSize: photo.reportByteSize ?? null,
        thumbnailByteSize: photo.thumbnailByteSize ?? null,
        processingVersion: photo.processingVersion || null,
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
        id: stableAreaGroupId(areaName, p.areaId),
        areaName,
        description: decodeAreaNotesCategory(p.category),
        createdAt: p.createdAt || new Date().toISOString(),
        layout: p.layout || 'grid4',
        photos: [],
      })
      order.push(areaName)
    }
    const group = map.get(areaName)
    if (p.layout) group.layout = p.layout
    if (!group.description) group.description = decodeAreaNotesCategory(p.category)
    group.photos.push({
      id: stablePhotoId(p, group.photos.length),
      file: p.file || null,
      preview: p.preview || null,
      imageUrl: p.storagePath || p.url || p.imageUrl || null,
      acceptedDescription: p.caption || p.description || p.acceptedDescription || '',
      assignedTo: String(p.assignedTo || p.assigned_to || '').trim(),
      annotations: p.annotations || null,
      overlayPreview: p.overlayPreview || null,
      overlayPath: p.overlayPath || null,
      overlayDirty: false,
      rotationDegrees: normalizeRotationDegrees(p.rotationDegrees ?? p.rotation_degrees),
      shadowPrepare: p.shadowPrepare || null,
      thumbnailPath: p.thumbnailPath || p.thumbnail_path || null,
      reportWidth: p.reportWidth ?? p.report_width ?? null,
      reportHeight: p.reportHeight ?? p.report_height ?? null,
      thumbnailWidth: p.thumbnailWidth ?? p.thumbnail_width ?? null,
      thumbnailHeight: p.thumbnailHeight ?? p.thumbnail_height ?? null,
      reportByteSize: p.reportByteSize ?? p.report_byte_size ?? null,
      thumbnailByteSize: p.thumbnailByteSize ?? p.thumbnail_byte_size ?? null,
      processingVersion: p.processingVersion || p.processing_version || null,
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

// Work area names are never remembered across diaries. Photo Evidence content
// belongs to one report, so suggestions are drawn from the open diary alone.
