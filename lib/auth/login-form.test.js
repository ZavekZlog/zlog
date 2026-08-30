import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isTrustedPrimarySignInPointerDown,
  isTrustedSignInCtaKey,
  passwordInputType,
  passwordVisibilityLabel,
  readLoginFormCredentials,
} from './login-form.js'
import { SIGN_OUT_LOGIN_HREF, performDashboardSignOut } from './sign-out.js'

const here = dirname(fileURLToPath(import.meta.url))
const loginPagePath = join(here, '../../app/(auth)/login/page.jsx')
const topBarPath = join(here, '../../components/dashboard/DashboardTopBar.jsx')
const signOutPath = join(here, './sign-out.js')

function readLoginPage() {
  return readFileSync(loginPagePath, 'utf8')
}

function readTopBar() {
  return readFileSync(topBarPath, 'utf8')
}

function readSignOutModule() {
  return readFileSync(signOutPath, 'utf8')
}

describe('readLoginFormCredentials', () => {
  it('reads autofilled DOM values from FormData', () => {
    const formData = new FormData()
    formData.set('email', '  crew@zlog.app  ')
    formData.set('password', 'SitePass!42')

    assert.deepEqual(readLoginFormCredentials(formData), {
      email: 'crew@zlog.app',
      password: 'SitePass!42',
    })
  })

  it('falls back to named form elements when FormData is empty', () => {
    const form = {
      elements: {
        namedItem(name) {
          if (name === 'email') return { value: 'dom@zlog.app' }
          if (name === 'password') return { value: 'from-dom' }
          return null
        },
      },
    }
    assert.deepEqual(readLoginFormCredentials(form), {
      email: 'dom@zlog.app',
      password: 'from-dom',
    })
  })

  it('returns empty strings for a missing form without throwing', () => {
    assert.deepEqual(readLoginFormCredentials(null), { email: '', password: '' })
  })
})

describe('password visibility', () => {
  it('switches input type between password and text without remount semantics', () => {
    assert.equal(passwordInputType(false), 'password')
    assert.equal(passwordInputType(true), 'text')
  })

  it('labels Show password / Hide password from visibility state', () => {
    assert.equal(passwordVisibilityLabel(false), 'Show password')
    assert.equal(passwordVisibilityLabel(true), 'Hide password')
  })
})

function trustedPrimaryPointerDown(pointerType = 'touch') {
  return { isTrusted: true, isPrimary: true, pointerType, button: 0 }
}

