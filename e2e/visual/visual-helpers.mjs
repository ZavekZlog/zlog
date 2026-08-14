/**
 * Shared helpers for genuine Playwright visual regression.
 * Deterministic: fixed DPR, reduced motion, fonts ready, no caret blink.
 */

/** @param {import('@playwright/test').Page} page */
export async function prepareVisualPage(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition: none !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  })
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 */
export async function gotoVisual(page, path) {
  await prepareVisualPage(page)
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  // Settle any late client layout without depending on wall-clock flakiness more than needed
  await page.waitForTimeout(150)
}

/** Stable screenshot options shared by all visual specs. */
export const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  // Antialiasing tolerance — layout moves still fail
  maxDiffPixelRatio: 0.01,
}
