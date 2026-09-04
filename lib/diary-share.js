/**
 * Site Diary share / PDF handoff.
 * Prepare once; deliver only via explicit Share / Email / WhatsApp / Save PDF actions.
 * Never auto-download on prepare or page load.
 */

import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/client'
import { DiaryPdfDocument } from '@/components/pdf/DiaryPdfDocument'
import { temporaryWorksForPdf } from '@/lib/diary-daily-records'
import {
  buildDiaryPdfPhotos,
  DiaryPdfPhotosIncompleteError,
  DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
} from '@/lib/diary-pdf-photos'
import { resolvePdfReportBrandColor } from '@/lib/diary-reporting-company'
import { orientedImageToDataUrlForPdf } from '@/lib/image-orientation'
import {
  canSharePdfFile,
  canUseSaveFilePicker,
  diaryNativeShareUnavailableMessage,
} from '@/lib/diary-share-capabilities'
import { emitShareDiag } from '@/lib/share-diag-beacon'
import { markShareTiming, patchShareTimingCounts } from '@/lib/diary-share-timing-diag'
import {
  buildSharePdfFingerprint,
  storeShareReadyPdf,
} from '@/lib/diary-pdf-cache'
import {
  batchSignedUrlsForStoragePaths,
  signPdfReportAssets,
  signedUrlForPath,
} from '@/lib/diary-share-pdf-assets'
import {
  migrateLegacyCoverIfNeeded,
  resolveCoverPdfSource,
} from '@/lib/diary-cover-photo'

export {
  buildDiaryEmailMailto,
  canNativeShare,
  canSharePdfFile,
  canUseSaveFilePicker,
  diaryEmailFallbackMessage,
  diaryNativeShareUnavailableMessage,
  diaryWhatsAppUnavailableMessage,
  resolveDiaryShareCapabilities,
} from '@/lib/diary-share-capabilities'

export {
  buildDiaryPdfPhotos,
  assertDiaryPdfPhotosComplete,
  DiaryPdfPhotosIncompleteError,
  DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
} from '@/lib/diary-pdf-photos'

export {
  signPdfReportAssets,
  signedUrlForPath,
} from '@/lib/diary-share-pdf-assets'

/**
 * Flatten cover photo pixels exactly as the browser displays them in Zlog (<img>),
 * then pass EXIF-free JPEG bytes to react-pdf. Shared helper with work photos.
 */
async function flattenCoverBlobForPdf(blob, maxEdge = 2400, quality = 0.92) {
  return orientedImageToDataUrlForPdf(blob, maxEdge, quality)
}

/**
 * Bake cover into upright pixels for @react-pdf Image (browser-display flatten).
 * Browsers honour EXIF on <img>; react-pdf does not — flatten display pixels here.
 * Storage path / persisted cover_photo_url are unchanged.
 */
export async function uprightCoverSrcForPdf(url) {
  if (!url) {
    markShareTiming('pdf_cover_bake_done')
    return null
  }
  const raw = String(url)
  if (raw.startsWith('data:')) {
    markShareTiming('pdf_cover_bake_done')
    return raw
  }

  // Must bake EXIF into pixels before @react-pdf embeds the image. Returning the
  // raw signed URL on failure is what left Android PDFs rotated while <img> looked correct.
  const res = await fetch(raw)
  if (!res.ok) {
    throw new Error('Could not download the cover photo for the PDF.')
  }
  const blob = await res.blob()
  if (!blob || !blob.size) {
    throw new Error('Cover photo for the PDF was empty.')
  }
  const baked = await flattenCoverBlobForPdf(blob, 2400, 0.92)
  const { dataUrl } = baked
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
    throw new Error('Could not normalize cover photo orientation for the PDF.')
  }
  markShareTiming('pdf_cover_bake_done')
  return dataUrl
}

/**
 * Generate the Site Diary PDF (no download, no share sheet).
 */
