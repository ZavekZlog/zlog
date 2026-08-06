/**
 * Shared Photo Workspace — neutral Evidence Group / Evidence Photo model (P2A).
 *
 * Compatible with today's Location Walk in-memory shape (`lib/ai-annotation/area-groups.js`)
 * so Site Diary can adopt the workspace without changing finalizeSiteDiarySave.
 *
 * User-facing labels come from `contexts.js` — never expose these field names in UI.
 */

import {
  createAreaGroup,
  createAreaPhoto,
  makeWalkId,
  perPageToLayout,
} from '../ai-annotation/area-groups.js'
import {
  PHOTO_SAVE_STATES,
  PHOTO_UPLOAD_STATES,
} from './states.js'

/**
 * @typedef {'diary' | 'survey' | 'progress' | 'snag' | 'healthSafety'} PhotoReportType
 * @typedef {'work_area' | 'survey_area' | 'progress_area' | 'snag_item' | 'inspection_area' | 'hazard'} EvidenceContextType
 * @typedef {'draft' | 'saved' | 'incomplete'} GroupCompletionState
 */

/**
 * @param {object} [opts]
 * @returns {object} Evidence Group
 */
export function createEvidenceGroup({
  title = '',
  description = '',
  reportId = null,
  reportType = 'diary',
  sectionKey = 'work_photos',
  contextType = 'work_area',
  displayOrder = 0,
  layout = 'grid4',
  perPage = null,
  completionState = 'draft',
  photos = [],
  id = null,
  createdAt = null,
} = {}) {
  const resolvedLayout = perPage != null ? perPageToLayout(perPage) : (layout || 'grid4')
  return {
    id: id || makeWalkId('group'),
    reportId,
    reportType,
    sectionKey,
    contextType,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    displayOrder,
    layout: resolvedLayout,
    completionState,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    photos: Array.isArray(photos) ? photos : [],
  }
}

/**
 * @param {object} [opts]
 * @returns {object} Evidence Photo
 */
export function createEvidencePhoto({
  file = null,
  preview = null,
  imageUrl = null,
  caption = '',
  groupId = null,
  reportId = null,
  sectionKey = 'work_photos',
  displayOrder = 0,
  rotationDegrees = 0,
  orientationApplied = false,
  originalRef = null,
  displayRef = null,
  thumbnailRef = null,
  annotationDoc = null,
  annotationOverlayRef = null,
  overlayPreview = null,
  overlayDirty = false,
  uploadState = null,
  saveState = null,
  errorMessage = '',
  id = null,
  createdAt = null,
} = {}) {
  const hasRemote = Boolean(imageUrl || originalRef || displayRef)
  const hasLocalFile = Boolean(file)
  return {
    id: id || makeWalkId('photo'),
    groupId,
    reportId,
    sectionKey,
    displayOrder,
    caption: String(caption || '').trim(),
    rotationDegrees: Number(rotationDegrees) || 0,
    orientationApplied: Boolean(orientationApplied),
    originalRef: originalRef || imageUrl || null,
    displayRef: displayRef || imageUrl || null,
    thumbnailRef: thumbnailRef || null,
    annotationDoc: annotationDoc || null,
    annotationOverlayRef: annotationOverlayRef || null,
    // Location-walk compatibility fields (diary save path)
    file,
    preview: preview || imageUrl || null,
    imageUrl: imageUrl || null,
    acceptedDescription: String(caption || '').trim(),
    annotations: annotationDoc || null,
    overlayPreview: overlayPreview || null,
    overlayPath: annotationOverlayRef || null,
    overlayDirty: Boolean(overlayDirty),
    uploadState:
      uploadState
      || (hasRemote ? PHOTO_UPLOAD_STATES.UPLOADED : hasLocalFile ? PHOTO_UPLOAD_STATES.LOCAL_ONLY : PHOTO_UPLOAD_STATES.LOCAL_ONLY),
    saveState:
      saveState
      || (hasRemote ? PHOTO_SAVE_STATES.LINKED_TO_REPORT : PHOTO_SAVE_STATES.UNSAVED),
    errorMessage: errorMessage || '',
    createdAt: createdAt || new Date().toISOString(),
  }
}

