import { test, expect } from '@playwright/test'

/**
 * Unauthenticated smoke: dashboard routes require a session.
 * Full Golden Journeys B–D in-browser need authenticated E2E (manual / future).
 */
test.describe('Auth wall (honest unauthenticated boundary)', () => {
  test('dashboard redirects to login without a session', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toMatch(/\/login/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('a deep diary route is also guarded and remembers where to return', async ({
    page,
  }) => {
    await page.goto('/dashboard/diary')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('next=')
    expect(page.url()).toContain('%2Fdashboard%2Fdiary')
  })
})
