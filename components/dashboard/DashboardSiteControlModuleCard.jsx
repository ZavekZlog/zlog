'use client'

import { getDashboardSiteControlTheme } from '@/lib/dashboard-site-control-panel-theme'
import { DashboardSiteControlApprovedArt } from '@/components/dashboard/DashboardSiteControlApprovedArt'

/**
 * Industrial Site Control Panel module tile — dashboard 5-card grid only.
 */
export function DashboardSiteControlModuleCard({
  moduleId,
  title,
  description,
  onClick,
  disabled = false,
  style,
}) {
  const theme = getDashboardSiteControlTheme(moduleId)

  return (
    <button
      type="button"
      className={`zlog-scp-card ${theme.coatClass}`}
      disabled={disabled}
      onClick={onClick}
      data-module={moduleId}
      style={{
        '--scp-accent': theme.accent,
        ...style,
      }}
    >
      <span className="zlog-scp-edge-accent" aria-hidden />
      <span className="zlog-scp-frame" aria-hidden />
      <span className="zlog-scp-rivets" aria-hidden />
      <span className="zlog-scp-rivet-corner zlog-scp-rivet-corner--bl" aria-hidden />
      <span className="zlog-scp-rivet-corner zlog-scp-rivet-corner--br" aria-hidden />
      <span className="zlog-scp-rivet-corner zlog-scp-rivet-corner--tl" aria-hidden />
      <span className="zlog-scp-rivet-corner zlog-scp-rivet-corner--tr" aria-hidden />

      <div className={`zlog-scp-hero-stage ${theme.heroScaleClass || ''}`.trim()} aria-hidden>
        <div className="zlog-scp-hero-bay">
          <div className="zlog-scp-hero-plate">
            <span className="zlog-scp-plate-rivet zlog-scp-plate-rivet--tl" aria-hidden />
            <span className="zlog-scp-plate-rivet zlog-scp-plate-rivet--tr" aria-hidden />
            <span className="zlog-scp-plate-rivet zlog-scp-plate-rivet--bl" aria-hidden />
            <span className="zlog-scp-plate-rivet zlog-scp-plate-rivet--br" aria-hidden />
            <DashboardSiteControlApprovedArt moduleId={moduleId} />
          </div>
        </div>
      </div>

      <div className="zlog-scp-copy">
        {title ? <div className="zlog-scp-card-title">{title}</div> : null}
        {description ? <div className="zlog-scp-card-desc">{description}</div> : null}
        <span className="zlog-scp-chevron" aria-hidden>
          ›
        </span>
      </div>
    </button>
  )
}
