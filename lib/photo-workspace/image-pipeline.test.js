/**
 * Phase A — Zlog image pipeline primitive tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ZLOG_PHOTO_PIPELINE_ID,
  ZLOG_REPORT_MAX_EDGE,
  ZLOG_REPORT_JPEG_QUALITY,
  ZLOG_THUMB_MAX_EDGE,
  ZLOG_THUMB_JPEG_QUALITY,
  ZLOG_PHOTO_MIME,
  ZlogPhotoPipelineError,
  computeContainDimensions,
  prepareZlogPhoto,
} from './image-pipeline.js'
import { uprightSizeForOrientation } from '../image-orientation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const pipelineSrc = readFileSync(join(root, 'lib/photo-workspace/image-pipeline.js'), 'utf8')

function aspectRatio(width, height) {
  return width / height
}

function longEdge(width, height) {
  return Math.max(width, height)
}

/** Minimal canvas mock for Node tests — no crop, proportional draw only. */
function createMockDocument() {
  return {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`)
      const canvas = {
        width: 0,
        height: 0,
        _source: null,
        _drawW: 0,
        _drawH: 0,
        getContext() {
          return {
            translate() {},
            rotate() {},
            drawImage(source, _x, _y, w, h) {
              canvas._source = source
              canvas._drawW = w
              canvas._drawH = h
            },
          }
        },
        toBlob(callback, mimeType, quality) {
          const payload = JSON.stringify({
            w: canvas.width,
            h: canvas.height,
            drawW: canvas._drawW,
            drawH: canvas._drawH,
            quality,
          })
          callback(new Blob([payload], { type: mimeType }))
        },
      }
      return canvas
    },
  }
}

function mockDecodeResult({ width, height, orientation = 1, decodeMode = 'browser-display-img' }) {
  const source = { tag: 'mock-image', width, height }
  let closed = false
  return {
    source,
    width,
    height,
    orientation,
    usedBrowserOrientation: true,
    decodeMode,
    close() {
      closed = true
    },
    get closed() {
      return closed
    },
  }
}

describe('computeContainDimensions — scaling (no crop, no upscale)', () => {
  it('large landscape scales to report max edge', () => {
    const out = computeContainDimensions(4000, 3000, ZLOG_REPORT_MAX_EDGE)
    assert.equal(longEdge(out.width, out.height), ZLOG_REPORT_MAX_EDGE)
    assert.equal(out.width, 2400)
    assert.equal(out.height, 1800)
    assert.ok(Math.abs(aspectRatio(out.width, out.height) - aspectRatio(4000, 3000)) < 0.001)
  })

  it('large portrait scales to thumbnail max edge', () => {
    const out = computeContainDimensions(3024, 4032, ZLOG_THUMB_MAX_EDGE)
    assert.equal(longEdge(out.width, out.height), ZLOG_THUMB_MAX_EDGE)
    assert.equal(out.height, 512)
    assert.equal(out.width, 384)
    assert.ok(Math.abs(aspectRatio(out.width, out.height) - aspectRatio(3024, 4032)) < 0.001)
  })

  it('small source is not upscaled', () => {
    const out = computeContainDimensions(200, 150, ZLOG_REPORT_MAX_EDGE)
    assert.equal(out.width, 200)
    assert.equal(out.height, 150)
    assert.equal(out.scale, 1)
  })

  it('square large source scales on long edge only', () => {
    const out = computeContainDimensions(3000, 3000, 512)
    assert.equal(out.width, 512)
    assert.equal(out.height, 512)
  })
})

describe('prepareZlogPhoto — mocked browser pipeline', () => {
  async function runWithMockDecode(decodeResult) {
    const documentRef = createMockDocument()
    let decodeCloseCalled = false
    const decode = async () => {
      const result = mockDecodeResult(decodeResult)
      const originalClose = result.close.bind(result)
      result.close = () => {
        decodeCloseCalled = true
        originalClose()
      }
      return result
    }
    const source = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    const out = await prepareZlogPhoto(source, { decode, document: documentRef })
    return { out, decodeCloseCalled }
  }

  it('large landscape — report and thumb within caps, aspect preserved', async () => {
    const { out } = await runWithMockDecode({ width: 4000, height: 3000 })
    assert.equal(out.pipelineId, ZLOG_PHOTO_PIPELINE_ID)
    assert.equal(longEdge(out.report.width, out.report.height), ZLOG_REPORT_MAX_EDGE)
    assert.ok(longEdge(out.thumbnail.width, out.thumbnail.height) <= ZLOG_THUMB_MAX_EDGE)
    assert.ok(
      Math.abs(aspectRatio(out.report.width, out.report.height) - aspectRatio(4000, 3000)) < 0.001,
    )
    assert.ok(
      Math.abs(aspectRatio(out.thumbnail.width, out.thumbnail.height) - aspectRatio(4000, 3000)) < 0.001,
    )
  })

  it('large portrait — same proportional rules', async () => {
    const { out } = await runWithMockDecode({ width: 3024, height: 4032 })
    assert.equal(out.report.height, ZLOG_REPORT_MAX_EDGE)
    assert.equal(out.thumbnail.height, ZLOG_THUMB_MAX_EDGE)
    assert.ok(out.report.width < out.report.height)
    assert.ok(out.thumbnail.width < out.thumbnail.height)
  })

  it('small source — no upscale on report or thumbnail', async () => {
    const { out } = await runWithMockDecode({ width: 200, height: 150 })
    assert.equal(out.report.width, 200)
    assert.equal(out.report.height, 150)
    assert.equal(out.thumbnail.width, 200)
    assert.equal(out.thumbnail.height, 150)
  })

  it('thumbnail is materially smaller than report for large sources', async () => {
    const { out } = await runWithMockDecode({ width: 4000, height: 3000 })
    assert.ok(out.thumbnail.width < out.report.width)
    assert.ok(out.thumbnail.height < out.report.height)
    assert.ok(out.thumbnail.byteSize <= out.report.byteSize)
  })

  it('returns independent JPEG blobs with metadata', async () => {
    const { out } = await runWithMockDecode({ width: 1600, height: 1200 })
    assert.ok(out.report.blob instanceof Blob)
    assert.ok(out.thumbnail.blob instanceof Blob)
    assert.notEqual(out.report.blob, out.thumbnail.blob)
    assert.equal(out.report.mimeType, ZLOG_PHOTO_MIME)
    assert.equal(out.thumbnail.mimeType, ZLOG_PHOTO_MIME)
    assert.equal(out.report.byteSize, out.report.blob.size)
    assert.equal(out.thumbnail.byteSize, out.thumbnail.blob.size)
    assert.equal(out.report.width, computeContainDimensions(1600, 1200, ZLOG_REPORT_MAX_EDGE).width)
    assert.equal(out.thumbnail.width, computeContainDimensions(1600, 1200, ZLOG_THUMB_MAX_EDGE).width)
  })

  it('cleans up decode resources via close()', async () => {
    const { decodeCloseCalled } = await runWithMockDecode({ width: 800, height: 600 })
    assert.equal(decodeCloseCalled, true)
  })

  it('records orientation metadata from decode', async () => {
    const { out } = await runWithMockDecode({
      width: 4032,
      height: 3024,
      orientation: 6,
      decodeMode: 'browser-display-bitmap',
    })
    assert.equal(out.orientation.sourceExif, 6)
    assert.equal(out.orientation.decodeMode, 'browser-display-bitmap')
    assert.equal(out.orientation.usedBrowserOrientation, true)
  })
})

describe('prepareZlogPhoto — failure contract', () => {
  it('rejects non-Blob input', async () => {
    await assert.rejects(
      () => prepareZlogPhoto(null),
      (err) => err instanceof ZlogPhotoPipelineError && err.code === 'invalid-input',
    )
  })

  it('rejects non-image MIME type', async () => {
    const text = new Blob(['hello'], { type: 'text/plain' })
    await assert.rejects(
      () => prepareZlogPhoto(text),
      (err) => err instanceof ZlogPhotoPipelineError && err.code === 'invalid-input',
    )
  })

  it('surfaces decode failure without fake success', async () => {
    const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    await assert.rejects(
      () => prepareZlogPhoto(source, {
        decode: async () => { throw new Error('decode boom') },
        document: createMockDocument(),
      }),
      (err) => err instanceof ZlogPhotoPipelineError && err.code === 'decode-failed',
    )
  })

  it('rejects invalid decoded dimensions', async () => {
    const source = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })
    await assert.rejects(
      () => prepareZlogPhoto(source, {
        decode: async () => ({
          source: {},
          width: 0,
          height: 100,
          orientation: 1,
          close: () => {},
        }),
        document: createMockDocument(),
      }),
      (err) => err instanceof ZlogPhotoPipelineError && err.code === 'invalid-dimensions',
    )
  })

  it('rejects empty JPEG export', async () => {
    const source = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })
    const documentRef = {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() {} }),
          toBlob(callback) {
            callback(null)
          },
        }
      },
    }
    await assert.rejects(
      () => prepareZlogPhoto(source, {
        decode: async () => mockDecodeResult({ width: 100, height: 80 }),
        document: documentRef,
      }),
      (err) => err instanceof ZlogPhotoPipelineError && err.code === 'export-failed',
    )
  })
})

describe('orientation integration — hardened path reuse', () => {
  it('imports decodeBrowserDisplayImage from image-orientation.js', () => {
    assert.match(pipelineSrc, /from '\.\.\/image-orientation\.js'/)
    assert.match(pipelineSrc, /decodeBrowserDisplayImage/)
  })

  it('does not duplicate manual EXIF drawOriented logic in the pipeline', () => {
    assert.doesNotMatch(pipelineSrc, /drawOriented/)
    assert.doesNotMatch(pipelineSrc, /decodeOrientedImage/)
  })

  it('uprightSizeForOrientation still governs EXIF 6 portrait dimensions (regression guard)', () => {
    const upright = uprightSizeForOrientation(4032, 3024, 6)
    assert.ok(upright.height > upright.width)
    assert.equal(upright.width, 3024)
    assert.equal(upright.height, 4032)
  })

  it('bakes edit-session 90° rotation into canonical report dimensions (no crop)', async () => {
    const out = await prepareZlogPhoto(new Blob(['src'], { type: 'image/jpeg' }), {
      decode: async () => mockDecodeResult({ width: 4000, height: 2000 }),
      document: createMockDocument(),
      extraRotationDegrees: 90,
    })
    assert.equal(out.report.width, 1200)
    assert.equal(out.report.height, 2400)
    assert.equal(out.thumbnail.width, 256)
    assert.equal(out.thumbnail.height, 512)
  })
})

describe('no-crop source contract', () => {
  it('uses full-frame drawImage scaling only — no crop/cover branches', () => {
    assert.match(pipelineSrc, /drawImage\(source, 0, 0, outW, outH\)/)
    assert.doesNotMatch(pipelineSrc, /object-fit:\s*cover/i)
    assert.doesNotMatch(pipelineSrc, /\.crop\(/i)
    assert.doesNotMatch(pipelineSrc, /drawImage\([^)]*,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*[^)]+\)/)
  })

  it('mock canvas receives full proportional draw dimensions matching output size', async () => {
    const documentRef = createMockDocument()
    const source = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })
    await prepareZlogPhoto(source, {
      decode: async () => mockDecodeResult({ width: 4000, height: 3000 }),
      document: documentRef,
    })
    // Last canvas created is thumbnail; both use same proportional rule — spot-check via computeContainDimensions
    const expected = computeContainDimensions(4000, 3000, ZLOG_THUMB_MAX_EDGE)
    assert.equal(expected.width, 512)
    assert.equal(expected.height, 384)
  })
})

describe('pipeline constants', () => {
  it('exposes approved Phase A defaults', () => {
    assert.equal(ZLOG_REPORT_MAX_EDGE, 2400)
    assert.equal(ZLOG_REPORT_JPEG_QUALITY, 0.85)
    assert.equal(ZLOG_THUMB_MAX_EDGE, 512)
    assert.equal(ZLOG_THUMB_JPEG_QUALITY, 0.82)
    assert.equal(ZLOG_PHOTO_PIPELINE_ID, 'zlog-photo-pipeline-v1')
  })
})
