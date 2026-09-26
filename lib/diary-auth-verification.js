import {
  AuthInvalidJwtError,
  AuthUnknownError,
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'

const AUTHORITATIVE_SESSION_ERROR_CODES = new Set([
  'bad_jwt',
  'no_authorization',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_expired',
  'session_not_found',
  'user_banned',
  'user_not_found',
])

/**
 * Classify the resolved shape returned by Supabase Auth v2.
 *
 * AuthApiError is intentionally not authoritative as a class: retryable,
 * infrastructure, rate-limit, and unrelated API failures do not prove logout.
 */
export function classifyDiaryAuthVerificationResult({
  data = null,
  error = null,
} = {}) {
  const user = data?.user ?? null
  if (user) return { status: 'authenticated', user, error: null }

  if (isAuthSessionMissingError(error) || error instanceof AuthInvalidJwtError) {
    return { status: 'unauthenticated', user: null, error }
  }

  if (isAuthRetryableFetchError(error) || error instanceof AuthUnknownError) {
    return { status: 'indeterminate', user: null, error }
  }

  if (isAuthApiError(error)) {
    const code = String(error.code || '')
    const status = Number(error.status || 0)
    if (
      AUTHORITATIVE_SESSION_ERROR_CODES.has(code)
      || status === 401
    ) {
      return { status: 'unauthenticated', user: null, error }
    }
    return { status: 'indeterminate', user: null, error }
  }

  return {
    status: 'indeterminate',
    user: null,
    error,
  }
}

/**
 * Resolve the Workbench's authoritative auth check into its existing
 * applyAuthUser callback.
 */
export async function verifyDiaryWorkbenchAuthUser({
  getUser,
  applyAuthUser = () => {},
  isCancelled = () => false,
} = {}) {
  try {
    const result = classifyDiaryAuthVerificationResult(await getUser())
    if (isCancelled()) return { status: 'cancelled', user: null, error: null }
    if (result.status === 'authenticated') {
      applyAuthUser(result.user)
    } else if (result.status === 'unauthenticated') {
      applyAuthUser(null)
    }
    return result
  } catch (error) {
    if (isCancelled()) return { status: 'cancelled', user: null, error }
    return { status: 'indeterminate', user: null, error }
  }
}

/**
 * Gate an explicit persistence action without conflating verification failure
 * with authoritative logout. The caller proceeds only for `authenticated`.
 */
export async function verifyDiaryPersistenceAuthUser({
  getUser,
  onUnauthenticated = () => {},
  onIndeterminate = () => {},
  isCancelled = () => false,
} = {}) {
  const result = await verifyDiaryWorkbenchAuthUser({
    getUser,
    isCancelled,
  })
  if (result.status === 'unauthenticated') {
    onUnauthenticated(result.error)
  } else if (result.status === 'indeterminate') {
    onIndeterminate(result.error)
  }
  return result
}
