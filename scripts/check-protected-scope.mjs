#!/usr/bin/env node
/**
 * Hard fail when the dirty git tree touches protected shared paths
 * unless an explicit intentional override is provided.
 *
 * Override (both required):
 *   ZLOG_ALLOW_PROTECTED_SCOPE=1
 *   ZLOG_PROTECTED_SCOPE_REASON="user-authorised reason"
 * or:
 *   --allow-protected --reason "user-authorised reason"
 */

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'docs/PROTECTED_CODE_BOUNDARIES.json')

function parseArgs(argv) {
  const out = { allow: false, reason: '', files: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--allow-protected') out.allow = true
    if (a === '--reason') {
      out.reason = String(argv[i + 1] || '')
      i++
    }
    if (a === '--files') {
      out.files = String(argv[i + 1] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      i++
    }
  }
  return out
}

function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
}

function listDirtyFiles() {
  const r = spawnSync('git', ['status', '--porcelain', '-uall'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (r.error) {
    console.error('check-protected-scope: git failed to start:', r.error.message)
    process.exit(2)
  }
  if (r.status !== 0) {
    console.error('check-protected-scope: git status failed:', r.stderr || r.stdout)
    process.exit(2)
  }
  const files = []
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    // porcelain: XY PATH or XY ORIG -> PATH
    const rest = line.slice(3)
    const arrow = rest.indexOf(' -> ')
    const pathPart = arrow >= 0 ? rest.slice(arrow + 4) : rest
    files.push(normalizePath(pathPart.replace(/^"|"$/g, '')))
  }
  return [...new Set(files)]
}

function isProtected(file, protectedPaths, protectedGlobs) {
  const f = normalizePath(file)
  // Tests / E2E / gate scripts may lock protected behaviour without being product surface.
  if (/\.(test|spec)\.(js|jsx|ts|tsx|mjs)$/.test(f)) return false
  if (f.startsWith('e2e/')) return false
  if (f.startsWith('scripts/')) return false
  if (f === 'playwright.config.js' || f === 'playwright.config.ts') return false
  if (f === 'docs/PROTECTED_CODE_BOUNDARIES.json') return false
  if (f === 'docs/PROTECTED_CODE_BOUNDARIES.md') return false
  if (f === 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json') return false

  for (const prefix of protectedPaths) {
    const p = normalizePath(prefix)
    if (f === p || f.startsWith(p)) return true
    if (!p.endsWith('/') && f.startsWith(`${p}/`)) return true
  }
  for (const glob of protectedGlobs) {
    const re = new RegExp(
      `^${normalizePath(glob)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, ':::DS:::')
        .replace(/\*/g, '[^/]*')
        .replace(/:::DS:::/g, '.*')}$`,
    )
    if (re.test(f)) return true
  }
  return false
}

function main() {
  if (!existsSync(manifestPath)) {
    console.error('Missing docs/PROTECTED_CODE_BOUNDARIES.json')
    process.exit(2)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const cli = parseArgs(process.argv.slice(2))
  const allow =
    cli.allow ||
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === '1' ||
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === 'true'
  const reason = (cli.reason || process.env.ZLOG_PROTECTED_SCOPE_REASON || '').trim()

  const dirty = cli.files.length > 0 ? cli.files : listDirtyFiles()
  const hits = dirty.filter((f) =>
    isProtected(f, manifest.protectedPaths || [], manifest.protectedGlobs || []),
  )

  if (hits.length === 0) {
    console.log('check-protected-scope: PASS (no protected paths in dirty tree)')
    process.exit(0)
  }

  console.error('')
  console.error('═══════════════════════════════════════════════════════════')
  console.error(' PROTECTED SCOPE VIOLATION — HARD FAIL')
  console.error('═══════════════════════════════════════════════════════════')
  console.error('Dirty tree touches protected shared areas:')
  for (const h of hits) console.error(`  - ${h}`)
  console.error('')
  console.error('A narrow feature task must NOT modify these silently.')
  console.error('STOP. Justify the wider scope and obtain explicit approval.')
  console.error('')
  console.error('Intentional override (only after user authorisation):')
  console.error(
    '  ZLOG_ALLOW_PROTECTED_SCOPE=1 ZLOG_PROTECTED_SCOPE_REASON="…" npm run check:protected-scope',
  )
  console.error('  or: npm run check:protected-scope -- --allow-protected --reason "…"')
  console.error('═══════════════════════════════════════════════════════════')
  console.error('')

  if (allow && reason) {
    console.warn('!!! PROTECTED SCOPE OVERRIDE IN USE !!!')
    console.warn(`Reason: ${reason}`)
    console.warn('This must be an explicit user-authorised exception.')
    process.exit(0)
  }

  if (allow && !reason) {
    console.error('Override flag set but reason missing — refusing automatic pass.')
  }

  process.exit(1)
}

main()