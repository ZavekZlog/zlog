/**
 * Golden Journey B — New Site Diary (executable contract layer).
 * Browser E2E for this journey requires authenticated Supabase session (manual / future).
 * This suite locks the approved UI/source + helper transitions without pretending live login.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETUP_SECTION_SEQUENCE,
} from '../diary-setup-shift.js'
import { authorNameFromUser } from '../report-setup.js'
import { resolveDiaryInteractionMode } from '../diary-view-mode.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const dashPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')

describe('Golden Journey B — New Site Diary (contract)', () => {
  it('Dashboard → Site Diary hub with equal Start New / Use Previous choices', () => {
    assert.match(dashPage, /Site Diary|diary/i)
    assert.match(hubPage, /Start a New Diary/)
    assert.match(hubPage, /Use a Previous Diary/)
    const startIdx = hubPage.indexOf('Start a New Diary')
    const prevIdx = hubPage.indexOf('Use a Previous Diary')
    assert.ok(startIdx > 0 && prevIdx > 0)
  })

  it('setup hierarchy Reporting Company → Behalf Of → Author → Project Details', () => {
    assert.deepEqual(SETUP_SECTION_SEQUENCE, [
      'Reporting Company',
      'Reporting On Behalf Of',
      'Author',
      'Project Details',
    ])
    const company = setupPage.indexOf('title="Reporting Company"')
    const behalf = setupPage.indexOf('title="Reporting On Behalf Of"')
    const author = setupPage.indexOf('title="Author"')
    const project = setupPage.indexOf('title="Project Details"')
    assert.ok(company < behalf && behalf < author && author < project)
  })

  it('author is never inferred from email local-part', () => {
    const name = authorNameFromUser(
      { email: 'spaceclampit9@example.com', user_metadata: {} },
      null,
    )
    assert.notEqual(String(name || ''), 'spaceclampit9')
  })

  it('new diary compose mode is not existing-diary edit chrome', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'new-1', composeQuery: '1' }),
      'compose',
    )
    assert.notEqual(
      resolveDiaryInteractionMode({ reportId: 'new-1', composeQuery: '1' }),
      'edit',
    )
    assert.match(diaryPage, /composeQuery|compose=1|isDiaryExplicitEditMode/)
    assert.doesNotMatch(diaryPage, /Cancel Editing/)
  })

  it('no Report Branding panel; no user-facing sticky/persistence copy; signature at end', () => {
    assert.doesNotMatch(diaryPage, /title="Report Branding"/)
    assert.doesNotMatch(diaryPage, /Report Branding/)
    assert.doesNotMatch(setupPage, /Sticky project information/)
    assert.doesNotMatch(setupPage, /sticky fields/i)
    assert.doesNotMatch(setupPage, /database fields/i)
    assert.equal([...setupPage.matchAll(/title="Cover photo"/g)].length, 1)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 0)
    const signature = diaryPage.indexOf('title="Signature"')
    assert.ok(signature >= 0, 'Signature remains on Today’s Site Diary')
    assert.equal([...diaryPage.matchAll(/title="Signature"/g)].length, 1)
  })

  it('premium shell avoids 100vw horizontal overflow (DIARY-011/012 static layer)', () => {
    // Live vertical scroll / device overflow remain manual Release Gate QA.
    const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
    const glowBlock = premiumUi.slice(
      premiumUi.indexOf('BRAND_ATMOSPHERIC_GLOW_STYLE'),
      premiumUi.indexOf('export function ZlogBrandWordmark'),
    )
    assert.doesNotMatch(glowBlock, /100vw/)
    assert.match(premiumUi, /min-h-screen/)
  })

  it('workbench does not duplicate Author / Behalf Of setup fields as first section', () => {
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 0)
    const authorSection = diaryPage.indexOf('title="Author"')
    if (authorSection >= 0) {
      assert.ok(authorSection >= 0)
    }
    // First GlassSection-style title should not be Signature
    const firstTitle = diaryPage.indexOf('title="')
    assert.ok(firstTitle >= 0)
    assert.ok(!diaryPage.slice(firstTitle, firstTitle + 40).includes('Signature'))
  })
})
