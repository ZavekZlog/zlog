import { test, expect } from '@playwright/test'

/**
 * Golden Journey A — Authentication (UI-only).
 *
 * Protects form semantics that enable browser credential management.
 * Does NOT call real Supabase successfully.
 * Full Login→Dashboard→Sign out→Login with a live session = MANUAL QA / future authenticated E2E.
 */
test.describe('Golden Journey A — Auth UI (no Supabase credentials)', () => {
  test('login form uses password-manager-compatible semantics', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    const form = page.locator('form')
    await expect(form).toHaveAttribute('method', 'post')

    const email = page.locator('input[name="email"]')
    const password = page.locator('input[name="password"]')
    await expect(email).toHaveAttribute('type', 'email')
    await expect(email).toHaveAttribute('autocomplete', 'username')
    await expect(password).toHaveAttribute('autocomplete', 'current-password')
    await expect(password).toHaveAttribute('type', 'password')

    const signIn = page.getByRole('button', { name: 'Sign In' })
    await expect(signIn).toHaveAttribute('type', 'submit')
  })

  test('AUTH-001: filling fields alone does not leave login / does not reach dashboard', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').fill('ui-only@example.com')
    await page.locator('input[name="password"]').fill('not-a-real-password')
    // No click / no Enter — wait for any accidental auto-submit
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/login/)
    await expect(page).not.toHaveURL(/\/dashboard/)
  })

  test('AUTH-001: explicit Sign In submit is required (still no real session without credentials)', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').fill('ui-only@example.com')
    await page.locator('input[name="password"]').fill('not-a-real-password')
    await page.getByRole('button', { name: 'Sign In' }).click()
    // Without valid Supabase credentials we must NOT land on the dashboard.
    await page.waitForTimeout(2000)
    await expect(page).not.toHaveURL(/\/dashboard/)
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-001: Enter in password field is an intentional submit path (no dashboard without credentials)', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').fill('ui-only@example.com')
    await page.locator('input[name="password"]').fill('not-a-real-password')
    await page.locator('input[name="password"]').press('Enter')
    await page.waitForTimeout(2000)
    await expect(page).not.toHaveURL(/\/dashboard/)
  })
})
