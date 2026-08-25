/**
 * Canonical commit of the current unsaved photo area into locationWalk.
 * Shared by Save Area and Save & Share auto-flush — one implementation only.
 *
 * New-area drafts live in draftPhotos until commit.
 * Editing an existing group already mutates locationWalk photos; commit applies
 * name / notes / layout and marks the group saved (no duplicate insert).
 */

import {
  createAreaGroup,
  layoutToPerPage,
  perPageToLayout,
} from '../ai-annotation/area-groups.js'

export const SHARE_UNSAVED_AREA_NAME_MESSAGE =
  'Enter a work area name for the photos you’re adding, then tap Save & Share again.'

export const SHARE_UNSAVED_AREA_PHOTOS_MESSAGE =
  'Add at least one photo to this work area, or clear the area name, before Save & Share.'

export const SHARE_UNSAVED_AREA_LAYOUT_MESSAGE =
  'Choose how many photos per page for this work area before Save & Share.'

function withGroupSaveState(photos) {
  return (photos || []).map((photo) => ({
    ...photo,
    saveState: 'linked_to_group',
  }))
}

/**
 * @param {{
 *   phase?: string,
 *   locationWalk?: object[],
 *   draftPhotos?: object[],
 *   nameDraft?: string,
 *   descriptionDraft?: string,
 *   perPageDraft?: number,
 *   editingGroupId?: string|null,
 *   editingGroupPhotos?: object[]|null,
 * }} input
 * @returns {{
 *   action: 'none'|'commit'|'block',
 *   reason?: string,
 *   message?: string,
 *   name?: string,
 *   description?: string,
 *   layout?: string,
 *   perPage?: number,
 *   photos?: object[],
 *   isEditing?: boolean,
 *   editingGroupId?: string|null,
 *   locationWalk?: object[],
 * }}
 */
export function inspectUnsavedPhotoAreaForShare({
  phase = 'review',
  locationWalk = [],
  draftPhotos = [],
  nameDraft = '',
  descriptionDraft = '',
  perPageDraft = 4,
  editingGroupId = null,
  editingGroupPhotos = null,
} = {}) {
  const walk = Array.isArray(locationWalk) ? locationWalk : []

  // Only the active create/edit composer can hold an unsaved current area.
  if (phase !== 'create') {
    return { action: 'none', locationWalk: walk }
  }

  const isEditing = Boolean(editingGroupId)
  const name = String(nameDraft || '').trim()
  const description = String(descriptionDraft || '').trim()
  const photos = isEditing
    ? (Array.isArray(editingGroupPhotos) ? editingGroupPhotos : [])
    : (Array.isArray(draftPhotos) ? draftPhotos : [])

  const idle =
    !isEditing
    && photos.length === 0
    && !name
    && !description

  if (idle) {
    return { action: 'none', locationWalk: walk }
  }

  if (!name) {
    return {
      action: 'block',
      reason: 'missing-name',
      message: SHARE_UNSAVED_AREA_NAME_MESSAGE,
      locationWalk: walk,
    }
  }

  if (![1, 4, 6].includes(Number(perPageDraft))) {
    return {
      action: 'block',
      reason: 'missing-layout',
      message: SHARE_UNSAVED_AREA_LAYOUT_MESSAGE,
      locationWalk: walk,
    }
  }

  if (!photos.length) {
    return {
      action: 'block',
      reason: 'missing-photos',
      message: SHARE_UNSAVED_AREA_PHOTOS_MESSAGE,
      locationWalk: walk,
    }
  }

  return {
    action: 'commit',
    reason: isEditing ? 'editing-existing' : 'new-draft',
    name,
    description,
    layout: perPageToLayout(perPageDraft),
    perPage: Number(perPageDraft),
    photos,
    isEditing,
    editingGroupId: editingGroupId || null,
    locationWalk: walk,
  }
}

/**
 * Apply the same locationWalk mutation as Save Area.
 *
 * @param {Parameters<typeof inspectUnsavedPhotoAreaForShare>[0]} input
 * @returns {{
 *   ok: boolean,
 *   committed: boolean,
 *   blocked?: boolean,
 *   reason?: string,
 *   message?: string,
 *   locationWalk: object[],
 *   saved?: object|null,
 *   clearedDraft?: boolean,
 * }}
 */
export function commitUnsavedPhotoAreaToWalk(input = {}) {
  const inspected = inspectUnsavedPhotoAreaForShare(input)
  const walk = Array.isArray(inspected.locationWalk) ? inspected.locationWalk : []

  if (inspected.action === 'none') {
    return {
      ok: true,
      committed: false,
      locationWalk: walk,
      saved: null,
      clearedDraft: false,
    }
  }

  if (inspected.action === 'block') {
    return {
      ok: false,
      committed: false,
      blocked: true,
      reason: inspected.reason,
      message: inspected.message,
      locationWalk: walk,
      saved: null,
      clearedDraft: false,
    }
  }

  const photos = withGroupSaveState(inspected.photos)
  let nextWalk
  let saved

  if (inspected.isEditing && inspected.editingGroupId) {
    // Already in locationWalk — update in place; never append a duplicate group.
    nextWalk = walk.map((g) => (
      g.id === inspected.editingGroupId
        ? {
            ...g,
            areaName: inspected.name,
            description: inspected.description,
            layout: inspected.layout,
            completionState: 'saved',
            photos,
          }
        : g
    ))
    saved = nextWalk.find((g) => g.id === inspected.editingGroupId) || null
  } else {
    const group = {
      ...createAreaGroup(inspected.name, inspected.perPage),
      layout: inspected.layout,
      description: inspected.description,
      completionState: 'saved',
      photos,
    }
    nextWalk = [...walk, group]
    saved = group
  }

  return {
    ok: true,
    committed: true,
    reason: inspected.reason,
    locationWalk: nextWalk,
    saved,
    clearedDraft: !inspected.isEditing,
  }
}

/** @deprecated use layout helpers from area-groups; kept for tests */
export { layoutToPerPage, perPageToLayout }
