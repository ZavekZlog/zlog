'use client'

/**
 * Site Diary entry hub — same on all devices.
 * A) Continue / Edit Existing Report → open exact ?report= id
 * B) Start New Report → setup (project selection)
 *
 * Dashboard "Site Diary" previously jumped straight to setup (project names only),
 * while /dashboard/project/[id]/diary showed draft/recent choices — that caused
 * phone vs laptop inconsistency when each device used a different entry link.
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
  const supabase = createClient()

  const [mode, setMode] = useState(null) // null | 'edit' | 'new'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reports, setReports] = useState([])

  const title = useMemo(() => {
    if (mode === 'edit') return 'Continue / Edit Existing Report'
    if (mode === 'new') return 'Start New Report'
    return 'Site Diary'
  }, [mode])

  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
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
        if (!cancelled) setError(err?.message || 'Could not load existing reports')
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
    if (!row?.id || !row?.project_id) {
      setError('That report is missing an id or project id and cannot be opened for edit.')
      return
    }
    // Exact existing report — never create a new row here.
    router.push(`/dashboard/project/${row.project_id}/diary?report=${row.id}`)
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
            Choose whether to edit an existing report or start a new one. Saved projects are not previous diaries.
          </p>

          <GlassSection title="A. Continue / Edit Existing Report" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Open a saved diary by project, date and shift. Uses the existing report ID (UPDATE only).
            </p>
            <PrimaryCTA type="button" accent={DIARY_ACCENT} onClick={() => setMode('edit')}>
              Continue / Edit Existing Report
            </PrimaryCTA>
          </GlassSection>

          <GlassSection title="B. Start New Report" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Choose or create a project, then open a new diary draft.
            </p>
            <SecondaryButton type="button" onClick={startNewReport}>
              Start New Report
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
            Existing reports{filterProjectId ? ' for this project' : ''}. Selecting one opens that exact report ID.
          </p>

          {loading && <p style={{ color: 'var(--text-2)' }}>Loading reports…</p>}

          {!loading && reports.length === 0 && (
            <div style={{ padding: '24px 0', color: 'var(--text-2)', fontSize: 14 }}>
              No existing reports found.
              <div style={{ marginTop: 14 }}>
                <SecondaryButton type="button" onClick={startNewReport}>
                  Start New Report instead
                </SecondaryButton>
              </div>
            </div>
          )}

          {!loading &&
            reports.map((row) => {
              const projectName = row.projects?.name || 'Project'
              const shift = row.shift || '—'
              return (
                <RecentEntryCard key={row.id} accent={DIARY_ACCENT}>
                  <div style={recentEntryDateStyle}>{projectName}</div>
                  <div style={recentEntrySummaryStyle}>
                    {formatReportDate(row.report_date)} · Shift: {shift}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: 'ui-monospace, monospace',
                      opacity: 0.75,
                      marginBottom: 10,
                      wordBreak: 'break-all',
                    }}
                  >
                    report id: {row.id}
                  </div>
                  <div style={recentEntryActionsStyle}>
                    <SecondaryButton
                      type="button"
                      onClick={() => openExistingReport(row)}
                      style={recentEntryActionButtonStyle}
                    >
                      Open for edit
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
