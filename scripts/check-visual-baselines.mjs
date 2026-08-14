#!/usr/bin/env node
/**
 * Guard: known_regression / pending screens must not have committed baselines.
 * Approved screens must have baseline PNGs for each required viewport (after first intentional update).
 *
 * Modes:
 *   --require-baselines   HARD FAIL if approved screens lack PNGs (used by test:release)
 *   default               WARN missing approved baselines; HARD FAIL if forbidden baselines exist
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadJson } from './lib/scope-files.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireBaselines = process.argv.includes('--require-baselines')

function listPngs(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.png')) out.push(name)
  }
  return out
}

function main() {
  const registry = loadJson('e2e/visual/VISUAL_BASELINE_REGISTRY.json')
  const base = join(root, registry.snapshotDir || 'e2e/visual/__baselines__')
  let failed = false

  const forbiddenIds = (registry.screens || [])
    .filter((s) => s.status !== 'approved')
    .map((s) => s.id)

  for (const vp of Object.keys(registry.viewports || {})) {
    const pngs = listPngs(join(base, vp))
    for (const id of forbiddenIds) {
      const hit = pngs.find((p) => p === `${id}.png` || p.startsWith(`${id}-`))
      if (hit) {
        console.error(
          `FORBIDDEN baseline present for non-approved screen "${id}" (${vp}/${hit}).`,
        )
        console.error('Delete it — do not bless known_regression / pending UI.')
        failed = true
      }
    }
  }

  const approved = (registry.screens || []).filter((s) => s.status === 'approved')
  const missing = []
  for (const screen of approved) {
    for (const vp of screen.viewports || []) {
      const p = join(base, vp, `${screen.id}.png`)
      if (!existsSync(p)) missing.push(`${vp}/${screen.id}.png`)
    }
  }

  if (missing.length) {
    const msg = `Missing approved baselines:\n  - ${missing.join('\n  - ')}`
    if (requireBaselines) {
      console.error(msg)
      console.error('Create them ONLY via: npm run test:visual:update')
      failed = true
    } else {
      console.warn(`check-visual-baselines: WARN — ${msg}`)
    }
  }

  if (failed) {
    console.error('check-visual-baselines: FAIL')
    process.exit(1)
  }
  console.log(
    `check-visual-baselines: PASS (approved=${approved.length}, blocked=${forbiddenIds.length})`,
  )
}

main()
