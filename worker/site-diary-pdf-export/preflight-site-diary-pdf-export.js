import { loadSiteDiaryPdfSnapshotSource } from '../../lib/load-site-diary-pdf-snapshot-source.js'
import { preflightSiteDiaryPdfExportCore } from './preflight-site-diary-pdf-export-core.js'

export {
  SiteDiaryPdfExportPreflightError,
  preflightErrorMessage,
  preflightSiteDiaryPdfExportCore,
  WorkerPdfProcessorError,
} from './preflight-site-diary-pdf-export-core.js'

/**
 * Validate claimed export against current persisted Site Diary snapshot identity.
 * No PDF assembly, render, Storage, or worker RPCs.
 *
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   exportJob: Record<string, unknown>
 *   loadSnapshotSource?: typeof loadSiteDiaryPdfSnapshotSource
 * }} input
 */
export async function preflightSiteDiaryPdfExport({
  admin,
  exportJob,
  loadSnapshotSource = loadSiteDiaryPdfSnapshotSource,
}) {
  return preflightSiteDiaryPdfExportCore({
    admin,
    exportJob,
    loadSnapshotSource,
  })
}
