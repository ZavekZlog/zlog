/**
 * Sign-in post-decode bitmap rotation (production + node regression tests).
 */

/**
 * @param {CanvasImageSource} source
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} degreesClockwise 0 | 90 | 180 | 270
 */
export function rotateDecodedCanvasClockwise(source, srcW, srcH, degreesClockwise) {
  const d = ((Number(degreesClockwise) % 360) + 360) % 360
  const sw = Math.max(1, Math.round(srcW))
  const sh = Math.max(1, Math.round(srcH))
  let cw = sw
  let ch = sh
  if (d === 90 || d === 270) {
    cw = sh
    ch = sw
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create sign-in decode rotation canvas')

  switch (d) {
    case 0:
      ctx.drawImage(source, 0, 0, sw, sh)
      break
    case 90:
      ctx.translate(cw, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(source, 0, 0, sw, sh)
      break
    case 180:
      ctx.translate(cw, ch)
      ctx.rotate(Math.PI)
      ctx.drawImage(source, 0, 0, sw, sh)
      break
    case 270:
      ctx.translate(0, ch)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(source, 0, 0, sw, sh)
      break
    default:
      ctx.drawImage(source, 0, 0, sw, sh)
  }
  return canvas
}

/**
 * RGBA rotation matching rotateDecodedCanvasClockwise (node tests only).
 * @returns {{ pixels: Uint8ClampedArray, width: number, height: number }}
 */
export function rotateRgbaBufferClockwise(pixels, srcW, srcH, degreesClockwise) {
  const d = ((Number(degreesClockwise) % 360) + 360) % 360
  const sw = Math.max(1, Math.round(srcW))
  const sh = Math.max(1, Math.round(srcH))
  let cw = sw
  let ch = sh
  if (d === 90 || d === 270) {
    cw = sh
    ch = sw
  }
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let sy = 0; sy < sh; sy += 1) {
    for (let sx = 0; sx < sw; sx += 1) {
      let dx
      let dy
      switch (d) {
        case 0:
          dx = sx
          dy = sy
          break
        case 90:
          dx = sh - 1 - sy
          dy = sx
          break
        case 180:
          dx = sw - 1 - sx
          dy = sh - 1 - sy
          break
        case 270:
          dx = sy
          dy = sw - 1 - sx
          break
        default:
          dx = sx
          dy = sy
      }
      const srcI = (sy * sw + sx) * 4
      const dstI = (dy * cw + dx) * 4
      out[dstI] = pixels[srcI]
      out[dstI + 1] = pixels[srcI + 1]
      out[dstI + 2] = pixels[srcI + 2]
      out[dstI + 3] = pixels[srcI + 3]
    }
  }
  return { pixels: out, width: cw, height: ch }
}
