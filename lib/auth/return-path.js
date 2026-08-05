/**
 * Safe post-login return paths (relative app URLs only).
 * Used when session expires mid-edit so Sign In can restore the report URL.
 */

export const SESSION_EXPIRED_SAVE_MESSAGE =
  'Your sign-in has timed out.\nSign in again to keep editing, then save your work.'

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function safeAppReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return null

  let path = raw.trim()
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }

  path = path.trim()
  if (!path.startsWith('/')) return null
  if (path.startsWith('//')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return null
  if (path.includes('\\')) return null

  // Only restore into the authenticated app surface.
  if (!path.startsWith('/dashboard')) return null

  return path
}

/**
 * @param {string} returnPath pathname + search, e.g. /dashboard/project/x/diary?report=y
 * @returns {string}
 */
export function loginUrlWithReturn(returnPath) {
  const safe = safeAppReturnPath(returnPath)
  if (!safe) return '/login'
  return `/login?next=${encodeURIComponent(safe)}`
}
