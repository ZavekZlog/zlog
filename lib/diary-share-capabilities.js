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

/** Minimal valid PDF header bytes for capability probing only. */
export function createSiteDiaryPdfShareProbeFile() {
  const syntheticBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc7, 0xec, 0x8f, 0xa2, 0x0a,
  ])
  return new File([syntheticBytes], 'zlog-share-probe.pdf', { type: 'application/pdf' })
}

/**
 * Whether this device can share a real PDF file via navigator.share({ files }).
 * Stricter than canNativeShare() — required before Tap-1 blob materialization.
 */
export function canShareSiteDiaryPdfViaNativeFile(
  nav = typeof navigator !== 'undefined' ? navigator : undefined,
) {
  const probe = createSiteDiaryPdfShareProbeFile()
  return canSharePdfFile(probe, nav)
}

/**
 * Whether this browser can offer a real Save As dialog (folder + filename).
 * @param {Window} [win]
 */
export function canUseSaveFilePicker(win = typeof window !== 'undefined' ? window : undefined) {
  return Boolean(win && typeof win.showSaveFilePicker === 'function')
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

/**
 * Browser download handoff for an authorized HTTPS Storage signed URL (Tap 2 only).
 * Does not fetch the body in JS.
 *
 * @param {{ signedUrl: string, fileName?: string }} params
 */
export function downloadSiteDiaryPdfViaSignedUrl({ signedUrl, fileName } = {}) {
  const href = String(signedUrl || '').trim()
  if (!href) {
    return { ok: false, message: 'PDF was generated but could not be saved on this device.' }
  }
  if (typeof document === 'undefined') {
    return { ok: false, message: 'PDF was generated but could not be saved on this device.' }
  }
  const suggestedName = fileName || 'Zlog-Site-Diary.pdf'
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = suggestedName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return { ok: true, message: 'PDF saved.' }
}
