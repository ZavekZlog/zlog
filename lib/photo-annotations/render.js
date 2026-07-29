/**
 * Draw structured annotations onto a 2D canvas context.
 * Coordinates are normalized 0–1; scale to the target pixel size.
 */

import { normalizeAnnotationDoc, strokeWidthPx } from './model'

function toPx(n, size) {
  return Number(n) * size
}

function drawArrowHead(ctx, x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(8, size * 3)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

export function drawShape(ctx, shape, imageWidth, imageHeight, { selected = false } = {}) {
  if (!shape || !ctx) return
  const w = imageWidth
  const h = imageHeight
  const sw = strokeWidthPx(shape, w, h)
  ctx.save()
  ctx.lineWidth = sw
  ctx.strokeStyle = shape.stroke || '#FF5000'
  ctx.fillStyle = shape.stroke || '#FF5000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (shape.type === 'arrow') {
    const x1 = toPx(shape.x1, w)
    const y1 = toPx(shape.y1, h)
    const x2 = toPx(shape.x2, w)
    const y2 = toPx(shape.y2, h)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    drawArrowHead(ctx, x1, y1, x2, y2, sw)
  } else if (shape.type === 'ellipse') {
    const cx = toPx(shape.cx, w)
    const cy = toPx(shape.cy, h)
    const rx = toPx(shape.rx, w)
    const ry = toPx(shape.ry, h)
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
    if (shape.fill && shape.fill !== 'transparent') {
      ctx.fillStyle = shape.fill
      ctx.fill()
    }
    ctx.stroke()
  } else if (shape.type === 'rect') {
    const x = toPx(shape.x, w)
    const y = toPx(shape.y, h)
    const rw = toPx(shape.w, w)
    const rh = toPx(shape.h, h)
    if (shape.fill && shape.fill !== 'transparent') {
      ctx.fillStyle = shape.fill
      ctx.fillRect(x, y, rw, rh)
    }
    ctx.strokeRect(x, y, rw, rh)
  } else if (shape.type === 'freehand') {
    const pts = shape.points || []
    if (pts.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(toPx(pts[0].x, w), toPx(pts[0].y, h))
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(toPx(pts[i].x, w), toPx(pts[i].y, h))
      }
      ctx.stroke()
    }
  } else if (shape.type === 'text') {
    const minEdge = Math.max(1, Math.min(w, h))
    const fontPx = Math.max(10, (shape.fontSizeNorm || 0.035) * minEdge)
    ctx.font = `600 ${fontPx}px Helvetica, Arial, sans-serif`
    ctx.textBaseline = 'top'
    ctx.lineWidth = Math.max(2, fontPx * 0.12)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    const tx = toPx(shape.x, w)
    const ty = toPx(shape.y, h)
    ctx.strokeText(shape.text, tx, ty)
    ctx.fillStyle = shape.stroke || '#FF5000'
    ctx.fillText(shape.text, tx, ty)
  }

  if (selected) {
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = Math.max(1, sw * 0.6)
    const bounds = shapeBounds(shape)
    if (bounds) {
      ctx.strokeRect(
        toPx(bounds.x, w) - 4,
        toPx(bounds.y, h) - 4,
        toPx(bounds.w, w) + 8,
        toPx(bounds.h, h) + 8,
      )
    }
  }

  ctx.restore()
}

export function drawAnnotationDoc(ctx, doc, imageWidth, imageHeight, { selectedId = null } = {}) {
  const normalized = normalizeAnnotationDoc(doc, imageWidth, imageHeight)
  for (const shape of normalized.shapes) {
    drawShape(ctx, shape, imageWidth, imageHeight, { selected: shape.id === selectedId })
  }
}

export function shapeBounds(shape) {
  if (!shape) return null
  if (shape.type === 'arrow') {
    const x = Math.min(shape.x1, shape.x2)
    const y = Math.min(shape.y1, shape.y2)
    return {
      x,
      y,
      w: Math.max(0.01, Math.abs(shape.x2 - shape.x1)),
      h: Math.max(0.01, Math.abs(shape.y2 - shape.y1)),
    }
  }
  if (shape.type === 'ellipse') {
    return {
      x: shape.cx - shape.rx,
      y: shape.cy - shape.ry,
      w: shape.rx * 2,
      h: shape.ry * 2,
    }
  }
  if (shape.type === 'rect') {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
  }
  if (shape.type === 'freehand') {
    const pts = shape.points || []
    if (!pts.length) return null
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { x: minX, y: minY, w: Math.max(0.01, maxX - minX), h: Math.max(0.01, maxY - minY) }
  }
  if (shape.type === 'text') {
    const approxW = Math.min(0.5, (String(shape.text || '').length) * (shape.fontSizeNorm || 0.035) * 0.6)
    const approxH = (shape.fontSizeNorm || 0.035) * 1.2
    return { x: shape.x, y: shape.y, w: approxW, h: approxH }
  }
  return null
}

/** Hit-test normalized point against shapes (top-most first). */
export function hitTestShape(doc, nx, ny, imageWidth, imageHeight) {
  const normalized = normalizeAnnotationDoc(doc, imageWidth, imageHeight)
  const pad = 0.012
  for (let i = normalized.shapes.length - 1; i >= 0; i -= 1) {
    const shape = normalized.shapes[i]
    const b = shapeBounds(shape)
    if (!b) continue
    if (nx >= b.x - pad && nx <= b.x + b.w + pad && ny >= b.y - pad && ny <= b.y + b.h + pad) {
      return shape
    }
  }
  return null
}
