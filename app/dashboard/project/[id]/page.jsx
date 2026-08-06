'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  PremiumShell,
  ModuleHomeCard,
  RecentEntryCard,
  SecondaryButton,
  DestructiveButton,
  dashboardCardInteractionCss,
  premiumScopedCss,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import { existingDiaryHref } from '@/lib/diary-routing'

export default function ProjectPage() {
  const [project, setProject] = useState(null)
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  useEffect(() => {
    const load = async () => {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
      const { data: logs } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('project_id', id)
        .eq('is_draft', false)
        .order('report_date', { ascending: false })
      setProject(proj)
      setDiaries(logs || [])
      setLoading(false)
    }
    load()
  }, [id])

  const handleDeleteDiary = async (report) => {
    if (!report?.id) return
    const label = report.report_date || 'this report'
    if (!window.confirm(`Delete diary entry for ${label}? This cannot be undone.`)) return

    setDeletingId(report.id)
    try {
      // Collect storage paths before DB deletes (best-effort cleanup after success)
      const { data: photoRows, error: photoSelectError } = await supabase
        .from('report_photos')
        .select('url')
        .eq('report_id', report.id)

      if (photoSelectError) {
        window.alert(photoSelectError.message || 'Failed to prepare photo cleanup')
        return
      }

      const storagePaths = [
        report.cover_photo_url,
        report.signature_url,
        ...(photoRows || []).map((row) => row.url),
      ].filter(Boolean)

      const { error: photosError } = await supabase
        .from('report_photos')
        .delete()
        .eq('report_id', report.id)
      if (photosError) {
        window.alert(photosError.message || 'Failed to delete report photos')
        return
      }

      const { error: labourError } = await supabase
        .from('report_labour')
        .delete()
        .eq('report_id', report.id)
      if (labourError) {
        window.alert(labourError.message || 'Failed to delete labour rows')
        return
      }

      const { error: plantError } = await supabase
        .from('report_plant')
        .delete()
        .eq('report_id', report.id)
      if (plantError) {
        window.alert(plantError.message || 'Failed to delete plant rows')
        return
      }

      const { error: reportError } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', report.id)
        .eq('project_id', id)

      if (reportError) {
        window.alert(reportError.message || 'Failed to delete report')
        return
      }

      setDiaries((prev) => prev.filter((d) => d.id !== report.id))

      // Best-effort: remove storage objects after the DB row is gone
      if (storagePaths.length > 0) {
        try {
          const { error: storageError } = await supabase.storage.from('site-photos').remove(storagePaths)
          void storageError // report row is already deleted — ignore storage failures
        } catch {
          // Ignore storage failures — report row is already deleted
        }
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <PremiumShell title="Project" backHref="/dashboard" accent={REPORT_THEMES.diary.accent}>
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="Project"
      backHref="/dashboard"
      accent={REPORT_THEMES.diary.accent}
    >
      <style>{`${premiumScopedCss}${dashboardCardInteractionCss}`}</style>

      <div className="premium-dash-cards-grid" style={{ marginBottom: 32 }}>
        <div className="premium-dash-card-wrap" style={{ animationDelay: '0ms' }}>
          <ModuleHomeCard
            title="Site Diary"
            description="Edit existing or start new"
            icon="📋"
            accent={REPORT_THEMES.diary.accent}
            onClick={() => router.push(`/dashboard/diary?project=${id}`)}
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
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.45 }}>Tap Site Diary to add your first entry</p>
        </div>
      ) : (
        diaries.map((d) => (
          <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
            <div style={recentEntryDateStyle}>{project?.name || 'Project'}</div>
            <div style={recentEntrySummaryStyle}>
              {d.report_date
                ? new Date(`${d.report_date}T12:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </div>
            <div style={recentEntryActionsStyle}>
              <SecondaryButton
                type="button"
                onClick={() => {
                  const href = existingDiaryHref(id, d.id)
                  if (href) router.push(href)
                }}
                style={recentEntryActionButtonStyle}
              >
                View / Edit
              </SecondaryButton>
              <SecondaryButton
                type="button"
                onClick={() => router.push(`/dashboard/project/${id}/diary?template=${d.id}`)}
                style={recentEntryActionButtonStyle}
              >
                Use as Template
              </SecondaryButton>
              <DestructiveButton
                type="button"
                disabled={deletingId === d.id}
                onClick={() => handleDeleteDiary(d)}
                style={recentEntryActionButtonStyle}
              >
                {deletingId === d.id ? 'Deleting…' : 'Delete'}
              </DestructiveButton>
            </div>
          </RecentEntryCard>
        ))
      )}
    </PremiumShell>
  )
}
