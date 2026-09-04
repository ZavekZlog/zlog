/**
 * Same-tab prepared work-photo PDF Blob cache — identity, reuse, eviction.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { PDF_PHOTO_PREPARE_CONCURRENCY, buildDiaryPdfPhotos, mapWithConcurrency } from './diary-pdf-photos.js'
import { ZLOG_PHOTO_PIPELINE_ID } from './photo-workspace/image-pipeline.js'
import {
  SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_BYTES,
  SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_ENTRIES,
  clearPreparedWorkPhotoSessionCache,
  createPreparedWorkPhotoSessionCache,
  getPreparedWorkPhotoSessionCacheStats,
  preparedWorkPhotoSessionCacheKey,
  storePreparedWorkPhotoSessionBlob,
} from './diary-pdf-prepared-photo-session-cache.js'
import {
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'

const BYTES = 'JPEG-BYTES'
const BYTE_SIZE = BYTES.length

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function makePreparedList(count) {
  return Array.from({ length: count }, (_, i) =>
    makePrepared({
      url: `user-1/rep-1/photos/p${i}/report.jpg`,
      caption: `Prepared ${i}`,
      sequence: i + 1,
    }),
  )
}

function jpegBlob(text = BYTES) {
  return new Blob([text], { type: 'image/jpeg' })
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

describe('prepared work-photo session Blob cache', () => {
  beforeEach(() => {
    clearPreparedWorkPhotoSessionCache()
  })

  afterEach(() => {
    clearPreparedWorkPhotoSessionCache()
  })

  it('keys by canonical path + processing_version + byte size, never signed URL', () => {
    const photo = makePrepared()
    const key = preparedWorkPhotoSessionCacheKey(photo)
    assert.equal(key, `user-1/rep-1/photos/p1/report.jpg::${ZLOG_PHOTO_PIPELINE_ID}::${BYTE_SIZE}`)
    assert.doesNotMatch(key, /https?:/)
    assert.equal(preparedWorkPhotoSessionCacheKey({ ...photo, url: 'https://signed.example/token' }), null)
    assert.equal(
      preparedWorkPhotoSessionCacheKey({ ...photo, url: 'user-1/rep-1/photos/p1/thumb.jpg' }),
      null,
    )
    assert.equal(SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_ENTRIES, 48)
    assert.equal(SESSION_PREPARED_WORK_PHOTO_BLOB_MAX_BYTES, 48 * 1024 * 1024)
  })

  it('first prepared request misses, fetches, stores, and pass-throughs', async () => {
    startShareTimingRun({ reportId: 'session-cache-1' })
    const photo = makePrepared()
    let fetchCalls = 0
    let signedUrls = []
    await withBrowserFetch(async (url) => {
      fetchCalls += 1
      signedUrls.push(String(url))
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      const rows = await buildDiaryPdfPhotos(
        [photo],
        async () => {
          throw new Error('must not individual-sign')
        },
        {
          batchSignStoragePaths: async (paths) => ({
            urlByPath: new Map(paths.map((path) => [path, `https://signed.example/token-a/${path}`])),
            batchRequestCount: 1,
          }),
        },
      )
      assert.equal(rows.length, 1)
      assert.match(rows[0].src, /^data:image\//)
      assert.equal(rows[0].rotationDegrees, 0)
    })
    assert.equal(fetchCalls, 1)
    assert.match(signedUrls[0], /token-a/)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoSessionBlobCacheMissCount, 1)
    assert.equal(counts.photoSessionBlobCacheHitCount, 0)
    assert.equal(counts.photoSessionBlobCacheStoreCount, 1)
    assert.equal(counts.photoNetworkFetchCount, 1)
    assert.equal(counts.photoPassThroughCount, 1)
    assert.equal(counts.photoBakeCount, 0)
    assert.equal(counts.photoSignPathCount, 1)
    assert.equal(counts.photoSignBatchRequestCount, 1)
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 1)
  })

  it('second request with a new signed URL hits cache and does not fetch or bake', async () => {
    const photo = makePrepared()
    storePreparedWorkPhotoSessionBlob(photo, jpegBlob())
    startShareTimingRun({ reportId: 'session-cache-2' })
    let fetchCalls = 0
    let batchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch on cache hit')
    }, async () => {
      const rows = await buildDiaryPdfPhotos(
        [photo],
        async () => {
          throw new Error('must not individual-sign')
        },
        {
          batchSignStoragePaths: async () => {
            batchCalls += 1
            throw new Error('must not batch-sign cached prepared sources')
          },
        },
      )
      assert.equal(rows.length, 1)
      assert.match(rows[0].src, /^data:image\//)
      assert.equal(rows[0].rotationDegrees, 0)
    })
    assert.equal(fetchCalls, 0)
    assert.equal(batchCalls, 0)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoSessionBlobCacheHitCount, 1)
    assert.equal(counts.photoSessionBlobCacheMissCount, 0)
    assert.equal(counts.photoNetworkFetchCount, 0)
    assert.equal(counts.photoPassThroughCount, 1)
    assert.equal(counts.photoBakeCount, 0)
    assert.equal(counts.photoFetchBakeCount, 0)
    assert.equal(counts.photoSignPathCount, 0)
    assert.equal(counts.photoSignBatchRequestCount, 0)
  })

  it('does not cache legacy/raw photos as prepared assets', async () => {
    startShareTimingRun({ reportId: 'session-cache-legacy' })
    const legacy = {
      url: 'user-1/rep-1/photos/legacy/report.jpg',
      caption: 'Legacy',
      layout: 'full',
      sequence: 1,
      rotation_degrees: 90,
      report_byte_size: BYTE_SIZE,
    }
    const rows = await buildDiaryPdfPhotos(
      [legacy],
      async () => 'https://signed.example/legacy.jpg',
      {
        batchSignStoragePaths: async (paths) => ({
          urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
          batchRequestCount: 1,
        }),
      },
    )
    assert.equal(rows[0].rotationDegrees, 90)
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 0)
    assert.equal(preparedWorkPhotoSessionCacheKey(legacy), null)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoSessionBlobCacheStoreCount, 0)
    assert.equal(getShareTimingSnapshot().counts.photoPassThroughCount, 0)
  })

  it('changed canonical path or processing_version or byte size misses the old Blob', () => {
    const photo = makePrepared()
    storePreparedWorkPhotoSessionBlob(photo, jpegBlob())
    assert.equal(getPreparedWorkPhotoSessionCacheStats().entries, 1)
    assert.equal(
      preparedWorkPhotoSessionCacheKey({ ...photo, url: 'user-1/rep-1/photos/p2/report.jpg' }),
      `user-1/rep-1/photos/p2/report.jpg::${ZLOG_PHOTO_PIPELINE_ID}::${BYTE_SIZE}`,
    )
    assert.notEqual(
      preparedWorkPhotoSessionCacheKey({ ...photo, url: 'user-1/rep-1/photos/p2/report.jpg' }),
      preparedWorkPhotoSessionCacheKey(photo),
    )
    assert.notEqual(
      preparedWorkPhotoSessionCacheKey({ ...photo, processing_version: 'zlog-photo-pipeline-v2' }),
      preparedWorkPhotoSessionCacheKey(photo),
    )
    assert.notEqual(
      preparedWorkPhotoSessionCacheKey({ ...photo, report_byte_size: BYTE_SIZE + 1 }),
      preparedWorkPhotoSessionCacheKey(photo),
    )
  })

  it('replacement with a new byte size cannot return the stale Blob', async () => {
    const original = makePrepared()
    storePreparedWorkPhotoSessionBlob(original, jpegBlob())
    const replaced = makePrepared({ report_byte_size: BYTE_SIZE + 8 })
    startShareTimingRun({ reportId: 'session-cache-replace' })
    let fetchCalls = 0
    await withBrowserFetch(async () => {
      fetchCalls += 1
      return { ok: true, blob: async () => jpegBlob('JPEG-BYTES-NEW!!!!') }
    }, async () => {
      const rows = await buildDiaryPdfPhotos(
        [replaced],
        async () => {
          throw new Error('must not individual-sign')
        },
        {
          batchSignStoragePaths: async (paths) => ({
            urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
            batchRequestCount: 1,
          }),
        },
      )
      assert.equal(rows.length, 1)
      assert.match(rows[0].src, /^data:image\//)
    })
    assert.equal(fetchCalls, 1)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoSessionBlobCacheHitCount, 0)
    assert.equal(getShareTimingSnapshot().counts.photoSessionBlobCacheMissCount, 1)
  })

  it('bounded entry eviction drops the oldest Blob', () => {
    const cache = createPreparedWorkPhotoSessionCache({ maxEntries: 2, maxBytes: 10_000 })
    cache.store('a::v::1', jpegBlob('1'))
    cache.store('b::v::1', jpegBlob('22'))
    cache.store('c::v::1', jpegBlob('333'))
    const stats = cache.stats()
    assert.equal(stats.entries, 2)
    assert.equal(stats.evictCount, 1)
    assert.deepEqual(stats.keys, ['b::v::1', 'c::v::1'])
    assert.equal(cache.lookup('a::v::1'), null)
    assert.ok(cache.lookup('c::v::1'))
  })

  it('byte-budget eviction drops older Blobs first', () => {
    const cache = createPreparedWorkPhotoSessionCache({ maxEntries: 8, maxBytes: 10 })
    cache.store('a::v::8', jpegBlob('12345678'))
    cache.store('b::v::8', jpegBlob('abcdefgh'))
    const stats = cache.stats()
    assert.equal(stats.entries, 1)
    assert.ok(stats.evictCount >= 1)
    assert.equal(cache.lookup('a::v::8'), null)
    assert.ok(cache.lookup('b::v::8'))
    assert.ok(stats.bytes <= 10)
  })

  it('batch signing excludes already-resolved cached prepared sources', async () => {
    const photos = makePreparedList(9)
    for (const photo of photos) {
      storePreparedWorkPhotoSessionBlob(photo, jpegBlob())
    }
    startShareTimingRun({ reportId: 'session-cache-batch' })
    let batchCalls = 0
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        throw new Error('must not individual-sign')
      },
      {
        batchSignStoragePaths: async () => {
          batchCalls += 1
          throw new Error('must not batch-sign cached prepared sources')
        },
      },
    )
    assert.equal(rows.length, 9)
    assert.equal(batchCalls, 0)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoSessionBlobCacheHitCount, 9)
    assert.equal(counts.photoNetworkFetchCount, 0)
    assert.equal(counts.photoPassThroughCount, 9)
    assert.equal(counts.photoSignPathCount, 0)
    assert.equal(counts.photoSignBatchRequestCount, 0)
    assert.equal(counts.photoBakeCount, 0)
  })

  it('>9 uncached prepared photos still cap network workers at 9', async () => {
    const photos = makePreparedList(12)
    startShareTimingRun({ reportId: 'session-cache-conc' })
    let inFlight = 0
    let maxInFlight = 0
    const rows = await buildDiaryPdfPhotos(photos, async (photo) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await sleep(40)
      inFlight -= 1
      return `https://example.test/${photo.url}`
    })
    assert.equal(PDF_PHOTO_PREPARE_CONCURRENCY, 9)
    assert.equal(rows.length, 12)
    assert.equal(maxInFlight, 9)
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), PDF_PHOTO_PREPARE_CONCURRENCY, async () => true)
  })

  it('cached neighbours cannot satisfy a missing expected photo', async () => {
    const photos = makePreparedList(2)
    storePreparedWorkPhotoSessionBlob(photos[0], jpegBlob())
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(photos, async (photo) =>
          photo.url === photos[1].url ? null : `https://example.test/${photo.url}`,
        ),
    )
  })
})
