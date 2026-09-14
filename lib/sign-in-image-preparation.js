/**
 * Sign-in sheet image preparation only (EXIF flatten → upright JPEG).
 * Must NOT import lib/image-orientation.js — isolated from PDF/share orientation.
 */

import { rotateDecodedCanvasClockwise } from './sign-in-decode-rotation.js'

export const SIGNIN_IMAGE_MAX_EDGE_DEFAULT = 1600
export const SIGNIN_IMAGE_JPEG_QUALITY_DEFAULT = 0.82

/** Read JPEG EXIF Orientation (1–8). Returns 1 if absent / not JPEG. */
export async function readJpegExifOrientation(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return 1
  const buf = await blob.arrayBuffer()
  const view = new DataView(buf)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    offset += 2
    if (marker === 0xffda) break // SOS
    if ((marker & 0xff00) !== 0xff00) break
    const size = view.getUint16(offset)
    if (size < 2 || offset + size > view.byteLength) break

    if (marker === 0xffe1 && size >= 8) {
      const isExif =
        view.getUint32(offset + 2) === 0x45786966 && view.getUint16(offset + 6) === 0x0000
      if (isExif) {
        const tiffStart = offset + 8
        const little = view.getUint16(tiffStart) === 0x4949
        const get16 = (o) => (little ? view.getUint16(o, true) : view.getUint16(o, false))
        const get32 = (o) => (little ? view.getUint32(o, true) : view.getUint32(o, false))
        if (get16(tiffStart) !== 0x4949 && get16(tiffStart) !== 0x4d4d) break
        if (get16(tiffStart + 2) !== 0x002a) break
        const ifd0 = tiffStart + get32(tiffStart + 4)
        if (ifd0 + 2 > view.byteLength) break
        const entries = get16(ifd0)
        for (let i = 0; i < entries; i += 1) {
          const entry = ifd0 + 2 + i * 12
          if (entry + 12 > view.byteLength) break
          if (get16(entry) === 0x0112) {
            const orient = get16(entry + 8)
            if (orient >= 1 && orient <= 8) return orient
            return 1
          }
        }
      }
    }
    offset += size
  }
  return 1
}

/** JPEG stored dimensions from SOF marker (before decode); null if unknown. */
export async function readJpegStoredDimensions(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return null
  const buf = await blob.arrayBuffer()
  const view = new DataView(buf)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    offset += 2
    if (marker === 0xffda) break
    if ((marker & 0xff00) !== 0xff00) break
    const size = view.getUint16(offset)
    if (size < 2 || offset + size > view.byteLength) break

    const isSof =
      marker === 0xffc0
      || marker === 0xffc1
      || marker === 0xffc2
      || marker === 0xffc3
      || marker === 0xffc5
      || marker === 0xffc6
      || marker === 0xffc7
      || marker === 0xffc9
      || marker === 0xffca
      || marker === 0xffcb
      || marker === 0xffcd
      || marker === 0xffce
    if (isSof && size >= 7) {
      const height = view.getUint16(offset + 3)
      const width = view.getUint16(offset + 5)
      if (width > 0 && height > 0) return { width, height }
    }
    offset += size
  }
  return null
}

/** Upright pixel size after applying EXIF orientation to sensor width/height. */
export function uprightSizeForOrientation(width, height, orientation) {
  const w = Math.max(1, Number(width) || 1)
  const h = Math.max(1, Number(height) || 1)
  const o = Number(orientation) || 1
  if (o >= 5 && o <= 8) return { width: h, height: w }
  return { width: w, height: h }
}

/**
 * True when EXIF says axes should swap (5–8) but the decoded bitmap is still
 * landscape — browser claimed to orient and did not.
 */
export function browserOrientationLooksUnapplied(orientation, bitmapWidth, bitmapHeight) {
  const o = Number(orientation) || 1
  if (o < 5 || o > 8) return false
  const w = Number(bitmapWidth) || 0
  const h = Number(bitmapHeight) || 0
  if (w <= 0 || h <= 0) return false
  return w >= h
}

/**
 * Canvas 2D affine params to bake EXIF orientation into upright pixels (Apple TN2206 / TIFF 6).
 * @returns {{ a: number, b: number, c: number, d: number, e: number, f: number } | null}
 */