export async function prepareSiteDiaryPdf({
  projectId,
  reportId,
  localPreparedPhotoSources = null,
  localPreparedCoverBlob = null,
}) {
  if (!reportId) {
    return { ok: false, message: 'This Site Diary could not be shared because it was not opened correctly.' }
  }

  try {
    const supabase = createClient()
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select(`
        id,
        project_id,
        report_number,
        report_date,
        weather,
        shift,
        site_summary,
        company_reporting_for,
        creator_name,
        creator_role,
        signature_url,
        cover_photo_url,
        branding_id,
        brand_color,
        brand_logo_url,
        equipment_hire,
        temporary_works_applicable,
        temporary_works,
        cover_processing_version,
        projects (
          id,
          name,
          site_address,
          client_name,
          client_pm,
          start_date,
          planned_completion_date
        )
      `)
      .eq('id', reportId)
      .maybeSingle()

    if (reportError || !report) {
      return { ok: false, message: "We couldn't load this Site Diary for PDF export. Try again." }
    }

    if (projectId && String(report.project_id) !== String(projectId)) {
      return { ok: false, message: 'This Site Diary does not match the selected project.' }
    }
    markShareTiming('pdf_report_query_done')

    // Phase 4A: branding + logo/cover/signature prep do not depend on work-photo
    // pixels. Start them as soon as the report row is valid; keep photos → labour
    // → bake serial. Attach rejection handlers so an early return cannot leak
    // an unhandled rejection; the original promises still throw when awaited.
    markShareTiming('pdf_branding_start')
    const brandingPromise = (async () => {
      let companyName = ''
      let brandingRow = null
      if (report.branding_id) {
        const { data: branding } = await supabase
          .from('company_brandings')
          .select('company_name, logo_url, brand_color')
          .eq('id', report.branding_id)
          .maybeSingle()
        brandingRow = branding || null
        companyName = String(branding?.company_name || '').trim()
      }
      markShareTiming('pdf_branding_query_done')
      return { companyName, brandingRow }
    })()
    void brandingPromise.catch(() => {})

    markShareTiming('pdf_asset_prep_start')
    let coverMigrated = false
    let coverPreparedBlob = localPreparedCoverBlob
    const pdfAssetPromise = signPdfReportAssets(
      supabase,
      report,
      async (signedCoverUrl) => {
        const migrated = await migrateLegacyCoverIfNeeded(supabase, {
          reportId: report.id,
          coverPath: report.cover_photo_url,
          coverProcessingVersion: report.cover_processing_version,
          signedCoverUrl,
          localPreparedBlob: localPreparedCoverBlob,
        })
        if (migrated.ok) {
          report.cover_photo_url = migrated.coverPath
          report.cover_processing_version = migrated.coverProcessingVersion
          coverMigrated = true
          coverPreparedBlob = migrated.localPreparedBlob
        }
        return resolveCoverPdfSource(signedCoverUrl, {
          coverPath: migrated.coverPath,
          coverProcessingVersion: migrated.coverProcessingVersion,
          localPreparedBlob: migrated.localPreparedBlob,
          uprightCoverFn: uprightCoverSrcForPdf,
        })
      },
    )
    void pdfAssetPromise.catch(() => {})

    let photoRows = []
    {
      const primary = await supabase
        .from('report_photos')
        .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version, report_byte_size')
        .eq('report_id', reportId)
        .order('sequence')
      if (primary.error && /report_byte_size/i.test(primary.error.message || '')) {
        const fallback = await supabase
          .from('report_photos')
          .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version')
          .eq('report_id', reportId)
          .order('sequence')
        photoRows = fallback.data || []
      } else if (primary.error && /processing_version/i.test(primary.error.message || '')) {
        const fallback = await supabase
          .from('report_photos')
          .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to')
          .eq('report_id', reportId)
          .order('sequence')
        photoRows = fallback.data || []
      } else if (primary.error && /assigned_to/i.test(primary.error.message || '')) {
        const fallback = await supabase
          .from('report_photos')
          .select('url, caption, sequence, layout, location, rotation_degrees')
          .eq('report_id', reportId)
          .order('sequence')
        photoRows = fallback.data || []
      } else if (primary.error && /rotation_degrees/i.test(primary.error.message || '')) {
        const fallback = await supabase
          .from('report_photos')
          .select('url, caption, sequence, layout, location, assigned_to')
          .eq('report_id', reportId)
          .order('sequence')
        photoRows = fallback.data || []
      } else if (primary.error) {
        await Promise.allSettled([brandingPromise, pdfAssetPromise])
        return { ok: false, message: "We couldn't load the diary photos for PDF export." }
      } else {
        photoRows = primary.data || []
      }
    }
    markShareTiming('pdf_photos_query_done')

    const { data: labourRows } = await supabase
      .from('report_labour')
      .select('trade, company, count, hours')
      .eq('report_id', reportId)
      .order('sequence')
    markShareTiming('pdf_labour_query_done')
    markShareTiming('pdf_queries_done')
    patchShareTimingCounts({ pdfPhotoCount: Array.isArray(photoRows) ? photoRows.length : 0 })

    const photos = await buildDiaryPdfPhotos(photoRows, async (photo) =>
      signedUrlForPath(supabase, photo.url),
      {
        batchSignStoragePaths: (paths) => batchSignedUrlsForStoragePaths(supabase, paths),
        localPreparedPhotoSources,
      },
    )
    markShareTiming('pdf_photo_sign_fetch_bake_done')

    const { companyName, brandingRow } = await brandingPromise
    const { logoUrl, coverPhotoUrl, signatureSrc } = await pdfAssetPromise
    const projectName = report.projects?.name || 'Site Diary'
    // project_reference is a later project column. Read it independently so a
    // legacy environment without the column still generates the PDF.
    const { data: projectReferenceRow } = await supabase
      .from('projects')
      .select('project_reference')
      .eq('id', report.project_id)
      .maybeSingle()
    markShareTiming('pdf_project_reference_done')
    const projectReference = String(projectReferenceRow?.project_reference || '').trim()
    const equipmentHire = Array.isArray(report.equipment_hire) ? report.equipment_hire : []
    const temporaryWorks =
      report.temporary_works_applicable === false || !Array.isArray(report.temporary_works)
        ? []
        : temporaryWorksForPdf(report.temporary_works)
    const reportDate = report.report_date || ''

    const doc = createElement(DiaryPdfDocument, {
      projectName,
      projectAddress: report.projects?.site_address || '',
      projectReference,
      clientName: report.projects?.client_name || '',
      reportingOnBehalfOf: report.company_reporting_for || '',
      reportReference: report.report_number || '',
      reportDate,
      projectManager: report.projects?.client_pm || '',
      commencementDate: report.projects?.start_date || '',
      plannedCompletionDate: report.projects?.planned_completion_date || '',
      shift: report.shift || '',
      weather: report.weather || '',
      siteSummary: report.site_summary || '',
      // Report snapshot remains primary; an exact same-logo linked profile can
      // deterministically repair legacy colour drift without PDF-time sampling.
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
    })

    markShareTiming('pdf_toBlob_start')
    const blob = await pdf(doc).toBlob()
    markShareTiming('pdf_toBlob_done')

    const safeDate = String(reportDate || 'report').replace(/[^\d-]/g, '')
    const fileName = `Zlog-Site-Diary-${safeDate || 'report'}.pdf`
    const file = new File([blob], fileName, { type: 'application/pdf' })
    markShareTiming('file_ready')
    const title = 'Site Diary'
    const text = `${projectName} — Site Diary`

    const fingerprint = buildSharePdfFingerprint({
      reportId: report.id,
      reportDate,
      updatedAt: report.updated_at || null,
      coverPhotoPath: report.cover_photo_url || null,
      siteSummary: report.site_summary || '',
      weather: report.weather || '',
      shift: report.shift || '',
      photos: photoRows,
    })

    // Persist share-ready PDF so saved-diary Share can reuse without regenerating.
    try {
      await storeShareReadyPdf({
        reportId: report.id,
        projectId: report.project_id,
        fingerprint,
        blob,
        fileName,
        title,
        text,
      })
    } catch {
      // Cache write is best-effort; prepare result remains valid.
    }

    return {
      ok: true,
      blob,
      file,
      fileName,
      projectName,
      reportDate,
      title,
      text,
      fingerprint,
      coverPhotoPath: report.cover_photo_url || null,
      coverProcessingVersion: report.cover_processing_version || null,
      coverMigrated,
      coverPreparedBlob,
    }
  } catch (err) {
    if (err instanceof DiaryPdfPhotosIncompleteError || err?.name === 'DiaryPdfPhotosIncompleteError') {
      const gate = err.gate || {}
      const failures = Array.isArray(gate.failures) ? gate.failures : []
      emitShareDiag('pdf-photos-incomplete', {
        reportId,
        projectId,
        expectedCount: gate.expectedCount ?? null,
        preparedCount: gate.preparedCount ?? null,
        expectedIds: gate.expectedIds || [],
        preparedIds: gate.preparedIds || [],
        failures,
      })
      return {
        ok: false,
        message: err?.message || DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
        code: 'pdf-photos-incomplete',
        failures,
      }
    }
    return {
      ok: false,
      message: err?.message || "We couldn't generate the Site Diary PDF. Try again.",
    }
  }
}

