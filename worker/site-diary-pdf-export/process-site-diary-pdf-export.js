import { assembleSiteDiaryPdfDocumentProps } from '@/lib/server/assemble-site-diary-pdf-props.js'
import {
  assertDiaryPdfPhotosComplete,
  DiaryPdfPhotosIncompleteError,
  DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
} from '@/lib/diary-pdf-photos.js'
import { renderSiteDiaryPdfBuffer } from '@/lib/server/render-site-diary-pdf.js'
import { processSiteDiaryPdfExportCore } from './process-site-diary-pdf-export-core.js'

export {
  validateExportJob,
  assertAssembledReportMatchesExport,
  WorkerPdfProcessorError,
} from './process-site-diary-pdf-export-core.js'

export const DEFAULT_WORKER_PDF_PIPELINE = {
  assembleSiteDiaryPdfDocumentProps,
  assertDiaryPdfPhotosComplete,
  renderSiteDiaryPdfBuffer,
}

/**
 * Queue integration note: owner_id and content_fingerprint staleness vs live report
 * are not verified here — reserved for queue-processing / enqueue integration.
 *
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   exportJob: Record<string, unknown>
 *   pipeline?: typeof DEFAULT_WORKER_PDF_PIPELINE
 * }} input
 */
export async function processSiteDiaryPdfExport({ admin, exportJob, pipeline = DEFAULT_WORKER_PDF_PIPELINE }) {
  return processSiteDiaryPdfExportCore({
    admin,
    exportJob,
    pipeline,
    photosIncompleteError: DiaryPdfPhotosIncompleteError,
    photosIncompleteMessage: DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
  })
}
