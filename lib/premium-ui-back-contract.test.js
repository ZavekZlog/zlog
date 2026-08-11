/**
 * Shared Zlog Back / secondary utility control contract.
 * One authoritative .zlog-secondary-cta fixed plate — no hidden-label width hacks.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
const globalsCss = readFileSync(join(root, 'app/globals.css'), 'utf8')
const topBar = readFileSync(join(root, 'components/dashboard/DashboardTopBar.jsx'), 'utf8')

const screensUsingPremiumShellBack = [
  'app/dashboard/diary/page.jsx',
  'app/dashboard/diary/setup/page.jsx',
  'app/dashboard/project/[id]/diary/page.jsx',
  'app/dashboard/project/[id]/snags/page.jsx',
  'app/dashboard/project/[id]/page.jsx',
  'app/dashboard/new-project/page.jsx',
  'app/dashboard/project/[id]/diary/complete/page.jsx',
  'app/dashboard/settings/branding/page.jsx',
  'components/reports/SimpleBrandedReportPage.jsx',
]

describe('Zlog Back control — shared secondary CTA', () => {
  it('exports one canonical ZlogBackControl on the shared secondary family', () => {
    assert.match(premiumUi, /export function ZlogBackControl/)
    assert.match(premiumUi, /zlog-secondary-cta zlog-back-cta/)
    assert.match(premiumUi, /ArrowLeft/)
    assert.match(premiumUi, /size=\{15\}/)
    assert.match(premiumUi, /strokeWidth=\{2\.5\}/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{/)
    assert.match(globalsCss, /\.zlog-back-cta\s*\{/)
    assert.match(globalsCss, /\.zlog-secondary-cta__icon/)
    const backFn = premiumUi.slice(
      premiumUi.indexOf('export function ZlogBackControl'),
      premiumUi.indexOf('export function PremiumBackButton'),
    )
    assert.doesNotMatch(backFn, /zlog-dashboard-signout/)
    assert.doesNotMatch(backFn, /zlog-back-cta__size-ref/)
    assert.doesNotMatch(backFn, /aria-hidden[\s\S]*Sign out/)
  })

  it('uses one fixed shared plate token — no hidden-label or content-width hacks', () => {
    assert.match(topBar, /zlog-secondary-cta zlog-dashboard-signout/)
    assert.match(topBar, /zlog-secondary-cta__icon/)
    assert.match(topBar, /size=\{18\}/)
    assert.match(globalsCss, /\.zlog-dashboard-signout\s*\{[\s\S]*?position:\s*absolute/)
    assert.match(globalsCss, /--zlog-utility-cta-width:\s*115px/)
    assert.match(globalsCss, /--zlog-utility-cta-height:\s*48px/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?width:\s*var\(--zlog-utility-cta-width\)/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?height:\s*var\(--zlog-utility-cta-height\)/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?justify-content:\s*center/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?padding:\s*0 16px/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?border-radius:\s*10px/)
    assert.match(globalsCss, /\.zlog-secondary-cta\s*\{[\s\S]*?font-weight:\s*700/)
    assert.doesNotMatch(globalsCss, /zlog-back-cta__size-ref/)
    assert.doesNotMatch(premiumUi, /zlog-back-cta__size-ref/)
    // Sign out position-only (no divergent size)
    const signOutBlock = globalsCss.slice(
      globalsCss.indexOf('.zlog-dashboard-signout {'),
      globalsCss.indexOf('.zlog-back-cta {'),
    )
    assert.doesNotMatch(signOutBlock, /height:|padding:|border-radius:|width:|min-width:/)
    // Back: compact visible plate + 44px hit; not content-width / not Sign-out-sized
    const backBlock = globalsCss.slice(
      globalsCss.indexOf('.zlog-back-cta {'),
      globalsCss.indexOf('.zlog-back-cta::before'),
    )
    assert.match(backBlock, /--zlog-back-plate-height:\s*35px/)
    assert.match(backBlock, /--zlog-back-plate-width:\s*74px/)
    assert.match(backBlock, /height:\s*44px/)
    assert.match(globalsCss, /\.zlog-back-cta::before/)
    assert.doesNotMatch(backBlock, /width:\s*auto/)
  })

  it('legacy Back entry points are aliases / wrappers of ZlogBackControl', () => {
    assert.match(premiumUi, /export function PremiumBackButton[\s\S]*?ZlogBackControl/)
    assert.match(premiumUi, /export function ZlogModuleBackControl[\s\S]*?ZlogBackControl/)
    assert.match(premiumUi, /ReportModuleNav[\s\S]*?<ZlogBackControl/)
    assert.match(premiumUi, /ZlogModulePageHeader[\s\S]*?ZlogModuleBackControl|ZlogBackControl/)
  })

  it('does not keep one-off ReportModuleNav / module-back inline back styles', () => {
    assert.doesNotMatch(premiumUi, /zlog-report-nav-back/)
    assert.doesNotMatch(premiumUi, /zlog-module-back-btn/)
    assert.doesNotMatch(premiumUi, /moduleBackControlStyle/)
  })

  it('module screens still wire Back via PremiumShell / module header (destinations preserved)', () => {
    for (const rel of screensUsingPremiumShellBack) {
      const src = readFileSync(join(root, rel), 'utf8')
      assert.match(
        src,
        /backHref=|onBack=|ZlogBackControl|ZlogModulePageHeader|PremiumShell/,
        `${rel} must retain Back navigation wiring`,
      )
    }
  })

  it('setup footer Back uses shared ZlogBackControl (not a one-off SecondaryButton)', () => {
    const setup = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
    assert.match(setup, /ZlogBackControl/)
    assert.match(setup, /onClick=\{handleBack\}/)
  })
})
