#!/usr/bin/env node
/**
 * Validate registered ESLint exceptions vs inline disable comments.
 */
import { join } from 'node:path'
import {
  collectDisableProblems,
  loadJson,
  repoRoot,
} from './lib/eslint-gate.mjs'

function parseArgs(argv) {
  const out = { files: [], exceptions: 'docs/contracts/APPROVED_ESLINT_EXCEPTIONS.json' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--exceptions') {
      out.exceptions = argv[++i]
    } else if (a === '--scan-files') {
      out.files = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return out
}

function main() {
  const cli = parseArgs(process.argv.slice(2))
  const registry = loadJson(cli.exceptions)
  const absFiles = (cli.files || []).map((f) =>
    f.includes(':') || f.startsWith('/') ? f : join(repoRoot, f),
  )
  const problems = collectDisableProblems({
    exceptions: registry.exceptions,
    protectedRules: registry.protectedRules,
    files: absFiles.length ? absFiles : undefined,
  })

  if (problems.length) {
    console.error('check-eslint-exceptions: FAIL')
    for (const p of problems) {
      console.error(`  [${p.code}] ${p.file}:${p.line} ${p.detail}`)
    }
    process.exit(1)
  }

  console.log(
    `check-eslint-exceptions: PASS (${registry.exceptions.length} registered exceptions)`,
  )
}

main()
