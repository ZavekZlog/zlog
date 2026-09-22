/**
 * Authoritative DB-backed Site Diary PDF export fingerprint (testable, no server-only).
 */

import { authorizeSiteDiaryReportForUser } from './site-diary-report-access-logic.js'
import { loadSiteDiaryPdfSnapshotSource } from '../load-site-diary-pdf-snapshot-source.js'
import {
  SITE_DIARY_PDF_SNAPSHOT_V1,
  buildSiteDiaryPdfFingerprint,
} from '../site-diary-pdf-snapshot-v1.js'

/**
 * @param {{
 *   userSupabase: import('@supabase/supabase-js').SupabaseClient
 *   adminSupabase: import('@supabase/supabase-js').SupabaseClient
 *   reportId: string
 *   loadSnapshotSource?: typeof loadSiteDiaryPdfSnapshotSource
 * }} input
 */
export async function resolveSiteDiaryPdfExportFingerprint({
  userSupabase,
  adminSupabase,
  reportId,
  loadSnapshotSource = loadSiteDiaryPdfSnapshotSource,
}) {
  const auth = await authorizeSiteDiaryReportForUser(userSupabase, adminSupabase, reportId)
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      code: auth.code,
    }
  }

  const loaded = await loadSnapshotSource(adminSupabase, auth.reportId)
  if (!loaded?.ok) {
    const code = loaded?.code === 'report_not_found' ? 'report-not-found' : 'snapshot-load-failed'
    const status = code === 'report-not-found' ? 404 : 500
    return {
      ok: false,
      status,
      code,
      message: loaded?.message || 'Could not load Site Diary data for export.',
    }
  }

  const contentFingerprint = buildSiteDiaryPdfFingerprint(loaded.snapshotRaw)

  return {
    ok: true,
    reportId: String(loaded.reportId),
    contentFingerprint,
    snapshotVersion: SITE_DIARY_PDF_SNAPSHOT_V1.version,
  }
}
