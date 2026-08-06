'use client'

/**
 * Site Diary entry hub — same on all devices.
 * A) Open Latest Diary → pick a recent diary and continue it
 * B) Start New Report → setup (choose/create project)
 */

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  RecentEntryCard,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import { DIARY_MISSING_MESSAGE, existingDiaryHref } from '@/lib/diary-routing'

const DIARY_ACCENT = REPORT_THEMES.diary.accent

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

  const [mode, setMode] = useState(null) // null | 'edit' | 'new'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => (missingReport ? DIARY_MISSING_MESSAGE : ''))
  const [reports, setReports] = useState([])

  const title = useMemo(() => {
    if (mode === 'edit') return 'Open Latest Diary'
    if (mode === 'new') return 'Start New Report'
    return 'Site Diary'
  }, [mode])

  useEffect(() => {
    if (missingReport) setError(DIARY_MISSING_MESSAGE)
  }, [missingReport])

  useEffect(() => {
    if (mode !== 'edit') return
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
      } catch (err) {
        if (!cancelled) {
          setError('We couldn’t load your latest diaries. Check your connection and try again.')
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
      setError('That diary can’t be opened. Try another one, or start a new Site Diary.')
      return
    }
    // Exact existing report — never create a new row here.
    router.push(href)
  }

  const startNewReport = () => {
    const q = filterProjectId ? `?project=${filterProjectId}` : ''
    router.push(`/dashboard/diary/setup${q}`)
  }

  return (
    <PremiumShell
      title={title}
      onBack={mode ? () => setMode(null) : undefined}
      backHref={mode ? undefined : '/dashboard'}
      accent={DIARY_ACCENT}
      maxWidth={560}
    >
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
          }}
        >
          {error}
        </div>
      )}

      {mode === null && (
        <>
          <p
            style={{
              ...typeTokens.body,
              margin: '0 0 20px',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))',
            }}
          >
            Choose whether to open your latest Site Diary or start a new one.
          </p>

          <GlassSection title="Open Latest Diary" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Open your latest Site Diary to continue today's work or use it as the starting point for today's report.
            </p>
            <PrimaryCTA type="button" accent={DIARY_ACCENT} onClick={() => setMode('edit')}>
              Open Latest Diary
            </PrimaryCTA>
          </GlassSection>

          <GlassSection title="Start New Report" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Start a new Site Diary for a different project or a completely new report.
            </p>
            <SecondaryButton type="button" onClick={startNewReport}>
              Start New Site Diary
            </SecondaryButton>
          </GlassSection>
        </>
      )}

      {mode === 'edit' && (
        <>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
            }}
          >
            {filterProjectId
              ? 'Choose your latest Site Diary for this project. Tap one to open it and update it for today.'
              : 'Choose your latest Site Diary below. Tap one to open it and update it for today.'}
          </p>

          {loading && <p style={{ color: 'var(--text-2)' }}>Loading your latest diaries…</p>}

          {!loading && reports.length === 0 && (
            <div style={{ padding: '24px 0', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
              No Site Diaries yet{filterProjectId ? ' for this project' : ''}.
              <div style={{ marginTop: 14 }}>
                <SecondaryButton type="button" onClick={startNewReport}>
                  Start New Site Diary
                </SecondaryButton>
              </div>
            </div>
          )}

          {!loading &&
            reports.map((row) => {
              const projectName = row.projects?.name || 'Project'
              const shift = row.shift || '—'
              const summary = (row.site_summary || '').trim()
              return (
                <RecentEntryCard key={row.id} accent={DIARY_ACCENT}>
                  <div style={recentEntryDateStyle}>{projectName}</div>
                  <div style={recentEntrySummaryStyle}>
                    {formatReportDate(row.report_date)} · Shift: {shift}
                  </div>
                  {summary ? (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.45,
                        opacity: 0.85,
                        marginBottom: 10,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {summary}
                    </div>
                  ) : null}
                  <div style={recentEntryActionsStyle}>
                    <SecondaryButton
                      type="button"
                      onClick={() => openExistingReport(row)}
                      style={recentEntryActionButtonStyle}
                    >
                      Open this diary
                    </SecondaryButton>
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
        <PremiumShell title="Site Diary" backHref="/dashboard" accent={DIARY_ACCENT} maxWidth={560}>
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiaryEntryPage />
    </Suspense>
  )
}
