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

  it('does not restore removed marketing or audience copy', () => {
    assert.doesNotMatch(page, /Built for the people who run the site\./)
    assert.doesNotMatch(page, /Professional, company-branded reports\./)
    assert.doesNotMatch(page, /Type it or say it\. Zlog does the rest\./)
    assert.doesNotMatch(page, /reflect your standards/)
    assert.doesNotMatch(page, /Type or use your voice to create reports/)

    const brandEnd = page.indexOf('Logged.')
    const cta = page.indexOf('Start 7-Day Free Trial')
    assert.ok(brandEnd > 0 && cta > brandEnd)
  })

  it('uses compact mobile spacing after the tagline so the first screen stays short', () => {
    assert.match(page, /zlog-landing-slogan/)
    assert.match(page, /@media \(max-width: 480px\)[\s\S]*\.zlog-landing-slogan \{\s*margin:\s*0 0 24px;/)
    assert.doesNotMatch(page, /margin:\s*'0 0 36px'/)
  })

  it('keeps a single orange primary CTA and neutral Log in', () => {
    assert.equal((page.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(page, /Start 7-Day Free Trial/)
    assert.match(page, /href="\/login"/)
    assert.match(page, />\s*Log in\s*</)
    assert.match(page, /LandingMicIcon/)
    assert.match(page, /zlog-landing-trial-cta/)
  })
})
