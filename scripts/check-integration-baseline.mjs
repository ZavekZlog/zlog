#!/usr/bin/env node
/**
 * Fail when an integration candidate differs from the accepted functional
 * baseline outside the explicit visual allowlist and gate files.
 * Unknown paths fail. Protected-core paths always fail.
 */

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'docs/ZLOG_ACCEPTANCE_BASELINE.json')

function gitLines(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'git failed')
    process.exit(2)
  }
  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean)
}

function matchesPrefix(file, entry) {
  const prefix = entry.replace(/\\/g, '/')
  if (prefix.endsWith('/')) return file.startsWith(prefix)
  return file === prefix
}

function main() {
  if (!existsSync(manifestPath)) {
    console.error('FAIL — missing docs/ZLOG_ACCEPTANCE_BASELINE.json')
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const base = String(manifest.accepted_functional_baseline || '').trim()
  const allow = new Set([
    ...(manifest.visual_allowlist || []),
    ...(manifest.gate_files || []),
  ])
  const protectedCore = manifest.protected_core_files || []
  const rejected = manifest.rejected_path_markers || []
  const failures = []

  if (!/^[0-9a-f]{40}$/i.test(base)) {
    failures.push('accepted_functional_baseline is not a full SHA')
  }

  const changed = new Set([
    ...gitLines(['diff', '--name-only', base]),
    ...gitLines(['diff', '--name-only', '--cached', base]),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ])

  for (const file of changed) {
    if (file === 'app/page.tsx') {
      failures.push('app/page.tsx differs from the accepted functional baseline')
    }
    if (file.endsWith('.bak') || file.includes('.bak')) {
      failures.push(`backup file is not allowed: ${file}`)
    }
    for (const marker of rejected) {
      if (file === marker || file.endsWith(`/${marker}`) || file.includes(marker)) {
        failures.push(`rejected WIP path: ${file}`)
      }
    }
    for (const entry of protectedCore) {
      if (matchesPrefix(file, entry)) {
        failures.push(`protected core differs from baseline: ${file}`)
      }
    }
    if (!allow.has(file)) {
      failures.push(`unknown path outside allowlist: ${file}`)
    }
  }

  const unique = [...new Set(failures)]
  if (unique.length) {
    console.error('check-integration-baseline: FAIL')
    console.error(`baseline: ${base}`)
    console.error(`changed paths: ${changed.size}`)
    for (const item of unique) console.error(`  - ${item}`)
    process.exit(1)
  }

  console.log('check-integration-baseline: PASS')
  console.log(`baseline: ${base}`)
  console.log(`changed paths: ${changed.size}`)
  for (const file of [...changed].sort()) console.log(`  allow ${file}`)
}

main()
