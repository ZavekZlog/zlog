/**
 * Display signed-URL cache — review → edit reuse contract.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DISPLAY_SIGNED_URL_SAFETY_MARGIN_MS,
  displaySignedUrlCacheKey,
  displaySignedUrlExpiresAtMs,
  getDisplaySignedUrlCacheDiag,
  getValidDisplaySignedUrl,
  isDisplaySignedUrlEntryValid,
  resetDisplaySignedUrlCache,
  storeDisplaySignedUrl,
} from './display-signed-url-cache.js'
import {
  createPhotoDisplaySignSession,
  enrichGridPhotoRowsFromDisplayCache,
  resetDisplaySignedUrlCache as resetFromThumb,
  signSavedPhotoGridRows,
} from './thumbnail-display.js'
import { resolveCoverPhotoPreviewUrl } from '../diary-cover-photo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const pdfAssetsSrc = readFileSync(join(root, 'lib/diary-share-pdf-assets.js'), 'utf8')

beforeEach(() => {
  resetDisplaySignedUrlCache()
  resetFromThumb()
})

describe('display signed-url cache', () => {
  it('A — same path returns identical URL and records hit on second read', () => {
    storeDisplaySignedUrl('u/r/photos/p1/thumb.jpg', 'https://signed.example/thumb?v=1', 3600)
    const first = getValidDisplaySignedUrl('u/r/photos/p1/thumb.jpg')
    const second = getValidDisplaySignedUrl('u/r/photos/p1/thumb.jpg')
    assert.equal(first, 'https://signed.example/thumb?v=1')
    assert.equal(second, first)
    const diag = getDisplaySignedUrlCacheDiag()
    assert.equal(diag.hits, 2)
  })

  it('B — second sign session reuses tab cache without backend call', async () => {
    storeDisplaySignedUrl('u/r/a/thumb.jpg', 'https://signed.example/a', 3600)
    let batchCalls = 0
    const session = createPhotoDisplaySignSession({
      batchSignPaths: async (paths) => {
        batchCalls += 1
        return paths.map((path) => ({ path, signedUrl: `https://new/${path}`, error: null }))
      },
    })
    const url = await session.resolveOne('u/r/a/thumb.jpg')
    assert.equal(url, 'https://signed.example/a')
    assert.equal(batchCalls, 0)
    assert.equal(session.stats().batchApiCalls, 0)
  })

  it('C — batch resolves cached + uncached; only misses are batch-signed', async () => {
    storeDisplaySignedUrl('u/r/cached/thumb.jpg', 'https://signed.example/cached', 3600)
    const batchPaths = []
    const session = createPhotoDisplaySignSession({
      batchSignPaths: async (paths) => {
        batchPaths.push(...paths)
        return paths.map((path) => ({
          path,
          signedUrl: `https://signed.example/${path.split('/').pop()}`,
          error: null,
        }))
      },
    })
    const map = await session.resolveMany([
      'u/r/cached/thumb.jpg',
      'u/r/miss/thumb.jpg',
    ])
    assert.equal(map.get('u/r/cached/thumb.jpg'), 'https://signed.example/cached')
    assert.equal(map.get('u/r/miss/thumb.jpg'), 'https://signed.example/thumb.jpg')
    assert.deepEqual(batchPaths, ['u/r/miss/thumb.jpg'])
    assert.equal(session.stats().batchApiCalls, 1)
  })

  it('D — changed storage path triggers new signing', async () => {
    storeDisplaySignedUrl('u/r/old/thumb.jpg', 'https://signed.example/old', 3600)
    let batchCalls = 0
    const session = createPhotoDisplaySignSession({
      batchSignPaths: async (paths) => {
        batchCalls += 1
        return paths.map((path) => ({ path, signedUrl: 'https://signed.example/new', error: null }))
      },
    })
    const url = await session.resolveOne('u/r/new/thumb.jpg')
    assert.equal(url, 'https://signed.example/new')
    assert.equal(batchCalls, 1)
  })

  it('E — near-expiry entry is discarded and re-signed', async () => {
    storeDisplaySignedUrl('u/r/exp/thumb.jpg', 'https://signed.example/stale', 3600)
    const farFuture = Date.now() + 4 * 3600 * 1000
    assert.equal(
      getValidDisplaySignedUrl('u/r/exp/thumb.jpg', { nowMs: farFuture, recordStats: true }),
      null,
    )
    const session = createPhotoDisplaySignSession({
      batchSignPaths: async () => [],
      singleSignPath: async () => 'https://signed.example/fresh',
    })
    const url = await session.resolveOne('u/r/exp/thumb.jpg')
    assert.equal(url, 'https://signed.example/fresh')
    assert.ok(getDisplaySignedUrlCacheDiag().expired >= 1)
  })

  it('F — enrichGridPhotoRowsFromDisplayCache prefers thumb path only', () => {
    storeDisplaySignedUrl('u/r/p1/thumb.jpg', 'https://signed.example/thumb', 3600)
    storeDisplaySignedUrl('u/r/p1/report.jpg', 'https://signed.example/report', 3600)
    const [row] = enrichGridPhotoRowsFromDisplayCache([{
      url: 'u/r/p1/report.jpg',
      thumbnailPath: 'u/r/p1/thumb.jpg',
      preview: null,
      thumbnailPreview: null,
    }])
    assert.equal(row.thumbnailPreview, 'https://signed.example/thumb')
    assert.equal(row.preview, null)
  })

  it('G — cover preview reuses cached URL', async () => {
    let signCalls = 0
    const supabase = {
      storage: {
        from() {
          return {
            async createSignedUrl(path) {
              signCalls += 1
              assert.equal(path, 'user/cover.jpg')
              return { data: { signedUrl: 'https://signed.example/cover' }, error: null }
            },
          }
        },
      },
    }
    storeDisplaySignedUrl('user/cover.jpg', 'https://signed.example/cover', 3600)
    const url = await resolveCoverPhotoPreviewUrl(supabase, 'user/cover.jpg')
    assert.equal(url, 'https://signed.example/cover')
    assert.equal(signCalls, 0)
  })

  it('H — signature path uses same cover resolver cache', async () => {
    let signCalls = 0
    const supabase = {
      storage: {
        from() {
          return {
            async createSignedUrl() {
              signCalls += 1
              return { data: { signedUrl: 'https://signed.example/sig' }, error: null }
            },
          }
        },
      },
    }
    const first = await resolveCoverPhotoPreviewUrl(supabase, 'user/sig.png')
    const second = await resolveCoverPhotoPreviewUrl(supabase, 'user/sig.png')
    assert.equal(first, 'https://signed.example/sig')
    assert.equal(second, first)
    assert.equal(signCalls, 1)
  })

  it('I — cache is in-memory only (no localStorage)', () => {
    assert.doesNotMatch(
      readFileSync(join(root, 'lib/photo-workspace/display-signed-url-cache.js'), 'utf8'),
      /localStorage|sessionStorage|indexedDB/i,
    )
  })

  it('J — PDF asset signing module does not import display cache', () => {
    assert.doesNotMatch(pdfAssetsSrc, /display-signed-url-cache/)
  })
})

describe('display cache + signSavedPhotoGridRows', () => {
  it('second hydrate session reuses URLs for unchanged thumbs', async () => {
    const thumb = 'u/r/photos/p1/thumb.jpg'
    storeDisplaySignedUrl(thumb, 'https://signed.example/thumb-stable', 3600)
    let batchCalls = 0
    const session = createPhotoDisplaySignSession({
      batchSignPaths: async (paths) => {
        batchCalls += 1
        return paths.map((path) => ({ path, signedUrl: 'https://should-not-run', error: null }))
      },
    })
    const signed = await signSavedPhotoGridRows(
      [{ url: 'u/r/photos/p1/report.jpg', thumbnail_path: thumb }],
      {
        session,
        mapRow: (row, index, payload) => ({ id: `p-${index}`, ...payload }),
      },
    )
    assert.equal(signed[0].thumbnailPreview, 'https://signed.example/thumb-stable')
    assert.equal(batchCalls, 0)
  })
})
