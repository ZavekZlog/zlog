/**
 * Saved viewer → workbench Edit navigation timing diagnostics.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const viewPage = readFileSync(
  join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)
const shareDiagLogic = readFileSync(
  join(root, 'lib/server/share-diag-route-logic.js'),
  'utf8',
)
const hydrationDiag = readFileSync(
  join(root, 'lib/diary-hydration-timing-diag.js'),
  'utf8',
)

describe('Edit workbench prefetch — saved viewer', () => {
  it('prefetches editHref after viewer readiness without navigating', () => {
    assert.match(viewPage, /editPrefetchHrefRef/)
    assert.match(viewPage, /router\.prefetch\(href\)/)
    assert.match(viewPage, /editExistingDiaryHref\(/)
    assert.match(viewPage, /emitShareDiag\('edit-prefetch-start'/)
    assert.match(
      viewPage,
      /emitShareDiag\('edit-prefetch-(complete|issued)'/,
    )
    const prefetchEffect = viewPage.slice(
      viewPage.indexOf('Warm Edit workbench route/chunks'),
      viewPage.indexOf('const retryAttendanceRegister'),
    )
    assert.match(prefetchEffect, /if \(loading \|\| !view\?\.reportId/)
    assert.doesNotMatch(prefetchEffect, /router\.push/)
    assert.doesNotMatch(prefetchEffect, /setEditBusy/)
    assert.doesNotMatch(prefetchEffect, /mergeSiteDiarySessionSnapshot/)
  })

  it('dedupes prefetch per editHref lifecycle', () => {
    assert.match(viewPage, /editPrefetchHrefRef\.current === href/)
    assert.match(viewPage, /editPrefetchHrefRef\.current = href/)
  })

  it('does not change workbench diary page', () => {
    assert.doesNotMatch(diaryPage, /edit-prefetch/)
    assert.doesNotMatch(diaryPage, /editPrefetchHrefRef/)
  })
})

describe('Edit navigation timing — saved viewer', () => {
  it('sets editBusy and locked busy copy immediately', () => {
    assert.match(viewPage, /const \[editBusy, setEditBusy\]/)
    assert.match(viewPage, /editBusy \? 'Opening diary for editing…'/)
  })

  it('emits edit-navigation-start and router-push without changing navigation', () => {
    assert.match(viewPage, /emitShareDiag\('edit-navigation-start'/)
    assert.match(viewPage, /emitShareDiag\('edit-navigation-router-push'/)
    assert.match(viewPage, /router\.push\(editHref\)/)
    assert.match(viewPage, /editExistingDiaryHref/)
    assert.doesNotMatch(viewPage, /await emitShareDiag/)
  })

  it('stores session correlation in sessionStorage', () => {
    assert.match(viewPage, /SITE_DIARY_EDIT_NAV_TIMING_KEY/)
    assert.match(viewPage, /hydrationSessionId/)
    assert.match(viewPage, /tapStartedAtMs/)
  })
})

describe('Edit navigation timing — workbench', () => {
  it('emits client entry before H0 for progressive edit only', () => {
    assert.match(diaryPage, /emitShareDiag\('edit-workbench-client-entry'/)
    assert.match(diaryPage, /readSavedDiaryEditNavTiming/)
    const entryIdx = diaryPage.indexOf("emitShareDiag('edit-workbench-client-entry'")
    const h0Idx = diaryPage.indexOf('beginDiaryHydrationTiming', entryIdx)
    assert.ok(entryIdx >= 0 && h0Idx > entryIdx, 'client-entry must precede beginDiaryHydrationTiming')
    const block = diaryPage.slice(
      diaryPage.lastIndexOf('progressiveEdit', entryIdx),
      h0Idx,
    )
    assert.match(block, /progressiveEdit/)
    assert.match(diaryPage, /beginDiaryHydrationTiming\(/)
    assert.match(diaryPage, /DIARY_HYDRATION_STAGE/)
    assert.doesNotMatch(diaryPage, /await emitShareDiag/)
  })

  it('reuses edit navigation hydrationSessionId for H0 when present', () => {
    assert.match(diaryPage, /hydrationSessionId: editNavTiming\?\.hydrationSessionId/)
    assert.match(hydrationDiag, /opts\.hydrationSessionId/)
  })
})

describe('Edit navigation timing — server allowlist', () => {
  it('allows elapsedMs, surface, and hydrationSessionId only among new fields', () => {
    assert.match(shareDiagLogic, /'elapsedMs'/)
    assert.match(shareDiagLogic, /'surface'/)
    assert.match(shareDiagLogic, /'hydrationSessionId'/)
  })
})

describe('Progressive edit hydration stage timing — workbench', () => {
  it('marks cover, logo, and photo signing without reordering H12', () => {
    const editBlockStart = diaryPage.indexOf('} else if (progressiveEdit) {')
    const editBlockEnd = diaryPage.indexOf('} else {', editBlockStart)
    assert.ok(editBlockStart >= 0 && editBlockEnd > editBlockStart)
    const editBlock = diaryPage.slice(editBlockStart, editBlockEnd)

    assert.match(editBlock, /markDiaryHydrationTiming\('cover-refresh-start'/)
    assert.match(editBlock, /await resolveCoverPhotoPreviewUrl/)
    assert.match(editBlock, /markDiaryHydrationTiming\('cover-refresh-end'/)
    assert.match(editBlock, /markDiaryHydrationTiming\('logo-sign-start'/)
    assert.match(editBlock, /await signedUrlForPath\(supabase, logoPath\)/)
    assert.match(editBlock, /markDiaryHydrationTiming\('logo-sign-end'/)
    assert.match(editBlock, /markDiaryHydrationTiming\('photo-sign-start'/)
    assert.match(editBlock, /await signReportPhotoRows\(reportPhotos\)/)
    assert.match(editBlock, /markDiaryHydrationTiming\('photo-sign-end'/)
    assert.match(editBlock, /DIARY_HYDRATION_STAGE\.H12/)

    const coverStart = editBlock.indexOf("markDiaryHydrationTiming('cover-refresh-start'")
    const coverEnd = editBlock.indexOf("markDiaryHydrationTiming('cover-refresh-end'")
    const logoStart = editBlock.indexOf("markDiaryHydrationTiming('logo-sign-start'")
    const logoEnd = editBlock.indexOf("markDiaryHydrationTiming('logo-sign-end'")
    const photoStart = editBlock.indexOf("markDiaryHydrationTiming('photo-sign-start'")
    const photoEnd = editBlock.indexOf("markDiaryHydrationTiming('photo-sign-end'")
    const h12 = editBlock.indexOf('DIARY_HYDRATION_STAGE.H12')
    assert.ok(coverStart < coverEnd && coverEnd < logoStart)
    assert.ok(logoStart < logoEnd && logoEnd < photoStart)
    assert.ok(photoStart < photoEnd && photoEnd < h12)
  })
})

describe('Edit navigation timing — protected areas untouched', () => {
  it('does not change labour fetch or photo signing entrypoints in workbench load', () => {
    assert.match(diaryPage, /report_labour/)
    assert.match(diaryPage, /signReportPhotoRows/)
    const editNavBlock = diaryPage.slice(
      diaryPage.indexOf('edit-workbench-client-entry'),
      diaryPage.indexOf('beginDiaryHydrationTiming'),
    )
    assert.doesNotMatch(editNavBlock, /report_labour/)
    assert.doesNotMatch(editNavBlock, /signReportPhotoRows/)
  })

  it('does not add PDF or lazy project details timing in viewer edit handler', () => {
    const handler = viewPage.slice(
      viewPage.indexOf("emitShareDiag('edit-navigation-start'"),
      viewPage.indexOf('router.push(editHref)') + 30,
    )
    assert.doesNotMatch(handler, /post-hydrate|background-pdf|ProjectDetailsEditor/)
  })

  it('keeps Edit tap on router.push(editHref) with opening copy', () => {
    assert.match(viewPage, /router\.push\(editHref\)/)
    assert.match(viewPage, /editBusy \? 'Opening diary for editing…'/)
  })
})
