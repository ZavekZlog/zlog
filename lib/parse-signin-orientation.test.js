/**
 * Sign-in sheet image prep — deterministic EXIF flatten (preview = persist = OCR).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyExifOrientationToPixelBuffer,
  asymmetricCornerMarkersMatch,
  browserOrientationLooksUnapplied,
  exifBakeNeedsManualTransform,
  exifCanvasTransformParams,
  exifDestToSourceCoords,
  exifPostDecodeRotationClockwise,
  exifSwapAlreadyAppliedInDecodedBitmap,
  uprightSizeForOrientation,
} from './sign-in-image-preparation.js'
import { rotateRgbaBufferClockwise } from './sign-in-decode-rotation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const parseSheet = readFileSync(join(root, 'lib/parse-signin-sheet.js'), 'utf8')
const signInPrepSrc = readFileSync(join(root, 'lib/sign-in-image-preparation.js'), 'utf8')
const providerSrc = readFileSync(join(root, 'lib/sign-in-ocr-provider.js'), 'utf8')
const labourHook = readFileSync(
  join(root, 'components/diary/useSiteDiaryLabour.js'),
  'utf8',
)

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

function synthesizeRawSensorFromUpright(uprightPixels, uprightW, uprightH, orientation) {
  const sensorW = orientation >= 5 && orientation <= 8 ? uprightH : uprightW
  const sensorH = orientation >= 5 && orientation <= 8 ? uprightW : uprightH
  const raw = new Uint8ClampedArray(sensorW * sensorH * 4)
  for (let dy = 0; dy < uprightH; dy += 1) {
    for (let dx = 0; dx < uprightW; dx += 1) {
      const [sx, sy] = exifDestToSourceCoords(orientation, dx, dy, sensorW, sensorH)
      const upI = (dy * uprightW + dx) * 4
      const rawI = (sy * sensorW + sx) * 4
      raw[rawI] = uprightPixels[upI]
      raw[rawI + 1] = uprightPixels[upI + 1]
      raw[rawI + 2] = uprightPixels[upI + 2]
      raw[rawI + 3] = uprightPixels[upI + 3]
    }
  }
  return { pixels: raw, width: sensorW, height: sensorH }
}

function scaleContain(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function bakeBody() {
  return parseSheet.slice(parseSheet.indexOf('export async function fileToVisionPreparedImage'))
}

function signInPrepBakeBody() {
  const start = signInPrepSrc.indexOf('export async function prepareSignInImageToDataUrl(')
  const marker = signInPrepSrc.indexOf('bakedManualOrientation: needsManualTransform', start)
  assert.ok(start >= 0 && marker > start)
  return signInPrepSrc.slice(start, marker + 120)
}

describe('Sign-in vision bake — explicit EXIF flatten', () => {
  it('uses prepareSignInImageToDataUrl with exifBake decode and canonical drawOriented transforms', () => {
    const bake = bakeBody()
    assert.match(bake, /prepareSignInImageToDataUrl\(file, maxEdge, quality\)/)
    assert.doesNotMatch(bake, /image-orientation/)
    assert.doesNotMatch(bake, /orientedImageToDataUrl/)
    assert.match(signInPrepBakeBody(), /exifBake: true/)
    assert.match(signInPrepBakeBody(), /exifBakeNeedsManualTransform/)
    assert.match(signInPrepSrc, /exifCanvasTransformParams/)
    assert.match(signInPrepSrc, /imageOrientation: 'none'/)
    assert.match(signInPrepSrc, /if \(!exifBake\)/)
  })

  it('Galaxy S10 landscape-held capture: browser leaves raw landscape bitmap for EXIF 6', () => {
    assert.equal(browserOrientationLooksUnapplied(6, 4032, 3024), true)
    assert.equal(
      exifBakeNeedsManualTransform(3, { decodeMode: 'browser-oriented', usedBrowserOrientation: true }),
      false,
    )
    assert.equal(
      exifBakeNeedsManualTransform(3, { decodeMode: 'exif-bake-raw', usedBrowserOrientation: false }),
      true,
    )
  })

  it('REAL S10 tuple — EXIF 6, raw 4032x3024, decoded 3024x4032: no second EXIF bake', () => {
    assert.equal(
      exifSwapAlreadyAppliedInDecodedBitmap(6, 4032, 3024, 3024, 4032),
      true,
    )
    assert.equal(
      exifBakeNeedsManualTransform(6, {
        decodeMode: 'exif-bake-raw',
        usedBrowserOrientation: false,
        storedWidth: 4032,
        storedHeight: 3024,
        decodedWidth: 3024,
        decodedHeight: 4032,
      }),
      false,
    )
    const upright = makeMarkedPortraitBuffer(40, 60)
    const wrongSecondBake = applyExifOrientationToPixelBuffer(upright, 40, 60, 6)
    assert.equal(asymmetricCornerMarkersMatch(wrongSecondBake.pixels, wrongSecondBake.width, wrongSecondBake.height), false)
  })

  it('REAL S10 tuple — production post-decode -90° (270° CW) matches diagnostic D', () => {
    const s10Opts = {
      decodeMode: 'exif-bake-raw',
      usedBrowserOrientation: false,
      storedWidth: 4032,
      storedHeight: 3024,
      decodedWidth: 3024,
      decodedHeight: 4032,
    }
    assert.equal(exifPostDecodeRotationClockwise(6, 4032, 3024, 3024, 4032, s10Opts), 270)
    assert.match(signInPrepBakeBody(), /rotateDecodedCanvasClockwise/)
    assert.match(signInPrepBakeBody(), /exifPostDecodeRotationClockwise/)

    const landscapeW = 60
    const landscapeH = 40
    const uprightLandscape = makeMarkedPortraitBuffer(landscapeW, landscapeH)
    const decodedA = rotateRgbaBufferClockwise(uprightLandscape, landscapeW, landscapeH, 90)
    assert.equal(decodedA.width, 40)
    assert.equal(decodedA.height, 60)
    assert.equal(asymmetricCornerMarkersMatch(decodedA.pixels, decodedA.width, decodedA.height), false)

    const candidateA = rotateRgbaBufferClockwise(decodedA.pixels, decodedA.width, decodedA.height, 0)
    const candidateB = rotateRgbaBufferClockwise(decodedA.pixels, decodedA.width, decodedA.height, 90)
    const candidateC = rotateRgbaBufferClockwise(decodedA.pixels, decodedA.width, decodedA.height, 180)
    const candidateD = rotateRgbaBufferClockwise(decodedA.pixels, decodedA.width, decodedA.height, 270)
    assert.equal(asymmetricCornerMarkersMatch(candidateA.pixels, candidateA.width, candidateA.height), false)
    assert.equal(asymmetricCornerMarkersMatch(candidateB.pixels, candidateB.width, candidateB.height), false)
    assert.equal(asymmetricCornerMarkersMatch(candidateC.pixels, candidateC.width, candidateC.height), false)
    assert.equal(asymmetricCornerMarkersMatch(candidateD.pixels, candidateD.width, candidateD.height), true)

    const production = rotateRgbaBufferClockwise(
      decodedA.pixels,
      decodedA.width,
      decodedA.height,
      exifPostDecodeRotationClockwise(6, 4032, 3024, 3024, 4032, s10Opts),
    )
    assert.equal(asymmetricCornerMarkersMatch(production.pixels, production.width, production.height), true)
    assert.equal(production.width, landscapeW)
    assert.equal(production.height, landscapeH)
  })

  it('EXIF 8 swapped decode uses inverse 90° CW post-decode rotation', () => {
    assert.equal(
      exifPostDecodeRotationClockwise(8, 4032, 3024, 3024, 4032, {
        decodeMode: 'exif-bake-raw',
        usedBrowserOrientation: false,
      }),
      90,
    )
    assert.equal(
      exifPostDecodeRotationClockwise(5, 4032, 3024, 3024, 4032, {
        decodeMode: 'exif-bake-raw',
        usedBrowserOrientation: false,
      }),
      0,
    )
  })

  it('EXIF 6, raw 4032x3024, decoded still 4032x3024: manual EXIF bake required', () => {
    assert.equal(
      exifSwapAlreadyAppliedInDecodedBitmap(6, 4032, 3024, 4032, 3024),
      false,
    )
    assert.equal(
      exifBakeNeedsManualTransform(6, {
        decodeMode: 'exif-bake-raw',
        usedBrowserOrientation: false,
        storedWidth: 4032,
        storedHeight: 3024,
        decodedWidth: 4032,
        decodedHeight: 3024,
      }),
      true,
    )
    const upright = makeMarkedPortraitBuffer(40, 60)
    const raw = synthesizeRawSensorFromUpright(upright, 40, 60, 6)
    const baked = applyExifOrientationToPixelBuffer(raw.pixels, raw.width, raw.height, 6)
    assert.equal(asymmetricCornerMarkersMatch(baked.pixels, baked.width, baked.height), true)
  })

  for (const orientation of [1, 3, 6, 8]) {
    it(`EXIF ${orientation} — pixel corners upright after bake (asymmetric markers)`, () => {
      const uprightW = 40
      const uprightH = 60
      const upright = makeMarkedPortraitBuffer(uprightW, uprightH)
      assert.equal(asymmetricCornerMarkersMatch(upright, uprightW, uprightH), true)

      if (orientation === 1) {
        const baked = applyExifOrientationToPixelBuffer(upright, uprightW, uprightH, 1)
        assert.equal(baked.width, uprightW)
        assert.equal(baked.height, uprightH)
        assert.equal(asymmetricCornerMarkersMatch(baked.pixels, baked.width, baked.height), true)
        return
      }

      const raw = synthesizeRawSensorFromUpright(upright, uprightW, uprightH, orientation)
      const baked = applyExifOrientationToPixelBuffer(
        raw.pixels,
        raw.width,
        raw.height,
        orientation,
      )
      assert.equal(baked.width, uprightW)
      assert.equal(baked.height, uprightH)
      assert.equal(asymmetricCornerMarkersMatch(baked.pixels, baked.width, baked.height), true)

      if (orientation === 6 || orientation === 8) {
        const wrongOrient = orientation === 6 ? 8 : 6
        const wrong = applyExifOrientationToPixelBuffer(
          raw.pixels,
          raw.width,
          raw.height,
          wrongOrient,
        )
        assert.equal(asymmetricCornerMarkersMatch(wrong.pixels, wrong.width, wrong.height), false)
      }
      if (orientation === 3) {
        const wrong = applyExifOrientationToPixelBuffer(raw.pixels, raw.width, raw.height, 1)
        assert.equal(asymmetricCornerMarkersMatch(wrong.pixels, wrong.width, wrong.height), false)
      }
    })
  }

  it('landscape upright target from portrait sensor EXIF 6 (S10-style storage)', () => {
    const landscapeW = 60
    const landscapeH = 40
    const uprightLandscape = makeMarkedPortraitBuffer(landscapeW, landscapeH)
    assert.ok(landscapeW > landscapeH)
    const raw = synthesizeRawSensorFromUpright(uprightLandscape, landscapeW, landscapeH, 6)
    assert.equal(raw.width, landscapeH)
    assert.equal(raw.height, landscapeW)
    const baked = applyExifOrientationToPixelBuffer(raw.pixels, raw.width, raw.height, 6)
    assert.equal(baked.width, landscapeW)
    assert.equal(baked.height, landscapeH)
    assert.equal(asymmetricCornerMarkersMatch(baked.pixels, baked.width, baked.height), true)
  })

  it('EXIF 6 uses canonical TN2206 canvas matrix (not legacy rotate+translate)', () => {
    const params = exifCanvasTransformParams(6, 60, 40)
    assert.deepEqual(params, { a: 0, b: 1, c: -1, d: 0, e: 40, f: 0 })
  })

  it('EXIF 1 landscape sensor stays landscape when orientation is already upright', () => {
    const upright = uprightSizeForOrientation(4032, 3024, 1)
    const out = scaleContain(upright.width, upright.height, 1600)
    assert.equal(out.width, 1600)
    assert.equal(out.height, 1200)
    assert.ok(out.width > out.height)
  })

  it('preview, OCR, and persist share one prepared dataUrl from the provider boundary', () => {
    assert.match(providerSrc, /fileToVisionPreparedImage/)
    const scanStart = labourHook.indexOf('const prepared = await prepareSignInSheetImageForProvider(file, provider)')
    assert.ok(scanStart > 0)
    const scan = labourHook.slice(scanStart, scanStart + 2500)
    assert.match(scan, /setScanSheetPreview\(prepared\.dataUrl\)/)
    assert.match(scan, /dataUrl: prepared\.dataUrl/)
    assert.match(scan, /parseSignInSheet\(\{/)
    assert.match(scan, /replacePersistedSignInSheetEvidence/)
  })
})
