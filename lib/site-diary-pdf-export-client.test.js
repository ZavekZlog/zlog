import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SITE_DIARY_PDF_EXPORT_RPC,
  SITE_DIARY_PDF_EXPORT_CLIENT_CODE,
  SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS,
  parseSiteDiaryPdfExportJobRow,
  fetchAuthoritativeSiteDiaryPdfExportFingerprint,
  enqueueSiteDiaryPdfExportJob,
  getSiteDiaryPdfExportJob,
  pollSiteDiaryPdfExportJobUntilTerminal,
  requestFingerprintAndEnqueueSiteDiaryPdfExport,
  fetchSiteDiaryPdfExportArtifact,
  fetchSiteDiaryPdfExportShareReadyArtifact,
  buildShareReadySiteDiaryPdfFromBlob,
  runSiteDiaryPdfExportToShareReadyArtifact,
  reconcileAuthoritativeSiteDiaryPdfExportToShareReady,
  resolveAuthoritativeSiteDiaryPdfExportIdentity,
  hydrateShareReadyArtifactFromExportIdentity,
  completeSiteDiaryPdfExportToShareReadyAfterEnqueue,
  SITE_DIARY_PDF_RECONCILE_DIAG_STAGE,
  shareTimingFingerprintPrefix,
  SITE_DIARY_SHARE_TIMING_STAGE,
} from './site-diary-pdf-export-client.js'

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const EXPORT_ID = '11111111-1111-4111-8111-111111111111'
const FINGERPRINT = 'a'.repeat(64)
const SIGNED_ARTIFACT_URL =
  'https://storage.example/object/sign/site-diary-pdf-exports/file.pdf?token=abc'

function mockAuthorizeAndSignedPdfFetch(options = {}) {
  const pdfBytes = options.pdfBytes ?? new Uint8Array([0x25, 0x50, 0x44, 0x46])
  const signedUrl = options.signedUrl ?? SIGNED_ARTIFACT_URL
  return async (url) => {
    const target = String(url)
    if (target.includes('/pdf-export/') && !target.includes('fingerprint')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          signedUrl,
          fileName: options.fileName ?? 'Zlog-Site-Diary-2026-08-24.pdf',
          title: options.title ?? 'Site Diary',
          text: options.text ?? 'Alpha — Site Diary',
          exportId: EXPORT_ID,
          reportId: REPORT_ID,
        }),
      }
    }
    if (target === signedUrl) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (key) => (String(key).toLowerCase() === 'content-type' ? 'application/pdf' : null),
        },
        blob: async () => new Blob([pdfBytes], { type: 'application/pdf' }),
      }
    }
    throw new Error(`unexpected fetch url: ${target}`)
  }
}

function jobRow(overrides = {}) {
  return {
    id: EXPORT_ID,
    report_id: REPORT_ID,
    content_fingerprint: FINGERPRINT,
    snapshot_version: 1,
    status: 'queued',
    ...overrides,
  }
}

function mockSupabase(rpcImpl) {
  const calls = []
  return {
    calls,
    client: {
      rpc: async (name, args) => {
        calls.push({ name, args })
        return rpcImpl(name, args, calls.length)
      },
    },
  }
}

describe('shareTimingFingerprintPrefix', () => {
  it('returns an 8-char prefix for valid fingerprints only', () => {
    assert.equal(shareTimingFingerprintPrefix(FINGERPRINT), 'aaaaaaaa')
    assert.equal(shareTimingFingerprintPrefix('not-a-fingerprint'), null)
  })
})

