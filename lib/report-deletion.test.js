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

/**
 * Parses the saved-diary stylesheet into selector -> declarations so stacking
 * can be reasoned about as real CSS rather than matched as source text.
 */
function savedDiaryStyleRules(source) {
  const opener = 'const savedDiaryListCss = `'
  const start = source.indexOf(opener) + opener.length
  const sheet = source
    .slice(start, source.indexOf('\n`', start))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // `${DIARY_ACCENT}` braces would be read as rule boundaries.
    .replace(/\$\{[^}]*\}/g, 'ACCENT')
  const base = sheet.includes('@media') ? sheet.slice(0, sheet.indexOf('@media')) : sheet
  const rules = new Map()
  for (const [, selectorList, body] of base.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = {}
    for (const declaration of body.split(';')) {
      const split = declaration.indexOf(':')
      if (split < 0) continue
      declarations[declaration.slice(0, split).trim()] = declaration.slice(split + 1).trim()
    }
    for (const selector of selectorList.split(',')) {
      const key = selector.trim()
      if (key) rules.set(key, { ...(rules.get(key) || {}), ...declarations })
    }
  }
  return rules
}

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
    assert.match(viewerPage, /ReportDeletionDialog/)
    assert.match(viewerPage, /if \(deleting \|\| !view\?\.reportId\) return/)
    assert.match(viewerPage, /setDeleteOpen\(true\)/)
    assert.match(projectPage, /requestDeleteDiary/)
    assert.doesNotMatch(hubPage, /window\.confirm/)
    assert.doesNotMatch(projectPage, /window\.confirm/)
  })

  it('saved list has no row actions; confirmed Delete lives on the opened diary', () => {
    assert.doesNotMatch(hubPage, /Open to review/)
    assert.doesNotMatch(hubPage, /Use for Today/)
    assert.doesNotMatch(hubPage, /requestDeleteDiary/)
    assert.doesNotMatch(hubPage, /confirmDeleteDiary/)
    assert.doesNotMatch(hubPage, /ReportDeletionDialog/)
    assert.doesNotMatch(hubPage, /selectionMode/)
    assert.doesNotMatch(hubPage, /Select All/)
    assert.doesNotMatch(hubPage, /type="checkbox"/)
    assert.match(viewerPage, /Delete Diary/)
    assert.match(viewerPage, /setDeleteOpen\(true\)/)
    assert.match(viewerPage, /confirmDeleteDiary/)
    assert.match(viewerPage, /deleteSiteDiaries/)
  })

  it('renders compact mobile-safe rows instead of dashboard cards', () => {
    assert.match(hubPage, /className="zlog-saved-diary-list"/)
    assert.match(hubPage, /data-saved-diary-row/)
    assert.doesNotMatch(hubPage, /<RecentEntryCard/)
    assert.match(hubPage, /zlog-saved-diary-project/)
    assert.match(hubPage, /\{reportDate\} · Shift: \{shift\}/)
    assert.match(hubPage, /zlog-saved-diary-summary/)
    assert.match(hubPage, /grid-template-columns: minmax\(0, 1fr\)/)
    assert.doesNotMatch(hubPage, /grid-template-columns: minmax\(0, 1fr\) auto/)
    assert.match(hubPage, /max-width: 100%/)
    assert.match(hubPage, /min-width: 0/)
    assert.match(hubPage, /overflow-x: clip/)
    assert.match(hubPage, /min-height: 72px/)
  })

  it('keeps a sticky contextual pane without a Select browsing control', () => {
    assert.match(hubPage, /data-sticky-manage-bar/)
    assert.match(hubPage, /position: sticky/)
    assert.match(hubPage, /\.zlog-saved-diary-manage-dock \{[^}]*top: 0;/)
    assert.doesNotMatch(hubPage, /position: fixed/)
    assert.match(hubPage, /Tap a diary to open and review it\./)
    assert.match(hubPage, /ZlogBackControl/)
    assert.doesNotMatch(hubPage, /selectedIds/)
    assert.doesNotMatch(hubPage, /zlog-saved-diary-row--selected/)
    assert.doesNotMatch(hubPage, /Select All/)
    assert.doesNotMatch(hubPage, /data-selection-mode/)
  })

  it('does not keep a selected-row or checkbox treatment on the browsing list', () => {
    assert.doesNotMatch(hubPage, /zlog-saved-diary-row--selected/)
    assert.doesNotMatch(hubPage, /zlog-saved-diary-select/)
    assert.doesNotMatch(hubPage, /zlog-saved-diary-checkbox/)
    assert.doesNotMatch(hubPage, /type="checkbox"/)
  })

  it('gives the sticky management bar an opaque background that hides scrolling rows', () => {
    const barRule = hubPage.slice(
      hubPage.indexOf('.zlog-saved-diary-manage-bar {'),
      hubPage.indexOf('.zlog-saved-diary-manage-bar::before {'),
    )
    assert.match(barRule, /background: #191b1f/)
    assert.doesNotMatch(barRule, /background-image:/)
    assert.doesNotMatch(barRule, /background[^;]*:[^;]*transparent/)
    assert.doesNotMatch(barRule, /background[^;]*:[^;]*color-mix/)
    assert.doesNotMatch(barRule, /rgba\(|opacity:|backdrop-filter/)
    assert.match(barRule, /padding: 8px/)
    assert.doesNotMatch(hubPage, /\.zlog-saved-diary-use \{/)
    assert.doesNotMatch(hubPage, /\.zlog-saved-diary-delete \{/)
  })

  it('carries the sticky offset on an opaque dock so no seam opens above the bar', () => {
    const dockRule = hubPage.slice(
      hubPage.indexOf('.zlog-saved-diary-manage-dock {'),
      hubPage.indexOf('.zlog-saved-diary-manage-bar {'),
    )
    assert.match(dockRule, /position: sticky/)
    // top must stay 0: any inset above the dock is a live strip that scrolling
    // rows show through, which reads as content bleeding into the pane.
    assert.match(dockRule, /top: 0;/)
    assert.doesNotMatch(dockRule, /top: [1-9]/)
    assert.match(dockRule, /padding: 16px 0 0/)
    assert.match(dockRule, /margin: -16px 0 8px/)
    assert.match(dockRule, /background: #0b0d12/)
    assert.match(dockRule, /z-index: 60/)
    assert.match(dockRule, /isolation: isolate/)
    assert.match(dockRule, /transform: translateZ\(0\)/)
    assert.match(hubPage, /className="zlog-saved-diary-manage-dock" data-sticky-manage-bar/)
    assert.doesNotMatch(hubPage, /\.zlog-saved-diary-manage-bar \{[^}]*position: sticky/)
  })

  it('paints an opaque fill inside the sticky compositor layer with the pane chrome', () => {
    const fillRule = hubPage.slice(
      hubPage.indexOf('.zlog-saved-diary-manage-bar::before {'),
      hubPage.indexOf('.zlog-saved-diary-manage-bar > * {'),
    )
    assert.match(fillRule, /position: absolute/)
    assert.match(fillRule, /inset: 0/)
    assert.match(fillRule, /background: #191b1f/)
    assert.match(fillRule, /z-index: 0/)
    assert.match(hubPage, /\.zlog-saved-diary-manage-bar > \* \{[^}]*z-index: 1/)
  })

  it('ranks the sticky dock above an isolated list, and no row escapes that layer', () => {
    const rules = savedDiaryStyleRules(hubPage)
    const dock = rules.get('.zlog-saved-diary-manage-dock')
    const list = rules.get('.zlog-saved-diary-list')
    const bar = rules.get('.zlog-saved-diary-manage-bar')

    // Upper layer: the sticky dock is positioned, isolated, and carries the
    // opaque paint on the same compositor layer as its chrome.
    assert.equal(dock.position, 'sticky')
    assert.equal(dock.background, '#0b0d12')
    assert.equal(dock.isolation, 'isolate')
    assert.equal(dock.transform, 'translateZ(0)')
    // Lower layer: the list is isolated, so a descendant stacking context is
    // ranked within the list instead of competing with the dock.
    assert.equal(list.position, 'relative')
    assert.equal(list.isolation, 'isolate')
    assert.ok(Number(dock['z-index']) > Number(list['z-index']))

    // The pane stays inside the dock's layer. relative is only for the fill.
    assert.equal(bar.position, 'relative')
    assert.equal(bar.isolation, 'isolate')
    assert.equal(bar.background, '#191b1f')
    assert.equal(bar['z-index'], undefined)

    for (const [selector, declarations] of rules) {
      if (!/^\.zlog-saved-diary-(row|open|project|meta|summary)/.test(selector)) {
        continue
      }
      for (const property of ['z-index', 'transform', 'will-change', 'filter', 'opacity']) {
        if (property === 'opacity' && selector.includes(':disabled')) continue
        assert.equal(
          declarations[property],
          undefined,
          `${selector} must not declare ${property}: it would create a layer competing with the sticky dock`,
        )
      }
      assert.ok(
        declarations.position === undefined || declarations.position === 'static',
        `${selector} must stay unpositioned so it cannot paint above the sticky dock`,
      )
    }
  })

  it('keeps the sticky pane for context and does not expose Select', () => {
    const barStart = hubPage.indexOf('className="zlog-saved-diary-manage-dock"')
    const barMarkup = hubPage.slice(barStart, hubPage.indexOf('{loading &&', barStart))
    assert.ok(barStart > 0, 'saved list renders the shared sticky management bar')
    assert.equal(hubPage.split('zlog-saved-diary-manage-bar"').length - 1, 1)
    assert.match(barMarkup, /data-sticky-manage-bar/)
    assert.match(barMarkup, /zlog-saved-diary-toolbar/)
    assert.match(barMarkup, /Tap a diary to open and review it\./)
    assert.match(barMarkup, /ZlogBackControl/)
    assert.doesNotMatch(barMarkup, /data-selection-mode/)
    assert.doesNotMatch(barMarkup, /selectionMode/)
    assert.doesNotMatch(barMarkup, /Select All/)
    assert.doesNotMatch(barMarkup, />\s*Select\s*</)
    assert.doesNotMatch(hubPage, /zlog-saved-diary-selection-bar/)
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
