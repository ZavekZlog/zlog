'use client'

import { useRef } from 'react'

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
}

/**
 * Dual triggers for image capture vs gallery — both call the same onFiles handler.
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
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  const emitFiles = (e) => {
    const files = Array.from(e.target.files || [])
    // Reset so the same photo can be re-selected
    e.target.value = ''
    if (!files.length) return
    onFiles(files)
  }

  return (
    <div style={{ width: '100%' }}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        disabled={disabled}
        onChange={emitFiles}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        onChange={emitFiles}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        tabIndex={-1}
        aria-hidden
      />

      <div
        role="group"
        aria-label="Choose image source"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        <button
          type="button"
          className="zlog-secondary-btn"
          disabled={disabled}
          onClick={() => cameraInputRef.current?.click()}
          style={{ ...buttonBase, opacity: disabled ? 0.5 : 1 }}
          aria-label={cameraLabel}
        >
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>📷</span>
          <span>{cameraLabel}</span>
        </button>
        <button
          type="button"
          className="zlog-secondary-btn"
          disabled={disabled}
          onClick={() => galleryInputRef.current?.click()}
          style={{ ...buttonBase, opacity: disabled ? 0.5 : 1 }}
          aria-label={galleryLabel}
        >
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>🗂️</span>
          <span>{galleryLabel}</span>
        </button>
      </div>

      {hint ? (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-2, #9A968F)', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
