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

/** Simple one-tap palette — Orange is the default (DEFAULT_STROKE). */
const COLOUR_SWATCHES = [
  { id: 'red', label: 'Red', value: '#E53935' },
  { id: 'orange', label: 'Orange', value: '#FF5000' },
  { id: 'yellow', label: 'Yellow', value: '#FDD835' },
  { id: 'green', label: 'Green', value: '#43A047' },
  { id: 'blue', label: 'Blue', value: '#1E88E5' },
  { id: 'purple', label: 'Purple', value: '#8E24AA' },
  { id: 'black', label: 'Black', value: '#111111' },
  { id: 'white', label: 'White', value: '#FFFFFF' },
]

const toolBtn = (active, danger = false) => ({
  minHeight: 48,
  minWidth: 48,
  padding: '10px 14px',
  borderRadius: 10,
  border: active
    ? '1px solid color-mix(in srgb, var(--action) 55%, transparent)'
    : danger
      ? '1px solid rgba(229,72,77,0.45)'
      : '1px solid var(--edge)',
  background: active ? 'color-mix(in srgb, var(--action) 18%, transparent)' : 'transparent',
  color: danger ? '#ff8a8a' : 'var(--text)',
  fontSize: 14,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  opacity: undefined,
  WebkitTapHighlightColor: 'transparent',
})

const fieldStyle = {
  width: '100%',
  minHeight: 48,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--edge)',
  background: 'var(--ink)',
  color: 'var(--text)',
  fontSize: 16,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
}

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
  const textInputRef = useRef(null)
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

  useEffect(() => {
    if (tool === 'text') {
      requestAnimationFrame(() => textInputRef.current?.focus?.())
    }
  }, [tool])

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
    if (!rect.width || !rect.height) return null
    // Slight padding helps finger accuracy on mobile.
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (x < -0.04 || y < -0.04 || x > 1.04 || y > 1.04) return null
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    }
  }

  const onPointerDown = (e) => {
    const pt = eventToNorm(e)
    if (!pt) return
    e.currentTarget.setPointerCapture?.(e.pointerId)

    if (tool === 'select') {
      const hit = hitTestShape(doc, pt.x, pt.y, fit.w, fit.h)
      setSelectedId(hit?.id || null)
      if (hit) {
        if (hit.stroke) setStroke(hit.stroke)
        if (hit.type === 'text') setTextDraft(hit.text || '')
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
      setTool('select')
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
    if (!doc.shapes.length) return
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm('Clear all annotations on this photo?')
    if (!ok) return
    setDoc((d) => createEmptyAnnotationDoc(d.imageWidth || naturalSize.w, d.imageHeight || naturalSize.h))
    setSelectedId(null)
  }

  const setActiveColour = (value) => {
    setStroke(value)
    if (selectedId) {
      setDoc((d) => {
        const shape = d.shapes.find((s) => s.id === selectedId)
        if (!shape) return d
        return upsertShape(d, { ...shape, stroke: value })
      })
    }
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
  const editingText = selected?.type === 'text'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: '#0b0d12',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          margin: '0 auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--plate)',
          overflow: 'hidden',
        }}
      >
        {/* Top: title + Cancel / Save */}
        <div
          style={{
            padding: '10px 14px',
            paddingTop: 'max(10px, env(safe-area-inset-top, 0px))',
            borderBottom: '1px solid var(--edge)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: 'var(--plate)',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              color: 'var(--text)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <SecondaryButton
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{ minHeight: 48, minWidth: 88, padding: '10px 16px' }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryCTA
              type="button"
              accent={accent}
              onClick={handleSave}
              disabled={saving}
              style={{ minHeight: 48, minWidth: 88, padding: '10px 18px' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </PrimaryCTA>
          </div>
        </div>

        {/* Tools + colour */}
        <div
          style={{
            padding: '10px 14px 12px',
            borderBottom: '1px solid var(--edge)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flexShrink: 0,
            background: 'var(--plate)',
          }}
        >
          <div
            role="toolbar"
            aria-label="Annotation tools"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 2,
            }}
          >
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                aria-label={t.label}
                style={{ ...toolBtn(tool === t.id), flexShrink: 0 }}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              aria-label="Delete selected annotation"
              style={{ ...toolBtn(false, true), flexShrink: 0, opacity: selectedId ? 1 : 0.45 }}
              onClick={deleteSelected}
              disabled={!selectedId}
            >
              Delete
            </button>
            <button
              type="button"
              aria-label="Clear all annotations"
              style={{ ...toolBtn(false, true), flexShrink: 0, opacity: doc.shapes.length ? 1 : 0.45 }}
              onClick={clearAll}
              disabled={!doc.shapes.length}
            >
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                ...labelStyle,
                margin: 0,
                letterSpacing: '0.06em',
                flexShrink: 0,
                color: 'color-mix(in srgb, var(--text) 80%, var(--text-2))',
              }}
            >
              Colour
            </span>
            <div
              role="listbox"
              aria-label="Annotation colour"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                flex: 1,
                minWidth: 0,
                padding: '2px 0',
              }}
            >
              {COLOUR_SWATCHES.map((c) => {
                const active = String(stroke).toLowerCase() === c.value.toLowerCase()
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => setActiveColour(c.value)}
                    style={{
                      width: 44,
                      height: 44,
                      minWidth: 44,
                      minHeight: 44,
                      padding: 0,
                      borderRadius: 999,
                      border: active ? '3px solid #FF5000' : '2px solid rgba(255,255,255,0.28)',
                      background: c.value,
                      boxShadow: active
                        ? '0 0 0 2px rgba(0,0,0,0.55)'
                        : c.id === 'white'
                          ? 'inset 0 0 0 1px rgba(0,0,0,0.28)'
                          : 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  />
                )
              })}
            </div>
          </div>

          {tool === 'text' && !editingText ? (
            <div>
              <label htmlFor="zlog-ann-text-draft" style={{ ...labelStyle, marginBottom: 6 }}>
                Text label
              </label>
              <input
                ref={textInputRef}
                id="zlog-ann-text-draft"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder="Type label, then tap the photo to place it"
                aria-label="Text label to place"
                style={fieldStyle}
              />
            </div>
          ) : null}
        </div>

        {/* Canvas — primary visual */}
        <div
          ref={stageRef}
          style={{
            flex: 1,
            minHeight: 200,
            margin: 0,
            background: '#111318',
            position: 'relative',
            overflow: 'hidden',
            touchAction: 'none',
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
                aria-label="Annotation canvas"
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

        {/* Edit selected text — bottom for thumb reach */}
        {editingText ? (
          <div
            style={{
              padding: '12px 14px',
              paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid var(--edge)',
              flexShrink: 0,
              background: 'var(--plate)',
            }}
          >
            <label htmlFor="zlog-ann-text-edit" style={{ ...labelStyle, marginBottom: 6 }}>
              Edit text
            </label>
            <input
              id="zlog-ann-text-edit"
              value={selected.text}
              onChange={(e) => {
                const next = e.target.value
                setTextDraft(next)
                setDoc((d) => upsertShape(d, { ...selected, text: next || 'Note' }))
              }}
              style={fieldStyle}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