/**
 * Convert Location Walk groups → Evidence Groups (P2A bridge).
 * @param {object[]} locationWalk
 * @param {object} [meta]
 */
export function locationWalkToEvidenceGroups(locationWalk = [], meta = {}) {
  const {
    reportId = null,
    reportType = 'diary',
    sectionKey = 'work_photos',
    contextType = 'work_area',
  } = meta

  return (Array.isArray(locationWalk) ? locationWalk : []).map((group, index) => {
    const photos = (group.photos || []).map((photo, photoIndex) =>
      createEvidencePhoto({
        id: photo.id,
        file: photo.file || null,
        preview: photo.preview || null,
        imageUrl: photo.imageUrl || photo.storagePath || null,
        caption: photo.acceptedDescription || photo.caption || '',
        groupId: group.id,
        reportId,
        sectionKey,
        displayOrder: photoIndex,
        annotationDoc: photo.annotations || null,
        annotationOverlayRef: photo.overlayPath || null,
        overlayPreview: photo.overlayPreview || null,
        overlayDirty: Boolean(photo.overlayDirty),
        uploadState: photo.uploadState || undefined,
        saveState: photo.saveState || undefined,
        errorMessage: photo.errorMessage || '',
      }),
    )

    return createEvidenceGroup({
      id: group.id,
      title: group.areaName || group.title || '',
      description: group.description || '',
      reportId,
      reportType,
      sectionKey,
      contextType,
      displayOrder: index,
      layout: group.layout || 'grid4',
      completionState: group.completionState || 'saved',
      photos,
      createdAt: group.createdAt || null,
    })
  })
}

/**
 * Convert Evidence Groups → Location Walk shape (diary / AiLocationWalk compatible).
 * @param {object[]} groups
 */
export function evidenceGroupsToLocationWalk(groups = []) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const base = createAreaGroup(group.title || group.areaName || '', 4)
    return {
      ...base,
      id: group.id || base.id,
      areaName: String(group.title || group.areaName || '').trim(),
      description: String(group.description || '').trim(),
      createdAt: group.createdAt || base.createdAt,
      layout: group.layout || base.layout,
      completionState: group.completionState || 'saved',
      photos: (group.photos || []).map((photo) => {
        const row = createAreaPhoto({
          file: photo.file || null,
          preview: photo.preview || null,
          description: photo.caption || photo.acceptedDescription || '',
          imageUrl: photo.imageUrl || photo.displayRef || photo.originalRef || null,
          annotations: photo.annotationDoc || photo.annotations || null,
          overlayPreview: photo.overlayPreview || null,
          overlayPath: photo.annotationOverlayRef || photo.overlayPath || null,
        })
        return {
          ...row,
          id: photo.id || row.id,
          uploadState: photo.uploadState,
          saveState: photo.saveState,
          errorMessage: photo.errorMessage || '',
          overlayDirty: Boolean(photo.overlayDirty),
        }
      }),
    }
  })
}

/**
 * Mark all photos in a group as linked after Save Area (in-memory / form state).
 * Does not upload and does not call report finalize.
 */
export function markGroupSavedInMemory(group) {
  if (!group) return group
  const now = new Date().toISOString()
  return {
    ...group,
    completionState: 'saved',
    updatedAt: now,
    photos: (group.photos || []).map((photo) => ({
      ...photo,
      saveState:
        photo.uploadState === PHOTO_UPLOAD_STATES.UPLOADED
        || photo.uploadState === PHOTO_UPLOAD_STATES.SAVED_TO_REPORT
          ? PHOTO_SAVE_STATES.LINKED_TO_GROUP
          : PHOTO_SAVE_STATES.LINKED_TO_GROUP,
      // Keep uploadState as-is; Save Area ≠ upload complete
    })),
  }
}

/**
 * True when create-flow has local work that would be lost on navigate/refresh.
 */
export function hasUnsavedPhotoWorkspaceDraft({
  phase,
  nameDraft = '',
  descriptionDraft = '',
  draftPhotos = [],
} = {}) {
  if (phase !== 'create') return false
  if (String(nameDraft || '').trim()) return true
  if (String(descriptionDraft || '').trim()) return true
  if (Array.isArray(draftPhotos) && draftPhotos.length > 0) return true
  return false
}
