/**
 * Shared Photo Workspace — upload / save state constants and user-facing copy (P2A).
 *
 * Upload complete ≠ Area saved ≠ Report saved.
 */

export const PHOTO_UPLOAD_STATES = {
  LOCAL_ONLY: 'local_only',
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
  SAVED_TO_REPORT: 'saved_to_report',
}

export const PHOTO_SAVE_STATES = {
  UNSAVED: 'unsaved',
  LINKED_TO_GROUP: 'linked_to_group',
  LINKED_TO_REPORT: 'linked_to_report',
}

/** Short chip labels for UI (explicit, not icon-only). */
export const PHOTO_UPLOAD_STATE_LABELS = {
  [PHOTO_UPLOAD_STATES.LOCAL_ONLY]: 'On this phone — not uploaded yet',
  [PHOTO_UPLOAD_STATES.QUEUED]: 'Waiting to upload…',
  [PHOTO_UPLOAD_STATES.UPLOADING]: 'Uploading…',
  [PHOTO_UPLOAD_STATES.UPLOADED]: 'Uploaded',
  [PHOTO_UPLOAD_STATES.FAILED]: 'Upload failed — Tap to retry',
  [PHOTO_UPLOAD_STATES.SAVED_TO_REPORT]: 'Saved with this report',
}

export const PHOTO_WORKSPACE_MESSAGES = {
  areaSavedTitle: '✓ Area saved.',
  areaSavedHint: 'Add another area or continue your report.',
  areaSaveFailed: 'We couldn’t save this area. Check your connection and try Save Area again.',
  uploadComplete: '✓ Photo uploaded.',
  uploadFailed: 'We couldn’t upload this photo. Check your connection and tap Retry.',
  unsavedDraftWarning:
    'You have photos or area details that are not saved yet. Save Area before leaving, or you may lose this work.',
  reportSaveReminder:
    'Areas are kept with this report when you tap Save Site Diary. Save Area stores the area on this screen first.',
}
