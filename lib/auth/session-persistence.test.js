/**
 * Auth session persistence contract.
 *
 * Normal sessions must survive refresh / reopen through Supabase's own cookie
 * mechanism, while explicit Sign Out must still end the session and leave no
 * Zlog-held credentials behind.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGN_OUT_LOGIN_HREF, performDashboardSignOut } from './sign-out.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')

const proxyFile = read('proxy.js')
const authAdapter = read('lib/supabase/middleware.js')
const browserClient = read('lib/supabase/client.js')
const loginPage = read('app/(auth)/login/page.jsx')
const signOutModule = read('lib/auth/sign-out.js')
const topBar = read('components/dashboard/DashboardTopBar.jsx')

function matcherOf(source) {
  const match = source.match(/matcher:\s*\[([^\]]+)\]/)
  return match ? match[1].trim() : null
}

describe('session survives refresh and navigation', () => {
  it('the Supabase auth boundary is mounted at the project root', () => {
    assert.match(proxyFile, /export function proxy\(/)
    assert.match(proxyFile, /from '\.\/lib\/supabase\/middleware\.js'/)
    assert.match(proxyFile, /middleware\(request\)/)
    // Next 16 ignores a root middleware file, which is how the boundary went unmounted.
    assert.equal(existsSync(join(root, 'middleware.js')), false)
    assert.equal(existsSync(join(root, 'middleware.ts')), false)
  })

  it('the root proxy only delegates — the auth wall stays single-sourced', () => {
    assert.doesNotMatch(proxyFile, /createServerClient/)
    assert.doesNotMatch(proxyFile, /signOut|signInWithPassword/)
    assert.doesNotMatch(proxyFile, /password/i)
  })

  it('every app route refreshes the session cookie, not just the dashboard', () => {
    const proxyMatcher = matcherOf(proxyFile)
    assert.ok(proxyMatcher, 'root proxy must declare a matcher')
    assert.equal(proxyMatcher, matcherOf(authAdapter), 'matchers must not drift')
    assert.match(proxyMatcher, /_next\/static/)
    // Supabase refresh writes rotated cookies back onto the response.
    assert.match(authAdapter, /getAll\(\)/)
    assert.match(authAdapter, /setAll\(cookiesToSet\)/)
    assert.match(authAdapter, /supabaseResponse\.cookies\.set/)
    assert.match(authAdapter, /supabase\.auth\.getUser\(\)/)
  })
})

describe('session persistence is configured for reopening', () => {
  it('the browser client keeps Supabase cookie persistence and auto-refresh', () => {
    assert.match(browserClient, /createBrowserClient/)
    // @supabase/ssr defaults: cookie storage, persistSession + autoRefreshToken on.
    assert.doesNotMatch(browserClient, /persistSession:\s*false/)
    assert.doesNotMatch(browserClient, /autoRefreshToken:\s*false/)
    assert.doesNotMatch(browserClient, /storage:\s*\w*[sS]essionStorage/)
  })

  it('Zlog never hand-rolls its own auth cookie or token storage', () => {
    for (const source of [browserClient, authAdapter, proxyFile]) {
      assert.doesNotMatch(source, /document\.cookie\s*=/)
      assert.doesNotMatch(source, /localStorage\.setItem/)
      assert.doesNotMatch(source, /sessionStorage\.setItem/)
    }
  })
})

describe('explicit Sign Out ends the authenticated session', () => {
  it('clears the Supabase session then leaves for login', async () => {
    const calls = []
    const result = await performDashboardSignOut({
      signOut: async (options) => calls.push(['signOut', options]),
      goToLogin: async (href) => calls.push(['goToLogin', href]),
    })

    assert.deepEqual(calls, [
      ['signOut', { scope: 'local' }],
      ['goToLogin', '/login?signedOut=1'],
    ])
    assert.equal(result.signOutError, null)
    assert.equal(SIGN_OUT_LOGIN_HREF, '/login?signedOut=1')
    assert.match(topBar, /supabase\.auth\.signOut/)
  })

  it('protected routes cannot be reached once the session is gone', () => {
    // Server-side guard: no user + protected path -> /login, carrying a safe return path.
    assert.match(authAdapter, /const protectedPaths = \[[^\]]*'\/dashboard'/)
    assert.match(authAdapter, /if \(!user && isProtected\)/)
    assert.match(authAdapter, /url\.pathname = '\/login'/)
    assert.match(authAdapter, /NextResponse\.redirect\(url\)/)
    // The guard is only effective because the proxy above mounts it.
    assert.match(proxyFile, /export function proxy\(/)
  })
})

describe('Zlog does not persist the user password', () => {
  it('no credential is written to app storage by any auth surface', () => {
    for (const source of [loginPage, signOutModule, topBar, browserClient, proxyFile]) {
      assert.doesNotMatch(source, /localStorage\./)
      assert.doesNotMatch(source, /sessionStorage\./)
      assert.doesNotMatch(source, /document\.cookie\s*=/)
      assert.doesNotMatch(source, /navigator\.credentials/)
    }
    // Inputs stay uncontrolled; the browser owns autofill.
    assert.doesNotMatch(loginPage, /value=\{.*password/)
    assert.doesNotMatch(loginPage, /defaultValue=\{/)
    assert.match(loginPage, /autoComplete="current-password"/)
    assert.doesNotMatch(loginPage, /autoComplete="off"/)
  })

  it('sign-out still clears the visible form once, without touching the browser vault', () => {
    assert.match(loginPage, /params\.get\('signedOut'\) !== '1'/)
    const passwordClears = loginPage.match(/passwordInput\.value = ''/g) || []
    assert.equal(passwordClears.length, 1)
    for (const source of [loginPage, signOutModule, topBar]) {
      assert.doesNotMatch(source, /preventSilentAccess|PasswordCredential/)
    }
  })
})
