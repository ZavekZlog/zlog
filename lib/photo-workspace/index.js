/**
 * Shared Photo Workspace — P2A public API.
 *
 * Foundation only: model, contexts, states, adapters.
 * Capture/viewer upgrades land in P2B+.
 * Site Diary save (finalizeSiteDiarySave) stays unchanged.
 */

export {
  createEvidenceGroup,
  createEvidencePhoto,
  locationWalkToEvidenceGroups,
  evidenceGroupsToLocationWalk,
  markGroupSavedInMemory,
  hasUnsavedPhotoWorkspaceDraft,
} from './model.js'

export {
  PHOTO_UPLOAD_STATES,
  PHOTO_SAVE_STATES,
  PHOTO_UPLOAD_STATE_LABELS,
  PHOTO_WORKSPACE_MESSAGES,
} from './states.js'

export {
  PHOTO_WORKSPACE_CONTEXTS,
  getPhotoWorkspaceContext,
  getPhotoWorkspaceLabels,
} from './contexts.js'

export {
  diaryPhotoAdapter,
  surveyPhotoAdapter,
  progressPhotoAdapter,
  snagPhotoAdapter,
  healthSafetyPhotoAdapter,
  getPhotoWorkspaceAdapter,
} from './adapters.js'

export {
  inspectUnsavedPhotoAreaForShare,
  commitUnsavedPhotoAreaToWalk,
  SHARE_UNSAVED_AREA_NAME_MESSAGE,
  SHARE_UNSAVED_AREA_PHOTOS_MESSAGE,
  SHARE_UNSAVED_AREA_LAYOUT_MESSAGE,
  FIELD_WORK_AREA_NAME_ERROR,
  isMissingWorkAreaNamePageError,
} from './commit-unsaved-area.js'