describe('share timing instrumentation', () => {
  it('emits ordered safe stages when tapStartedAt is provided', async () => {
    const tapStartedAt = 1_700_000_000_000
    const timingEvents = []
    const onShareTiming = (stage, payload) => {
      timingEvents.push({ stage, payload })
    }

    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      tapStartedAt,
      onShareTiming,
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, true)
    const stages = timingEvents.map((e) => e.stage)
    assert.deepEqual(stages, [
      SITE_DIARY_SHARE_TIMING_STAGE.fingerprint,
      SITE_DIARY_SHARE_TIMING_STAGE.enqueue,
      SITE_DIARY_SHARE_TIMING_STAGE.pollComplete,
      SITE_DIARY_SHARE_TIMING_STAGE.artifactAuthorize,
      SITE_DIARY_SHARE_TIMING_STAGE.signedFetchResponse,
      SITE_DIARY_SHARE_TIMING_STAGE.signedFetchBlob,
      SITE_DIARY_SHARE_TIMING_STAGE.shareReadyFile,
    ])

    for (const event of timingEvents) {
      assert.equal(event.payload.tapStartedAt, tapStartedAt)
      assert.equal(typeof event.payload.elapsedMsSinceTap, 'number')
      assert.equal(event.payload.signedUrl, undefined)
      assert.equal(event.payload.token, undefined)
    }

    const enqueueEvent = timingEvents.find((e) => e.stage === SITE_DIARY_SHARE_TIMING_STAGE.enqueue)
    assert.equal(enqueueEvent.payload.exportId, EXPORT_ID)
    assert.equal(enqueueEvent.payload.status, 'ready')
    assert.equal(enqueueEvent.payload.fingerprintPrefix, 'aaaaaaaa')

    const pollEvent = timingEvents.find((e) => e.stage === SITE_DIARY_SHARE_TIMING_STAGE.pollComplete)
    assert.equal(pollEvent.payload.enqueueReturnedStatus, 'ready')
    assert.equal(pollEvent.payload.pollGetCallCount, 0)

    const blobEvent = timingEvents.find((e) => e.stage === SITE_DIARY_SHARE_TIMING_STAGE.signedFetchBlob)
    assert.ok(blobEvent.payload.blobSize > 0)
    assert.equal(blobEvent.payload.blobType, 'application/pdf')
  })

  it('does not emit timing stages without tapStartedAt', async () => {
    const timingEvents = []
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      onShareTiming: (stage, payload) => timingEvents.push({ stage, payload }),
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      sleep: async () => {},
    })

    assert.equal(timingEvents.length, 0)
  })
})

describe('parseSiteDiaryPdfExportJobRow', () => {
  it('accepts a valid RPC row', () => {
    const parsed = parseSiteDiaryPdfExportJobRow(jobRow({ status: 'ready' }))
    assert.equal(parsed.ok, true)
    assert.equal(parsed.job.id, EXPORT_ID)
    assert.equal(parsed.job.status, 'ready')
  })

  it('rejects malformed RPC response safely', () => {
    assert.equal(parseSiteDiaryPdfExportJobRow(null).ok, false)
    assert.equal(parseSiteDiaryPdfExportJobRow({ id: 'not-uuid', status: 'queued' }).ok, false)
    assert.equal(
      parseSiteDiaryPdfExportJobRow({
        id: EXPORT_ID,
        status: 'queued',
        content_fingerprint: 'not-hex',
      }).ok,
      false,
    )
  })
})

describe('fetchAuthoritativeSiteDiaryPdfExportFingerprint', () => {
  it('requests fingerprint once from the server endpoint', async () => {
    let fetchCount = 0
    const fetchFn = async (url, init) => {
      fetchCount += 1
      assert.match(url, /\/api\/site-diary\/.+\/pdf-export\/fingerprint$/)
      assert.equal(init.method, 'GET')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          reportId: REPORT_ID,
          contentFingerprint: FINGERPRINT,
          snapshotVersion: 1,
        }),
      }
    }

    const result = await fetchAuthoritativeSiteDiaryPdfExportFingerprint(REPORT_ID, { fetch: fetchFn })
    assert.equal(fetchCount, 1)
    assert.equal(result.ok, true)
    assert.equal(result.contentFingerprint, FINGERPRINT)
    assert.equal(result.snapshotVersion, 1)
  })
})

describe('enqueueSiteDiaryPdfExportJob', () => {
  it('calls enqueue RPC once with exact arguments and captures export id', async () => {
    const { client, calls } = mockSupabase((name) => {
      assert.equal(name, SITE_DIARY_PDF_EXPORT_RPC.enqueue)
      return { data: jobRow(), error: null }
    })

    const result = await enqueueSiteDiaryPdfExportJob(client, {
      reportId: REPORT_ID,
      contentFingerprint: FINGERPRINT,
      snapshotVersion: 1,
    })

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args, {
      p_report_id: REPORT_ID,
      p_content_fingerprint: FINGERPRINT,
      p_snapshot_version: 1,
    })
    assert.equal(result.ok, true)
    assert.equal(result.exportId, EXPORT_ID)
  })
})

