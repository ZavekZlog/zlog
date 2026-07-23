'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  pageBackground,
  premiumScopedCss,
  dashboardCardInteractionCss,
  dashboardCardStyle,
  dashboardCardTitleStyle,
  dashboardCardDescStyle,
  dashboardIconBoxStyle,
  accentBarStyle,
  CTA_ORANGE,
  premiumDiaryEmptyClass,
  premiumDiaryEmptyTitleClass,
  premiumDiaryEmptyHintClass,
} from '@/lib/premium-ui'

const DASHBOARD_CARDS = [
  { path: 'site-survey', icon: '📐', title: 'Site Survey Report', description: 'Voice-led site observations, measurements, photos and condition notes.', accent: '59,130,246' },
  { path: 'diary', icon: '📋', title: 'Site Diary Report', description: 'Voice-led daily progress, labour, plant, visitors, delays and issues.', accent: '255,140,66' },
  { path: 'weekly-report', icon: '📊', title: 'Site Progress Report', description: 'Voice-led weekly progress, risks, delays, photos and next-week priorities.', accent: '34,197,94' },
  { path: 'snags', icon: '⚠️', title: 'Site Snag List', description: 'Voice-led defect capture, photos, actions and close-out tracking.', accent: '255, 210, 72' },
  { path: 'weekly-hs', icon: '🦺', title: 'Site H&S Report', description: 'Voice-led hazards, inspections, toolbox talks, incidents and compliance checks.', accent: '255,59,48' },
]

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

  const mainCards = DASHBOARD_CARDS.slice(0, 4)
  const hsCard = DASHBOARD_CARDS[4]

  const renderCard = (card, index, wrapClassName = 'premium-dash-card-wrap', wrapStyle = {}) => {
    const disabled = !project
    return (
      <div
        key={card.path}
        className={wrapClassName}
        style={{ animationDelay: `${index * 70}ms`, ...wrapStyle }}
      >
        <button
          type="button"
          className="premium-dash-card"
          disabled={disabled}
          onClick={() => {
            if (project?.id) router.push(`/dashboard/project/${project.id}/${card.path}`)
          }}
          style={{ ...dashboardCardStyle, '--accent': card.accent, ...(disabled ? { cursor: 'default', opacity: 0.45 } : {}) }}
        >
          <div className="premium-dash-accent" style={accentBarStyle(card.accent)} />
          <div className="premium-dash-icon" style={{ ...dashboardIconBoxStyle(card.accent), '--accent': card.accent }}>{card.icon}</div>
          <div className="premium-dash-card-title" style={dashboardCardTitleStyle}>{card.title}</div>
          <div className="premium-dash-card-desc" style={dashboardCardDescStyle}>{card.description}</div>
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{`${premiumScopedCss}${dashboardCardInteractionCss}`}</style>
      <div
        className="premium-shell-header"
        style={{
          background: 'transparent',
          borderBottom: '1px solid var(--edge-highlight)',
          padding: '16px 24px',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em' }}>
          Z<span style={{ color: CTA_ORANGE }}>log</span>
        </div>
        {project && (
          <div className="premium-shell-subtitle" style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: 4 }}>
            {project.name}
            {project.client_name ? ` · ${project.client_name}` : ''}
          </div>
        )}
      </div>

      <div style={{ padding: '20px 24px 24px', maxWidth: '600px', margin: '0 auto' }}>
        {!project && (
          <div style={{ textAlign: 'center', padding: '24px 20px', marginBottom: '20px', background: 'var(--plate)', border: '1px solid var(--edge)', borderRadius: '12px' }}>
            <p style={{ margin: '0 0 12px', color: 'var(--text)', fontWeight: 600 }}>Create your first project</p>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-2)' }}>Add a site before opening reports.</p>
            <button
              type="button"
              className="premium-primary-btn"
              onClick={() => router.push('/dashboard/new-project')}
              style={{ padding: '12px 20px', background: CTA_ORANGE, color: 'var(--ink)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: 'inset 0 1px 0 var(--edge-highlight)' }}
            >
              New project
            </button>
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
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginTop: '48px', marginBottom: '16px', color: 'var(--text-2)' }}>RECENT DIARY ENTRIES</h2>

            {diaries.length === 0 ? (
              <div className={premiumDiaryEmptyClass}>
                <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
                <p className={premiumDiaryEmptyHintClass}>Tap Site Diary Report to add your first entry</p>
              </div>
            ) : (
              diaries.map((d) => (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/project/${project.id}/diary?report=${d.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(`/dashboard/project/${project.id}/diary?report=${d.id}`)
                    }
                  }}
                  style={{ background: 'var(--plate)', border: '1px solid var(--edge)', borderRadius: '12px', padding: '16px', marginBottom: '12px', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: '600', color: 'var(--text)' }}>{d.report_date}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: '13px', marginTop: '4px' }}>{d.site_summary?.slice(0, 100)}{(d.site_summary?.length || 0) > 100 ? '...' : ''}</div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
