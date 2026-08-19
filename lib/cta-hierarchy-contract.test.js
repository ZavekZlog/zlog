/**
 * CTA hierarchy contract — orange PrimaryCTA only for genuine progression;
 * equal choices use equal neutral styling (§7 DESIGN.md).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const design = readFileSync(join(root, 'DESIGN.md'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const locationWalk = readFileSync(join(root, 'components/ai-annotation/AiLocationWalk.jsx'), 'utf8')
const simpleReport = readFileSync(join(root, 'components/reports/SimpleBrandedReportPage.jsx'), 'utf8')
const snagsPage = readFileSync(join(root, 'app/dashboard/project/[id]/snags/page.jsx'), 'utf8')
const diaryComplete = readFileSync(join(root, 'app/dashboard/project/[id]/diary/complete/page.jsx'), 'utf8')

describe('DESIGN.md — CTA hierarchy rule', () => {
  it('documents equal-choice and single-progression orange rules', () => {
    assert.match(design, /CTA hierarchy — permanent UI contract/)
    assert.match(design, /TWO OR MORE equal choices/)
    assert.match(design, /ONE clear intended next step/)
    assert.match(design, /Edit This Diary/)
    assert.match(design, /Use as Basis for New Diary/)
    assert.match(design, /EqualChoiceButton/)
    assert.match(design, /Do not introduce multiple competing orange CTAs/)
    assert.match(design, /principal action that moves my\s+current task forward/)
  })

  it('agents section points at CTA hierarchy', () => {
    assert.match(design, /Follow §7 CTA hierarchy/)
  })
})

describe('EqualChoiceButton — design-system treatment', () => {
  it('exports EqualChoiceButton as a reusable strong-neutral control', () => {
    const ui = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
    assert.match(ui, /export function EqualChoiceButton/)
    assert.match(ui, /export function equalChoiceButtonStyle/)
    assert.match(ui, /export function workbenchPrimaryButtonStyle/)
    assert.match(ui, /zlog-equal-choice-btn/)
    const styleStart = ui.indexOf('export function equalChoiceButtonStyle')
    const styleEnd = ui.indexOf('export function EqualChoiceButton')
    const styleBlock = ui.slice(styleStart, styleEnd)
    assert.match(styleBlock, /var\(--text\)/)
    assert.match(styleBlock, /var\(--plate\)/)
    assert.doesNotMatch(styleBlock, /PowderCtaOverlays|primaryButtonStyle/)
  })
})

describe('Site Diary — equal choice groups', () => {
  it('View-mode Edit / Use as Basis are equal EqualChoiceButtons (no orange peer)', () => {
    const start = diaryPage.indexOf('isDiaryViewMode ? (')
    const end = diaryPage.indexOf('isDiaryExplicitEditMode ? (')
    assert.ok(start >= 0 && end > start, 'view-mode peer action block not found')
    const block = diaryPage.slice(start, end)
    assert.match(block, /Edit This Diary/)
    assert.match(block, /Use as Basis for New Diary/)
    assert.doesNotMatch(block, /PrimaryCTA/)
    assert.equal((block.match(/<EqualChoiceButton\b/g) || []).length, 2)
  })

  it('Location Walk after-save offers Add Another only (scroll continues the diary)', () => {
    const start = locationWalk.indexOf("phase === 'after_save'")
    const end = locationWalk.indexOf("phase === 'review'")
    assert.ok(start >= 0 && end > start, 'after_save block not found')
    const block = locationWalk.slice(start, end)
    assert.match(block, /copy\.addAnother/)
    assert.doesNotMatch(block, /copy\.continueReport/)
    assert.doesNotMatch(block, /continueToSignature/)
    assert.doesNotMatch(block, /PrimaryCTA/)
    assert.equal((block.match(/<EqualChoiceButton\b/g) || []).length, 1)
  })

  it('Location Walk review with areas offers Add Another only (empty create stays primary)', () => {
    const start = locationWalk.indexOf("phase === 'review'")
    const end = locationWalk.indexOf("phase === 'handed_off'")
    assert.ok(start >= 0 && end > start, 'review block not found')
    const block = locationWalk.slice(start, end)
    // Only the empty-state create path may be PrimaryCTA in this phase.
    assert.equal((block.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(block, /locationWalk\.length === 0/)
    assert.match(block, /copy\.createGroup/)
    const dualStart = block.indexOf(') : (')
    assert.ok(dualStart >= 0, 'add-another branch not found')
    const dual = block.slice(dualStart)
    assert.doesNotMatch(dual, /PrimaryCTA/)
    assert.equal((dual.match(/<EqualChoiceButton\b/g) || []).length, 1)
    assert.match(dual, /copy\.addAnother/)
    assert.doesNotMatch(dual, /copy\.continueReport/)
    assert.doesNotMatch(dual, /continueToSignature/)
  })

  it('Save Area remains the Location Walk create progression PrimaryCTA with workbench surface', () => {
    const start = locationWalk.indexOf('{copy.saveGroup}')
    assert.ok(start > 0)
    const window = locationWalk.slice(Math.max(0, start - 320), start + 40)
    assert.match(window, /<PrimaryCTA\b/)
    assert.match(window, /surface="workbench"/)
    assert.match(window, /saveArea/)
  })

  it('Location Walk empty-state create uses workbench primary, not landing powder-coat', () => {
    const start = locationWalk.indexOf('{copy.createGroup}')
    assert.ok(start > 0)
    const window = locationWalk.slice(Math.max(0, start - 280), start + 40)
    assert.match(window, /<PrimaryCTA[\s\S]*surface="workbench"/)
  })
})

describe('Other report modules — single progression save CTA', () => {
  it('Survey / Progress / H&S shared form exposes one PrimaryCTA save', () => {
    assert.equal((simpleReport.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(simpleReport, /Save changes|Save report/)
    assert.ok(existsSync(join(root, 'app/dashboard/project/[id]/site-survey/page.jsx')))
    assert.ok(existsSync(join(root, 'app/dashboard/project/[id]/weekly-report/page.jsx')))
    assert.ok(existsSync(join(root, 'app/dashboard/project/[id]/weekly-hs/page.jsx')))
  })

  it('Snag List form save is a single PrimaryCTA; Cancel/+ Add stay secondary', () => {
    assert.equal((snagsPage.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(snagsPage, /Save snag|Save duplicate snag/)
    const trailing = snagsPage.slice(snagsPage.indexOf('trailing={'), snagsPage.indexOf('{error &&'))
    assert.match(trailing, /SecondaryButton/)
    assert.doesNotMatch(trailing, /PrimaryCTA/)
  })

  it('Diary Report Complete: Save PDF primary, Share Report is a heading with equal icon tiles', () => {
    const panel = readFileSync(
      join(root, 'components/reports/ReportCompleteSharePanel.jsx'),
      'utf8',
    )
    assert.match(diaryComplete, /ReportCompleteSharePanel/)
    assert.equal((panel.match(/<PrimaryCTA\b/g) || []).length, 1)
    assert.match(panel, /Save your report/)
    assert.match(panel, /Share report/)
    assert.match(panel, /Email/)
    assert.match(panel, /WhatsApp/)
    assert.match(panel, /'More'/)
    assert.match(panel, /Return to Dashboard/)
    assert.doesNotMatch(panel, /EqualChoiceButton/)
    assert.match(panel, /id="zlog-share-report-heading"/)
  })
})