/**
 * Snapshot navigator.userActivation for Android Web Share diagnostics.
 * Returns null fields when the API is unavailable.
 */
export function snapshotUserActivation(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const ua = nav?.userActivation
  if (!ua) {
    return {
      supported: false,
      isActive: null,
      hasBeenActive: null,
    }
  }
  return {
    supported: true,
    isActive: Boolean(ua.isActive),
    hasBeenActive: Boolean(ua.hasBeenActive),
  }
}

/**
 * Open the device share sheet with the PDF file (Web Share API).
 * Does not download.
 *
 * Returns diagnostic fields so callers can prove whether user-activation
 * expired between the original CTA tap and navigator.share().
 */
export async function shareSiteDiaryPdfNative({ file, title, text } = {}) {
  if (!file) {
    return {
      ok: false,
      reason: 'unsupported',
      message: diaryNativeShareUnavailableMessage(),
      diagnostics: {
        stage: 'precheck',
        hasFile: false,
        userActivation: snapshotUserActivation(),
        canShareFiles: null,
      },
    }
  }
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return {
      ok: false,
      reason: 'unsupported',
      message: diaryNativeShareUnavailableMessage(),
      diagnostics: {
        stage: 'precheck',
        hasFile: true,
        userActivation: snapshotUserActivation(),
        canShareFiles: null,
        shareApi: false,
      },
    }
  }

  let canShareFiles = null
  if (typeof navigator.canShare === 'function') {
    try {
      canShareFiles = Boolean(navigator.canShare({ files: [file] }))
    } catch (canShareErr) {
      canShareFiles = false
      console.warn('[zlog:share-diag] canShare threw', {
        name: canShareErr?.name || null,
        message: canShareErr?.message || String(canShareErr),
      })
    }
  }

  const beforeShareActivation = snapshotUserActivation()
  console.info('[zlog:share-diag] before navigator.share', {
    userActivation: beforeShareActivation,
    canShareFiles,
    fileName: file?.name || null,
    fileType: file?.type || null,
    fileSize: file?.size ?? null,
  })
  emitShareDiag('before-navigator-share', {
    userActivationIsActive: beforeShareActivation.isActive,
    userActivationHasBeenActive: beforeShareActivation.hasBeenActive,
    canShareFiles,
    fileReady: Boolean(file?.size > 0),
    fileName: file?.name || null,
    fileSize: file?.size ?? null,
    fileType: file?.type || null,
  })

  try {
    markShareTiming('navigator_share_called')
    await navigator.share({
      files: [file],
      title: title || 'Site Diary',
      text: text || 'Site Diary',
    })
    markShareTiming('navigator_share_resolved')
    console.info('[zlog:share-diag] navigator.share ok', {
      userActivation: snapshotUserActivation(),
    })
    emitShareDiag('navigator-share-result', {
      ok: true,
      aborted: false,
      userActivationIsActive: beforeShareActivation.isActive,
      userActivationHasBeenActive: beforeShareActivation.hasBeenActive,
      canShareFiles,
      fileReady: Boolean(file?.size > 0),
      fileName: file?.name || null,
      fileSize: file?.size ?? null,
      errorName: null,
      errorMessage: null,
    })
    return {
      ok: true,
      diagnostics: {
        stage: 'share',
        userActivation: beforeShareActivation,
        canShareFiles,
      },
    }
  } catch (err) {
    markShareTiming('navigator_share_resolved')
    if (err?.name === 'AbortError') {
      console.info('[zlog:share-diag] navigator.share aborted by user', {
        userActivation: snapshotUserActivation(),
      })
      emitShareDiag('navigator-share-result', {
        ok: true,
        aborted: true,
        userActivationIsActive: beforeShareActivation.isActive,
        userActivationHasBeenActive: beforeShareActivation.hasBeenActive,
        canShareFiles,
        fileReady: Boolean(file?.size > 0),
        fileName: file?.name || null,
        fileSize: file?.size ?? null,
        errorName: 'AbortError',
        errorMessage: 'User dismissed share sheet',
      })
      return {
        ok: true,
        aborted: true,
        diagnostics: {
          stage: 'share',
          userActivation: beforeShareActivation,
          canShareFiles,
          errorName: 'AbortError',
        },
      }
    }
    console.warn('[zlog:share-diag] navigator.share failed', {
      errorName: err?.name || null,
      errorMessage: err?.message || String(err),
      userActivationAtFailure: snapshotUserActivation(),
      userActivationBeforeShare: beforeShareActivation,
      canShareFiles,
      fileReady: Boolean(file?.size > 0),
    })
    emitShareDiag('navigator-share-result', {
      ok: false,
      aborted: false,
      userActivationIsActive: beforeShareActivation.isActive,
      userActivationHasBeenActive: beforeShareActivation.hasBeenActive,
      canShareFiles,
      fileReady: Boolean(file?.size > 0),
      fileName: file?.name || null,
      fileSize: file?.size ?? null,
      errorName: err?.name || null,
      errorMessage: err?.message || String(err),
    })
    return {
      ok: false,
      reason: err?.name === 'NotAllowedError' ? 'not-allowed' : 'failed',
      message: diaryNativeShareUnavailableMessage(),
      diagnostics: {
        stage: 'share',
        userActivation: beforeShareActivation,
        userActivationAtFailure: snapshotUserActivation(),
        canShareFiles,
        errorName: err?.name || null,
        errorMessage: err?.message || String(err),
        fileReady: Boolean(file?.size > 0),
        fileName: file?.name || null,
        fileSize: file?.size ?? null,
      },
    }
  }
}

