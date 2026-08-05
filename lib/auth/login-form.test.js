import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  passwordInputType,
  passwordVisibilityLabel,
  readLoginFormCredentials,
} from './login-form.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('readLoginFormCredentials', () => {
  it('reads autofilled DOM values from FormData', () => {
    const formData = new FormData()
    formData.set('email', '  crew@zlog.app  ')
    formData.set('password', 'SitePass!42')

    const result = readLoginFormCredentials(formData)

    assert.deepEqual(result, {
      email: 'crew@zlog.app',
      password: 'SitePass!42',
    })
  })

  it('does not invent empty credentials when FormData has values', () => {
    const formData = new FormData()
    formData.set('email', 'saved@example.com')
    formData.set('password', 'autofilled-secret')

    const { email, password } = readLoginFormCredentials(formData)

    assert.notEqual(email, '')
    assert.notEqual(password, '')
    assert.equal(password, 'autofilled-secret')
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

    // FormData(form) will throw on a plain object — helper should fall back.
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

  it('toggling visibility does not alter a stored password value', () => {
    const stored = { password: 'KeepMeVisible' }
    const shown = passwordInputType(true)
    const hidden = passwordInputType(false)

    assert.equal(shown, 'text')
    assert.equal(hidden, 'password')
    assert.equal(stored.password, 'KeepMeVisible')
  })
})

describe('failed auth credential preservation contract', () => {
  it('credentials read at submit remain available after a failed-auth style reuse', () => {
    const formData = new FormData()
    formData.set('email', 'retry@zlog.app')
    formData.set('password', 'wrong-password')

    const firstAttempt = readLoginFormCredentials(formData)
    // Simulate failed auth: UI keeps the same form DOM / FormData; no clear.
    const retryAttempt = readLoginFormCredentials(formData)

    assert.deepEqual(firstAttempt, retryAttempt)
    assert.equal(retryAttempt.email, 'retry@zlog.app')
    assert.equal(retryAttempt.password, 'wrong-password')
  })
})

describe('BUG M0-01 — no autofill auto-submit contract', () => {
  it('login page Sign In is type=button and form submit does not call signIn', () => {
    const page = readFileSync(join(here, '../../app/(auth)/login/page.jsx'), 'utf8')
    assert.match(page, /type="button"/)
    assert.match(page, /onClick=\{authenticate\}/)
    assert.match(page, /handleFormSubmit/)
    assert.doesNotMatch(page, /onSubmit=\{handleLogin\}/)
    assert.doesNotMatch(page, /type="submit"/)
    assert.doesNotMatch(page, /setTimeout/)
    assert.match(page, /signInWithPassword/)
  })
})

describe('BUG M0-02 — no app credential persistence / autofill attrs', () => {
  it('login inputs use recommended autocomplete and stay uncontrolled', () => {
    const page = readFileSync(join(here, '../../app/(auth)/login/page.jsx'), 'utf8')
    assert.match(page, /autoComplete="username"/)
    assert.match(page, /autoComplete="current-password"/)
    assert.doesNotMatch(page, /autoComplete="off"/)
    // No controlled React binding for credentials
    assert.doesNotMatch(page, /value=\{.*email/)
    assert.doesNotMatch(page, /value=\{.*password/)
    assert.doesNotMatch(page, /defaultValue=\{/)
    // No custom credential persistence APIs
    assert.doesNotMatch(page, /localStorage\./)
    assert.doesNotMatch(page, /sessionStorage\./)
    assert.doesNotMatch(page, /document\.cookie\s*=/)
  })

  it('sign-out clears login form via signedOut handoff (no password storage)', () => {
    const topBar = readFileSync(
      join(here, '../../components/dashboard/DashboardTopBar.jsx'),
      'utf8',
    )
    const page = readFileSync(join(here, '../../app/(auth)/login/page.jsx'), 'utf8')
    assert.match(topBar, /signOut\(/)
    assert.match(topBar, /\/login\?signedOut=1/)
    assert.match(page, /signedOut/)
    assert.match(page, /form\.reset\(/)
  })

  it('post-auth return uses safe next path to restore the report URL', () => {
    const page = readFileSync(join(here, '../../app/(auth)/login/page.jsx'), 'utf8')
    assert.match(page, /safeAppReturnPath/)
    assert.match(page, /window\.location\.assign\(next \|\| ['"]\/dashboard['"]\)/)
  })
})
