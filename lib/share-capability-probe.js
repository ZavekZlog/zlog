/**
 * TEMPORARY — fast Web Share capability probe (no PDF generation).
 * Posts results to /api/share-diag for the Cursor terminal.
 */

import { emitShareDiag } from '@/lib/share-diag-beacon'

/** Prior HTTPS Android run — real Site Diary PDF (not regenerated for this probe). */
export const PRIOR_HTTPS_REAL_PDF = {
  fileName: 'Zlog-Site-Diary-2026-08-23.pdf',
  fileType: 'application/pdf',
  fileSize: 2269305,
  instanceofFile: true,
  canShareFiles: true,
  note:
    'From HTTPS diagnostic: canShare({files}) was true; navigator.share failed with NotAllowedError after ~66s PDF prep (user gesture expired).',
}

function permissionsPolicyWebShareAllowed() {
  try {
    const doc = typeof document !== 'undefined' ? document : null
    if (!doc) return null
    if (doc.featurePolicy && typeof doc.featurePolicy.allowsFeature === 'function') {
      return Boolean(doc.featurePolicy.allowsFeature('web-share'))
    }
    if (doc.permissionsPolicy && typeof doc.permissionsPolicy.allowsFeature === 'function') {
      return Boolean(doc.permissionsPolicy.allowsFeature('web-share'))
    }
  } catch {
    return null
  }
  return null
}

/**
 * Instant capability check — does not call prepareSiteDiaryPdf.
 * @param {{ surface?: string, priorRealPdf?: typeof PRIOR_HTTPS_REAL_PDF }} [opts]
 */
export function runShareCapabilityProbe(opts = {}) {
  if (typeof window === 'undefined') return

  const nav = typeof navigator !== 'undefined' ? navigator : null
  const hasShare = Boolean(nav && typeof nav.share === 'function')
  const hasCanShare = Boolean(nav && typeof nav.canShare === 'function')

  let canShareText = null
  if (hasCanShare) {
    try {
      canShareText = Boolean(nav.canShare({ text: 'Zlog test' }))
    } catch (err) {
      canShareText = { error: err?.name || 'Error', message: err?.message || String(err) }
    }
  }

  const syntheticBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc7, 0xec, 0x8f, 0xa2, 0x0a,
  ])
  const testFile = new File([syntheticBytes], 'zlog-test.pdf', { type: 'application/pdf' })

  let canShareSyntheticFiles = null
  if (hasCanShare) {
    try {
      canShareSyntheticFiles = Boolean(nav.canShare({ files: [testFile] }))
    } catch (err) {
      canShareSyntheticFiles = {
        error: err?.name || 'Error',
        message: err?.message || String(err),
      }
    }
  }

  const prior = opts.priorRealPdf || PRIOR_HTTPS_REAL_PDF

  emitShareDiag('share-capability-probe', {
    surface: opts.surface || 'saved-diary-view',
    isSecureContext: Boolean(window.isSecureContext),
    protocol: String(window.location?.protocol || ''),
    href: String(window.location?.href || ''),
    hasNavigatorShare: hasShare,
    hasNavigatorCanShare: hasCanShare,
    permissionsPolicyWebShare: permissionsPolicyWebShareAllowed(),
    canShareText,
    syntheticFile: {
      name: testFile.name,
      type: testFile.type,
      size: testFile.size,
      instanceofFile: testFile instanceof File,
      canShareFiles: canShareSyntheticFiles,
    },
    priorRealPdfFromHttpsDiag: prior,
    distinction:
      canShareSyntheticFiles === true && prior.canShareFiles === true
        ? 'B-ruled-out: Web Share file API works; prior failure was user-gesture expiry during long PDF prep (NotAllowedError), not a bad PDF File.'
        : canShareSyntheticFiles === false
          ? 'A-candidate: Web Share file sharing blocked or unsupported in this context.'
          : 'Incomplete: inspect probe fields.',
  })
}
