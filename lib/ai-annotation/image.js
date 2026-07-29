/**
 * Shared image prep for AI annotation (client-side).
 */

/** Resize + JPEG-compress an image File for vision upload. */
export async function fileToAnnotationDataUrl(file, maxEdge = 1280, quality = 0.82) {
  if (!file || !(file instanceof Blob)) throw new Error('No image provided')

  let width
  let height
  let drawSource

  try {
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    drawSource = bitmap
  } catch {
    const objectUrl = URL.createObjectURL(file)
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('Could not read camera image'))
        el.src = objectUrl
      })
      width = img.naturalWidth || img.width
      height = img.naturalHeight || img.height
      drawSource = img
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(drawSource, 0, 0, w, h)
  drawSource.close?.()
  return canvas.toDataURL('image/jpeg', quality)
}
