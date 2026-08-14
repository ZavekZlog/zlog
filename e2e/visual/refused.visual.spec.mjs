import { test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const registry = JSON.parse(
  readFileSync(join(root, 'e2e/visual/VISUAL_BASELINE_REGISTRY.json'), 'utf8'),
)

const blocked = (registry.screens || []).filter(
  (s) => s.status === 'known_regression' || s.status === 'pending_manual_confirmation',
)

/**
 * Intentionally does NOT capture screenshots for these screens.
 * Creating baselines here would bless unknown/regressed UI.
 */
test.describe('Visual regression — refused until manual confirmation', () => {
  for (const screen of blocked) {
    test(`${screen.id} — NOT baselined (${screen.status})`, async () => {
      test.info().annotations.push({
        type: 'visual-refuse',
        description: screen.refuseReason || screen.status,
      })
      test.skip(
        true,
        `[${screen.status}] ${screen.title}: ${screen.refuseReason || 'Awaiting manual confirmation of approved visual state.'}`,
      )
    })
  }
})
