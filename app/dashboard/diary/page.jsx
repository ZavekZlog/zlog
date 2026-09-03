'use client'

/**
 * Site Diary entry hub — two equal choices.
 * A) Start a New Diary → setup
 * B) View Saved Diaries → compact browsing list; tapping a row opens that
 *    saved diary in the read-only viewer. Management actions live there.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  ZlogModulePageHeader,
  ZlogBackControl,
  ModuleHomeCard,
  SecondaryButton,
  DestructiveButton,
  dashboardCardInteractionCss,
} from '@/lib/premium-ui'
import { ReportDeletionDialog } from '@/components/report-management/ReportDeletionDialog'
import { REPORT_THEMES } from '@/lib/report-theme'
import {
  DIARY_MISSING_MESSAGE,
  savedDiaryViewerHref,
} from '@/lib/diary-routing'
import { clearSetupFormDraft } from '@/lib/report-setup'
import {
  BULK_SAVED_DIARY_DELETE_LABELS,
  deleteSiteDiariesInSafeBatches,
  savedReportListHref,
  selectedReportsCountLabel,
  toggleReportSelection,
} from '@/lib/report-deletion'

const DIARY_ACCENT = REPORT_THEMES.diary.accent
const SAVED_DIARY_PAGE_SIZE = 50
const SAVED_DIARY_ID_PAGE_SIZE = 1000
const SAVED_DIARY_LIST_COLUMNS =
  'id, project_id, report_date, shift, site_summary, projects(id, name)'

/**
 * Peer cards in one group share a height — the tallest copy sets the row, so
 * neither card has to lose useful words to stay level with its neighbour.
 * Mirrors the dashboard grid rules without reaching into the shared shell.
 */
const entryChoiceCardsCss = `
  .zlog-diary-entry-choices > .premium-dash-card-wrap {
    display: flex;
    height: 100%;
    min-width: 0;
  }
  .zlog-diary-entry-choices > .premium-dash-card-wrap > .premium-dash-card {
    flex: 1 1 auto;
    height: 100%;
    box-sizing: border-box;
  }
`

const savedDiaryListCss = `
  .zlog-saved-diary-manage-dock,
  .zlog-saved-diary-manage-bar,
  .zlog-saved-diary-toolbar,
  .zlog-saved-diary-list,
  .zlog-saved-diary-row,
  .zlog-saved-diary-row * {
    box-sizing: border-box;
  }
  .zlog-saved-diary-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .zlog-saved-diary-toolbar--selecting {
    display: grid;
    grid-template-columns: auto minmax(min-content, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 8px;
  }
  .zlog-saved-diary-count {
    flex: 1 0 auto;
    min-width: min-content;
    margin: 0;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.4;
    white-space: nowrap;
  }
  .zlog-saved-diary-toolbar--selecting .zlog-saved-diary-count {
    grid-column: 2;
    grid-row: 1;
    text-align: center;
  }
  .zlog-saved-diary-toolbar-cancel {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }
  .zlog-saved-diary-toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }
  .zlog-saved-diary-toolbar--selecting .zlog-saved-diary-toolbar-actions {
    grid-column: 1 / -1;
    grid-row: 2;
    flex-wrap: nowrap;
    justify-content: stretch;
  }
  .zlog-saved-diary-toolbar--selecting .zlog-saved-diary-toolbar-actions > * {
    flex: 1 1 auto;
  }
  .zlog-saved-diary-list {
    /* Traps the whole list in one layer at z-index 0: isolate means a row,
       control or pseudo-element that creates its own stacking context is
       ranked inside the list, never against the sticky dock above it. */
    position: relative;
    z-index: 0;
    isolation: isolate;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: clip;
    border-top: 1px solid var(--edge);
  }
  .zlog-saved-diary-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    width: 100%;
    min-width: 0;
    border-bottom: 1px solid var(--edge);
    background: color-mix(in srgb, var(--plate) 62%, transparent);
  }
  .zlog-saved-diary-row + .zlog-saved-diary-row {
    margin-top: 1px;
  }
  .zlog-saved-diary-open {
    width: 100%;
    min-width: 0;
    min-height: 72px;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    display: block;
    padding: 10px 8px 10px 2px;
    cursor: pointer;
  }
  .zlog-saved-diary-open:hover {
    background: color-mix(in srgb, rgb(${DIARY_ACCENT}) 8%, transparent);
  }
  .zlog-saved-diary-open:active {
    background: color-mix(in srgb, rgb(${DIARY_ACCENT}) 14%, transparent);
  }
  .zlog-saved-diary-open:focus-visible {
    outline: 3px solid color-mix(in srgb, rgb(${DIARY_ACCENT}) 72%, white);
    outline-offset: -3px;
  }
  .zlog-saved-diary-open--selecting {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
  }
  .zlog-saved-diary-check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-height: 22px;
  }
  .zlog-saved-diary-check input {
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: rgb(${DIARY_ACCENT});
    pointer-events: none;
  }
  .zlog-saved-diary-project {
    display: block;
    min-width: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .zlog-saved-diary-meta {
    display: block;
    min-width: 0;
    margin-top: 2px;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .zlog-saved-diary-summary {
    display: -webkit-box;
    min-width: 0;
    margin-top: 3px;
    overflow: hidden;
    color: color-mix(in srgb, var(--text) 82%, var(--text-2));
    font-size: 13px;
    line-height: 1.3;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  /* Sticks flush to the scrollport and carries the 16px inset as its own opaque
     padding. A non-zero top offset would leave that inset live, and rows scrolling
     through it read as content bleeding into the pane. The negative margin
     cancels the padding, so flow position is unchanged and the bar still sits
     16px below the scrollport top once stuck.
     translateZ(0) holds the pane and its chrome on one compositor layer. */
  .zlog-saved-diary-manage-dock {
    position: sticky;
    top: 0;
    z-index: 60;
    isolation: isolate;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    width: 100%;
    max-width: 100%;
    margin: -16px 0 8px;
    padding: 16px 0 0;
    background: #0b0d12;
  }
  /* One sticky contextual pane above the list. Literal opaque fill only —
     no color-mix, gradient, or CSS variable in the background. */
  .zlog-saved-diary-manage-bar {
    position: relative;
    isolation: isolate;
    width: 100%;
    max-width: 100%;
    padding: 8px;
    border: 1px solid color-mix(in srgb, rgb(${DIARY_ACCENT}) 40%, var(--edge));
    border-radius: 11px;
    background: #191b1f;
    box-shadow:
      0 1px 0 color-mix(in srgb, rgb(${DIARY_ACCENT}) 30%, var(--edge)),
      0 10px 18px color-mix(in srgb, var(--ink) 88%, transparent);
  }
  .zlog-saved-diary-manage-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    background: #191b1f;
    pointer-events: none;
  }
  .zlog-saved-diary-manage-bar > * {
    position: relative;
    z-index: 1;
  }
  @media (max-width: 390px) {
    .zlog-saved-diary-open {
      padding-right: 8px;
    }
  }
`

