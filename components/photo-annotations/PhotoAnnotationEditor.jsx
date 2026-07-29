'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PrimaryCTA, SecondaryButton, labelStyle } from '@/lib/premium-ui'
import {
  createEmptyAnnotationDoc,
  normalizeAnnotationDoc,
  upsertShape,
  removeShape,
  makeAnnotationId,
  DEFAULT_STROKE,
  fitContain,
  drawAnnotationDoc,
  hitTestShape,
  annotationDocToOverlayDataUrl,
  hasAnnotations,
} from '@/lib/photo-annotations'

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'freehand', label: 'Freehand' },
  { id: 'text', label: 'Text' },
]

const toolBtn = (active) => ({
  padding: '8px 10px',
  borderRadius: 8,
  border: active ? '1px solid color-mix(in srgb, var(--action) 55%, transparent)' : '1px solid var(--edge)',
  background: active ? 'color-mix(in srgb, var(--action) 18%, transparent)' : 'transparent',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontFamily: 'inherit',
})

/**
 * Transparent annotation overlay editor.
 * Base layer = original photograph (untouched).
 * Overlay = structured shapes drawn on a transparent canvas above it.
 */
export function PhotoAnnotationEditor({
  imageSrc,
  initialAnnotations = null,
  accent,
  title = 'Annotate photo',
  onSave,
  onCancel,
}) {
  const stageRef = useRef(null)
  const overlayRef = useRef(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [fit, setFit] = useState({ x: 0, y: 0, w: 0, h: 0, scale: 1 })
  const [doc, setDoc] = useState(() => normalizeAnnotationDoc(initialAnnotations))
  const [tool, setTool] = useState('arrow')
  const [selectedId, setSelectedId] = useState(null)
  const [stroke, setStroke] = useState(DEFAULT_STROKE)
  const draftRef = useRef(null)
  const dragRef = useRef(null)
  const [textDraft, setTextDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!imageSrc) return
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      setNaturalSize({ w, h })
      setDoc((prev) => {
        const next = normalizeAnnotationDoc(prev || initialAnnotations, w, h)
        return { ...next, imageWidth: w, imageHeight: h }
      })
    }
    img.src = imageSrc
  }, [imageSrc, initialAnnotations])

  const measure = useCallback(() => {
    const el = stageRef.current
    if (!el || !naturalSize.w || !naturalSize.h) return
    const rect = el.getBoundingClientRect()
    setFit(fitContain(rect.width, rect.height, naturalSize.w, naturalSize.h))
  }, [naturalSize])

  useEffect(() => {
    measure()
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const paint = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas || !naturalSize.w) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssW = Math.max(1, fit.w)
    const cssH = Math.max(1, fit.h)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    // Draw in display pixel space that maps 1:1 to normalized via cssW/cssH
    const live = draftRef.current
      ? upsertShape(doc, draftRef.current)
      : doc
    drawAnnotationDoc(ctx, live, cssW, cssH, { selectedId })
  }, [doc, fit, naturalSize, selectedId])

  useEffect(() => {
    paint()
  }, [paint])

  const eventToNorm = (e) => {
    const canvas = overlayRef.current
    if (!canvas || !fit.w || !fit.h) return null
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (x < 0 || y < 0 || x > 1 || y > 1) return null
    return { x, y }
  }

  const onPointerDown = (e) => {
    const pt = eventToNorm(e)
    if (!pt) return
    e.currentTarget.setPointerCapture?.(e.pointerId)

    if (tool === 'select') {
      const hit = hitTestShape(doc, pt.x, pt.y, fit.w, fit.h)
      setSelectedId(hit?.id || null)
      if (hit) {
        dragRef.current = {
          id: hit.id,
          start: pt,
          origin: { ...hit },
        }
      }
      return
    }

    if (tool === 'text') {
      const label = (textDraft || '').trim() || 'Note'
      const shape = {
        id: makeAnnotationId('text'),
        type: 'text',
        x: pt.x,
        y: pt.y,
        text: label,
        stroke,
      }
      setDoc((d) => upsertShape(d, shape))
      setSelectedId(shape.id)
      return
    }

    const id = makeAnnotationId(tool)
    if (tool === 'arrow') {
      draftRef.current = { id, type: 'arrow', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, stroke }
    } else if (tool === 'ellipse') {
      draftRef.current = { id, type: 'ellipse', cx: pt.x, cy: pt.y, rx: 0.001, ry: 0.001, stroke }
    } else if (tool === 'rect') {
      draftRef.current = { id, type: 'rect', x: pt.x, y: pt.y, w: 0.001, h: 0.001, stroke, _sx: pt.x, _sy: pt.y }
    } else if (tool === 'freehand') {
      draftRef.current = { id, type: 'freehand', points: [pt], stroke }
    }
    setSelectedId(id)
    paint()
  }

  const onPointerMove = (e) => {
    const pt = eventToNorm(e)
    if (!pt) return

    if (tool === 'select' && dragRef.current) {
      const { id, start, origin } = dragRef.current
      const dx = pt.x - start.x
      const dy = pt.y - start.y
      let next = { ...origin, id }
      if (origin.type === 'arrow') {
        next = {
          ...next,
          x1: origin.x1 + dx,
          y1: origin.y1 + dy,
          x2: origin.x2 + dx,
          y2: origin.y2 + dy,
        }
      } else if (origin.type === 'ellipse') {
        next = { ...next, cx: origin.cx + dx, cy: origin.cy + dy }
      } else if (origin.type === 'rect' || origin.type === 'text') {
        next = { ...next, x: origin.x + dx, y: origin.y + dy }
      } else if (origin.type === 'freehand') {
        next = {
          ...next,
          points: (origin.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
        }
      }
      setDoc((d) => upsertShape(d, next))
      return
    }

    const draft = draftRef.current
    if (!draft) return

    if (draft.type === 'arrow') {
      draft.x2 = pt.x
      draft.y2 = pt.y
    } else if (draft.type === 'ellipse') {
      draft.rx = Math.max(0.001, Math.abs(pt.x - draft.cx))
      draft.ry = Math.max(0.001, Math.abs(pt.y - draft.cy))
    } else if (draft.type === 'rect') {
      const sx = draft._sx
      const sy = draft._sy
      draft.x = Math.min(sx, pt.x)
      draft.y = Math.min(sy, pt.y)
      draft.w = Math.max(0.001, Math.abs(pt.x - sx))
      draft.h = Math.max(0.001, Math.abs(pt.y - sy))
    } else if (draft.type === 'freehand') {
      draft.points = [...draft.points, pt]
    }
    paint()
  }

  const onPointerUp = () => {
    dragRef.current = null
    const draft = draftRef.current
    if (draft) {
      const { _sx, _sy, ...clean } = draft
      setDoc((d) => upsertShape(d, clean))
      draftRef.current = null
    }
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setDoc((d) => removeShape(d, selectedId))
    setSelectedId(null)
  }

  const clearAll = () => {
    setDoc((d) => createEmptyAnnotationDoc(d.imageWidth || naturalSize.w, d.imageHeight || naturalSize.h))
    setSelectedId(null)
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      const finalDoc = normalizeAnnotationDoc(doc, naturalSize.w, naturalSize.h)
      let overlayDataUrl = null
      if (hasAnnotations(finalDoc)) {
        overlayDataUrl = await annotationDocToOverlayDataUrl(
          finalDoc,
          naturalSize.w,
          naturalSize.h,
        )
      }
      await onSave({
        annotations: finalDoc,
        overlayDataUrl,
        imageWidth: naturalSize.w,
        imageHeight: naturalSize.h,
      })
    } finally {
      setSaving(false)
    }
  }

  const selected = doc.shapes.find((s) => s.id === selectedId) || null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          width: '100%',
          margin: '0 auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--plate)',
          border: '1px solid var(--edge)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--edge)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SecondaryButton type="button" onClick={onCancel} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryCTA type="button" accent={accent} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save annotations'}
            </PrimaryCTA>
          </div>
        </div>

        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--edge)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {TOOLS.map((t) => (
            <button key={t.id} type="button" style={toolBtn(tool === t.id)} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))}
          <label style={{ ...labelStyle, margin: '0 0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            Colour
            <input
              type="color"
              value={stroke}
              onChange={(e) => setStroke(e.target.value)}
              style={{ width: 32, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
            />
          </label>
          {tool === 'text' && (
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Label text"
              style={{
                minWidth: 140,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid var(--edge)',
                background: 'var(--ink)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            />
          )}
          <button type="button" style={toolBtn(false)} onClick={deleteSelected} disabled={!selectedId}>
            Delete
          </button>
          <button type="button" style={toolBtn(false)} onClick={clearAll} disabled={!doc.shapes.length}>
            Clear all
          </button>
        </div>

        <p style={{ margin: '8px 16px 0', fontSize: 12, color: 'var(--text-2)' }}>
          Original photo stays untouched. Marks are a transparent overlay (arrows, shapes, freehand, text).
        </p>

        <div
          ref={stageRef}
          style={{
            flex: 1,
            minHeight: 280,
            margin: 16,
            borderRadius: 10,
            border: '1px solid var(--edge)',
            background: '#1a1a1a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {imageSrc && fit.w > 0 && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: fit.x,
                  top: fit.y,
                  width: fit.w,
                  height: fit.h,
                  objectFit: 'fill',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
              <canvas
                ref={overlayRef}
                style={{
                  position: 'absolute',
                  left: fit.x,
                  top: fit.y,
                  width: fit.w,
                  height: fit.h,
                  touchAction: 'none',
                  cursor: tool === 'select' ? 'default' : 'crosshair',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </>
          )}
        </div>

        {selected?.type === 'text' && (
          <div style={{ padding: '0 16px 16px' }}>
            <label style={labelStyle}>Edit label</label>
            <input
              value={selected.text}
              onChange={(e) =>
                setDoc((d) => upsertShape(d, { ...selected, text: e.target.value }))
              }
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--edge)',
                background: 'var(--ink)',
                color: 'var(--text)',
                fontSize: 14,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
