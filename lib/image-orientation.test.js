/**
 * PDF cover orientation — browser-display flatten + asymmetric corner markers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  asymmetricCornerMarkersMatch,
  simulateWrongExif6Rotation,
  uprightSizeForOrientation,
} from './image-orientation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const orientSrc = readFileSync(join(root, 'lib/image-orientation.js'), 'utf8')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')

function makeMarkedPortraitBuffer(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (x === 0 && y === 0) {
        pixels[i] = 255
        pixels[i + 1] = 0
        pixels[i + 2] = 0
      } else if (x === width - 1 && y === 0) {
        pixels[i] = 0
        pixels[i + 1] = 255
        pixels[i + 2] = 0
      } else if (x === 0 && y === height - 1) {
        pixels[i] = 0
        pixels[i + 1] = 0
        pixels[i + 2] = 255
      } else if (x === width - 1 && y === height - 1) {
        pixels[i] = 255
        pixels[i + 1] = 255
        pixels[i + 2] = 0
      } else {
        pixels[i] = 240
        pixels[i + 1] = 240
        pixels[i + 2] = 240
      }
      pixels[i + 3] = 255
    }
  }
  return pixels
}

function simulate180Rotation(pixels, width, height) {
  const out = new Uint8ClampedArray(pixels.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4
      const dstX = width - 1 - x
      const dstY = height - 1 - y
      const dst = (dstY * width + dstX) * 4
      out[dst] = pixels[src]
      out[dst + 1] = pixels[src + 1]
      out[dst + 2] = pixels[src + 2]
      out[dst + 3] = pixels[src + 3]
    }
  }
  return out
}

function simulateHorizontalMirror(pixels, width, height) {
  const out = new Uint8ClampedArray(pixels.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4
      const dstX = width - 1 - x
      const dst = (y * width + dstX) * 4
      out[dst] = pixels[src]
      out[dst + 1] = pixels[src + 1]
      out[dst + 2] = pixels[src + 2]
      out[dst + 3] = pixels[src + 3]
    }
  }
  return out
}

describe('asymmetric corner markers — rotation detection', () => {
  it('accepts upright portrait markers at all four corners', () => {
    const w = 40
    const h = 60
    const pixels = makeMarkedPortraitBuffer(w, h)
    assert.equal(asymmetricCornerMarkersMatch(pixels, w, h), true)
  })

  it('rejects a simulated wrong 90° manual EXIF-6 rotation', () => {
    const w = 40
    const h = 60
    const pixels = makeMarkedPortraitBuffer(w, h)
    const wrong = simulateWrongExif6Rotation(pixels, w, h)
    assert.equal(asymmetricCornerMarkersMatch(wrong.pixels, wrong.width, wrong.height), false)
  })

  it('rejects a simulated 180° rotation', () => {
    const w = 40
    const h = 60
    const pixels = makeMarkedPortraitBuffer(w, h)
    const rotated = simulate180Rotation(pixels, w, h)
    assert.equal(asymmetricCornerMarkersMatch(rotated, w, h), false)
  })

  it('rejects a simulated horizontal mirror', () => {
    const w = 40
    const h = 60
    const pixels = makeMarkedPortraitBuffer(w, h)
    const mirrored = simulateHorizontalMirror(pixels, w, h)
    assert.equal(asymmetricCornerMarkersMatch(mirrored, w, h), false)
  })

  it('portrait EXIF 6 display size is taller than wide after browser correction', () => {
    const upright = uprightSizeForOrientation(4032, 3024, 6)
    assert.ok(upright.height > upright.width)
  })
})

describe('PDF cover path — browser-display flatten (not manual EXIF rotate)', () => {
  it('uses orientedImageToDataUrlForPdf with decodeBrowserDisplayImage', () => {
    assert.match(orientSrc, /export async function decodeBrowserDisplayImage/)
    assert.match(orientSrc, /export async function orientedImageToDataUrlForPdf/)
    assert.match(orientSrc, /browser-display flatten/)
    const pdfBakeStart = orientSrc.indexOf('export async function orientedImageToDataUrlForPdf')
    const pdfBakeEnd = orientSrc.indexOf('\nexport async function orientedImageToDataUrl(', pdfBakeStart)
    const pdfBakeBody = orientSrc.slice(pdfBakeStart, pdfBakeEnd)
    assert.match(pdfBakeBody, /decodeBrowserDisplayImage/)
    assert.match(pdfBakeBody, /ctx\.drawImage\(source, 0, 0, outW, outH\)/)
    assert.match(pdfBakeBody, /bakedManualOrientation: false/)
    assert.doesNotMatch(pdfBakeBody, /drawOriented/)
    assert.doesNotMatch(orientSrc, /zlog-pdf-trace/)
  })

  it('prepare path bakes cover through uprightCoverSrcForPdf before PDF embed', () => {
    assert.match(shareSrc, /flattenCoverBlobForPdf/)
    assert.match(shareSrc, /orientedImageToDataUrlForPdf/)
    assert.match(shareSrc, /export async function uprightCoverSrcForPdf/)
    assert.match(shareSrc, /coverPhotoUrl = await uprightCoverSrcForPdf\(/)
    assert.doesNotMatch(shareSrc, /decodeBrowserDisplayImage/)
    assert.doesNotMatch(shareSrc, /orientedImageToDataUrl\(/)
    assert.match(shareSrc, /throw new Error\('Could not normalize cover photo orientation for the PDF\.'\)/)
    assert.doesNotMatch(shareSrc, /zlog-pdf-trace/)
    assert.doesNotMatch(
      shareSrc,
      /uprightCoverSrcForPdf[\s\S]*?catch\s*\{[\s\S]*?return raw/,
      'must not silently fall back to the raw signed URL when bake fails',
    )
  })
})

describe('PDF work photo path — same flatten as cover', () => {
  it('buildDiaryPdfPhotos wires shared orientedImageToDataUrlForPdf', () => {
    const photosSrc = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')
    assert.match(photosSrc, /orientedImageToDataUrlForPdf/)
    assert.match(photosSrc, /flattenPhotoSrcForPdf/)
  })
})