describe('Sign In CTA intent gate — password-manager auto-submit must not authenticate', () => {
  it('form submit cannot authenticate', () => {
    const page = readLoginPage()
    assert.match(page, /const handleFormSubmit = \(e\) => \{\s*e\.preventDefault\(\)\s*\}/)
    assert.doesNotMatch(page, /handleFormSubmit[\s\S]{0,80}authenticate\(/)
  })

  it('requestSubmit-style submission cannot authenticate', () => {
    const page = readLoginPage()
    assert.match(page, /onSubmit=\{handleFormSubmit\}/)
    assert.match(page, /const handleFormSubmit = \(e\) => \{\s*e\.preventDefault\(\)\s*\}/)
    assert.doesNotMatch(page, /requestSubmit/)
    assert.doesNotMatch(page, /form\.submit\(/)
  })

  it('programmatic click cannot authenticate', () => {
    const page = readLoginPage()
    assert.doesNotMatch(page, /onClick=\{handleSignInClick\}/)
    assert.doesNotMatch(page, /onClick=\{authenticate\}/)
    assert.equal(
      isTrustedPrimarySignInPointerDown({ isTrusted: false, isPrimary: true, pointerType: 'touch', button: 0 }),
      false,
    )
  })

  it('click by itself cannot authenticate', () => {
    const page = readLoginPage()
    assert.doesNotMatch(page, /onClick=\{handleSignInClick\}/)
    assert.doesNotMatch(page, /onClick=\{authenticate\}/)
    assert.match(page, /onPointerDown=\{handleSignInPointerDown\}/)
  })

  it('untrusted pointerdown cannot authenticate', () => {
    assert.equal(
      isTrustedPrimarySignInPointerDown({
        isTrusted: false,
        isPrimary: true,
        pointerType: 'touch',
        button: 0,
      }),
      false,
    )
  })

  it('trusted primary pointerdown CAN authenticate', () => {
    assert.equal(isTrustedPrimarySignInPointerDown(trustedPrimaryPointerDown('touch')), true)
    assert.equal(isTrustedPrimarySignInPointerDown(trustedPrimaryPointerDown('mouse')), true)
    const page = readLoginPage()
    assert.match(page, /if \(!isTrustedPrimarySignInPointerDown\(e\)\) return/)
  })

  it('non-primary pointer activation cannot authenticate', () => {
    assert.equal(
      isTrustedPrimarySignInPointerDown({
        isTrusted: true,
        isPrimary: false,
        pointerType: 'touch',
        button: 0,
      }),
      false,
    )
    assert.equal(
      isTrustedPrimarySignInPointerDown({
        isTrusted: true,
        isPrimary: true,
        pointerType: 'mouse',
        button: 2,
      }),
      false,
    )
  })

  it('Enter in form/input cannot authenticate', () => {
    const page = readLoginPage()
    assert.doesNotMatch(page, /onKeyDown=\{handleFormKeyDown\}/)
    assert.doesNotMatch(page, /handleFormKeyDown/)
  })

  it('trusted Enter/Space on focused Sign In CTA CAN authenticate', () => {
    assert.equal(isTrustedSignInCtaKey({ isTrusted: true, key: 'Enter' }), true)
    assert.equal(isTrustedSignInCtaKey({ isTrusted: true, key: ' ' }), true)
    const page = readLoginPage()
    assert.match(page, /onKeyDown=\{handleSignInKeyDown\}/)
    assert.match(page, /if \(!isTrustedSignInCtaKey\(e\)\) return/)
  })

  it('untrusted/synthetic keyboard activation cannot authenticate', () => {
    assert.equal(isTrustedSignInCtaKey({ isTrusted: false, key: 'Enter' }), false)
    assert.equal(isTrustedSignInCtaKey({ key: 'Enter' }), false)
    assert.equal(isTrustedSignInCtaKey({ isTrusted: false, key: ' ' }), false)
  })
})

/**
 * LOCK: Sign-in credential memory contract — behaviours 1–6 must all hold.
 * Do not satisfy one requirement by breaking another.
 */
describe('LOCK — sign-in credential memory contract (behaviours 1–6)', () => {
  it('1 — browser password-manager save/autofill is enabled', () => {
    const page = readLoginPage()
    // Conventional login submit so Chrome/Edge can recognise and Save
    assert.match(page, /method="post"/)
    assert.match(page, /<PrimaryCTA[\s\S]*type="button"/)
    assert.doesNotMatch(page, /type="submit"/)
    assert.match(page, /onSubmit=\{handleFormSubmit\}/)
    assert.match(page, /autoComplete="username"/)
    assert.match(page, /autoComplete="current-password"/)
    assert.doesNotMatch(page, /autoComplete="off"/)
    // Autofill values are readable at submit (DOM / FormData — not React state)
    assert.match(page, /readLoginFormCredentials/)
    // Must not wipe password after success (blocks Save); only signedOut may clear DOM
    const passwordClears = page.match(/passwordInput\.value = ''/g) || []
    assert.equal(passwordClears.length, 1)
    assert.match(page, /signedOut[\s\S]*passwordInput\.value = ''/)
  })

  it('2 — autofill alone never authenticates; explicit Sign In required', () => {
    const page = readLoginPage()
    assert.match(page, /const handleFormSubmit = \(e\) => \{\s*e\.preventDefault\(\)\s*\}/)
    assert.doesNotMatch(page, /onClick=\{authenticate\}/)
    assert.doesNotMatch(page, /onSubmit=\{authenticate\}/)
    assert.doesNotMatch(page, /setTimeout/)
    assert.match(page, /onPointerDown=\{handleSignInPointerDown\}/)
    assert.doesNotMatch(page, /onClick=\{handleSignInClick\}/)
    assert.doesNotMatch(page, /onPointerUp=\{handleSignInPointerUp\}/)
    assert.match(page, /onKeyDown=\{handleSignInKeyDown\}/)
  })

  it('3 — Zlog never persists plaintext password in app storage', () => {
    const page = readLoginPage()
    assert.doesNotMatch(page, /value=\{.*email/)
    assert.doesNotMatch(page, /value=\{.*password/)
    assert.doesNotMatch(page, /defaultValue=\{/)
    assert.doesNotMatch(page, /localStorage\./)
    assert.doesNotMatch(page, /sessionStorage\./)
    assert.doesNotMatch(page, /document\.cookie\s*=/)
    assert.doesNotMatch(page, /navigator\.credentials/)
    assert.doesNotMatch(page, /PasswordCredential/)
  })

  it('4 — sign-out terminates the authenticated Zlog session', async () => {
    const topBar = readTopBar()
    const signOutSrc = readSignOutModule()
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
    assert.equal(result.signOutError, null)
    assert.match(signOutSrc, /signOut\(\{ scope: 'local' \}\)/)
    assert.match(topBar, /supabase\.auth\.signOut/)
    assert.match(topBar, /performDashboardSignOut/)
  })

  it('5 — sign-out must not erase browser/password-manager stored credentials', () => {
    const page = readLoginPage()
    const topBar = readTopBar()
    const signOutSrc = readSignOutModule()

    // No Credentials Management API wipe / preventSilentAccess / store overwrite
    for (const src of [page, topBar, signOutSrc]) {
      assert.doesNotMatch(src, /navigator\.credentials/)
      assert.doesNotMatch(src, /PasswordCredential/)
      assert.doesNotMatch(src, /preventSilentAccess/)
      assert.doesNotMatch(src, /credentials\.store/)
    }
    // Sign-out handoff clears Zlog form DOM only — autocomplete stays PM-friendly
    assert.match(page, /signedOut/)
    assert.match(page, /form\.reset\(/)
    assert.match(page, /autoComplete="username"/)
    assert.match(page, /autoComplete="current-password"/)
    assert.doesNotMatch(page, /autoComplete="off"/)
    assert.equal(SIGN_OUT_LOGIN_HREF, '/login?signedOut=1')
  })

  it('6 — after sign-out Zlog does not repopulate fields from app state (browser autofill OK)', () => {
    const page = readLoginPage()
    // Privacy clear is conditional on ?signedOut=1 only
    assert.match(page, /params\.get\('signedOut'\) !== '1'/)
    assert.match(page, /emailInput\.value = ''/)
    assert.match(page, /passwordInput\.value = ''/)
    // No app-held credential rehydration
    assert.doesNotMatch(page, /value=\{.*email/)
    assert.doesNotMatch(page, /value=\{.*password/)
    assert.doesNotMatch(page, /defaultValue=\{/)
    // Autofill remains allowed after the clear (not treated as a privacy violation)
    assert.match(page, /autoComplete="username"/)
    assert.match(page, /autoComplete="current-password"/)
  })

  it('routing after successful auth remains intact', () => {
    const page = readLoginPage()
    assert.match(page, /signInWithPassword/)
    assert.match(page, /safeAppReturnPath/)
    assert.match(page, /window\.location\.assign\(next \|\| ['"]\/dashboard['"]\)/)
  })
})
