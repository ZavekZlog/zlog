'use client'

import { SecondaryButton, labelStyle } from '@/lib/premium-ui'

/**
 * List of saved annotation items for the current session / report.
 */
export function AnnotationSavedList({ items = [], onRemoveItem }) {
  if (!items.length) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>
        Saved at locations ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 1fr auto',
              gap: 12,
              alignItems: 'start',
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--edge)',
              background: 'var(--plate)',
            }}
          >
            {item.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.preview}
                alt=""
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--edge)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  background: 'var(--edge)',
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                📍 {item.location || '—'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>
                {item.description || '—'}
              </div>
            </div>
            {onRemoveItem && (
              <SecondaryButton type="button" onClick={() => onRemoveItem(item.key)}>
                Remove
              </SecondaryButton>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
