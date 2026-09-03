'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Mic, Sparkles } from 'lucide-react'
import { PrimaryCTA, SecondaryButton, labelStyle, inputStyle } from '@/lib/premium-ui'
import { PhotoAnnotationViewer } from '@/components/photo-annotations'
import { hasAnnotations } from '@/lib/photo-annotations'
import { layoutToPerPage, photoHasDescription } from '@/lib/ai-annotation/area-groups'
import { useSpeechDictation } from '@/components/ai-annotation/useSpeechDictation'
import { PhotoStatusBadges } from '@/components/ai-annotation/PhotoStatusBadges'

const DESC_PLACEHOLDER = 'Describe what this photo shows...'

const iconBtnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 48,
  minHeight: 48,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.32)',
  background: '#151820',
  color: '#F4F2EF',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
}

const chevronBtn = (disabled) => ({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 48,
  minHeight: 48,
  width: 48,
  height: 48,
  padding: 0,
  border: 'none',
  borderRadius: 12,
  background: disabled ? 'rgba(11,13,18,0.25)' : 'rgba(11,13,18,0.62)',
  color: disabled ? 'rgba(244,242,239,0.28)' : '#F4F2EF',
  cursor: disabled ? 'default' : 'pointer',
  WebkitTapHighlightColor: 'transparent',
})

