'use client'

/**
 * P2B Part 1 — capture thumbnail grid.
 * Preview + optional caption + delete + rotate. No annotation / AI / upload chrome.
 */

import { RotateCw, Trash2 } from 'lucide-react'

const thumbBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  minWidth: 40,
  minHeight: 40,
  padding: 0,
  borderRadius: 10,
  border: '1px solid var(--edge)',
  background: 'var(--plate)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
}

const captionInputStyle = {
  boxSizing: 'border-box',
  width: '100%',
  marginTop: 6,
  marginBottom: 0,
  padding: '6px 8px',
  minHeight: 36,
  borderRadius: 8,
  border: '1px solid var(--edge)',
  background: 'color-mix(in srgb, var(--ink) 55%, var(--plate))',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.3,
  resize: 'none',
}

const assignedInputStyle = {
  ...captionInputStyle,
  minHeight: 34,
  fontSize: 12,
}

/**
 * @param {object} props
 * @param {object[]} props.photos
 * @param {number} [props.numberOffset]
 * @param {(index: number) => void} props.onOpen
 * @param {(photoId: string) => void} props.onDelete
 * @param {(photoId: string) => void} props.onRotate
 * @param {(photoId: string, text: string) => void} [props.onCaptionChange]
 * @param {(photoId: string, text: string) => void} [props.onAssignedToChange]
 */
export function CaptureThumbnailGrid({
  photos = [],
  numberOffset = 0,
  onOpen,
  onDelete,
  onRotate,
  onCaptionChange,
  onAssignedToChange,
}) {
  const list = Array.isArray(photos) ? photos : []
  if (!list.length) return null

  return (
    <div
      role="list"
      aria-label="Photos in this area"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 10,
        marginTop: 14,
      }}
    >
      {list.map((photo, index) => {
        const photoNumber = numberOffset + index + 1
        const src = photo.preview || photo.imageUrl || ''
        const degrees = Number(photo.rotationDegrees) || 0
        const caption = photo.acceptedDescription || photo.caption || ''
        const assignedTo = photo.assignedTo || photo.assigned_to || ''
        return (
          <div
            key={photo.id}
            role="listitem"
            style={{
              borderRadius: 12,
              border: '1px solid var(--edge)',
              background: 'color-mix(in srgb, var(--plate) 92%, var(--bg))',
              padding: 6,
              minWidth: 0,
            }}
          >
            <button
              type="button"
              onClick={() => onOpen?.(index)}
              aria-label={`Photo ${photoNumber}, open preview`}
              style={{
                display: 'block',
                width: '100%',
                padding: 0,
                border: 'none',
                borderRadius: 8,
                background: '#0b0d12',
                cursor: 'pointer',
                overflow: 'hidden',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
                      transform: degrees ? `rotate(${degrees}deg)` : undefined,
                      transition: 'transform 120ms ease',
                    }}
                  />
                ) : null}
              </div>
            </button>

            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              Photo {photoNumber}
            </div>

            {onCaptionChange ? (
              <textarea
                value={caption}
                rows={2}
                placeholder="Add caption (optional)"
                aria-label={`Caption for Photo ${photoNumber} (optional)`}
                onChange={(e) => onCaptionChange(photo.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={captionInputStyle}
              />
            ) : null}

            {onAssignedToChange ? (
              <input
                type="text"
                value={assignedTo}
                placeholder="Assigned to"
                aria-label={`Assigned to for Photo ${photoNumber} (optional)`}
                onChange={(e) => onAssignedToChange(photo.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={assignedInputStyle}
              />
            ) : null}

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={() => onRotate?.(photo.id)}
                aria-label={`Rotate Photo ${photoNumber}`}
                title="Rotate"
                style={thumbBtn}
              >
                <RotateCw size={18} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window === 'undefined' || window.confirm(`Delete Photo ${photoNumber}?`)) {
                    onDelete?.(photo.id)
                  }
                }}
                aria-label={`Delete Photo ${photoNumber}`}
                title="Delete"
                style={{
                  ...thumbBtn,
                  color: '#ff6b6b',
                  borderColor: 'rgba(220,50,50,0.35)',
                }}
              >
                <Trash2 size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
