/**
 * Standalone Site Diary PDF export worker — environment (no Next.js / server-only).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CLAIM_RPC_NAME = 'claim_next_site_diary_pdf_export'
export const COMPLETE_RPC_NAME = 'complete_site_diary_pdf_export'
export const FAIL_RPC_NAME = 'fail_site_diary_pdf_export'

export const SITE_DIARY_PDF_EXPORT_STORAGE_BUCKET = 'site-diary-pdf-exports'

export const DEFAULT_POLL_MS = 5000
export const MIN_POLL_MS = 1000
export const MAX_POLL_MS = 300_000

/**
 * Fill missing environment variables from the repo `.env.local`.
 * Existing process values win. Never logs names or values.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {(path: string, encoding: 'utf8') => string} [readFile]
 */
export function loadWorkerEnvLocal(env, readFile = readFileSync) {
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '..', '..', '.env.local')
  let raw = ''
  try {
    raw = readFile(path, 'utf8')
  } catch {
    return
  }
  applyEnvLocalAssignments(env, raw)
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} raw
 */
export function applyEnvLocalAssignments(env, raw) {
  const text = String(raw || '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const body = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = body.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    const current = env[key]
    if (current === undefined || String(current).trim() === '') {
      env[key] = value
    }
  }
}

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
