import { CLAIM_RPC_NAME } from './env.js'
import { sleep } from './sleep.js'

/**
 * Safe metadata only — never log full job payloads or URLs.
 * @param {Record<string, unknown>} row
 */
export function formatClaimLogLine(row) {
  return {
    exportId: row?.id ?? null,
    reportId: row?.report_id ?? null,
    attempt: row?.attempt ?? null,
    reclaimCount: row?.reclaim_count ?? null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} workerId
 */
export async function invokeClaimNextExport(admin, workerId) {
  return admin.rpc(CLAIM_RPC_NAME, { p_worker_id: workerId })
}

/**
 * Phase 2C-2B: claim-only shell — one successful claim then exit(0).
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   workerId: string
 *   pollMs: number
 *   claimEnabled: boolean
 *   shutdown: { shuttingDown: boolean }
 *   log?: Pick<Console, 'log' | 'error'>
 *   exit?: (code: number) => never
 * }} options
 */
export async function runClaimLoop(options) {
  const log = options.log ?? console
  const exit = options.exit ?? ((code) => process.exit(code))
  const { admin, workerId, pollMs, claimEnabled, shutdown } = options

  if (!claimEnabled) {
    log.log(
      '[site-diary-pdf-worker] Claim execution disabled. Set ZLOG_PDF_WORKER_CLAIM_ENABLED=true to enable RPC claims.',
    )
    while (!shutdown.shuttingDown) {
      await sleep(pollMs, shutdown)
    }
    log.log('[site-diary-pdf-worker] Shutdown complete.')
    return
  }

  log.log('[site-diary-pdf-worker] Claim execution enabled (claim-only development mode).')

  while (!shutdown.shuttingDown) {
    const { data, error } = await invokeClaimNextExport(admin, workerId)

    if (error) {
      log.error('[site-diary-pdf-worker] Claim RPC failed.')
      await sleep(pollMs, shutdown)
      continue
    }

    if (data === null || data === undefined) {
      await sleep(pollMs, shutdown)
      continue
    }

    const row = typeof data === 'object' && data !== null ? data : {}
    log.log('[site-diary-pdf-worker] Claimed export job.', formatClaimLogLine(row))
    log.log(
      '[site-diary-pdf-worker] Claim-only mode: exiting without PDF generation or job completion.',
    )
    exit(0)
  }

  log.log('[site-diary-pdf-worker] Shutdown complete.')
}
