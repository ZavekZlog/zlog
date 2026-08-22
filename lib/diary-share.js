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
import { buildDiaryPdfPhotos } from '@/lib/diary-pdf-photos'
import { resolvePdfReportBrandColor } from '@/lib/diary-reporting-company'
import { orientedImageToDataUrlForPdf, PDF_PHOTO_PIPELINE_ID } from '@/lib/image-orientation'
import {
  canSharePdfFile,
  canUseSaveFilePicker,
  diaryNativeShareUnavailableMessage,
} from '@/lib/diary-share-capabilities'
import {
  describeSrc,
  zlogPdfTrace,
  zlogPdfTraceBeginGeneration,
  zlogPdfTraceBlobStats,
  zlogPdfTraceComplete,
} from '@/lib/zlog-pdf-trace'

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

export { buildDiaryPdfPhotos } from '@/lib/diary-pdf-photos'

function pdfPrepareFail(message, extra = {}) {
  zlogPdfTrace('generator-abort', { message, ...extra })
  zlogPdfTraceComplete({ ok: false, message })
  return { ok: false, message }
}

async function signedUrlForPath(supabase, path) {
  if (!path) return null
  const raw = String(path)
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  const { data, error } = await supabase.storage.from('site-photos').createSignedUrl(raw, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Flatten cover photo pixels exactly as the browser displays them in Zlog (<img>),
 * then pass EXIF-free JPEG bytes to react-pdf. Shared helper with work photos.
 */
async function flattenCoverBlobForPdf(blob, maxEdge = 2400, quality = 0.92) {
  zlogPdfTrace('cover-pipeline', {
    id: PDF_PHOTO_PIPELINE_ID,
    path: 'uprightCoverSrcForPdf',
    decode: 'orientedImageToDataUrlForPdf',
    manualExifTransform: false,
  })
  return orientedImageToDataUrlForPdf(blob, maxEdge, quality)
}

/**
 * Bake cover into upright pixels for @react-pdf Image (browser-display flatten).
 * Browsers honour EXIF on <img>; react-pdf does not — flatten display pixels here.
 * Storage path / persisted cover_photo_url are unchanged.
 */
export async function uprightCoverSrcForPdf(url) {
  zlogPdfTrace('cover-bake-enter', {
    fn: 'uprightCoverSrcForPdf',
    pipeline: PDF_PHOTO_PIPELINE_ID,
    input: describeSrc(url),
  })
  if (!url) {
    zlogPdfTrace('cover-bake-skip', { reason: 'no-url' })
    return null
  }
  const raw = String(url)
  if (raw.startsWith('data:')) {
    zlogPdfTrace('cover-bake-skip', { reason: 'already-data-url', input: describeSrc(raw) })
    return raw
  }

  // Must bake EXIF into pixels before @react-pdf embeds the image. Returning the
  // raw signed URL on failure is what left Android PDFs rotated while <img> looked correct.
  const res = await fetch(raw)
  if (!res.ok) {
    zlogPdfTrace('cover-bake-fail', { stage: 'fetch', status: res.status })
    throw new Error('Could not download the cover photo for the PDF.')
  }
  const blob = await res.blob()
  zlogPdfTrace('cover-bake-blob', {
    blobType: blob?.type || '',
    blobSize: blob?.size || 0,
  })
  if (!blob || !blob.size) {
    zlogPdfTrace('cover-bake-fail', { stage: 'empty-blob' })
    throw new Error('Cover photo for the PDF was empty.')
  }
  const baked = await flattenCoverBlobForPdf(blob, 2400, 0.92)
  const { dataUrl } = baked
  zlogPdfTrace('cover-bake-result', {
    fn: 'flattenCoverBlobForPdf',
    pipeline: PDF_PHOTO_PIPELINE_ID,
    ran: true,
    bakedManualOrientation: baked.bakedManualOrientation,
    decodeMode: baked.decodeMode,
    exifOrientation: baked.orientation,
    usedBrowserOrientation: baked.usedBrowserOrientation,
    decodedWidth: baked.width,
    decodedHeight: baked.height,
    output: describeSrc(dataUrl),
  })
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) {
    zlogPdfTrace('cover-bake-fail', { stage: 'no-data-url' })
    throw new Error('Could not normalize cover photo orientation for the PDF.')
  }
  return dataUrl
}

/**
 * Generate the Site Diary PDF (no download, no share sheet).
 */
export async function prepareSiteDiaryPdf({ projectId, reportId }) {
  zlogPdfTraceBeginGeneration()
  zlogPdfTrace('generator-enter', {
    fn: 'prepareSiteDiaryPdf',
    file: 'lib/diary-share.js',
    documentComponent: 'DiaryPdfDocument',
    renderer: '@react-pdf/renderer pdf().toBlob()',
    projectId: String(projectId || ''),
    reportId: String(reportId || ''),
  })
  if (!reportId) {
    return pdfPrepareFail('This Site Diary could not be shared because it was not opened correctly.', {
      reason: 'no-report-id',
    })
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
      return pdfPrepareFail('We couldn’t load this Site Diary for PDF export. Try again.')
    }

    if (projectId && String(report.project_id) !== String(projectId)) {
      return pdfPrepareFail('This Site Diary does not match the selected project.')
    }

    let photoRows = []
    {
      const primary = await supabase
        .from('report_photos')
        .select('url, caption, sequence, layout, location, rotation_degrees, assigned_to')
        .eq('report_id', reportId)
        .order('sequence')
      if (primary.error && /assigned_to/i.test(primary.error.message || '')) {
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
        return pdfPrepareFail('We couldn’t load the diary photos for PDF export.')
      } else {
        photoRows = primary.data || []
      }
    }

    const { data: labourRows } = await supabase
      .from('report_labour')
      .select('trade, company, count, hours')
      .eq('report_id', reportId)
      .order('sequence')

    const photos = await buildDiaryPdfPhotos(photoRows, async (photo) =>
      signedUrlForPath(supabase, photo.url),
    )

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

    const logoUrl = await signedUrlForPath(supabase, report.brand_logo_url)
    const coverSignedUrl = await signedUrlForPath(supabase, report.cover_photo_url)
    zlogPdfTrace('cover-source', {
      storedPathKind: describeSrc(report.cover_photo_url).kind,
      storedPathPreview: describeSrc(report.cover_photo_url).preview,
      signedUrl: describeSrc(coverSignedUrl),
    })
    const coverPhotoUrl = await uprightCoverSrcForPdf(coverSignedUrl)
    const signatureSrc = await signedUrlForPath(supabase, report.signature_url)
    const projectName = report.projects?.name || 'Site Diary'
    // project_reference is a later project column. Read it independently so a
    // legacy environment without the column still generates the PDF.
    const { data: projectReferenceRow } = await supabase
      .from('projects')
      .select('project_reference')
      .eq('id', report.project_id)
      .maybeSingle()
    const projectReference = String(projectReferenceRow?.project_reference || '').trim()
    const equipmentHire = Array.isArray(report.equipment_hire) ? report.equipment_hire : []
    const temporaryWorks =
      report.temporary_works_applicable === false || !Array.isArray(report.temporary_works)
        ? []
        : temporaryWorksForPdf(report.temporary_works)
    const reportDate = report.report_date || ''

    zlogPdfTrace('create-element', {
      typeName: DiaryPdfDocument?.name || 'DiaryPdfDocument',
      coverPassedToDocument: describeSrc(coverPhotoUrl),
      photoCount: Array.isArray(photos) ? photos.length : 0,
    })
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

    const blob = await pdf(doc).toBlob()
    await zlogPdfTraceBlobStats(blob)
    zlogPdfTrace('generator-ok', { fn: 'prepareSiteDiaryPdf', blobType: blob?.type || '', blobSize: blob?.size || 0 })
    zlogPdfTraceComplete({ ok: true })
    const safeDate = String(reportDate || 'report').replace(/[^\d-]/g, '')
    const fileName = `Zlog-Site-Diary-${safeDate || 'report'}.pdf`
    const file = new File([blob], fileName, { type: 'application/pdf' })
    const title = 'Site Diary'
    const text = `${projectName} — Site Diary`

    return {
      ok: true,
      blob,
      file,
      fileName,
      projectName,
      reportDate,
      title,
      text,
    }
  } catch (err) {
    zlogPdfTrace('generator-fail', {
      fn: 'prepareSiteDiaryPdf',
      message: String(err?.message || err),
    })
    zlogPdfTraceComplete({ ok: false, message: String(err?.message || err) })
    return {
      ok: false,
      message: err?.message || 'We couldn’t generate the Site Diary PDF. Try again.',
    }
  }
}

