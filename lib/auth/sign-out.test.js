import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIGN_OUT_LOGIN_HREF,
  performDashboardSignOut,
} from './sign-out.js'

const here = dirname(fileURLToPath(import.meta.url))
const topBar = readFileSync(
  join(here, '../../components/dashboard/DashboardTopBar.jsx'),
  'utf8',
)

describe('performDashboardSignOut — success path', () => {
  it('attempts signOut then redirects to login', async () => {
    const calls = []
    const result = await performDashboardSignOut({
      signOut: async (options) => {
        calls.push(['signOut', options])
      },
      goToLogin: async (href) => {
        calls.push(['goToLogin', href])
      },
    })

    assert.deepEqual(calls[0], ['signOut', { scope: 'local' }])
    assert.deepEqual(calls[1], ['goToLogin', SIGN_OUT_LOGIN_HREF])
    assert.equal(result.timedOut, false)
    assert.equal(result.signOutError, null)
  })
})

describe('performDashboardSignOut — failure path', () => {
  it('when signOut rejects, still navigates and does not leave caller hanging', async () => {
    const calls = []
    const result = await performDashboardSignOut({
      signOut: async () => {
        calls.push('signOut')
        throw new Error('network_down')
      },
      goToLogin: async (href) => {
        calls.push(['goToLogin', href])
      },
    })

    assert.ok(calls.includes('signOut'))
    assert.deepEqual(calls[calls.length - 1], ['goToLogin', SIGN_OUT_LOGIN_HREF])
    assert.equal(result.timedOut, false)
    assert.equal(result.signOutError?.message, 'network_down')
  })

  it('when signOut hangs past timeout, still navigates (UI must not stick)', async () => {
    const calls = []
    const started = Date.now()
    const result = await performDashboardSignOut({
      timeoutMs: 30,
      signOut: () => new Promise(() => {}),
      goToLogin: async (href) => {
        calls.push(['goToLogin', href])
      },
    })
    const elapsed = Date.now() - started

    assert.ok(elapsed < 2000, `expected timeout recovery, took ${elapsed}ms`)
    assert.equal(result.timedOut, true)
    assert.equal(result.signOutError?.code, 'SIGN_OUT_TIMEOUT')
    assert.deepEqual(calls[0], ['goToLogin', SIGN_OUT_LOGIN_HREF])
  })
})

describe('DashboardTopBar wires recoverable sign-out', () => {
  it('uses performDashboardSignOut and clears signingOut in finally', () => {
    assert.match(topBar, /performDashboardSignOut/)
    assert.match(topBar, /SIGN_OUT_LOGIN_HREF|signedOut=1/)
    assert.match(topBar, /setSigningOut\(true\)/)
    assert.match(topBar, /finally\s*\{[\s\S]*setSigningOut\(false\)/)
    assert.match(topBar, /window\.location\.assign/)
  })

  it('sign-out clears session only — does not touch browser credential store APIs', () => {
    assert.match(topBar, /supabase\.auth\.signOut/)
    assert.doesNotMatch(topBar, /navigator\.credentials/)
    assert.doesNotMatch(topBar, /PasswordCredential/)
    assert.doesNotMatch(topBar, /preventSilentAccess/)
    assert.doesNotMatch(topBar, /localStorage\.(removeItem|clear)/)
    assert.doesNotMatch(topBar, /sessionStorage\.(removeItem|clear)/)
  })
})
