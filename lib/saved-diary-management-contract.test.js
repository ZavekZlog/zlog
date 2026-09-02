/**
 * Saved Diaries management — protected baseline 8bd3dd3.
 * Fail if unrelated work silently removes or weakens the Android-approved contract.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BULK_SAVED_DIARY_DELETE_LABELS,
  chunkReportIdsForDelete,
  deleteReportActionLabel,
  deleteSiteDiaries,
  deleteSiteDiariesInSafeBatches,
  normalizeReportIds,
  selectedReportsCountLabel,
} from './report-deletion.js'
import { savedDiaryViewerHref } from './diary-routing.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const helper = readFileSync(join(root, 'lib/report-deletion.js'), 'utf8')
const dialog = readFileSync(
  join(root, 'components/report-management/ReportDeletionDialog.jsx'),
  'utf8',
)
const viewerPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
  'utf8',
)
const migration = readFileSync(
  join(root, 'supabase/migrations/20260826140000_report_photos_prepared_assets.sql'),
  'utf8',
)

function fakeSupabase({ rpcResults = {} } = {}) {
  const calls = { rpc: [] }
  return {
    calls,
    async rpc(name, args) {
      calls.rpc.push({ name, args })
      const result = rpcResults[name]
      if (Array.isArray(result)) {
        return result.length
          ? result.shift()
          : { data: null, error: { message: `unexpected rpc ${name}` } }
      }
      if (result) return result
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
  }
}

describe('Saved Diaries management — protected baseline 8bd3dd3', () => {
  it('opens a compact Saved Diaries list, not large cards', () => {
    assert.match(hubPage, /title="View Saved Diaries"/)
    assert.match(hubPage, /if \(mode === 'saved'\) return 'View Saved Diaries'/)
    assert.match(hubPage, /className="zlog-saved-diary-list"/)
    assert.match(hubPage, /data-saved-diary-row/)
    assert.doesNotMatch(hubPage, /RecentEntryCard/)
  })

  it('keeps Select on normal Saved Diaries mode and a bulk selection mode', () => {
    assert.match(hubPage, /enterSelectionMode/)
    assert.match(hubPage, /setSelectionMode\(true\)/)
    assert.match(hubPage, />\s*Select\s*</)
    assert.match(hubPage, /onClick=\{enterSelectionMode\}/)
    assert.match(hubPage, /selectionMode/)
  })

  it('opens a saved diary on the first tap and does not navigate while selecting', () => {
    assert.equal(
      savedDiaryViewerHref('proj-abc', 'rep-123'),
      '/dashboard/project/proj-abc/diary/view?report=rep-123',
    )
    const open = hubPage.slice(
      hubPage.indexOf('const openExistingReport'),
      hubPage.indexOf('const openSavedDiaries'),
    )
    assert.match(open, /if \(selectionMode\) return/)
    assert.match(open, /savedDiaryViewerHref/)
    assert.ok(
      open.indexOf('openingSavedDiaryRef.current = true') < open.indexOf('router.push(href)'),
      'open must arm the first-click guard before pushing the viewer',
    )
    const rowClick = hubPage.slice(
      hubPage.indexOf('onClick={() => {'),
      hubPage.indexOf('aria-pressed={selectionMode'),
    )
    assert.match(rowClick, /if \(selectionMode\)/)
    assert.match(rowClick, /toggleSelected\(row\.id\)/)
    assert.match(rowClick, /openExistingReport\(row\)/)
  })

  it('shows the true Saved Diaries total, never loaded/page/batch count copy', () => {
    const listCount = (total) => {
      const count = Number(total) || 0
      return count === 1 ? '1 saved diary' : `${count} saved diaries`
    }
    assert.equal(listCount(1), '1 saved diary')
    assert.equal(listCount(83), '83 saved diaries')
    assert.match(hubPage, /savedDiariesListCountLabel\(totalSavedDiaryCount\)/)
    assert.match(hubPage, /count === 1 \? '1 saved diary' : `\$\{count\} saved diaries`/)
    assert.doesNotMatch(hubPage, /saved diaries loaded/)
    assert.doesNotMatch(hubPage, /Select All Loaded/)
    assert.doesNotMatch(hubPage, / of .* loaded/)
  })

  it('offers Load more diaries when rows remain, without exposing page size', () => {
    assert.match(hubPage, /return 'Load more diaries'/)
    assert.match(hubPage, /savedDiariesLoadMoreLabel\(\)/)
    assert.match(hubPage, /remainingSavedDiaries > 0/)
    assert.match(hubPage, /loadMoreSavedDiaries/)
    assert.doesNotMatch(hubPage, /Load \$\{/)
  })

  it('keeps the compact sticky two-row selection toolbar', () => {
    assert.match(hubPage, /data-sticky-manage-bar/)
    assert.match(hubPage, /zlog-saved-diary-toolbar--selecting/)
    assert.match(hubPage, /grid-template-columns: auto minmax\(min-content, 1fr\) auto/)
    assert.match(hubPage, /grid-template-rows: auto auto/)
    assert.match(hubPage, /zlog-saved-diary-toolbar-cancel/)
    assert.match(hubPage, /selectedReportsCountLabel\(selectedIds\.size\)/)
    assert.match(hubPage, />\s*Cancel\s*</)
    assert.match(hubPage, /Delete Selected/)
    assert.match(hubPage, /disabled=\{selectedIds\.size < 1 \|\| deleting\}/)
  })

  it('uses simple selected-count copy', () => {
    assert.equal(selectedReportsCountLabel(0), '0 selected')
    assert.equal(selectedReportsCountLabel(2), '2 selected')
    assert.equal(selectedReportsCountLabel(83), '83 selected')
  })

  it('Select All retrieves every Saved Diaries id, not only rendered rows', () => {
    const selectAll = hubPage.slice(
      hubPage.indexOf('const selectAllVisible'),
      hubPage.indexOf('const refreshSavedDiaryFirstPage'),
    )
    assert.match(selectAll, /fetchAllSavedDiaryIds/)
    assert.match(selectAll, /setSelectedIds\(new Set\(ids\)\)/)
    assert.doesNotMatch(selectAll, /selectAllReports\(reports\)/)
    const idQuery = hubPage.slice(
      hubPage.indexOf('function buildSavedDiaryIdQuery'),
      hubPage.indexOf('async function fetchAllSavedDiaryIds'),
    )
    assert.match(idQuery, /\.select\('id', \{ count: 'exact' \}\)/)
    assert.doesNotMatch(idQuery, /SAVED_DIARY_LIST_COLUMNS/)
    assert.match(hubPage, /return 'Select All'/)
    assert.match(hubPage, /savedDiariesSelectAllLabel\(selectedIds\.size, totalSavedDiaryCount\)/)
    assert.match(selectAll, /selectedIds\.size === totalSavedDiaryCount/)
    assert.match(selectAll, /setSelectedIds\(new Set\(\)\)/)
  })

  it('requires exact-count in-app confirmation and an irreversible warning', () => {
    assert.equal(
      deleteReportActionLabel(1, BULK_SAVED_DIARY_DELETE_LABELS),
      'Delete 1 saved diary',
    )
    assert.equal(
      deleteReportActionLabel(83, BULK_SAVED_DIARY_DELETE_LABELS),
      'Delete 83 saved diaries',
    )
    assert.match(hubPage, /ReportDeletionDialog/)
    assert.match(hubPage, /labels=\{BULK_SAVED_DIARY_DELETE_LABELS\}/)
    assert.match(dialog, /This cannot be undone/)
    assert.match(dialog, /\{action\}\?/)
    assert.doesNotMatch(hubPage, /window\.confirm/)
    assert.doesNotMatch(dialog, /window\.confirm/)
  })

  it('keeps the 50-id per-call cap and batches larger selections internally', () => {
    assert.match(helper, /const MAX_DELETE_COUNT = 50/)
    assert.throws(
      () => normalizeReportIds(Array.from({ length: 51 }, (_, i) => `id-${i}`)),
      /50/,
    )
    const chunks = chunkReportIdsForDelete(Array.from({ length: 83 }, (_, i) => `id-${i}`))
    assert.deepEqual(chunks.map((chunk) => chunk.length), [50, 33])
    assert.ok(chunks.every((chunk) => chunk.length <= 50))
    assert.match(migration, /v_requested_count > 50/)
    assert.match(hubPage, /deleteSiteDiariesInSafeBatches\(supabase, deleteIds\)/)
  })

  it('does not send more than 50 ids in any individual delete_site_diaries call', async () => {
    const supabase = fakeSupabase()
    await assert.rejects(
      () => deleteSiteDiaries(supabase, Array.from({ length: 51 }, (_, i) => `id-${i}`)),
      /50/,
    )
    assert.equal(supabase.calls.rpc.length, 0)
  })

  it('splits 83 deletes into 50 + 33 through the existing helper', async () => {
    const ids = Array.from({ length: 83 }, (_, i) => `id-${i}`)
    const first = ids.slice(0, 50)
    const second = ids.slice(50)
    const supabase = fakeSupabase({
      rpcResults: {
        delete_site_diaries: [
          { data: { deletedIds: first, cleanupJobs: [] }, error: null },
          { data: { deletedIds: second, cleanupJobs: [] }, error: null },
        ],
      },
    })
    const result = await deleteSiteDiariesInSafeBatches(supabase, ids)
    assert.equal(result.ok, true)
    assert.equal(result.deletedIds.length, 83)
    const calls = supabase.calls.rpc.filter((call) => call.name === 'delete_site_diaries')
    assert.equal(calls.length, 2)
    assert.equal(calls[0].args.p_report_ids.length, 50)
    assert.equal(calls[1].args.p_report_ids.length, 33)
    assert.ok(calls.every((call) => call.args.p_report_ids.length <= 50))
    const sent = calls.flatMap((call) => call.args.p_report_ids)
    assert.equal(new Set(sent).size, sent.length)
  })

  it('does not claim full success when a later delete chunk fails', async () => {
    const ids = Array.from({ length: 83 }, (_, i) => `id-${i}`)
    const first = ids.slice(0, 50)
    const supabase = fakeSupabase({
      rpcResults: {
        delete_site_diaries: [
          { data: { deletedIds: first, cleanupJobs: [] }, error: null },
          { data: null, error: { message: 'One or more saved diaries could not be deleted' } },
        ],
      },
    })
    const result = await deleteSiteDiariesInSafeBatches(supabase, ids)
    assert.equal(result.ok, false)
    assert.deepEqual(result.deletedIds, first)
    assert.deepEqual(result.remainingIds, ids.slice(50))
    const confirm = hubPage.slice(
      hubPage.indexOf('const confirmDeleteSelected'),
      hubPage.indexOf('const remainingSavedDiaries'),
    )
    assert.match(confirm, /result\.remainingIds/)
    assert.match(confirm, /setSelectedIds\(new Set\(remaining\)\)/)
    assert.match(confirm, /setDeleteError/)
    assert.doesNotMatch(confirm, /while\s*\(/)
  })

  it('refills the first Saved Diaries page after confirmed deletion', () => {
    const confirm = hubPage.slice(
      hubPage.indexOf('const confirmDeleteSelected'),
      hubPage.indexOf('const remainingSavedDiaries'),
    )
    assert.match(confirm, /refreshSavedDiaryFirstPage/)
    const refresh = hubPage.slice(
      hubPage.indexOf('const refreshSavedDiaryFirstPage'),
      hubPage.indexOf('const loadMoreSavedDiaries'),
    )
    assert.match(refresh, /from: 0/)
    assert.match(refresh, /to: SAVED_DIARY_PAGE_SIZE - 1/)
    assert.match(refresh, /setTotalSavedDiaryCount/)
  })

  it('keeps opened-diary Delete Diary independent of bulk selection', () => {
    assert.match(viewerPage, /confirmDeleteDiary/)
    assert.match(viewerPage, /count=\{1\}/)
    assert.match(viewerPage, /deleteSiteDiaries\(supabase, \[view\.reportId\]\)/)
    assert.doesNotMatch(viewerPage, /deleteSiteDiariesInSafeBatches/)
    assert.doesNotMatch(viewerPage, /BULK_SAVED_DIARY_DELETE_LABELS/)
    assert.doesNotMatch(hubPage, /confirmDeleteDiary/)
  })

  it('skips already-confirmed deleted ids if a later chunk is attempted', async () => {
    assert.match(helper, /chunk\.filter\(\(id\) => !seen\.has\(id\)\)/)
    const ids = Array.from({ length: 83 }, (_, i) => `id-${i}`)
    const first = ids.slice(0, 50)
    const supabase = fakeSupabase({
      rpcResults: {
        delete_site_diaries: [
          { data: { deletedIds: first, cleanupJobs: [] }, error: null },
          { data: null, error: { message: 'One or more saved diaries could not be deleted' } },
        ],
      },
    })
    const result = await deleteSiteDiariesInSafeBatches(supabase, ids)
    const sent = supabase.calls.rpc
      .filter((call) => call.name === 'delete_site_diaries')
      .flatMap((call) => call.args.p_report_ids)
    assert.equal(new Set(sent).size, sent.length)
    assert.ok(result.remainingIds.every((id) => !result.deletedIds.includes(id)))
    assert.ok(result.deletedIds.every((id) => !result.remainingIds.includes(id)))
  })
})
