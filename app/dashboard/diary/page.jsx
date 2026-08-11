'use client'

/**
 * Site Diary entry hub — today’s Site Diary choice.
 * A) Start a New Diary → setup
 * B) Use a Previous Diary → pick one to start today from it (new diary), or open to review
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
  RecentEntryCard,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
  dashboardCardInteractionCss,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import { DIARY_MISSING_MESSAGE, existingDiaryHref } from '@/lib/diary-routing'
import { createTodaysDiaryDraft } from '@/lib/diary-draft'
import { diaryFormHref } from '@/lib/diary-setup-continue'
import { clearSetupFormDraft } from '@/lib/report-setup'

const DIARY_ACCENT = REPORT_THEMES.diary.accent

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

const IconPreviousDiary = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M8 4h7l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    <path d="M15 4v4h4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path
      d="M5 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
      opacity="0.85"
    />
  </svg>
)

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

  const [mode, setMode] = useState(null) // null | 'previous'
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(() => (missingReport ? DIARY_MISSING_MESSAGE : ''))
  const [reports, setReports] = useState([])

  const title = useMemo(() => {
    if (mode === 'previous') return 'Use a Previous Diary'
    return 'Site Diary'
  }, [mode])

  const moduleSubtitle = useMemo(() => {
    if (mode === 'previous') {
      return filterProjectId
        ? 'Choose a previous diary for this project. This creates a new diary for today — the earlier diary stays unchanged.'
        : 'Choose a diary to use as your starting point. The original will stay unchanged.'
    }
    return null
  }, [mode, filterProjectId])

  useEffect(() => {
    if (missingReport) setError(DIARY_MISSING_MESSAGE)
  }, [missingReport])

  useEffect(() => {
    if (mode !== 'previous') return
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
    const href = existingDiaryHref(row?.project_id, row?.id)
    if (!href) {
      setError('That diary can’t be opened. Try another one, or start a new diary.')
      return
    }
    // Exact existing report — View first; never create a new row here.
    router.push(href)
  }

  const usePreviousForToday = async (row) => {
    if (!row?.project_id || !row?.id || busyId) return
    setBusyId(row.id)
    setError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, row.project_id, row.id)
      const href = diaryFormHref(row.project_id, id)
      if (!href) throw new Error('Missing diary link')
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

  return (
    <PremiumShell
      hideModuleNav
      accent={DIARY_ACCENT}
      maxWidth={560}
      /* Entry hub only: tighten air below wordmark (~25%); keep pad-top / logo size. */
      brandRegionStyle={{ paddingBottom: 30 }}
    >
      <style>{dashboardCardInteractionCss}</style>

      <ZlogModulePageHeader
        title={title}
        subtitle={moduleSubtitle}
        backHref={mode ? undefined : '/dashboard'}
        onBack={mode ? () => setMode(null) : undefined}
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
            alignItems: 'start',
          }}
        >
          <div className="premium-dash-card-wrap" style={{ animationDelay: '0ms' }}>
            <ModuleHomeCard
              title="Start a New Diary"
              description="Enter everything from scratch."
              icon={IconNewDiary}
              accent={DIARY_ACCENT}
              onClick={startNewReport}
              style={{ minHeight: 0, height: 'auto', padding: '8px 12px 8px' }}
            />
          </div>
          <div className="premium-dash-card-wrap" style={{ animationDelay: '70ms' }}>
            <ModuleHomeCard
              title="Use a Previous Diary"
              description="Carry over recurring details."
              icon={IconPreviousDiary}
              accent={DIARY_ACCENT}
              onClick={() => setMode('previous')}
              style={{ minHeight: 0, height: 'auto', padding: '8px 12px 8px' }}
            />
          </div>
        </div>
      )}

      {mode === 'previous' && (
        <>
          {loading && <p style={{ color: 'var(--text-2)' }}>Loading your diaries…</p>}

          {!loading && reports.length === 0 && (
            <div style={{ padding: '8px 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
              No Site Diaries yet{filterProjectId ? ' for this project' : ''}.
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
                      className="zlog-secondary-cta zlog-diary-peer-action zlog-diary-peer-action--use"
                      disabled={Boolean(busyId)}
                      onClick={() => usePreviousForToday(row)}
                      style={{ ...recentEntryActionButtonStyle, flex: '1 1 160px' }}
                    >
                      <CalendarPlus
                        size={16}
                        strokeWidth={2.5}
                        aria-hidden
                        className="zlog-secondary-cta__icon"
                      />
                      <span className="zlog-secondary-cta__label">
                        {busy ? 'Starting…' : 'Use for today'}
                      </span>
                    </button>
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
                  </div>
                </RecentEntryCard>
              )
            })}
        </>
      )}
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
