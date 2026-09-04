/**
 * Prepared work-photo PDF pass-through vs legacy bake.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDF_PHOTO_PREPARE_CONCURRENCY, buildDiaryPdfPhotos } from './diary-pdf-photos.js'
import { ZLOG_PHOTO_PIPELINE_ID } from './photo-workspace/image-pipeline.js'
import {
  flushShareTimingSnapshot,
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const photosSrc = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makePreparedPhotos(count) {
  return Array.from({ length: count }, (_, i) => ({
    url: `user/r/photos/p${i}/report.jpg`,
    caption: `Prepared ${i}`,
    layout: 'grid4',
    sequence: i + 1,
    rotation_degrees: 0,
    processing_version: ZLOG_PHOTO_PIPELINE_ID,
  }))
}

describe('prepared work-photo PDF pass-through', () => {
  it('keeps concurrency 9 and still has a legacy flatten path', () => {
    assert.equal(PDF_PHOTO_PREPARE_CONCURRENCY, 9)
    assert.match(photosSrc, /flattenPhotoSrcForPdf/)
    assert.match(photosSrc, /isPreparedWorkPhotoForPdfPassThrough/)
    assert.match(photosSrc, /coverBlobToPdfDataUrl/)
    assert.match(shareSrc, /localPreparedPhotoSources/)
    assert.match(shareSrc, /processing_version/)
  })

  it('uses pass-through with zero bake for newly prepared rotation-0 photos', async () => {
    startShareTimingRun({ reportId: 'rep-pass' })
    const photos = [
      {
        url: 'user/r/photos/p1/report.jpg',
        caption: 'Rotated in edit, then saved',
        layout: 'grid4',
        sequence: 1,
        rotation_degrees: 0,
        processing_version: ZLOG_PHOTO_PIPELINE_ID,
      },
    ]
    const local = new Map([
      [photos[0].url, new Blob(['CANONICAL-JPEG'], { type: 'image/jpeg' })],
    ])
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => {
        throw new Error('must-not-sign')
      },
      { localPreparedPhotoSources: local },
    )
    assert.equal(rows.length, 1)
    assert.match(rows[0].src, /^data:image\//)
    assert.equal(rows[0].rotationDegrees, 0)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoBakeCount, 0)
    assert.equal(counts.photoPassThroughCount, 1)
    assert.equal(counts.photoNetworkFetchCount, 0)
  })

  it('legacy non-zero rotation still uses the bake/fallback path', async () => {
    startShareTimingRun({ reportId: 'rep-legacy' })
    const photos = [
      {
        url: 'user/r/photos/legacy/report.jpg',
        caption: 'Legacy',
        layout: 'full',
        sequence: 1,
        rotation_degrees: 90,
      },
    ]
    const rows = await buildDiaryPdfPhotos(
      photos,
      async () => 'https://legacy.example/p.jpg',
      {
        batchSignStoragePaths: async (paths) => ({
          urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
          batchRequestCount: 1,
        }),
      },
    )
    assert.equal(rows[0].src, 'https://signed.example/user/r/photos/legacy/report.jpg')
    assert.equal(rows[0].rotationDegrees, 90)
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoPassThroughCount, 0)
  })

  it('runs 9 prepared photos at 9 concurrent workers and keeps pass-through', async () => {
    startShareTimingRun({ reportId: 'prep-conc-9' })
    let inFlight = 0
    let maxInFlight = 0
    const photos = makePreparedPhotos(9)
    const rows = await buildDiaryPdfPhotos(photos, async (photo) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await sleep(40)
      inFlight -= 1
      return `https://example.test/${photo.url}`
    })
    assert.equal(rows.length, 9)
    assert.equal(maxInFlight, 9)
    assert.deepEqual(
      rows.map((row) => row.url),
      photos.map((photo) => photo.url),
    )
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoPassThroughCount, 9)
    assert.equal(counts.photoBakeCount, 0)
  })

  it('caps prepared-photo workers at 9 when more than 9 photos are present', async () => {
    startShareTimingRun({ reportId: 'prep-conc-12' })
    let inFlight = 0
    let maxInFlight = 0
    const photos = makePreparedPhotos(12)
    const rows = await buildDiaryPdfPhotos(photos, async (photo) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await sleep(40)
      inFlight -= 1
      return `https://example.test/${photo.url}`
    })
    assert.equal(rows.length, 12)
    assert.equal(maxInFlight, 9)
    assert.deepEqual(
      rows.map((row) => row.url),
      photos.map((photo) => photo.url),
    )
    flushShareTimingSnapshot()
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.photoPassThroughCount, 12)
    assert.equal(counts.photoBakeCount, 0)
  })

  it('still batch-signs prepared photos once for 9 and for 12', async () => {
    async function run(count) {
      startShareTimingRun({ reportId: `prep-batch-${count}` })
      let batchCalls = 0
      let batchedPaths = null
      const photos = makePreparedPhotos(count)
      const rows = await buildDiaryPdfPhotos(
        photos,
        async () => {
          throw new Error('must not individual-sign')
        },
        {
          batchSignStoragePaths: async (paths) => {
            batchCalls += 1
            batchedPaths = paths
            return {
              urlByPath: new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
              batchRequestCount: 1,
            }
          },
        },
      )
      flushShareTimingSnapshot()
      const counts = getShareTimingSnapshot().counts
      return { rows, batchCalls, batchedPaths, counts }
    }

    const nine = await run(9)
    assert.equal(nine.batchCalls, 1)
    assert.equal(nine.batchedPaths.length, 9)
    assert.equal(nine.rows.length, 9)
    assert.equal(nine.counts.photoSignBatchRequestCount, 1)
    assert.equal(nine.counts.photoIndividualSignRequestCount, 0)
    assert.equal(nine.counts.photoPassThroughCount, 9)
    assert.equal(nine.counts.photoBakeCount, 0)

    const twelve = await run(12)
    assert.equal(twelve.batchCalls, 1)
    assert.equal(twelve.batchedPaths.length, 12)
    assert.equal(twelve.rows.length, 12)
    assert.equal(twelve.counts.photoSignBatchRequestCount, 1)
    assert.equal(twelve.counts.photoIndividualSignRequestCount, 0)
    assert.equal(twelve.counts.photoPassThroughCount, 12)
    assert.equal(twelve.counts.photoBakeCount, 0)
  })
})
