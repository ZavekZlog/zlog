/**
 * Normalize camera/gallery images so OCR and previews see upright pixels.
 * Uses EXIF Orientation when present; prefers createImageBitmap({ imageOrientation: 'from-image' }).
 */

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
      // APP1 — look for Exif\0\0
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

function drawOriented(ctx, source, width, height, orientation) {
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

/**
 * Decode a Blob/File into a canvas-ready source with correct pixel orientation.
 * @returns {{ source: CanvasImageSource, width: number, height: number, orientation: number, usedBrowserOrientation: boolean, close?: () => void }}
 */
export async function decodeOrientedImage(file) {
  if (!file || !(file instanceof Blob)) throw new Error('No image provided')

  let orientation = 1
  try {
    orientation = await readJpegExifOrientation(file)
  } catch {
    orientation = 1
  }

  // Modern browsers honour EXIF when drawing bitmaps with this option
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: true,
        close: () => bitmap.close?.(),
      }
    } catch {
      // fall through
    }
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation,
        usedBrowserOrientation: false,
        close: () => bitmap.close?.(),
      }
    } catch {
      // fall through to HTMLImageElement
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read camera image'))
      el.src = objectUrl
    })
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      orientation,
      usedBrowserOrientation: false,
      close: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    throw err
  }
}

/**
 * Draw an oriented image onto a canvas at optional max edge, return JPEG data URL + meta.
 */
export async function orientedImageToDataUrl(file, maxEdge = 1600, quality = 0.82) {
  const decoded = await decodeOrientedImage(file)
  const { source, orientation, usedBrowserOrientation } = decoded
  let { width, height } = decoded

  const needsManualTransform = !usedBrowserOrientation && orientation >= 2 && orientation <= 8
  const swap = needsManualTransform && orientation >= 5 && orientation <= 8
  const naturalW = swap ? height : width
  const naturalH = swap ? width : height

  const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH))
  const outW = Math.max(1, Math.round(naturalW * scale))
  const outH = Math.max(1, Math.round(naturalH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  if (needsManualTransform) {
    // Source still in sensor orientation — apply EXIF transform into upright canvas
    const srcScale = Math.min(1, maxEdge / Math.max(width, height))
    // Draw into a temp upright buffer sized to natural orientation
    const tmp = document.createElement('canvas')
    tmp.width = naturalW
    tmp.height = naturalH
    const tctx = tmp.getContext('2d')
    drawOriented(tctx, source, width, height, orientation)
    ctx.drawImage(tmp, 0, 0, outW, outH)
  } else {
    ctx.drawImage(source, 0, 0, outW, outH)
  }

  decoded.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return {
    dataUrl,
    width: outW,
    height: outH,
    orientation,
    usedBrowserOrientation,
  }
}
