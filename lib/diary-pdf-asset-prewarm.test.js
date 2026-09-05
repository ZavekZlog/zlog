/**
 * Quiet PDF-asset session Blob prewarm — identity, skip rules, in-flight join.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDiaryPdfPhotos } from './diary-pdf-photos.js'
import { resolveCoverPdfSource } from './diary-cover-photo.js'
import { ZLOG_PHOTO_PIPELINE_ID } from './photo-workspace/image-pipeline.js'
import { SHADOW_PREPARE_STATUS } from './photo-workspace/shadow-ingest.js'
import { preparedCoverStoragePath, ZLOG_COVER_PIPELINE_ID } from './cover-pipeline.js'
import {
  PDF_ASSET_PREWARM_CONCURRENCY,
  prewarmDiaryPdfSessionAssets,
  selectCacheablePreparedPdfPhotos,
} from './diary-pdf-asset-prewarm.js'
import {
  clearPreparedWorkPhotoSessionCache,
  getPreparedWorkPhotoSessionCacheStats,
  lookupPreparedWorkPhotoSessionBlob,
  peekPreparedWorkPhotoSessionInflight,
  preparedWorkPhotoSessionCacheKey,
  storePreparedWorkPhotoSessionBlob,
} from './diary-pdf-prepared-photo-session-cache.js'
import {
  canSkipPreparedCoverSign,
  clearPreparedCoverSessionCache,
  lookupPreparedCoverSessionBlob,
  peekPreparedCoverSessionInflight,
} from './diary-cover-prepared-session-cache.js'
import {
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const viewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')

const BYTES = 'JPEG-BYTES'
const BYTE_SIZE = BYTES.length
const COVER_PATH = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')

function jpegBlob(text = BYTES) {
  return new Blob([text], { type: 'image/jpeg' })
}

function makePrepared(overrides = {}) {
  return {
    url: 'user-1/rep-1/photos/p1/report.jpg',
    caption: 'Prepared',
    layout: 'grid4',
    sequence: 1,
    rotation_degrees: 0,
    processing_version: ZLOG_PHOTO_PIPELINE_ID,
    report_byte_size: BYTE_SIZE,
    ...overrides,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(predicate, timeoutMs = 2000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitUntil timed out')
    await sleep(5)
  }
}

async function withBrowserFetch(fetchImpl, fn) {
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = globalThis.document || {}
  globalThis.fetch = fetchImpl
  try {
    return await fn()
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    if (previousFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = previousFetch
  }
}

function batchSign(paths) {
  return {
    urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
    batchRequestCount: 1,
  }
}

describe('PDF-asset session Blob prewarm', () => {
  beforeEach(() => {
    clearPreparedWorkPhotoSessionCache()
    clearPreparedCoverSessionCache()
  })

  afterEach(() => {
    clearPreparedWorkPhotoSessionCache()
    clearPreparedCoverSessionCache()
  })

  it('keeps prewarm concurrency at 9 and does not await prewarm from workbench load', () => {
    assert.equal(PDF_ASSET_PREWARM_CONCURRENCY, 9)
    assert.match(diaryPage, /void prewarmDiaryPdfSessionAssets\(/)
    assert.doesNotMatch(diaryPage, /await prewarmDiaryPdfSessionAssets/)
    assert.match(diaryPage, /kickPdfAssetPrewarm/)
    const composeThumbs = diaryPage.indexOf('signReportPhotoRows(reportPhotos)')
    const composeKick = diaryPage.indexOf('kickPdfAssetPrewarm()', composeThumbs)
    assert.ok(composeThumbs > 0 && composeKick > composeThumbs)
    assert.doesNotMatch(viewPage, /prewarmDiaryPdfSessionAssets/)
    assert.doesNotMatch(viewPage, /kickPdfAssetPrewarm/)
  })

  it('A — stores report.jpg under the session-cache key buildDiaryPdfPhotos consumes', async () => {
    const photo = makePrepared()
    const key = preparedWorkPhotoSessionCacheKey(photo)
    await withBrowserFetch(async () => ({ ok: true, blob: async () => jpegBlob() }), async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo],
        batchSignStoragePaths: batchSign,
      })
    })
    const stored = lookupPreparedWorkPhotoSessionBlob(photo)
    assert.ok(stored instanceof Blob)
    assert.equal(stored.size, BYTE_SIZE)
    assert.equal(key, `user-1/rep-1/photos/p1/report.jpg::${ZLOG_PHOTO_PIPELINE_ID}::${BYTE_SIZE}`)
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 1)
  })

  it('B — already-cached photo is not fetched', async () => {
    const photo = makePrepared()
    storePreparedWorkPhotoSessionBlob(photo, jpegBlob())
    let fetchCalls = 0
    let signCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch cached photo')
    }, async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo],
        batchSignStoragePaths: async () => {
          signCalls += 1
          throw new Error('must not sign cached photo')
        },
      })
    })
    assert.equal(fetchCalls, 0)
    assert.equal(signCalls, 0)
  })

  it('C — thumb.jpg is never fetched by prewarm', async () => {
    const photo = makePrepared({
      thumbnail_path: 'user-1/rep-1/photos/p1/thumb.jpg',
    })
    const thumbRow = makePrepared({
      url: 'user-1/rep-1/photos/p1/thumb.jpg',
    })
    const signed = []
    const fetched = []
    await withBrowserFetch(async (url) => {
      fetched.push(String(url))
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo, thumbRow],
        batchSignStoragePaths: async (paths) => {
          signed.push(...paths)
          return batchSign(paths)
        },
      })
    })
    assert.deepEqual(selectCacheablePreparedPdfPhotos([photo, thumbRow]).map((row) => row.url), [
      photo.url,
    ])
    assert.ok(signed.every((path) => !/thumb\.jpg$/i.test(path)))
    assert.ok(fetched.every((url) => !/thumb\.jpg$/i.test(url)))
    assert.equal(signed.length, 1)
    assert.equal(signed[0], photo.url)
  })

  it('D — legacy / wrong pipeline / non-zero rotation rows are skipped', async () => {
    let fetchCalls = 0
    const skipped = [
      makePrepared({ rotation_degrees: 90 }),
      makePrepared({ processing_version: 'other-pipeline' }),
      makePrepared({ processing_version: null, report_byte_size: BYTE_SIZE }),
      {
        url: 'user-1/rep-1/cover.jpg',
        processing_version: ZLOG_PHOTO_PIPELINE_ID,
        report_byte_size: BYTE_SIZE,
        rotation_degrees: 0,
      },
    ]
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch skipped rows')
    }, async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: skipped,
        batchSignStoragePaths: async () => {
          throw new Error('must not sign skipped rows')
        },
      })
    })
    assert.equal(selectCacheablePreparedPdfPhotos(skipped).length, 0)
    assert.equal(fetchCalls, 0)
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 0)
  })

  it('E — prewarm + Save & Share overlap results in one network GET', async () => {
    const photo = makePrepared()
    let fetchCalls = 0
    let release
    const hung = new Promise((resolve) => {
      release = resolve
    })
    await withBrowserFetch(async () => {
      fetchCalls += 1
      await hung
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      const prewarmPromise = prewarmDiaryPdfSessionAssets({
        photos: [photo],
        batchSignStoragePaths: batchSign,
      })
      await waitUntil(() => Boolean(
        peekPreparedWorkPhotoSessionInflight(preparedWorkPhotoSessionCacheKey(photo)),
      ))
      startShareTimingRun({ reportId: 'prewarm-overlap' })
      const pdfPromise = buildDiaryPdfPhotos(
        [photo],
        async () => {
          throw new Error('must not individual-sign')
        },
        { batchSignStoragePaths: batchSign },
      )
      release()
      const rows = await pdfPromise
      await prewarmPromise
      assert.equal(rows.length, 1)
    })
    assert.equal(fetchCalls, 1)
  })

  it('F — following buildDiaryPdfPhotos reports session hits and zero network sources', async () => {
    const photos = [
      makePrepared(),
      makePrepared({ url: 'user-1/rep-1/photos/p2/report.jpg', sequence: 2 }),
    ]
    await withBrowserFetch(async () => ({ ok: true, blob: async () => jpegBlob() }), async () => {
      await prewarmDiaryPdfSessionAssets({
        photos,
        batchSignStoragePaths: batchSign,
      })
    })
    startShareTimingRun({ reportId: 'prewarm-follow' })
    let fetchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch after prewarm')
    }, async () => {
      await buildDiaryPdfPhotos(
        photos,
        async () => {
          throw new Error('must not individual-sign')
        },
        { batchSignStoragePaths: async () => {
          throw new Error('must not batch-sign warmed photos')
        } },
      )
    })
    assert.equal(fetchCalls, 0)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoSessionBlobCacheHitCount, 2)
    assert.equal(counts.photoSessionBlobCacheMissCount, 0)
    assert.equal(counts.pdfNetworkSourceCount, 0)
    assert.equal(counts.photoNetworkFetchCount, 0)
  })

  it('G — failed background fetch is non-fatal and later PDF fetch can retry', async () => {
    const photo = makePrepared()
    await withBrowserFetch(async () => ({ ok: false, blob: async () => jpegBlob() }), async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo],
        batchSignStoragePaths: batchSign,
      })
    })
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 0)
    assert.equal(peekPreparedWorkPhotoSessionInflight(preparedWorkPhotoSessionCacheKey(photo)), null)
    startShareTimingRun({ reportId: 'prewarm-retry' })
    let fetchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      const rows = await buildDiaryPdfPhotos(
        [photo],
        async () => {
          throw new Error('must not individual-sign')
        },
        { batchSignStoragePaths: batchSign },
      )
      assert.equal(rows.length, 1)
    })
    assert.equal(fetchCalls, 1)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoNetworkFetchCount, 1)
    assert.equal(getShareTimingSnapshot().counts.photoSessionBlobCacheHitCount, 0)
  })

  it('H — generation/list change does not corrupt current photo state', async () => {
    const photoA = makePrepared()
    const photoB = makePrepared({ url: 'user-1/rep-1/photos/p2/report.jpg', sequence: 2 })
    const listA = Object.freeze([Object.freeze({ ...photoA })])
    let current = 1
    let releaseA
    const hungA = new Promise((resolve) => {
      releaseA = resolve
    })
    await withBrowserFetch(async (url) => {
      const href = String(url)
      if (href.includes('/p1/')) {
        await hungA
        return { ok: true, blob: async () => jpegBlob() }
      }
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      const first = prewarmDiaryPdfSessionAssets({
        photos: listA,
        generation: 1,
        isCurrent: () => current === 1,
        batchSignStoragePaths: batchSign,
      })
      await waitUntil(() => Boolean(
        peekPreparedWorkPhotoSessionInflight(preparedWorkPhotoSessionCacheKey(photoA)),
      ))
      current = 2
      const second = prewarmDiaryPdfSessionAssets({
        photos: [photoB],
        generation: 2,
        isCurrent: () => current === 2,
        batchSignStoragePaths: batchSign,
      })
      releaseA()
      await Promise.all([first, second])
    })
    assert.equal(listA.length, 1)
    assert.equal(listA[0].url, photoA.url)
    const blobA = lookupPreparedWorkPhotoSessionBlob(photoA)
    const blobB = lookupPreparedWorkPhotoSessionBlob(photoB)
    assert.ok(blobA instanceof Blob)
    assert.ok(blobB instanceof Blob)
    assert.notEqual(preparedWorkPhotoSessionCacheKey(photoA), preparedWorkPhotoSessionCacheKey(photoB))
  })

  it('I — prepared cover prewarm produces session hit and canSkipPreparedCoverSign', async () => {
    const identity = {
      coverPath: COVER_PATH,
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
    }
    await withBrowserFetch(async () => ({ ok: true, blob: async () => jpegBlob('COVER-JPEG') }), async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [],
        ...identity,
        batchSignStoragePaths: batchSign,
      })
    })
    assert.ok(lookupPreparedCoverSessionBlob(identity) instanceof Blob)
    assert.equal(canSkipPreparedCoverSign(identity), true)
    startShareTimingRun({ reportId: 'prewarm-cover' })
    let fetchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch warmed cover')
    }, async () => {
      const src = await resolveCoverPdfSource('https://signed.example/cover.jpg', {
        ...identity,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          throw new Error('must not bake warmed cover')
        },
      })
      assert.match(src, /^data:image\//)
    })
    assert.equal(fetchCalls, 0)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheHitCount, 1)
    assert.equal(getShareTimingSnapshot().counts.coverNetworkFetchCount, 0)
  })

  it('J — prewarm does not increment Save & Share photoNetworkFetchCount', async () => {
    const photo = makePrepared()
    startShareTimingRun({ reportId: 'prewarm-quiet' })
    await withBrowserFetch(async () => ({ ok: true, blob: async () => jpegBlob() }), async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo],
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        batchSignStoragePaths: batchSign,
      })
    })
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoNetworkFetchCount, 0)
    assert.equal(counts.photoSessionBlobCacheStoreCount, 0)
    assert.equal(counts.coverNetworkFetchCount, 0)
    assert.equal(counts.coverSessionBlobCacheStoreCount, 0)
    assert.ok(lookupPreparedWorkPhotoSessionBlob(photo) instanceof Blob)
  })

  it('does not prewarm local READY shadowPrepare report Blobs', async () => {
    const photo = makePrepared({
      shadowPrepare: {
        status: SHADOW_PREPARE_STATUS.READY,
        report: { blob: jpegBlob('LOCAL-READY') },
      },
    })
    let fetchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch local READY report blob')
    }, async () => {
      await prewarmDiaryPdfSessionAssets({
        photos: [photo],
        batchSignStoragePaths: async () => {
          throw new Error('must not sign local READY')
        },
      })
    })
    assert.equal(fetchCalls, 0)
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 0)
  })
})
