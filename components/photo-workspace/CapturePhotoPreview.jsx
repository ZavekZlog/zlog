'use client'

/**
 * P2B Part 1 — large capture preview.
 * Image + rotate/delete/close only. No annotation, AI, or upload UI.
 * Optional description keeps existing Site Diary caption validation working.
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCw, Trash2, X } from 'lucide-react'
import { PrimaryCTA, SecondaryButton, inputStyle, labelStyle } from '@/lib/premium-ui'
import {
  userPhotoImgProtectionProps,
  userPhotoImgProtectionStyle,
} from '@/components/photo-workspace/user-photo-img-protection'
import { PhotoDeleteConfirmDialog } from '@/components/photo-workspace/PhotoDeleteConfirmDialog'
import { resolvePhotoDeleteConfirm } from '@/components/photo-workspace/photo-delete-confirm'
import {
  isBrowserDisplaySrc,
  viewerImageSrc,
} from '@/lib/photo-workspace/thumbnail-display'

const iconBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 48,
  minHeight: 48,
  width: 48,
  height: 48,
  padding: 0,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.28)',
  background: 'rgba(21,24,32,0.92)',
  color: '#F4F2EF',
  cursor: 'pointer',
  fontFamily: 'inherit',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
}

/**
 * @param {object} props
 * @param {object[]} props.photos
 * @param {number} [props.startIndex]
 * @param {string} [props.areaName]
 * @param {number[]} [props.globalNumbers]
 * @param {string} [props.accent]
 * @param {() => void} props.onClose
 * @param {(photoId: string) => void} [props.onDelete]
 * @param {(photoId: string) => void} [props.onRotate]
 * @param {(photoId: string, text: string) => void} [props.onCaptionChange]
 */
export function CapturePhotoPreview({
  photos = [],
  startIndex = 0,
  areaName = '',
  globalNumbers = [],
  accent,
  onClose,
  onDelete,
  onRotate,
  onCaptionChange,
  ensureReportPreview = null,
}) {
  const list = Array.isArray(photos) ? photos : []
  const maxIndex = Math.max(0, list.length - 1)
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), maxIndex))
  const [pendingDelete, setPendingDelete] = useState(null)
  const [resolvedSrc, setResolvedSrc] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E10 */
  useEffect(() => {
    setIndex(Math.min(Math.max(0, startIndex), maxIndex))
  }, [startIndex, maxIndex])
  /* eslint-enable react-hooks/set-state-in-effect */

  const safeIndex = Math.min(Math.max(0, index), maxIndex)
  const photo = list[safeIndex] || null
  const photoNumber = globalNumbers[safeIndex] ?? safeIndex + 1
  const degrees = Number(photo?.rotationDegrees) || 0
  const [draft, setDraft] = useState(() => photo?.acceptedDescription || '')

  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E11 */
  useEffect(() => {
    setDraft(photo?.acceptedDescription || '')
  }, [photo?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Phase D: use cached report preview, or sign canonical report path on demand.
  // Never use the 512px thumbnail in the full viewer.
  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E12 */
  useEffect(() => {
    let cancelled = false
    const immediate = viewerImageSrc(photo)
    if (immediate) {
      setResolvedSrc(immediate)
      return undefined
    }
    setResolvedSrc('')
    if (!photo || typeof ensureReportPreview !== 'function') return undefined
    void (async () => {
      try {
        const url = await ensureReportPreview(photo)
        if (!cancelled && isBrowserDisplaySrc(url)) setResolvedSrc(String(url).trim())
      } catch {
        if (!cancelled) setResolvedSrc('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [photo, photo?.id, photo?.preview, photo?.imageUrl, ensureReportPreview])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!photo) return null

  const src = resolvedSrc || viewerImageSrc(photo)

  const closeDeleteConfirm = () => {
    setPendingDelete(resolvePhotoDeleteConfirm(pendingDelete, 'cancel', onDelete))
  }
  const confirmDelete = () => {
    setPendingDelete(resolvePhotoDeleteConfirm(pendingDelete, 'confirm', onDelete))
  }

  const flush = () => {
    if (!photo?.id) return
    if (draft !== (photo.acceptedDescription || '')) {
      onCaptionChange?.(photo.id, draft)
    }
  }

  const go = (next) => {
    if (next < 0 || next > maxIndex) return
    flush()
    setIndex(next)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${photoNumber} preview`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        background: '#0b0d12',
        color: '#F4F2EF',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '12px 14px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.25 }}>
            Photo {photoNumber}
          </div>
          {areaName ? (
            <div style={{ fontSize: 13, opacity: 0.72, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {areaName}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={() => { flush(); onClose?.() }} aria-label="Close preview" style={iconBtn}>
          <X size={22} aria-hidden />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        }}
      >
        {list.length > 1 ? (
          <button
            type="button"
            disabled={safeIndex <= 0}
            onClick={() => go(safeIndex - 1)}
            aria-label="Previous photo"
            style={{
              ...iconBtn,
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              opacity: safeIndex <= 0 ? 0.35 : 1,
            }}
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
        ) : null}

        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
          <img
            src={src}
            alt={`Photo ${photoNumber}`}
            {...userPhotoImgProtectionProps()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: degrees ? `rotate(${degrees}deg)` : undefined,
              transition: 'transform 120ms ease',
              ...userPhotoImgProtectionStyle,
            }}
          />
        ) : null}

        {list.length > 1 ? (
          <button
            type="button"
            disabled={safeIndex >= maxIndex}
            onClick={() => go(safeIndex + 1)}
            aria-label="Next photo"
            style={{
              ...iconBtn,
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              opacity: safeIndex >= maxIndex ? 0.35 : 1,
            }}
          >
            <ChevronRight size={22} aria-hidden />
          </button>
        ) : null}
      </div>

      <div
        style={{
          padding: '12px 14px',
          paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {onCaptionChange ? (
          <div>
            <div style={{ ...labelStyle, color: 'rgba(244,242,239,0.78)', marginBottom: 6 }}>
              Photo caption
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={flush}
              rows={2}
              placeholder="Add caption (optional)"
              style={{
                ...inputStyle,
                marginBottom: 0,
                background: '#151820',
                color: '#F4F2EF',
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <SecondaryButton
            type="button"
            onClick={() => onRotate?.(photo.id)}
            style={{ minHeight: 48, flex: '1 1 120px' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <RotateCw size={18} aria-hidden /> Rotate
            </span>
          </SecondaryButton>
          <SecondaryButton
            type="button"
            onClick={() => setPendingDelete({ photoId: photo.id, photoNumber })}
            style={{ minHeight: 48, flex: '1 1 120px', color: '#ff6b6b' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={18} aria-hidden /> Delete
            </span>
          </SecondaryButton>
        </div>

        <PrimaryCTA
          type="button"
          accent={accent}
          onClick={() => { flush(); onClose?.() }}
          style={{ minHeight: 48, width: '100%' }}
        >
          Done
        </PrimaryCTA>
      </div>
      <PhotoDeleteConfirmDialog
        open={Boolean(pendingDelete?.photoId)}
        photoNumber={pendingDelete?.photoNumber}
        onCancel={closeDeleteConfirm}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
