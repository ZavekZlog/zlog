import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

import { SiteDiaryPdfExportPreflightError } from './preflight-site-diary-pdf-export-core.js'
import { WorkerPdfProcessorError } from './process-site-diary-pdf-export-core.js'
import {
  executeClaimedSiteDiaryPdfExportCore,
  ClaimedSiteDiaryPdfExportExecutionError,
  buildSiteDiaryPdfExportStoragePath,
} from './execute-claimed-site-diary-pdf-export-core.js'

const here = dirname(fileURLToPath(import.meta.url))

const EXPORT_ID = '11111111-1111-4111-8111-111111111111'
const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OWNER_ID = '44444444-4444-4444-8444-444444444444'
const FINGERPRINT = 'a'.repeat(64)
const WORKER_ID = 'worker-test-1'

function validExportJob(overrides = {}) {
  return {
    id: EXPORT_ID,
    report_id: REPORT_ID,
    project_id: PROJECT_ID,
    owner_id: OWNER_ID,
    content_fingerprint: FINGERPRINT,
    snapshot_version: 1,
    storage_bucket: 'site-diary-pdf-exports',
    ...overrides,
  }
}

function preflightOk() {
  return {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    contentFingerprint: FINGERPRINT,
    snapshotVersion: 1,
  }
}

function createDeps(overrides = {}) {
  const order = []
  const pdfBuffer = Buffer.from('pdf-test-bytes')
  const calls = {
    preflight: 0,
    process: 0,
    upload: 0,
    complete: 0,
    fail: 0,
    order,
    lastUpload: null,
    lastComplete: null,
    lastFail: null,
  }

  const deps = {
    preflight: async () => {
      calls.preflight += 1
      order.push('preflight')
      return preflightOk()
    },
    processExport: async () => {
      calls.process += 1
      order.push('process')
      return {
        buffer: pdfBuffer,
        byteSize: pdfBuffer.length,
        reportId: REPORT_ID,
        exportId: EXPORT_ID,
      }
    },
    uploadObject: async (_admin, bucket, path, buffer) => {
      calls.upload += 1
      order.push('upload')
      calls.lastUpload = { bucket, path, buffer, options: overrides.uploadOptions }
      return overrides.uploadResult ?? { error: null }
    },
    completeExport: async (_admin, workerId, exportId, storagePath, byteSize) => {
      calls.complete += 1
      order.push('complete')
      calls.lastComplete = { workerId, exportId, storagePath, byteSize }
      return overrides.completeResult ?? { error: null, data: {} }
    },
    failExport: async (_admin, workerId, exportId, code, message) => {
      calls.fail += 1
      order.push('fail')
      calls.lastFail = { workerId, exportId, code, message }
      return overrides.failResult ?? { error: null, data: {} }
    },
    calls,
    pdfBuffer,
  }

  return { ...deps, ...overrides, calls, pdfBuffer, order }
}

