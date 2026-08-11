#!/usr/bin/env node
/** Ensure APPROVED_BEHAVIOUR_REGISTRY.json points at real test files. */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = join(root, 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json')
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))

let failed = false
for (const b of registry.behaviours || []) {
  if (!b.id || !b.description || !b.area) {
    console.error(`Registry entry missing id/description/area: ${JSON.stringify(b)}`)
    failed = true
  }
  for (const t of b.tests || []) {
    const p = join(root, t)
    if (!existsSync(p)) {
      console.error(`${b.id}: missing test file ${t}`)
      failed = true
    }
  }
  if (b.manualQA === true && !b.manualQANote) {
    console.error(`${b.id}: manualQA true requires manualQANote`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}
console.log(
  `check-behaviour-registry: PASS (${(registry.behaviours || []).length} behaviours)`,
)
