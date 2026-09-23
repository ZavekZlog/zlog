'use client'

/**
 * Client branding logo preparation: safe uniform-backdrop removal only.
 * Company name inference is via /api/analyze-brand-logo (see fetchBrandCompanyNameAnalysis).
 */

const MAX_PREP_SIDE = 960
const CORNER_PATCH = 3
const BG_RGB_MAX_SPREAD = 36
const BG_EDGE_MATCH_RATIO = 0.52
const BG_REMOVE_THRESHOLD = 34
const BG_SOFT_EDGE = 22

export function colorDistanceRgb(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function medianChannel(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] || 0
}

/** @param {Uint8ClampedArray} data @param {number} width @param {number} height */
export function sampleCornerPatchColors(data, width, height) {
  const patches = []
  const coords = [
    [0, 0],
    [width - CORNER_PATCH, 0],
    [0, height - CORNER_PATCH],
    [width - CORNER_PATCH, height - CORNER_PATCH],
  ]
  for (const [x0, y0] of coords) {
    const rs = []
    const gs = []
    const bs = []
    for (let y = y0; y < y0 + CORNER_PATCH && y < height; y += 1) {
      for (let x = x0; x < x0 + CORNER_PATCH && x < width; x += 1) {
        const i = (y * width + x) * 4
        if (data[i + 3] < 16) continue
        rs.push(data[i])
        gs.push(data[i + 1])
        bs.push(data[i + 2])
      }
    }
    if (rs.length) {
      patches.push({
        r: medianChannel(rs),
        g: medianChannel(gs),
        b: medianChannel(bs),
      })
    }
  }
  return patches
}

export function assessUniformLogoBackground(cornerPatches) {
  if (!cornerPatches || cornerPatches.length < 3) {
    return { confident: false, color: null }
  }
  let maxSpread = 0
  for (let i = 0; i < cornerPatches.length; i += 1) {
    for (let j = i + 1; j < cornerPatches.length; j += 1) {
      const a = cornerPatches[i]
      const b = cornerPatches[j]
      maxSpread = Math.max(maxSpread, colorDistanceRgb(a.r, a.g, a.b, b.r, b.g, b.b))
    }
  }
  if (maxSpread > BG_RGB_MAX_SPREAD) {
    return { confident: false, color: null }
  }
  const rs = cornerPatches.map((p) => p.r)
  const gs = cornerPatches.map((p) => p.g)
  const bs = cornerPatches.map((p) => p.b)
  return {
    confident: true,
    color: {
      r: medianChannel(rs),
      g: medianChannel(gs),
      b: medianChannel(bs),
    },
  }
}

/** @param {Uint8ClampedArray} data @param {number} width @param {number} height */
function edgeBackgroundMatchRatio(data, width, height, bg) {
  const points = []
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
    points.push([x, 0], [x, height - 1])
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
    points.push([0, y], [width - 1, y])
  }
  let match = 0
  let total = 0
  for (const [x, y] of points) {
    const i = (y * width + x) * 4
    if (data[i + 3] < 16) continue
    total += 1
    if (colorDistanceRgb(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) <= BG_REMOVE_THRESHOLD) {
      match += 1
    }
  }
  if (total < 8) return 0
  return match / total
}

/**
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @returns {{ data: Uint8ClampedArray, transformed: boolean, width: number, height: number }}
 */
export function removeUniformLogoBackground(data, width, height) {
  const out = new Uint8ClampedArray(data)
  const corners = sampleCornerPatchColors(data, width, height)
  const assessment = assessUniformLogoBackground(corners)
  if (!assessment.confident || !assessment.color) {
    return { data: out, transformed: false, width, height }
  }
  const bg = assessment.color
  const edgeRatio = edgeBackgroundMatchRatio(data, width, height, bg)
  if (edgeRatio < BG_EDGE_MATCH_RATIO) {
    return { data: out, transformed: false, width, height }
  }

  let changed = false
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const a = data[i + 3]
      if (a < 16) continue
      const dist = colorDistanceRgb(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b)
      if (dist <= BG_REMOVE_THRESHOLD) {
        out[i + 3] = 0
        changed = true
      } else if (dist <= BG_REMOVE_THRESHOLD + BG_SOFT_EDGE) {
        const t = (dist - BG_REMOVE_THRESHOLD) / BG_SOFT_EDGE
        const nextA = Math.round(a * Math.min(1, Math.max(0, t)))
        if (nextA !== a) changed = true
        out[i + 3] = nextA
      }
    }
  }
  return { data: out, transformed: changed, width, height }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * @param {File} file
 * @returns {Promise<{ file: File, previewUrl: string|null, backgroundRemoved: boolean }>}
 */
export async function prepareBrandLogoFile(file) {
  if (!file || typeof window === 'undefined') {
    return { file, previewUrl: null, backgroundRemoved: false }
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_PREP_SIDE / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { file, previewUrl: objectUrl, backgroundRemoved: false }
    ctx.drawImage(img, 0, 0, width, height)
    let imageData
    try {
      imageData = ctx.getImageData(0, 0, width, height)
    } catch {
      return { file, previewUrl: objectUrl, backgroundRemoved: false }
    }
    const result = removeUniformLogoBackground(imageData.data, width, height)
    if (!result.transformed) {
      return { file, previewUrl: objectUrl, backgroundRemoved: false }
    }
    const outCanvas = document.createElement('canvas')
    outCanvas.width = width
    outCanvas.height = height
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return { file, previewUrl: objectUrl, backgroundRemoved: false }
    outCtx.putImageData(new ImageData(result.data, width, height), 0, 0)
    const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/png'))
    if (!blob) return { file, previewUrl: objectUrl, backgroundRemoved: false }
    URL.revokeObjectURL(objectUrl)
    const base = (file.name || 'logo').replace(/\.\w+$/, '')
    const nextFile = new File([blob], `${base}.png`, { type: 'image/png' })
    return {
      file: nextFile,
      previewUrl: URL.createObjectURL(nextFile),
      backgroundRemoved: true,
    }
  } catch {
    return { file, previewUrl: objectUrl, backgroundRemoved: false }
  }
}

/**
 * Vision company-name analysis (non-blocking; failures return low confidence).
 * @param {File} file
 * @returns {Promise<{ company_name: string|null, confidence: 'high'|'medium'|'low' }>}
 */
export async function fetchBrandCompanyNameAnalysis(file) {
  if (!file || typeof window === 'undefined') {
    return { company_name: null, confidence: 'low' }
  }
  try {
    const image = await fileToDataUrl(file)
    if (!image.startsWith('data:image/')) {
      return { company_name: null, confidence: 'low' }
    }
    const res = await fetch('/api/analyze-brand-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
    if (!res.ok) {
      return { company_name: null, confidence: 'low' }
    }
    const json = await res.json()
    const name = json?.company_name != null ? String(json.company_name).trim() : null
    const confidence = json?.confidence === 'high' || json?.confidence === 'medium' || json?.confidence === 'low'
      ? json.confidence
      : 'low'
    return {
      company_name: name || null,
      confidence,
    }
  } catch {
    return { company_name: null, confidence: 'low' }
  }
}
