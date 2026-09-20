import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  preloadPhaseCWorkPhotoSourcesWithDownload,
  mapWithBoundedConcurrency,
  SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY,
} from './preload-phase-c-work-photos-logic.js'
import { ZLOG_PHOTO_PIPELINE_ID } from '../photo-workspace/persist-prepared-photo.js'

const root = join(import.meta.dirname, '..', '..')

function preparedRow(path, sequence) {
  return {
    url: path,
    sequence,
    processing_version: ZLOG_PHOTO_PIPELINE_ID,
    rotation_degrees: 0,
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('preloadPhaseCWorkPhotoSources', () => {
  it('A — server Storage downloads never exceed concurrency 8', async () => {
    let inflight = 0
    let maxInflight = 0
    const paths = Array.from({ length: 20 }, (_, i) => `user/r/photos/p${i}/report.jpg`)
    const rows = paths.map((p, i) => preparedRow(p, i + 1))

    const downloadFn = async () => {
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      await delay(30)
      inflight -= 1
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    }

    const result = await preloadPhaseCWorkPhotoSourcesWithDownload(
      {},
      rows,
      { downloadFn, concurrency: SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY },
    )

    assert.equal(result.downloadJobCount, 20)
    assert.ok(maxInflight <= SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY)
    assert.equal(result.localPrepared.size, 20)
  })

  it('B — out-of-order completion preserves path mapping for ordered rows', async () => {
    const paths = ['a/report.jpg', 'b/report.jpg', 'c/report.jpg']
    const rows = paths.map((p, i) => preparedRow(p, i + 1))
    const completionOrder = []

    const downloadFn = async (_admin, path) => {
      const wait = path.startsWith('a/') ? 50 : path.startsWith('b/') ? 10 : 30
      await delay(wait)
      completionOrder.push(path)
      const tag = path.charCodeAt(0)
      return new Blob([new Uint8Array([tag])], { type: 'image/jpeg' })
    }

    const result = await preloadPhaseCWorkPhotoSourcesWithDownload({}, rows, { downloadFn, concurrency: 3 })
    assert.deepEqual(
      [...result.localPrepared.keys()],
      paths,
    )
    assert.notDeepEqual(completionOrder, paths)
    for (const p of paths) {
      const blob = result.localPrepared.get(p)
      assert.ok(blob instanceof Blob)
      assert.equal(blob.size, 1)
      const buf = new Uint8Array(await blob.arrayBuffer())
      assert.equal(buf[0], p.charCodeAt(0))
    }
  })

  it('C — all prepared rows produce map entries for buildDiaryPdfPhotos', async () => {
    const rows = [preparedRow('u/r/p1/report.jpg', 1), preparedRow('u/r/p2/report.jpg', 2)]
    const downloadFn = async () => new Blob([new Uint8Array([9])], { type: 'image/jpeg' })
    const result = await preloadPhaseCWorkPhotoSourcesWithDownload({}, rows, { downloadFn })
    assert.equal(result.localPrepared.size, 2)
    assert.equal(result.photoCount, 2)
  })

  it('D — failed download does not cross-associate another photo blob', async () => {
    const rows = [
      preparedRow('good/report.jpg', 1),
      preparedRow('bad/report.jpg', 2),
      preparedRow('good2/report.jpg', 3),
    ]
    const downloadFn = async (_admin, path) => {
      if (path === 'bad/report.jpg') return null
      return new Blob([new Uint8Array([path === 'good/report.jpg' ? 1 : 2])], { type: 'image/jpeg' })
    }
    const result = await preloadPhaseCWorkPhotoSourcesWithDownload({}, rows, { downloadFn, concurrency: 2 })
    assert.equal(result.localPrepared.size, 2)
    assert.ok(result.localPrepared.has('good/report.jpg'))
    assert.ok(result.localPrepared.has('good2/report.jpg'))
    assert.equal(result.localPrepared.has('bad/report.jpg'), false)
    const g1 = new Uint8Array(await result.localPrepared.get('good/report.jpg').arrayBuffer())
    const g2 = new Uint8Array(await result.localPrepared.get('good2/report.jpg').arrayBuffer())
    assert.equal(g1[0], 1)
    assert.equal(g2[0], 2)
  })

  it('mapWithBoundedConcurrency preserves result order by index', async () => {
    const out = await mapWithBoundedConcurrency([1, 2, 3, 4], 2, async (n, i) => {
      await delay((4 - i) * 5)
      return n * 10
    })
    assert.deepEqual(out, [10, 20, 30, 40])
  })
})

describe('completeness contract', () => {
  it('E — server PDF route still enforces assertDiaryPdfPhotosComplete before render', () => {
    const route = readFileSync(join(root, 'app/api/site-diary/[reportId]/pdf/route.js'), 'utf8')
    assert.match(route, /assertDiaryPdfPhotosComplete/)
    assert.match(route, /renderSiteDiaryPdfBuffer/)
    const postAssembly = route.slice(route.indexOf('const assembled = await assembleSiteDiaryPdfDocumentProps'))
    assert.match(postAssembly, /assertDiaryPdfPhotosComplete/)
    assert.match(postAssembly, /renderSiteDiaryPdfBuffer/)
    assert.ok(postAssembly.indexOf('assertDiaryPdfPhotosComplete') < postAssembly.indexOf('renderSiteDiaryPdfBuffer'))
  })
})

describe('client PDF path unaffected', () => {
  it('F — prepareSiteDiaryPdf does not import server preload module', () => {
    const share = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
    assert.doesNotMatch(share, /preload-phase-c-work-photos/)
    assert.doesNotMatch(share, /preloadPhaseCWorkPhotoSources/)
    assert.match(share, /buildDiaryPdfPhotos/)
  })

  it('F — assemble remains server-only entry for preload', () => {
    const assemble = readFileSync(join(root, 'lib/server/assemble-site-diary-pdf-props.js'), 'utf8')
    assert.match(assemble, /preloadPhaseCWorkPhotoSources/)
    assert.doesNotMatch(assemble, /for \(const photo of photoRows\)[\s\S]{0,120}downloadSitePhotoBlob/)
  })
})
