/**
 * Phase D — thumbnail-first batch display correction tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectGridDisplayPaths,
  createPhotoDisplaySignSession,
  dedupeStoragePaths,
  ensureViewerReportPreview,
  gridImageSrc,
  isBrowserDisplaySrc,
  mapSignedUrlResults,
  shouldEagerLoadSavedReviewThumb,
  signSavedPhotoGridRows,
  usesDurableThumbnailForGrid,
  viewerImageSrc,
  chunkPaths,
} from './thumbnail-display.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const gridSrc = readFileSync(
  join(root, 'components/photo-workspace/CaptureThumbnailGrid.jsx'),
  'utf8',
)
const previewSrc = readFileSync(
  join(root, 'components/photo-workspace/CapturePhotoPreview.jsx'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

function mockBatchSession(pathToUrl = {}) {
  let batchApiCalls = 0
  let singleApiCalls = 0
  const session = createPhotoDisplaySignSession({
    batchSignPaths: async (paths) => {
      batchApiCalls += 1
      return paths.map((path) => {
        const url = pathToUrl[path]
        if (!url) return { path, signedUrl: null, error: 'missing' }
        return { path, signedUrl: url, error: null }
      })
    },
    singleSignPath: async (path) => {
      singleApiCalls += 1
      return pathToUrl[path] || null
    },
  })
  return {
    session,
    counts: () => ({
      batchApiCalls: session.stats().batchApiCalls,
      singleApiCalls: session.stats().singleApiCalls,
      localBatch: batchApiCalls,
      localSingle: singleApiCalls,
    }),
  }
}

describe('Phase D thumb-first path collection', () => {
  it('Phase C rows contribute thumbnail_path only — not report.jpg', () => {
    const collected = collectGridDisplayPaths([
      {
        url: 'u/r/photos/p1/report.jpg',
        thumbnail_path: 'u/r/photos/p1/thumb.jpg',
      },
      {
        url: 'u/r/39-123.jpg',
        thumbnail_path: null,
      },
    ])
    assert.deepEqual(collected.paths, [
      'u/r/photos/p1/thumb.jpg',
      'u/r/39-123.jpg',
    ])
    assert.equal(collected.thumbPathCount, 1)
    assert.equal(collected.legacyPathCount, 1)
    assert.ok(!collected.paths.some((p) => p.endsWith('/report.jpg')))
  })

  it('deduplicates repeated paths', () => {
    assert.deepEqual(
      dedupeStoragePaths([
        'u/r/photos/a/thumb.jpg',
        'u/r/photos/a/thumb.jpg',
        'u/r/legacy.jpg',
      ]),
      ['u/r/photos/a/thumb.jpg', 'u/r/legacy.jpg'],
    )
  })
})

describe('Phase D batch grid signing', () => {
  it('signs Phase C thumb but not report during initial hydration', async () => {
    const { session, counts } = mockBatchSession({
      'u/r/photos/p1/thumb.jpg': 'https://signed.example/thumb',
      'u/r/photos/p1/report.jpg': 'https://signed.example/report',
      'u/r/legacy.jpg': 'https://signed.example/legacy',
    })
    const signed = await signSavedPhotoGridRows(
      [
        {
          url: 'u/r/photos/p1/report.jpg',
          thumbnail_path: 'u/r/photos/p1/thumb.jpg',
        },
        { url: 'u/r/legacy.jpg', thumbnail_path: null },
      ],
      {
        session,
        mapRow: (row, index, payload) => ({ id: `id-${index}`, ...payload, url: row.url }),
      },
    )
    assert.equal(signed[0].thumbnailPreview, 'https://signed.example/thumb')
    assert.equal(signed[0].preview, null)
    assert.equal(signed[1].preview, 'https://signed.example/legacy')
    assert.equal(signed[1].thumbnailPreview, null)
    assert.equal(counts().batchApiCalls, 1)
    assert.equal(gridImageSrc(signed[0]), 'https://signed.example/thumb')
    assert.equal(viewerImageSrc(signed[0]), '')
  })

  it('batches grid display paths in one createSignedUrls-style call', async () => {
    const paths = Array.from({ length: 5 }, (_, i) => `u/r/photos/p${i}/thumb.jpg`)
    const map = Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p}`]))
    map['u/r/legacy.jpg'] = 'https://signed.example/legacy'
    const { session, counts } = mockBatchSession(map)
    const rows = [
      ...paths.map((thumb, i) => ({
        url: `u/r/photos/p${i}/report.jpg`,
        thumbnail_path: thumb,
      })),
      { url: 'u/r/legacy.jpg', thumbnail_path: null },
    ]
    await signSavedPhotoGridRows(rows, { session })
    assert.equal(counts().batchApiCalls, 1)
  })

  it('maps per-item batch failures without destroying siblings', () => {
    const mapped = mapSignedUrlResults(
      [
        { path: 'a/thumb.jpg', signedUrl: 'https://ok/a', error: null },
        { path: 'b/thumb.jpg', signedUrl: null, error: 'boom' },
        { path: 'c/legacy.jpg', signedUrl: 'https://ok/c', error: null },
      ],
      ['a/thumb.jpg', 'b/thumb.jpg', 'c/legacy.jpg'],
    )
    assert.equal(mapped.get('a/thumb.jpg'), 'https://ok/a')
    assert.equal(mapped.has('b/thumb.jpg'), false)
    assert.equal(mapped.get('c/legacy.jpg'), 'https://ok/c')
  })

  it('falls back to report sign for one failed thumb without mutating siblings', async () => {
    const { session } = mockBatchSession({
      'u/r/photos/ok/thumb.jpg': 'https://signed.example/ok-thumb',
      'u/r/photos/bad/report.jpg': 'https://signed.example/bad-report',
      // bad thumb intentionally missing
    })
    const signed = await signSavedPhotoGridRows(
      [
        {
          url: 'u/r/photos/ok/report.jpg',
          thumbnail_path: 'u/r/photos/ok/thumb.jpg',
        },
        {
          url: 'u/r/photos/bad/report.jpg',
          thumbnail_path: 'u/r/photos/bad/thumb.jpg',
        },
      ],
      { session },
    )
    assert.equal(signed[0].thumbnailPreview, 'https://signed.example/ok-thumb')
    assert.equal(signed[0].preview, null)
    assert.equal(signed[1].thumbnailPreview, null)
    assert.equal(signed[1].preview, 'https://signed.example/bad-report')
  })

  it('chunks large path lists', () => {
    const paths = Array.from({ length: 5 }, (_, i) => `p${i}`)
    assert.deepEqual(chunkPaths(paths, 2), [['p0', 'p1'], ['p2', 'p3'], ['p4']])
  })
})

describe('Phase D viewer on-demand report signing', () => {
  it('signs report on demand and never returns thumbnail', async () => {
    const { session, counts } = mockBatchSession({
      'u/r/photos/p1/thumb.jpg': 'https://signed.example/thumb',
      'u/r/photos/p1/report.jpg': 'https://signed.example/report',
    })
    const [gridRow] = await signSavedPhotoGridRows(
      [{ url: 'u/r/photos/p1/report.jpg', thumbnail_path: 'u/r/photos/p1/thumb.jpg' }],
      { session },
    )
    assert.equal(viewerImageSrc(gridRow), '')
    const reportUrl = await ensureViewerReportPreview(
      { ...gridRow, storagePath: 'u/r/photos/p1/report.jpg' },
      { session },
    )
    assert.equal(reportUrl, 'https://signed.example/report')
    assert.notEqual(reportUrl, gridRow.thumbnailPreview)
    assert.ok(counts().singleApiCalls >= 1 || counts().batchApiCalls >= 1)
  })

  it('reuses cached report preview across previous/next without re-sign', async () => {
    const { session, counts } = mockBatchSession({
      'u/r/photos/p1/report.jpg': 'https://signed.example/report',
    })
    const first = await ensureViewerReportPreview(
      { storagePath: 'u/r/photos/p1/report.jpg', preview: null },
      { session },
    )
    const before = counts().singleApiCalls + counts().batchApiCalls
    const second = await ensureViewerReportPreview(
      { storagePath: 'u/r/photos/p1/report.jpg', preview: first },
      { session },
    )
    const after = counts().singleApiCalls + counts().batchApiCalls
    assert.equal(first, second)
    assert.equal(after, before)
  })
})

describe('Phase D eager/lazy policy', () => {
  it('durable thumbnails are eager even after global index 12', () => {
    const thumbPhoto = { thumbnailPath: 'u/r/photos/p/thumb.jpg' }
    assert.equal(usesDurableThumbnailForGrid(thumbPhoto), true)
    assert.equal(shouldEagerLoadSavedReviewThumb(thumbPhoto, 48), true)
    assert.equal(shouldEagerLoadSavedReviewThumb(thumbPhoto, 0), true)
  })

  it('legacy rows stay conservatively eager only for the first N', () => {
    const legacy = { thumbnailPath: null, url: 'u/r/1-123.jpg' }
    assert.equal(shouldEagerLoadSavedReviewThumb(legacy, 0), true)
    assert.equal(shouldEagerLoadSavedReviewThumb(legacy, 11), true)
    assert.equal(shouldEagerLoadSavedReviewThumb(legacy, 12), false)
  })

  it('mixed diary: late Phase C thumb eager, late legacy lazy', () => {
    const lateThumb = { thumbnail_path: 'u/r/photos/p/thumb.jpg' }
    const lateLegacy = { thumbnail_path: null, url: 'u/r/40-1.jpg' }
    assert.equal(shouldEagerLoadSavedReviewThumb(lateThumb, 40, { photoCount: 50 }), true)
    assert.equal(shouldEagerLoadSavedReviewThumb(lateLegacy, 40, { photoCount: 50 }), false)
  })
})

describe('Phase D source safety + wiring', () => {
  it('never places bare storage paths in grid/viewer helpers', () => {
    assert.equal(isBrowserDisplaySrc('u/r/photos/p/thumb.jpg'), false)
    assert.equal(
      gridImageSrc({
        thumbnailPath: 'u/r/photos/p/thumb.jpg',
        thumbnailPreview: null,
        preview: null,
      }),
      '',
    )
  })

  it('CaptureThumbnailGrid uses photo-aware eager helper', () => {
    assert.match(gridSrc, /shouldEagerLoadSavedReviewThumb\(photo/)
    assert.match(gridSrc, /objectFit:\s*'contain'/)
  })

  it('CapturePhotoPreview resolves report on demand', () => {
    assert.match(previewSrc, /ensureReportPreview/)
    assert.match(previewSrc, /viewerImageSrc/)
    assert.doesNotMatch(previewSrc, /thumbnailPreview/)
  })

  it('diary hydrate uses createSignedUrls batch session + grid rows helper', () => {
    assert.match(diaryPage, /createSignedUrls/)
    assert.match(diaryPage, /signSavedPhotoGridRows/)
    assert.match(diaryPage, /createPhotoDisplaySignSession/)
    assert.match(diaryPage, /ensureReportPreviewForViewer/)
  })
})