const FilmstripThumb = memo(function FilmstripThumb({
  photo,
  photoNumber,
  active,
  incomplete,
  onSelect,
  thumbRef,
}) {
  const src = photo.preview || photo.imageUrl
  return (
    <button
      ref={thumbRef}
      type="button"
      onClick={onSelect}
      aria-label={`Photo ${photoNumber}${photoHasDescription(photo) ? ', description complete' : ', description missing'}${hasAnnotations(photo.annotations) ? ', has annotations' : ''}${active ? ', current' : ''}`}
      aria-current={active ? 'true' : undefined}
      style={{
        flex: '0 0 auto',
        width: 72,
        minHeight: 88,
        padding: 4,
        borderRadius: 10,
        border: active
          ? '2px solid var(--action, #FF5000)'
          : incomplete
            ? '2px solid rgba(251, 146, 60, 0.7)'
            : '1px solid rgba(255,255,255,0.18)',
        background: active ? 'rgba(255,80,0,0.12)' : '#151820',
        boxShadow: active ? '0 0 0 2px rgba(255,80,0,0.28)' : 'none',
        cursor: 'pointer',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 52,
          borderRadius: 6,
          overflow: 'hidden',
          background: '#0b0d12',
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : null}
        <div style={{ position: 'absolute', top: 2, right: 2 }}>
          <PhotoStatusBadges photo={photo} current={active} size={11} />
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          fontWeight: active ? 700 : 500,
          color: active ? '#F4F2EF' : 'rgba(244,242,239,0.72)',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        Photo {photoNumber}
      </div>
    </button>
  )
})

/**
 * Full-screen mobile photo viewer for Location Walk.
 * Contain-fit only — never crops. Returns focus to the caller on Done.
 */
export function AreaPhotoViewer({
  photos = [],
  startIndex = 0,
  areaName = '',
  globalNumbers = [],
  accent,
  onClose,
  onCaptionChange,
  onAnnotate,
  onReplace,
  onDelete,
}) {
  const list = Array.isArray(photos) ? photos : []
  const maxIndex = Math.max(0, list.length - 1)
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), maxIndex))
  const safeIndex = Math.min(Math.max(0, index), maxIndex)

  const photo = list[safeIndex] || null
  const photoNumber = globalNumbers[safeIndex] ?? safeIndex + 1
  const [draft, setDraft] = useState(() => photo?.acceptedDescription || '')
  const draftRef = useRef(draft)
  const photoIdRef = useRef(photo?.id)
  const descRef = useRef(null)
  const filmstripRef = useRef(null)
  const activeThumbRef = useRef(null)
  const touchXRef = useRef(null)

  const canPrev = safeIndex > 0
  const canNext = safeIndex < maxIndex

  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E7 */
  useEffect(() => {
    const next = Math.min(Math.max(0, startIndex), maxIndex)
    setIndex(next)
  }, [startIndex, maxIndex])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  // Sync draft when switching photos only (avoid clobbering in-progress typing).
  useEffect(() => {
    if (!photo) return
    if (photoIdRef.current !== photo.id) {
      photoIdRef.current = photo.id
      setDraft(photo.acceptedDescription || '')
    }
  }, [photo])

  useEffect(() => {
    const el = activeThumbRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [safeIndex])

  const flushDescription = useCallback(() => {
    if (!photo?.id) return
    const next = draftRef.current
    if (next !== (photo.acceptedDescription || '')) {
      onCaptionChange?.(photo.id, next)
    }
  }, [onCaptionChange, photo])

  const goToIndex = useCallback((nextIndex, { focusDescription = false } = {}) => {
    if (nextIndex < 0 || nextIndex > maxIndex) return
    flushDescription()
    setIndex(nextIndex)
    if (focusDescription) {
      requestAnimationFrame(() => {
        // Focus without forcing the software keyboard on mobile.
        try {
          descRef.current?.focus?.({ preventScroll: true })
        } catch {
          descRef.current?.focus?.()
        }
      })
    }
  }, [flushDescription, maxIndex])

  const handleDone = useCallback(() => {
    flushDescription()
    onClose?.()
  }, [flushDescription, onClose])

  const applyDictation = useCallback(
    (text) => {
      if (!photo?.id || !text) return
      setDraft((prev) => {
        const current = String(prev || '').trim()
        const next = current ? `${current} ${text}` : text
        onCaptionChange?.(photo.id, next)
        return next
      })
    },
    [onCaptionChange, photo?.id],
  )

  const { start: startDictation, listening, supported: dictationSupported } =
    useSpeechDictation(applyDictation)

  const onDescChange = (value) => {
    setDraft(value)
    if (photo?.id) onCaptionChange?.(photo.id, value)
  }

  const handleReplace = () => {
    flushDescription()
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(
        `Replace Photo ${photoNumber}? Annotations on this photo will be cleared. The description will be kept.`,
      )
    if (ok) onReplace?.(photo.id)
  }

  const handleDelete = () => {
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(
        `Delete Photo ${photoNumber}? This removes the photo from the report sequence.`,
      )
    if (!ok) return
    flushDescription()
    onDelete?.(photo.id)
  }

  const onTouchStart = (e) => {
    touchXRef.current = e.touches?.[0]?.clientX ?? null
  }
  const onTouchEnd = (e) => {
    const startX = touchXRef.current
    touchXRef.current = null
    if (startX == null) return
    const endX = e.changedTouches?.[0]?.clientX
    if (endX == null) return
    const dx = endX - startX
    if (dx > 56 && canPrev) goToIndex(safeIndex - 1)
    else if (dx < -56 && canNext) goToIndex(safeIndex + 1)
  }

  const filmstripItems = useMemo(
    () => list.map((p, i) => ({
      photo: p,
      photoNumber: globalNumbers[i] ?? i + 1,
      incomplete: !photoHasDescription(p),
    })),
    [list, globalNumbers],
  )

  if (!photo) return null

  const annotateLabel = hasAnnotations(photo.annotations)
    ? 'Edit Photo Annotations'
    : 'Annotate Photo'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: '#0b0d12',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        .zlog-photo-desc::placeholder {
          color: rgba(244, 242, 239, 0.62);
          opacity: 1;
        }
        .zlog-photo-filmstrip {
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>

      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#F4F2EF' }}>
            Photo {photoNumber}
            <span style={{ fontWeight: 500, color: 'rgba(244,242,239,0.55)', marginLeft: 8 }}>
              {safeIndex + 1}/{list.length}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(244,242,239,0.72)', marginTop: 2 }}>
            {areaName || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PhotoStatusBadges photo={{ ...photo, acceptedDescription: draft }} current size={14} />
          <SecondaryButton type="button" onClick={handleDone} style={{ minHeight: 48 }}>
            Done
          </SecondaryButton>
        </div>
      </div>

      {/* Primary visual — larger contain-fit stage */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative',
          flex: '1 1 auto',
          minHeight: 'min(52vh, 480px)',
          maxHeight: '62vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 56px',
          background: '#111318',
        }}
      >
        <PhotoAnnotationViewer
          imageSrc={photo.preview || photo.imageUrl}
          overlaySrc={photo.overlayPreview}
          alt={`Photo ${photoNumber}`}
          width="100%"
          height="100%"
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '100%',
            borderRadius: 0,
            border: 'none',
            background: 'transparent',
          }}
        />
        <button
          type="button"
          aria-label="Previous photo"
          disabled={!canPrev}
          onClick={() => goToIndex(safeIndex - 1)}
          style={{ ...chevronBtn(!canPrev), left: 6 }}
        >
          <ChevronLeft size={28} strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next photo"
          disabled={!canNext}
          onClick={() => goToIndex(safeIndex + 1)}
          style={{ ...chevronBtn(!canNext), right: 6 }}
        >
          <ChevronRight size={28} strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: '10px 16px 12px',
          borderTop: '1px solid rgba(255,255,255,0.14)',
          overflowX: 'hidden',
          maxHeight: '48vh',
          overflowY: 'auto',
        }}
      >
        <label
          htmlFor={`photo-desc-${photo.id}`}
          style={{
            ...labelStyle,
            color: '#F4F2EF',
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          Photo Description
        </label>

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 6 }}>
          <textarea
            ref={descRef}
            id={`photo-desc-${photo.id}`}
            className="zlog-photo-desc"
            value={draft}
            onChange={(e) => onDescChange(e.target.value)}
            onBlur={flushDescription}
            placeholder={DESC_PLACEHOLDER}
            rows={3}
            style={{
              ...inputStyle,
              flex: 1,
              minWidth: 0,
              marginBottom: 0,
              minHeight: 96,
              fontSize: 16,
              lineHeight: 1.4,
              resize: 'vertical',
              background: '#1a1d24',
              color: '#F4F2EF',
              border: '2px solid rgba(255,255,255,0.4)',
              borderRadius: 10,
              padding: '12px 14px',
            }}
          />
          {dictationSupported ? (
            <button
              type="button"
              onClick={() => (listening ? null : startDictation())}
              aria-label={listening ? 'Listening' : 'Dictate photo description'}
              aria-pressed={listening}
              title={listening ? 'Listening…' : 'Dictate'}
              style={{
                ...iconBtnBase,
                alignSelf: 'flex-start',
                borderColor: listening
                  ? 'color-mix(in srgb, var(--action) 55%, transparent)'
                  : 'rgba(255,255,255,0.32)',
                background: listening
                  ? 'color-mix(in srgb, var(--action) 22%, #151820)'
                  : '#151820',
              }}
            >
              <Mic size={22} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled
            aria-label="AI descriptions coming soon"
            title="AI descriptions coming soon"
            style={{
              ...iconBtnBase,
              alignSelf: 'flex-start',
              flexDirection: 'column',
              gap: 2,
              opacity: 0.45,
              cursor: 'not-allowed',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            <Sparkles size={16} strokeWidth={2} aria-hidden />
            AI
          </button>
        </div>

        {!String(draft).trim() ? (
          <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.4, color: 'rgba(244,242,239,0.55)' }}>
            Required before finishing the report.
          </p>
        ) : (
          <div style={{ height: 10 }} />
        )}

        <PrimaryCTA
          type="button"
          accent={accent}
          onClick={() => {
            flushDescription()
            onAnnotate?.(photo.id)
          }}
          className="w-full"
          style={{ width: '100%', minHeight: 48, marginBottom: 10 }}
        >
          {annotateLabel}
        </PrimaryCTA>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <SecondaryButton
            type="button"
            aria-label={`Replace Photo ${photoNumber}`}
            onClick={handleReplace}
            style={{ flex: 1, minHeight: 48 }}
          >
            Replace
          </SecondaryButton>
          <SecondaryButton
            type="button"
            aria-label={`Delete Photo ${photoNumber}`}
            onClick={handleDelete}
            style={{
              flex: 1,
              minHeight: 48,
              borderColor: 'rgba(229,72,77,0.55)',
              color: '#ff8a8a',
            }}
          >
            Delete
          </SecondaryButton>
        </div>

        <div
          ref={filmstripRef}
          className="zlog-photo-filmstrip"
          role="listbox"
          aria-label="Photo filmstrip"
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            overflowY: 'hidden',
            paddingBottom: 4,
            marginInline: -4,
            paddingInline: 4,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {filmstripItems.map((item, i) => (
            <FilmstripThumb
              key={item.photo.id}
              photo={item.photo}
              photoNumber={item.photoNumber}
              active={i === safeIndex}
              incomplete={item.incomplete}
              onSelect={() => goToIndex(i)}
              thumbRef={i === safeIndex ? activeThumbRef : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function layoutChipLabel(layout) {
  return `${layoutToPerPage(layout)} per page`
}

const chipBtn = (active) => ({
  minWidth: 48,
  minHeight: 48,
  padding: '12px 16px',
  borderRadius: 10,
  border: active ? '1px solid color-mix(in srgb, var(--action) 55%, transparent)' : '1px solid var(--edge)',
  background: active ? 'color-mix(in srgb, var(--action) 18%, transparent)' : 'var(--plate)',
  color: 'var(--text)',
  fontSize: 15,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
})

export function PhotosPerPagePicker({ layout, onChange, disabled = false }) {
  const options = useMemo(() => [1, 4, 6], [])
  const current = layoutToPerPage(layout)
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          style={chipBtn(current === n)}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
