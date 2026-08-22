/**
 * Normalize camera/gallery images so previews and PDF embeds see upright pixels.
 *
 * PDF cover baking uses `orientedImageToDataUrlForPdf`, which decodes the image
 * in the same browser-corrected orientation as `<img>` and flattens those pixels
 * to JPEG — no manual EXIF canvas transforms.
 *
 * Sign-in sheet and other callers may still use `orientedImageToDataUrl`.
 */

import { zlogPdfTrace } from './zlog-pdf-trace.js'

/** Trace fingerprint — browser-display flatten shared by cover + work PDF photos. */
export const PDF_PHOTO_PIPELINE_ID = 'browser-display-inline-v3'

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

function drawOriented(ctx, source, width, height, orientation) {
  zlogPdfTrace('image-canvas-transform', {
    applied: true,
    orientation,
    sourceWidth: width,
    sourceHeight: height,
    transform:
      orientation === 2 ? 'mirror-x'
        : orientation === 3 ? 'rotate-180'
          : orientation === 4 ? 'mirror-y'
            : orientation === 6 ? 'rotate-90-cw'
              : orientation === 8 ? 'rotate-90-ccw'
                : orientation === 5 || orientation === 7 ? `exif-${orientation}`
                  : 'none',
  })
  switch (orientation) {
    case 2:
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      break
    case 3:
      ctx.translate(width, height)
      ctx.rotate(Math.PI)
      break
    case 4:
      ctx.translate(0, height)
      ctx.scale(1, -1)
      break
    case 5:
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      break
    case 6:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -height)
      break
    case 7:
      ctx.rotate(-0.5 * Math.PI)
      ctx.scale(1, -1)
      ctx.translate(-width, 0)
      break
    case 8:
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-width, 0)
      break
    default:
      break
  }
  ctx.drawImage(source, 0, 0, width, height)
}

function loadHtmlImageFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, objectUrl })
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode image for PDF cover'))
    }
    img.src = objectUrl
  })
}

function finishBrowserDisplayDecode(result) {
  zlogPdfTrace('image-decode', {
    fn: 'decodeBrowserDisplayImage',
    decodeMode: result.decodeMode,
    usedBrowserOrientation: result.usedBrowserOrientation,
    orientation: result.orientation,
    decodedWidth: result.width,
    decodedHeight: result.height,
  })
  return result
}

/**
 * Decode in the same visually upright orientation the browser uses for `<img>`.
 * Used exclusively for PDF cover flattening.
 */
export async function decodeBrowserDisplayImage(file) {
  if (!file || !(file instanceof Blob)) throw new Error('No image provided')

  let orientation = 1
  try {
    orientation = await readJpegExifOrientation(file)
  } catch {
    orientation = 1
  }
  zlogPdfTrace('image-exif', {
    fn: 'readJpegExifOrientation',
    orientation,
    blobType: file.type || '',
    blobSize: file.size || 0,
    preferBrowserDisplay: true,
  })

  try {
    const { img, objectUrl } = await loadHtmlImageFromBlob(file)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    return finishBrowserDisplayDecode({
      source: img,
      width,
      height,
      orientation,
      usedBrowserOrientation: true,
      decodeMode: 'browser-display-img',
      close: () => URL.revokeObjectURL(objectUrl),
    })
  } catch {
    // fall through
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return finishBrowserDisplayDecode({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: true,
        decodeMode: 'browser-display-bitmap',
        close: () => bitmap.close?.(),
      })
    } catch {
      // fall through
    }
  }

  throw new Error('Could not decode cover photo in browser display orientation')
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

/** Simulate wrongly applying EXIF-6 manual rotation to an upright RGBA buffer. */
export function simulateWrongExif6Rotation(pixels, width, height) {
  const out = new Uint8ClampedArray(pixels.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4
      const dstX = y
      const dstY = width - 1 - x
      const dst = (dstY * height + dstX) * 4
      out[dst] = pixels[src]
      out[dst + 1] = pixels[src + 1]
      out[dst + 2] = pixels[src + 2]
      out[dst + 3] = pixels[src + 3]
    }
  }
  return { pixels: out, width: height, height: width }
}

/**
 * Decode a Blob into raw sensor pixels whenever possible.
 * PDF cover baking must apply EXIF itself — never trust from-image alone.
 */
