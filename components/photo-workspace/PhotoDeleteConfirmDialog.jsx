'use client'

import { DestructiveButton, SecondaryButton } from '@/lib/premium-ui'
import {
  PHOTO_DELETE_CONFIRM_MESSAGE,
  photoDeleteConfirmTitle,
} from '@/components/photo-workspace/photo-delete-confirm'

/**
 * In-app confirmation for deleting one Site Diary work-photo.
 * Zlog-owned plate — no browser/hostname confirmation chrome.
 */
export function PhotoDeleteConfirmDialog({
  open,
  photoNumber,
  onCancel,
  onConfirm,
}) {
  if (!open) return null
  const title = photoDeleteConfirmTitle(photoNumber)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="zlog-delete-photo-title"
      aria-describedby="zlog-delete-photo-message"
      data-zlog-photo-delete-confirm="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'color-mix(in srgb, var(--ink) 76%, transparent)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '20px 18px 16px',
          borderRadius: 12,
          border: '1px solid color-mix(in srgb, var(--danger) 42%, var(--edge))',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--plate) 82%, var(--text) 4%) 0%, color-mix(in srgb, var(--ink) 55%, var(--plate)) 100%)',
          boxShadow:
            'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 86%), 0 12px 32px color-mix(in srgb, var(--ink) 55%, transparent)',
        }}
      >
        <h2
          id="zlog-delete-photo-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.25,
            color: 'var(--text)',
          }}
        >
          {title}
        </h2>
        <p
          id="zlog-delete-photo-message"
          style={{
            margin: '10px 0 0',
            fontSize: 15,
            lineHeight: 1.45,
            color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
          }}
        >
          {PHOTO_DELETE_CONFIRM_MESSAGE}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          <SecondaryButton
            type="button"
            onClick={onCancel}
            style={{ flex: '1 1 120px', width: 'auto', minHeight: 48 }}
          >
            Cancel
          </SecondaryButton>
          <DestructiveButton
            type="button"
            onClick={onConfirm}
            style={{ flex: '1 1 150px', width: 'auto', minHeight: 48 }}
          >
            Delete
          </DestructiveButton>
        </div>
      </div>
    </div>
  )
}
