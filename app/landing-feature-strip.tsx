'use client'

import { Barlow } from 'next/font/google'
import { Mic, Camera, ClipboardList, ShieldCheck, type LucideIcon } from 'lucide-react'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['500'],
})

const FEATURES: { Icon: LucideIcon; label: string }[] = [
  { Icon: Mic, label: 'Voice reports' },
  { Icon: Camera, label: 'Annotated photos' },
  { Icon: ClipboardList, label: 'Diaries & surveys' },
  { Icon: ShieldCheck, label: 'Secure backup' },
]

export function LandingFeatureStrip() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        justifyItems: 'stretch',
        alignItems: 'stretch',
        width: '100%',
        minHeight: 120,
        margin: '0 auto',
        padding: '28px 20px 28px',
        background: 'transparent',
        boxSizing: 'border-box',
        overflow: 'hidden',
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
              height: '100%',
              minWidth: 0,
              minHeight: '100%',
              padding: '0 8px',
              boxSizing: 'border-box',
              textAlign: 'center',
              ...(index > 0
                ? {
                    backgroundImage: 'linear-gradient(var(--edge), var(--edge))',
                    backgroundSize: '1px calc(100% - 24px)',
                    backgroundPosition: 'left center',
                    backgroundRepeat: 'no-repeat',
                  }
                : {}),
            }}
          >
            <span
              style={{
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                flexShrink: 0,
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
                maxWidth: '100%',
                minWidth: 0,
                height: '2.6em',
                flexShrink: 0,
                display: 'block',
                overflow: 'hidden',
              }}
            >
              {feature.label.replace(/\n/g, ' ')}
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
