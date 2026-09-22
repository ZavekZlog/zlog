/**
 * Saved diary list → viewer navigation helpers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  navigateToSavedDiaryViewer,
  prefetchSavedDiaryViewerRoutes,
  shouldIgnoreSavedDiaryRowOpen,
  tryBeginSavedDiaryOpen,
} from './diary-saved-list-navigation.js'
import { savedDiaryViewerHref } from './diary-routing.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')

describe('diary-saved-list-navigation helpers', () => {
  it('tryBeginSavedDiaryOpen is single-flight per report id', () => {
    const ref = { current: null }
    assert.equal(tryBeginSavedDiaryOpen(ref, 'rep-1'), true)
    assert.equal(ref.current, 'rep-1')
    assert.equal(tryBeginSavedDiaryOpen(ref, 'rep-2'), false)
    assert.equal(tryBeginSavedDiaryOpen(ref, ''), false)
  })

  it('shouldIgnoreSavedDiaryRowOpen blocks selection mode and in-flight opens', () => {
    assert.equal(shouldIgnoreSavedDiaryRowOpen({ selectionMode: true }), true)
    assert.equal(
      shouldIgnoreSavedDiaryRowOpen({ inFlightRef: { current: 'rep-1' } }),
      true,
    )
    assert.equal(shouldIgnoreSavedDiaryRowOpen({ selectionMode: false }), false)
  })

  it('navigateToSavedDiaryViewer prefers explicit navigate then router.push', () => {
    const calls = []
    assert.equal(
      navigateToSavedDiaryViewer('/a', {
        navigate: (href) => calls.push(['navigate', href]),
      }),
      true,
    )
    assert.deepEqual(calls, [['navigate', '/a']])

    const pushed = []
    assert.equal(
      navigateToSavedDiaryViewer('/b', {
        router: { push: (href) => pushed.push(href) },
      }),
      true,
    )
    assert.deepEqual(pushed, ['/b'])
  })

  it('prefetchSavedDiaryViewerRoutes dedupes and respects limit', () => {
    const prefetched = []
    prefetchSavedDiaryViewerRoutes(
      [
        { id: 'r1', project_id: 'p1' },
        { id: 'r2', project_id: 'p1' },
        { id: 'r3', project_id: 'p2' },
      ],
      savedDiaryViewerHref,
      { prefetch: (href) => prefetched.push(href) },
      2,
    )
    assert.equal(prefetched.length, 2)
    assert.match(prefetched[0], /\/dashboard\/project\/p1\/diary\/view\?report=r1/)
  })
})

describe('diary hub wires saved-list navigation contract', () => {
  it('D — one tap uses full navigation with single-flight and opening acknowledgement', () => {
    const open = hubPage.slice(
      hubPage.indexOf('const openExistingReport'),
      hubPage.indexOf('const openSavedDiaries'),
    )
    assert.match(open, /tryBeginSavedDiaryOpen/)
    assert.match(open, /navigateToSavedDiaryViewer/)
    assert.match(open, /window\.location\.assign/)
    assert.match(open, /setOpeningReportId/)
    assert.doesNotMatch(open, /router\.push\(href\)/)
    assert.ok(
      open.indexOf('openingSavedDiaryRef.current = true') <
        open.indexOf('navigateToSavedDiaryViewer'),
      'project-param guard must arm before navigation',
    )
  })

  it('E — saved diary open does not target /dashboard', () => {
    assert.match(openExistingReportSlice(hubPage), /savedDiaryViewerHref/)
    assert.doesNotMatch(openExistingReportSlice(hubPage), /['"]\/dashboard['"]/)
  })

  it('G — duplicate tap protection via in-flight ref and disabled rows', () => {
    assert.match(hubPage, /savedDiaryOpenInFlightRef/)
    assert.match(hubPage, /Opening diary…/)
    assert.match(hubPage, /data-opening=\{opening/)
    assert.match(hubPage, /disabled=\{openBlocked/)
  })

  it('F — report and project ids flow through savedDiaryViewerHref', () => {
    assert.match(
      openExistingReportSlice(hubPage),
      /savedDiaryViewerHref\(row\?\.project_id,\s*row\?\.id\)/,
    )
    assert.equal(
      savedDiaryViewerHref('p', 'r'),
      '/dashboard/project/p/diary/view?report=r',
    )
  })

  it('prefetches viewer routes when the saved list is shown', () => {
    assert.match(hubPage, /prefetchSavedDiaryViewerRoutes/)
  })
})

function openExistingReportSlice(hubPage) {
  return hubPage.slice(
    hubPage.indexOf('const openExistingReport'),
    hubPage.indexOf('const openSavedDiaries'),
  )
}
