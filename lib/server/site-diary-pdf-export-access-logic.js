/**
 * Authorize and load a ready Site Diary PDF export artifact (testable, no server-only).
 */

import { authorizeSiteDiaryReportForUser } from './site-diary-report-access-logic.js'

export const SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET = 'site-diary-pdf-exports'

/** Short-lived signed URL for immediate Save & Share artifact download (seconds). */
export const SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS = 120

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FINGERPRINT_RE = /^[0-9a-f]{64}$/

function trimString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {string} storagePath
 */
export function assertSafeSiteDiaryPdfExportStoragePath(storagePath, identity) {
  const path = trimString(storagePath)
  if (!path || path.includes('..') || path.startsWith('/')) {
    return { ok: false, code: 'artifact-path-invalid' }
  }

  const ownerId = trimString(identity.ownerId)
  const reportId = trimString(identity.reportId)
  const fingerprint = trimString(identity.contentFingerprint).toLowerCase()

  if (!UUID_RE.test(ownerId) || !UUID_RE.test(reportId) || !FINGERPRINT_RE.test(fingerprint)) {
    return { ok: false, code: 'artifact-path-invalid' }
  }

  const expected = `${ownerId}/${reportId}/${fingerprint}.pdf`
  if (path !== expected) {
    return { ok: false, code: 'artifact-path-mismatch' }
  }

  return { ok: true, storagePath: path }
}

/**
 * @param {string} reportDate
 */
export function buildSiteDiaryPdfExportFileName(reportDate) {
  const safeDate = String(reportDate || 'report').replace(/[^\d-]/g, '')
  return `Zlog-Site-Diary-${safeDate || 'report'}.pdf`
}

/**
 * @param {{ projectName?: string|null }} meta
 */
export function buildSiteDiaryPdfExportShareMetadata(meta = {}) {
  const projectName = trimString(meta.projectName)
  const title = 'Site Diary'
  const text = projectName ? `${projectName} — Site Diary` : title
  return { title, text }
}

/**
 * @param {{
 *   userSupabase: import('@supabase/supabase-js').SupabaseClient
 *   adminSupabase: import('@supabase/supabase-js').SupabaseClient
 *   reportId: string
 *   exportId: string
 *   loadExportRow?: (admin: unknown, exportId: string) => Promise<{ data: Record<string, unknown>|null, error: unknown|null }>
 *   loadReportMeta?: (admin: unknown, reportId: string) => Promise<{ reportDate: string|null, projectName: string|null }>
 *   signStorageObject?: (admin: unknown, bucket: string, path: string, expiresInSeconds: number) => Promise<{ data: { signedUrl?: string }|null, error: unknown|null }>
 *   signedUrlExpirySeconds?: number
 * }} input
 */
export async function resolveReadySiteDiaryPdfExportArtifact({
  userSupabase,
  adminSupabase,
  reportId,
  exportId,
  loadExportRow,
  loadReportMeta,
  signStorageObject,
  signedUrlExpirySeconds = SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS,
}) {
  const auth = await authorizeSiteDiaryReportForUser(userSupabase, adminSupabase, reportId)
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      code: auth.code,
    }
  }

  const {
    data: { user },
  } = await userSupabase.auth.getUser()
  if (!user?.id) {
    return { ok: false, status: 401, code: 'unauthenticated' }
  }

  const normalizedExportId = trimString(exportId)
  if (!UUID_RE.test(normalizedExportId)) {
    return { ok: false, status: 400, code: 'invalid-export-id' }
  }

  const rowLoader =
    loadExportRow
    || (async (admin, id) =>
      admin
        .from('site_diary_pdf_exports')
        .select(
          'id, report_id, owner_id, project_id, content_fingerprint, status, storage_bucket, storage_path, byte_size',
        )
        .eq('id', id)
        .maybeSingle())

  const { data: row, error: rowError } = await rowLoader(adminSupabase, normalizedExportId)
  if (rowError) {
    return {
      ok: false,
      status: 500,
      code: 'export-load-failed',
      message: 'Could not load PDF export.',
    }
  }
  if (!row) {
    return { ok: false, status: 404, code: 'export-not-found' }
  }

  if (String(row.owner_id) !== String(user.id)) {
    return { ok: false, status: 403, code: 'forbidden' }
  }
  if (String(row.report_id) !== String(auth.reportId)) {
    return { ok: false, status: 403, code: 'export-report-mismatch' }
  }

  const status = trimString(row.status).toLowerCase()
  if (status === 'queued' || status === 'processing') {
    return {
      ok: false,
      status: 409,
      code: 'export-not-ready',
      message: 'PDF export is not ready yet.',
      exportStatus: status,
    }
  }
  if (status === 'failed') {
    return {
      ok: false,
      status: 409,
      code: 'export-failed',
      message: 'PDF export failed.',
      exportStatus: status,
    }
  }
  if (status !== 'ready') {
    return {
      ok: false,
      status: 409,
      code: 'export-not-ready',
      message: 'PDF export is not ready yet.',
      exportStatus: status,
    }
  }

  const storagePath = trimString(row.storage_path)
  if (!storagePath) {
    return {
      ok: false,
      status: 409,
      code: 'export-artifact-missing',
      message: 'PDF export file is not available.',
    }
  }

  const bucket = trimString(row.storage_bucket) || SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET
  if (bucket !== SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET) {
    return { ok: false, status: 500, code: 'storage-bucket-mismatch' }
  }

  const pathCheck = assertSafeSiteDiaryPdfExportStoragePath(storagePath, {
    ownerId: row.owner_id,
    reportId: row.report_id,
    contentFingerprint: row.content_fingerprint,
  })
  if (!pathCheck.ok) {
    return {
      ok: false,
      status: 500,
      code: pathCheck.code,
      message: 'PDF export file is not available.',
    }
  }

  const metaLoader =
    loadReportMeta
    || (async (admin, id) => {
      const { data, error } = await admin
        .from('daily_reports')
        .select('report_date, projects ( name )')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) {
        return { reportDate: null, projectName: null }
      }
      const projectName =
        data.projects && typeof data.projects === 'object' ? data.projects.name : null
      return {
        reportDate: data.report_date ?? null,
        projectName: projectName ?? null,
      }
    })

  const meta = await metaLoader(adminSupabase, auth.reportId)

  const expirySeconds = Math.max(1, Math.floor(Number(signedUrlExpirySeconds) || SITE_DIARY_PDF_EXPORT_SIGNED_URL_EXPIRY_SECONDS))

  const signer =
    signStorageObject
    || (async (admin, bucketName, path, expiresIn) =>
      admin.storage.from(bucketName).createSignedUrl(path, expiresIn))

  const { data: signedData, error: signError } = await signer(
    adminSupabase,
    bucket,
    pathCheck.storagePath,
    expirySeconds,
  )

  const signedUrl = trimString(signedData?.signedUrl)
  if (signError || !signedUrl) {
    return {
      ok: false,
      status: 502,
      code: 'artifact-sign-failed',
      message: 'Could not download the PDF export. Try again.',
    }
  }

  const fileName = buildSiteDiaryPdfExportFileName(meta.reportDate)
  const { title, text } = buildSiteDiaryPdfExportShareMetadata({ projectName: meta.projectName })

  return {
    ok: true,
    signedUrl,
    expiresInSeconds: expirySeconds,
    fileName,
    title,
    text,
    reportId: auth.reportId,
    exportId: normalizedExportId,
  }
}
