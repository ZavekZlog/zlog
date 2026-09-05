/**
 * Same-tab prepared cover PDF Blob cache — identity, reuse, eviction.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCoverPdfSource } from './diary-cover-photo.js'
import { preparedCoverStoragePath, rawCoverStoragePath, ZLOG_COVER_PIPELINE_ID } from './cover-pipeline.js'
import { signPdfReportAssets } from './diary-share-pdf-assets.js'
import {
  SESSION_PREPARED_COVER_BLOB_MAX_BYTES,
  SESSION_PREPARED_COVER_BLOB_MAX_ENTRIES,
  canSkipPreparedCoverSign,
  clearPreparedCoverSessionCache,
  createPreparedCoverSessionCache,
  getPreparedCoverSessionCacheStats,
  joinPreparedCoverSessionFetch,
  peekPreparedCoverSessionInflight,
  preparedCoverSessionCacheKey,
  storePreparedCoverSessionBlob,
} from './diary-cover-prepared-session-cache.js'
import {
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'

function jpegBlob(text = 'COVER-JPEG') {
  return new Blob([text], { type: 'image/jpeg' })
}

const COVER_PATH = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')

async function withFetch(fetchImpl, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete globalThis.fetch
    else globalThis.fetch = previous
  }
}

describe('prepared cover session Blob cache', () => {
  beforeEach(() => {
    clearPreparedCoverSessionCache()
  })

  afterEach(() => {
    clearPreparedCoverSessionCache()
  })

  it('keys by immutable generation path + processing version, never signed URL', () => {
    const key = preparedCoverSessionCacheKey({
      coverPath: COVER_PATH,
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
    })
    assert.equal(key, `${COVER_PATH}::${ZLOG_COVER_PIPELINE_ID}`)
    assert.doesNotMatch(key, /https?:/)
    assert.equal(
      preparedCoverSessionCacheKey({
        coverPath: 'https://signed.example/token',
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      null,
    )
    assert.equal(
      preparedCoverSessionCacheKey({
        coverPath: rawCoverStoragePath('user-1', 'rep-1', 'gen-1'),
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      null,
    )
    assert.equal(
      preparedCoverSessionCacheKey({
        coverPath: 'user-1/rep-1/cover.jpg',
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      null,
    )
    assert.equal(SESSION_PREPARED_COVER_BLOB_MAX_ENTRIES, 12)
    assert.equal(SESSION_PREPARED_COVER_BLOB_MAX_BYTES, 16 * 1024 * 1024)
  })

  it('first canonical prepared cover misses, fetches, stores, and pass-throughs', async () => {
    startShareTimingRun({ reportId: 'cover-cache-1' })
    let fetchCalls = 0
    let bakeCalls = 0
    await withFetch(async (url) => {
      fetchCalls += 1
      assert.match(String(url), /token-a/)
      return { ok: true, blob: async () => jpegBlob() }
    }, async () => {
      const src = await resolveCoverPdfSource('https://signed.example/token-a/cover.jpg', {
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,baked'
        },
      })
      assert.match(src, /^data:image\//)
    })
    assert.equal(fetchCalls, 1)
    assert.equal(bakeCalls, 0)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.coverSessionBlobCacheMissCount, 1)
    assert.equal(counts.coverSessionBlobCacheHitCount, 0)
    assert.equal(counts.coverSessionBlobCacheStoreCount, 1)
    assert.equal(counts.coverNetworkFetchCount, 1)
    assert.equal(counts.coverPassThroughCount, 1)
    assert.equal(counts.coverOrientationBakeCount, 0)
    assert.equal(counts.coverPreparedSource, 'network')
    assert.equal(getPreparedCoverSessionCacheStats().entries, 1)
  })

  it('second identical prepared cover hits cache and does not sign, fetch, or bake', async () => {
    storePreparedCoverSessionBlob(
      { coverPath: COVER_PATH, coverProcessingVersion: ZLOG_COVER_PIPELINE_ID },
      jpegBlob(),
    )
    startShareTimingRun({ reportId: 'cover-cache-2' })
    let fetchCalls = 0
    let bakeCalls = 0
    await withFetch(async () => {
      fetchCalls += 1
      throw new Error('must not fetch on cover cache hit')
    }, async () => {
      const src = await resolveCoverPdfSource('https://signed.example/token-b/cover.jpg', {
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,baked'
        },
      })
      assert.match(src, /^data:image\//)
    })
    assert.equal(fetchCalls, 0)
    assert.equal(bakeCalls, 0)
    assert.equal(
      canSkipPreparedCoverSign({
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      true,
    )
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.coverSessionBlobCacheHitCount, 1)
    assert.equal(counts.coverSessionBlobCacheMissCount, 0)
    assert.equal(counts.coverNetworkFetchCount, 0)
    assert.equal(counts.coverPassThroughCount, 1)
    assert.equal(counts.coverOrientationBakeCount, 0)
    assert.equal(counts.coverPreparedSource, 'session')
  })

  it('legacy/raw cover does not use the prepared-cover session cache', async () => {
    startShareTimingRun({ reportId: 'cover-cache-legacy' })
    let bakeCalls = 0
    const src = await resolveCoverPdfSource('https://signed.example/legacy.jpg', {
      coverPath: 'user-1/rep-1/cover.jpg',
      coverProcessingVersion: null,
      localPreparedBlob: null,
      uprightCoverFn: async () => {
        bakeCalls += 1
        return 'data:image/jpeg;base64,baked'
      },
    })
    assert.equal(src, 'data:image/jpeg;base64,baked')
    assert.equal(bakeCalls, 1)
    assert.equal(getPreparedCoverSessionCacheStats().entries, 0)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheStoreCount, 0)
    assert.equal(getShareTimingSnapshot().counts.coverPassThroughCount, 0)
    assert.equal(getShareTimingSnapshot().counts.coverOrientationBakeCount, 1)
  })

  it('changed canonical path or processing version misses the old Blob', () => {
    storePreparedCoverSessionBlob(
      { coverPath: COVER_PATH, coverProcessingVersion: ZLOG_COVER_PIPELINE_ID },
      jpegBlob(),
    )
    const otherPath = preparedCoverStoragePath('user-1', 'rep-1', 'gen-2')
    assert.notEqual(
      preparedCoverSessionCacheKey({
        coverPath: otherPath,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      preparedCoverSessionCacheKey({
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
    )
    assert.notEqual(
      preparedCoverSessionCacheKey({
        coverPath: COVER_PATH,
        coverProcessingVersion: 'zlog-cover-pipeline-v2',
      }),
      preparedCoverSessionCacheKey({
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
    )
  })

  it('replacement generation cannot return the stale Blob', async () => {
    storePreparedCoverSessionBlob(
      { coverPath: COVER_PATH, coverProcessingVersion: ZLOG_COVER_PIPELINE_ID },
      jpegBlob('OLD-COVER'),
    )
    const replaced = preparedCoverStoragePath('user-1', 'rep-1', 'gen-replaced')
    startShareTimingRun({ reportId: 'cover-cache-replace' })
    let fetchCalls = 0
    await withFetch(async () => {
      fetchCalls += 1
      return { ok: true, blob: async () => jpegBlob('NEW-COVER') }
    }, async () => {
      const src = await resolveCoverPdfSource('https://signed.example/new.jpg', {
        coverPath: replaced,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          throw new Error('must not bake prepared replacement')
        },
      })
      assert.match(src, /^data:image\//)
    })
    assert.equal(fetchCalls, 1)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheHitCount, 0)
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheMissCount, 1)
  })

  it('bounded entry eviction drops the oldest Blob', () => {
    const cache = createPreparedCoverSessionCache({ maxEntries: 2, maxBytes: 10_000 })
    cache.store('a::v::1', jpegBlob('1'))
    cache.store('b::v::1', jpegBlob('22'))
    cache.store('c::v::1', jpegBlob('333'))
    const stats = cache.stats()
    assert.equal(stats.entries, 2)
    assert.equal(stats.evictCount, 1)
    assert.equal(cache.lookup('a::v::1'), null)
    assert.ok(cache.lookup('c::v::1'))
  })

  it('byte-budget eviction drops older Blobs first', () => {
    const cache = createPreparedCoverSessionCache({ maxEntries: 8, maxBytes: 10 })
    cache.store('a::v::8', jpegBlob('12345678'))
    cache.store('b::v::8', jpegBlob('abcdefgh'))
    const stats = cache.stats()
    assert.equal(stats.entries, 1)
    assert.ok(stats.evictCount >= 1)
    assert.equal(cache.lookup('a::v::8'), null)
    assert.ok(cache.lookup('b::v::8'))
    assert.ok(stats.bytes <= 10)
  })

  it('signed URL changes do not miss after the Blob is stored under path+version identity', async () => {
    startShareTimingRun({ reportId: 'cover-cache-signed-url' })
    let fetchCalls = 0
    await withFetch(async (url) => {
      fetchCalls += 1
      assert.match(String(url), /token-first/)
      return { ok: true, blob: async () => jpegBlob('CANONICAL') }
    }, async () => {
      await resolveCoverPdfSource('https://signed.example/token-first/cover.jpg', {
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          throw new Error('must not bake')
        },
      })
    })
    startShareTimingRun({ reportId: 'cover-cache-signed-url-2' })
    await withFetch(async () => {
      fetchCalls += 1
      throw new Error('must not refetch when only the signed URL changed')
    }, async () => {
      const src = await resolveCoverPdfSource('https://signed.example/token-rotated/cover.jpg', {
        coverPath: COVER_PATH,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          throw new Error('must not bake')
        },
      })
      assert.match(src, /^data:image\//)
    })
    assert.equal(fetchCalls, 1)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheHitCount, 1)
    assert.equal(getShareTimingSnapshot().counts.coverNetworkFetchCount, 0)
    assert.equal(getShareTimingSnapshot().counts.coverPreparedSource, 'session')
  })

  it('fetch failure does not store a Blob and still throws', async () => {
    startShareTimingRun({ reportId: 'cover-cache-fail' })
    await withFetch(async () => ({ ok: false, blob: async () => jpegBlob() }), async () => {
      await assert.rejects(
        () => resolveCoverPdfSource('https://signed.example/fail.jpg', {
          coverPath: COVER_PATH,
          coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
          localPreparedBlob: null,
          uprightCoverFn: async () => 'data:image/jpeg;base64,baked',
        }),
        /Could not download the cover photo for the PDF/,
      )
    })
    assert.equal(getPreparedCoverSessionCacheStats().entries, 0)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.coverSessionBlobCacheStoreCount, 0)
  })

  it('in-flight join is one fetch per cover key and failed fetch does not poison retry', async () => {
    const identity = {
      coverPath: COVER_PATH,
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
    }
    let starts = 0
    let release
    const hung = new Promise((resolve) => {
      release = resolve
    })
    const first = joinPreparedCoverSessionFetch(identity, async () => {
      starts += 1
      await hung
      return jpegBlob()
    })
    const second = joinPreparedCoverSessionFetch(identity, async () => {
      starts += 1
      return jpegBlob('OTHER')
    })
    assert.ok(peekPreparedCoverSessionInflight(identity))
    release()
    const [a, b] = await Promise.all([first, second])
    assert.equal(starts, 1)
    assert.equal(a.size, b.size)
    assert.equal(peekPreparedCoverSessionInflight(identity), null)
    await assert.rejects(() =>
      joinPreparedCoverSessionFetch(identity, async () => {
        throw new Error('boom')
      }),
    )
    assert.equal(peekPreparedCoverSessionInflight(identity), null)
    const retry = await joinPreparedCoverSessionFetch(identity, async () => jpegBlob())
    assert.ok(retry.size > 0)
  })

  it('skipCoverSign does not create a cover signed URL while logo and signature still sign', async () => {
    const started = []
    const supabase = {
      storage: {
        from() {
          return {
            createSignedUrl(path) {
              started.push(path)
              return Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null })
            },
          }
        },
      },
    }
    const result = await signPdfReportAssets(
      supabase,
      {
        brand_logo_url: 'user/logo.jpg',
        cover_photo_url: COVER_PATH,
        signature_url: 'user/sig.png',
      },
      async (signedCoverUrl) => {
        assert.equal(signedCoverUrl, null)
        return 'data:image/jpeg;base64,from-cache'
      },
      { skipCoverSign: true },
    )
    assert.deepEqual(new Set(started), new Set(['user/logo.jpg', 'user/sig.png']))
    assert.equal(result.coverPhotoUrl, 'data:image/jpeg;base64,from-cache')
  })
})
