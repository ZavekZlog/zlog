import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/check-change-scope.mjs')

function run(args, env = {}) {
  const cleanEnv = { ...process.env, ...env }
  for (const k of [
    'ZLOG_TASK_SCOPE',
    'ZLOG_TASK_SCOPE_REASON',
    'ZLOG_TASK_SCOPE_EXTRA_FILES',
    'ZLOG_TASK_SCOPE_APPROVAL',
    'ZLOG_ALLOW_PROTECTED_SCOPE',
    'ZLOG_PROTECTED_SCOPE_REASON',
    'ZLOG_ALLOW_LARGE_DIFF',
    'ZLOG_LARGE_DIFF_REASON',
    'ZLOG_IGNORE_SCOPE_FILE',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(env, k)) delete cleanEnv[k]
  }
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv,
  })
}

describe('change-scope gate', () => {
  it('PASS when no product files are listed', () => {
    const r = run(['--files', 'scripts/check-change-scope.mjs,docs/PROTECTED_SCOPE_MANIFEST.json'])
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /PASS/)
  })

  it('HARD FAIL when product files dirty without declared scope', () => {
    const r = run(['--files', 'lib/report-setup.js'])
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stderr, /CHANGE SCOPE UNDECLARED/)
  })

  it('PASS when site-diary-report-date scope matches date files only', () => {
    const r = run(['--files', 'lib/report-setup.js,lib/diary-draft.js'], {
      ZLOG_TASK_SCOPE: 'site-diary-report-date',
      ZLOG_TASK_SCOPE_REASON: 'Fix Report Date local today',
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /scope=site-diary-report-date/)
  })

  it('HARD FAIL when diary-date scope touches Dashboard Sign out / top bar', () => {
    const r = run(
      ['--files', 'lib/report-setup.js,components/dashboard/DashboardTopBar.jsx'],
      {
        ZLOG_TASK_SCOPE: 'site-diary-report-date',
        ZLOG_TASK_SCOPE_REASON: 'Fix Report Date',
      },
    )
    assert.equal(r.status, 1)
    assert.match(r.stderr, /CHANGE SCOPE VIOLATION/)
    assert.match(r.stderr, /DashboardTopBar/)
  })

  it('HARD FAIL when diary scope edits globals.css (shared CTA blast radius)', () => {
    const r = run(['--files', 'app/globals.css'], {
      ZLOG_TASK_SCOPE: 'site-diary',
      ZLOG_TASK_SCOPE_REASON: 'unrelated diary work',
    })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /CHANGE SCOPE VIOLATION|HIGH-RISK/)
  })

  it('HARD FAIL when change budget exceeded for narrow scope', () => {
    const many = Array.from({ length: 12 }, (_, i) => `lib/report-setup.js`).join(',')
    // same file counted once — use distinct fake paths under allowlist
    const files = [
      'lib/report-setup.js',
      'lib/diary-draft.js',
      'lib/diary-setup-blank.js',
      'lib/diary-report-date.test.js',
      'app/dashboard/diary/setup/page.jsx',
      'app/dashboard/project/[id]/diary/page.jsx',
      // extra product files that match prefix? report-date allowlist is tight —
      // inject via extraFiles still counts toward budget
    ].join(',')
    // Build 11 distinct allowlisted product paths by using extraFiles for synthetic names
    // that won't match allowlist unless we use real allowlisted files only.
    // Instead: use site-diary-persistence with many diary lib files listed.
    const persistenceFiles = [
      'lib/diary-draft.js',
      'lib/diary-save.js',
      'lib/diary-cover-photo.js',
      'lib/diary-edit-hydrate.js',
      'lib/diary-setup-blank.js',
      'lib/diary-setup-continue.js',
      'lib/diary-setup-project-dates.js',
      'lib/diary-form-hydrate.js',
      'lib/diary-routing.js',
      'lib/diary-view-mode.js',
      'lib/project-sticky-fields.js',
      'lib/project-reference-persistence.test.js',
      'lib/report-setup.js',
      'app/dashboard/diary/setup/page.jsx',
      'app/dashboard/diary/page.jsx',
      'app/dashboard/project/[id]/diary/page.jsx',
      'lib/diary-new-sticky-defaults.test.js',
      'lib/diary-report-date.test.js',
      'lib/diary-fetch-resilience.test.js',
    ].join(',')
    // maxProductFiles for persistence is 18; tests are exempt so product count lower.
    // Force budget fail with site-diary-report-date max 10 and 11 product files via extra:
    const r = run(
      [
        '--files',
        [
          'lib/report-setup.js',
          'lib/diary-draft.js',
          'lib/diary-setup-blank.js',
          'app/dashboard/diary/setup/page.jsx',
          'app/dashboard/project/[id]/diary/page.jsx',
          'lib/diary-save.js',
          'lib/diary-cover-photo.js',
          'lib/diary-edit-hydrate.js',
          'lib/diary-setup-continue.js',
          'lib/diary-routing.js',
          'lib/diary-view-mode.js',
        ].join(','),
      ],
      {
        ZLOG_TASK_SCOPE: 'site-diary-report-date',
        ZLOG_TASK_SCOPE_REASON: 'sprawl',
        ZLOG_TASK_SCOPE_EXTRA_FILES: [
          'lib/diary-save.js',
          'lib/diary-cover-photo.js',
          'lib/diary-edit-hydrate.js',
          'lib/diary-setup-continue.js',
          'lib/diary-routing.js',
          'lib/diary-view-mode.js',
        ].join(','),
      },
    )
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stderr, /CHANGE BUDGET EXCEEDED/)
  })

  it('global-shell requires approval flags', () => {
    const r = run(['--files', 'app/globals.css'], {
      ZLOG_TASK_SCOPE: 'global-shell',
      ZLOG_TASK_SCOPE_REASON: 'adjust CTA',
    })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /HIGH-RISK SCOPE REQUIRES EXPLICIT APPROVAL/)
  })

  it('global-shell passes with approval flags', () => {
    const r = run(['--files', 'app/globals.css'], {
      ZLOG_TASK_SCOPE: 'global-shell',
      ZLOG_TASK_SCOPE_REASON: 'user approved CTA plate fix',
      ZLOG_ALLOW_PROTECTED_SCOPE: '1',
      ZLOG_PROTECTED_SCOPE_REASON: 'user approved CTA plate fix',
      ZLOG_TASK_SCOPE_APPROVAL: 'user approved CTA plate fix',
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  })
})
