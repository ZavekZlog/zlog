'use client'

import { SecondaryButton, textareaStyle } from '@/lib/premium-ui'

/**
 * Single photo in an active area group: preview, AI description, edit / regenerate / remove.
 */
export function AnnotationPhotoCard({
  photo,
  regenerating,
  onDescriptionChange,
  onRegenerate,
  onRemove,
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        gap: 12,
        padding: 12,
        borderRadius: 10,
        border: '1px solid var(--edge)',
        background: 'var(--plate)',
      }}
    >
      {photo.preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
        <img
          src={photo.preview}
          alt=""
          style={{
            width: 88,
            height: 88,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid var(--edge)',
          }}
        />
      ) : (
        <div style={{ width: 88, height: 88, borderRadius: 8, background: 'var(--edge)' }} />
      )}
      <div style={{ minWidth: 0 }}>
        <textarea
          value={photo.acceptedDescription || ''}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
          placeholder="Description"
          style={{ ...textareaStyle, marginBottom: 8, fontSize: 13 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <SecondaryButton type="button" disabled={regenerating} onClick={onRegenerate}>
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </SecondaryButton>
          <SecondaryButton type="button" disabled={regenerating} onClick={onRemove}>
            Remove
          </SecondaryButton>
        </div>
      </div>
    </div>
  )
}
