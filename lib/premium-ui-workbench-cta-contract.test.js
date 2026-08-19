/**
 * Workbench PrimaryCTA surface — anti-regression against landing powder-coat on report screens.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const locationWalk = readFileSync(join(root, 'components/ai-annotation/AiLocationWalk.jsx'), 'utf8')
const savedDiaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')
const loginPage = readFileSync(join(root, 'app/(auth)/login/page.jsx'), 'utf8')

describe('PrimaryCTA surface=workbench — shared variant', () => {
  it('exports workbenchPrimaryButtonStyle and a workbench surface on PrimaryCTA', () => {
    assert.match(premiumUi, /export function workbenchPrimaryButtonStyle/)
    assert.match(premiumUi, /surface = 'brand'/)
    assert.match(premiumUi, /data-zlog-cta-surface=\{surface\}/)
    assert.match(premiumUi, /zlog-workbench-primary-cta/)
  })

  it('workbench surface reuses equal-choice plate + rust perimeter, not powder tokens', () => {
    const styleStart = premiumUi.indexOf('export function workbenchPrimaryButtonStyle')
    const styleEnd = premiumUi.indexOf('export function PrimaryCTA')
    const styleBlock = premiumUi.slice(styleStart, styleEnd)
    assert.match(styleBlock, /equalChoiceButtonStyle/)
    assert.match(styleBlock, /var\(--rust\)/)
    assert.doesNotMatch(styleBlock, /POWDER_CTA_|PowderCtaOverlays/)

    const renderStart = premiumUi.indexOf('const isWorkbench = surface === \'workbench\'')
    const renderEnd = premiumUi.indexOf('export function secondaryButtonStyle')
    const renderBlock = premiumUi.slice(renderStart, renderEnd)
    assert.match(renderBlock, /isWorkbench \? null : <PowderCtaOverlays \/>/)
    assert.match(renderBlock, /zlog-equal-choice-btn/)
    assert.doesNotMatch(renderBlock, /POWDER_CTA_BACKGROUND/)
  })

  it('default brand surface remains landing powder-coat for auth/dashboard CTAs', () => {
    assert.match(loginPage, /<PrimaryCTA type="submit"/)
    assert.doesNotMatch(loginPage, /surface="workbench"/)
    const brandStart = premiumUi.indexOf('const isWorkbench = surface === \'workbench\'')
    const brandEnd = premiumUi.indexOf('export function secondaryButtonStyle')
    const brandBlock = premiumUi.slice(brandStart, brandEnd)
    assert.match(brandBlock, /primaryButtonStyle\(accent, isDisabled\)/)
    assert.match(brandBlock, /zlog-primary-cta premium-primary-btn/)
  })
})

describe('Site Diary workbench — no glossy powder CTAs', () => {
  it('Save / Share uses PrimaryCTA surface=workbench without green gradient overrides', () => {
    const saveBlock = diaryPage.slice(
      diaryPage.indexOf('ref={saveCtaRef}'),
      diaryPage.indexOf('</PrimaryCTA>', diaryPage.indexOf('ref={saveCtaRef}')) + 14,
    )
    assert.match(saveBlock, /<PrimaryCTA[\s\S]*surface="workbench"/)
    assert.match(saveBlock, /Save \/ Share/)
    assert.doesNotMatch(saveBlock, /#22c55e|POWDER_CTA_|accent=\{REPORT_THEMES\.diary\.accent\}/)
  })

  it('Location Walk Save Area uses PrimaryCTA surface=workbench', () => {
    const start = locationWalk.indexOf('{copy.saveGroup}')
    assert.ok(start > 0)
    const window = locationWalk.slice(Math.max(0, start - 320), start + 40)
    assert.match(window, /<PrimaryCTA[\s\S]*surface="workbench"/)
    assert.match(window, /saveArea/)
  })

  it('saved-diary review Generate / Share PDF uses the same workbench primary', () => {
    const pdfIndex = savedDiaryPage.indexOf('<PrimaryCTA')
    assert.ok(pdfIndex > 0)
    const pdfBlock = savedDiaryPage.slice(pdfIndex, pdfIndex + 720)
    assert.match(pdfBlock, /surface="workbench"/)
    assert.match(pdfBlock, /Generate \/ Share PDF/)
    assert.doesNotMatch(pdfBlock, /EqualChoiceButton/)
    assert.doesNotMatch(pdfBlock, /POWDER_CTA_/)
  })

  it('saved-diary Delete Diary uses DestructiveButton', () => {
    assert.match(savedDiaryPage, /<DestructiveButton/)
    assert.match(savedDiaryPage, /Delete Diary/)
  })
})