export function exifCanvasTransformParams(orientation, width, height) {
  const w = Number(width) || 1
  const h = Number(height) || 1
  switch (Number(orientation) || 1) {
    case 2:
      return { a: -1, b: 0, c: 0, d: 1, e: w, f: 0 }
    case 3:
      return { a: -1, b: 0, c: 0, d: -1, e: w, f: h }
    case 4:
      return { a: 1, b: 0, c: 0, d: -1, e: 0, f: h }
    case 5:
      return { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0 }
    case 6:
      return { a: 0, b: 1, c: -1, d: 0, e: h, f: 0 }
    case 7:
      return { a: 0, b: -1, c: -1, d: 0, e: h, f: w }
    case 8:
      return { a: 0, b: -1, c: 1, d: 0, e: 0, f: w }
    default:
      return null
  }
}

/** Map upright destination pixel to source sensor coordinates. */
export function exifDestToSourceCoords(orientation, destX, destY, srcWidth, srcHeight) {
  const o = Number(orientation) || 1
  const w = Number(srcWidth) || 1
  const h = Number(srcHeight) || 1
  const dx = destX
  const dy = destY
  switch (o) {
    case 1:
      return [dx, dy]
    case 2:
      return [w - 1 - dx, dy]
    case 3:
      return [w - 1 - dx, h - 1 - dy]
    case 4:
      return [dx, h - 1 - dy]
    case 5:
      return [dy, dx]
    case 6:
      return [dy, h - 1 - dx]
    case 7:
      return [w - 1 - dy, h - 1 - dx]
    case 8:
      return [w - 1 - dy, dx]
    default:
      return [dx, dy]
  }
}

/**
 * Bake EXIF into an RGBA buffer (same geometry as canvas drawOriented + upright canvas size).
 */
export function applyExifOrientationToPixelBuffer(pixels, srcWidth, srcHeight, orientation) {
  const o = Number(orientation) || 1
  const { width: outW, height: outH } = uprightSizeForOrientation(srcWidth, srcHeight, o)
  const out = new Uint8ClampedArray(outW * outH * 4)
  if (o === 1) {
    out.set(pixels)
    return { pixels: out, width: outW, height: outH }
  }
  for (let dy = 0; dy < outH; dy += 1) {
    for (let dx = 0; dx < outW; dx += 1) {
      const [sx, sy] = exifDestToSourceCoords(o, dx, dy, srcWidth, srcHeight)
      const srcI = (sy * srcWidth + sx) * 4
      const dstI = (dy * outW + dx) * 4
      out[dstI] = pixels[srcI] ?? 0
      out[dstI + 1] = pixels[srcI + 1] ?? 0
      out[dstI + 2] = pixels[srcI + 2] ?? 0
      out[dstI + 3] = pixels[srcI + 3] ?? 255
    }
  }
  return { pixels: out, width: outW, height: outH }
}

function drawOriented(ctx, source, width, height, orientation) {
  const params = exifCanvasTransformParams(orientation, width, height)
  if (params) {
    ctx.setTransform(params.a, params.b, params.c, params.d, params.e, params.f)
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  ctx.drawImage(source, 0, 0, width, height)
}

/**
 * EXIF 5–8: true when decoded bitmap dimensions already match upright (axes-swapped) size
 * for JPEG stored dimensions — decoder applied orientation despite raw/none decode mode.
 */
export function exifSwapAlreadyAppliedInDecodedBitmap(
  orientation,
  storedWidth,
  storedHeight,
  decodedWidth,
  decodedHeight,
) {
  const o = Number(orientation) || 1
  if (o < 5 || o > 8) return false
  const sw = Math.max(1, Number(storedWidth) || 0)
  const sh = Math.max(1, Number(storedHeight) || 0)
  const dw = Number(decodedWidth) || 0
  const dh = Number(decodedHeight) || 0
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return false
  const expected = uprightSizeForOrientation(sw, sh, o)
  return dw === expected.width && dh === expected.height
}

/** Whether sign-in / EXIF bake should apply drawOriented to decoded pixels. */
export function exifBakeNeedsManualTransform(
  orientation,
  {
    decodeMode,
    usedBrowserOrientation,
    storedWidth,
    storedHeight,
    decodedWidth,
    decodedHeight,
  } = {},
) {
  const o = Number(orientation) || 1
  if (o < 2 || o > 8) return false
  if (usedBrowserOrientation) return false
  if (decodeMode !== 'raw' && decodeMode !== 'exif-bake-raw') return false

  const sw = Number(storedWidth) > 0 ? Number(storedWidth) : Number(decodedWidth)
  const sh = Number(storedHeight) > 0 ? Number(storedHeight) : Number(decodedHeight)
  if (
    exifSwapAlreadyAppliedInDecodedBitmap(o, sw, sh, decodedWidth, decodedHeight)
  ) {
    return false
  }
  return true
}

/**
 * Extra clockwise rotation on decoded pixels when axes were swapped in decode but
 * content is still wrong (Galaxy S10 landscape + EXIF 6: proven -90° = 270° CW).
 * @returns {0|90|180|270}
 */
export function exifPostDecodeRotationClockwise(
  orientation,
  storedWidth,
  storedHeight,
  decodedWidth,
  decodedHeight,
  { decodeMode, usedBrowserOrientation } = {},
) {
  if (usedBrowserOrientation) return 0
  if (decodeMode !== 'raw' && decodeMode !== 'exif-bake-raw') return 0
  const sw = Number(storedWidth) > 0 ? Number(storedWidth) : Number(decodedWidth)
  const sh = Number(storedHeight) > 0 ? Number(storedHeight) : Number(decodedHeight)
  if (
    !exifSwapAlreadyAppliedInDecodedBitmap(
      orientation,
      sw,
      sh,
      decodedWidth,
      decodedHeight,
    )
  ) {
    return 0
  }
  const o = Number(orientation) || 1
  if (o === 6) return 270
  if (o === 8) return 90
  return 0
}

function loadHtmlImageFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, objectUrl })
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode sign-in image'))
    }
    img.src = objectUrl
  })
}

