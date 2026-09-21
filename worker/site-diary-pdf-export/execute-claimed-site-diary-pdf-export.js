import { preflightSiteDiaryPdfExport } from './preflight-site-diary-pdf-export.js'
import { processSiteDiaryPdfExport } from './process-site-diary-pdf-export.js'
import {
  executeClaimedSiteDiaryPdfExportCore,
  ClaimedSiteDiaryPdfExportExecutionError,
  buildSiteDiaryPdfExportStoragePath,
  classifyExecutionFailure,
  executionFailMessageForCode,
  uploadSiteDiaryPdfExportObject,
  invokeCompleteSiteDiaryPdfExport,
  invokeFailSiteDiaryPdfExport,
} from './execute-claimed-site-diary-pdf-export-core.js'

export {
  ClaimedSiteDiaryPdfExportExecutionError,
  buildSiteDiaryPdfExportStoragePath,
  classifyExecutionFailure,
  executionFailMessageForCode,
  uploadSiteDiaryPdfExportObject,
  invokeCompleteSiteDiaryPdfExport,
  invokeFailSiteDiaryPdfExport,
  executeClaimedSiteDiaryPdfExportCore,
} from './execute-claimed-site-diary-pdf-export-core.js'

/**
 * Durable single claimed-job execution: preflight → process → upload → complete.
 * Does not claim or poll — caller must hold an already-claimed export row.
 *
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   workerId: string
 *   exportJob: Record<string, unknown>
 *   dependencies?: {
 *     preflight?: typeof preflightSiteDiaryPdfExport
 *     processExport?: typeof processSiteDiaryPdfExport
 *     uploadObject?: typeof uploadSiteDiaryPdfExportObject
 *     completeExport?: typeof invokeCompleteSiteDiaryPdfExport
 *     failExport?: typeof invokeFailSiteDiaryPdfExport
 *   }
 * }} input
 */
export async function executeClaimedSiteDiaryPdfExport({
  admin,
  workerId,
  exportJob,
  dependencies = {},
}) {
  const {
    preflight = preflightSiteDiaryPdfExport,
    processExport = processSiteDiaryPdfExport,
    uploadObject,
    completeExport,
    failExport,
  } = dependencies

  return executeClaimedSiteDiaryPdfExportCore({
    admin,
    workerId,
    exportJob,
    preflight,
    processExport,
    uploadObject,
    completeExport,
    failExport,
  })
}
