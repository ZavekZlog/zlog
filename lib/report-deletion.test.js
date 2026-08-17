import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deleteReportActionLabel,
  deleteReportConfirmation,
  deleteSiteDiaries,
  normalizeReportIds,
  savedReportListHref,
  selectAllReports,
  toggleReportSelection,
} from './report-deletion.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260817070000_safe_site_diary_deletion.sql'),
  'utf8',
)
const helper = readFileSync(join(root, 'lib/report-deletion.js'), 'utf8')
const dialog = readFileSync(
  join(root, 'components/report-management/ReportDeletionDialog.jsx'),
  'utf8',
)
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const viewerPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
  'utf8',
)
const projectPage = readFileSync(join(root, 'app/dashboard/project/[id]/page.jsx'), 'utf8')

function fakeSupabase({ rpcResults = {}, storageError = null } = {}) {
  const calls = { rpc: [], storageRemove: [] }
  return {
    calls,
    async rpc(name, args) {
      calls.rpc.push({ name, args })
      const result = rpcResults[name]
      if (result) return result
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            calls.storageRemove.push({ bucket, paths })
            return { error: storageError }
          },
        }
      },
    },
  }
}

describe('saved-report deletion copy and selection', () => {
  it('uses count-aware action and confirmation copy', () => {
    assert.equal(deleteReportActionLabel(1), 'Delete Diary')
    assert.equal(deleteReportActionLabel(6), 'Delete 6 Diaries')
    assert.equal(deleteReportConfirmation(1), 'Permanently delete this saved diary?')
    assert.equal(deleteReportConfirmation(6), 'Permanently delete these 6 saved diaries?')
  })

  it('toggles one, selects all, and rejects empty or oversized batches', () => {
    const one = toggleReportSelection(new Set(), 'r1')
    assert.deepEqual([...one], ['r1'])
    assert.deepEqual([...toggleReportSelection(one, 'r1')], [])
    assert.deepEqual(
      [...selectAllReports([{ id: 'a' }, { id: 'b' }, { id: null }])],
      ['a', 'b'],
    )
    assert.throws(() => normalizeReportIds([]), /at least one/)
    assert.throws(() => normalizeReportIds(Array.from({ length: 51 }, (_, i) => `id-${i}`)), /50/)
    assert.deepEqual(normalizeReportIds(['a', 'a', 'b']), ['a', 'b'])
  })

  it('returns the saved-diary list after an opened-diary delete', () => {
    assert.equal(savedReportListHref(), '/dashboard/diary?view=saved')
    assert.equal(
      savedReportListHref({ projectId: 'proj-1' }),
      '/dashboard/diary?view=saved&project=proj-1',
    )
    assert.match(viewerPage, /savedReportListHref\(\)/)
  })
})

describe('deleteSiteDiaries client path', () => {
  it('deletes through the RPC first, then processes only returned Storage jobs', async () => {
    const supabase = fakeSupabase({
      rpcResults: {
        delete_site_diaries: {
          data: {
            deletedIds: ['r1', 'r2'],
            cleanupJobs: [
              { id: 'job-1', path: 'user/r1/cover.jpg' },
              { id: 'job-2', path: 'user/r1/photo.jpg' },
            ],
          },
          error: null,
        },
        mark_report_storage_cleanup: { data: 2, error: null },
      },
    })

    const result = await deleteSiteDiaries(supabase, ['r1', 'r2'])
    assert.equal(result.ok, true)
    assert.deepEqual(result.deletedIds, ['r1', 'r2'])
    assert.equal(result.cleanupPending, false)
    assert.equal(supabase.calls.rpc[0].name, 'delete_site_diaries')
    assert.deepEqual(supabase.calls.rpc[0].args.p_report_ids, ['r1', 'r2'])
    assert.deepEqual(supabase.calls.storageRemove, [{
      bucket: 'site-photos',
      paths: ['user/r1/cover.jpg', 'user/r1/photo.jpg'],
    }])
    assert.equal(supabase.calls.rpc[1].name, 'mark_report_storage_cleanup')
  })

  it('does not touch Storage when the RPC fails, and treats Storage failure as pending cleanup', async () => {
    const failing = fakeSupabase({
      rpcResults: {
        delete_site_diaries: { data: null, error: { message: 'One or more saved diaries could not be deleted' } },
      },
    })
    await assert.rejects(() => deleteSiteDiaries(failing, ['r1']), /could not be deleted/)
    assert.equal(failing.calls.storageRemove.length, 0)

    const pending = fakeSupabase({
      storageError: { message: 'storage timeout' },
      rpcResults: {
        delete_site_diaries: {
          data: {
            deletedIds: ['r1'],
            cleanupJobs: [{ id: 'job-1', path: 'user/r1/cover.jpg' }],
          },
          error: null,
        },
        mark_report_storage_cleanup: { data: 1, error: null },
      },
    })
    const result = await deleteSiteDiaries(pending, ['r1'])
    assert.equal(result.ok, true)
    assert.equal(result.cleanupPending, true)
    assert.equal(pending.calls.rpc[1].args.p_error, 'storage timeout')
  })
})

