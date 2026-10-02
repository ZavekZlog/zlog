/**
 * Signed-off Site Control Panel hero artwork — direct crops (final 5-card mockup).
 * Served from public/zlog/site-control-panel/ (WebP only in app bundle).
 */

export const DASHBOARD_SITE_CONTROL_ARTIFACT_SRC = {
  diary: '/zlog/site-control-panel/site-diary-artifact.webp',
  survey: '/zlog/site-control-panel/site-survey-artifact.webp',
  progress: '/zlog/site-control-panel/site-progress-artifact.webp',
  snag: '/zlog/site-control-panel/site-snag-artifact.webp',
  healthSafety: '/zlog/site-control-panel/site-hs-artifact.webp',
}

export function getDashboardSiteControlArtifactSrc(moduleId) {
  return DASHBOARD_SITE_CONTROL_ARTIFACT_SRC[moduleId] || DASHBOARD_SITE_CONTROL_ARTIFACT_SRC.diary
}
