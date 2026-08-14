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
    assert.match(topBar, /ZlogBrandRegion/)
    assert.match(topBar, /zlog-header-utility-row/)
    assert.match(topBar, /zlog-dashboard-signout/)
    assert.match(topBar, /DASHBOARD_CONTENT_GRID/)
    assert.match(topBar, /size=\{16\}/)
    assert.match(topBar, /paddingTop:\s*30/)
    assert.match(topBar, /paddingBottom:\s*8/)
    assert.match(topBar, /background:\s*'transparent'/)
    assert.doesNotMatch(topBar, /zlog-secondary-cta/)
    const brandIdx = topBar.indexOf('<ZlogBrandRegion')
    const rowIdx = topBar.indexOf('zlog-header-utility-row')
    const btnIdx = topBar.indexOf('zlog-dashboard-signout')
    assert.ok(brandIdx > 0 && rowIdx > brandIdx, 'utility row must follow ZlogBrandRegion')
    assert.ok(btnIdx > rowIdx, 'Sign out must sit in the utility row below Zlog')
    assert.match(topBar, /maxWidth:\s*DASHBOARD_CONTENT_GRID\.maxWidth/)
    assert.match(topBar, /padding:\s*`0 \$\{DASHBOARD_CONTENT_GRID\.padX\}px`/)
    // Established glow tokens unchanged
    assert.match(premiumUi, /opacity:\s*0\.42/)
    assert.match(premiumUi, /filter:\s*'blur\(45px\)'/)
    assert.match(globalsCss, /\.zlog-dashboard-signout\s*\{[\s\S]*?border-width:\s*2px/)
    assert.match(globalsCss, /\.zlog-dashboard-signout\s*\{[\s\S]*?min-height:\s*44px/)
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
    const signOutBlock = globalsCss.slice(
      globalsCss.indexOf('.zlog-dashboard-signout {'),
      globalsCss.indexOf('.zlog-dashboard-signout__icon'),
    )
    assert.doesNotMatch(signOutBlock, /--zlog-utility-cta-width|--zlog-utility-cta-height|--zlog-back-plate/)
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
