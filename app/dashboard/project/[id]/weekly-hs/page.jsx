'use client'

import { SimpleBrandedReportPage } from '@/components/reports/SimpleBrandedReportPage'
import { REPORT_THEMES } from '@/lib/report-theme'

export default function WeeklyHsPage() {
  return (
    <SimpleBrandedReportPage
      title={REPORT_THEMES.healthSafety.title}
      tableName="weekly_hs_reports"
      accent={REPORT_THEMES.healthSafety.accent}
    />
  )
}
