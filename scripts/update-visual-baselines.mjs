#!/usr/bin/env node
/**
 * Intentionally update visual baselines — NEVER used by test:release.
 *
 * Required:
 *   ZLOG_ALLOW_VISUAL_BASELINE_UPDATE=1
 *   ZLOG_VISUAL_BASELINE_REASON="user approved …"
 *
 * Optional:
 *   ZLOG_VISUAL_SCREENS=landing,login  (one Playwright run per id)
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const playwrightCli = join(root, 'node_modules/@playwright/test/cli.js')

const allow =
  process.env.ZLOG_ALLOW_VISUAL_BASELINE_UPDATE === '1' ||
  process.env.ZLOG_ALLOW_VISUAL_BASELINE_UPDATE === 'true'
const reason = (process.env.ZLOG_VISUAL_BASELINE_REASON || '').trim()

if (!allow || !reason) {
  console.error('')
  console.error('═══════════════════════════════════════════════════════════')
  console.error(' VISUAL BASELINE UPDATE BLOCKED')
  console.error('═══════════════════════════════════════════════════════════')
  console.error('Updating screenshots requires explicit user authorisation:')
  console.error('  ZLOG_ALLOW_VISUAL_BASELINE_UPDATE=1')
  console.error('  ZLOG_VISUAL_BASELINE_REASON="user approved landing/login baselines"')
  console.error('  npm run test:visual:update')
  console.error('')
  console.error('Do NOT regenerate baselines to make an unrelated feature pass.')
  console.error('Do NOT baseline known_regression screens (e.g. dashboard Sign out).')
  console.error('═══════════════════════════════════════════════════════════')
  process.exit(1)
}

console.warn('!!! VISUAL BASELINE UPDATE IN USE !!!')
console.warn(`Reason: ${reason}`)

const baseArgs = [playwrightCli, 'test', '-c', 'playwright.visual.config.mjs', '--update-snapshots']

// Optional filter: comma-separated screen ids. One run per id (no `|` in argv).
const screens = (process.env.ZLOG_VISUAL_SCREENS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const runs = screens.length > 0 ? screens : [null]
let lastStatus = 0

for (const screen of runs) {
  const args = [...baseArgs]
  if (screen) {
    console.warn(`Updating baselines matching: ${screen}`)
    args.push('-g', screen)
  }
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    stdio: 'inherit',
  })
  if (r.error) {
    console.error(r.error.message)
    process.exit(1)
  }
  if (r.status !== 0) {
    lastStatus = r.status || 1
    break
  }
}

if (lastStatus === 0) {
  const check = spawnSync(process.execPath, [join(root, 'scripts/check-visual-baselines.mjs')], {
    cwd: root,
    stdio: 'inherit',
  })
  process.exit(check.status || 0)
}

process.exit(lastStatus || 1)