describe('pollSiteDiaryPdfExportJobUntilTerminal', () => {
  it('queued → processing → ready succeeds', async () => {
    let poll = 0
    const { client } = mockSupabase((name) => {
      assert.equal(name, SITE_DIARY_PDF_EXPORT_RPC.get)
      poll += 1
      if (poll === 1) return { data: jobRow({ status: 'queued' }), error: null }
      if (poll === 2) return { data: jobRow({ status: 'processing' }), error: null }
      return { data: jobRow({ status: 'ready', storage_path: 'o/r/f.pdf' }), error: null }
    })

    const result = await pollSiteDiaryPdfExportJobUntilTerminal(client, EXPORT_ID, {
      timeoutMs: 30_000,
      initialIntervalMs: 1,
      maxIntervalMs: 1,
      now: () => Date.now(),
      sleep: async () => {},
    })

    assert.equal(result.ok, true)
    assert.equal(result.job.status, 'ready')
    assert.equal(poll, 3)
  })

  it('queued → failed returns structured failure', async () => {
    const { client } = mockSupabase(() => ({
      data: jobRow({
        status: 'failed',
        error_code: 'photo_incomplete',
        error_message: 'Photos still processing.',
      }),
      error: null,
    }))

    const result = await pollSiteDiaryPdfExportJobUntilTerminal(client, EXPORT_ID, {
      timeoutMs: 5_000,
      initialIntervalMs: 1,
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportFailed)
    assert.match(result.message, /Photos/)
    assert.equal(result.job.status, 'failed')
  })

  it('AbortSignal stops polling', async () => {
    const controller = new AbortController()
    let poll = 0
    const { client } = mockSupabase(() => {
      poll += 1
      if (poll === 1) controller.abort()
      return { data: jobRow({ status: 'queued' }), error: null }
    })

    const result = await pollSiteDiaryPdfExportJobUntilTerminal(client, EXPORT_ID, {
      signal: controller.signal,
      timeoutMs: 30_000,
      initialIntervalMs: 10,
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollAborted)
    assert.equal(poll, 1)
  })

  it('timeout stops polling without enqueue', async () => {
    const { client, calls } = mockSupabase(() => ({
      data: jobRow({ status: 'queued' }),
      error: null,
    }))

    let tick = 0
    const result = await pollSiteDiaryPdfExportJobUntilTerminal(client, EXPORT_ID, {
      timeoutMs: 5,
      initialIntervalMs: 10,
      now: () => {
        tick += 1
        return tick === 1 ? 0 : 100
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollTimeout)
    assert.ok(calls.every((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.get))
  })
})

describe('requestFingerprintAndEnqueueSiteDiaryPdfExport', () => {
  it('does not perform a second enqueue after ambiguous enqueue error', async () => {
    let fetchCount = 0
    const fetchFn = async () => {
      fetchCount += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          reportId: REPORT_ID,
          contentFingerprint: FINGERPRINT,
          snapshotVersion: 1,
        }),
      }
    }

    const { client, calls } = mockSupabase(() => ({
      data: null,
      error: { message: 'network error' },
    }))

    const result = await requestFingerprintAndEnqueueSiteDiaryPdfExport(client, REPORT_ID, {
      fetch: fetchFn,
    })

    assert.equal(fetchCount, 1)
    assert.equal(calls.length, 1)
    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.enqueueRpc)
  })

  it('does not enqueue again after polling timeout (poll is separate)', async () => {
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      return { data: jobRow({ status: 'queued' }), error: null }
    })

    const enqueued = await enqueueSiteDiaryPdfExportJob(client, {
      reportId: REPORT_ID,
      contentFingerprint: FINGERPRINT,
      snapshotVersion: 1,
    })
    assert.equal(enqueued.ok, true)

    const pollResult = await pollSiteDiaryPdfExportJobUntilTerminal(client, EXPORT_ID, {
      timeoutMs: 1,
      initialIntervalMs: 1,
      now: () => Date.now(),
      sleep: async () => {},
    })
    assert.equal(pollResult.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollTimeout)

    const enqueueCalls = calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue)
    assert.equal(enqueueCalls.length, 1)
  })
})

