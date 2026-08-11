import { defineConfig, devices } from '@playwright/test'

/**
 * Minimal Playwright config for Zlog golden journeys.
 * UI-only auth coverage — no Supabase test users / secrets.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.ZLOG_E2E_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
