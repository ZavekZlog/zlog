#!/usr/bin/env node
/**
 * Canonical Zlog anti-regression / release gate.
 *
 * Agents must run: npm run test:release
 * Passing only the unit tests you personally added is NOT sufficient.
 *
 * Includes genuine Playwright screenshot visual regression for APPROVED
 * screens only. Does NOT auto-update baselines.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const NODE_TESTS = [
  'lib/auth/login-form.test.js',
  'lib/auth/sign-out.test.js',
  'lib/auth/return-path.test.js',
  'lib/auth/session-persistence.test.js',
  'lib/diary-site-diary-contract.test.js',
  'lib/diary-autosave.test.js',
  'lib/report-deletion.test.js',
  'lib/diary-setup-blank.test.js',
  'lib/diary-setup-author.test.js',
  'lib/diary-view-mode.test.js',
  'lib/diary-form-hydrate.test.js',
  'lib/diary-routing.test.js',
  'lib/diary-setup-continue.test.js',
  'lib/diary-cover-photo.test.js',
  'lib/diary-edit-hydrate.test.js',
  'lib/diary-new-sticky-defaults.test.js',
  'lib/diary-report-date.test.js',
  'lib/diary-fetch-resilience.test.js',
  'lib/project-reference-persistence.test.js',
  'lib/premium-ui-layout-contract.test.js',
  'lib/premium-ui-back-contract.test.js',
  'lib/premium-ui-workbench-cta-contract.test.js',
  'lib/diary-pdf-layout.test.js',
  'lib/diary-checkpoint-ab65437-contract.test.js',
  'lib/cta-hierarchy-contract.test.js',
  'lib/zlog-text-wordmark-contract.test.js',
  'lib/golden-journeys/journey-b-new-diary.test.js',
  'lib/golden-journeys/journey-c-previous-diary.test.js',
  'lib/golden-journeys/journey-d-saved-diary.test.js',
  'scripts/check-protected-scope.test.js',
  'scripts/check-change-scope.test.js',
  'scripts/check-approved-copy.test.js',
  'scripts/check-visual-baselines.test.js',
  'lib/ai-annotation/area-photo-viewer-dormant.test.js',
  'scripts/check-eslint-gate.test.js',
]

function run(label, command, args, opts = {}) {
  console.log(`\n── ${label} ──`)
  const r = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    stdio: 'inherit',
    ...opts,
  })
  if (r.status !== 0) {
    console.error(`\nNOT READY FOR RELEASE — failed: ${label}`)
    process.exit(r.status || 1)
  }
}

function runPlaywright(label, playwrightArgs) {
  console.log(`\n── ${label} ──`)
  const playwrightCli = join(root, 'node_modules/@playwright/test/cli.js')
  const r = spawnSync(process.execPath, [playwrightCli, ...playwrightArgs], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    stdio: 'pipe',
  })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  if (r.error) {
    console.error(r.error.message)
    console.error(`\nNOT READY FOR RELEASE — failed: ${label}`)
    process.exit(1)
  }
  if (r.status !== 0) {
    if (/Executable doesn't exist|browserType\.launch/i.test(out)) {
      console.error(out)
      console.error(`\nNOT READY FOR RELEASE — failed: ${label}`)
      console.error('Playwright browsers missing. Install with: npx playwright install chromium')
      console.error('Visual/E2E cannot be skipped silently in release — install browsers or set ZLOG_SKIP_E2E=1 only for local infra debugging (not for claiming release ready).')
      process.exit(1)
    }
    process.stdout.write(r.stdout || '')
    process.stderr.write(r.stderr || '')
    console.error(`\nNOT READY FOR RELEASE — failed: ${label}`)
    process.exit(r.status || 1)
  }
  process.stdout.write(r.stdout || '')
  console.log(`${label}: PASS`)
}

function main() {
  console.log('Zlog canonical release gate — npm run test:release')

  run('change-scope', process.execPath, [join(root, 'scripts/check-change-scope.mjs')])
  run('protected-scope', process.execPath, [join(root, 'scripts/check-protected-scope.mjs')])
  run('approved-copy', process.execPath, [join(root, 'scripts/check-approved-copy.mjs')])
  run('behaviour-registry', process.execPath, [
    join(root, 'scripts/check-behaviour-registry.mjs'),
  ])
  run('visual-baseline inventory', process.execPath, [
    join(root, 'scripts/check-visual-baselines.mjs'),
    '--require-baselines',
  ])
  run('node regression suite', process.execPath, ['--test', ...NODE_TESTS])

  if (existsSync(join(root, 'eslint.config.mjs')) || existsSync(join(root, 'eslint.config.js'))) {
    run('eslint', process.execPath, [join(root, 'scripts/run-eslint-gate.mjs')])
  }

  const skipE2E =
    process.env.ZLOG_SKIP_E2E === '1' || process.env.ZLOG_SKIP_E2E === 'true'
  if (skipE2E) {
    console.warn('\n── playwright behavioural e2e ── SKIPPED (ZLOG_SKIP_E2E=1)')
    console.warn('\n── playwright visual regression ── SKIPPED (ZLOG_SKIP_E2E=1)')
    console.warn('Do not claim release-ready when E2E/visual are skipped.')
  } else {
    runPlaywright('playwright behavioural e2e', ['test', '-c', 'playwright.config.js'])
    // Compare only — never --update-snapshots
    runPlaywright('playwright visual regression (HARD FAIL on mismatch)', [
      'test',
      '-c',
      'playwright.visual.config.mjs',
    ])
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(' test:release — AUTOMATED PORTION PASS')
  console.log(' Visual: approved screens compared to committed baselines.')
  console.log(' Dashboard / Sign out / diary shells: NOT baselined until manual approval.')
  console.log(' Manual Visual / Mobile / Commercial QA still required for pending screens.')
  console.log('═══════════════════════════════════════════════════════════')
}

main()