describe('getSiteDiaryPdfExportJob', () => {
  it('rejects malformed get RPC payload', async () => {
    const { client } = mockSupabase(() => ({ data: { status: 'queued' }, error: null }))
    const result = await getSiteDiaryPdfExportJob(client, EXPORT_ID)
    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollInvalid)
  })
})

describe('poll defaults', () => {
  it('exposes bounded timeout and backoff defaults', () => {
    assert.equal(SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.timeoutMs, 120_000)
    assert.ok(SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.initialIntervalMs < SITE_DIARY_PDF_EXPORT_POLL_DEFAULTS.maxIntervalMs)
  })
})

describe('fetchSiteDiaryPdfExportArtifact', () => {
  it('authorizes via Zlog API then fetches signed Storage URL directly', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    let signedFetchUrl = ''
    const fetchFn = async (url, init) => {
      const target = String(url)
      if (target.includes('/api/site-diary/')) {
        assert.equal(init?.credentials, 'same-origin')
        return mockAuthorizeAndSignedPdfFetch({ pdfBytes })(url)
      }
      signedFetchUrl = target
      return mockAuthorizeAndSignedPdfFetch({ pdfBytes })(url)
    }

    const result = await fetchSiteDiaryPdfExportArtifact(REPORT_ID, EXPORT_ID, { fetch: fetchFn })
    assert.equal(result.ok, true)
    assert.equal(result.blob.type, 'application/pdf')
    assert.equal(signedFetchUrl, SIGNED_ARTIFACT_URL)
    assert.equal(result.text, 'Alpha — Site Diary')

    const shareReady = buildShareReadySiteDiaryPdfFromBlob(result.blob, {
      fileName: result.fileName,
      title: result.title,
      text: result.text,
    })
    assert.equal(shareReady.ok, true)
    assert.equal(shareReady.file.type, 'application/pdf')
    assert.equal(shareReady.fileName, 'Zlog-Site-Diary-2026-08-24.pdf')
    assert.equal(shareReady.title, 'Site Diary')
  })

  it('propagates AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await fetchSiteDiaryPdfExportArtifact(REPORT_ID, EXPORT_ID, {
      signal: controller.signal,
      fetch: async () => {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        throw err
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactAborted)
  })

  it('rejects non-2xx safely', async () => {
    const result = await fetchSiteDiaryPdfExportArtifact(REPORT_ID, EXPORT_ID, {
      fetch: async () => ({
        ok: false,
        status: 409,
        json: async () => ({ code: 'export-not-ready', message: 'PDF export is not ready yet.' }),
      }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactHttp)
    assert.equal(result.httpStatus, 409)
  })

  it('rejects non-PDF content type from signed URL', async () => {
    const result = await fetchSiteDiaryPdfExportArtifact(REPORT_ID, EXPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('/api/site-diary/')) {
          return mockAuthorizeAndSignedPdfFetch()(url)
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          blob: async () => new Blob(['<html>'], { type: 'text/html' }),
        }
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.artifactNotPdf)
  })

  it('artifact-only helper does not enqueue', async () => {
    const { client, calls } = mockSupabase(() => ({ data: null, error: null }))
    await fetchSiteDiaryPdfExportShareReadyArtifact(REPORT_ID, EXPORT_ID, {
      fetch: mockAuthorizeAndSignedPdfFetch(),
    })
    assert.equal(calls.length, 0)
  })
})

