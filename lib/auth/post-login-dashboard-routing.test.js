/**
 * Post-login must land on the 5-card Site Control Panel unless session recovery=1.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOGIN_SESSION_RECOVERY_PARAM,
  loginUrlWithReturn,
  resolvePostLoginDestination,
} from './return-path.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dashboardPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
const diaryHubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const loginPage = readFileSync(join(root, 'app/(auth)/login/page.jsx'), 'utf8')
const middleware = readFileSync(join(root, 'lib/supabase/middleware.js'), 'utf8')

describe('post-login Site Control Panel routing', () => {
  it('A — fresh login without recovery lands on /dashboard', () => {
    assert.equal(resolvePostLoginDestination({ next: null, recovery: null }), '/dashboard')
    assert.equal(
      resolvePostLoginDestination({ next: '/dashboard/diary', recovery: null }),
      '/dashboard',
    )
    assert.match(loginPage, /window\.location\.replace\(destination\)/)
    assert.match(loginPage, /recovery: params\.get\('recovery'\)/)
  })

  it('B — voluntary sign-out login lands on /dashboard even with stale next', () => {
    assert.equal(
      resolvePostLoginDestination({
        next: '/dashboard/diary',
        signedOut: true,
        recovery: '1',
      }),
      '/dashboard',
    )
    assert.match(loginPage, /router\.replace\('\/login\?signedOut=1'\)/)
  })

  it('C — stale diary next on normal login does not bypass the Control Panel', () => {
    assert.equal(
      resolvePostLoginDestination({ next: '/dashboard/diary', recovery: null }),
      '/dashboard',
    )
    assert.equal(
      resolvePostLoginDestination({ next: '/dashboard/diary/setup?report=r&project=p' }),
      '/dashboard',
    )
    assert.match(middleware, /resolvePostLoginDestination/)
    assert.doesNotMatch(middleware, /if \(next\) \{[\s\S]*target\.pathname/)
  })

  it('D — Site Diary 2-card hub is only reached via explicit dashboard navigation', () => {
    assert.match(dashboardPage, /router\.push\('\/dashboard\/diary'\)/)
    assert.match(dashboardPage, /REPORT_THEME_LIST\.map/)
    assert.match(diaryHubPage, /Start a New Diary|startNewReport/)
    assert.match(diaryHubPage, /backHref=\{mode \? undefined : '\/dashboard'\}/)
    assert.doesNotMatch(dashboardPage, /useEffect[\s\S]{0,120}router\.push\('\/dashboard\/diary'\)/)
  })

  it('E — session recovery with recovery=1 restores protected workbench URLs', () => {
    const workbench = '/dashboard/project/abc/diary?report=rep-1'
    assert.equal(
      loginUrlWithReturn(workbench),
      `/login?${LOGIN_SESSION_RECOVERY_PARAM}=1&next=${encodeURIComponent(workbench)}`,
    )
    assert.equal(
      resolvePostLoginDestination({ next: workbench, recovery: '1' }),
      workbench,
    )
  })
})