describe('executeClaimedSiteDiaryPdfExportCore', () => {
  it('A/B — valid job: preflight → process → upload → complete', async () => {
    const { preflight, processExport, uploadObject, completeExport, failExport, calls, order } =
      createDeps()

    const result = await executeClaimedSiteDiaryPdfExportCore({
      admin: {},
      workerId: WORKER_ID,
      exportJob: validExportJob(),
      preflight,
      processExport,
      uploadObject,
      completeExport,
      failExport,
    })

    assert.equal(result.ok, true)
    assert.equal(result.exportId, EXPORT_ID)
    assert.equal(result.reportId, REPORT_ID)
    assert.deepEqual(order, ['preflight', 'process', 'upload', 'complete'])
    assert.equal(calls.fail, 0)
  })

  it('C — deterministic storage path owner/report/fingerprint.pdf', async () => {
    const path = buildSiteDiaryPdfExportStoragePath({
      ownerId: OWNER_ID,
      reportId: REPORT_ID,
      contentFingerprint: FINGERPRINT,
    })
    assert.equal(path, `${OWNER_ID}/${REPORT_ID}/${FINGERPRINT}.pdf`)
  })

  it('F — exact processor Buffer passed to Storage upload step', async () => {
    const deps = createDeps()
    await executeClaimedSiteDiaryPdfExportCore({
      admin: {},
      workerId: WORKER_ID,
      exportJob: validExportJob(),
      preflight: deps.preflight,
      processExport: deps.processExport,
      uploadObject: deps.uploadObject,
      completeExport: deps.completeExport,
      failExport: deps.failExport,
    })

    assert.equal(deps.calls.lastUpload.bucket, 'site-diary-pdf-exports')
    assert.equal(
      deps.calls.lastUpload.path,
      `${OWNER_ID}/${REPORT_ID}/${FINGERPRINT}.pdf`,
    )
    assert.equal(deps.calls.lastUpload.buffer, deps.pdfBuffer)
  })

  it('G — byteSize supplied to complete matches processor result', async () => {
    const { completeExport, calls, pdfBuffer, ...rest } = createDeps()
    await executeClaimedSiteDiaryPdfExportCore({
      admin: {},
      workerId: WORKER_ID,
      exportJob: validExportJob(),
      preflight: rest.preflight,
      processExport: rest.processExport,
      uploadObject: rest.uploadObject,
      completeExport,
      failExport: rest.failExport,
    })
    assert.equal(calls.lastComplete.byteSize, pdfBuffer.length)
    assert.equal(calls.lastComplete.workerId, WORKER_ID)
    assert.equal(calls.lastComplete.exportId, EXPORT_ID)
  })

  it('H — content_changed: no process/upload/complete; fail(content_changed)', async () => {
    const { calls, order, failExport, ...rest } = createDeps({
      preflight: async () => {
        calls.preflight += 1
        order.push('preflight')
        throw new SiteDiaryPdfExportPreflightError('changed', 'content_changed')
      },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => {
        assert.equal(err.code, 'content_changed')
        assert.equal(err.failRpcSucceeded, true)
        return true
      },
    )

    assert.equal(calls.process, 0)
    assert.equal(calls.upload, 0)
    assert.equal(calls.complete, 0)
    assert.equal(calls.fail, 1)
    assert.equal(calls.lastFail.code, 'content_changed')
  })

  it('I — ownership_mismatch: no process/upload/complete', async () => {
    const { calls, failExport, ...rest } = createDeps({
      preflight: async () => {
        throw new SiteDiaryPdfExportPreflightError('mismatch', 'ownership_mismatch')
      },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'ownership_mismatch',
    )

    assert.equal(calls.process, 0)
    assert.equal(calls.upload, 0)
    assert.equal(calls.complete, 0)
  })

  it('J — processor failure: no upload/complete; fail with stable code', async () => {
    const { calls, failExport, ...rest } = createDeps({
      processExport: async () => {
        throw new WorkerPdfProcessorError('assembly', 'assembly-failed')
      },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'assembly_failed',
    )

    assert.equal(calls.upload, 0)
    assert.equal(calls.complete, 0)
    assert.equal(calls.lastFail.code, 'assembly_failed')
  })

  it('K — upload failure: no complete; fail(storage_upload_failed)', async () => {
    const { calls, failExport, ...rest } = createDeps({
      uploadResult: { error: { message: 'upload failed' } },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'storage_upload_failed',
    )

    assert.equal(calls.complete, 0)
    assert.equal(calls.lastFail.code, 'storage_upload_failed')
  })

  it('L — unexpected storage bucket: no upload/complete; fail(storage_bucket_mismatch)', async () => {
    const { calls, failExport, ...rest } = createDeps()

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob({ storage_bucket: 'wrong-bucket' }),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'storage_bucket_mismatch',
    )

    assert.equal(calls.preflight, 0)
    assert.equal(calls.upload, 0)
    assert.equal(calls.complete, 0)
    assert.equal(calls.lastFail.code, 'storage_bucket_mismatch')
  })

  it('M — complete failure after upload: no fail RPC; complete_failed', async () => {
    const { calls, failExport, ...rest } = createDeps({
      completeResult: { error: { message: 'lease expired' } },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => {
        assert.equal(err.code, 'complete_failed')
        assert.equal(err.failRpcSucceeded, false)
        return true
      },
    )

    assert.equal(calls.upload, 1)
    assert.equal(calls.fail, 0)
  })

  it('N — fail RPC failure → fail_update_failed', async () => {
    const { failExport, ...rest } = createDeps({
      failResult: { error: { message: 'rpc rejected' } },
      preflight: async () => {
        throw new SiteDiaryPdfExportPreflightError('changed', 'content_changed')
      },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'fail_update_failed',
    )
  })

  it('O/P/Q — no signed URL or getPublicUrl in executor sources', () => {
    for (const file of [
      'execute-claimed-site-diary-pdf-export-core.js',
      'execute-claimed-site-diary-pdf-export.js',
    ]) {
      const src = readFileSync(join(here, file), 'utf8')
      assert.doesNotMatch(src, /createSignedUrl/)
      assert.doesNotMatch(src, /getPublicUrl/)
    }
  })

  it('S — executor does not claim jobs', () => {
    const core = readFileSync(join(here, 'execute-claimed-site-diary-pdf-export-core.js'), 'utf8')
    assert.doesNotMatch(core, /claim_next_site_diary_pdf_export/)
  })

  it('T — executor does not poll', () => {
    const core = readFileSync(join(here, 'execute-claimed-site-diary-pdf-export-core.js'), 'utf8')
    assert.doesNotMatch(core, /runClaimLoop/)
    assert.doesNotMatch(core, /pollMs/)
  })

  it('upload helper sets contentType and upsert', async () => {
    const { uploadSiteDiaryPdfExportObject } = await import(
      './execute-claimed-site-diary-pdf-export-core.js'
    )
    let captured = null
    const admin = {
      storage: {
        from(bucket) {
          return {
            upload(path, buffer, options) {
              captured = { bucket, path, buffer, options }
              return { error: null }
            },
          }
        },
      },
    }
    const buf = Buffer.from('x')
    await uploadSiteDiaryPdfExportObject(admin, 'site-diary-pdf-exports', 'a/b/c.pdf', buf)
    assert.equal(captured.options.contentType, 'application/pdf')
    assert.equal(captured.options.upsert, true)
    assert.equal(captured.buffer, buf)
  })

  it('photo_incomplete maps to fail code', async () => {
    const { calls, failExport, ...rest } = createDeps({
      processExport: async () => {
        const err = new Error('photos')
        err.name = 'DiaryPdfPhotosIncompleteError'
        throw err
      },
    })

    await assert.rejects(
      () =>
        executeClaimedSiteDiaryPdfExportCore({
          admin: {},
          workerId: WORKER_ID,
          exportJob: validExportJob(),
          preflight: rest.preflight,
          processExport: rest.processExport,
          uploadObject: rest.uploadObject,
          completeExport: rest.completeExport,
          failExport,
        }),
      (err) => err.code === 'photo_incomplete',
    )
    assert.equal(calls.lastFail.code, 'photo_incomplete')
  })
})

describe('ClaimedSiteDiaryPdfExportExecutionError', () => {
  it('exposes stable code', () => {
    const err = new ClaimedSiteDiaryPdfExportExecutionError('msg', 'complete_failed')
    assert.equal(err.code, 'complete_failed')
  })
})
