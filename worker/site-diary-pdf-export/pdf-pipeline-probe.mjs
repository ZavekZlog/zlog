/**
 * Non-production build probe — import resolution only (no PDF execution).
 */
import { assembleSiteDiaryPdfDocumentProps } from '@/lib/server/assemble-site-diary-pdf-props.js'
import { assertDiaryPdfPhotosComplete } from '@/lib/diary-pdf-photos.js'
import { renderSiteDiaryPdfBuffer } from '@/lib/server/render-site-diary-pdf.js'

export const WORKER_PDF_PIPELINE_PROBE = {
  version: 1,
  assembleSiteDiaryPdfDocumentProps,
  assertDiaryPdfPhotosComplete,
  renderSiteDiaryPdfBuffer,
}
