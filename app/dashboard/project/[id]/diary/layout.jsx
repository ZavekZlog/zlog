import { SiteDiarySessionProvider } from '@/lib/site-diary-report-session'

/**
 * Persistent Site Diary route boundary (S1).
 * Survives navigation between saved viewer and workbench child routes.
 * No chrome, data fetch, or surface imports — provider only.
 */
export default function SiteDiaryLayout({ children }) {
  return <SiteDiarySessionProvider>{children}</SiteDiarySessionProvider>
}
