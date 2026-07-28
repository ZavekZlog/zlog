'use client'

import { useId } from 'react'

const buttonBase = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 56,
  padding: '14px 12px',
  borderRadius: 12,
  border: '1px solid var(--edge)',
  background: 'var(--plate)',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  fontFamily: 'inherit',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
  position: 'relative',
  overflow: 'hidden',
}

/**
 * Dual triggers for image capture vs gallery — both call the same onFiles handler.
 * Camera/gallery use a full-size overlaid <input> so mobile browsers treat the tap
 * as a direct file-input gesture (programmatic .click() on a clipped input is ignored).
 * @param {(files: File[]) => void} onFiles
 */
export function ImageSourceButtons({
  onFiles,
  multiple = false,
  disabled = false,
  hint = null,
  cameraLabel = 'Take Photo',
  galleryLabel = 'Upload from Gallery',
}) {
  const uid = useId()
  const cameraId = `${uid}-camera`
  const galleryId = `${uid}-gallery`

  const emitFiles = (e) => {
    const input = e.target
    const files = Array.from(input.files || []).filter(Boolean)
    // Reset so the same photo can be re-selected; cancel leaves files empty.
    input.value = ''
    if (!files.length) return
    onFiles(files)
  }

  const overlayInputStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    margin: 0,
    padding: 0,
    border: 0,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 16,
    // Keep the control tappable on iOS; do not clip or size to 1px.
  }

  return (
    <div style={{ width: '100%' }}>
      <div
        role="group"
        aria-label="Choose image source"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        <label
          className="zlog-secondary-btn"
          aria-label={cameraLabel}
          style={{
            ...buttonBase,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
        >
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            multiple={multiple}
            disabled={disabled}
            onChange={emitFiles}
            style={overlayInputStyle}
          />
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, pointerEvents: 'none' }}>📷</span>
          <span style={{ pointerEvents: 'none' }}>{cameraLabel}</span>
        </label>
        <label
          className="zlog-secondary-btn"
          aria-label={galleryLabel}
          style={{
            ...buttonBase,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
        >
          <input
            id={galleryId}
            type="file"
            accept="image/*"
            multiple={multiple}
            disabled={disabled}
            onChange={emitFiles}
            style={overlayInputStyle}
          />
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, pointerEvents: 'none' }}>🗂️</span>
          <span style={{ pointerEvents: 'none' }}>{galleryLabel}</span>
        </label>
      </div>

      {hint ? (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-2, #9A968F)', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
