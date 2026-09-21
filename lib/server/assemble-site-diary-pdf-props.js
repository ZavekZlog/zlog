import 'server-only'
import { temporaryWorksForPdf } from '@/lib/diary-daily-records'
import { buildDiaryPdfPhotos } from '@/lib/diary-pdf-photos'
import {
  migrateLegacyCoverIfNeeded,
  resolveCoverPdfSource,
} from '@/lib/diary-cover-photo'
import { resolvePdfReportBrandColor } from '@/lib/diary-reporting-company'
import {
  batchSignedUrlsForStoragePaths,
  signPdfReportAssets,
  signedUrlForPath,
} from '@/lib/diary-share-pdf-assets'
import { fetchDailyReportRowForSiteDiaryPdf } from '@/lib/diary-share-report-fetch'
import {
  uprightJpegBlobToPdfDataUrl,
  uprightSignedUrlToPdfDataUrl,
  applyRotationToPdfDataUrl,
  fetchHttpBlob,
} from '@/lib/server/pdf-image-server.js'
import {
  preloadPhaseCWorkPhotoSources,
  SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY,
} from '@/lib/server/preload-phase-c-work-photos.js'

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin service-role (authorized)
 * @param {string} reportId
 */
export async function assembleSiteDiaryPdfDocumentProps(admin, reportId) {
  const timings = {
    reportDataMs: 0,
    workPhotosMs: 0,
    workPhotoDownloadMs: 0,
    workPhotoBuildMs: 0,
    serverPhotoDownloadConcurrency: SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY,
    coverMs: 0,
    brandingMs: 0,
  }
  const totalStart = nowMs()

  const reportT0 = nowMs()
  const { data: report, error: reportError } = await fetchDailyReportRowForSiteDiaryPdf(
    admin,
    reportId,
    { timeoutMs: 60_000 },
  )
  timings.reportDataMs += nowMs() - reportT0

  if (reportError || !report) {
    return { ok: false, message: "We couldn't load this Site Diary for PDF export.", timings }
  }

  const brandingT0 = nowMs()
  let companyName = ''
  let brandingRow = null
  if (report.branding_id) {
    const { data: branding } = await admin
      .from('company_brandings')
      .select('company_name, logo_url, brand_color')
      .eq('id', report.branding_id)
      .maybeSingle()
    brandingRow = branding || null
    companyName = String(branding?.company_name || '').trim()
  }
  timings.brandingMs += nowMs() - brandingT0

  async function uprightCoverForServer(signedCoverUrl) {
    const coverT0 = nowMs()
    try {
      const migrated = await migrateLegacyCoverIfNeeded(admin, {
        reportId: report.id,
        coverPath: report.cover_photo_url,
        coverProcessingVersion: report.cover_processing_version,
        signedCoverUrl,
        localPreparedBlob: null,
      })
      if (migrated.ok) {
        report.cover_photo_url = migrated.coverPath
        report.cover_processing_version = migrated.coverProcessingVersion
      }
      const resolved = await resolveCoverPdfSource(signedCoverUrl, {
        coverPath: migrated.coverPath ?? report.cover_photo_url,
        coverProcessingVersion: migrated.coverProcessingVersion ?? report.cover_processing_version,
        localPreparedBlob: migrated.localPreparedBlob ?? null,
        uprightCoverFn: uprightSignedUrlToPdfDataUrl,
      })
      return resolved
    } finally {
      timings.coverMs += nowMs() - coverT0
    }
  }

  const assetsT0 = nowMs()
  const { logoUrl, coverPhotoUrl, signatureSrc } = await signPdfReportAssets(
    admin,
    report,
    uprightCoverForServer,
  )
  timings.coverMs += nowMs() - assetsT0

  let photoRows = []
  const photosQueryT0 = nowMs()
  {
    const primary = await admin
      .from('report_photos')
      .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version, report_byte_size')
      .eq('report_id', reportId)
      .order('sequence')
    if (primary.error && /report_byte_size/i.test(primary.error.message || '')) {
      const fallback = await admin
        .from('report_photos')
        .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version')
        .eq('report_id', reportId)
        .order('sequence')
      photoRows = fallback.data || []
    } else if (primary.error && /processing_version/i.test(primary.error.message || '')) {
      const fallback = await admin
        .from('report_photos')
        .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to')
        .eq('report_id', reportId)
        .order('sequence')
      photoRows = fallback.data || []
    } else if (primary.error && /assigned_to/i.test(primary.error.message || '')) {
      const fallback = await admin
        .from('report_photos')
        .select('url, caption, sequence, layout, location, rotation_degrees')
        .eq('report_id', reportId)
        .order('sequence')
      photoRows = fallback.data || []
    } else if (primary.error && /rotation_degrees/i.test(primary.error.message || '')) {
      const fallback = await admin
        .from('report_photos')
        .select('url, caption, sequence, layout, location, assigned_to')
        .eq('report_id', reportId)
        .order('sequence')
      photoRows = fallback.data || []
    } else if (primary.error) {
      return { ok: false, message: "We couldn't load the diary photos for PDF export.", timings }
    } else {
      photoRows = primary.data || []
    }
  }
  timings.reportDataMs += nowMs() - photosQueryT0

  const labourT0 = nowMs()
  const { data: labourRows } = await admin
    .from('report_labour')
    .select('trade, company, count, hours')
    .eq('report_id', reportId)
    .order('sequence')
  timings.reportDataMs += nowMs() - labourT0

  const { data: projectReferenceRow } = await admin
    .from('projects')
    .select('project_reference')
    .eq('id', report.project_id)
    .maybeSingle()

  const preloadT0 = nowMs()
  const preloaded = await preloadPhaseCWorkPhotoSources(admin, photoRows)
  const localPrepared = preloaded.localPrepared
  timings.workPhotoDownloadMs += nowMs() - preloadT0
  timings.photoCount = preloaded.photoCount
  timings.serverPhotoDownloadConcurrency = preloaded.serverDownloadConcurrency

  const photosT0 = nowMs()
  const photos = await buildDiaryPdfPhotos(
    photoRows,
    async (photo) => signedUrlForPath(admin, photo.url),
    {
      batchSignStoragePaths: (paths) => batchSignedUrlsForStoragePaths(admin, paths),
      localPreparedPhotoSources: localPrepared,
      inflightDiagScope: 'server-pdf-proof',
      inflightDiagRunId: `srv-${Math.random().toString(36).slice(2, 8)}`,
      serverImageFlatten: async ({ baseSrc, maxEdge, localBlob, rotationDegrees }) => {
        let blob = localBlob instanceof Blob && localBlob.size ? localBlob : null
        if (!blob && baseSrc) {
          if (String(baseSrc).startsWith('data:')) {
            return String(baseSrc)
          }
          blob = await fetchHttpBlob(baseSrc)
        }
        if (!blob) return null
        let dataUrl = await uprightJpegBlobToPdfDataUrl(blob, maxEdge)
        dataUrl = await applyRotationToPdfDataUrl(dataUrl, rotationDegrees)
        return dataUrl
      },
    },
  )
  timings.workPhotoBuildMs += nowMs() - photosT0
  timings.workPhotosMs = timings.workPhotoDownloadMs + timings.workPhotoBuildMs

  const projectName = report.projects?.name || 'Site Diary'
  const projectReference = String(projectReferenceRow?.project_reference || '').trim()
  const equipmentHire = Array.isArray(report.equipment_hire) ? report.equipment_hire : []
  const temporaryWorks =
    report.temporary_works_applicable === false || !Array.isArray(report.temporary_works)
      ? []
      : temporaryWorksForPdf(report.temporary_works)

  const props = {
    projectName,
    projectAddress: report.projects?.site_address || '',
    projectReference,
    clientName: report.projects?.client_name || '',
    reportingOnBehalfOf: report.company_reporting_for || '',
    reportReference: report.report_number || '',
    reportDate: report.report_date || '',
    projectManager: report.projects?.client_pm || '',
    commencementDate: report.projects?.start_date || '',
    plannedCompletionDate: report.projects?.planned_completion_date || '',
    shift: report.shift || '',
    weather: report.weather || '',
    siteSummary: report.site_summary || '',
    brandColor: resolvePdfReportBrandColor({ report, brandingRow }),
    logoUrl,
    companyName,
    coverPhotoUrl,
    photos,
    labour: labourRows || [],
    equipmentHire,
    temporaryWorks,
    authorName: report.creator_name || '',
    authorRole: report.creator_role || '',
    signatureSrc,
  }

  timings.totalAssemblyMs = nowMs() - totalStart
  if (!timings.photoCount) {
    timings.photoCount = photoRows.length
  }

  return { ok: true, props, report, photoRows, timings }
}
