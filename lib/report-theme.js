/**
 * Report-type colour mapping for module identity accents.
 * Values are RGB channel strings for use in rgba() / CSS custom properties.
 * Approved dashboard accents — do not invent new hexes here.
 */
export const REPORT_THEMES = {
  diary: {
    id: 'diary',
    path: 'diary',
    title: 'Site Diary Report',
    accent: '255,140,66', // orange
    icon: '📋',
    description: 'Voice-led daily progress, labour, plant, visitors, delays and issues.',
  },
  survey: {
    id: 'survey',
    path: 'site-survey',
    title: 'Site Survey Report',
    accent: '59,130,246', // blue
    icon: '📐',
    description: 'Voice-led site observations, measurements, photos and condition notes.',
  },
  progress: {
    id: 'progress',
    path: 'weekly-report',
    title: 'Site Progress Report',
    accent: '34,197,94', // green
    icon: '📊',
    description: 'Voice-led weekly progress, risks, delays, photos and next-week priorities.',
  },
  snag: {
    id: 'snag',
    path: 'snags',
    title: 'Site Snag List',
    accent: '255,210,72', // yellow
    icon: '⚠️',
    description: 'Voice-led defect capture, photos, actions and close-out tracking.',
  },
  healthSafety: {
    id: 'healthSafety',
    path: 'weekly-hs',
    title: 'Site H&S Report',
    accent: '255,59,48', // red
    icon: '🦺',
    description: 'Voice-led hazards, inspections, toolbox talks, incidents and compliance checks.',
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
