import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  loginUrlWithReturn,
  safeAppReturnPath,
  SESSION_EXPIRED_SAVE_MESSAGE,
} from './return-path.js'

describe('safeAppReturnPath', () => {
  it('accepts dashboard paths with query', () => {
    const path = '/dashboard/project/abc/diary?report=rep-1'
    assert.equal(safeAppReturnPath(path), path)
    assert.equal(safeAppReturnPath(encodeURIComponent(path)), path)
  })

  it('rejects open redirects and non-app paths', () => {
    assert.equal(safeAppReturnPath('https://evil.example/phish'), null)
    assert.equal(safeAppReturnPath('//evil.example'), null)
    assert.equal(safeAppReturnPath('/login'), null)
    assert.equal(safeAppReturnPath('/signup'), null)
    assert.equal(safeAppReturnPath(null), null)
    assert.equal(safeAppReturnPath(''), null)
  })
})

describe('loginUrlWithReturn', () => {
  it('embeds a safe next param', () => {
    const path = '/dashboard/project/abc/diary?report=rep-1'
    assert.equal(
      loginUrlWithReturn(path),
      `/login?next=${encodeURIComponent(path)}`,
    )
  })

  it('falls back to /login for unsafe paths', () => {
    assert.equal(loginUrlWithReturn('https://evil.example'), '/login')
  })
})

describe('SESSION_EXPIRED_SAVE_MESSAGE', () => {
  it('explains recovery without the old dead-end copy', () => {
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /sign-in has timed out/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /Sign in again/i)
    assert.match(SESSION_EXPIRED_SAVE_MESSAGE, /save your work/i)
    assert.doesNotMatch(SESSION_EXPIRED_SAVE_MESSAGE, /You must be signed in to save a report/)
  })
})
