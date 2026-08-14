import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const registry = JSON.parse(
  readFileSync(join(root, 'e2e/visual/VISUAL_BASELINE_REGISTRY.json'), 'utf8'),
)

const mobile = registry.viewports.mobile
const desktop = registry.viewports.desktop

/**
 * Visual regression only — genuine screenshot baselines.
 * Never pass --update-snapshots from npm run test:visual.
 * Use npm run test:visual:update after explicit approval flags.
 */
export default defineConfig({
  testDir: './e2e/visual',
  testMatch: /.*\.visual\.spec\.mjs/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  // Platform-stable paths under e2e/visual/__baselines__
  snapshotPathTemplate:
    '{testDir}/__baselines__/{projectName}/{arg}{ext}',
  use: {
    baseURL: process.env.ZLOG_E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'off',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    locale: 'en-GB',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: mobile.width, height: mobile.height },
        deviceScaleFactor: mobile.deviceScaleFactor || 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: desktop.width, height: desktop.height },
        deviceScaleFactor: desktop.deviceScaleFactor || 1,
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
