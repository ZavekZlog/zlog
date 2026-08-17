'use client'

/**
 * Site Diary entry hub — two equal choices.
 * A) Start a New Diary → setup
 * B) View Saved Diaries → saved list; each entry offers Open to review
 *    (read-only viewer for that same report) and Use for Today
 *    (creates a NEW diary from it; the source is never changed).
 */

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  ZlogModulePageHeader,
  ModuleHomeCard,
  SecondaryButton,
  DestructiveButton,
  dashboardCardInteractionCss,
} from '@/lib/premium-ui'
import { ReportDeletionDialog } from '@/components/report-management/ReportDeletionDialog'
import { REPORT_THEMES } from '@/lib/report-theme'
import {
  DIARY_MISSING_MESSAGE,
  projectAndReportDetailsHref,
  savedDiaryViewerHref,
} from '@/lib/diary-routing'
import { createTodaysDiaryDraft } from '@/lib/diary-draft'
import { clearSetupFormDraft } from '@/lib/report-setup'
import {
  deleteReportActionLabel,
  deleteSiteDiaries,
  selectAllReports,
  toggleReportSelection,
} from '@/lib/report-deletion'

const DIARY_ACCENT = REPORT_THEMES.diary.accent

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
  .zlog-saved-diary-toolbar p {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    border-bottom: 1px solid var(--edge);
    background: color-mix(in srgb, var(--plate) 62%, transparent);
  }
  .zlog-saved-diary-row + .zlog-saved-diary-row {
    margin-top: 1px;
  }
  .zlog-saved-diary-open,
  .zlog-saved-diary-select {
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
  }
  .zlog-saved-diary-open {
    display: block;
    padding: 9px 10px 9px 2px;
    cursor: pointer;
  }
  .zlog-saved-diary-open:hover {
    background: color-mix(in srgb, rgb(${DIARY_ACCENT}) 8%, transparent);
  }
  .zlog-saved-diary-open:focus-visible,
  .zlog-saved-diary-use:focus-visible {
    outline: 3px solid color-mix(in srgb, rgb(${DIARY_ACCENT}) 72%, white);
    outline-offset: -3px;
  }
  /* Keyboard focus stays on the control, so a selected row never gains a
     bright rectangular perimeter around the whole record. */
  .zlog-saved-diary-checkbox:focus-visible {
    outline: 3px solid color-mix(in srgb, rgb(${DIARY_ACCENT}) 72%, white);
    outline-offset: 2px;
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
  .zlog-saved-diary-use {
    align-self: center;
    min-width: 104px;
    min-height: 44px;
    margin: 6px 2px 6px 0;
    padding: 7px 9px;
    border: 1px solid color-mix(in srgb, rgb(${DIARY_ACCENT}) 46%, var(--edge));
    border-radius: 9px;
    background: color-mix(in srgb, rgb(${DIARY_ACCENT}) 11%, var(--plate));
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
  }
  .zlog-saved-diary-use:disabled,
  .zlog-saved-diary-open:disabled {
    cursor: wait;
    opacity: 0.58;
  }
  /* One selected treatment everywhere: subdued purple fill plus a slim
     left-edge marker. No full perimeter outline. */
  .zlog-saved-diary-row--selected,
  .zlog-saved-diary-row--selected:hover {
    background: color-mix(in srgb, rgb(${DIARY_ACCENT}) 16%, var(--plate));
    border-bottom-color: color-mix(in srgb, rgb(${DIARY_ACCENT}) 26%, var(--edge));
    box-shadow: inset 4px 0 0 rgb(${DIARY_ACCENT});
    outline: none;
  }
  .zlog-saved-diary-select {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 9px 10px 9px 8px;
    cursor: pointer;
  }
  .zlog-saved-diary-checkbox {
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: rgb(${DIARY_ACCENT});
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
  /* One sticky management area serves both the normal and selection states,
     so Select stays reachable through a long list. Literal opaque fill only —
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
  .zlog-saved-diary-selection-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .zlog-saved-diary-selected-count {
    flex: 1 1 auto;
    min-width: 64px;
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.25;
  }
  .zlog-saved-diary-selection-actions button {
    width: auto;
    min-height: 44px;
    padding: 7px 10px;
    white-space: normal;
  }
  @media (max-width: 390px) {
    .zlog-saved-diary-open {
      padding-right: 8px;
    }
    .zlog-saved-diary-use {
      min-width: 96px;
      padding-inline: 7px;
    }
    .zlog-saved-diary-selection-actions {
      flex-wrap: wrap;
    }
    .zlog-saved-diary-selected-count {
      flex-basis: 100%;
    }
    .zlog-saved-diary-selection-actions button {
      flex: 1 1 88px;
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

function SiteDiaryEntryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterProjectId = searchParams.get('project') || null
  const missingReport = searchParams.get('missing') === '1'
  const supabase = createClient()

  const [mode, setMode] = useState(() => (
    searchParams.get('view') === 'saved' ? 'saved' : null
  )) // null | 'previous' | 'saved'
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [error, setError] = useState(() => (missingReport ? DIARY_MISSING_MESSAGE : ''))
  const [reports, setReports] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleteIds, setDeleteIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')

  const title = useMemo(() => {
    if (mode === 'previous') return 'Use a Previous Diary'
    if (mode === 'saved') return 'View Saved Diaries'
    return 'Site Diary'
  }, [mode])

  useEffect(() => {
    if (missingReport) setError(DIARY_MISSING_MESSAGE)
  }, [missingReport])

  useEffect(() => {
    if (mode !== 'previous' && mode !== 'saved') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError((prev) => (prev === DIARY_MISSING_MESSAGE ? prev : ''))
      try {
        let query = supabase
          .from('daily_reports')
          .select('id, project_id, report_date, shift, site_summary, projects(id, name)')
          .order('report_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(50)

        if (filterProjectId) {
          query = query.eq('project_id', filterProjectId)
        }

        const { data, error: qErr } = await query
        if (qErr) throw qErr
        if (!cancelled) setReports(data || [])
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
    const href = savedDiaryViewerHref(row?.project_id, row?.id)
    if (!href) {
      setError('That diary can’t be opened. Try another one, or start a new diary.')
      return
    }
    // Read-only viewer for the exact saved report — one continuous document.
    // Never opens the compose workbench and never creates a row.
    router.push(href)
  }

  const requestUsePreviousForToday = (row) => {
    if (!row?.project_id || !row?.id || busyId) return
    setError('')
    setConfirmRow(row)
  }

  const cancelUsePreviousForToday = () => {
    if (busyId) return
    setConfirmRow(null)
  }

  const confirmUsePreviousForToday = async () => {
    const row = confirmRow
    if (!row?.project_id || !row?.id || busyId) return
    setBusyId(row.id)
    setError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, row.project_id, row.id)
      // Review the carried-forward details for today's new diary before the workbench.
      const href = projectAndReportDetailsHref(row.project_id, id)
      if (!href) throw new Error('Missing diary link')
      setConfirmRow(null)
      router.push(href)
    } catch (err) {
      setError(err?.message || 'We couldn’t start today’s diary from that one. Try again.')
      setBusyId(null)
    }
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
    setDeleteStatus('')
  }

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current)
    setSelectedIds(new Set())
    setDeleteError('')
    setDeleteStatus('')
  }

  const toggleSelected = (reportId) => {
    setSelectedIds((current) => toggleReportSelection(current, reportId))
  }

  const selectAllVisible = () => {
    setSelectedIds(selectAllReports(reports))
  }

  const requestDeleteSelected = () => {
    if (selectedIds.size < 1) return
    setDeleteError('')
    setDeleteIds([...selectedIds])
  }

  const confirmDeleteSelected = async () => {
    if (deleting || deleteIds.length < 1) return
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await deleteSiteDiaries(supabase, deleteIds)
      const deleted = new Set(result.deletedIds)
      setReports((current) => current.filter((row) => !deleted.has(String(row.id))))
      setSelectedIds(new Set())
      setSelectionMode(false)
      setDeleteIds([])
      setDeleteStatus(
        result.cleanupPending
          ? 'Selected diaries were deleted. Some report files are queued for cleanup.'
          : '',
      )
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure?.message || 'We couldn’t delete the selected diaries. Try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PremiumShell
      hideModuleNav
      accent={DIARY_ACCENT}
      maxWidth={560}
      /* Entry hub only: tighten air below wordmark (~25%); keep pad-top / logo size. */
      brandRegionStyle={{ paddingBottom: 30 }}
    >
      <style>{dashboardCardInteractionCss}</style>
      <style>{entryChoiceCardsCss}</style>
      <style>{savedDiaryListCss}</style>

      <ZlogModulePageHeader
        title={title}
        backHref={mode ? undefined : '/dashboard'}
        onBack={mode ? leaveSavedList : undefined}
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
              onClick={() => setMode('saved')}
              style={{ minHeight: 0, height: '100%', padding: '8px 12px 8px' }}
            />
          </div>
        </div>
      )}

      {(mode === 'previous' || mode === 'saved') && (
        <>
          {mode === 'saved' && !loading && reports.length > 0 ? (
            <div className="zlog-saved-diary-manage-dock" data-sticky-manage-bar>
              <div
                className="zlog-saved-diary-manage-bar"
                data-selection-mode={selectionMode ? 'on' : 'off'}
                aria-label={
                  selectionMode ? 'Saved diary selection actions' : 'Saved diary actions'
                }
              >
                {selectionMode ? (
                  <div className="zlog-saved-diary-selection-actions">
                    <span
                      className="zlog-saved-diary-selected-count"
                      role="status"
                      aria-live="polite"
                    >
                      {selectedIds.size}{' '}
                      {selectedIds.size === 1 ? 'diary selected' : 'diaries selected'}
                    </span>
                    <SecondaryButton
                      type="button"
                      disabled={deleting}
                      onClick={toggleSelectionMode}
                    >
                      Cancel
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      disabled={reports.length < 1 || selectedIds.size === reports.length || deleting}
                      onClick={selectAllVisible}
                    >
                      Select All
                    </SecondaryButton>
                    <DestructiveButton
                      type="button"
                      disabled={selectedIds.size < 1 || deleting}
                      onClick={requestDeleteSelected}
                    >
                      {deleteReportActionLabel(selectedIds.size)}
                    </DestructiveButton>
                  </div>
                ) : (
                  <div className="zlog-saved-diary-toolbar">
                    <p
                      style={{
                        minWidth: 0,
                        margin: 0,
                        color: 'var(--text-2)',
                        fontSize: 14,
                        lineHeight: 1.4,
                      }}
                    >
                      Open a diary to review it, or use one for today.
                    </p>
                    <SecondaryButton
                      type="button"
                      onClick={toggleSelectionMode}
                      style={{ flex: '0 0 auto', minHeight: 44, width: 'auto', padding: '7px 12px' }}
                    >
                      Select
                    </SecondaryButton>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {deleteStatus ? (
            <p
              role="status"
              style={{
                margin: '0 0 12px',
                color: 'var(--text-2)',
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {deleteStatus}
            </p>
          ) : null}

          {loading && <p style={{ color: 'var(--text-2)' }}>Loading your diaries…</p>}

          {!loading && reports.length === 0 && (
            <div style={{ padding: '8px 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
              No saved Site Diaries yet{filterProjectId ? ' for this project' : ''}.
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
                const busy = busyId === row.id
                const selected = selectedIds.has(row.id)
                return (
                  <div
                    key={row.id}
                    className={`zlog-saved-diary-row${selected ? ' zlog-saved-diary-row--selected' : ''}`}
                    role="listitem"
                    data-saved-diary-row
                  >
                    {mode === 'saved' && selectionMode ? (
                      <label className="zlog-saved-diary-select">
                        <input
                          className="zlog-saved-diary-checkbox"
                          type="checkbox"
                          checked={selected}
                          disabled={Boolean(busyId) || deleting}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${projectName} ${reportDate}`}
                        />
                        <span>
                          <span className="zlog-saved-diary-project">{projectName}</span>
                          <span className="zlog-saved-diary-meta">
                            {reportDate} · Shift: {shift}
                          </span>
                          {summary ? (
                            <span className="zlog-saved-diary-summary">{summary}</span>
                          ) : null}
                        </span>
                      </label>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="zlog-saved-diary-open"
                          disabled={Boolean(busyId)}
                          onClick={() => openExistingReport(row)}
                          aria-label={`Open ${projectName} diary from ${reportDate} to review`}
                        >
                          <span className="zlog-saved-diary-project">{projectName}</span>
                          <span className="zlog-saved-diary-meta">
                            {reportDate} · Shift: {shift}
                          </span>
                          {summary ? (
                            <span className="zlog-saved-diary-summary">{summary}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="zlog-saved-diary-use"
                          disabled={Boolean(busyId)}
                          onClick={() => requestUsePreviousForToday(row)}
                        >
                          {busy ? 'Starting…' : 'Use for Today'}
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}
        </>
      )}

      <ReportDeletionDialog
        open={deleteIds.length > 0}
        count={deleteIds.length}
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (deleting) return
          setDeleteIds([])
          setDeleteError('')
        }}
        onConfirm={confirmDeleteSelected}
      />

      {confirmRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="zlog-use-previous-confirm-title"
          aria-describedby="zlog-use-previous-confirm-message"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'color-mix(in srgb, var(--ink) 72%, transparent)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              padding: '20px 18px 16px',
              borderRadius: 12,
              border: '1px solid color-mix(in srgb, var(--edge) 58%, var(--text) 22%)',
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--plate) 78%, var(--text) 5%) 0%, color-mix(in srgb, var(--ink) 55%, var(--plate)) 100%)',
              boxShadow:
                'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 86%), 0 12px 32px color-mix(in srgb, var(--ink) 55%, transparent)',
            }}
          >
            <h2
              id="zlog-use-previous-confirm-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.25,
                color: 'var(--text)',
              }}
            >
              Use this diary for today?
            </h2>
            <p
              id="zlog-use-previous-confirm-message"
              style={{
                margin: '10px 0 0',
                fontSize: 15,
                lineHeight: 1.45,
                color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
              }}
            >
              Your original diary will remain saved and unchanged.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                className="zlog-secondary-cta zlog-diary-peer-action"
                disabled={Boolean(busyId)}
                onClick={cancelUsePreviousForToday}
                style={{ ...recentEntryActionButtonStyle, flex: '1 1 120px', width: 'auto' }}
              >
                <span className="zlog-secondary-cta__label">Cancel</span>
              </button>
              <button
                type="button"
                className="zlog-secondary-cta zlog-diary-peer-action"
                disabled={Boolean(busyId)}
                onClick={confirmUsePreviousForToday}
                style={{ ...recentEntryActionButtonStyle, flex: '1 1 140px', width: 'auto' }}
              >
                <span className="zlog-secondary-cta__label">
                  {busyId === confirmRow.id ? 'Starting…' : 'Use for Today'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
          brandRegionStyle={{ paddingBottom: 30 }}
        >
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiaryEntryPage />
    </Suspense>
  )
}