/**
 * Decode a Blob into raw sensor pixels whenever possible (sign-in EXIF bake).
 */
async function decodeSignInImageForExifBake(file, { preferRaw = true, exifBake = false } = {}) {
  if (!file || !(file instanceof Blob)) throw new Error('No image provided')

  let orientation = 1
  try {
    orientation = await readJpegExifOrientation(file)
  } catch {
    orientation = 1
  }

  if (typeof createImageBitmap === 'function') {
    if (preferRaw) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'none' })
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          orientation,
          usedBrowserOrientation: false,
          decodeMode: exifBake ? 'exif-bake-raw' : 'raw',
          close: () => bitmap.close?.(),
        }
      } catch {
        // Older engines reject imageOrientation: 'none'
      }
    }

    if (!exifBake) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const lied = browserOrientationLooksUnapplied(orientation, bitmap.width, bitmap.height)
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          orientation,
          usedBrowserOrientation: !lied,
          decodeMode: lied ? 'raw' : 'browser-oriented',
          close: () => bitmap.close?.(),
        }
      } catch {
        // fall through
      }
    }

    try {
      const bitmap = await createImageBitmap(file)
      const lied = browserOrientationLooksUnapplied(orientation, bitmap.width, bitmap.height)
      if (exifBake) {
        const browserAlreadyOriented =
          orientation >= 5 && orientation <= 8 && !lied
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          orientation,
          usedBrowserOrientation: browserAlreadyOriented,
          decodeMode: 'exif-bake-raw',
          close: () => bitmap.close?.(),
        }
      }
      const treatAsRaw = orientation >= 5 && orientation <= 8 ? lied : orientation >= 2
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: !treatAsRaw && orientation >= 2,
        decodeMode: treatAsRaw || orientation < 2 ? 'raw' : 'browser-oriented',
        close: () => bitmap.close?.(),
      }
    } catch {
      // fall through to HTMLImageElement
    }
  }

  const { img, objectUrl } = await loadHtmlImageFromBlob(file)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const lied = browserOrientationLooksUnapplied(orientation, width, height)
  if (exifBake) {
    return {
      source: img,
      width,
      height,
      orientation,
      usedBrowserOrientation: false,
      decodeMode: 'exif-bake-raw',
      close: () => URL.revokeObjectURL(objectUrl),
    }
  }
  return {
    source: img,
    width,
    height,
    orientation,
    usedBrowserOrientation: orientation >= 2 && !lied,
    decodeMode: orientation >= 2 && !lied ? 'browser-oriented' : 'raw',
    close: () => URL.revokeObjectURL(objectUrl),
  }
}

/** Sample RGB at a corner — for asymmetric marker regression tests. */
export function readCornerRgb(pixels, width, height, corner) {
  const x = corner === 'tr' || corner === 'br' ? width - 1 : 0
  const y = corner === 'bl' || corner === 'br' ? height - 1 : 0
  const i = (y * width + x) * 4
  return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0]
}

