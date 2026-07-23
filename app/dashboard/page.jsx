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
  ZlogWordmark,
  ModuleAccent,
  typeTokens,
  DIARY_ACCENT,
  premiumDiaryEmptyClass,
  premiumDiaryEmptyTitleClass,
  premiumDiaryEmptyHintClass,
} from '@/lib/premium-ui'
import { REPORT_THEME_LIST, REPORT_THEMES, formatProjectMeta } from '@/lib/report-theme'

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

  const mainCards = REPORT_THEME_LIST.slice(0, 4)
  const hsCard = REPORT_THEME_LIST[4]

  const renderCard = (card, index, wrapClassName = 'premium-dash-card-wrap', wrapStyle = {}) => {
    const disabled = !project
    return (
      <div
        key={card.path}
        className={wrapClassName}
        style={{ animationDelay: `${index * 70}ms`, ...wrapStyle }}
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
      <div
        className="premium-shell-header zlog-internal-header"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'color-mix(in srgb, var(--ink) 72%, var(--plate))',
          borderBottom: '1px solid var(--edge-highlight)',
          padding: '16px 24px',
        }}
      >
        <ModuleAccent accent={DIARY_ACCENT} height="3px" radius="0" />
        <div style={{ position: 'relative' }}>
          <ZlogWordmark style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            {project && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...typeTokens.reportName, fontSize: 17 }}>{project.name}</div>
                {formatProjectMeta(project) ? (
                  <div className="premium-shell-subtitle" style={{ ...typeTokens.meta, marginTop: 2 }}>
                    {formatProjectMeta(project)}
                  </div>
                ) : null}
              </div>
            )}
            <SecondaryButton
              href="/dashboard/settings/branding"
              style={{ marginLeft: 'auto', minHeight: 36, padding: '6px 12px', fontSize: 12 }}
            >
              Branding
            </SecondaryButton>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px 24px', maxWidth: '600px', margin: '0 auto' }}>
        {!project && (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              textAlign: 'center',
              padding: '24px 20px',
              marginBottom: '20px',
              background: 'var(--plate)',
              border: '1px solid var(--edge)',
              borderRadius: '12px',
              boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
            }}
          >
            <ModuleAccent accent={DIARY_ACCENT} height="2.55px" radius="12px 12px 0 0" />
            <p style={{ margin: '8px 0 12px', color: 'var(--text)', fontWeight: 600 }}>Create your first project</p>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-2)' }}>Add a site before opening reports.</p>
            <PrimaryCTA onClick={() => router.push('/dashboard/new-project')} style={{ maxWidth: 280, margin: '0 auto' }}>
              New project
            </PrimaryCTA>
          </div>
        )}

        <div className="premium-dash-cards-grid" style={{ marginBottom: '16px' }}>
          {mainCards.map((card, index) => renderCard(card, index))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
          {renderCard(hsCard, 4, 'premium-dash-card-wrap premium-dash-card-wrap--solo', { width: 'calc(50% - 10px)' })}
        </div>

        {project && (
          <>
            <h2 style={{ ...typeTokens.sectionTitle, marginTop: 48, marginBottom: 16, color: 'var(--text-2)' }}>
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
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{d.report_date}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
                    {d.site_summary?.slice(0, 100)}{(d.site_summary?.length || 0) > 100 ? '...' : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <SecondaryButton
                      type="button"
                      onClick={() => router.push(`/dashboard/project/${project.id}/diary?report=${d.id}`)}
                    >
                      View / Edit
                    </SecondaryButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => router.push(`/dashboard/project/${project.id}/diary?duplicate=${d.id}`)}
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
