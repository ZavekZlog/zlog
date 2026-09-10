'use client'

import { Barlow } from 'next/font/google'
import { Mic } from 'lucide-react'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['500'],
})

const FEATURES: { src: string; label: string }[] = [
  { src: '/landing-icons/zlog-voice-input.svg', label: 'Voice input' },
  { src: '/landing-icons/zlog-site-diaries.svg', label: 'Site diaries' },
  { src: '/landing-icons/zlog-inspections.svg', label: 'Inspections' },
  { src: '/landing-icons/zlog-progress.svg', label: 'Progress' },
]

const FEATURE_ICON_SIZE = 40

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
        return (
          <div
            key={feature.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: '100%',
              padding: '0 8px',
              boxSizing: 'border-box',
              textAlign: 'center',
              ...(index > 0
                ? {
                    backgroundImage:
                      'linear-gradient(color-mix(in srgb, var(--text) 16%, transparent), color-mix(in srgb, var(--text) 16%, transparent))',
                    backgroundSize: '1px calc(100% - 28px)',
                    backgroundPosition: 'left center',
                    backgroundRepeat: 'no-repeat',
                  }
                : {}),
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: FEATURE_ICON_SIZE,
                height: FEATURE_ICON_SIZE,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              <img
                src={feature.src}
                alt=""
                width={FEATURE_ICON_SIZE}
                height={FEATURE_ICON_SIZE}
                style={{
                  width: FEATURE_ICON_SIZE,
                  height: FEATURE_ICON_SIZE,
                  objectFit: 'contain',
                  objectPosition: 'center',
                  display: 'block',
                }}
              />
            </span>
            <span
              style={{
                fontFamily: barlow.style.fontFamily,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text)',
                lineHeight: 1.3,
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(11, 13, 18, 0.95), 0 0 8px rgba(11, 13, 18, 0.85)',
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
