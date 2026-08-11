/**
 * Dashboard Sign out — recoverable orchestration.
 * Clears the local auth session, then always leaves for the login screen.
 */

export const SIGN_OUT_LOGIN_HREF = '/login?signedOut=1'

/** Max wait for auth.signOut before treating it as hung. */
export const SIGN_OUT_TIMEOUT_MS = 8000

/**
 * @param {object} deps
 * @param {(options?: { scope?: string }) => Promise<unknown>} deps.signOut
 * @param {(href: string) => void | Promise<void>} deps.goToLogin
 * @param {number} [deps.timeoutMs]
 * @returns {Promise<{ timedOut: boolean, signOutError: Error|null }>}
 */
export async function performDashboardSignOut({
  signOut,
  goToLogin,
  timeoutMs = SIGN_OUT_TIMEOUT_MS,
} = {}) {
  if (typeof signOut !== 'function') {
    throw new Error('performDashboardSignOut requires signOut')
  }
  if (typeof goToLogin !== 'function') {
    throw new Error('performDashboardSignOut requires goToLogin')
  }

  let timedOut = false
  let signOutError = null
  let timer = null

  try {
    await Promise.race([
      Promise.resolve(signOut({ scope: 'local' })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          const err = new Error('SIGN_OUT_TIMEOUT')
          err.code = 'SIGN_OUT_TIMEOUT'
          reject(err)
        }, timeoutMs)
      }),
    ])
  } catch (err) {
    signOutError = err instanceof Error ? err : new Error(String(err))
  } finally {
    if (timer != null) clearTimeout(timer)
  }

  await goToLogin(SIGN_OUT_LOGIN_HREF)
  return { timedOut, signOutError }
}