export async function decodeOrientedImage(file, { preferRaw = true } = {}) {
  if (!file || !(file instanceof Blob)) throw new Error('No image provided')

  let orientation = 1
  try {
    orientation = await readJpegExifOrientation(file)
  } catch {
    orientation = 1
  }
  zlogPdfTrace('image-exif', {
    fn: 'readJpegExifOrientation',
    orientation,
    blobType: file.type || '',
    blobSize: file.size || 0,
    preferRaw,
  })

  const finish = (result) => {
    zlogPdfTrace('image-decode', {
      fn: 'decodeOrientedImage',
      decodeMode: result.decodeMode,
      usedBrowserOrientation: result.usedBrowserOrientation,
      orientation: result.orientation,
      decodedWidth: result.width,
      decodedHeight: result.height,
    })
    return result
  }

  if (typeof createImageBitmap === 'function') {
    if (preferRaw) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'none' })
        return finish({
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          orientation,
          usedBrowserOrientation: false,
          decodeMode: 'raw',
          close: () => bitmap.close?.(),
        })
      } catch {
        // Older engines reject imageOrientation: 'none'
      }
    }

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const lied = browserOrientationLooksUnapplied(orientation, bitmap.width, bitmap.height)
      return finish({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: !lied,
        decodeMode: lied ? 'raw' : 'browser-oriented',
        close: () => bitmap.close?.(),
      })
    } catch {
      // fall through
    }

    try {
      const bitmap = await createImageBitmap(file)
      const lied = browserOrientationLooksUnapplied(orientation, bitmap.width, bitmap.height)
      const treatAsRaw = orientation >= 5 && orientation <= 8 ? lied : orientation >= 2
      return finish({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: !treatAsRaw && orientation >= 2,
        decodeMode: treatAsRaw || orientation < 2 ? 'raw' : 'browser-oriented',
        close: () => bitmap.close?.(),
      })
    } catch {
      // fall through to HTMLImageElement
    }
  }

  const { img, objectUrl } = await loadHtmlImageFromBlob(file)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const lied = browserOrientationLooksUnapplied(orientation, width, height)
  return finish({
    source: img,
    width,
    height,
    orientation,
    usedBrowserOrientation: orientation >= 2 && !lied,
    decodeMode: orientation >= 2 && !lied ? 'browser-oriented' : 'raw',
    close: () => URL.revokeObjectURL(objectUrl),
  })
}

/**
 * Flatten a cover photo for @react-pdf using browser-display orientation only.
 * No manual EXIF rotation — matches how `<img>` shows the stored original.
 */
export async function orientedImageToDataUrlForPdf(file, maxEdge = 2400, quality = 0.92) {
  const decoded = await decodeBrowserDisplayImage(file)
  const { source, width, height, orientation, usedBrowserOrientation, decodeMode } = decoded

  zlogPdfTrace('image-bake', {
    fn: 'orientedImageToDataUrlForPdf',
    ran: true,
    decodeMode,
    exifOrientation: orientation,
    usedBrowserOrientation,
    needsManualTransform: false,
    displayWidth: width,
    displayHeight: height,
  })

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    decoded.close?.()
    throw new Error('Could not create image canvas')
  }

  zlogPdfTrace('image-canvas-transform', {
    applied: false,
    orientation,
    transform: 'none (browser-display flatten)',
    sourceWidth: width,
    sourceHeight: height,
  })

  ctx.drawImage(source, 0, 0, outW, outH)
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
    bakedManualOrientation: false,
  }
}

/**
 * Bake EXIF into upright JPEG pixels (no EXIF in output).
 * Safe for @react-pdf Image — do not pass the original signed URL when EXIF ≠ 1.
 */
export async function orientedImageToDataUrl(file, maxEdge = 1600, quality = 0.82) {
  const decoded = await decodeOrientedImage(file, { preferRaw: true })
  const { source, orientation, usedBrowserOrientation, decodeMode } = decoded
  const { width, height } = decoded

  // When pixels are still raw, always bake EXIF 2–8. When the browser already
  // oriented, re-encode as-is (orientation 1) so the PDF gets EXIF-free bytes.
  const needsManualTransform =
    decodeMode === 'raw' && !usedBrowserOrientation && orientation >= 2 && orientation <= 8
  const upright = needsManualTransform
    ? uprightSizeForOrientation(width, height, orientation)
    : { width, height }

  zlogPdfTrace('image-bake', {
    fn: 'orientedImageToDataUrl',
    ran: true,
    decodeMode,
    exifOrientation: orientation,
    usedBrowserOrientation,
    needsManualTransform,
    sensorWidth: width,
    sensorHeight: height,
    uprightWidth: upright.width,
    uprightHeight: upright.height,
  })

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
  }
}
