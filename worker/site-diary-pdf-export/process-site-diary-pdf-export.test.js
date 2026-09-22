import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

import {
  processSiteDiaryPdfExportCore,
  validateExportJob,
  WorkerPdfProcessorError,
} from './process-site-diary-pdf-export-core.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

function read(rel) {
  return readFileSync(join(here, rel), 'utf8')
}

const VALID_JOB = {
  id: '11111111-1111-4111-8111-111111111111',
  report_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  owner_id: '44444444-4444-4444-8444-444444444444',
  content_fingerprint: 'a'.repeat(64),
  snapshot_version: 1,
}

function createPipelineSpy() {
  const calls = { assemble: 0, assert: 0, render: 0, order: [] }
  const buffer = Buffer.from('pdf-bytes')

  return {
    calls,
    pipeline: {
      assembleSiteDiaryPdfDocumentProps: async (admin, reportId) => {
        calls.assemble += 1
        calls.order.push('assemble')
        assert.equal(admin, 'admin-mock')
        assert.equal(reportId, VALID_JOB.report_id)
        return {
          ok: true,
          props: { photos: [{ src: 'data:image/jpeg;base64,abc', url: 'p1' }] },
          photoRows: [{ url: 'p1' }],
          report: { id: VALID_JOB.report_id, project_id: VALID_JOB.project_id },
        }
      },
      assertDiaryPdfPhotosComplete: ({ expected, prepared }) => {
        calls.assert += 1
        calls.order.push('assert')
        assert.equal(expected.length, 1)
        assert.equal(prepared.length, 1)
        return { ok: true, failures: [] }
      },
      renderSiteDiaryPdfBuffer: async (props) => {
        calls.render += 1
        calls.order.push('render')
        assert.ok(props.photos)
        return { buffer, renderMs: 1 }
      },
    },
    buffer,
  }
}

