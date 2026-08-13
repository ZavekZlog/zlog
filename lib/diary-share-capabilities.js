/**
 * Pure Site Diary share capability helpers (no PDF / Supabase imports).
 */

/**
 * Whether this environment can share a PDF File via the Web Share API.
 * @param {File} [file]
 * @param {Pick<Navigator, 'share' | 'canShare'>} [nav]
 */
export function canSharePdfFile(file, nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!nav) return false
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  if (!file) return false
  try {
    return Boolean(nav.canShare({ files: [file] }))
  } catch {
    return false
  }
}

/** Web Share API present (may still reject file shares). */
export function canNativeShare(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  return Boolean(nav && typeof nav.share === 'function')
}

/**
 * Pure capability resolver for UI + tests.
 * @param {{ canShareFiles?: boolean, canShare?: boolean }} caps
 */
export function resolveDiaryShareCapabilities(caps = {}) {
  const canShareFiles = Boolean(caps.canShareFiles)
  const canShare = Boolean(caps.canShare)
  return {
    canShareFiles,
    canShare,
    nativeShareAvailable: canShareFiles,
    emailUsesNativeShare: canShareFiles,
    whatsAppUsesNativeShare: canShareFiles,
    emailMailtoFallback: !canShareFiles,
    whatsAppManualFallback: !canShareFiles,
    savePdfAlwaysAvailable: true,
  }
}

export function buildDiaryEmailMailto({ projectName, reportDate, fileName } = {}) {
  const project = String(projectName || 'Site Diary').trim() || 'Site Diary'
  const date = String(reportDate || '').trim()
  const subject = encodeURIComponent(
    date ? `${project} — Site Diary (${date})` : `${project} — Site Diary`,
  )
  const body = encodeURIComponent(
    [
      `Please find the Site Diary for ${project}${date ? ` (${date})` : ''}.`,
      '',
      fileName
        ? `This email cannot attach “${fileName}” automatically. Use Save PDF in Zlog, then attach that file here.`
        : 'This email cannot attach the PDF automatically. Use Save PDF in Zlog, then attach that file here.',
    ].join('\n'),
  )
  return `mailto:?subject=${subject}&body=${body}`
}

export function diaryWhatsAppUnavailableMessage() {
  return 'This device can’t send the PDF through WhatsApp automatically. Use Share on a supported phone, or Save PDF and attach the file in WhatsApp yourself.'
}

export function diaryEmailFallbackMessage() {
  return 'This device can’t attach the PDF to email automatically. We’ve opened a draft message — use Save PDF, then attach the file in your email app.'
}

export function diaryNativeShareUnavailableMessage() {
  return 'More options aren’t available on this device. Try Email or Save PDF.'
}
