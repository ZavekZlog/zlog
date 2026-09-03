'use client'

import { PrimaryCTA, SecondaryButton, labelStyle, textareaStyle } from '@/lib/premium-ui'
import { ANNOTATION_PENDING_PREVIEW_IMG_STYLE } from '@/lib/photo-workspace/photo-001-no-crop'

/**
 * Pending capture: preview + AI description editor + Save / Discard.
 */
export function AnnotationPendingReview({
  accent,
  previewUrl,
  aiLoading,
  description,
  onDescriptionChange,
  descriptionLabel = 'Description',
  descriptionPlaceholder = 'AI description appears here — edit if needed',
  saving,
  onSave,
  onDiscard,
}) {
  if (!previewUrl && !aiLoading) return null

  return (
    <div style={{ marginTop: 14 }}>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
        <img
          src={previewUrl}
          alt="Capture preview"
          style={ANNOTATION_PENDING_PREVIEW_IMG_STYLE}
        />
      )}
      {aiLoading ? (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-2)' }}>
          AI writing description…
        </p>
      ) : (
        <>
          <label style={labelStyle}>{descriptionLabel}</label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            placeholder={descriptionPlaceholder}
            style={{ ...textareaStyle, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <PrimaryCTA
              type="button"
              accent={accent}
              disabled={saving || !description.trim()}
              onClick={onSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </PrimaryCTA>
            <SecondaryButton type="button" disabled={saving} onClick={onDiscard}>
              Discard
            </SecondaryButton>
          </div>
        </>
      )}
    </div>
  )
}