describe('processSiteDiaryPdfExport (2C-2C-1B)', () => {
  it('A — processor imports/reuses the existing assembler', () => {
    const wrapper = read('process-site-diary-pdf-export.js')
    assert.match(wrapper, /@\/lib\/server\/assemble-site-diary-pdf-props\.js/)
    assert.match(wrapper, /assembleSiteDiaryPdfDocumentProps/)
  })

  it('B — processor imports/reuses the existing photo completeness helper', () => {
    const wrapper = read('process-site-diary-pdf-export.js')
    assert.match(wrapper, /@\/lib\/diary-pdf-photos\.js/)
    assert.match(wrapper, /assertDiaryPdfPhotosComplete/)
  })

  it('C — processor imports/reuses the existing renderer', () => {
    const wrapper = read('process-site-diary-pdf-export.js')
    assert.match(wrapper, /@\/lib\/server\/render-site-diary-pdf\.js/)
    assert.match(wrapper, /renderSiteDiaryPdfBuffer/)
  })

  it('D — assembler is called with injected admin + export job report id', async () => {
    const { pipeline, calls } = createPipelineSpy()
    await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.equal(calls.assemble, 1)
  })

  it('E — completeness check occurs AFTER assembly', async () => {
    const { pipeline, calls } = createPipelineSpy()
    await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.deepEqual(calls.order.slice(0, 2), ['assemble', 'assert'])
  })

  it('F — renderer occurs AFTER completeness succeeds', async () => {
    const { pipeline, calls } = createPipelineSpy()
    await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.deepEqual(calls.order, ['assemble', 'assert', 'render'])
  })

  it('G — renderer is NOT called if completeness fails', async () => {
    const { pipeline, calls } = createPipelineSpy()
    pipeline.assertDiaryPdfPhotosComplete = () => {
      calls.assert += 1
      calls.order.push('assert')
      return { ok: false, failures: [{ reason: 'photo-skipped' }] }
    }
    await assert.rejects(
      () =>
        processSiteDiaryPdfExportCore({
          admin: 'admin-mock',
          exportJob: VALID_JOB,
          pipeline,
          photosIncompleteError: class DiaryPdfPhotosIncompleteError extends Error {
            constructor(message) {
              super(message)
              this.name = 'DiaryPdfPhotosIncompleteError'
            }
          },
        }),
      (err) => err?.name === 'DiaryPdfPhotosIncompleteError',
    )
    assert.equal(calls.render, 0)
  })

  it('H — returned buffer is the exact renderer Buffer', async () => {
    const { pipeline, buffer } = createPipelineSpy()
    const result = await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.equal(result.buffer, buffer)
  })

  it('I — byteSize equals buffer length', async () => {
    const { pipeline } = createPipelineSpy()
    const result = await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.equal(result.byteSize, result.buffer.length)
  })

  it('J — reportId/exportId returned correctly', async () => {
    const { pipeline } = createPipelineSpy()
    const result = await processSiteDiaryPdfExportCore({ admin: 'admin-mock', exportJob: VALID_JOB, pipeline })
    assert.equal(result.reportId, VALID_JOB.report_id)
    assert.equal(result.exportId, VALID_JOB.id)
  })

  it('K — malformed/missing export job identity is rejected before assembly', async () => {
    const { pipeline, calls } = createPipelineSpy()
    await assert.rejects(
      () =>
        processSiteDiaryPdfExportCore({
          admin: 'admin-mock',
          exportJob: { ...VALID_JOB, report_id: '' },
          pipeline,
        }),
      WorkerPdfProcessorError,
    )
    assert.equal(calls.assemble, 0)
  })

  it('L — no claim RPC', () => {
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /\.rpc\s*\(/)
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /claim_next_site_diary_pdf_export/)
  })

  it('M — no complete RPC', () => {
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /complete_site_diary_pdf_export/)
  })

  it('N — no fail RPC', () => {
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /fail_site_diary_pdf_export/)
  })

  it('O — no Storage upload', () => {
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /\.storage\./)
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /\.upload\s*\(/)
  })

  it('P — no second DiaryPdfDocument/component tree under worker/', () => {
    assert.equal(existsSync(join(here, 'DiaryPdfDocument.jsx')), false)
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /@\/components\/pdf\/DiaryPdfDocument/)
  })

  it('Q — no duplicated photo-preparation implementation', () => {
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /buildDiaryPdfPhotos/)
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /preloadPhaseCWorkPhotoSources/)
  })

  it('R — run.mjs unchanged', () => {
    const runSrc = read('run.mjs')
    assert.doesNotMatch(runSrc, /processSiteDiaryPdfExport/)
    assert.match(runSrc, /runClaimLoop/)
  })

  it('S — claim-loop delegates PDF work to injected executor only', () => {
    const loopSrc = read('claim-loop.js')
    assert.doesNotMatch(loopSrc, /processSiteDiaryPdfExport/)
    assert.doesNotMatch(loopSrc, /assembleSiteDiaryPdfDocumentProps/)
    assert.match(loopSrc, /CLAIM_RPC_NAME/)
    assert.match(loopSrc, /invokeClaimNextExport/)
    assert.match(loopSrc, /executeClaimedSiteDiaryPdfExport/)
  })

  it('T — existing worker build boundary remains intact', () => {
    assert.match(read('build-pdf-pipeline.mjs'), /target:\s*'node20'/)
    assert.match(read('build-pdf-pipeline.mjs'), /serverOnlyShimPlugin/)
    assert.match(read('pdf-pipeline-build-entry.mjs'), /processSiteDiaryPdfExport/)
  })
})

describe('validateExportJob', () => {
  it('accepts valid persisted job shape', () => {
    const v = validateExportJob(VALID_JOB)
    assert.equal(v.exportId, VALID_JOB.id)
    assert.equal(v.contentFingerprint, 'a'.repeat(64))
  })
})
