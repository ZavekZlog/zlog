import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js'
import {
  verifyDiaryPersistenceAuthUser,
  verifyDiaryWorkbenchAuthUser,
} from './diary-auth-verification.js'

function authObserver(initialUser = null) {
  const state = {
    user: initialUser,
    sessionExpired: initialUser == null,
    applications: [],
  }
  return {
    state,
    applyAuthUser(user) {
      state.applications.push(user)
      state.user = user
      state.sessionExpired = user == null
    },
  }
}

describe('Diary Workbench auth verification', () => {
  it('does not convert a transient getUser rejection into verified logout', async () => {
    const observer = authObserver({ id: 'user-1' })

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => {
        throw new TypeError('Failed to fetch')
      },
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.deepEqual(observer.state.applications, [])
    assert.deepEqual(observer.state.user, { id: 'user-1' })
    assert.equal(observer.state.sessionExpired, false)
  })

  it('preserves an authoritative authenticated result', async () => {
    const observer = authObserver()
    const user = { id: 'user-1' }

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({ data: { user }, error: null }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'authenticated')
    assert.deepEqual(observer.state.applications, [user])
    assert.equal(observer.state.sessionExpired, false)
  })

  it('preserves an authoritative unauthenticated result', async () => {
    const observer = authObserver({ id: 'user-1' })
    const authError = new AuthSessionMissingError()

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'unauthenticated')
    assert.deepEqual(observer.state.applications, [null])
    assert.equal(observer.state.user, null)
    assert.equal(observer.state.sessionExpired, true)
  })

  it('treats a resolved retryable fetch error as indeterminate', async () => {
    const observer = authObserver({ id: 'user-1' })
    const authError = new AuthRetryableFetchError('Failed to fetch', 0)

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.equal(result.error, authError)
    assert.deepEqual(observer.state.applications, [])
    assert.deepEqual(observer.state.user, { id: 'user-1' })
    assert.equal(observer.state.sessionExpired, false)
  })

  it('treats a resolved unknown auth error as indeterminate', async () => {
    const observer = authObserver({ id: 'user-1' })
    const rootCause = new SyntaxError('Invalid auth response')
    const authError = new AuthUnknownError('Invalid auth response', rootCause)

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.equal(result.error, authError)
    assert.deepEqual(observer.state.applications, [])
    assert.deepEqual(observer.state.user, { id: 'user-1' })
    assert.equal(observer.state.sessionExpired, false)
  })

  it('treats an authoritative invalid JWT response as unauthenticated', async () => {
    const observer = authObserver({ id: 'user-1' })
    const authError = new AuthApiError('Invalid JWT', 401, 'bad_jwt')

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'unauthenticated')
    assert.deepEqual(observer.state.applications, [null])
    assert.equal(observer.state.user, null)
    assert.equal(observer.state.sessionExpired, true)
  })

  it('treats a non-authoritative Auth API infrastructure error as indeterminate', async () => {
    const observer = authObserver({ id: 'user-1' })
    const authError = new AuthApiError('Unexpected failure', 500, 'unexpected_failure')

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.deepEqual(observer.state.applications, [])
    assert.equal(observer.state.sessionExpired, false)
  })

  it('does not treat an unrelated forbidden Auth API response as logout', async () => {
    const observer = authObserver({ id: 'user-1' })
    const authError = new AuthApiError('Additional verification required', 403, 'insufficient_aal')

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.deepEqual(observer.state.applications, [])
    assert.equal(observer.state.sessionExpired, false)
  })

  it('does not invent logout from an unrecognized null-user response', async () => {
    const observer = authObserver({ id: 'user-1' })

    const result = await verifyDiaryWorkbenchAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: null,
      }),
      applyAuthUser: observer.applyAuthUser,
    })

    assert.equal(result.status, 'indeterminate')
    assert.deepEqual(observer.state.applications, [])
    assert.equal(observer.state.sessionExpired, false)
  })

  it('final Save aborts indeterminate auth without asserting logout', async () => {
    const state = {
      persisted: false,
      sessionExpired: false,
      verificationFailed: false,
    }
    const authError = new AuthRetryableFetchError('Gateway unavailable', 503)

    const result = await verifyDiaryPersistenceAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: authError,
      }),
      onUnauthenticated() {
        state.sessionExpired = true
      },
      onIndeterminate() {
        state.verificationFailed = true
      },
    })
    if (result.status === 'authenticated') state.persisted = true

    assert.equal(state.persisted, false)
    assert.equal(state.sessionExpired, false)
    assert.equal(state.verificationFailed, true)
  })

  it('final Save preserves authoritative signed-out handling', async () => {
    const state = {
      persisted: false,
      sessionExpired: false,
    }

    const result = await verifyDiaryPersistenceAuthUser({
      getUser: async () => ({
        data: { user: null },
        error: new AuthSessionMissingError(),
      }),
      onUnauthenticated() {
        state.sessionExpired = true
      },
    })
    if (result.status === 'authenticated') state.persisted = true

    assert.equal(result.status, 'unauthenticated')
    assert.equal(state.persisted, false)
    assert.equal(state.sessionExpired, true)
  })

  it('does not apply a late result after cancellation', async () => {
    let resolveGetUser
    let cancelled = false
    const observer = authObserver({ id: 'user-1' })
    const pending = new Promise((resolve) => {
      resolveGetUser = resolve
    })

    const verification = verifyDiaryWorkbenchAuthUser({
      getUser: () => pending,
      applyAuthUser: observer.applyAuthUser,
      isCancelled: () => cancelled,
    })
    cancelled = true
    resolveGetUser({ data: { user: null }, error: null })

    const result = await verification
    assert.equal(result.status, 'cancelled')
    assert.deepEqual(observer.state.applications, [])
    assert.deepEqual(observer.state.user, { id: 'user-1' })
  })
})