/**
 * Open the device share sheet with the PDF file (Web Share API).
 * Does not download.
 */
export async function shareSiteDiaryPdfNative({ file, title, text } = {}) {
  zlogPdfTrace('deliver-native-share', {
    fn: 'shareSiteDiaryPdfNative',
    fileSize: file?.size || 0,
    fileType: file?.type || '',
  })
  if (!file || !canSharePdfFile(file)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: diaryNativeShareUnavailableMessage(),
    }
  }
  try {
    await navigator.share({
      files: [file],
      title: title || 'Site Diary',
      text: text || 'Site Diary',
    })
    return { ok: true }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: true, aborted: true }
    }
    return {
      ok: false,
      message: diaryNativeShareUnavailableMessage(),
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
  zlogPdfTrace('deliver-download', {
    fn: 'downloadSiteDiaryPdf',
    blobSize: blob?.size || 0,
    fileName: fileName || '',
  })
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

  return downloadPdfViaBrowser(blob, suggestedName)
}

/**
 * @deprecated Prefer prepareSiteDiaryPdf + explicit share/download actions.
 * Native share when possible; otherwise returns without downloading (no silent Save As).
 */
export async function shareSiteDiaryReport({ projectId, reportId }) {
  const prepared = await prepareSiteDiaryPdf({ projectId, reportId })
  if (!prepared.ok) return prepared
  if (canSharePdfFile(prepared.file)) {
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
