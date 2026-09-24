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
const TRIM_MARGIN_PADDING = 6

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

export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

export function relativeLuminance(r, g, b) {
  const toLin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

/**
 * Setup preview backdrop from corner uniformity (not diary brandColor).
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 */
export function classifyLogoPresentationFromImageData(data, width, height) {
  const corners = sampleCornerPatchColors(data, width, height)
  const assessment = assessUniformLogoBackground(corners)

  if (assessment.confident && assessment.color) {
    const { r, g, b } = assessment.color
    const backdropColor = rgbToHex(r, g, b)
    const lum = relativeLuminance(r, g, b)
    if (lum >= 0.72) {
      return { classification: 'opaque_light', backdropColor }
    }
    return { classification: 'opaque_brand', backdropColor }
  }

  return { classification: 'transparent', backdropColor: null }
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
/**
 * Tight crop around non-background ink on a uniform screenshot/letterhead.
 * Preserves the uniform colour inside the crop (no alpha punch-through).
 */
export function trimExcessUniformMarginsFromImageData(data, width, height, bg) {
  if (!bg) {
    return { data, width, height, trimmed: false }
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 16) continue
      if (colorDistanceRgb(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) > BG_REMOVE_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { data, width, height, trimmed: false }
  }
  const x0 = Math.max(0, minX - TRIM_MARGIN_PADDING)
  const y0 = Math.max(0, minY - TRIM_MARGIN_PADDING)
  const x1 = Math.min(width - 1, maxX + TRIM_MARGIN_PADDING)
  const y1 = Math.min(height - 1, maxY + TRIM_MARGIN_PADDING)
  const nextW = x1 - x0 + 1
  const nextH = y1 - y0 + 1
  if (nextW === width && nextH === height) {
    return { data, width, height, trimmed: false }
  }
  const out = new Uint8ClampedArray(nextW * nextH * 4)
  for (let y = 0; y < nextH; y += 1) {
    for (let x = 0; x < nextW; x += 1) {
      const srcI = ((y0 + y) * width + (x0 + x)) * 4
      const dstI = (y * nextW + x) * 4
      out[dstI] = data[srcI]
      out[dstI + 1] = data[srcI + 1]
      out[dstI + 2] = data[srcI + 2]
      out[dstI + 3] = data[srcI + 3]
    }
  }
  return { data: out, width: nextW, height: nextH, trimmed: true }
}

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

function loadImage(src, { crossOrigin = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin && /^https?:/i.test(src)) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

async function exportRasterToPreparedLogoFile(data, width, height, sourceFileName) {
  const outCanvas = document.createElement('canvas')
  outCanvas.width = width
  outCanvas.height = height
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) return null
  outCtx.putImageData(new ImageData(data, width, height), 0, 0)
  const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, 'image/png'))
  if (!blob) return null
  const base = (sourceFileName || 'logo').replace(/\.\w+$/, '')
  const nextFile = new File([blob], `${base}.png`, { type: 'image/png' })
  return {
    file: nextFile,
    previewUrl: URL.createObjectURL(nextFile),
  }
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
 * @returns {Promise<{ file: File, previewUrl: string|null, backgroundRemoved: boolean, presentation: object }>}
 */
export async function prepareBrandLogoFile(file) {
  if (!file || typeof window === 'undefined') {
    return { file, previewUrl: null, backgroundRemoved: false, presentation: null }
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
    if (!ctx) {
      return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation: null }
    }
    ctx.drawImage(img, 0, 0, width, height)
    let imageData
    try {
      imageData = ctx.getImageData(0, 0, width, height)
    } catch {
      return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation: null }
    }
    const uniform = assessUniformLogoBackground(sampleCornerPatchColors(imageData.data, width, height))
    if (uniform.confident && uniform.color) {
      const trimmed = trimExcessUniformMarginsFromImageData(
        imageData.data,
        width,
        height,
        uniform.color,
      )
      const presentation = classifyLogoPresentationFromImageData(
        trimmed.data,
        trimmed.width,
        trimmed.height,
      )
      const exported = await exportRasterToPreparedLogoFile(
        trimmed.data,
        trimmed.width,
        trimmed.height,
        file.name,
      )
      URL.revokeObjectURL(objectUrl)
      if (!exported) {
        return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation }
      }
      return {
        file: exported.file,
        previewUrl: exported.previewUrl,
        backgroundRemoved: false,
        presentation,
      }
    }

    const presentation = classifyLogoPresentationFromImageData(
      imageData.data,
      width,
      height,
    )
    const result = removeUniformLogoBackground(imageData.data, width, height)
    if (!result.transformed) {
      return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation }
    }
    const exported = await exportRasterToPreparedLogoFile(
      result.data,
      result.width,
      result.height,
      file.name,
    )
    URL.revokeObjectURL(objectUrl)
    if (!exported) {
      return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation }
    }
    const outPresentation = classifyLogoPresentationFromImageData(
      result.data,
      result.width,
      result.height,
    )
    return {
      file: exported.file,
      previewUrl: exported.previewUrl,
      backgroundRemoved: true,
      presentation: outPresentation,
    }
  } catch {
    return { file, previewUrl: objectUrl, backgroundRemoved: false, presentation: null }
  }
}

/** Setup hydrate — returns null when canvas sampling is blocked (e.g. cross-origin). */
export async function classifyLogoPresentationFromImageUrl(src) {
  if (!src || typeof window === 'undefined') return null
  try {
    const img = await loadImage(src, { crossOrigin: true })
    const scale = Math.min(1, MAX_PREP_SIDE / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    return classifyLogoPresentationFromImageData(imageData.data, width, height)
  } catch {
    return null
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
