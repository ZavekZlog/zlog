'use client'

import { Check, Pencil } from 'lucide-react'
import { hasAnnotations } from '@/lib/photo-annotations'
import { photoHasDescription } from '@/lib/ai-annotation/area-groups'

/**
 * Derived completion badges for Location Walk thumbnails / filmstrip.
 * Status comes from photo data only — never stored separately.
 */
export function PhotoStatusBadges({
  photo,
  current = false,
  size = 14,
  style = {},
}) {
  const described = photoHasDescription(photo)
  const annotated = hasAnnotations(photo?.annotations)

  if (!described && !annotated && !current) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      {described ? (
        <span
          role="img"
          aria-label="Description complete"
          title="Description complete"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size + 8,
            height: size + 8,
            borderRadius: 999,
            background: 'rgba(34, 197, 94, 0.22)',
            color: '#4ade80',
          }}
        >
          <Check size={size} strokeWidth={2.5} aria-hidden />
        </span>
      ) : null}
      {annotated ? (
        <span
          role="img"
          aria-label="Has annotations"
          title="Has annotations"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size + 8,
            height: size + 8,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            color: '#F4F2EF',
          }}
        >
          <Pencil size={size - 1} strokeWidth={2.25} aria-hidden />
        </span>
      ) : null}
      {current ? (
        <span
          role="img"
          aria-label="Current photo"
          title="Current photo"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--action, #FF5000)',
            boxShadow: '0 0 0 2px rgba(255,80,0,0.35)',
          }}
        />
      ) : null}
    </span>
  )
}
