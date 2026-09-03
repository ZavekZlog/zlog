#!/usr/bin/env node
/**
 * Hard fail when the dirty git tree touches protected shared paths
 * unless an explicit intentional override is provided.
 *
 * Protected path list is sourced from docs/PROTECTED_SCOPE_MANIFEST.json
 * (alwaysProtectedPaths / alwaysProtectedGlobs), with fallback to
 * docs/PROTECTED_CODE_BOUNDARIES.json for backwards compatibility.
 *
 * Override (both required):
 *   ZLOG_ALLOW_PROTECTED_SCOPE=1
 *   ZLOG_PROTECTED_SCOPE_REASON="user-authorised reason"
 * or:
 *   --allow-protected --reason "user-authorised reason"
 *
 * NOTE: Override alone is not enough for unrelated work — also run
 * check-change-scope with a declared task scope (npm run test:release).
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizePath,
  listDirtyFiles,
  pathMatchesAny,
  isGateExemptFile,
  loadScopeManifest,
  loadTaskScopeDeclaration,
} from './lib/scope-files.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const legacyPath = join(root, 'docs/PROTECTED_CODE_BOUNDARIES.json')

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
        .map((s) => normalizePath(s.trim()))
        .filter(Boolean)
      i++
    }
  }
  return out
}

function loadProtectedLists() {
  try {
    const manifest = loadScopeManifest()
    return {
      protectedPaths: manifest.alwaysProtectedPaths || [],
      protectedGlobs: manifest.alwaysProtectedGlobs || [],
      source: 'PROTECTED_SCOPE_MANIFEST.json',
    }
  } catch {
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'))
    return {
      protectedPaths: legacy.protectedPaths || [],
      protectedGlobs: legacy.protectedGlobs || [],
      source: 'PROTECTED_CODE_BOUNDARIES.json',
    }
  }
}

function isProtected(file, protectedPaths, protectedGlobs) {
  if (isGateExemptFile(file)) return false
  return pathMatchesAny(file, protectedPaths, protectedGlobs)
}

function main() {
  if (!existsSync(legacyPath) && !existsSync(join(root, 'docs/PROTECTED_SCOPE_MANIFEST.json'))) {
    console.error('Missing protected-scope manifest / boundaries')
    process.exit(2)
  }

  const lists = loadProtectedLists()
  const cli = parseArgs(process.argv.slice(2))
  // Fixture mode (--files): ignore developer .zlog-task-scope.json so unit tests stay hermetic.
  const declaration =
    cli.files.length > 0
      ? { allowProtectedScope: false, protectedScopeReason: '' }
      : loadTaskScopeDeclaration()
  const allow =
    cli.allow ||
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === '1' ||
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === 'true' ||
    declaration.allowProtectedScope
  const reason = (
    cli.reason ||
    process.env.ZLOG_PROTECTED_SCOPE_REASON ||
    declaration.protectedScopeReason ||
    ''
  ).trim()

  const dirty = cli.files.length > 0 ? cli.files : listDirtyFiles()
  const hits = dirty.filter((f) => isProtected(f, lists.protectedPaths, lists.protectedGlobs))

  if (hits.length === 0) {
    console.log(
      `check-protected-scope: PASS (no protected paths in dirty tree; source=${lists.source})`,
    )
    process.exit(0)
  }

  console.error('')
  console.error('═══════════════════════════════════════════════════════════')
  console.error(' PROTECTED SCOPE VIOLATION — HARD FAIL')
  console.error('═══════════════════════════════════════════════════════════')
  console.error(`Source: ${lists.source}`)
  console.error('Dirty tree touches protected shared areas:')
  for (const h of hits) console.error(`  - ${h}`)
  console.error('')
  console.error('A narrow feature task must NOT modify these silently.')
  console.error('STOP. Justify the wider scope and obtain explicit approval.')
  console.error('Also declare ZLOG_TASK_SCOPE / .zlog-task-scope.json and run:')
  console.error('  npm run check:change-scope')
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
    console.warn('Override does NOT replace change-scope allowlisting.')
    process.exit(0)
  }

  if (allow && !reason) {
    console.error('Override flag set but reason missing — refusing automatic pass.')
  }

  process.exit(1)
}

main()
