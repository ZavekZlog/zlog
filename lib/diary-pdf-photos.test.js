/**
 * Site Diary work/progress PDF photo pipeline — shared browser-display flatten.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { groupPhotosByArea } from './ai-annotation/area-groups.js'
import {
  PDF_PHOTO_PREPARE_CONCURRENCY,
  buildDiaryPdfPhotos,
  mapWithConcurrency,
} from './diary-pdf-photos.js'
import {
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'
import { mapBatchSignedUrlsByPath } from './diary-share-pdf-assets.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photosSrc = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const orientSrc = readFileSync(join(root, 'lib/image-orientation.js'), 'utf8')
const assetsSrc = readFileSync(join(root, 'lib/diary-share-pdf-assets.js'), 'utf8')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeWorkPhotos(count) {
  return Array.from({ length: count }, (_, i) => ({
    url: `user/r/photos/p${i}/report.jpg`,
    caption: `Caption ${i}`,
    layout: i % 3 === 0 ? 'full' : i % 3 === 1 ? 'grid6' : 'grid4',
    sequence: i + 1,
    rotation_degrees: 90,
    location: i < 10 ? 'Area A' : 'Area B',
    assigned_to: i === 0 ? 'Roofing' : '',
  }))
}

function batchSignAll(paths) {
  return {
    urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
    batchRequestCount: 1,
  }
}

describe('PDF work photos — shared browser-display flatten', () => {
  it('buildDiaryPdfPhotos uses orientedImageToDataUrlForPdf before UI rotation', () => {
    assert.match(photosSrc, /orientedImageToDataUrlForPdf/)
    assert.match(photosSrc, /flattenPhotoSrcForPdf/)
    assert.match(photosSrc, /applyRotationToImageSrc/)
    const flattenIdx = photosSrc.indexOf('flattenPhotoSrcForPdf')
    const rotationIdx = photosSrc.indexOf('applyRotationToImageSrc(src, rotationDegrees)')
    assert.ok(flattenIdx > 0 && rotationIdx > flattenIdx, 'EXIF flatten must run before UI rotation')
    assert.doesNotMatch(photosSrc, /drawOriented/)
    assert.doesNotMatch(photosSrc, /rotate-90/)
    assert.doesNotMatch(photosSrc, /zlog-pdf-trace/)
  })

  it('cover and work photos share the same flatten helper', () => {
    assert.match(orientSrc, /export const PDF_PHOTO_PIPELINE_ID = 'browser-display-inline-v3'/)
    assert.match(shareSrc, /orientedImageToDataUrlForPdf/)
    assert.match(shareSrc, /export async function uprightCoverSrcForPdf/)
    assert.match(photosSrc, /from '\.\/image-orientation\.js'/)
  })

  it('skips browser flatten in Node tests (document undefined guard)', () => {
    assert.match(photosSrc, /typeof document !== 'undefined'/)
  })

  it('uses bounded concurrency instead of a sequential for-loop', () => {
    assert.match(photosSrc, /PDF_PHOTO_PREPARE_CONCURRENCY/)
    assert.match(photosSrc, /mapWithConcurrency/)
    assert.doesNotMatch(photosSrc, /sequential-for-loop/)
    assert.match(photosSrc, /bakedPhotoSrcCache|photoBakeCacheKey/)
  })

  it('fail-closed completeness gate blocks silent omission', () => {
    assert.match(photosSrc, /assertDiaryPdfPhotosComplete/)
    assert.match(photosSrc, /throw new DiaryPdfPhotosIncompleteError/)
    assert.doesNotMatch(photosSrc, /return null\s*\n\s*\}\)\s*\.filter/)
  })

  it('keeps fetch/decode/bake after batch source resolution and does not crop', () => {
    const batchCallIdx = photosSrc.indexOf('await batchSignStoragePaths(signablePaths)')
    const flattenCallIdx = photosSrc.indexOf('flattenPhotoSrcForPdf(baseSrc, maxEdge, localBlob)')
    assert.ok(batchCallIdx > 0 && flattenCallIdx > batchCallIdx, 'batch signing must run before flatten/fetch')
    assert.match(photosSrc, /PDF_PHOTO_PREPARE_CONCURRENCY = 9/)
    assert.doesNotMatch(photosSrc, /object-fit|sourceX|cropRect/)
    assert.match(orientSrc, /PDF_PHOTO_PIPELINE_ID = 'browser-display-inline-v3'/)
  })
})

describe('PDF work photos — batch storage signing', () => {
  beforeEach(() => {
    startShareTimingRun({ reportId: 'pdf-batch-1', fromPdfCache: false })
  })

  it('19 signable storage paths use one batch sign and zero individual resolveSrc calls', async () => {
    const photos = makeWorkPhotos(19)
    let batchCalls = 0
    let batchedPaths = null
    let resolveCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      fetchCalls += 1
      if (typeof originalFetch === 'function') return originalFetch(...args)
      throw new Error('unexpected fetch during PDF photo test')
    }
    try {
      const rows = await buildDiaryPdfPhotos(
        photos,
        async () => {
          resolveCalls += 1
          throw new Error('individual createSignedUrl must not run for batched paths')
        },
        {
          batchSignStoragePaths: async (paths) => {
            batchCalls += 1
            batchedPaths = paths
            assert.equal(fetchCalls, 0, 'batch signing must not fetch images')
            return batchSignAll(paths)
          },
        },
      )
      assert.equal(batchCalls, 1)
      assert.equal(batchedPaths.length, 19)
      assert.deepEqual(batchedPaths, photos.map((p) => p.url))
      assert.equal(resolveCalls, 0)
      assert.equal(fetchCalls, 0)
      assert.equal(rows.length, 19)
      flushShareTimingSnapshot()
      const counts = getShareTimingSnapshot().counts
      assert.equal(counts.photoSignPathCount, 19)
      assert.equal(counts.photoSignBatchRequestCount, 1)
      assert.equal(counts.photoIndividualSignRequestCount, 0)
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('keeps each signed URL, order, caption, rotation, and layout on the correct photo', async () => {
    const photos = makeWorkPhotos(19)
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        throw new Error('must not individual-sign')
      },
      { batchSignStoragePaths: async (paths) => batchSignAll(paths) },
    )
    assert.deepEqual(
      rows.map((row) => row.url),
      photos.map((photo) => photo.url),
    )
    assert.deepEqual(
      rows.map((row) => row.src),
      photos.map((photo) => `https://signed.example/${photo.url}`),
    )
    assert.deepEqual(
      rows.map((row) => row.caption),
      photos.map((photo) => photo.caption),
    )
    assert.deepEqual(
      rows.map((row) => row.rotationDegrees),
      photos.map((photo) => photo.rotation_degrees),
    )
    assert.deepEqual(
      rows.map((row) => row.layout),
      photos.map((photo) => photo.layout),
    )
    const grouped = groupPhotosByArea(rows)
    assert.equal(grouped.length, 2)
    assert.equal(grouped[0].areaName, 'Area A')
    assert.equal(grouped[1].areaName, 'Area B')
    assert.equal(grouped[0].photos.length, 10)
    assert.equal(grouped[1].photos.length, 9)
  })

  it('maps shuffled batch results by path and never by array position', async () => {
    const photos = makeWorkPhotos(4)
    let resolveCalls = 0
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        resolveCalls += 1
        throw new Error('shuffled-with-path must not fall back')
      },
      {
        batchSignStoragePaths: async (paths) => {
          const reversed = [...paths].reverse()
          return {
            urlByPath: new Map(reversed.map((path) => [path, `https://signed.example/${path}`])),
            batchRequestCount: 1,
          }
        },
      },
    )
    assert.equal(resolveCalls, 0)
    assert.equal(rows[0].src, `https://signed.example/${photos[0].url}`)
    assert.equal(rows[3].src, `https://signed.example/${photos[3].url}`)
  })

  it('batch results without path fields cannot cross-wire photo URLs', async () => {
    const photos = makeWorkPhotos(2)
    const mapped = mapBatchSignedUrlsByPath(
      [
        { signedUrl: `https://wrong/${photos[1].url}` },
        { signedUrl: `https://wrong/${photos[0].url}` },
      ],
      photos.map((p) => p.url),
    )
    assert.equal(mapped.size, 0)

    const rows = await buildDiaryPdfPhotos(
      photos,
      async (photo) => `https://correct/${photo.url}`,
      {
        batchSignStoragePaths: async (paths) => ({
          urlByPath: mapBatchSignedUrlsByPath(
            paths.map((path, index) => ({
              signedUrl: `https://wrong/${paths[paths.length - 1 - index]}`,
            })),
            paths,
          ),
          batchRequestCount: 1,
        }),
      },
    )
    assert.equal(rows[0].src, `https://correct/${photos[0].url}`)
    assert.equal(rows[1].src, `https://correct/${photos[1].url}`)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoIndividualSignRequestCount, 2)
  })

  it('preserves already-usable http, data, and blob sources without batch signing them', async () => {
    let batched = []
    let resolveCalls = 0
    const photos = [
      { url: 'https://cdn.example/a.jpg', caption: 'A', sequence: 1, layout: 'grid4' },
      { url: 'data:image/jpeg;base64,abc', caption: 'B', sequence: 2, layout: 'grid4' },
      { url: 'blob:https://zlog.local/p', caption: 'C', sequence: 3, layout: 'grid4' },
      { url: 'user/r/photos/p0/report.jpg', caption: 'D', sequence: 4, layout: 'grid4' },
    ]
    const rows = await buildDiaryPdfPhotos(
      photos,
      async (photo) => {
        resolveCalls += 1
        return `https://fallback/${photo.url}`
      },
      {
        batchSignStoragePaths: async (paths) => {
          batched = paths
          return batchSignAll(paths)
        },
      },
    )
    assert.deepEqual(batched, ['user/r/photos/p0/report.jpg'])
    assert.equal(resolveCalls, 0)
    assert.equal(rows[0].src, 'https://cdn.example/a.jpg')
    assert.equal(rows[1].src, 'data:image/jpeg;base64,abc')
    assert.equal(rows[2].src, 'blob:https://zlog.local/p')
    assert.equal(rows[3].src, 'https://signed.example/user/r/photos/p0/report.jpg')
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoSignPathCount, 1)
    assert.equal(getShareTimingSnapshot().counts.photoSignBatchRequestCount, 1)
    assert.equal(getShareTimingSnapshot().counts.photoIndividualSignRequestCount, 0)
  })

  it('falls back to current resolveSrc when a batched path is missing', async () => {
    const photos = makeWorkPhotos(3)
    let resolveCalls = []
    const rows = await buildDiaryPdfPhotos(
      photos,
      async (photo) => {
        resolveCalls.push(photo.url)
        return `https://fallback/${photo.url}`
      },
      {
        batchSignStoragePaths: async (paths) => ({
          urlByPath: new Map([
            [paths[0], `https://signed.example/${paths[0]}`],
            [paths[2], `https://signed.example/${paths[2]}`],
          ]),
          batchRequestCount: 1,
        }),
      },
    )
    assert.deepEqual(resolveCalls, [photos[1].url])
    assert.equal(rows[0].src, `https://signed.example/${photos[0].url}`)
    assert.equal(rows[1].src, `https://fallback/${photos[1].url}`)
    assert.equal(rows[2].src, `https://signed.example/${photos[2].url}`)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoIndividualSignRequestCount, 1)
  })

  it('null/missing source still fails closed after batch signing', async () => {
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(
          [{ url: null, sequence: 1 }],
          async () => null,
          { batchSignStoragePaths: async () => batchSignAll([]) },
        ),
      (err) => {
        assert.equal(err.name, 'DiaryPdfPhotosIncompleteError')
        return true
      },
    )
  })

  it('batch throw falls back to per-photo resolveSrc without dropping or swapping photos', async () => {
    const photos = makeWorkPhotos(2)
    const rows = await buildDiaryPdfPhotos(
      photos,
      async (photo) => `https://fallback/${photo.url}`,
      {
        batchSignStoragePaths: async () => {
          throw new Error('batch failed')
        },
      },
    )
    assert.equal(rows[0].src, `https://fallback/${photos[0].url}`)
    assert.equal(rows[1].src, `https://fallback/${photos[1].url}`)
    flushShareTimingSnapshot()
    assert.equal(getShareTimingSnapshot().counts.photoSignBatchRequestCount, 1)
    assert.equal(getShareTimingSnapshot().counts.photoIndividualSignRequestCount, 2)
  })

  it('caps fetch/bake concurrency at 9 and stays bounded above 9 photos', async () => {
    assert.equal(PDF_PHOTO_PREPARE_CONCURRENCY, 9)
    assert.match(photosSrc, /PDF_PHOTO_PREPARE_CONCURRENCY = 9/)
    assert.match(
      photosSrc,
      /Math\.min\(PDF_PHOTO_PREPARE_CONCURRENCY, Math\.max\(1, list\.length/,
    )
    const buildFn = photosSrc.slice(photosSrc.indexOf('export async function buildDiaryPdfPhotos'))
    assert.doesNotMatch(buildFn, /await Promise\.all\(\s*(list|photos)\.map/)

    async function measurePool(count) {
      let inFlight = 0
      let maxInFlight = 0
      await mapWithConcurrency(
        Array.from({ length: count }, (_, i) => i),
        PDF_PHOTO_PREPARE_CONCURRENCY,
        async () => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await sleep(40)
          inFlight -= 1
          return true
        },
      )
      return maxInFlight
    }

    assert.equal(await measurePool(9), 9)
    assert.equal(await measurePool(12), 9)

    async function measureBuild(count) {
      let inFlight = 0
      let maxInFlight = 0
      const photos = makeWorkPhotos(count)
      const rows = await buildDiaryPdfPhotos(photos, async (photo) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await sleep(40)
        inFlight -= 1
        return `https://example.test/${photo.url}`
      })
      return { maxInFlight, rows, photos }
    }

    const nine = await measureBuild(9)
    assert.equal(nine.maxInFlight, 9)
    assert.equal(nine.rows.length, 9)

    const twelve = await measureBuild(12)
    assert.equal(twelve.maxInFlight, 9)
    assert.equal(twelve.rows.length, 12)
    assert.deepEqual(
      twelve.rows.map((row) => row.url),
      twelve.photos.map((photo) => photo.url),
    )
    assert.deepEqual(
      twelve.rows.map((row) => row.caption),
      twelve.photos.map((photo) => photo.caption),
    )
    assert.deepEqual(
      twelve.rows.map((row) => row.rotationDegrees),
      twelve.photos.map((photo) => photo.rotation_degrees),
    )
    assert.deepEqual(
      twelve.rows.map((row) => row.layout),
      twelve.photos.map((photo) => photo.layout),
    )
    assert.deepEqual(
      twelve.rows.map((row) => row.location),
      twelve.photos.map((photo) => photo.location),
    )
  })

  it('19 uncached photos still each enter image preparation after a single batch sign', async () => {
    const photos = makeWorkPhotos(19)
    let batchCalls = 0
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        throw new Error('must not individual-sign')
      },
      {
        batchSignStoragePaths: async (paths) => {
          batchCalls += 1
          return batchSignAll(paths)
        },
      },
    )
    assert.equal(batchCalls, 1)
    assert.equal(rows.length, 19)
    assert.equal(new Set(rows.map((row) => row.src)).size, 19)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoCacheHitCount, 0)
    assert.equal(counts.photoSignBatchRequestCount, 1)
    assert.equal(counts.photoIndividualSignRequestCount, 0)
    assert.equal(counts.pdfLocalBlobSourceCount, 0)
    assert.equal(counts.pdfNetworkSourceCount, 19)
    assert.match(photosSrc, /if \(typeof document !== 'undefined'\) \{[\s\S]*flattenPhotoSrcForPdf/)
    assert.match(photosSrc, /bumpShareTimingCountSilent\('photoFetchBakeCount'\)/)
  })

  it('uses READY local report Blob for the matching durable path and skips sign/fetch', async () => {
    const photos = makeWorkPhotos(3)
    const localA = new Blob(['REPORT-0'], { type: 'image/jpeg' })
    const localB = new Blob(['REPORT-1'], { type: 'image/jpeg' })
    const localByPath = new Map([
      [photos[0].url, localA],
      [photos[1].url, localB],
    ])
    let batched = []
    let resolveCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      fetchCalls += 1
      if (typeof originalFetch === 'function') return originalFetch(...args)
      throw new Error('local blob path must not HTTP fetch')
    }
    try {
      const rows = await buildDiaryPdfPhotos(
        photos,
        async (photo) => {
          resolveCalls += 1
          return `https://fallback/${photo.url}`
        },
        {
          batchSignStoragePaths: async (paths) => {
            batched = paths
            return batchSignAll(paths)
          },
          localPreparedPhotoSources: localByPath,
        },
      )
      assert.deepEqual(batched, [photos[2].url])
      assert.equal(resolveCalls, 0)
      assert.equal(fetchCalls, 0)
      assert.equal(rows[0].url, photos[0].url)
      assert.equal(rows[1].url, photos[1].url)
      assert.equal(rows[2].url, photos[2].url)
      assert.match(rows[0].src, /^blob:zlog-local-prepared\//)
      assert.match(rows[1].src, /^blob:zlog-local-prepared\//)
      assert.equal(rows[2].src, `https://signed.example/${photos[2].url}`)
      assert.deepEqual(
        rows.map((row) => row.caption),
        photos.map((photo) => photo.caption),
      )
      assert.deepEqual(
        rows.map((row) => row.rotationDegrees),
        photos.map((photo) => photo.rotation_degrees),
      )
      assert.deepEqual(
        rows.map((row) => row.layout),
        photos.map((photo) => photo.layout),
      )
      assert.deepEqual(
        rows.map((row) => row.location),
        photos.map((photo) => photo.location),
      )
      flushShareTimingSnapshot()
      const counts = getShareTimingSnapshot().counts
      assert.equal(counts.pdfLocalBlobSourceCount, 2)
      assert.equal(counts.pdfNetworkSourceCount, 1)
      assert.equal(counts.photoSignPathCount, 1)
      assert.equal(counts.photoSignBatchRequestCount, 1)
      assert.equal(counts.photoIndividualSignRequestCount, 0)
      assert.equal(counts.photoNetworkFetchCount, 0)
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('does not cross-wire a Blob keyed to a different storage path', async () => {
    const photos = makeWorkPhotos(2)
    const rows = await buildDiaryPdfPhotos(
      photos,
      async (photo) => `https://correct/${photo.url}`,
      {
        batchSignStoragePaths: async (paths) => batchSignAll(paths),
        localPreparedPhotoSources: new Map([
          [photos[1].url, new Blob(['BLOB-FOR-PHOTO-1'], { type: 'image/jpeg' })],
        ]),
      },
    )
    assert.match(rows[1].src, /^blob:zlog-local-prepared\//)
    assert.equal(rows[0].src, `https://signed.example/${photos[0].url}`)
    assert.equal(rows[0].url, photos[0].url)
    assert.equal(rows[1].url, photos[1].url)
  })

  it('all-local diary performs zero sign requests and keeps photo.url identity', async () => {
    const photos = makeWorkPhotos(10)
    const localByPath = new Map(
      photos.map((photo, i) => [photo.url, new Blob([`REPORT-${i}`], { type: 'image/jpeg' })]),
    )
    let batchCalls = 0
    let resolveCalls = 0
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        resolveCalls += 1
        throw new Error('all-local must not sign')
      },
      {
        batchSignStoragePaths: async () => {
          batchCalls += 1
          throw new Error('all-local must not batch sign')
        },
        localPreparedPhotoSources: localByPath,
      },
    )
    assert.equal(batchCalls, 0)
    assert.equal(resolveCalls, 0)
    assert.equal(rows.length, 10)
    assert.deepEqual(
      rows.map((row) => row.url),
      photos.map((photo) => photo.url),
    )
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.pdfLocalBlobSourceCount, 10)
    assert.equal(counts.pdfNetworkSourceCount, 0)
    assert.equal(counts.photoSignPathCount, 0)
    assert.equal(counts.photoSignBatchRequestCount, 0)
  })

  it('cover/logo/signature signing stays on the single-path helper', () => {
    const prepareIdx = shareSrc.indexOf('export async function prepareSiteDiaryPdf')
    const assetCallIdx = shareSrc.indexOf('const pdfAssetPromise = signPdfReportAssets', prepareIdx)
    const photoPrep = shareSrc.slice(prepareIdx, assetCallIdx)
    assert.ok(prepareIdx >= 0 && assetCallIdx > prepareIdx)
    assert.match(shareSrc.slice(prepareIdx), /batchSignedUrlsForStoragePaths/)
    assert.match(photoPrep, /pdf_report_query_done/)
    const assetsFn = assetsSrc.slice(assetsSrc.indexOf('export async function signPdfReportAssets'))
    assert.match(assetsFn, /signedUrlForPath\(supabase, report\.brand_logo_url\)/)
    assert.match(assetsFn, /signedUrlForPath\(supabase, report\.cover_photo_url\)/)
    assert.match(assetsFn, /signedUrlForPath\(supabase, report\.signature_url\)/)
    assert.doesNotMatch(assetsFn, /createSignedUrls/)
    assert.doesNotMatch(assetsFn, /batchSignedUrlsForStoragePaths/)
  })
})
