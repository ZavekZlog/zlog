/**
 * Site Diary share / PDF handoff.
 * Prepare once; deliver only via explicit Share / Email / WhatsApp / Save PDF actions.
 * Never auto-download on prepare or page load.
 */

import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/client'
import { DiaryPdfDocument } from '@/components/pdf/DiaryPdfDocument'
import { buildDiaryPdfPhotos } from '@/lib/diary-pdf-photos'
import {
  canSharePdfFile,
  diaryNativeShareUnavailableMessage,
} from '@/lib/diary-share-capabilities'

export {
  buildDiaryEmailMailto,
  canNativeShare,
  canSharePdfFile,
  diaryEmailFallbackMessage,
  diaryNativeShareUnavailableMessage,
  diaryWhatsAppUnavailableMessage,
  resolveDiaryShareCapabilities,
} from '@/lib/diary-share-capabilities'

export { buildDiaryPdfPhotos } from '@/lib/diary-pdf-photos'

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
 * Generate the Site Diary PDF (no download, no share sheet).
 */
export async function prepareSiteDiaryPdf({ projectId, reportId }) {
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
        report_date,
        site_summary,
        creator_name,
        creator_role,
        signature_url,
        cover_photo_url,
        branding_id,
        brand_color,
        brand_logo_url,
        equipment_hire,
        projects ( id, name )
      `)
      .eq('id', reportId)
      .maybeSingle()

    if (reportError || !report) {
      return { ok: false, message: 'We couldn’t load this Site Diary for PDF export. Try again.' }
    }

    if (projectId && String(report.project_id) !== String(projectId)) {
      return { ok: false, message: 'This Site Diary does not match the selected project.' }
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
        return { ok: false, message: 'We couldn’t load the diary photos for PDF export.' }
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
    if (report.branding_id) {
      const { data: branding } = await supabase
        .from('company_brandings')
        .select('company_name')
        .eq('id', report.branding_id)
        .maybeSingle()
      companyName = String(branding?.company_name || '').trim()
    }

    const logoUrl = await signedUrlForPath(supabase, report.brand_logo_url)
    const coverPhotoUrl = await signedUrlForPath(supabase, report.cover_photo_url)
    const signatureSrc = await signedUrlForPath(supabase, report.signature_url)
    const projectName = report.projects?.name || 'Site Diary'
    const equipmentHire = Array.isArray(report.equipment_hire) ? report.equipment_hire : []
    const reportDate = report.report_date || ''

    const doc = createElement(DiaryPdfDocument, {
      projectName,
      reportDate,
      siteSummary: report.site_summary || '',
      brandColor: report.brand_color || '#FF5000',
      logoUrl,
      companyName,
      coverPhotoUrl,
      photos,
      labour: labourRows || [],
      equipmentHire,
      authorName: report.creator_name || '',
      authorRole: report.creator_role || '',
      signatureSrc,
    })

    const blob = await pdf(doc).toBlob()
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

/**
 * Explicit Save PDF / Save As download. Only call from the Save PDF action.
 */
export function downloadSiteDiaryPdf({ blob, fileName } = {}) {
  if (!blob || typeof document === 'undefined') {
    return { ok: false, message: 'PDF was generated but could not be saved on this device.' }
  }
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName || 'Zlog-Site-Diary.pdf'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
  return { ok: true, message: 'PDF saved.' }
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
