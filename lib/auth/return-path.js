/**
 * Safe post-login return paths (relative app URLs only).
 * Used when session expires mid-edit so Sign In can restore the report URL.
 */

export const SESSION_EXPIRED_SAVE_MESSAGE =
  'Your sign-in has timed out.\nSign in again to keep editing, then save your work.'

/** Present only on login URLs created for genuine session recovery (e.g. timed-out save). */
export const LOGIN_SESSION_RECOVERY_PARAM = 'recovery'

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
  return `/login?${LOGIN_SESSION_RECOVERY_PARAM}=1&next=${encodeURIComponent(safe)}`
}

/**
 * @param {unknown} value
 */
export function isLoginSessionRecoveryFlag(value) {
  return value === true || value === '1' || value === 1
}

/**
 * Diary setup URLs are a transient hop before the workbench.
 * After voluntary sign-out/sign-in, users expect the Site Control Panel — not a resumed setup flow.
 *
 * @param {string | null | undefined} path
 */
export function isStaleVoluntaryLoginNext(path) {
  const safe = safeAppReturnPath(path)
  if (!safe) return false
  return safe.startsWith('/dashboard/diary/setup')
}

/**
 * @param {{
 *   next?: string | null
 *   signedOut?: boolean
 *   defaultPath?: string
 * }} input
 */
export function resolvePostLoginDestination(input = {}) {
  const defaultPath = input.defaultPath || '/dashboard'
  if (input.signedOut === true) {
    return defaultPath
  }
  if (!isLoginSessionRecoveryFlag(input.recovery)) {
    return defaultPath
  }
  const safe = safeAppReturnPath(input.next)
  if (!safe) return defaultPath
  return safe
}
