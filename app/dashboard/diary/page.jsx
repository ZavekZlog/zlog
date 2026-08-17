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
import { CalendarPlus, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  ZlogModulePageHeader,
  ModuleHomeCard,
  SecondaryButton,
  DestructiveButton,
  RecentEntryCard,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
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
              description="Enter everything from scratch."
              icon={IconNewDiary}
              accent={DIARY_ACCENT}
              onClick={startNewReport}
              style={{ minHeight: 0, height: '100%', padding: '8px 12px 8px' }}
            />
          </div>
          <div className="premium-dash-card-wrap" style={{ animationDelay: '70ms' }}>
            <ModuleHomeCard
              title="View Saved Diaries"
              description="Review a saved diary — or reuse one for today…"
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
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                margin: '0 0 12px',
              }}
            >
              <SecondaryButton
                type="button"
                onClick={toggleSelectionMode}
                style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
              >
                {selectionMode ? 'Cancel selection' : 'Select'}
              </SecondaryButton>
              {selectionMode ? (
                <>
                  <SecondaryButton
                    type="button"
                    disabled={reports.length < 1 || selectedIds.size === reports.length}
                    onClick={selectAllVisible}
                    style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                  >
                    Select All
                  </SecondaryButton>
                  <DestructiveButton
                    type="button"
                    disabled={selectedIds.size < 1 || deleting}
                    onClick={requestDeleteSelected}
                    style={{ minHeight: 44, width: 'auto', padding: '8px 14px' }}
                  >
                    {deleteReportActionLabel(selectedIds.size)}
                  </DestructiveButton>
                </>
              ) : null}
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

          {!loading &&
            reports.map((row) => {
              const projectName = row.projects?.name || 'Project'
              const shift = row.shift || '—'
              const summary = (row.site_summary || '').trim()
              const busy = busyId === row.id
              return (
                <RecentEntryCard
                  key={row.id}
                  accent={DIARY_ACCENT}
                  style={{ padding: '8px 12px 8px 14px', marginBottom: 8 }}
                >
                  <div style={{ ...recentEntryDateStyle, minHeight: 0, lineHeight: 1.25 }}>
                    {projectName}
                  </div>
                  <div
                    style={{
                      ...recentEntrySummaryStyle,
                      marginTop: 2,
                      minHeight: 0,
                      lineHeight: 1.35,
                    }}
                  >
                    {formatReportDate(row.report_date)} · Shift: {shift}
                  </div>
                  {summary ? (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.35,
                        opacity: 0.85,
                        marginTop: 4,
                        marginBottom: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {summary}
                    </div>
                  ) : null}
                  {mode === 'saved' && selectionMode ? (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                        margin: '8px 0 0',
                        fontSize: 14,
                        color: 'var(--text)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        disabled={Boolean(busyId) || deleting}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`Select ${projectName} ${formatReportDate(row.report_date)}`}
                      />
                      Select
                    </label>
                  ) : null}
                  <div
                    style={{
                      ...recentEntryActionsStyle,
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="zlog-secondary-cta zlog-diary-peer-action zlog-diary-peer-action--review"
                      disabled={Boolean(busyId)}
                      onClick={() => openExistingReport(row)}
                      style={{ ...recentEntryActionButtonStyle, flex: '1 1 140px' }}
                    >
                      <Eye
                        size={16}
                        strokeWidth={2.5}
                        aria-hidden
                        className="zlog-secondary-cta__icon"
                      />
                      <span className="zlog-secondary-cta__label">Open to review</span>
                    </button>
                    <button
                      type="button"
                      className="zlog-secondary-cta zlog-diary-peer-action zlog-diary-peer-action--use"
                      disabled={Boolean(busyId)}
                      onClick={() => requestUsePreviousForToday(row)}
                      style={{ ...recentEntryActionButtonStyle, flex: '1 1 140px' }}
                    >
                      <CalendarPlus
                        size={16}
                        strokeWidth={2.5}
                        aria-hidden
                        className="zlog-secondary-cta__icon"
                      />
                      <span className="zlog-secondary-cta__label">
                        {busy ? 'Starting…' : 'Use for Today'}
                      </span>
                    </button>
                  </div>
                </RecentEntryCard>
              )
            })}
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
