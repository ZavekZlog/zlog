'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  pageBackground,
  premiumScopedCss,
  dashboardCardInteractionCss,
  ModuleHomeCard,
} from '@/lib/premium-ui'
import { REPORT_THEME_LIST } from '@/lib/report-theme'
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar'
import { DASHBOARD_CONTENT_GRID } from '@/lib/dashboard-content-grid'

export default function DashboardPage() {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      try {
        // Quietly load latest project for non-diary modules only — never shown on dashboard.
        const { data: proj, error } = await supabase
          .from('projects')
          .select('id, name, client_name, site_address')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!error) setProject(proj)
        else setProject(null)
      } catch {
        // Network failures (Failed to fetch) must not leave the dashboard stuck on Loading.
        setProject(null)
      } finally {
        setLoading(false)
      }
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
    const isDiary = card.path === 'diary'
    const disabled = isDiary ? false : !project
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
            if (isDiary) {
              // Site Diary → hub (Start a new diary / Use a previous diary).
              router.push('/dashboard/diary')
              return
            }
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
          padding: `${DASHBOARD_CONTENT_GRID.contentTop}px ${DASHBOARD_CONTENT_GRID.padX}px ${DASHBOARD_CONTENT_GRID.contentBottom}px`,
          maxWidth: DASHBOARD_CONTENT_GRID.maxWidth,
          margin: '0 auto',
        }}
      >
        <div className="premium-dash-cards-grid" style={{ marginBottom: 0 }}>
          {REPORT_THEME_LIST.map((card, index) =>
            renderCard(
              card,
              index,
              index === 4 ? 'premium-dash-card-wrap premium-dash-card-wrap--hs' : 'premium-dash-card-wrap',
            ),
          )}
        </div>
      </div>
    </div>
  )
}
