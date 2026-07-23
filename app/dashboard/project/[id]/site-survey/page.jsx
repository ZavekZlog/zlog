'use client'

import { SimpleBrandedReportPage } from '@/components/reports/SimpleBrandedReportPage'
import { REPORT_THEMES } from '@/lib/report-theme'

export default function SiteSurveyPage() {
  return (
    <SimpleBrandedReportPage
      title={REPORT_THEMES.survey.title}
      tableName="site_survey_reports"
      accent={REPORT_THEMES.survey.accent}
    />
  )
}
