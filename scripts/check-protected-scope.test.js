import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/check-protected-scope.mjs')

function run(args, env = {}) {
  const cleanEnv = { ...process.env, ...env }
  // Do not inherit a parent shell override into negative tests.
  if (!Object.prototype.hasOwnProperty.call(env, 'ZLOG_ALLOW_PROTECTED_SCOPE')) {
    delete cleanEnv.ZLOG_ALLOW_PROTECTED_SCOPE
  }
  if (!Object.prototype.hasOwnProperty.call(env, 'ZLOG_PROTECTED_SCOPE_REASON')) {
    delete cleanEnv.ZLOG_PROTECTED_SCOPE_REASON
  }
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv,
  })
}

describe('protected scope gate', () => {
  it('PASS when only non-protected files are listed', () => {
    const r = run(['--files', 'lib/golden-journeys/journey-b-new-diary.test.js,README.md'])
    assert.equal(r.status, 0, r.stderr || r.stdout)
  })

  it('HARD FAIL when auth production path is listed without override', () => {
    const r = run(['--files', 'app/(auth)/login/page.jsx'])
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stderr, /PROTECTED SCOPE VIOLATION/)
  })

  it('override requires both allow flag and non-empty reason', () => {
    const missingReason = run(['--files', 'lib/auth/login-form.js', '--allow-protected'])
    assert.equal(missingReason.status, 1)

    const ok = run([
      '--files',
      'lib/auth/login-form.js',
      '--allow-protected',
      '--reason',
      'user authorised auth fix',
    ])
    assert.equal(ok.status, 0, ok.stderr || ok.stdout)
    assert.match(ok.stderr + ok.stdout, /OVERRIDE/)
  })

  it('test files under protected dirs do not trip the gate', () => {
    const r = run(['--files', 'lib/auth/login-form.test.js'])
    assert.equal(r.status, 0, r.stderr || r.stdout)
  })
})
