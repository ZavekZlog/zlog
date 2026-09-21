import { validateWorkerEnv } from './env.js'
import { createWorkerSupabaseAdmin } from './supabase-admin.js'
import { runClaimLoop } from './claim-loop.js'
import { loadProductionPdfExecutor } from './load-production-pdf-executor.mjs'

const shutdown = { shuttingDown: false }

function onShutdownSignal(signal) {
  if (shutdown.shuttingDown) return
  shutdown.shuttingDown = true
  console.log(`[site-diary-pdf-worker] Received ${signal}; stopping poll loop.`)
}

process.on('SIGINT', () => onShutdownSignal('SIGINT'))
process.on('SIGTERM', () => onShutdownSignal('SIGTERM'))

async function main() {
  const config = validateWorkerEnv(process.env)

  console.log('[site-diary-pdf-worker] Worker starting.')
  console.log('[site-diary-pdf-worker] Worker id:', config.workerId)
  console.log('[site-diary-pdf-worker] Poll interval (ms):', config.pollMs)
  console.log(
    '[site-diary-pdf-worker] Claim enabled:',
    config.claimEnabled ? 'yes' : 'no',
  )

  const admin = createWorkerSupabaseAdmin({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  })

  const executeClaimedSiteDiaryPdfExport = config.claimEnabled
    ? await loadProductionPdfExecutor()
    : undefined

  await runClaimLoop({
    admin,
    workerId: config.workerId,
    pollMs: config.pollMs,
    claimEnabled: config.claimEnabled,
    shutdown,
    executeClaimedSiteDiaryPdfExport,
  })

  process.exit(0)
}

main().catch((err) => {
  const message = err?.message ? String(err.message) : 'Worker failed to start.'
  console.error('[site-diary-pdf-worker] Startup error:', message)
  process.exit(1)
})
