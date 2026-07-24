'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  PremiumShell,
  ModuleHomeCard,
  RecentEntryCard,
  SecondaryButton,
  dashboardCardInteractionCss,
  premiumScopedCss,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES, formatProjectMeta } from '@/lib/report-theme'

export default function ProjectPage() {
  const [project, setProject] = useState(null)
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  useEffect(() => {
    const load = async () => {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
      const { data: logs } = await supabase.from('daily_reports').select('*').eq('project_id', id).order('report_date', { ascending: false })
      setProject(proj)
      setDiaries(logs || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <PremiumShell title="Project" reportName="Loading…" backHref="/dashboard" accent={REPORT_THEMES.diary.accent}>
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="Project"
      reportName={project?.name || 'Project'}
      meta={formatProjectMeta(project)}
      backHref="/dashboard"
      accent={REPORT_THEMES.diary.accent}
    >
      <style>{`${premiumScopedCss}${dashboardCardInteractionCss}`}</style>

      <div className="premium-dash-cards-grid" style={{ marginBottom: 32 }}>
        <div className="premium-dash-card-wrap" style={{ animationDelay: '0ms' }}>
          <ModuleHomeCard
            title="New Report"
            description="Pre-filled from last entry"
            icon="📋"
            accent={REPORT_THEMES.diary.accent}
            onClick={() => router.push(`/dashboard/project/${id}/diary?prefill=last`)}
          />
        </div>
        <div className="premium-dash-card-wrap" style={{ animationDelay: '70ms' }}>
          <ModuleHomeCard
            title="Snag List"
            description="Log issues"
            icon="⚠️"
            accent={REPORT_THEMES.snag.accent}
            onClick={() => router.push(`/dashboard/project/${id}/snags`)}
          />
        </div>
      </div>

      <h2
        style={{
          ...typeTokens.sectionTitle,
          marginBottom: 12,
          color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
          fontSize: 16,
          letterSpacing: '0.072em',
        }}
      >
        Recent diary entries
      </h2>

      {diaries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
          <p style={{ margin: '0 0 8px', color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>No entries yet</p>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.45 }}>Tap New Report to add your first entry</p>
        </div>
      ) : (
        diaries.map((d) => (
          <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
            <div style={recentEntryDateStyle}>{d.report_date}</div>
            <div style={recentEntrySummaryStyle}>
              {(d.site_summary || d.notes || '')?.slice(0, 100)}
              {((d.site_summary || d.notes || '').length > 100) ? '...' : ''}
            </div>
            <div style={recentEntryActionsStyle}>
              <SecondaryButton
                type="button"
                onClick={() => router.push(`/dashboard/project/${id}/diary?report=${d.id}`)}
                style={recentEntryActionButtonStyle}
              >
                View / Edit
              </SecondaryButton>
              <SecondaryButton
                type="button"
                onClick={() => router.push(`/dashboard/project/${id}/diary?duplicate=${d.id}`)}
                style={recentEntryActionButtonStyle}
              >
                Duplicate
              </SecondaryButton>
            </div>
          </RecentEntryCard>
        ))
      )}
    </PremiumShell>
  )
}