describe('runSiteDiaryPdfExportToShareReadyArtifact', () => {
  it('enqueue exactly once through queued → processing → ready → artifact', async () => {
    let poll = 0
    let fetchCount = 0
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      poll += 1
      if (poll === 1) return { data: jobRow({ status: 'queued' }), error: null }
      if (poll === 2) return { data: jobRow({ status: 'processing' }), error: null }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      fetch: async (url, init) => {
        fetchCount += 1
        if (String(url).includes('/pdf-export/fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url, init)
      },
      timeoutMs: 30_000,
      initialIntervalMs: 1,
      maxIntervalMs: 1,
      sleep: async () => {},
    })

    assert.equal(result.ok, true)
    assert.equal(result.file.type, 'application/pdf')
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
    assert.equal(fetchCount, 3)
  })

  it('failed job does not download artifact', async () => {
    let fetchCount = 0
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      return {
        data: jobRow({ status: 'failed', error_message: 'nope' }),
        error: null,
      }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      fetch: async (url) => {
        fetchCount += 1
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        throw new Error('artifact should not be requested')
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.exportFailed)
    assert.equal(fetchCount, 1)
  })

  it('timeout does not download artifact', async () => {
    let artifactAttempts = 0
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      return { data: jobRow({ status: 'queued' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        artifactAttempts += 1
        throw new Error('artifact should not be requested')
      },
      timeoutMs: 1,
      initialIntervalMs: 1,
      now: () => Date.now(),
      sleep: async () => {},
    })

    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.pollTimeout)
    assert.equal(artifactAttempts, 0)
  })

  it('abort stops sequence before artifact', async () => {
    const controller = new AbortController()
    let artifactAttempts = 0
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      controller.abort()
      return { data: jobRow({ status: 'queued' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      signal: controller.signal,
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        artifactAttempts += 1
        throw new Error('artifact should not be requested')
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(artifactAttempts, 0)
  })

  it('artifact failure does not re-enqueue', async () => {
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow(), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToShareReadyArtifact(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return { ok: false, status: 502, json: async () => ({ message: 'down' }) }
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, false)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
  })
})

describe('reconcileAuthoritativeSiteDiaryPdfExportToShareReady', () => {
  it('READY matching export: fingerprint → enqueue ready → artifact without poll get', async () => {
    let pollGetCalls = 0
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      if (name === SITE_DIARY_PDF_EXPORT_RPC.get) {
        pollGetCalls += 1
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: null, error: null }
    })

    const result = await reconcileAuthoritativeSiteDiaryPdfExportToShareReady(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      isStillValid: () => true,
    })

    assert.equal(result.ok, true)
    assert.equal(result.file?.size > 0, true)
    assert.equal(result.contentFingerprint, FINGERPRINT)
    assert.equal(result.enqueueReturnedStatus, 'ready')
    assert.equal(pollGetCalls, 0)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
  })

  it('QUEUED export: reuses existing job via single enqueue and polls until ready', async () => {
    let pollGetCalls = 0
    const { client, calls } = mockSupabase((name, _args, callIndex) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'queued' }), error: null }
      }
      if (name === SITE_DIARY_PDF_EXPORT_RPC.get) {
        pollGetCalls += 1
        const status = callIndex >= 2 ? 'ready' : 'queued'
        return { data: jobRow({ status }), error: null }
      }
      return { data: null, error: null }
    })

    const result = await reconcileAuthoritativeSiteDiaryPdfExportToShareReady(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      sleep: async () => {},
      isStillValid: () => true,
    })

    assert.equal(result.ok, true)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
    assert.ok(pollGetCalls >= 1)
  })

  it('discards when diary becomes dirty during reconcile', async () => {
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    let stillValid = true
    const result = await reconcileAuthoritativeSiteDiaryPdfExportToShareReady(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        stillValid = false
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      isStillValid: () => stillValid,
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, SITE_DIARY_PDF_EXPORT_CLIENT_CODE.reconcileDiscarded)
  })

  it('authoritative fingerprint governs adoption — stale ready row is not reused locally', async () => {
    const newFingerprint = 'b'.repeat(64)
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return {
          data: jobRow({ status: 'ready', content_fingerprint: newFingerprint }),
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const result = await reconcileAuthoritativeSiteDiaryPdfExportToShareReady(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: newFingerprint,
              snapshotVersion: 2,
            }),
          }
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      isStillValid: () => true,
    })

    assert.equal(result.ok, true)
    assert.equal(result.contentFingerprint, newFingerprint)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
    assert.notEqual(result.contentFingerprint, FINGERPRINT)
  })
})

