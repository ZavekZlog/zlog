import {
  SITE_DIARY_PDF_SNAPSHOT_V1,
  buildSiteDiaryPdfFingerprint,
} from '../../lib/site-diary-pdf-snapshot-v1.js'
import { validateExportJob, WorkerPdfProcessorError } from './process-site-diary-pdf-export-core.js'

export class SiteDiaryPdfExportPreflightError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'SiteDiaryPdfExportPreflightError'
    this.code = code
  }
}

const GENERIC_MESSAGES = {
  snapshot_version_mismatch: 'This PDF export uses an unsupported snapshot version.',
  report_not_found: 'Site Diary report was not found.',
  ownership_mismatch: 'This PDF export no longer matches the saved Site Diary.',
  content_changed: 'Site Diary content changed since this export was requested.',
  snapshot_load_failed: 'Could not load Site Diary data for export validation.',
}

/**
 * @param {string} code
 */
export function preflightErrorMessage(code) {
  return GENERIC_MESSAGES[code] || 'PDF export validation failed.'
}

/**
 * @param {{
 *   admin: unknown
 *   exportJob: Record<string, unknown>
 *   loadSnapshotSource?: typeof import('@/lib/server/load-site-diary-pdf-snapshot-source.js').loadSiteDiaryPdfSnapshotSource
 * }} input
 */
export async function preflightSiteDiaryPdfExportCore({
  admin,
  exportJob,
  loadSnapshotSource,
}) {
  const validated = validateExportJob(exportJob)

  if (validated.snapshotVersion !== SITE_DIARY_PDF_SNAPSHOT_V1.version) {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('snapshot_version_mismatch'),
      'snapshot_version_mismatch',
    )
  }

  const loader = loadSnapshotSource
  if (typeof loader !== 'function') {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('snapshot_load_failed'),
      'snapshot_load_failed',
    )
  }

  const loaded = await loader(admin, validated.reportId)

  if (!loaded?.ok) {
    const code = loaded?.code === 'report_not_found' ? 'report_not_found' : 'snapshot_load_failed'
    throw new SiteDiaryPdfExportPreflightError(preflightErrorMessage(code), code)
  }

  if (String(loaded.reportId) !== String(validated.reportId)) {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('ownership_mismatch'),
      'ownership_mismatch',
    )
  }

  if (String(loaded.projectId) !== String(validated.projectId)) {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('ownership_mismatch'),
      'ownership_mismatch',
    )
  }

  if (String(loaded.ownerId) !== String(validated.ownerId)) {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('ownership_mismatch'),
      'ownership_mismatch',
    )
  }

  const currentFingerprint = buildSiteDiaryPdfFingerprint(loaded.snapshotRaw)
  if (currentFingerprint !== validated.contentFingerprint) {
    throw new SiteDiaryPdfExportPreflightError(
      preflightErrorMessage('content_changed'),
      'content_changed',
    )
  }

  return {
    reportId: validated.reportId,
    projectId: validated.projectId,
    ownerId: validated.ownerId,
    contentFingerprint: validated.contentFingerprint,
    snapshotVersion: validated.snapshotVersion,
  }
}

export { WorkerPdfProcessorError }
