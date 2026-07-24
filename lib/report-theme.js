/**
 * Report-type colour mapping for module identity accents.
 * Values are RGB channel strings for use in rgba() / CSS custom properties.
 *
 * LOCKED design system — industrial powder-coat material:
 *   Survey blue · Diary purple (#8B5CF6) · Progress green · Snag amber · H&S red
 * Orange is reserved for Zlog brand identity + primary CTAs — not report accents.
 * History/list rails inherit via ModuleCategoryRail + accent from this map.
 */
export const REPORT_THEMES = {
  diary: {
    id: 'diary',
    path: 'diary',
    title: 'Site Diary Report',
    accent: '139,92,246', // violet / #8B5CF6
    icon: '📋',
    description: 'Daily progress, labour, plant, visitors & issues.',
  },
  survey: {
    id: 'survey',
    path: 'site-survey',
    title: 'Site Survey Report',
    accent: '59,130,246', // blue
    icon: '📐',
    description: 'Observations, measurements, photos & condition notes.',
  },
  progress: {
    id: 'progress',
    path: 'weekly-report',
    title: 'Site Progress Report',
    accent: '34,197,94', // green
    icon: '📊',
    description: 'Progress, risks, delays & next-week priorities.',
  },
  snag: {
    id: 'snag',
    path: 'snags',
    title: 'Site Snag List',
    accent: '255,210,72', // yellow
    icon: '⚠️',
    description: 'Defects, photos, actions & close-out tracking.',
  },
  healthSafety: {
    id: 'healthSafety',
    path: 'weekly-hs',
    title: 'Site H&S Report',
    accent: '255,59,48', // red
    icon: '🦺',
    description: 'Hazards, inspections & compliance.',
  },
}

/** Ordered list for dashboard module grids */
export const REPORT_THEME_LIST = [
  REPORT_THEMES.survey,
  REPORT_THEMES.diary,
  REPORT_THEMES.progress,
  REPORT_THEMES.snag,
  REPORT_THEMES.healthSafety,
]

export function getReportTheme(key) {
  return REPORT_THEMES[key] || REPORT_THEMES.diary
}

/** Format "Client · Location" metadata line */
export function formatProjectMeta(project) {
  if (!project) return ''
  return [project.client_name, project.site_address].filter(Boolean).join(' · ')
}
