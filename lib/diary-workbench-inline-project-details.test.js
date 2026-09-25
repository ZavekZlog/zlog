/**
 * Unit 2 — inline Project Details on Site Diary workbench.
 * DIAGNOSTIC BUILD: workbench inline subsystem temporarily removed from page.jsx (S10 isolation).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  openExistingDiaryHref,
  workbenchInlineProjectDetailsHref,
} from './diary-routing.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const controllerSrc = readFileSync(
  join(root, 'lib/use-site-diary-project-details.js'),
  'utf8',
)
const sectionSrc = readFileSync(
  join(root, 'components/site-diary/SiteDiaryProjectDetailsSection.jsx'),
  'utf8',
)

const DIAGNOSTIC_INLINE_REMOVED = /DIAGNOSTIC \(S10\): Unit 2 inline Project Details removed/.test(
  diaryPage,
)

describe('Unit 2 — routing', () => {
  it('today’s existing diary opens on workbench edit, not setup', () => {
    assert.equal(
      openExistingDiaryHref({
        projectId: 'proj-abc',
        reportId: 'rep-today',
        reportDate: '2026-08-15',
        today: '2026-08-15',
      }),
      '/dashboard/project/proj-abc/diary?report=rep-today&edit=1',
    )
  })

  it('details=open keeps explicit edit mode only', () => {
    const href = workbenchInlineProjectDetailsHref('proj-1', 'rep-1')
    assert.equal(
      href,
      '/dashboard/project/proj-1/diary?report=rep-1&edit=1&details=open',
    )
    assert.doesNotMatch(href, /compose=1/)
  })
})

describe('Unit 2 — workbench mount', () => {
  it('does not navigate Review / Edit to setup', () => {
    if (!DIAGNOSTIC_INLINE_REMOVED) {
      assert.match(diaryPage, /SiteDiaryWorkbenchProjectDetails/)
    } else {
      assert.doesNotMatch(diaryPage, /SiteDiaryWorkbenchProjectDetails/)
      assert.doesNotMatch(diaryPage, /useSiteDiaryProjectDetailsController/)
    }
    assert.doesNotMatch(diaryPage, /projectAndReportDetailsHref/)
    assert.match(sectionSrc, /Review \/ Edit Project & Report Details/)
  })

  it('workbench Back uses diary hub, not setup', () => {
    const block = diaryPage.slice(
      diaryPage.indexOf('const workbenchBackHref'),
      diaryPage.indexOf('const autosaveStatusCopy'),
    )
    assert.match(block, /diaryHubHref\(\{\s*projectId\s*\}\)/)
    assert.doesNotMatch(block, /projectAndReportDetailsHref|\/dashboard\/diary\/setup/)
  })

  it('Edit This Diary uses diaryEditHref for today’s diary', () => {
    const block = diaryPage.slice(
      diaryPage.indexOf('const handleEnterEditMode'),
      diaryPage.indexOf('const handleCancelEditMode'),
    )
    assert.match(block, /diaryEditHref\(projectId,\s*editingReportId\)/)
    assert.doesNotMatch(block, /projectAndReportDetailsHref|\/dashboard\/diary\/setup/)
    assert.doesNotMatch(block, /setFormReloadToken/)
  })

  it('inline persist uses controller without router.push on workbench', () => {
    if (DIAGNOSTIC_INLINE_REMOVED) {
      assert.doesNotMatch(diaryPage, /persistProjectDetails/)
      assert.doesNotMatch(diaryPage, /hostMode:\s*'workbench'/)
      return
    }
    assert.match(diaryPage, /persistProjectDetails/)
    assert.match(diaryPage, /hostMode:\s*'workbench'/)
    assert.match(controllerSrc, /navigateAfterSuccess:\s*false/)
    assert.match(controllerSrc, /persistProjectDetails/)
    assert.match(controllerSrc, /navigateAfterSuccess/)
    assert.match(controllerSrc, /navigate:\s*async \(\) => \{\}/)
  })

  it('expand/collapse does not bump formReloadToken', () => {
    if (DIAGNOSTIC_INLINE_REMOVED) return
    const block = diaryPage.slice(
      diaryPage.indexOf('projectDetailsExpanded'),
      diaryPage.indexOf('inlineProjectDetailsHydrateEnabled'),
    )
    assert.ok(block.length > 20)
    assert.doesNotMatch(block, /setFormReloadToken/)
  })
})

describe('Unit 2 — workbench sync helper', () => {
  it('exports bounded workbench bridge helpers from the controller', () => {
    assert.match(controllerSrc, /export function buildWorkbenchProjectDetailsSeed/)
    assert.match(controllerSrc, /export function applyProjectDetailsPersistToWorkbench/)
    if (!DIAGNOSTIC_INLINE_REMOVED) {
      assert.match(diaryPage, /applyProjectDetailsPersistToWorkbench/)
      assert.match(diaryPage, /buildWorkbenchProjectDetailsSeed/)
    }
  })

  it('workbench persist success invalidates prepared PDF only after save', () => {
    if (DIAGNOSTIC_INLINE_REMOVED) return
    const block = diaryPage.slice(
      diaryPage.indexOf('handleInlineProjectDetailsPersistSuccess'),
      diaryPage.indexOf('inlineProjectDetailsHydrateEnabled'),
    )
    assert.match(block, /invalidatePreparedSharePdf\('committed-diary-change'\)/)
    assert.doesNotMatch(block, /setFormReloadToken/)
    assert.doesNotMatch(block, /router\.(push|replace)/)
  })
})
