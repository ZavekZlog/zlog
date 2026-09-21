import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  runClaimLoop,
  formatClaimLogLine,
  formatExecutionFailureLog,
  formatExecutionSuccessLog,
} from './claim-loop.js'
import { PRODUCTION_PDF_BUNDLE_RELATIVE_PATH } from './load-production-pdf-executor.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const JOB_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  report_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  owner_id: '44444444-4444-4444-8444-444444444444',
  content_fingerprint: 'a'.repeat(64),
  snapshot_version: 1,
  storage_bucket: 'site-diary-pdf-exports',
}

async function yieldSleep(_ms, shutdown) {
  await new Promise((resolve) => setImmediate(resolve))
  if (shutdown?.shuttingDown) return
}

describe('runClaimLoop (2C-2C-2C)', () => {
  it('A — claims disabled → no claim RPC and no executor', async () => {
    let claimCalls = 0
    let execCalls = 0
    const shutdown = { shuttingDown: false }
    let idleWaits = 0

    await runClaimLoop({
      admin: {
        rpc: () => {
          claimCalls += 1
          return Promise.resolve({ data: null, error: null })
        },
      },
      workerId: 'worker-1',
      pollMs: 5,
      claimEnabled: false,
      shutdown,
      sleep: async () => {
        idleWaits += 1
        if (idleWaits >= 1) shutdown.shuttingDown = true
        await yieldSleep(0, shutdown)
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        execCalls += 1
      },
    })

    assert.equal(claimCalls, 0)
    assert.equal(execCalls, 0)
  })

  it('B — idle claim → sleep → retry without executor', async () => {
    let claimCalls = 0
    let sleepCalls = 0
    let execCalls = 0
    const shutdown = { shuttingDown: false }

    await runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 10,
      claimEnabled: true,
      shutdown,
      sleep: async () => {
        sleepCalls += 1
        if (sleepCalls >= 2) shutdown.shuttingDown = true
      },
      claimNext: async () => {
        claimCalls += 1
        return { data: null, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        execCalls += 1
      },
    })

    assert.ok(claimCalls >= 2)
    assert.ok(sleepCalls >= 2)
    assert.equal(execCalls, 0)
  })

  it('C/D — claimed job → executor called once with admin, workerId, exportJob', async () => {
    const calls = []
    const shutdown = { shuttingDown: false }

    await runClaimLoop({
      admin: 'admin-ref',
      workerId: 'worker-abc',
      pollMs: 5,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      claimNext: async () => {
        if (calls.length > 0) {
          shutdown.shuttingDown = true
          return { data: null, error: null }
        }
        return { data: JOB_ROW, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async (input) => {
        calls.push(input)
        return { ok: true, exportId: JOB_ROW.id, reportId: JOB_ROW.report_id, byteSize: 99 }
      },
    })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].admin, 'admin-ref')
    assert.equal(calls[0].workerId, 'worker-abc')
    assert.deepEqual(calls[0].exportJob, JOB_ROW)
  })

  it('E — second claim waits until first executor settles', async () => {
    let claimCalls = 0
    let releaseExec
    let execStarted = false
    const shutdown = { shuttingDown: false }

    const loopPromise = runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 1,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      claimNext: async () => {
        claimCalls += 1
        if (claimCalls === 1) return { data: JOB_ROW, error: null }
        if (claimCalls === 2 && !execStarted) {
          throw new Error('second claim before executor settled')
        }
        shutdown.shuttingDown = true
        return { data: null, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        execStarted = true
        await new Promise((resolve) => {
          releaseExec = resolve
        })
        return { ok: true, exportId: JOB_ROW.id, reportId: JOB_ROW.report_id, byteSize: 1 }
      },
    })

    await new Promise((r) => setTimeout(r, 15))
    assert.equal(claimCalls, 1)
    releaseExec()
    await loopPromise
    assert.ok(claimCalls >= 2)
  })

  it('F — successful executor → loop may claim again', async () => {
    let claimCalls = 0
    let execCalls = 0
    const shutdown = { shuttingDown: false }

    await runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 1,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      claimNext: async () => {
        claimCalls += 1
        if (claimCalls === 1) return { data: JOB_ROW, error: null }
        if (claimCalls === 2) return { data: { ...JOB_ROW, id: '55555555-5555-4555-8555-555555555555' }, error: null }
        shutdown.shuttingDown = true
        return { data: null, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        execCalls += 1
        return { ok: true, exportId: JOB_ROW.id, reportId: JOB_ROW.report_id, byteSize: 1 }
      },
    })

    assert.equal(execCalls, 2)
    assert.ok(claimCalls >= 2)
  })

  it('G/H — executor failure does not kill loop; no duplicate fail in loop', async () => {
    let execCalls = 0
    const shutdown = { shuttingDown: false }
    const logs = []
    const log = {
      log: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    }

    await runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 1,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      log,
      claimNext: async () => {
        execCalls += 1
        if (execCalls === 1) return { data: JOB_ROW, error: null }
        shutdown.shuttingDown = true
        return { data: null, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        const err = new Error('handled')
        err.code = 'content_changed'
        throw err
      },
    })

    const joined = JSON.stringify(logs)
    assert.doesNotMatch(joined, /fail_site_diary_pdf_export/)
    assert.doesNotMatch(joined, /complete_site_diary_pdf_export/)
    assert.match(joined, /content_changed/)
  })

  it('I — shutdown before claim → no claim when already shutting down', async () => {
    let claimCalls = 0
    const shutdown = { shuttingDown: true }

    await runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 5,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      claimNext: async () => {
        claimCalls += 1
        return { data: JOB_ROW, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => ({ ok: true }),
    })

    assert.equal(claimCalls, 0)
  })

  it('J — shutdown during active executor: finish job, no subsequent claim', async () => {
    let claimCalls = 0
    let releaseExec
    const shutdown = { shuttingDown: false }

    const loopPromise = runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 1,
      claimEnabled: true,
      shutdown,
      sleep: yieldSleep,
      claimNext: async () => {
        claimCalls += 1
        return { data: JOB_ROW, error: null }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        await new Promise((resolve) => {
          releaseExec = resolve
        })
        return { ok: true, exportId: JOB_ROW.id, reportId: JOB_ROW.report_id, byteSize: 1 }
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    shutdown.shuttingDown = true
    releaseExec()
    await loopPromise
    assert.equal(claimCalls, 1)
  })

  it('M — claim RPC error → no executor', async () => {
    let execCalls = 0
    let claimCalls = 0
    const shutdown = { shuttingDown: false }

    await runClaimLoop({
      admin: {},
      workerId: 'worker-1',
      pollMs: 1,
      claimEnabled: true,
      shutdown,
      sleep: async () => {
        shutdown.shuttingDown = true
      },
      claimNext: async () => {
        claimCalls += 1
        return { data: null, error: { message: 'rpc failed' } }
      },
      executeClaimedSiteDiaryPdfExport: async () => {
        execCalls += 1
      },
    })

    assert.equal(claimCalls, 1)
    assert.equal(execCalls, 0)
  })

  it('L — safe logs omit full job and raw errors', () => {
    const failure = formatExecutionFailureLog({ code: 'content_changed', message: 'secret report text' })
    assert.deepEqual(failure, { state: 'failed', code: 'content_changed' })
    assert.doesNotMatch(JSON.stringify(failure), /secret/)

    const success = formatExecutionSuccessLog({
      ok: true,
      exportId: 'e1',
      reportId: 'r1',
      byteSize: 10,
      secretPayload: 'pdf-bytes',
    })
    assert.equal(success.byteSize, 10)
    assert.doesNotMatch(JSON.stringify(success), /pdf/)
  })

  it('O — production runtime loads bundled executor', () => {
    const loaderSrc = readFileSync(join(here, 'load-production-pdf-executor.mjs'), 'utf8')
    const runSrc = readFileSync(join(here, 'run.mjs'), 'utf8')
    assert.match(loaderSrc, /worker-pdf-pipeline\.mjs/)
    assert.match(loaderSrc, /executeClaimedSiteDiaryPdfExport/)
    assert.match(runSrc, /loadProductionPdfExecutor/)
    assert.equal(PRODUCTION_PDF_BUNDLE_RELATIVE_PATH, 'dist/worker-pdf-pipeline.mjs')
  })

  it('claim log formatter stays minimal', () => {
    const line = formatClaimLogLine({
      ...JOB_ROW,
      site_summary: 'private',
    })
    assert.deepEqual(Object.keys(line).sort(), ['attempt', 'exportId', 'reclaimCount', 'reportId'])
  })
})
