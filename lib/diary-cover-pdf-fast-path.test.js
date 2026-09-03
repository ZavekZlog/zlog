/**
 * Prepared cover persist + PDF pass-through (legacy bake unchanged).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coverBlobToPdfDataUrl,
  coverPhotoStateAfterUpload,
  isPreparedCoverForPdf,
  isPreparedCoverStoragePath,
  persistCanonicalCoverUpload,
  resolveCoverPdfSource,
} from './diary-cover-photo.js'
import {
  prepareCanonicalCoverBlob,
  preparedCoverStoragePath,
  rawCoverStoragePath,
  ZLOG_COVER_MAX_EDGE,
  ZLOG_COVER_PIPELINE_ID,
} from './cover-pipeline.js'
import { computeContainDimensions } from './photo-workspace/image-pipeline.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const coverPipelineSrc = readFileSync(join(root, 'lib/cover-pipeline.js'), 'utf8')
const layoutSrc = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')

function jpegBlob(bytes = 'cover-bytes') {
  return new Blob([bytes], { type: 'image/jpeg' })
}

function fakeDocument() {
  return {
    createElement(tag) {
      if (tag !== 'canvas') return {}
      return {
        width: 0,
        height: 0,
        getContext() {
          return { drawImage() {} }
        },
        toBlob(cb) {
          cb(jpegBlob('prepared-jpeg'))
        },
      }
    },
  }
}

function makeUploadSupabase({ onPrepared, onRaw } = {}) {
  const calls = { prepared: [], raw: [] }
  return {
    calls,
    storage: {
      from() {
        return {
          async upload(path, file, opts) {
            if (String(path).includes('/covers/raw/')) {
              calls.raw.push({ path, file, opts })
              if (typeof onRaw === 'function') return onRaw(path, file, opts)
              return { error: null }
            }
            calls.prepared.push({ path, file, opts })
            if (typeof onPrepared === 'function') return onPrepared(path, file, opts)
            return { error: null }
          },
        }
      },
    },
  }
}

describe('prepared cover identity', () => {
  it('recognises prepared covers/{generation}.jpg and rejects raw/legacy paths', () => {
    const prepared = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    assert.equal(isPreparedCoverStoragePath(prepared), true)
    assert.equal(isPreparedCoverForPdf({ coverPath: prepared }), true)
    assert.equal(isPreparedCoverStoragePath(rawCoverStoragePath('user-1', 'rep-1', 'gen-1')), false)
    assert.equal(isPreparedCoverStoragePath('user-1/rep-1/cover.jpg'), false)
    assert.equal(isPreparedCoverForPdf({ coverPath: 'user-1/rep-1/cover.jpg' }), false)
    assert.equal(isPreparedCoverForPdf({
      coverPath: 'user-1/rep-1/cover.jpg',
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
    }), false)
  })
})

describe('A/B — new portrait and landscape covers persist upright contain JPEG', () => {
  it('portrait cover scales by long edge, no crop, and uploads prepared path', async () => {
    const { width, height } = computeContainDimensions(3000, 4000, ZLOG_COVER_MAX_EDGE)
    assert.equal(height, 2400)
    assert.equal(width, 1800)
    assert.ok(width / height - 3000 / 4000 < 0.001)

    const source = jpegBlob('portrait-raw')
    const prepared = await prepareCanonicalCoverBlob(source, {
      document: fakeDocument(),
      decode: async () => ({
        source: {},
        width: 3000,
        height: 4000,
        orientation: 6,
        usedBrowserOrientation: true,
        decodeMode: 'createImageBitmap',
        close() {},
      }),
    })
    assert.equal(prepared.width, 1800)
    assert.equal(prepared.height, 2400)
    assert.equal(prepared.pipelineId, ZLOG_COVER_PIPELINE_ID)
    assert.ok(prepared.blob instanceof Blob)

    const supabase = makeUploadSupabase()
    const result = await persistCanonicalCoverUpload(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: 'gen-portrait',
      file: source,
      prepareFn: async () => prepared,
    })
    assert.equal(result.prepared, true)
    assert.equal(result.coverProcessingVersion, ZLOG_COVER_PIPELINE_ID)
    assert.equal(result.storagePath, preparedCoverStoragePath('user-1', 'rep-1', 'gen-portrait'))
    assert.equal(supabase.calls.prepared.length, 1)
    assert.equal(supabase.calls.raw.length, 0)
    assert.equal(result.preparedBlob, prepared.blob)
  })

  it('landscape cover keeps aspect, no crop, and uploads prepared path', async () => {
    const { width, height } = computeContainDimensions(4000, 2000, ZLOG_COVER_MAX_EDGE)
    assert.equal(width, 2400)
    assert.equal(height, 1200)

    const source = jpegBlob('landscape-raw')
    const prepared = await prepareCanonicalCoverBlob(source, {
      document: fakeDocument(),
      decode: async () => ({
        source: {},
        width: 4000,
        height: 2000,
        orientation: 1,
        usedBrowserOrientation: true,
        decodeMode: 'createImageBitmap',
        close() {},
      }),
    })
    assert.equal(prepared.width, 2400)
    assert.equal(prepared.height, 1200)

    const supabase = makeUploadSupabase()
    const result = await persistCanonicalCoverUpload(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: 'gen-landscape',
      file: source,
      prepareFn: async () => prepared,
    })
    assert.equal(result.prepared, true)
    assert.equal(result.storagePath, preparedCoverStoragePath('user-1', 'rep-1', 'gen-landscape'))
    assert.equal(supabase.calls.raw.length, 0)
  })

  it('pipeline draws contain (0,0,outW,outH) and never a crop source rect', () => {
    assert.match(coverPipelineSrc, /ctx\.drawImage\(imageSource, 0, 0, outW, outH\)/)
    assert.match(coverPipelineSrc, /computeContainDimensions/)
    assert.doesNotMatch(coverPipelineSrc, /drawImage\([^)]+,\s*sx,\s*sy/)
  })
})

describe('C/D — PDF prepared pass-through vs same-session local blob', () => {
  it('reopened prepared cover fetches once and does not call orientation bake', async () => {
    const coverPath = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    let bakeCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      fetchCalls += 1
      return {
        ok: true,
        async blob() {
          return jpegBlob('network-prepared')
        },
      }
    }
    try {
      const src = await resolveCoverPdfSource('https://signed.example/cover.jpg', {
        coverPath,
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,baked'
        },
      })
      assert.equal(fetchCalls, 1)
      assert.equal(bakeCalls, 0)
      assert.ok(String(src).startsWith('data:image/'))
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('same-session prepared blob is reused with zero fetch and zero bake', async () => {
    const coverPath = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    const local = jpegBlob('local-prepared')
    let bakeCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      fetchCalls += 1
      throw new Error('same-session must not download cover')
    }
    try {
      const src = await resolveCoverPdfSource('https://signed.example/cover.jpg', {
        coverPath,
        localPreparedBlob: local,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,baked'
        },
      })
      assert.equal(fetchCalls, 0)
      assert.equal(bakeCalls, 0)
      assert.ok(String(src).startsWith('data:image/'))
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('coverPhotoStateAfterUpload keeps preparedBlob for same-session reuse', () => {
    const blob = jpegBlob('kept')
    const path = preparedCoverStoragePath('u', 'r', 'g')
    const state = coverPhotoStateAfterUpload(path, 'blob:preview', { preparedBlob: blob })
    assert.equal(state.storagePath, path)
    assert.equal(state.file, null)
    assert.equal(state.preparedBlob, blob)
  })
})

describe('E — legacy/raw cover still uses defensive orientation bake', () => {
  it('legacy cover.jpg calls uprightCoverFn and does not pass through', async () => {
    let bakeCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      fetchCalls += 1
      throw new Error('legacy bake path should use uprightCoverFn, not fetch here')
    }
    try {
      const src = await resolveCoverPdfSource('https://signed.example/legacy.jpg', {
        coverPath: 'user-1/rep-1/cover.jpg',
        localPreparedBlob: null,
        uprightCoverFn: async (url) => {
          bakeCalls += 1
          assert.equal(url, 'https://signed.example/legacy.jpg')
          return 'data:image/jpeg;base64,legacy-baked'
        },
      })
      assert.equal(bakeCalls, 1)
      assert.equal(fetchCalls, 0)
      assert.equal(src, 'data:image/jpeg;base64,legacy-baked')
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('raw fallback path is not treated as prepared', () => {
    assert.equal(
      isPreparedCoverStoragePath(rawCoverStoragePath('user-1', 'rep-1', 'gen-1')),
      false,
    )
  })

  it('prepare failure falls back to raw upload', async () => {
    const supabase = makeUploadSupabase()
    const result = await persistCanonicalCoverUpload(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: 'gen-fail',
      file: jpegBlob('raw'),
      prepareFn: async () => {
        throw new Error('prepare-unavailable')
      },
    })
    assert.equal(result.prepared, false)
    assert.equal(result.coverProcessingVersion, null)
    assert.equal(result.storagePath, rawCoverStoragePath('user-1', 'rep-1', 'gen-fail'))
    assert.equal(supabase.calls.prepared.length, 0)
    assert.equal(supabase.calls.raw.length, 1)
  })
})

describe('PDF cover layout remains contain / no-crop', () => {
  it('cover Image uses contain object-fit', () => {
    assert.match(layoutSrc, /<Image src=\{coverPhotoUrl\} style=\{styles\.imageContain\}/)
    assert.match(layoutSrc, /imageContain:[\s\S]*objectFit:\s*'contain'/)
  })
})

describe('prepareSiteDiaryPdf cover fast path wiring', () => {
  it('wires resolveCoverPdfSource and same-session localPreparedCoverBlob', () => {
    assert.match(shareSrc, /resolveCoverPdfSource/)
    assert.match(shareSrc, /localPreparedCoverBlob/)
    assert.match(shareSrc, /uprightCoverFn: uprightCoverSrcForPdf/)
    assert.match(shareSrc, /cover_processing_version/)
  })
})

describe('coverBlobToPdfDataUrl is not a canvas bake', () => {
  it('encodes blob bytes as a data URL', async () => {
    const blob = jpegBlob('abc')
    const url = await coverBlobToPdfDataUrl(blob)
    assert.ok(url.startsWith('data:image/jpeg;base64,'))
  })
})
