/**
 * TEXT Zlog wordmark brand lock — Z uses canonical enamel orange
 * (ZLOG_POWDER_CTA_ORANGE / #DB3D06); log = light/white.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
const landing = readFileSync(join(root, 'app/page.tsx'), 'utf8')
const login = readFileSync(join(root, 'app/(auth)/login/page.jsx'), 'utf8')
const signup = readFileSync(join(root, 'app/(auth)/signup/page.jsx'), 'utf8')
const design = readFileSync(join(root, 'DESIGN.md'), 'utf8')

describe('TEXT Zlog wordmark — locked brand treatment', () => {
  it('reuses canonical enamel orange as the sole text-wordmark Z colour', () => {
    assert.match(premiumUi, /export const ZLOG_POWDER_CTA_ORANGE = '#DB3D06'/)
    assert.match(
      premiumUi,
      /export const ZLOG_TEXT_WORDMARK_Z_COLOR = ZLOG_POWDER_CTA_ORANGE/,
    )
    assert.doesNotMatch(
      premiumUi,
      /export const ZLOG_TEXT_WORDMARK_Z_COLOR = 'var\(--rust\)'/,
    )
    assert.doesNotMatch(
      premiumUi,
      /export const ZLOG_TEXT_WORDMARK_Z_COLOR = '#B8431C'/,
    )
    assert.match(premiumUi, /export function ZlogTextWordmarkLetters/)
    const lettersFn = premiumUi.slice(
      premiumUi.indexOf('export function ZlogTextWordmarkLetters'),
      premiumUi.indexOf('export function ZlogWordmark'),
    )
    assert.match(lettersFn, /ZLOG_TEXT_WORDMARK_Z_COLOR/)
    assert.doesNotMatch(lettersFn, /#F5A623|#FF5000|#ff5500|#B8431C|var\(--rust\)/)
  })

  it('shared wordmark components use ZlogTextWordmarkLetters (not a solid white Zlog)', () => {
    assert.match(premiumUi, /export function ZlogWordmark[\s\S]*?<ZlogTextWordmarkLetters/)
    assert.match(premiumUi, /export function ZlogBrandWordmark[\s\S]*?<ZlogTextWordmarkLetters/)
    const brandH1 = premiumUi.slice(
      premiumUi.indexOf('export function ZlogBrandWordmark'),
      premiumUi.indexOf('export function ZlogBrandRegion'),
    )
    assert.doesNotMatch(brandH1, /#F5A623/)
    assert.doesNotMatch(brandH1, />Zlog</)
  })

  it('landing / auth / dashboard mastheads use the shared text wordmark treatment', () => {
    assert.match(landing, /ZlogTextWordmarkLetters/)
    assert.doesNotMatch(landing, />\s*Zlog\s*</)
    assert.doesNotMatch(landing, /#F5A623/)
    assert.match(login, /ZlogBrandWordmark/)
    assert.match(signup, /ZlogBrandWordmark/)
    assert.match(premiumUi, /ZlogBrandRegion[\s\S]*<ZlogBrandWordmark[\s\S]*?size="md"/)
  })

  it('DESIGN.md locks enamel orange for the text-wordmark Z (not legacy --rust)', () => {
    const wordmarkLockStart = design.indexOf('TEXT ZLOG WORDMARK — locked')
    const wordmarkLockEnd = design.indexOf('Warm over cool — approved')
    assert.ok(wordmarkLockStart >= 0 && wordmarkLockEnd > wordmarkLockStart)
    const wordmarkLock = design.slice(wordmarkLockStart, wordmarkLockEnd)
    assert.match(wordmarkLock, /ZLOG_POWDER_CTA_ORANGE/)
    assert.match(wordmarkLock, /#DB3D06/)
    assert.match(wordmarkLock, /ZlogTextWordmarkLetters/)
    assert.match(wordmarkLock, /ZLOG_TEXT_WORDMARK_Z_COLOR/)
    assert.doesNotMatch(wordmarkLock, /“Z” = var\(--rust\)/)
    assert.doesNotMatch(wordmarkLock, /--rust resolves to #B8431C/)
    assert.match(
      design,
      /Approved behavioural\/design changes must update every owning contract\/test\s+in the same checkpoint/,
    )
  })
})
