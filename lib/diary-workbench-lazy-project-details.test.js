/**
 * Unit 2 repair — lazy inline Project Details + saved viewer Edit acknowledgement.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const viewPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
  'utf8',
)
const editorSrc = readFileSync(
  join(root, 'components/site-diary/SiteDiaryWorkbenchProjectDetailsEditor.jsx'),
  'utf8',
)
const manifestPath = join(
  root,
  '.next/server/app/dashboard/project/[id]/diary/page_client-reference-manifest.js',
)

describe('Saved viewer — Edit acknowledgement', () => {
  it('sets editBusy before navigation', () => {
    assert.match(viewPage, /const \[editBusy, setEditBusy\]/)
    const block = viewPage.slice(
      viewPage.indexOf('if (editBusy) return'),
      viewPage.indexOf('router.push(editHref)') + 20,
    )
    assert.match(block, /setEditBusy\(true\)/)
    assert.match(viewPage, /editBusy \? 'Opening diary…'/)
    assert.match(viewPage, /actionsBusy.*editBusy|editBusy.*actionsBusy/)
  })

  it('does not change editHref construction', () => {
    assert.match(viewPage, /editExistingDiaryHref/)
    assert.match(viewPage, /router\.push\(editHref\)/)
  })
})

describe('Workbench — lazy inline Project Details', () => {
  it('does not statically import heavy Project Details modules', () => {
    assert.doesNotMatch(diaryPage, /from '@\/components\/site-diary\/SiteDiaryProjectDetailsSection'/)
    assert.doesNotMatch(diaryPage, /from '@\/lib\/use-site-diary-project-details'/)
    assert.doesNotMatch(diaryPage, /useSiteDiaryProjectDetailsController/)
    assert.doesNotMatch(diaryPage, /buildWorkbenchProjectDetailsSeed/)
    assert.doesNotMatch(diaryPage, /applyProjectDetailsPersistToWorkbench/)
  })

  it('uses next/dynamic for the lazy editor', () => {
    assert.match(diaryPage, /import dynamic from 'next\/dynamic'/)
    assert.match(diaryPage, /import\('@\/components\/site-diary\/SiteDiaryWorkbenchProjectDetailsEditor'\)/)
    assert.match(diaryPage, /Loading Project Details…/)
  })

  it('renders compact summary before expand', () => {
    assert.match(diaryPage, /showInlineProjectDetails && \(project\?\.name \|\| reportDate\) && !projectDetailsExpanded/)
    assert.match(diaryPage, /Review \/ Edit Project & Report Details/)
  })

  it('mounts lazy editor only when expanded', () => {
    assert.match(diaryPage, /showInlineProjectDetails && projectDetailsExpanded && editingReportId/)
    assert.match(diaryPage, /<SiteDiaryWorkbenchProjectDetailsEditor/)
  })

  it('lazy editor owns controller and section imports', () => {
    assert.match(editorSrc, /useSiteDiaryProjectDetailsController/)
    assert.match(editorSrc, /SiteDiaryWorkbenchProjectDetails/)
    assert.match(editorSrc, /buildWorkbenchProjectDetailsSeed/)
    assert.match(editorSrc, /applyProjectDetailsPersistToWorkbench/)
  })

  it('inline persist sync invalidates PDF only on committed change, not on expand', () => {
    const syncBlock = diaryPage.slice(
      diaryPage.indexOf('handleWorkbenchProjectDetailsSync'),
      diaryPage.indexOf('collapseInlineProjectDetails'),
    )
    assert.match(syncBlock, /invalidatePreparedSharePdf\('committed-diary-change'\)/)
    assert.doesNotMatch(syncBlock, /router\.(push|replace)/)
    assert.doesNotMatch(syncBlock, /setFormReloadToken/)
    const expandBlock = diaryPage.slice(
      diaryPage.indexOf('setProjectDetailsExpanded(true)'),
      diaryPage.indexOf('SiteDiaryWorkbenchProjectDetailsEditor'),
    )
    assert.doesNotMatch(expandBlock, /invalidatePreparedSharePdf/)
  })

  it('expand/collapse does not touch photo workspace or report_photos', () => {
    const expandRegion = diaryPage.slice(
      diaryPage.indexOf('projectDetailsExpanded'),
      diaryPage.indexOf('SiteDiaryWorkbenchProjectDetailsEditor') + 80,
    )
    assert.doesNotMatch(expandRegion, /report_photos/)
    assert.doesNotMatch(expandRegion, /setPhotos\(/)
    assert.doesNotMatch(expandRegion, /signReportPhotoRows/)
  })
})

describe('Workbench client manifest — code splitting', () => {
  it('initial page entry does not list the lazy editor module', () => {
    let manifest
    try {
      manifest = readFileSync(manifestPath, 'utf8')
    } catch {
      assert.fail('Run npm run build first — missing page_client-reference-manifest.js')
    }
    assert.doesNotMatch(manifest, /SiteDiaryWorkbenchProjectDetailsEditor/)
    assert.doesNotMatch(manifest, /use-site-diary-project-details/)
    assert.match(manifest, /app\/dashboard\/project\/\[id\]\/diary\/page\.jsx/)
  })
})
