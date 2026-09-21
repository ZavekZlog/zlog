export class WorkerPdfProcessorError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'invalid-export-job') {
    super(message)
    this.name = 'WorkerPdfProcessorError'
    this.code = code
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FINGERPRINT_RE = /^[0-9a-f]{64}$/

/**
 * @param {unknown} value
 * @param {string} field
 */
function requireUuid(value, field) {
  const raw = String(value ?? '').trim()
  if (!raw || !UUID_RE.test(raw)) {
    throw new WorkerPdfProcessorError(`Invalid export job: ${field} is required`)
  }
  return raw
}

/**
 * @param {Record<string, unknown>} exportJob
 */
export function validateExportJob(exportJob) {
  if (!exportJob || typeof exportJob !== 'object') {
    throw new WorkerPdfProcessorError('Invalid export job: row is required')
  }

  const exportId = requireUuid(exportJob.id, 'export id')
  const reportId = requireUuid(exportJob.report_id, 'report id')
  const projectId = requireUuid(exportJob.project_id, 'project id')
  const ownerId = requireUuid(exportJob.owner_id, 'owner id')

  const fingerprint = String(exportJob.content_fingerprint ?? '').trim().toLowerCase()
  if (!FINGERPRINT_RE.test(fingerprint)) {
    throw new WorkerPdfProcessorError('Invalid export job: content fingerprint is invalid')
  }

  const snapshotVersion = Number(exportJob.snapshot_version)
  if (!Number.isInteger(snapshotVersion) || snapshotVersion < 1) {
    throw new WorkerPdfProcessorError('Invalid export job: snapshot version is invalid')
  }

  return {
    exportId,
    reportId,
    projectId,
    ownerId,
    contentFingerprint: fingerprint,
    snapshotVersion,
  }
}

/**
 * @param {{ report?: { id?: string, project_id?: string } }} assembled
 * @param {{ reportId: string, projectId: string }} validated
 */
export function assertAssembledReportMatchesExport(assembled, validated) {
  const report = assembled?.report
  if (!report) {
    throw new WorkerPdfProcessorError('Assembly did not return report data', 'report-identity-mismatch')
  }
  if (String(report.id) !== String(validated.reportId)) {
    throw new WorkerPdfProcessorError('Assembled report id does not match export job', 'report-identity-mismatch')
  }
  if (String(report.project_id) !== String(validated.projectId)) {
    throw new WorkerPdfProcessorError('Assembled project id does not match export job', 'project-identity-mismatch')
  }
}

/**
 * @param {{
 *   admin: unknown
 *   exportJob: Record<string, unknown>
 *   pipeline: {
 *     assembleSiteDiaryPdfDocumentProps: Function
 *     assertDiaryPdfPhotosComplete: Function
 *     renderSiteDiaryPdfBuffer: Function
 *   }
 *   photosIncompleteError?: typeof Error
 *   photosIncompleteMessage?: string
 * }} input
 */
export async function processSiteDiaryPdfExportCore({
  admin,
  exportJob,
  pipeline,
  photosIncompleteError,
  photosIncompleteMessage = 'PDF photos incomplete',
}) {
  const validated = validateExportJob(exportJob)

  const assembled = await pipeline.assembleSiteDiaryPdfDocumentProps(admin, validated.reportId)
  if (!assembled?.ok) {
    throw new WorkerPdfProcessorError(
      assembled?.message || 'Site Diary PDF assembly failed',
      'assembly-failed',
    )
  }

  assertAssembledReportMatchesExport(assembled, validated)

  const gate = pipeline.assertDiaryPdfPhotosComplete({
    expected: assembled.photoRows || [],
    prepared: assembled.props.photos,
  })
  if (!gate.ok) {
    const Err = photosIncompleteError || Error
    throw new Err(photosIncompleteMessage, gate)
  }

  const rendered = await pipeline.renderSiteDiaryPdfBuffer(assembled.props)
  const buffer = rendered.buffer

  return {
    buffer,
    byteSize: buffer.length,
    reportId: validated.reportId,
    exportId: validated.exportId,
  }
}