/** Which channel dominates — maps asymmetric test markers to a label. */
export function dominantChannelLabel([r, g, b]) {
  if (r > 180 && g > 180 && b < 100) return 'yellow'
  if (r >= g && r >= b) return 'red'
  if (g >= r && g >= b) return 'green'
  if (b >= r && b >= g) return 'blue'
  return 'yellow'
}

/**
 * True when corner colours match TL=red, TR=green, BL=blue, BR=yellow.
 * A 90°/180°/mirror bake would scramble these corners.
 */
export function asymmetricCornerMarkersMatch(pixels, width, height) {
  const corners = {
    tl: dominantChannelLabel(readCornerRgb(pixels, width, height, 'tl')),
    tr: dominantChannelLabel(readCornerRgb(pixels, width, height, 'tr')),
    bl: dominantChannelLabel(readCornerRgb(pixels, width, height, 'bl')),
    br: dominantChannelLabel(readCornerRgb(pixels, width, height, 'br')),
  }
  return (
    corners.tl === 'red'
    && corners.tr === 'green'
    && corners.bl === 'blue'
    && corners.br === 'yellow'
  )
}

/**
 * Bake EXIF into upright JPEG pixels (no EXIF in output).
 * Sign-in preview, evidence persist, and vision OCR.
 */
export async function prepareSignInImageToDataUrl(
  file,
  maxEdge = SIGNIN_IMAGE_MAX_EDGE_DEFAULT,
  quality = SIGNIN_IMAGE_JPEG_QUALITY_DEFAULT,
) {
  let jpegStoredWidth = 0
  let jpegStoredHeight = 0
  try {
    const stored = await readJpegStoredDimensions(file)
    if (stored?.width && stored?.height) {
      jpegStoredWidth = stored.width
      jpegStoredHeight = stored.height
    }
  } catch {
    /* ignore */
  }

  const decoded = await decodeSignInImageForExifBake(file, { preferRaw: true, exifBake: true })
  const { source, orientation, usedBrowserOrientation, decodeMode } = decoded
  const { width, height } = decoded

  const exifSwapAlreadyApplied = exifSwapAlreadyAppliedInDecodedBitmap(
    orientation,
    jpegStoredWidth || width,
    jpegStoredHeight || height,
    width,
    height,
  )

  const needsManualTransform = exifBakeNeedsManualTransform(orientation, {
    decodeMode,
    usedBrowserOrientation,
    storedWidth: jpegStoredWidth,
    storedHeight: jpegStoredHeight,
    decodedWidth: width,
    decodedHeight: height,
  })
  const postDecodeRotationClockwise = needsManualTransform
    ? 0
    : exifPostDecodeRotationClockwise(
        orientation,
        jpegStoredWidth || width,
        jpegStoredHeight || height,
        width,
        height,
        { decodeMode, usedBrowserOrientation },
      )
  let upright = needsManualTransform
    ? uprightSizeForOrientation(width, height, orientation)
    : { width, height }
  if (postDecodeRotationClockwise === 90 || postDecodeRotationClockwise === 270) {
    upright = { width: height, height: width }
  }

  const scale = Math.min(1, maxEdge / Math.max(upright.width, upright.height))
  const outW = Math.max(1, Math.round(upright.width * scale))
  const outH = Math.max(1, Math.round(upright.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    decoded.close?.()
    throw new Error('Could not create image canvas')
  }

  if (needsManualTransform) {
    const tmp = document.createElement('canvas')
    tmp.width = upright.width
    tmp.height = upright.height
    const tctx = tmp.getContext('2d')
    drawOriented(tctx, source, width, height, orientation)
    ctx.drawImage(tmp, 0, 0, outW, outH)
  } else if (postDecodeRotationClockwise) {
    const rotated = rotateDecodedCanvasClockwise(
      source,
      width,
      height,
      postDecodeRotationClockwise,
    )
    ctx.drawImage(rotated, 0, 0, outW, outH)
  } else {
    ctx.drawImage(source, 0, 0, outW, outH)
  }

  decoded.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('Cover orientation bake produced no image data')
  }
  return {
    dataUrl,
    width: outW,
    height: outH,
    orientation,
    usedBrowserOrientation,
    decodeMode,
    bakedManualOrientation: needsManualTransform,
    decodedWidth: width,
    decodedHeight: height,
    jpegStoredWidth,
    jpegStoredHeight,
    exifSwapAlreadyApplied,
    postDecodeRotationClockwise,
  }
}
