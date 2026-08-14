#!/usr/bin/env node
/**
 * Change-scope gate — declared task scope vs dirty tree.
 *
 * Requires ZLOG_TASK_SCOPE or .zlog-task-scope.json when product files are dirty.
 * HARD FAIL when dirty product files fall outside the declared scope,
 * when high-risk shared files are touched without an allowing scope + approval,
 * or when the change budget for the scope is exceeded.
 */

import {
  normalizePath,
  listDirtyFiles,
  pathMatchesAny,
  pathMatchesPrefix,
  isGateExemptFile,
  isProductFile,
  loadScopeManifest,
  loadTaskScopeDeclaration,
} from './lib/scope-files.mjs'

function parseArgs(argv) {
  const out = { files: [], skipIfClean: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
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

function isHighRisk(file, highRiskShared) {
  const f = normalizePath(file)
  for (const entry of highRiskShared || []) {
    const p = normalizePath(entry.path || entry)
    if (pathMatchesPrefix(f, p)) return entry.reason || p
  }
  return null
}

function isAlwaysProtected(file, manifest) {
  return pathMatchesAny(
    file,
    manifest.alwaysProtectedPaths || [],
    manifest.alwaysProtectedGlobs || [],
  )
}

function fileAllowedByScope(file, scopeDef, extraFiles) {
  const f = normalizePath(file)
  if (extraFiles.includes(f)) return true
  if (isGateExemptFile(f) && !isProductFile(f)) {
    // Exempt infra always allowed for tooling scopes; for product scopes still OK if exempt
  }
  if (isGateExemptFile(f)) return true
  return pathMatchesAny(
    f,
    scopeDef.allowedPathPrefixes || [],
    scopeDef.allowedGlobs || [],
  )
}

function main() {
  const cli = parseArgs(process.argv.slice(2))
  const manifest = loadScopeManifest()
  const dirty = cli.files.length > 0 ? cli.files : listDirtyFiles()
  const productDirty = dirty.filter(isProductFile)

  if (productDirty.length === 0) {
    console.log(
      'check-change-scope: PASS (no product files in dirty tree — scope declaration not required)',
    )
    process.exit(0)
  }

  const declaration = loadTaskScopeDeclaration({
    // Fixture mode (--files without ZLOG_TASK_SCOPE): ignore developer .zlog-task-scope.json
    ignoreFile: cli.files.length > 0 && !(process.env.ZLOG_TASK_SCOPE || '').trim(),
  })
  if (!declaration.scope) {
    console.error('')
    console.error('═══════════════════════════════════════════════════════════')
    console.error(' CHANGE SCOPE UNDECLARED — HARD FAIL')
    console.error('═══════════════════════════════════════════════════════════')
    console.error('Product files are dirty but no task scope was declared.')
    console.error('')
    console.error('Declare ONE of:')
    console.error('  1) .zlog-task-scope.json  →  { "scope": "…", "reason": "…" }')
    console.error('  2) ZLOG_TASK_SCOPE=site-diary-report-date')
    console.error('     ZLOG_TASK_SCOPE_REASON="Fix Report Date local today"')
    console.error('')
    console.error('Available scopes:')
    for (const id of Object.keys(manifest.scopes || {})) {
      console.error(`  - ${id}`)
    }
    console.error('')
    console.error(`Dirty product files (${productDirty.length}):`)
    for (const f of productDirty.slice(0, 40)) console.error(`  - ${f}`)
    if (productDirty.length > 40) console.error(`  … +${productDirty.length - 40} more`)
    console.error('═══════════════════════════════════════════════════════════')
    process.exit(1)
  }

  const scopeDef = manifest.scopes?.[declaration.scope]
  if (!scopeDef) {
    console.error(`Unknown scope "${declaration.scope}".`)
    console.error(`Known: ${Object.keys(manifest.scopes || {}).join(', ')}`)
    process.exit(1)
  }

  if (scopeDef.requiresUserApproval && !declaration.approvalNote && !declaration.reason) {
    console.error(
      `Scope "${declaration.scope}" requires user approval — set reason/approvalNote documenting explicit approval.`,
    )
    process.exit(1)
  }

  if (scopeDef.requiresUserApproval) {
    const allow =
      process.env.ZLOG_ALLOW_PROTECTED_SCOPE === '1' ||
      process.env.ZLOG_ALLOW_PROTECTED_SCOPE === 'true'
    const reason = (process.env.ZLOG_PROTECTED_SCOPE_REASON || declaration.approvalNote || declaration.reason || '').trim()
    if (!allow || !reason) {
      console.error('')
      console.error('═══════════════════════════════════════════════════════════')
      console.error(' HIGH-RISK SCOPE REQUIRES EXPLICIT APPROVAL — HARD FAIL')
      console.error('═══════════════════════════════════════════════════════════')
      console.error(`Scope "${declaration.scope}" is marked requiresUserApproval.`)
      console.error('Set both:')
      console.error('  ZLOG_ALLOW_PROTECTED_SCOPE=1')
      console.error('  ZLOG_PROTECTED_SCOPE_REASON="user approved …"')
      console.error('and document approval in .zlog-task-scope.json approvalNote.')
      console.error('═══════════════════════════════════════════════════════════')
      process.exit(1)
    }
  }

  const outOfScope = []
  const highRiskHits = []

  for (const f of dirty) {
    if (isGateExemptFile(f) && !productDirty.includes(f)) continue
    // Always evaluate product files; also evaluate always-protected even if somehow miscategorised
    const product = isProductFile(f) || isAlwaysProtected(f, manifest)
    if (!product && isGateExemptFile(f)) continue

    if (!fileAllowedByScope(f, scopeDef, declaration.extraFiles)) {
      // Non-product docs may still be dirty; only fail product / always-protected
      if (isProductFile(f) || isAlwaysProtected(f, manifest)) {
        outOfScope.push(f)
      }
      continue
    }

    const hr = isHighRisk(f, manifest.highRiskShared)
    if (hr) {
      if (!scopeDef.allowsHighRisk) {
        highRiskHits.push({ file: f, reason: hr })
      }
    }
  }

  // Always-protected outside allowlist already in outOfScope; also flag protected+override gap
  if (outOfScope.length > 0 || highRiskHits.length > 0) {
    console.error('')
    console.error('═══════════════════════════════════════════════════════════')
    console.error(' CHANGE SCOPE VIOLATION — HARD FAIL')
    console.error('═══════════════════════════════════════════════════════════')
    console.error(`Declared scope: ${declaration.scope} (${declaration.source})`)
    if (declaration.reason) console.error(`Reason: ${declaration.reason}`)
    if (outOfScope.length) {
      console.error('')
      console.error('Files outside declared scope:')
      for (const f of outOfScope) console.error(`  - ${f}`)
    }
    if (highRiskHits.length) {
      console.error('')
      console.error('HIGH-RISK shared files touched without an allowing scope:')
      for (const h of highRiskHits) console.error(`  - ${h.file}  (${h.reason})`)
      console.error('Use scope global-shell / dashboard-shell / landing-auth / schema-migration')
      console.error('only after explicit user approval — do not redesign around a diary bug.')
    }
    console.error('')
    console.error('Fix: narrow the diff, or re-declare scope / add approved extraFiles,')
    console.error('or STOP and request approval for shared-component changes.')
    console.error('═══════════════════════════════════════════════════════════')
    process.exit(1)
  }

  const max = scopeDef.maxProductFiles
  if (typeof max === 'number' && productDirty.length > max) {
    const allowLarge =
      process.env.ZLOG_ALLOW_LARGE_DIFF === '1' ||
      process.env.ZLOG_ALLOW_LARGE_DIFF === 'true'
    const largeReason = (process.env.ZLOG_LARGE_DIFF_REASON || '').trim()
    if (!(allowLarge && largeReason)) {
      console.error('')
      console.error('═══════════════════════════════════════════════════════════')
      console.error(' CHANGE BUDGET EXCEEDED — HARD FAIL')
      console.error('═══════════════════════════════════════════════════════════')
      console.error(
        `Scope "${declaration.scope}" allows max ${max} product files; dirty has ${productDirty.length}.`,
      )
      console.error('This blocks narrow bug fixes that silently sprawl across the tree.')
      console.error('')
      console.error('If the large diff is intentional and user-approved:')
      console.error('  ZLOG_ALLOW_LARGE_DIFF=1 ZLOG_LARGE_DIFF_REASON="…" npm run check:change-scope')
      console.error('═══════════════════════════════════════════════════════════')
      process.exit(1)
    }
    console.warn('!!! LARGE DIFF OVERRIDE IN USE !!!')
    console.warn(`Reason: ${largeReason}`)
  }

  console.log(
    `check-change-scope: PASS (scope=${declaration.scope}, productFiles=${productDirty.length}, max=${max ?? 'n/a'})`,
  )
  process.exit(0)
}

main()
