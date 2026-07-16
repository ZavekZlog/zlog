'use client'

import { Barlow } from 'next/font/google'
import { Mic, Camera, ClipboardList, ShieldCheck, type LucideIcon } from 'lucide-react'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['500'],
})

const FEATURES: { Icon: LucideIcon; label: string }[] = [
  { Icon: Mic, label: 'Voice-led\nreporting' },
  { Icon: Camera, label: 'Photos\nauto-numbered' },
  { Icon: ClipboardList, label: 'Diaries, snags\n& surveys' },
  { Icon: ShieldCheck, label: 'Secure &\nbacked up' },
]

export function LandingFeatureStrip() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        alignItems: 'stretch',
        width: '100%',
        minHeight: 120,
        padding: '18px 12px 28px',
        background: 'transparent',
        boxSizing: 'border-box',
      }}
    >
      {FEATURES.map((feature, index) => {
        const Icon = feature.Icon
        return (
          <div
            key={feature.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              minWidth: 0,
              minHeight: '100%',
              padding: '0 8px',
              boxSizing: 'border-box',
              textAlign: 'center',
              borderLeft: index > 0 ? '1px solid var(--rust)' : 'none',
            }}
          >
            <span
              style={{
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                filter:
                  'drop-shadow(0 1px 2px color-mix(in srgb, var(--ink), transparent 25%)) drop-shadow(0 0 6px color-mix(in srgb, var(--ink), transparent 40%))',
              }}
            >
              <Icon size={30} strokeWidth={1.75} aria-hidden />
            </span>
            <span
              style={{
                fontFamily: barlow.style.fontFamily,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text)',
                lineHeight: 1.3,
                textAlign: 'center',
                width: '100%',
                whiteSpace: 'pre-line',
              }}
            >
              {feature.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function LandingMicIcon({
  size = 30,
  strokeWidth = 1.75,
}: {
  size?: number
  strokeWidth?: number
}) {
  return <Mic size={size} strokeWidth={strokeWidth} aria-hidden />
}
