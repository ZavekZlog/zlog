'use client'

import { getDashboardSiteControlArtifactSrc } from '@/lib/dashboard-site-control-panel-artifacts'

/**
 * Approved Zlog industrial module hero — supplied asset crops only (no SVG redraw).
 */
export function DashboardSiteControlApprovedArt({ moduleId }) {
  const src = getDashboardSiteControlArtifactSrc(moduleId)

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ESLINT-DASHBOARD-HERO-IMG
    <img
      className="zlog-scp-approved-art"
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
    />
  )
}
