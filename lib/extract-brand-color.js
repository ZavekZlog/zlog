'use client'

/**
 * Extract a dominant brand colour from an image File via canvas sampling.
 * Skips near-white / near-black / low-saturation pixels so letterheads and
 * logos resolve to the ink colour rather than the paper background.
 */
export async function extractBrandColorFromFile(file, fallback = '#FF5000') {
  if (!file || typeof window === 'undefined') return fallback
  // Camera captures and gallery picks both arrive as image/* (often image/jpeg).
  // Skip non-raster types — getImageData cannot read PDF bytes.
  if (file.type && !file.type.startsWith('image/')) return fallback
  if (!file.type && !/\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(file.name || '')) {
    return fallback
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    const maxSide = 120
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let data
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    } catch {
      return fallback
    }

    const buckets = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 128) continue

      const { h, s, l } = rgbToHsl(r, g, b)
      // Skip paper white, shadows, and washed greys
      if (l > 0.92 || l < 0.08) continue
      if (s < 0.12) continue

      const key = `${Math.round(h * 24)}_${Math.round(s * 8)}_${Math.round(l * 8)}`
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
      entry.count += 1
      entry.r += r
      entry.g += g
      entry.b += b
      buckets.set(key, entry)
    }

    let best = null
    for (const entry of buckets.values()) {
      if (!best || entry.count > best.count) best = entry
    }

    if (!best || best.count < 4) {
      // Fallback: average all non-transparent pixels with a slight saturation bias
      return averageVisibleColor(data, fallback)
    }

    const n = best.count
    return rgbToHex(
      Math.round(best.r / n),
      Math.round(best.g / n),
      Math.round(best.b / n),
    )
  } catch {
    return fallback
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    default: h = ((r - g) / d + 4) / 6; break
  }
  return { h, s, l }
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, n))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function averageVisibleColor(data, fallback) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue
    const rr = data[i]
    const gg = data[i + 1]
    const bb = data[i + 2]
    const { s, l } = rgbToHsl(rr, gg, bb)
    if (l > 0.92 || l < 0.08 || s < 0.08) continue
    r += rr
    g += gg
    b += bb
    n += 1
  }
  if (!n) return fallback
  return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n))
}
