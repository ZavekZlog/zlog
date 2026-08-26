/**
 * Mobile browser protection for Site Diary / Photo Evidence user photos.
 * Suppresses Chrome/Android native long-press image menus without replacing
 * them with another menu. Tap handlers stay on parent controls.
 */

/** CSS that keeps long-press / drag / callout off the bitmap itself. */
export const userPhotoImgProtectionStyle = {
  WebkitTouchCallout: 'none',
  WebkitUserDrag: 'none',
  userSelect: 'none',
  // Hit-test the parent control so Chrome does not treat the press as "image".
  pointerEvents: 'none',
}

/**
 * Attributes for user-photo <img> elements.
 * @returns {{ draggable: false, onContextMenu: (event: Event) => void }}
 */
export function userPhotoImgProtectionProps() {
  return {
    draggable: false,
    onContextMenu: (event) => {
      event.preventDefault()
    },
  }
}
