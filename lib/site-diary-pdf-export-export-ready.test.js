/**
 * Gate 3F — export-ready handoff (no Tap-1 blob) + signed-URL Tap-2 download.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SITE_DIARY_PDF_EXPORT_RPC,
  SITE_DIARY_PDF_EXPORT_HANDOFF,
  runSiteDiaryPdfExportToExportReady,
  fetchSiteDiaryPdfExportAuthorization,
  buildSiteDiaryPdfExportReadyDescriptor,
} from './site-diary-pdf-export-client.js'
import { downloadSiteDiaryPdfViaSignedUrl } from './diary-share-capabilities.js'

const REPORT_ID = '22222222-2222-4222-8222-222222222222'
const EXPORT_ID = '11111111-1111-4111-8111-111111111111'
const FINGERPRINT = 'a'.repeat(64)
const SIGNED_URL = 'https://storage.example/object/sign/site-diary.pdf?token=secret'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(
  join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)

function jobRow(overrides = {}) {
  return {
    id: EXPORT_ID,
    report_id: REPORT_ID,
    content_fingerprint: FINGERPRINT,
    snapshot_version: 1,
    status: 'ready',
    ...overrides,
  }
}

function mockSupabase(rpcImpl) {
  return {
    client: {
      rpc: async (name, args) => rpcImpl(name, args),
    },
  }
}

describe('runSiteDiaryPdfExportToExportReady', () => {
  it('reaches export-ready without signed Storage fetch or blob()', async () => {
    let storageFetchCount = 0
    const timingEvents = []
    const { client } = mockSupabase((name) => {
      if (name === SITE_DIARY_PDF_EXPORT_RPC.enqueue) {
        return { data: jobRow({ status: 'ready' }), error: null }
      }
      return { data: jobRow({ status: 'ready' }), error: null }
    })

    const result = await runSiteDiaryPdfExportToExportReady(client, REPORT_ID, {
      onShareTiming: (stage, payload) => timingEvents.push({ stage, payload }),
      fetch: async (url) => {
        const target = String(url)
        if (target.includes('fingerprint')) {
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
        if (target.includes('/api/site-diary/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              signedUrl: SIGNED_URL,
              fileName: 'Zlog-Site-Diary-2026-09-06.pdf',
              title: 'Site Diary',
              text: 'Alpha — Site Diary',
              exportId: EXPORT_ID,
              reportId: REPORT_ID,
            }),
          }
        }
        if (target === SIGNED_URL) {
          storageFetchCount += 1
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/pdf' },
            blob: async () => {
              throw new Error('blob should not be called on Tap 1 export-ready')
            },
          }
        }
        throw new Error(`unexpected fetch: ${target}`)
      },
      sleep: async () => {},
    })

    assert.equal(result.ok, true)
    assert.equal(result.handoff, SITE_DIARY_PDF_EXPORT_HANDOFF.exportReady)
    assert.equal(result.exportId, EXPORT_ID)
    assert.equal(result.reportId, REPORT_ID)
    assert.equal(result.fileName, 'Zlog-Site-Diary-2026-09-06.pdf')
    assert.equal(result.signedUrl, undefined)
    assert.equal(result.blob, undefined)
    assert.equal(storageFetchCount, 0)

    const blobStage = timingEvents.find((e) => e.stage === 'share-timing-t7-signed-fetch-blob')
    assert.equal(blobStage, undefined)
  })
})

describe('fetchSiteDiaryPdfExportAuthorization + browser download handoff', () => {
  it('Tap 2 authorize returns signed URL without persisting it in descriptor', async () => {
    const auth = await fetchSiteDiaryPdfExportAuthorization(REPORT_ID, EXPORT_ID, {
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          signedUrl: SIGNED_URL,
          fileName: 'Zlog-Site-Diary-2026-09-06.pdf',
          title: 'Site Diary',
          text: 'Alpha',
          exportId: EXPORT_ID,
          reportId: REPORT_ID,
        }),
      }),
    })
    assert.equal(auth.ok, true)
    assert.equal(auth.signedUrl, SIGNED_URL)

    const descriptor = buildSiteDiaryPdfExportReadyDescriptor({
      reportId: auth.reportId,
      exportId: auth.exportId,
      fileName: auth.fileName,
      title: auth.title,
      text: auth.text,
    })
    assert.equal(descriptor.signedUrl, undefined)
  })

  it('downloadSiteDiaryPdfViaSignedUrl uses anchor download without blob()', () => {
    const clicks = []
    globalThis.document = {
      createElement: (tag) => {
        assert.equal(tag, 'a')
        return {
          href: '',
          download: '',
          rel: '',
          click: () => clicks.push(1),
          remove: () => {},
        }
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    }

    const result = downloadSiteDiaryPdfViaSignedUrl({
      signedUrl: SIGNED_URL,
      fileName: 'Zlog-Site-Diary-2026-09-06.pdf',
    })
    assert.equal(result.ok, true)
    assert.equal(clicks.length, 1)
    delete globalThis.document
  })
})

describe('live diary page — export-ready wiring', () => {
  it('uses canShareSiteDiaryPdfViaNativeFile to split Tap-1 prepare paths', () => {
    assert.match(diaryPage, /canShareSiteDiaryPdfViaNativeFile\(\)/)
    assert.match(diaryPage, /runSiteDiaryPdfExportToExportReady/)
    assert.match(diaryPage, /runSiteDiaryPdfExportToShareReadyArtifact/)
    assert.match(diaryPage, /SITE_DIARY_PDF_EXPORT_HANDOFF\.exportReady/)
    assert.match(diaryPage, /downloadSiteDiaryPdfViaSignedUrl/)
    assert.match(diaryPage, /fetchSiteDiaryPdfExportAuthorization/)
    assert.match(diaryPage, /isWorkbenchSharePrepared/)
    assert.doesNotMatch(
      diaryPage.slice(diaryPage.indexOf('runSiteDiaryPdfExportToExportReady')),
      /response\.blob\(\)/,
    )
  })

  it('export-ready ref shape does not include signedUrl', () => {
    const block = diaryPage.slice(
      diaryPage.indexOf('shareReadyPdfRef.current = {'),
      diaryPage.indexOf('saveLockRef.current = false', diaryPage.indexOf('shareReadyPdfRef.current = {')),
    )
    assert.match(block, /handoff: SITE_DIARY_PDF_EXPORT_HANDOFF\.exportReady/)
    assert.doesNotMatch(block, /signedUrl/)
  })
})
