'use client'

import { PrimaryCTA, SecondaryButton, inputStyle, labelStyle } from '@/lib/premium-ui'

/**
 * Persistent Current Area bar — inherited by every photo until changed.
 */
export function AnnotationLocationBar({
  accent,
  location,
  editing,
  draft,
  onDraftChange,
  onConfirm,
  onChangeLocation,
  placeholder = 'e.g. Apartment 2.04',
}) {
  if (editing) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Current Area</div>
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, marginBottom: 10 }}
          autoComplete="off"
        />
        <PrimaryCTA type="button" accent={accent} onClick={onConfirm}>
          Continue
        </PrimaryCTA>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>Current Area</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--edge)',
          background: 'var(--plate)',
          boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-2)', marginBottom: 4 }}>
            CURRENT AREA
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{location}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>
            Inherited by every photo until you change it
          </div>
        </div>
        <SecondaryButton type="button" onClick={onChangeLocation}>
          📍 Change Area
        </SecondaryButton>
      </div>
    </div>
  )
}
