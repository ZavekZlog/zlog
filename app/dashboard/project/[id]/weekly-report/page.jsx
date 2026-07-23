'use client'

import { SimpleBrandedReportPage } from '@/components/reports/SimpleBrandedReportPage'
import { REPORT_THEMES } from '@/lib/report-theme'

export default function WeeklyProgressPage() {
  return (
    <SimpleBrandedReportPage
      title={REPORT_THEMES.progress.title}
      tableName="weekly_progress_reports"
      accent={REPORT_THEMES.progress.accent}
    />
  )
}
