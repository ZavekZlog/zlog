'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  pageBackground,
  premiumScopedCss,
  dashboardCardInteractionCss,
  ModuleHomeCard,
  RecentEntryCard,
  SecondaryButton,
  PrimaryCTA,
  premiumDiaryEmptyClass,
  premiumDiaryEmptyTitleClass,
  premiumDiaryEmptyHintClass,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEME_LIST, REPORT_THEMES } from '@/lib/report-theme'
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar'

/** Dashboard vertical rhythm (8px grid) */
const SPACE = {
  contentTop: 12,
  contentX: 20,
  contentBottom: 24,
  sectionAfterCards: 16,
  headingToList: 12,
}

export default function DashboardPage() {
  const [project, setProject] = useState(null)
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, name, client_name, site_address')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setProject(proj)
      if (proj?.id) {
        const { data: logs } = await supabase
          .from('daily_reports')
          .select('id, report_date, site_summary')
          .eq('project_id', proj.id)
          .order('report_date', { ascending: false })
          .limit(5)
        setDiaries(logs || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="dashboard-premium-bg" style={{ ...pageBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    )
  }

  const renderCard = (card, index, wrapClassName = 'premium-dash-card-wrap') => {
    const disabled = !project
    return (
      <div
        key={card.path}
        className={wrapClassName}
        style={{ animationDelay: `${index * 70}ms` }}
      >
        <ModuleHomeCard
          title={card.title}
          description={card.description}
          icon={card.icon}
          accent={card.accent}
          disabled={disabled}
          onClick={() => {
            if (project?.id) router.push(`/dashboard/project/${project.id}/${card.path}`)
          }}
        />
      </div>
    )
  }

  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{`${premiumScopedCss}${dashboardCardInteractionCss}`}</style>
      <DashboardTopBar />

      <div
        style={{
          padding: `${SPACE.contentTop}px ${SPACE.contentX}px ${SPACE.contentBottom}px`,
          maxWidth: '600px',
          margin: '0 auto',
        }}
      >
        {!project && (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              textAlign: 'center',
              padding: '24px 20px',
              marginBottom: 16,
              background: 'var(--plate)',
              border: '1px solid var(--edge)',
              borderRadius: '12px',
              boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
            }}
          >
            <p style={{ margin: '8px 0 12px', color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>Create your first project</p>
            <p style={{ margin: '0 0 16px', fontSize: 16, lineHeight: 1.45, color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))' }}>Add a site before opening reports.</p>
            <PrimaryCTA onClick={() => router.push('/dashboard/new-project')} style={{ maxWidth: 280, margin: '0 auto' }}>
              New project
            </PrimaryCTA>
          </div>
        )}

        <div className="premium-dash-cards-grid" style={{ marginBottom: 0 }}>
          {REPORT_THEME_LIST.map((card, index) =>
            renderCard(
              card,
              index,
              index === 4 ? 'premium-dash-card-wrap premium-dash-card-wrap--hs' : 'premium-dash-card-wrap',
            ),
          )}
        </div>

        {project && (
          <>
            <h2
              style={{
                ...typeTokens.sectionTitle,
                marginTop: SPACE.sectionAfterCards,
                marginBottom: SPACE.headingToList,
                color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
                fontSize: 16,
                letterSpacing: '0.072em',
              }}
            >
              Recent diary entries
            </h2>

            {diaries.length === 0 ? (
              <div className={premiumDiaryEmptyClass}>
                <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
                <p className={premiumDiaryEmptyHintClass}>Tap Site Diary Report to add your first entry</p>
              </div>
            ) : (
              diaries.map((d) => (
                <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
                  <div style={recentEntryDateStyle}>{d.report_date}</div>
                  <div style={recentEntrySummaryStyle}>
                    {d.site_summary?.slice(0, 100)}
                    {(d.site_summary?.length || 0) > 100 ? '...' : ''}
                  </div>
                  <div style={recentEntryActionsStyle}>
                    <SecondaryButton
                      type="button"
                      onClick={() => router.push(`/dashboard/project/${project.id}/diary?report=${d.id}`)}
                      style={recentEntryActionButtonStyle}
                    >
                      View / Edit
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => router.push(`/dashboard/project/${project.id}/diary?duplicate=${d.id}`)}
                      style={recentEntryActionButtonStyle}
                    >
                      Duplicate
                    </SecondaryButton>
                  </div>
                </RecentEntryCard>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
