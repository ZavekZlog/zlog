'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  pageBackground,
  premiumScopedCss,
  dashboardCardInteractionCss,
} from '@/lib/premium-ui'
import { REPORT_THEME_LIST } from '@/lib/report-theme'
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar'
import { DashboardSiteControlModuleCard } from '@/components/dashboard/DashboardSiteControlModuleCard'
import { dashboardSiteControlPanelCss } from '@/lib/dashboard-site-control-panel-theme'
import { DASHBOARD_CONTENT_GRID } from '@/lib/dashboard-content-grid'

/** Dashboard 5-card panel display order only — does not change global REPORT_THEME_LIST. */
const SITE_CONTROL_PANEL_MODULE_ORDER = ['survey', 'diary', 'progress', 'healthSafety', 'snag']

/** Dashboard-only live copy — parallel rhythm for uniform card layout (a11y labels on cards). */
const SITE_CONTROL_PANEL_DISPLAY_COPY = {
  survey: {
    title: 'Site Survey',
    description: 'Observations, measurements & photos.',
  },
  diary: {
    title: 'Site Diary',
    description: 'Daily activity, labour, plant & photos.',
  },
  progress: {
    title: 'Site Progress',
    description: 'Progress, delays, issues & photos.',
  },
  healthSafety: {
    title: 'Site H&S',
    description: 'Compliance, incidents & photos.',
  },
  snag: {
    title: 'Site Snags',
    description: 'Defects, actions, close-out & photos.',
  },
}

export default function DashboardPage() {
  const [project, setProject] = useState(null)
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
        // Network failures (Failed to fetch) must not block the Site Control Panel.
        setProject(null)
      }
    }
    load()
  }, [])

  const siteControlPanelCards = SITE_CONTROL_PANEL_MODULE_ORDER.map((moduleId) =>
    REPORT_THEME_LIST.find((card) => card.id === moduleId),
  ).filter(Boolean)

  const renderCard = (card, index, wrapClassName = 'premium-dash-card-wrap') => {
    const isDiary = card.path === 'diary'
    const disabled = isDiary ? false : !project
    const displayCopy = SITE_CONTROL_PANEL_DISPLAY_COPY[card.id] || {
      title: card.title,
      description: card.description,
    }
    return (
      <div
        key={card.path}
        className={wrapClassName}
        style={{ animationDelay: `${index * 70}ms` }}
      >
        <DashboardSiteControlModuleCard
          moduleId={card.id}
          title={displayCopy.title}
          description={displayCopy.description}
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
      <style>{`${premiumScopedCss}${dashboardCardInteractionCss}${dashboardSiteControlPanelCss}`}</style>
      <DashboardTopBar />

      <div
        style={{
          padding: `${DASHBOARD_CONTENT_GRID.contentTop}px ${DASHBOARD_CONTENT_GRID.padX}px ${DASHBOARD_CONTENT_GRID.contentBottom}px`,
          maxWidth: DASHBOARD_CONTENT_GRID.maxWidth,
          margin: '0 auto',
        }}
      >
        <div className="zlog-site-control-panel">
          <span className="zlog-site-control-panel__bezel" aria-hidden />
          <div className="premium-dash-cards-grid" style={{ marginBottom: 0 }}>
            {siteControlPanelCards.map((card, index) => {
              const wrapClassName =
                card.id === 'snag'
                  ? 'premium-dash-card-wrap zlog-scp-wrap--centre'
                  : 'premium-dash-card-wrap'
              return renderCard(card, index, wrapClassName)
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
