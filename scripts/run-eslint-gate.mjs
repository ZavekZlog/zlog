#!/usr/bin/env node
/**
 * Canonical ESLint anti-regression gate.
 *
 * Errors (except none — exceptions are inline disables) must be zero.
 * Approved baseline warnings are reported but allowed.
 * Any NEW warning fingerprint fails, even if the total count did not increase.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DORMANT_BEHAVIOUR_ID,
  PHOTO_001_NO_IMG_SURFACES,
  classifyDormantEslintErrors,
  classifyWarningRule,
  diffWarningBaselines,
  fingerprintFromBaselineRecord,
  fingerprintFromEslintMessage,
  isPhoto001NoImgSurface,
  loadJson,
  relFromRoot,
  repoRoot,
} from './lib/eslint-gate.mjs'
import { collectDisableProblems } from './lib/eslint-gate.mjs'

function parseArgs(argv) {
  const out = {
    eslintJson: '',
    writeBaseline: false,
    exceptions: 'docs/contracts/APPROVED_ESLINT_EXCEPTIONS.json',
    warnings: 'docs/contracts/APPROVED_ESLINT_WARNINGS.json',
    dormantDefects: 'docs/contracts/DORMANT_ESLINT_DEFECTS.json',
    behaviours: 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json',
    skipExceptions: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--eslint-json') out.eslintJson = argv[++i]
    if (a === '--write-warnings-baseline') out.writeBaseline = true
    if (a === '--exceptions') out.exceptions = argv[++i]
    if (a === '--warnings-baseline') out.warnings = argv[++i]
    if (a === '--dormant-defects') out.dormantDefects = argv[++i]
    if (a === '--behaviour-registry') out.behaviours = argv[++i]
    if (a === '--skip-exceptions') out.skipExceptions = true
  }
  return out
}

function runEslintJson() {
  const r = spawnSync('npx', ['eslint', '.', '-f', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  const raw = `${r.stdout || ''}`
  const start = raw.indexOf('[')
  if (start < 0) {
    console.error(r.stderr || raw)
    throw new Error('eslint did not emit JSON')
  }
  return JSON.parse(raw.slice(start))
}

function fileTextCache() {
  const cache = new Map()
  return (abs) => {
    if (!cache.has(abs)) {
      cache.set(abs, existsSync(abs) ? readFileSync(abs, 'utf8') : '')
    }
    return cache.get(abs)
  }
}

function main() {
  const cli = parseArgs(process.argv.slice(2))
  const registry = loadJson(cli.exceptions)

  if (!cli.skipExceptions) {
    const problems = collectDisableProblems({
      exceptions: registry.exceptions,
      protectedRules: registry.protectedRules,
    })
    if (problems.length) {
      console.error('ESLint exception registry: FAIL')
      for (const p of problems) {
        console.error(`  [${p.code}] ${p.file}:${p.line} ${p.detail}`)
      }
      process.exit(1)
    }
  }

  const results = cli.eslintJson
    ? JSON.parse(readFileSync(cli.eslintJson, 'utf8'))
    : runEslintJson()

  const getText = fileTextCache()
  const errors = []
  const warningRecords = []

  for (const file of results) {
    const abs = file.filePath
    const rel = relFromRoot(abs)
    const text = getText(abs)
    for (const msg of file.messages || []) {
      if (!msg.ruleId && msg.fatal) {
        errors.push({ file: rel, line: msg.line, rule: 'fatal', message: msg.message })
        continue
      }
      if (msg.severity === 2) {
        errors.push({
          file: rel,
          line: msg.line,
          rule: msg.ruleId,
          message: String(msg.message).split('\n')[0],
        })
      } else if (msg.severity === 1) {
        const fp = fingerprintFromEslintMessage(rel, msg, text)
        warningRecords.push({
          fingerprint: fp,
          file: rel,
          rule: msg.ruleId,
          line: msg.line,
          messageKey: fp.split('::')[2],
          sourceHint: fp.split('::').slice(3).join('::'),
          classification: classifyWarningRule(msg.ruleId),
          message: String(msg.message).split('\n')[0],
        })
      }
    }
  }

  if (cli.writeBaseline) {
    const payload = {
      version: '1.0.0',
      updated: '2026-09-03',
      sourceCommit: 'a522d748189951bf03202309f0b54e926ce124c9',
      description:
        'Approved legacy ESLint warnings from clean a522d74. New fingerprints FAIL the release gate. Removing a warning is allowed; do not keep dead entries.',
      notes: {
        'no-img-element':
          'USER PHOTO surfaces must not be mechanically converted to next/image. That violates PHOTO-001 (no crop; preserve original aspect).',
        'exhaustive-deps:acceptedDescription':
          'CapturePhotoPreview caption effect is keyed on photo?.id only. Adding photo?.acceptedDescription would clobber in-progress typing.',
      },
      photo001NoImgSurfaces: PHOTO_001_NO_IMG_SURFACES,
      warnings: warningRecords.map((w) => ({
        file: w.file,
        rule: w.rule,
        messageKey: w.messageKey,
        sourceHint: w.sourceHint,
        classification: w.classification,
      })),
    }
    writeFileSync(join(repoRoot, cli.warnings), `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`Wrote ${payload.warnings.length} warning fingerprints to ${cli.warnings}`)
    process.exit(errors.length ? 1 : 0)
  }

  const baseline = loadJson(cli.warnings)
  const baselineFingerprints = (baseline.warnings || []).map(fingerprintFromBaselineRecord)
  const currentFingerprints = warningRecords.map((w) => w.fingerprint)
  const diff = diffWarningBaselines(currentFingerprints, baselineFingerprints)

  const photo001New = diff.newWarnings.filter((fp) => {
    const file = fp.split('::')[0]
    const rule = fp.split('::')[1]
    return rule === '@next/next/no-img-element' && isPhoto001NoImgSurface(file)
  })

  const dormantRegistry = loadJson(cli.dormantDefects)
  const behaviourRegistry = loadJson(cli.behaviours)
  const classified = classifyDormantEslintErrors(errors, {
    defects: dormantRegistry.defects || [],
    behaviours: behaviourRegistry.behaviours || [],
  })
  const liveErrors = classified.liveErrors
  const dormantKnownDefects = classified.dormantKnownDefects

  console.log(`ESLint errors: ${liveErrors.length}`)
  console.log(`Approved baseline warnings: ${diff.approved.length}`)
  console.log(`New warnings: ${diff.newWarnings.length}`)
  console.log(
    `Known dormant defects (${DORMANT_BEHAVIOUR_ID}): ${dormantKnownDefects.length}`,
  )
  if (diff.removed.length) {
    console.log(`Removed (stale baseline entries, allowed): ${diff.removed.length}`)
  }
  if (dormantKnownDefects.length) {
    console.log(
      `Dormant defects are known-broken unreachable code protected by ${DORMANT_BEHAVIOUR_ID}; they are NOT approved/clean.`,
    )
    for (const e of dormantKnownDefects) {
      console.log(
        `  ${e.file}:${e.line} ${e.rule} (${e.dormantId} — known dormant defect; resolve before AreaPhotoViewer activation)`,
      )
    }
  }

  let failed = false
  if (liveErrors.length) {
    failed = true
    console.error('Unapproved ESLint errors:')
    for (const e of liveErrors) {
      console.error(`  ${e.file}:${e.line} ${e.rule} ${e.message}`)
    }
  }
  if (diff.newWarnings.length) {
    failed = true
    console.error('New ESLint warnings (not in approved baseline):')
    for (const fp of diff.newWarnings) {
      const rec = warningRecords.find((w) => w.fingerprint === fp)
      console.error(`  ${rec?.file}:${rec?.line} ${rec?.rule} ${rec?.message || fp}`)
      if (photo001New.includes(fp)) {
        console.error('  PHOTO-001: do not convert user photos to next/image to silence no-img-element.')
      }
    }
  }

  if (failed) {
    console.error('check-eslint-gate: FAIL')
    process.exit(1)
  }

  console.log(
    `check-eslint-gate: PASS — blocking live errors 0, approved warnings ${diff.approved.length}, new warnings 0, known dormant defects ${dormantKnownDefects.length}`,
  )
}

main()
