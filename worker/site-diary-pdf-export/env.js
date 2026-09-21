/**
 * Standalone Site Diary PDF export worker — environment (no Next.js / server-only).
 */

export const CLAIM_RPC_NAME = 'claim_next_site_diary_pdf_export'
export const COMPLETE_RPC_NAME = 'complete_site_diary_pdf_export'
export const FAIL_RPC_NAME = 'fail_site_diary_pdf_export'

export const SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET = 'site-diary-pdf-exports'

export const DEFAULT_POLL_MS = 5000
export const MIN_POLL_MS = 1000
export const MAX_POLL_MS = 300_000

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveSupabaseUrl(env) {
  const direct = String(env.SUPABASE_URL || '').trim()
  if (direct) return direct
  return String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function validateWorkerEnv(env) {
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the PDF export worker.')
  }

  const url = resolveSupabaseUrl(env)
  if (!url) {
    throw new Error(
      'Supabase URL is required (set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).',
    )
  }

  return {
    supabaseUrl: url,
    serviceRoleKey: serviceKey,
    workerId: resolveWorkerId(env),
    pollMs: resolvePollMs(env),
    claimEnabled: isClaimEnabled(env),
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function isClaimEnabled(env) {
  return String(env.ZLOG_PDF_WORKER_CLAIM_ENABLED || '').trim().toLowerCase() === 'true'
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveWorkerId(env) {
  const fromEnv = String(env.ZLOG_PDF_WORKER_ID || '').trim()
  if (fromEnv) return fromEnv
  return `worker-${process.pid}`
}

/**
 * Invalid or out-of-range values fall back to {@link DEFAULT_POLL_MS}.
 * @param {NodeJS.ProcessEnv} env
 */
export function resolvePollMs(env) {
  const raw = env.ZLOG_PDF_WORKER_POLL_MS
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_POLL_MS
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < MIN_POLL_MS || n > MAX_POLL_MS) {
    return DEFAULT_POLL_MS
  }
  return Math.floor(n)
}