describe('confirmation dialog and surfaces', () => {
  it('requires Cancel and does not delete until confirm', () => {
    assert.match(dialog, /role="dialog"/)
    assert.match(dialog, />\s*Cancel\s*</)
    assert.match(dialog, /onConfirm/)
    assert.match(dialog, /onCancel/)
    assert.match(dialog, /This cannot be undone/)
    assert.match(hubPage, /ReportDeletionDialog/)
    assert.match(hubPage, /if \(deleting\) return/)
    assert.match(viewerPage, /setDeleteOpen\(true\)/)
    assert.match(projectPage, /requestDeleteDiary/)
    assert.doesNotMatch(hubPage, /window\.confirm/)
    assert.doesNotMatch(projectPage, /window\.confirm/)
  })

  it('saved list keeps Open to review / Use for Today and only shows checkboxes in Select mode', () => {
    assert.match(hubPage, /selectionMode \? 'Cancel selection' : 'Select'/)
    assert.match(hubPage, /Select All/)
    assert.match(hubPage, /type="checkbox"/)
    assert.match(hubPage, /mode === 'saved' && selectionMode/)
    assert.match(hubPage, /Open to review/)
    assert.match(hubPage, /Use for Today/)
    assert.match(hubPage, /setReports\(\(current\) => current\.filter/)
  })

  it('replaced the unsafe project-page sequential delete with the shared helper', () => {
    assert.match(projectPage, /deleteSiteDiaries/)
    assert.match(projectPage, /ReportDeletionDialog/)
    assert.doesNotMatch(projectPage, /from\('report_photos'\)/)
    assert.doesNotMatch(projectPage, /from\('report_labour'\)/)
    assert.doesNotMatch(projectPage, /from\('report_plant'\)/)
    assert.doesNotMatch(helper, /\.from\('daily_reports'\)[\s\S]*\.delete\(/)
    assert.match(helper, /rpc\('delete_site_diaries'/)
  })
})

describe('RPC / outbox source contract', () => {
  it('locks owned rows, rejects partial bulk deletes, and cascades children', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_site_diaries/)
    assert.match(migration, /SECURITY DEFINER/)
    assert.match(migration, /auth\.uid\(\)/)
    assert.match(migration, /v_requested_count > 50/)
    assert.match(migration, /FOR UPDATE OF dr/)
    assert.match(migration, /v_owned_count <> v_requested_count/)
    assert.match(migration, /DELETE FROM public\.daily_reports/)
    assert.match(migration, /ON DELETE CASCADE/)
    assert.doesNotMatch(migration, /DELETE FROM public\.projects/)
    assert.doesNotMatch(migration, /DELETE FROM public\.company_brandings/)
    assert.doesNotMatch(migration, /DELETE FROM public\.snags/)
  })

  it('queues only unreferenced report-owned Storage paths after DB deletion is prepared', () => {
    const queueIndex = migration.indexOf('INSERT INTO public.report_storage_cleanup_jobs')
    const deleteIndex = migration.indexOf('DELETE FROM public.daily_reports')
    assert.ok(queueIndex > 0 && deleteIndex > queueIndex)
    assert.match(migration, /LIKE v_user_id::text \|\| '\/%'/)
    assert.match(migration, /other\.cover_photo_url/)
    assert.match(migration, /other\.brand_logo_url/)
    assert.match(migration, /company_brandings/)
    assert.match(migration, /snags/)
    assert.match(migration, /site_survey_reports/)
    assert.match(migration, /weekly_progress_reports/)
    assert.match(migration, /weekly_hs_reports/)
    assert.match(helper, /storage[\s\S]*from\('site-photos'\)[\s\S]*remove/)
    assert.match(helper, /mark_report_storage_cleanup/)
  })
})
