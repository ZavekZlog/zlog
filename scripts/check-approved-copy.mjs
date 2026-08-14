#!/usr/bin/env node
/**
 * Approved UI copy — source-string presence contract.
 * NOT a visual regression test.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot, loadJson } from './lib/scope-files.mjs'

function main() {
  const copy = loadJson('docs/contracts/APPROVED_UI_COPY.json')
  let failed = false

  for (const term of copy.terms || []) {
    if (!term.id || !term.label || !Array.isArray(term.files) || term.files.length === 0) {
      console.error(`Invalid copy term: ${JSON.stringify(term)}`)
      failed = true
      continue
    }
    for (const rel of term.files) {
      const abs = join(repoRoot, rel)
      if (!existsSync(abs)) {
        console.error(`${term.id}: missing file ${rel}`)
        failed = true
        continue
      }
      const src = readFileSync(abs, 'utf8')
      if (!src.includes(term.label)) {
        console.error(`${term.id}: label "${term.label}" not found in ${rel}`)
        failed = true
      }
    }
  }

  if (failed) {
    console.error('check-approved-copy: FAIL (source terminology contract)')
    process.exit(1)
  }
  console.log(
    `check-approved-copy: PASS (${(copy.terms || []).length} terms) — source-string contract only, NOT visual`,
  )
}

main()
