import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
const landing = readFileSync(join(root, 'app/page.tsx'), 'utf8')

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
    assert.match(headerToken, /overflowX:\s*'hidden'/)
    assert.match(headerToken, /overflowY:\s*'visible'/)
    assert.match(headerToken, /background:\s*'transparent'/)
    assert.match(premiumUi, /zlog-internal-header[\s\S]*AUTHENTICATED_SHELL_HEADER_STYLE/)
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

  it('landing page keeps its own branding and does not use authenticated-shell tokens', () => {
    assert.doesNotMatch(landing, /AUTHENTICATED_SHELL_HEADER_STYLE/)
    assert.doesNotMatch(landing, /AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE/)
    assert.doesNotMatch(landing, /BRAND_ATMOSPHERIC_GLOW_STYLE/)
    assert.doesNotMatch(landing, /ZlogBrandRegion/)
    assert.doesNotMatch(landing, /ZlogSignOutControl/)
    assert.match(landing, /ZlogTextWordmarkLetters/)
  })
})
