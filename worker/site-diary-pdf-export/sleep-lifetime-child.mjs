/**
 * Child entrypoints for sleep / claim-loop event-loop lifetime tests only.
 * argv[2]: sleep-only | idle-loop | idle-loop-self-stop
 */
import { sleep } from './sleep.js'
import { runClaimLoop } from './claim-loop.js'

const mode = process.argv[2]

if (mode === 'sleep-only') {
  await sleep(100)
  console.log('sleep-done')
  process.exit(0)
}

if (mode === 'idle-loop') {
  const shutdown = { shuttingDown: false }
  const onStop = () => {
    shutdown.shuttingDown = true
  }
  process.on('SIGTERM', onStop)
  process.on('SIGINT', onStop)

  await runClaimLoop({
    admin: {},
    workerId: 'lifetime-test-worker',
    pollMs: 80,
    claimEnabled: true,
    shutdown,
    claimNext: async () => ({ data: null, error: null }),
    executeClaimedSiteDiaryPdfExport: async () => {
      throw new Error('unexpected job in lifetime test')
    },
  })

  console.log('shutdown-complete')
  process.exit(0)
}

if (mode === 'idle-loop-self-stop') {
  const shutdown = { shuttingDown: false }
  setTimeout(() => {
    shutdown.shuttingDown = true
  }, 180)

  await runClaimLoop({
    admin: {},
    workerId: 'lifetime-test-worker',
    pollMs: 80,
    claimEnabled: true,
    shutdown,
    claimNext: async () => ({ data: null, error: null }),
    executeClaimedSiteDiaryPdfExport: async () => {
      throw new Error('unexpected job in lifetime test')
    },
  })

  console.log('shutdown-complete')
  process.exit(0)
}

console.error('unknown mode:', mode)
process.exit(2)
