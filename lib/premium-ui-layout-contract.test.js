import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')

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
})