/** Hand the blob to the browser's own download behaviour. */
function downloadPdfViaBrowser(blob, fileName) {
  if (typeof document === 'undefined') {
    return { ok: false, message: 'PDF was generated but could not be saved on this device.' }
  }
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
  return { ok: true, message: 'PDF saved.' }
}

/**
 * Explicit Save PDF. Only call from the Save PDF action.
 * Offers the real Save As dialog (folder + editable filename) where the browser
 * supports it, and falls back to a plain download everywhere else.
 */
export async function downloadSiteDiaryPdf({ blob, fileName } = {}) {
  if (!blob) {
    return { ok: false, message: 'PDF was generated but could not be saved on this device.' }
  }
  const suggestedName = fileName || 'Zlog-Site-Diary.pdf'

  if (canUseSaveFilePicker()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { ok: true, message: 'PDF saved.' }
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { ok: true, cancelled: true }
      }
      // Picker refused (no secure context, expired user gesture, policy) — download instead.
    }
  }

  const result = downloadPdfViaBrowser(blob, suggestedName)
  return result
}

/**
 * @deprecated Prefer prepareSiteDiaryPdf + explicit share/download actions.
 * Native share when possible; otherwise returns without downloading (no silent Save As).
 */
export async function shareSiteDiaryReport({ projectId, reportId }) {
  const prepared = await prepareSiteDiaryPdf({ projectId, reportId })
  if (!prepared.ok) return prepared
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    return shareSiteDiaryPdfNative({
      file: prepared.file,
      title: prepared.title,
      text: prepared.text,
    })
  }
  return {
    ok: false,
    reason: 'unsupported',
    prepared: true,
    fileName: prepared.fileName,
    message: diaryNativeShareUnavailableMessage(),
  }
}
