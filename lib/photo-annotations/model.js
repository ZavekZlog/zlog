/**
 * Structured photo annotation model.
 * Coordinates are normalized 0–1 relative to the original image (width/height).
 * The original photograph is never mutated — annotations live separately.
 */

export const ANNOTATION_VERSION = 1

export const SHAPE_TYPES = ['arrow', 'ellipse', 'rect', 'freehand', 'text']

export const DEFAULT_STROKE = '#FF5000'
export const DEFAULT_STROKE_WIDTH_NORM = 0.004 // fraction of min(imageW, imageH)

export function makeAnnotationId(prefix = 'ann') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyAnnotationDoc(imageWidth = 0, imageHeight = 0) {
  return {
    version: ANNOTATION_VERSION,
    imageWidth: Number(imageWidth) || 0,
    imageHeight: Number(imageHeight) || 0,
    shapes: [],
  }
}

export function normalizeAnnotationDoc(raw, fallbackWidth = 0, fallbackHeight = 0) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyAnnotationDoc(fallbackWidth, fallbackHeight)
  }
  const shapes = Array.isArray(raw.shapes)
    ? raw.shapes.map(normalizeShape).filter(Boolean)
    : []
  return {
    version: ANNOTATION_VERSION,
    imageWidth: Number(raw.imageWidth) || fallbackWidth || 0,
    imageHeight: Number(raw.imageHeight) || fallbackHeight || 0,
    shapes,
  }
}

function clamp01(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(1, Math.max(0, x))
}

function normalizeShape(shape) {
  if (!shape || typeof shape !== 'object') return null
  const type = String(shape.type || '').toLowerCase()
  if (!SHAPE_TYPES.includes(type)) return null
  const base = {
    id: shape.id || makeAnnotationId('shape'),
    type,
    stroke: shape.stroke || DEFAULT_STROKE,
    strokeWidthNorm:
      Number.isFinite(Number(shape.strokeWidthNorm)) && Number(shape.strokeWidthNorm) > 0
        ? Number(shape.strokeWidthNorm)
        : DEFAULT_STROKE_WIDTH_NORM,
    fill: shape.fill == null ? 'transparent' : shape.fill,
  }

  if (type === 'arrow') {
    return {
      ...base,
      x1: clamp01(shape.x1),
      y1: clamp01(shape.y1),
      x2: clamp01(shape.x2),
      y2: clamp01(shape.y2),
    }
  }
  if (type === 'ellipse') {
    return {
      ...base,
      cx: clamp01(shape.cx),
      cy: clamp01(shape.cy),
      rx: Math.max(0.001, clamp01(shape.rx)),
      ry: Math.max(0.001, clamp01(shape.ry)),
    }
  }
  if (type === 'rect') {
    const x = clamp01(shape.x)
    const y = clamp01(shape.y)
    const w = Math.max(0.001, clamp01(shape.w))
    const h = Math.max(0.001, clamp01(shape.h))
    return { ...base, x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) }
  }
  if (type === 'freehand') {
    const points = Array.isArray(shape.points)
      ? shape.points
          .map((p) => ({ x: clamp01(p?.x), y: clamp01(p?.y) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      : []
    if (points.length < 2) return null
    return { ...base, points }
  }
  if (type === 'text') {
    const text = String(shape.text || '').trim()
    if (!text) return null
    return {
      ...base,
      x: clamp01(shape.x),
      y: clamp01(shape.y),
      text,
      fontSizeNorm:
        Number.isFinite(Number(shape.fontSizeNorm)) && Number(shape.fontSizeNorm) > 0
          ? Number(shape.fontSizeNorm)
          : 0.035,
    }
  }
  return null
}

export function upsertShape(doc, shape) {
  const next = normalizeAnnotationDoc(doc)
  const normalized = normalizeShape(shape)
  if (!normalized) return next
  const idx = next.shapes.findIndex((s) => s.id === normalized.id)
  if (idx >= 0) next.shapes[idx] = normalized
  else next.shapes.push(normalized)
  return next
}

export function removeShape(doc, shapeId) {
  const next = normalizeAnnotationDoc(doc)
  next.shapes = next.shapes.filter((s) => s.id !== shapeId)
  return next
}

/** Translate a shape by normalized deltas (does not mutate the original). */
export function offsetShape(shape, dx, dy) {
  if (!shape) return shape
  const ox = Number(dx) || 0
  const oy = Number(dy) || 0
  if (shape.type === 'arrow') {
    return {
      ...shape,
      x1: shape.x1 + ox,
      y1: shape.y1 + oy,
      x2: shape.x2 + ox,
      y2: shape.y2 + oy,
    }
  }
  if (shape.type === 'ellipse') {
    return { ...shape, cx: shape.cx + ox, cy: shape.cy + oy }
  }
  if (shape.type === 'rect' || shape.type === 'text') {
    return { ...shape, x: shape.x + ox, y: shape.y + oy }
  }
  if (shape.type === 'freehand') {
    return {
      ...shape,
      points: (shape.points || []).map((p) => ({ x: p.x + ox, y: p.y + oy })),
    }
  }
  return { ...shape }
}

export function hasAnnotations(doc) {
  const d = normalizeAnnotationDoc(doc)
  return d.shapes.length > 0
}

/** Pixel stroke width from normalized value for a given image size. */
export function strokeWidthPx(shape, imageWidth, imageHeight) {
  const minEdge = Math.max(1, Math.min(imageWidth, imageHeight))
  const norm = Number(shape?.strokeWidthNorm) || DEFAULT_STROKE_WIDTH_NORM
  return Math.max(1, norm * minEdge)
}
