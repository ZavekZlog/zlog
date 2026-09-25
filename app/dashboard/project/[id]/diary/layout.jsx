import { SiteDiarySessionProvider } from '@/lib/site-diary-report-session'
import SiteDiaryReportShell from '@/components/site-diary/SiteDiaryReportShell'

/**
 * Persistent Site Diary route boundary (S1 + S3A shell).
 * Survives navigation between saved viewer and workbench child routes.
 */
export default function SiteDiaryLayout({ children }) {
  return (
    <SiteDiarySessionProvider>
      <SiteDiaryReportShell>{children}</SiteDiaryReportShell>
    </SiteDiarySessionProvider>
  )
}
