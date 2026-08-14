#!/usr/bin/env node
/**
 * Run visual regression compares (NEVER updates snapshots).
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const playwrightCli = join(root, 'node_modules/@playwright/test/cli.js')

if (process.argv.includes('--update-snapshots') || process.env.UPDATE_SNAPSHOTS === '1') {
  console.error('Refusing --update-snapshots on test:visual.')
  console.error('Use: npm run test:visual:update (requires approval flags).')
  process.exit(1)
}

const r = spawnSync(
  process.execPath,
  [playwrightCli, 'test', '-c', 'playwright.visual.config.mjs'],
  {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    stdio: 'inherit',
  },
)

if (r.error) {
  console.error(r.error.message)
  process.exit(1)
}

process.exit(r.status || 0)
