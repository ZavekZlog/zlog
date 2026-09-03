/**
 * DIARY-LIST-FAST-RETURN — retained Saved Diaries compact-list snapshot.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearSavedDiaryListSnapshot,
  compactSavedDiaryListRows,
  readSavedDiaryListSnapshot,
  savedDiaryListPaintState,
  savedDiaryListRefreshRange,
  snapshotHasForbiddenListPayload,
  writeSavedDiaryListSnapshot,
} from './diary-saved-list-cache.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const cacheSrc = readFileSync(join(root, 'lib/diary-saved-list-cache.js'), 'utf8')
const registry = JSON.parse(
  readFileSync(join(root, 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json'), 'utf8'),
)

const LIST_KEY = { mode: 'saved', filterProjectId: null }

function sampleRows() {
  return [
    {
      id: 'rep-1',
      project_id: 'proj-1',
      report_date: '2026-09-03',
      shift: 'Day',
      site_summary: 'Pour slab',
      projects: { id: 'proj-1', name: 'North Site' },
      extraBlob: 'data:image/jpeg;base64,SHOULD_NOT_KEEP',
    },
    {
      id: 'rep-2',
      project_id: 'proj-2',
      report_date: '2026-09-02',
      shift: 'Night',
      site_summary: 'Steel',
      projects: { id: 'proj-2', name: 'South Site' },
    },
  ]
}

describe('DIARY-LIST-FAST-RETURN — Saved Diaries list snapshot', () => {
  beforeEach(() => {
    clearSavedDiaryListSnapshot()
  })

  it('A — first visit with no cache uses initial loading and stores a successful query', () => {
    const paint = savedDiaryListPaintState(readSavedDiaryListSnapshot(LIST_KEY))
    assert.equal(paint.fromSnapshot, false)
    assert.equal(paint.initialLoading, true)
    assert.deepEqual(paint.reports, [])

    const stored = writeSavedDiaryListSnapshot(LIST_KEY, {
      reports: sampleRows(),
      totalCount: 2,
    })
    assert.equal(stored.reports.length, 2)
    assert.equal(readSavedDiaryListSnapshot(LIST_KEY).totalCount, 2)
  })

  it('B — return with snapshot exposes previous rows and does not start in initial loading', () => {
    writeSavedDiaryListSnapshot(LIST_KEY, { reports: sampleRows(), totalCount: 12 })
    const paint = savedDiaryListPaintState(readSavedDiaryListSnapshot(LIST_KEY))
    assert.equal(paint.fromSnapshot, true)
    assert.equal(paint.initialLoading, false)
    assert.equal(paint.reports.length, 2)
    assert.equal(paint.reports[0].projects.name, 'North Site')
    assert.equal(paint.totalCount, 12)
  })

  it('C — hub still runs a Saved Diaries query after a snapshot return', () => {
    const start = hubPage.indexOf("if (mode !== 'previous' && mode !== 'saved') return")
    const end = hubPage.indexOf('const openExistingReport')
    assert.ok(start > 0 && end > start)
    const effect = hubPage.slice(start, end)
    assert.match(effect, /readSavedDiaryListSnapshot/)
    assert.match(effect, /savedDiaryListPaintState/)
    assert.match(effect, /buildSavedDiaryListQuery/)
    assert.match(effect, /fromSnapshot/)
    assert.match(effect, /if \(!paint\.fromSnapshot\) \{[\s\S]*setLoading\(true\)/)
    assert.match(effect, /list-route-mounted/)
    assert.match(effect, /cached-rows-rendered/)
    assert.match(effect, /background-refresh-done/)
  })

  it('D — refresh success writes an updated snapshot', () => {
    writeSavedDiaryListSnapshot(LIST_KEY, { reports: sampleRows().slice(0, 1), totalCount: 1 })
    writeSavedDiaryListSnapshot(LIST_KEY, { reports: sampleRows(), totalCount: 40 })
    const snap = readSavedDiaryListSnapshot(LIST_KEY)
    assert.equal(snap.reports.length, 2)
    assert.equal(snap.totalCount, 40)
    assert.match(hubPage, /writeSavedDiaryListSnapshot\(\s*\{ mode, filterProjectId \}/)
  })

  it('E — refresh failure keeps the previous snapshot rows', () => {
    writeSavedDiaryListSnapshot(LIST_KEY, { reports: sampleRows(), totalCount: 2 })
    const before = readSavedDiaryListSnapshot(LIST_KEY)
    // Simulate a failed refresh by not writing.
    const after = readSavedDiaryListSnapshot(LIST_KEY)
    assert.equal(after.reports.length, before.reports.length)
    assert.equal(after.reports[0].id, 'rep-1')
    const start = hubPage.indexOf("if (mode !== 'previous' && mode !== 'saved') return")
    const end = hubPage.indexOf('const openExistingReport')
    const effect = hubPage.slice(start, end)
    assert.match(effect, /We couldn’t load your diaries/)
    assert.doesNotMatch(effect, /setReports\(\[\]\)/)
    assert.doesNotMatch(effect, /setReports\(null\)/)
  })

  it('F — snapshot stores compact list metadata only', () => {
    const compacted = compactSavedDiaryListRows(sampleRows())
    assert.equal(compacted[0].extraBlob, undefined)
    assert.deepEqual(Object.keys(compacted[0]).sort(), [
      'id',
      'project_id',
      'projects',
      'report_date',
      'shift',
      'site_summary',
    ])
    const snap = writeSavedDiaryListSnapshot(LIST_KEY, {
      reports: sampleRows(),
      totalCount: 2,
    })
    assert.equal(snapshotHasForbiddenListPayload(snap), false)
    assert.doesNotMatch(JSON.stringify(snap), /data:image\//)
  })

  it('G — list cache does not introduce PDF prepare, signing, or IndexedDB PDF hydration', () => {
    assert.doesNotMatch(cacheSrc, /prepareSiteDiaryPdf|loadShareReadyPdf|indexedDB|createSignedUrl/)
    assert.doesNotMatch(hubPage, /writeSavedDiaryListSnapshot[\s\S]{0,200}prepareSiteDiaryPdf/)
    assert.doesNotMatch(hubPage, /rememberSavedDiaryList[\s\S]{0,200}prepareSiteDiaryPdf/)
    const row = registry.behaviours.find((b) => b.id === 'DIARY-LIST-FAST-RETURN')
    assert.ok(row)
    assert.match(row.description, /retained rows immediately/i)
    assert.ok(row.tests.includes('lib/diary-saved-list-cache.test.js'))
  })

  it('refresh range keeps Load-more rows instead of shrinking to one page', () => {
    assert.deepEqual(savedDiaryListRefreshRange(0, 50), { from: 0, to: 49 })
    assert.deepEqual(savedDiaryListRefreshRange(50, 50), { from: 0, to: 49 })
    assert.deepEqual(savedDiaryListRefreshRange(80, 50), { from: 0, to: 79 })
  })

  it('hub paints cached rows without the initial loading replacement', () => {
    assert.match(hubPage, /savedDiaryListPaintState\(\s*readSavedDiaryListSnapshot/)
    assert.match(hubPage, /loading && reports\.length < 1/)
    assert.match(hubPage, /reports\.length > 0 \?/)
    assert.doesNotMatch(
      hubPage,
      /\{!loading && reports\.length > 0 \?/,
    )
    const openSaved = hubPage.slice(
      hubPage.indexOf('const openSavedDiaries'),
      hubPage.indexOf('const startNewReport'),
    )
    assert.match(openSaved, /readSavedDiaryListSnapshot/)
    assert.match(openSaved, /setLoading\(paint\.initialLoading\)/)
    const deleteFallback = hubPage.slice(
      hubPage.indexOf('await refreshSavedDiaryFirstPage()'),
      hubPage.indexOf('if (result.ok)'),
    )
    assert.match(deleteFallback, /rememberSavedDiaryList/)
  })
})
