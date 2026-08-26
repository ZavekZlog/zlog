/**
 * Site Diary photo-delete confirmation — presentation copy + confirm intent only.
 * Does not perform storage/persistence; callers keep existing onDelete path.
 */

export const PHOTO_DELETE_CONFIRM_MESSAGE =
  'This photo will be removed from this area.'

export function photoDeleteConfirmTitle(photoNumber) {
  const n = Number(photoNumber)
  const label = Number.isFinite(n) && n > 0 ? String(n) : String(photoNumber || '').trim()
  return `Delete photo ${label || '?'}?`
}

/**
 * Resolve Cancel vs Delete for a pending confirmation.
 * Delete invokes onDelete exactly once with the pending photo id.
 * Cancel clears without calling onDelete.
 *
 * @param {{ photoId: string, photoNumber?: number|string } | null} pending
 * @param {'cancel' | 'confirm'} action
 * @param {(photoId: string) => void} [onDelete]
 * @returns {null} always clears pending (caller sets state to null)
 */
export function resolvePhotoDeleteConfirm(pending, action, onDelete) {
  if (!pending?.photoId) return null
  if (action === 'confirm') {
    onDelete?.(pending.photoId)
  }
  return null
}
