/**
 * Sign-in sheet OCR provider boundary (Phase A).
 * Claude is the current default; OpenAI remains available without hard-wiring Anthropic forever.
 * No database writes.
 */

export const SIGNIN_OCR_PROVIDER_CLAUDE = 'claude'
export const SIGNIN_OCR_PROVIDER_OPENAI = 'openai'

/**
 * Server/client-safe provider resolution.
 * Override wins; else NEXT_PUBLIC_ZLOG_SIGNIN_OCR_PROVIDER / ZLOG_SIGNIN_OCR_PROVIDER;
 * Phase A default = claude.
 *
 * @param {unknown} [override]
 * @returns {'claude'|'openai'}
 */
export function resolveSignInOcrProvider(override) {
  const rawOverride = String(override || '').trim().toLowerCase()
  if (rawOverride === SIGNIN_OCR_PROVIDER_OPENAI) return SIGNIN_OCR_PROVIDER_OPENAI
  if (rawOverride === SIGNIN_OCR_PROVIDER_CLAUDE) return SIGNIN_OCR_PROVIDER_CLAUDE

  const fromEnv =
    typeof process !== 'undefined'
      ? String(
          process.env.NEXT_PUBLIC_ZLOG_SIGNIN_OCR_PROVIDER ||
            process.env.ZLOG_SIGNIN_OCR_PROVIDER ||
            '',
        )
          .trim()
          .toLowerCase()
      : ''
  if (fromEnv === SIGNIN_OCR_PROVIDER_OPENAI) return SIGNIN_OCR_PROVIDER_OPENAI
  return SIGNIN_OCR_PROVIDER_CLAUDE
}

/**
 * Prepare upright sign-in image for preview + vision OCR (both providers).
 * Explicit EXIF flatten to upright JPEG via fileToVisionPreparedImage (sign-in-image-preparation).
 *
 * @param {File|Blob} file
 * @param {unknown} [provider]
 */
export async function prepareSignInSheetImageForProvider(file, provider) {
  const resolved = resolveSignInOcrProvider(provider)
  const { fileToVisionPreparedImage, SIGNIN_UPRIGHT_IMAGE_PIPELINE } = await import(
    './parse-signin-sheet.js',
  )
  const prepared = await fileToVisionPreparedImage(file)
  return {
    provider: resolved,
    dataUrl: prepared.dataUrl,
    imageMeta: {
      ...prepared.imageMeta,
      pipeline: prepared.imageMeta?.pipeline || SIGNIN_UPRIGHT_IMAGE_PIPELINE,
    },
  }
}

/**
 * Stable OCR entry: provider → operative review DTO.
 * Caller must pass the Site Diary reportDate (never invent today / hard-coded sheet dates).
 *
 * @param {{
 *   dataUrl: string,
 *   reportDate: string,
 *   groupBy?: string,
 *   provider?: string,
 *   imageMeta?: object|null,
 * }} args
 */
export async function parseSignInSheet({
  dataUrl,
  reportDate,
  groupBy = 'trade_company',
  provider,
  imageMeta = null,
} = {}) {
  if (!reportDate) {
    throw new Error('reportDate is required (YYYY-MM-DD) from the Site Diary')
  }

  const resolved = resolveSignInOcrProvider(provider)

  if (resolved === SIGNIN_OCR_PROVIDER_CLAUDE) {
    const res = await fetch('/api/parse-signin-sheet-claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, reportDate, groupBy, imageMeta }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload.error || `Claude sign-in OCR failed (${res.status})`)
    }
    return {
      ...payload,
      provider: SIGNIN_OCR_PROVIDER_CLAUDE,
      applyEnabled: true,
      reportDate: payload.reportDate || reportDate,
    }
  }

  const { parseSignInSheetImage } = await import('./parse-signin-sheet.js')
  const payload = await parseSignInSheetImage({ dataUrl, reportDate, groupBy })
  return {
    ...payload,
    provider: SIGNIN_OCR_PROVIDER_OPENAI,
    applyEnabled: true,
    reportDate: payload.reportDate || reportDate,
  }
}

/**
 * Apply is available after a successful scan when the reviewed summary is persistable.
 * Claude is no longer hard-gated: persist now writes the reviewed Trade + Workers + Hours draft.
 * @param {unknown} [_provider]
 * @param {unknown} applyEnabled
 */
export function isSignInOcrApplyEnabled(_provider, applyEnabled) {
  if (applyEnabled === false) return false
  return true
}
