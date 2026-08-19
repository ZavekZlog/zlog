import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
const landing = readFileSync(join(root, 'app/page.tsx'), 'utf8')
const globalsCss = readFileSync(join(root, 'app/globals.css'), 'utf8')
const dashboardPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
const dashboardTopBar = readFileSync(join(root, 'components/dashboard/DashboardTopBar.jsx'), 'utf8')

describe('premium UI horizontal viewport fit', () => {
  it('brand atmospheric glow must not use 100vw (scrollbar-gutter overflow)', () => {
    const glowBlock = premiumUi.slice(
      premiumUi.indexOf('BRAND_ATMOSPHERIC_GLOW_STYLE'),
      premiumUi.indexOf('export function ZlogBrandWordmark'),
    )
    assert.match(glowBlock, /width:\s*'100%'/)
    assert.match(glowBlock, /maxWidth:\s*'100%'/)
    assert.doesNotMatch(glowBlock, /100vw/)
  })

  it('ZlogBrandWordmark glow uses the shared non-vw style contract', () => {
    assert.match(premiumUi, /data-zlog-brand-glow=""/)
    assert.match(premiumUi, /style=\{BRAND_ATMOSPHERIC_GLOW_STYLE\}/)
    assert.doesNotMatch(
      premiumUi,
      /data-zlog-brand-glow=""[\s\S]*?width:\s*'100vw'/,
    )
  })

  it('authenticated shell header lets the established glow paint (no vertical clip)', () => {
    const headerToken = premiumUi.slice(
      premiumUi.indexOf('export const AUTHENTICATED_SHELL_HEADER_STYLE'),
      premiumUi.indexOf('export const BRAND_ATMOSPHERIC_GLOW_STYLE'),
    )
    assert.match(headerToken, /overflowX:\s*'visible'/)
    assert.match(headerToken, /overflowY:\s*'visible'/)
    assert.doesNotMatch(headerToken, /overflowX:\s*'hidden'/)
    assert.match(headerToken, /background:\s*'transparent'/)
    assert.match(premiumUi, /zlog-internal-header[\s\S]*AUTHENTICATED_SHELL_HEADER_STYLE/)
    const headerFn = premiumUi.slice(
      premiumUi.indexOf('export function ZlogInternalHeader'),
      premiumUi.indexOf('export const SubPageHeader'),
    )
    assert.doesNotMatch(headerFn, /zIndex:\s*50/)
  })

  it('sub-page brand region is full-bleed (not clipped to the content column)', () => {
    const layoutFn = premiumUi.slice(
      premiumUi.indexOf('export function SubPageLayout'),
      premiumUi.indexOf('export function PremiumShell'),
    )
    assert.match(layoutFn, /<SubPageHeader/)
    assert.match(layoutFn, /contentMaxWidth=\{contentMaxWidth\}/)
    assert.doesNotMatch(
      layoutFn,
      /maxWidth: contentMaxWidth[\s\S]*<SubPageHeader/,
    )
  })

  it('sticky Back is opt-in and leaves every other report screen untouched', () => {
    const layoutFn = premiumUi.slice(
      premiumUi.indexOf('export function SubPageLayout'),
      premiumUi.indexOf('export function PremiumShell'),
    )
    // Default off: a screen that does not ask for it renders no sticky dock.
    assert.match(layoutFn, /stickyBack = false/)
    assert.match(
      layoutFn,
      /showStickyBack = stickyBack && !hideModuleNav && Boolean\(backHref \|\| onBack\)/,
    )
    assert.match(layoutFn, /showStickyBack \?[\s\S]*zlog-sticky-back-dock/)
    assert.match(layoutFn, /zlog-sticky-back-dock[\s\S]*<ZlogBackControl/)

    // Back moves into the dock, so the nav row must not render a second one.
    const headerFn = premiumUi.slice(
      premiumUi.indexOf('export function ZlogInternalHeader'),
      premiumUi.indexOf('export const SubPageHeader'),
    )
    assert.match(headerFn, /navBackHref = stickyBack \? undefined : backHref/)
    assert.match(headerFn, /navOnBack = stickyBack \? undefined : onBack/)
    assert.match(headerFn, /backHref=\{navBackHref\}/)
    assert.match(headerFn, /onBack=\{navOnBack\}/)
  })

  it('sticky Back dock owns its inset so no live strip opens above it', () => {
    const dockRule = premiumUi.slice(
      premiumUi.indexOf('.zlog-sticky-back-dock {'),
      premiumUi.indexOf('.dashboard-premium-bg {'),
    )
    assert.match(dockRule, /position: sticky/)
    // Any inset above the dock is a live strip that scrolling content shows through.
    assert.match(dockRule, /top: 0;/)
    assert.doesNotMatch(dockRule, /top: [1-9]/)
    assert.match(dockRule, /padding: 12px 0 8px/)
    assert.match(dockRule, /margin: -12px 0 12px/)
    assert.match(dockRule, /background: #0b0d12/)
    assert.match(dockRule, /\.zlog-workbench-shell \.zlog-sticky-back-dock/)
    assert.match(dockRule, /\.zlog-workbench-shell \.premium-shell-header/)
    assert.match(dockRule, /border-bottom: none !important/)
    assert.match(dockRule, /margin: -8px 0 6px/)
    assert.match(dockRule, /padding: 6px 0 4px/)
    assert.doesNotMatch(dockRule, /rgba\(|opacity:|color-mix|backdrop-filter/)
    assert.doesNotMatch(dockRule, /position: fixed/)
  })

  it('PremiumShell workbench screens default to compact brand region and nav spacing', () => {
    const layoutFn = premiumUi.slice(
      premiumUi.indexOf('export function SubPageLayout'),
      premiumUi.indexOf('export function PremiumShell'),
    )
    assert.match(layoutFn, /headerMode = 'workbench'/)
    assert.match(layoutFn, /zlog-workbench-shell/)
    assert.match(premiumUi, /WORKBENCH_BRAND_HEADER_SPACE/)
    assert.match(premiumUi, /regionPadTop: 28/)
    assert.match(premiumUi, /regionPadBottom: 12/)
    assert.match(premiumUi, /regionMinHeight: 64/)
    assert.match(premiumUi, /wordmarkOffsetY: -10/)
    assert.match(
      premiumUi,
      /headerMode === 'workbench'[\s\S]*WORKBENCH_BRAND_HEADER_SPACE[\s\S]*BRAND_HEADER_SPACE/,
    )
  })

  it('landing page keeps its own branding and does not use authenticated-shell tokens', () => {
    assert.doesNotMatch(landing, /AUTHENTICATED_SHELL_HEADER_STYLE/)
    assert.doesNotMatch(landing, /AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE/)
    assert.doesNotMatch(landing, /BRAND_ATMOSPHERIC_GLOW_STYLE/)
    assert.doesNotMatch(landing, /ZlogBrandRegion/)
    assert.doesNotMatch(landing, /ZlogSignOutControl/)
    assert.match(landing, /ZlogTextWordmarkLetters/)
  })

  it('Dashboard stays on its own masthead and must not use the compact workbench shell', () => {
    assert.match(dashboardPage, /DashboardTopBar/)
    assert.doesNotMatch(dashboardPage, /PremiumShell/)
    assert.doesNotMatch(dashboardPage, /headerMode\s*=/)
    assert.doesNotMatch(dashboardPage, /zlog-workbench-shell/)
    assert.doesNotMatch(dashboardPage, /WORKBENCH_BRAND_HEADER_SPACE/)
    assert.match(dashboardTopBar, /ZlogBrandRegion/)
    assert.match(dashboardTopBar, /AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE/)
    assert.doesNotMatch(dashboardTopBar, /headerMode\s*=/)
    assert.doesNotMatch(dashboardTopBar, /PremiumShell/)
    assert.doesNotMatch(dashboardTopBar, /WORKBENCH_BRAND_HEADER_SPACE/)
    assert.match(premiumUi, /export function ZlogBrandRegion[\s\S]*headerMode = 'expressive'/)
    const compact = premiumUi.slice(
      premiumUi.indexOf('export const AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE'),
      premiumUi.indexOf('export const AUTHENTICATED_SHELL_HEADER_STYLE'),
    )
    const workbench = premiumUi.slice(
      premiumUi.indexOf('export const WORKBENCH_BRAND_HEADER_SPACE'),
      premiumUi.indexOf('export const AUTHENTICATED_SHELL_BRAND_WORKBENCH_STYLE'),
    )
    assert.match(compact, /paddingTop:\s*30/)
    assert.match(compact, /paddingBottom:\s*8/)
    assert.match(workbench, /regionPadTop:\s*28/)
    assert.match(workbench, /regionPadBottom:\s*12/)
  })

  it('workbench headers cancel the glow hairline; Dashboard keeps its approved header divider', () => {
    assert.match(
      globalsCss,
      /\.zlog-dashboard-topbar\.premium-shell-header\s*\{[\s\S]*?border-bottom:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.08\)\s*!important/,
    )
    assert.match(dashboardTopBar, /borderBottom:\s*'1px solid var\(--edge-highlight\)'/)
    assert.match(
      globalsCss,
      /\.premium-shell-header\.zlog-internal-header\s*\{[\s\S]*?border-bottom:\s*none\s*!important/,
    )
    assert.match(
      premiumUi,
      /\.zlog-workbench-shell \.premium-shell-header[\s\S]*?border-bottom:\s*none !important/,
    )
    // A generic .premium-shell-header { … } 1px rule is the known glow-line regression.
    assert.doesNotMatch(globalsCss, /(?<![.\w-])\.premium-shell-header\s*\{/)
  })
})
