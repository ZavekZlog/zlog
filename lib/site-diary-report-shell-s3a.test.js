/**
 * Structural S3A — persistent report shell + single-surface extraction.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')

function isSavedDiaryViewerDiaryPath(pathname) {
  return /\/diary\/view\/?$/.test(String(pathname || ''))
}

function isDiaryCompleteChildPath(pathname) {
  return /\/diary\/complete\/?$/.test(String(pathname || ''))
}

function isSiteDiaryWorkbenchDiaryPath(pathname) {
  const path = String(pathname || '')
  if (!/\/diary\/?$/.test(path)) return false
  if (/\/diary\/(view|complete)\/?$/.test(path)) return false
  return true
}
const layoutPath = join(root, 'app/dashboard/project/[id]/diary/layout.jsx')
const shellPath = join(root, 'components/site-diary/SiteDiaryReportShell.jsx')
const viewerSurfacePath = join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx')
const workbenchSurfacePath = join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx')
const viewerRoutePath = join(root, 'app/dashboard/project/[id]/diary/view/page.jsx')
const workbenchRoutePath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')

const layoutSrc = readFileSync(layoutPath, 'utf8')
const shellSrc = readFileSync(shellPath, 'utf8')
const viewerSurfaceSrc = readFileSync(viewerSurfacePath, 'utf8')
const workbenchSurfaceSrc = readFileSync(workbenchSurfacePath, 'utf8')
const viewerRouteSrc = readFileSync(viewerRoutePath, 'utf8')
const workbenchRouteSrc = readFileSync(workbenchRoutePath, 'utf8')

describe('Site Diary structural S3A — layout + shell', () => {
  it('layout wraps provider and persistent report shell', () => {
    assert.match(layoutSrc, /SiteDiarySessionProvider/)
    assert.match(layoutSrc, /SiteDiaryReportShell/)
    assert.match(layoutSrc, /\{children\}/)
  })

  it('shell routes viewer and workbench surfaces from pathname', () => {
    assert.equal(
      isSavedDiaryViewerDiaryPath('/dashboard/project/p1/diary/view'),
      true,
    )
    assert.equal(
      isSiteDiaryWorkbenchDiaryPath('/dashboard/project/p1/diary'),
      true,
    )
    assert.equal(
      isDiaryCompleteChildPath('/dashboard/project/p1/diary/complete'),
      true,
    )
    assert.equal(isSiteDiaryWorkbenchDiaryPath('/dashboard/project/p1/diary/view'), false)
    assert.match(shellSrc, /SavedDiaryViewerSurface/)
    assert.match(shellSrc, /SiteDiaryWorkbenchSurface/)
    assert.match(shellSrc, /return children/)
  })

  it('shell return branches are mutually exclusive by pathname', () => {
    const viewerBranch = shellSrc.indexOf('return <SavedDiaryViewerSurface')
    const workbenchBranch = shellSrc.indexOf('return <SiteDiaryWorkbenchSurface')
    const completeBranch = shellSrc.indexOf('return children')
    assert.ok(viewerBranch > 0 && workbenchBranch > viewerBranch)
    assert.ok(completeBranch > 0)
    assert.doesNotMatch(
      shellSrc.slice(viewerBranch, viewerBranch + 120),
      /SiteDiaryWorkbenchSurface/,
    )
    assert.doesNotMatch(
      shellSrc.slice(workbenchBranch, workbenchBranch + 120),
      /SavedDiaryViewerSurface/,
    )
  })
})

describe('Site Diary structural S3A — thin route markers', () => {
  it('route pages are non-heavy markers', () => {
    assert.doesNotMatch(viewerRouteSrc, /PhotoWorkspace/)
    assert.doesNotMatch(viewerRouteSrc, /loadSavedDiaryView/)
    assert.doesNotMatch(workbenchRouteSrc, /PhotoWorkspace/)
    assert.doesNotMatch(workbenchRouteSrc, /import\s+.*SignaturePad/)
    assert.doesNotMatch(workbenchRouteSrc, /from '@\/components\/site-diary/)
  })

  it('heavy implementations live in surface modules', () => {
    assert.match(viewerSurfaceSrc, /loadSavedDiaryView/)
    assert.match(workbenchSurfaceSrc, /export default function SiteDiaryWorkbenchSurface/)
    assert.match(workbenchSurfaceSrc, /PhotoWorkspace/)
    assert.match(workbenchSurfaceSrc, /progressiveEdit/)
  })
})

describe('Site Diary structural S3A — viewer edit + S2 + preload', () => {
  it('preserves Edit navigation and S2 publication on viewer surface', () => {
    assert.match(viewerSurfaceSrc, /editExistingDiaryHref/)
    assert.match(viewerSurfaceSrc, /Opening diary for editing…/)
    assert.match(viewerSurfaceSrc, /router\.push\(editHref\)/)
    assert.match(viewerSurfaceSrc, /publishReadSnapshot/)
    assert.match(viewerSurfaceSrc, /registerViewerPublicationLifecycle/)
  })

  it('preloads workbench module only without rendering workbench in viewer', () => {
    assert.match(viewerSurfaceSrc, /import\('\.\/SiteDiaryWorkbenchSurface'\)/)
    assert.doesNotMatch(
      viewerSurfaceSrc,
      /import\('\.\/SiteDiaryWorkbenchSurface'\)[\s\S]{0,200}<SiteDiaryWorkbenchSurface/,
    )
  })

  it('records bounded workbench surface mount diagnostic', () => {
    assert.match(workbenchSurfaceSrc, /site-diary-surface-workbench-mounted/)
    assert.match(workbenchSurfaceSrc, /edit-workbench-client-entry/)
  })
})
