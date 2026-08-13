/**
 * Apply manual rotation for PDF export (display pixels).
 * Does not mutate the stored original file / caption.
 */

import { normalizeRotationDegrees } from './diary-pdf-layout.js'

/**
 * @param {string} src
 * @param {unknown} rotationDegrees
 * @returns {Promise<string>}
 */
export async function applyRotationToImageSrc(src, rotationDegrees) {
  const degrees = normalizeRotationDegrees(rotationDegrees)
  if (!src || !degrees) return src
  if (typeof document === 'undefined') return src

  const img = await loadImage(src)
  const swap = degrees === 90 || degrees === 270
  const outW = swap ? img.naturalHeight : img.naturalWidth
  const outH = swap ? img.naturalWidth : img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, outW)
  canvas.height = Math.max(1, outH)
  const ctx = canvas.getContext('2d')
  if (!ctx) return src

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

  try {
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    return src
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load photo for rotation'))
    img.src = src
  })
}