const IconNewDiary = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path d="M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
)

const IconSavedDiaries = <Eye size={22} strokeWidth={1.75} aria-hidden="true" />

function formatReportDate(iso) {
  if (!iso) return 'No date'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function savedDiariesListCountLabel(total) {
  const count = Number(total) || 0
  return count === 1 ? '1 saved diary' : `${count} saved diaries`
}

function savedDiariesSelectAllLabel(selectedCount, total) {
  if (selectedCount > 0 && total > 0 && selectedCount === total) return 'Clear'
  return 'Select All'
}

function savedDiariesLoadMoreLabel() {
  return 'Load more diaries'
}

function applySavedDiaryListFilter(query, { filterProjectId, mode }) {
  // View Saved Diaries is cross-project; only project-scoped hub entry uses ?project=.
  if (filterProjectId && mode !== 'saved') {
    return query.eq('project_id', filterProjectId)
  }
  return query
}

function buildSavedDiaryListQuery(supabase, { from, to, filterProjectId, mode }) {
  return applySavedDiaryListFilter(
    supabase
      .from('daily_reports')
      .select(SAVED_DIARY_LIST_COLUMNS, { count: 'exact' })
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
    { filterProjectId, mode },
  )
}

function buildSavedDiaryIdQuery(supabase, { from, to, filterProjectId, mode }) {
  return applySavedDiaryListFilter(
    supabase
      .from('daily_reports')
      .select('id', { count: 'exact' })
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
    { filterProjectId, mode },
  )
}

async function fetchAllSavedDiaryIds(supabase, { filterProjectId, mode }) {
  const ids = []
  const seen = new Set()
  let from = 0
  for (;;) {
    const { data, error, count } = await buildSavedDiaryIdQuery(supabase, {
      from,
      to: from + SAVED_DIARY_ID_PAGE_SIZE - 1,
      filterProjectId,
      mode,
    })
    if (error) throw error
    const page = (data || []).map((row) => String(row?.id || '').trim()).filter(Boolean)
    for (const id of page) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    if (page.length < SAVED_DIARY_ID_PAGE_SIZE) break
    if (typeof count === 'number' && ids.length >= count) break
    if (!page.length) break
    from += page.length
  }
  return ids
}

function SiteDiaryEntryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterProjectId = searchParams.get('project') || null
  const missingReport = searchParams.get('missing') === '1'
  // One client for this mounted page. createClient() is a new object each
  // render; putting that in the reports-load effect would reload the list.
  const supabase = useMemo(() => createClient(), [])
  const openingSavedDiaryRef = useRef(false)

  const [mode, setMode] = useState(() => (
    searchParams.get('view') === 'saved' ? 'saved' : null
  )) // null | 'previous' | 'saved'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => (missingReport ? DIARY_MISSING_MESSAGE : ''))
  const [reports, setReports] = useState([])
  const [totalSavedDiaryCount, setTotalSavedDiaryCount] = useState(0)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleteIds, setDeleteIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)

  const title = useMemo(() => {
    if (mode === 'previous') return 'Use a Previous Diary'
    if (mode === 'saved') return 'View Saved Diaries'
    return 'Site Diary'
  }, [mode])

  useEffect(() => {
    if (mode === 'saved' && filterProjectId) {
      if (openingSavedDiaryRef.current) return
      router.replace(savedReportListHref())
    }
  }, [filterProjectId, mode, router])

  useEffect(() => {
    if (mode !== 'previous' && mode !== 'saved') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError((prev) => (prev === DIARY_MISSING_MESSAGE ? prev : ''))
      try {
        const { data, error: qErr, count } = await buildSavedDiaryListQuery(supabase, {
          from: 0,
          to: SAVED_DIARY_PAGE_SIZE - 1,
          filterProjectId,
          mode,
        })
        if (qErr) throw qErr
        if (!cancelled) {
          const nextReports = data || []
          setReports(nextReports)
          setTotalSavedDiaryCount(
            typeof count === 'number' ? count : nextReports.length,
          )
          const validIds = new Set(nextReports.map((row) => row?.id).filter(Boolean))
          setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))))
        }
      } catch {
        if (!cancelled) {
          setError('We couldn’t load your diaries. Check your connection and try again.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, filterProjectId, supabase])

  const openExistingReport = (row) => {
    if (selectionMode) return
    const href = savedDiaryViewerHref(row?.project_id, row?.id)
    if (!href) {
      setError('That diary can’t be opened. Try another one, or start a new diary.')
      return
    }
    // Read-only viewer for the exact saved report — one continuous document.
    // Never opens the compose workbench and never creates a row.
    openingSavedDiaryRef.current = true
    router.push(href)
  }

  const openSavedDiaries = () => {
    setError((prev) => (prev === DIARY_MISSING_MESSAGE ? prev : ''))
    setMode('saved')
    router.replace(savedReportListHref())
  }

  const startNewReport = () => {
    clearSetupFormDraft()
    const q = filterProjectId ? `?project=${filterProjectId}` : ''
    router.push(`/dashboard/diary/setup${q}`)
  }

  const leaveSavedList = () => {
    setMode(null)
    setSelectionMode(false)
    setSelectedIds(new Set())
    setDeleteIds([])
    setDeleteError('')
    setTotalSavedDiaryCount(0)
  }

  const enterSelectionMode = () => {
    setSelectionMode(true)
    setSelectedIds(new Set())
    setDeleteError('')
  }

  const exitSelectionMode = () => {
    if (deleting) return
    setSelectionMode(false)
    setSelectedIds(new Set())
    setDeleteIds([])
    setDeleteError('')
  }

  const toggleSelected = (reportId) => {
    setSelectedIds((current) => toggleReportSelection(current, reportId))
  }

  const selectAllVisible = async () => {
    if (deleting || selectingAll) return
    if (selectedIds.size > 0 && selectedIds.size === totalSavedDiaryCount) {
      setSelectedIds(new Set())
      return
    }
    setSelectingAll(true)
    setError((prev) => (prev === DIARY_MISSING_MESSAGE ? prev : ''))
    try {
      const ids = await fetchAllSavedDiaryIds(supabase, { filterProjectId, mode })
      setSelectedIds(new Set(ids))
    } catch {
      setError('We couldn’t select all diaries. Check your connection and try again.')
    } finally {
      setSelectingAll(false)
    }
  }

  const refreshSavedDiaryFirstPage = async () => {
    const { data, error: qErr, count } = await buildSavedDiaryListQuery(supabase, {
      from: 0,
      to: SAVED_DIARY_PAGE_SIZE - 1,
      filterProjectId,
      mode,
    })
    if (qErr) throw qErr
    const nextReports = data || []
    setReports(nextReports)
    setTotalSavedDiaryCount(
      typeof count === 'number' ? count : nextReports.length,
    )
  }

  const loadMoreSavedDiaries = async () => {
    if (loading || loadingMore || deleting) return
    if (reports.length >= totalSavedDiaryCount) return
    setLoadingMore(true)
    setError((prev) => (prev === DIARY_MISSING_MESSAGE ? prev : ''))
    try {
      const from = reports.length
      const { data, error: qErr, count } = await buildSavedDiaryListQuery(supabase, {
        from,
        to: from + SAVED_DIARY_PAGE_SIZE - 1,
        filterProjectId,
        mode,
      })
      if (qErr) throw qErr
      const page = data || []
      setReports((current) => {
        const existing = new Set(current.map((row) => String(row?.id || '')).filter(Boolean))
        const appended = page.filter((row) => row?.id && !existing.has(String(row.id)))
        return appended.length ? [...current, ...appended] : current
      })
      if (typeof count === 'number') setTotalSavedDiaryCount(count)
    } catch {
      setError('We couldn’t load more diaries. Check your connection and try again.')
    } finally {
      setLoadingMore(false)
    }
  }

  const requestDeleteSelected = () => {
    if (selectedIds.size < 1 || deleting) return
    setDeleteError('')
    setDeleteIds([...selectedIds])
  }

  const confirmDeleteSelected = async () => {
    if (deleting || deleteIds.length < 1) return
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await deleteSiteDiariesInSafeBatches(supabase, deleteIds)
      const deleted = new Set((result.deletedIds || []).map(String))
      if (deleted.size) {
        try {
          await refreshSavedDiaryFirstPage()
        } catch {
          setReports((current) => current.filter((row) => !deleted.has(String(row.id))))
          setTotalSavedDiaryCount((current) => Math.max(0, current - deleted.size))
        }
      }
      if (result.ok) {
        setSelectedIds(new Set())
        setSelectionMode(false)
        setDeleteIds([])
        setDeleteError('')
      } else {
        const remaining = (result.remainingIds || []).map(String)
        setSelectedIds(new Set(remaining))
        setDeleteIds(remaining)
        setDeleteError(
          result.error
          || 'Some diaries could not be deleted. The remaining selected diaries were not removed.',
        )
      }
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure?.message || 'We couldn’t delete the selected diaries. Try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const remainingSavedDiaries = Math.max(0, totalSavedDiaryCount - reports.length)

  return (
    <PremiumShell
      hideModuleNav
      accent={DIARY_ACCENT}
      maxWidth={560}
    >
      <style>{dashboardCardInteractionCss}</style>
      <style>{entryChoiceCardsCss}</style>
      <style>{savedDiaryListCss}</style>

      <ZlogModulePageHeader
        title={title}
        backHref={mode ? undefined : '/dashboard'}
      />

      {error && (
        <div
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      {mode === null && (
        <div
          className="zlog-diary-entry-choices"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          <div className="premium-dash-card-wrap" style={{ animationDelay: '0ms' }}>
            <ModuleHomeCard
              title="Start a New Diary"
              description="Start a fresh diary with your saved details ready."
              icon={IconNewDiary}
              accent={DIARY_ACCENT}
              onClick={startNewReport}
              style={{ minHeight: 0, height: '100%', padding: '8px 12px 8px' }}
            />
          </div>
          <div className="premium-dash-card-wrap" style={{ animationDelay: '70ms' }}>
            <ModuleHomeCard
              title="View Saved Diaries"
              description="Review past diaries or choose one to continue your next."
              icon={IconSavedDiaries}
              accent={DIARY_ACCENT}
              onClick={openSavedDiaries}
              style={{ minHeight: 0, height: '100%', padding: '8px 12px 8px' }}
            />
          </div>
        </div>
      )}

      {(mode === 'previous' || mode === 'saved') && (
        <>
          <div className="zlog-saved-diary-manage-dock" data-sticky-manage-bar>
            <div
              className="zlog-saved-diary-manage-bar"
              aria-label={selectionMode ? 'Saved diary selection' : 'Saved diary navigation'}
              data-selection-mode={selectionMode ? 'true' : undefined}
            >
              <div
                className={
                  selectionMode
                    ? 'zlog-saved-diary-toolbar zlog-saved-diary-toolbar--selecting'
                    : 'zlog-saved-diary-toolbar'
                }
              >
                <ZlogBackControl onClick={leaveSavedList} />
                {selectionMode ? (
                  <>
                    <p className="zlog-saved-diary-count">
                      {selectedReportsCountLabel(selectedIds.size)}
                    </p>
                    <SecondaryButton
                      type="button"
                      disabled={deleting}
                      onClick={exitSelectionMode}
                      className="zlog-saved-diary-toolbar-cancel"
                      style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                    >
                      Cancel
                    </SecondaryButton>
                    <div className="zlog-saved-diary-toolbar-actions">
                      <SecondaryButton
                        type="button"
                        disabled={totalSavedDiaryCount < 1 || deleting || selectingAll}
                        onClick={selectAllVisible}
                        style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                      >
                        {savedDiariesSelectAllLabel(selectedIds.size, totalSavedDiaryCount)}
                      </SecondaryButton>
                      <DestructiveButton
                        type="button"
                        disabled={selectedIds.size < 1 || deleting}
                        onClick={requestDeleteSelected}
                        style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                      >
                        Delete Selected
                      </DestructiveButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="zlog-saved-diary-count">
                      {savedDiariesListCountLabel(totalSavedDiaryCount)}
                    </p>
                    {mode === 'saved' && !loading && reports.length > 0 ? (
                      <SecondaryButton
                        type="button"
                        onClick={enterSelectionMode}
                        style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                      >
                        Select
                      </SecondaryButton>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {loading && <p style={{ color: 'var(--text-2)' }}>Loading your diaries…</p>}

          {!loading && reports.length === 0 && totalSavedDiaryCount < 1 && (
            <div style={{ padding: '8px 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
              No saved Site Diaries yet{filterProjectId && mode !== 'saved' ? ' for this project' : ''}.
              <div style={{ marginTop: 14 }}>
                <SecondaryButton type="button" onClick={startNewReport}>
                  Start a New Diary
                </SecondaryButton>
              </div>
            </div>
          )}

          {!loading && reports.length > 0 ? (
            <div
              className="zlog-saved-diary-list"
              role="list"
              aria-label="Saved Site Diaries"
            >
              {reports.map((row) => {
                const projectName = row.projects?.name || 'Project'
                const reportDate = formatReportDate(row.report_date)
                const shift = row.shift || '—'
                const summary = (row.site_summary || '').trim()
                const selected = selectedIds.has(row.id)
                return (
                  <div
                    key={row.id}
                    className="zlog-saved-diary-row"
                    role="listitem"
                    data-saved-diary-row
                    data-selected={selectionMode && selected ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      className={
                        selectionMode
                          ? 'zlog-saved-diary-open zlog-saved-diary-open--selecting'
                          : 'zlog-saved-diary-open'
                      }
                      onClick={() => {
                        if (selectionMode) {
                          toggleSelected(row.id)
                          return
                        }
                        openExistingReport(row)
                      }}
                      aria-pressed={selectionMode ? selected : undefined}
                      aria-label={
                        selectionMode
                          ? `${selected ? 'Deselect' : 'Select'} ${projectName}, ${reportDate}`
                          : `${projectName}, ${reportDate}, shift ${shift}. Tap to open and review.`
                      }
                    >
                      {selectionMode ? (
                        <span className="zlog-saved-diary-check">
                          <input
                            type="checkbox"
                            checked={selected}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                        </span>
                      ) : null}
                      <span>
                        <span className="zlog-saved-diary-project">{projectName}</span>
                        <span className="zlog-saved-diary-meta">
                          {reportDate} · Shift: {shift}
                        </span>
                        {summary ? (
                          <span className="zlog-saved-diary-summary">{summary}</span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}

          {!loading && remainingSavedDiaries > 0 ? (
            <div style={{ padding: '10px 0 16px' }}>
              <SecondaryButton
                type="button"
                disabled={loadingMore || deleting}
                onClick={loadMoreSavedDiaries}
                style={{ minHeight: 44 }}
              >
                {savedDiariesLoadMoreLabel()}
              </SecondaryButton>
            </div>
          ) : null}
        </>
      )}

      <ReportDeletionDialog
        open={deleteIds.length > 0}
        count={deleteIds.length}
        busy={deleting}
        error={deleteError}
        labels={BULK_SAVED_DIARY_DELETE_LABELS}
        onCancel={() => {
          if (deleting) return
          setDeleteIds([])
          setDeleteError('')
        }}
        onConfirm={confirmDeleteSelected}
      />
    </PremiumShell>
  )
}

export default function SiteDiaryEntryRoute() {
  return (
    <Suspense
      fallback={
        <PremiumShell
          title="Site Diary"
          backHref="/dashboard"
          accent={DIARY_ACCENT}
          maxWidth={560}
        >
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiaryEntryPage />
    </Suspense>
  )
}
