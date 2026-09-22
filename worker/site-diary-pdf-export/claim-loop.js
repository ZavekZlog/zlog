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
 * @param {{ ok?: boolean, exportId?: string, reportId?: string, byteSize?: number }} result
 */
export function formatExecutionSuccessLog(result) {
  return {
    state: 'completed',
    exportId: result?.exportId ?? null,
    reportId: result?.reportId ?? null,
    byteSize: result?.byteSize ?? null,
  }
}

/**
 * Supabase PostgREST RPC error metadata only — no client, headers, or env.
 * @param {unknown} error
 */
export function formatClaimRpcErrorLog(error) {
  const src = error && typeof error === 'object' ? error : {}
  return {
    code:
      typeof src.code === 'string'
        ? src.code
        : src.code != null && src.code !== ''
          ? String(src.code)
          : null,
    message: typeof src.message === 'string' ? src.message : null,
    details: typeof src.details === 'string' ? src.details : null,
    hint: typeof src.hint === 'string' ? src.hint : null,
  }
}

/**
 * @param {unknown} err
 */
export function formatExecutionFailureLog(err) {
  const code =
    err && typeof err === 'object' && typeof err.code === 'string'
      ? err.code
      : 'processing_failed'
  return {
    state: 'failed',
    code,
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
 * @param {{
 *   admin: import('@supabase/supabase-js').SupabaseClient
 *   workerId: string
 *   pollMs: number
 *   claimEnabled: boolean
 *   shutdown: { shuttingDown: boolean }
 *   executeClaimedSiteDiaryPdfExport?: (input: {
 *     admin: import('@supabase/supabase-js').SupabaseClient
 *     workerId: string
 *     exportJob: Record<string, unknown>
 *   }) => Promise<unknown>
 *   claimNext?: typeof invokeClaimNextExport
 *   sleep?: typeof sleep
 *   log?: Pick<Console, 'log' | 'error'>
 * }} options
 */
export async function runClaimLoop(options) {
  const log = options.log ?? console
  const wait = options.sleep ?? sleep
  const { admin, workerId, pollMs, claimEnabled, shutdown } = options
  const claimNext = options.claimNext ?? ((a, id) => invokeClaimNextExport(a, id))
  const executeClaimed = options.executeClaimedSiteDiaryPdfExport

  if (!claimEnabled) {
    log.log(
      '[site-diary-pdf-worker] Claim execution disabled. Set ZLOG_PDF_WORKER_CLAIM_ENABLED=true to enable RPC claims.',
    )
    while (!shutdown.shuttingDown) {
      await wait(pollMs, shutdown)
    }
    log.log('[site-diary-pdf-worker] Shutdown complete.')
    return
  }

  if (typeof executeClaimed !== 'function') {
    throw new Error(
      'executeClaimedSiteDiaryPdfExport is required when claim execution is enabled.',
    )
  }

  log.log('[site-diary-pdf-worker] Claim execution enabled.')

  while (!shutdown.shuttingDown) {
    const { data, error } = await claimNext(admin, workerId)

    if (error) {
      log.error(
        '[site-diary-pdf-worker] Claim RPC failed.',
        formatClaimRpcErrorLog(error),
      )
      await wait(pollMs, shutdown)
      continue
    }

    if (data === null || data === undefined) {
      await wait(pollMs, shutdown)
      continue
    }

    const row = typeof data === 'object' && data !== null ? data : {}
    log.log('[site-diary-pdf-worker] Claimed export job.', formatClaimLogLine(row))

    try {
      const result = await executeClaimed({
        admin,
        workerId,
        exportJob: row,
      })
      log.log(
        '[site-diary-pdf-worker] Export job finished.',
        formatExecutionSuccessLog(result && typeof result === 'object' ? result : {}),
      )
    } catch (err) {
      log.log(
        '[site-diary-pdf-worker] Export job finished.',
        formatExecutionFailureLog(err),
      )
    }
  }

  log.log('[site-diary-pdf-worker] Shutdown complete.')
}