describe('resolveAuthoritativeSiteDiaryPdfExportIdentity', () => {
  it('resolves identity with fingerprint and enqueue only (single enqueue)', async () => {
    let pollGetCalls = 0
    const { client, calls } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      if (name === SITE_DIARY_PDF_EXPORT_RPC.get) {
        pollGetCalls += 1
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: null, error: null }
    })

    const stages = []
    const identity = await resolveAuthoritativeSiteDiaryPdfExportIdentity(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        throw new Error('artifact should not run during identity')
      },
      onReconcileDiag: (stage) => stages.push(stage),
      isStillValid: () => true,
    })

    assert.equal(identity.ok, true)
    assert.equal(identity.exportId, EXPORT_ID)
    assert.equal(identity.enqueueReturnedStatus, 'ready')
    assert.equal(pollGetCalls, 0)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 1)
    assert.ok(stages.includes(SITE_DIARY_PDF_RECONCILE_DIAG_STAGE.r1Start))
    assert.ok(stages.includes(SITE_DIARY_PDF_RECONCILE_DIAG_STAGE.r2Fingerprint))
    assert.ok(stages.includes(SITE_DIARY_PDF_RECONCILE_DIAG_STAGE.r3Enqueue))
  })

  it('identity completes before artifact hydration when hydrate is deferred', async () => {
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    let releaseArtifact
    const artifactGate = new Promise((resolve) => {
      releaseArtifact = resolve
    })

    const identityPromise = resolveAuthoritativeSiteDiaryPdfExportIdentity(client, REPORT_ID, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              reportId: REPORT_ID,
              contentFingerprint: FINGERPRINT,
              snapshotVersion: 1,
            }),
          }
        }
        await artifactGate
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      isStillValid: () => true,
    })

    const identity = await identityPromise
    assert.equal(identity.ok, true)

    const hydratePromise = hydrateShareReadyArtifactFromExportIdentity(client, REPORT_ID, identity, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          throw new Error('no second fingerprint')
        }
        await artifactGate
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
    })

    releaseArtifact()
    const hydrated = await hydratePromise
    assert.equal(hydrated.ok, true)
    assert.equal(hydrated.file?.size > 0, true)
  })
})

describe('hydrateShareReadyArtifactFromExportIdentity', () => {
  it('QUEUED identity polls then hydrates without a second enqueue', async () => {
    let pollGetCalls = 0
    const { client, calls } = mockSupabase((name, _args, callIndex) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'queued' }), error: null }
      }
      if (name === SITE_DIARY_PDF_EXPORT_RPC.get) {
        pollGetCalls += 1
        const status = callIndex >= 2 ? 'ready' : 'queued'
        return { data: jobRow({ status }), error: null }
      }
      return { data: null, error: null }
    })

    const identity = {
      ok: true,
      kind: 'identity',
      reportId: REPORT_ID,
      exportId: EXPORT_ID,
      contentFingerprint: FINGERPRINT,
      enqueueReturnedStatus: 'queued',
      job: jobRow({ status: 'queued' }),
    }

    const diagStages = []
    const result = await hydrateShareReadyArtifactFromExportIdentity(client, REPORT_ID, identity, {
      fetch: async (url) => {
        if (String(url).includes('fingerprint')) {
          throw new Error('no enqueue on hydrate')
        }
        return mockAuthorizeAndSignedPdfFetch()(url)
      },
      sleep: async () => {},
      onReconcileDiag: (stage) => diagStages.push(stage),
      reconcileStartedAt: Date.now(),
    })

    assert.equal(result.ok, true)
    assert.equal(calls.filter((c) => c.name === SITE_DIARY_PDF_EXPORT_RPC.enqueue).length, 0)
    assert.ok(pollGetCalls >= 1)
    assert.ok(diagStages.includes(SITE_DIARY_PDF_RECONCILE_DIAG_STAGE.r4ArtifactAuthorizeStart))
    assert.ok(diagStages.includes(SITE_DIARY_PDF_RECONCILE_DIAG_STAGE.r8ShareReadyBuilt))
    for (const stage of diagStages) {
      assert.equal(String(stage).includes('signedUrl'), false)
      assert.equal(String(stage).includes('token'), false)
    }
  })
})

describe('completeSiteDiaryPdfExportToShareReadyAfterEnqueue', () => {
  it('skips poll RPC when enqueue already returned ready', async () => {
    let pollGetCalls = 0
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.get) {
        pollGetCalls += 1
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    const enqueued = {
      ok: true,
      exportId: EXPORT_ID,
      job: jobRow({ status: 'ready' }),
    }

    const result = await completeSiteDiaryPdfExportToShareReadyAfterEnqueue(
      client,
      REPORT_ID,
      enqueued,
      { fetch: mockAuthorizeAndSignedPdfFetch() },
    )

    assert.equal(result.ok, true)
    assert.equal(pollGetCalls, 0)
  })
})
