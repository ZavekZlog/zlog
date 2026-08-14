import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gotoVisual, screenshotOptions } from './visual-helpers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const registry = JSON.parse(
  readFileSync(join(root, 'e2e/visual/VISUAL_BASELINE_REGISTRY.json'), 'utf8'),
)

const approved = (registry.screens || []).filter((s) => s.status === 'approved')

test.describe('Visual regression — approved locked screens', () => {
  for (const screen of approved) {
    test(`${screen.id} matches approved baseline`, async ({ page }, testInfo) => {
      const project = testInfo.project.name
      test.skip(
        !screen.viewports.includes(project),
        `${screen.id} not required on viewport ${project}`,
      )

      await gotoVisual(page, screen.route)

      if (screen.id === 'landing') {
        await expect(page.getByText('Start 7-Day Free Trial')).toBeVisible()
      }
      if (screen.id === 'login') {
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      }

      await expect(page).toHaveScreenshot(`${screen.id}.png`, {
        ...screenshotOptions,
        fullPage: true,
      })
    })
  }
})
