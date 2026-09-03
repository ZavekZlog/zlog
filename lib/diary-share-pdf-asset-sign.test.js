/**
 * PDF asset signing — concurrent independent storage signs; sequential cover upright bake.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signPdfReportAssets, batchSignedUrlsForStoragePaths, mapBatchSignedUrlsByPath } from './diary-share-pdf-assets.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shareLib = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const assetsLib = readFileSync(join(root, 'lib/diary-share-pdf-assets.js'), 'utf8')

function prepareSiteDiaryPdfBlock() {
  const prepareStart = shareLib.indexOf('export async function prepareSiteDiaryPdf')
  const prepareEnd = shareLib.indexOf('export function snapshotUserActivation')
  assert.ok(prepareStart >= 0 && prepareEnd > prepareStart)
  return shareLib.slice(prepareStart, prepareEnd)
}

function makeDelayedSignedUrlSupabase(onCall) {
  return {
    storage: {
      from() {
        return {
          createSignedUrl(path) {
            return onCall(path)
          },
        }
      },
    },
  }
}

describe('signPdfReportAssets — concurrent independent signs', () => {
  it('initiates logo, cover, and signature sign requests concurrently', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const started = []

    const supabase = makeDelayedSignedUrlSupabase((path) => new Promise((resolve) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      started.push(path)
      setTimeout(() => {
        inFlight -= 1
        resolve({ data: { signedUrl: `https://signed/${path}` }, error: null })
      }, 40)
    }))

    const report = {
      brand_logo_url: 'user/logo.jpg',
      cover_photo_url: 'user/cover.jpg',
      signature_url: 'user/sig.png',
    }

    const uprightCalls = []
    const result = await signPdfReportAssets(
      supabase,
      report,
      async (signedCoverUrl) => {
        uprightCalls.push(signedCoverUrl)
        return signedCoverUrl ? 'data:image/jpeg;base64,abc' : null
      },
    )

    assert.equal(maxInFlight, 3, 'all three independent sign requests should overlap')
    assert.equal(started.length, 3)
    assert.deepEqual(new Set(started), new Set(['user/logo.jpg', 'user/cover.jpg', 'user/sig.png']))
    assert.equal(result.logoUrl, 'https://signed/user/logo.jpg')
    assert.equal(result.signatureSrc, 'https://signed/user/sig.png')
    assert.equal(result.coverPhotoUrl, 'data:image/jpeg;base64,abc')
    assert.deepEqual(uprightCalls, ['https://signed/user/cover.jpg'])
  })

  it('returns all signed asset results and passes them through to upright cover bake', async () => {
    const supabase = makeDelayedSignedUrlSupabase(async (path) => ({
      data: { signedUrl: `https://cdn.example/${path}` },
      error: null,
    }))

    const result = await signPdfReportAssets(
      supabase,
      {
        brand_logo_url: 'branding/logo.png',
        cover_photo_url: 'reports/cover.jpg',
        signature_url: 'reports/sign.png',
      },
      async (signedCoverUrl) => `baked:${signedCoverUrl}`,
    )

    assert.equal(result.logoUrl, 'https://cdn.example/branding/logo.png')
    assert.equal(result.signatureSrc, 'https://cdn.example/reports/sign.png')
    assert.equal(result.coverPhotoUrl, 'baked:https://cdn.example/reports/cover.jpg')
  })

  it('handles missing/null assets without storage calls', async () => {
    let calls = 0
    const supabase = makeDelayedSignedUrlSupabase(async () => {
      calls += 1
      return { data: { signedUrl: 'https://signed/x' }, error: null }
    })

    const result = await signPdfReportAssets(
      supabase,
      {
        brand_logo_url: null,
        cover_photo_url: '',
        signature_url: undefined,
      },
      async (signedCoverUrl) => signedCoverUrl,
    )

    assert.equal(calls, 0)
    assert.equal(result.logoUrl, null)
    assert.equal(result.coverPhotoUrl, null)
    assert.equal(result.signatureSrc, null)
  })

  it('preserves null when one storage sign fails while others succeed', async () => {
    const supabase = makeDelayedSignedUrlSupabase(async (path) => {
      if (path === 'user/cover.jpg') {
        return { data: null, error: { message: 'storage-fail' } }
      }
      return { data: { signedUrl: `https://signed/${path}` }, error: null }
    })

    const result = await signPdfReportAssets(
      supabase,
      {
        brand_logo_url: 'user/logo.jpg',
        cover_photo_url: 'user/cover.jpg',
        signature_url: 'user/sig.png',
      },
      async (signedCoverUrl) => (signedCoverUrl ? 'data:image/jpeg;base64,cover' : null),
    )

    assert.equal(result.logoUrl, 'https://signed/user/logo.jpg')
    assert.equal(result.signatureSrc, 'https://signed/user/sig.png')
    assert.equal(result.coverPhotoUrl, null)
  })

  it('propagates upright cover bake failure after concurrent signs complete', async () => {
    const supabase = makeDelayedSignedUrlSupabase(async (path) => ({
      data: { signedUrl: `https://signed/${path}` },
      error: null,
    }))

    await assert.rejects(
      () => signPdfReportAssets(
        supabase,
        {
          brand_logo_url: 'user/logo.jpg',
          cover_photo_url: 'user/cover.jpg',
          signature_url: 'user/sig.png',
        },
        async () => {
          throw new Error('Could not download the cover photo for the PDF.')
        },
      ),
      /Could not download the cover photo for the PDF\./,
    )
  })
})

describe('prepareSiteDiaryPdf asset_sign contract', () => {
  it('uses Promise.all for independent asset signs and keeps cover upright bake sequential', () => {
    assert.match(assetsLib, /Promise\.all\(\[\s*\n\s*signedUrlForPath\(supabase, report\.brand_logo_url\)/)
    assert.match(assetsLib, /signedUrlForPath\(supabase, report\.cover_photo_url\)/)
    assert.match(assetsLib, /signedUrlForPath\(supabase, report\.signature_url\)/)
    assert.match(assetsLib, /const coverPhotoUrl = await uprightCoverFn\(coverSignedUrl\)/)
  })

  it('prepareSiteDiaryPdf wires signPdfReportAssets and passes logo, cover, and signature to DiaryPdfDocument', () => {
    const prepareBlock = prepareSiteDiaryPdfBlock()

    assert.match(shareLib, /from '@\/lib\/diary-share-pdf-assets'/)
    assert.match(
      prepareBlock,
      /const pdfAssetPromise = signPdfReportAssets\(\s*\n\s*supabase,\s*\n\s*report,\s*\n\s*\(signedCoverUrl\) => resolveCoverPdfSource/,
    )
    assert.match(
      prepareBlock,
      /const \{ logoUrl, coverPhotoUrl, signatureSrc \} = await pdfAssetPromise/,
    )
    assert.doesNotMatch(
      prepareBlock,
      /const logoUrl = await signedUrlForPath\(supabase, report\.brand_logo_url\)/,
    )
    assert.doesNotMatch(
      prepareBlock,
      /const coverSignedUrl = await signedUrlForPath\(supabase, report\.cover_photo_url\)/,
    )
    assert.doesNotMatch(
      prepareBlock,
      /const signatureSrc = await signedUrlForPath\(supabase, report\.signature_url\)/,
    )
    assert.match(prepareBlock, /logoUrl,/)
    assert.match(prepareBlock, /coverPhotoUrl,/)
    assert.match(prepareBlock, /signatureSrc,/)
    assert.match(prepareBlock, /createElement\(DiaryPdfDocument/)
  })

  it('work-photo batch signing is wired; cover/logo/signature stay on signedUrlForPath', () => {
    const prepareBlock = prepareSiteDiaryPdfBlock()
    assert.match(prepareBlock, /batchSignedUrlsForStoragePaths/)
    assert.match(prepareBlock, /batchSignStoragePaths/)
    assert.match(prepareBlock, /localPreparedPhotoSources/)
    assert.match(prepareBlock, /signedUrlForPath\(supabase, photo\.url\)/)
    assert.doesNotMatch(
      prepareBlock,
      /createSignedUrl\(supabase, photo/,
    )
    assert.match(
      prepareBlock,
      /const pdfAssetPromise = signPdfReportAssets/,
    )
    assert.match(
      prepareBlock,
      /const \{ logoUrl, coverPhotoUrl, signatureSrc \} = await pdfAssetPromise/,
    )
  })
})

function makeBatchSupabase({ onBatch, onSingle } = {}) {
  let batchCalls = 0
  let singleCalls = 0
  let fetchCalls = 0
  return {
    calls: () => ({ batchCalls, singleCalls, fetchCalls }),
    storage: {
      from() {
        return {
          createSignedUrls: async (paths, expiresIn) => {
            batchCalls += 1
            if (typeof onBatch === 'function') return onBatch(paths, expiresIn, batchCalls)
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://signed.example/${path}`,
                error: null,
              })),
              error: null,
            }
          },
          createSignedUrl: async (path) => {
            singleCalls += 1
            if (typeof onSingle === 'function') return onSingle(path)
            return { data: { signedUrl: `https://single.example/${path}` }, error: null }
          },
        }
      },
    },
  }
}

describe('batchSignedUrlsForStoragePaths — PDF work photos', () => {
  it('19 storage paths use one createSignedUrls call and zero createSignedUrl calls', async () => {
    const paths = Array.from({ length: 19 }, (_, i) => `user/r/photos/p${i}/report.jpg`)
    const supabase = makeBatchSupabase()
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async (...args) => {
      fetchCalls += 1
      if (typeof originalFetch === 'function') return originalFetch(...args)
      throw new Error('batch sign must not fetch')
    }
    try {
      const result = await batchSignedUrlsForStoragePaths(supabase, paths)
      assert.equal(supabase.calls().batchCalls, 1)
      assert.equal(supabase.calls().singleCalls, 0)
      assert.equal(fetchCalls, 0)
      assert.equal(result.batchRequestCount, 1)
      assert.equal(result.signablePathCount, 19)
      assert.equal(result.urlByPath.size, 19)
      assert.equal(
        result.urlByPath.get(paths[7]),
        `https://signed.example/${paths[7]}`,
      )
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('uses existing 100-path chunking so 101 paths become two batch requests', async () => {
    const paths = Array.from({ length: 101 }, (_, i) => `user/r/photos/p${i}/report.jpg`)
    const supabase = makeBatchSupabase()
    const result = await batchSignedUrlsForStoragePaths(supabase, paths)
    assert.equal(result.batchRequestCount, 2)
    assert.equal(supabase.calls().batchCalls, 2)
    assert.equal(result.urlByPath.size, 101)
  })

  it('maps by returned path, including shuffled order', async () => {
    const paths = ['a/report.jpg', 'b/report.jpg', 'c/report.jpg']
    const supabase = makeBatchSupabase({
      onBatch: async (requested) => ({
        data: [...requested].reverse().map((path) => ({
          path,
          signedUrl: `https://signed.example/${path}`,
          error: null,
        })),
        error: null,
      }),
    })
    const result = await batchSignedUrlsForStoragePaths(supabase, paths)
    assert.equal(result.urlByPath.get('a/report.jpg'), 'https://signed.example/a/report.jpg')
    assert.equal(result.urlByPath.get('c/report.jpg'), 'https://signed.example/c/report.jpg')
  })

  it('does not assign neighbour URLs when batch rows omit path', () => {
    const mapped = mapBatchSignedUrlsByPath(
      [
        { signedUrl: 'https://signed.example/b/report.jpg' },
        { signedUrl: 'https://signed.example/a/report.jpg' },
      ],
      ['a/report.jpg', 'b/report.jpg'],
    )
    assert.equal(mapped.size, 0)
  })

  it('skips already-usable sources and does not send them to createSignedUrls', async () => {
    const supabase = makeBatchSupabase()
    const result = await batchSignedUrlsForStoragePaths(supabase, [
      'https://cdn.example/a.jpg',
      'data:image/jpeg;base64,abc',
      'blob:https://zlog.local/x',
      'user/r/photos/p0/report.jpg',
    ])
    assert.equal(result.signablePathCount, 1)
    assert.equal(result.batchRequestCount, 1)
    assert.equal(supabase.calls().batchCalls, 1)
    assert.equal(result.urlByPath.has('https://cdn.example/a.jpg'), false)
    assert.equal(
      result.urlByPath.get('user/r/photos/p0/report.jpg'),
      'https://signed.example/user/r/photos/p0/report.jpg',
    )
  })

  it('leaves a failed path unsigned so callers can fall back without dropping siblings', async () => {
    const supabase = makeBatchSupabase({
      onBatch: async (paths) => ({
        data: [
          { path: paths[0], signedUrl: `https://signed.example/${paths[0]}`, error: null },
          { path: paths[1], signedUrl: null, error: 'sign-failed' },
        ],
        error: null,
      }),
    })
    const result = await batchSignedUrlsForStoragePaths(supabase, [
      'ok/report.jpg',
      'bad/report.jpg',
    ])
    assert.equal(result.urlByPath.get('ok/report.jpg'), 'https://signed.example/ok/report.jpg')
    assert.equal(result.urlByPath.has('bad/report.jpg'), false)
  })
})
