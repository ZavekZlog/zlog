/**
 * Landing page — brand / proposition / action copy + CTA hierarchy contract.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'app/page.tsx'), 'utf8')

describe('Landing page — brand / proposition / action zones', () => {
  it('keeps approved brand zone copy and orange Logged treatment', () => {
    assert.match(page, /ZlogTextWordmarkLetters/)
    assert.match(page, /Construction reporting\. Done properly\./)
    assert.match(page, /See it/)
    assert.match(page, /Say it/)
    assert.match(page, /Logged\./)
    assert.match(page, /var\(--rust\)/)
    assert.doesNotMatch(page, /ultimate construction reporting tool/i)
  })

  it('uses the shortened proposition hierarchy (headline > support > voice)', () => {
    assert.match(page, /Built for the people who run the site\./)
    assert.match(page, /Professional, company-branded reports\./)
    assert.match(page, /Type it or say it\. Zlog does the rest\./)
    assert.doesNotMatch(page, /reflect your standards/)
    assert.doesNotMatch(page, /Type or use your voice to create reports/)

    const brandEnd = page.indexOf('Logged.')
    const prop = page.indexOf('Built for the people who run the site.')
    const support = page.indexOf('Professional, company-branded reports.')
    const voice = page.indexOf('Type it or say it. Zlog does the rest.')
    const cta = page.indexOf('Start 7-Day Free Trial')
    assert.ok(brandEnd > 0 && prop > brandEnd && support > prop && voice > support && cta > voice)
  })

  it('separates brand from proposition with a larger gap after the tagline', () => {
    assert.match(page, /margin:\s*'0 0 36px'/)
    assert.doesNotMatch(page, /margin:\s*'0 0 14px'[\s\S]{0,200}Logged\./)
  })

  it('keeps a single orange primary CTA and neutral Log in', () => {
    assert.equal((page.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(page, /Start 7-Day Free Trial/)
    assert.match(page, /href="\/login"/)
    assert.match(page, />\s*Log in\s*</)
    assert.match(page, /LandingMicIcon/)
  })
})
