'use client'

import { Barlow } from 'next/font/google'
import { Mic, ClipboardList, Check, type LucideIcon, type LucideProps } from 'lucide-react'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['500'],
})

/** Folded site plan with location pin — matches Lucide size/stroke of sibling icons */
function SiteSurveyIcon({ size = 30, strokeWidth = 1.75, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {/* Folded site-plan panels */}
      <path d="M9 3.236v15" />
      <path d="M15 5.764v15" />
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      {/* Location pin on the plan */}
      <path d="M12 8.4a1.85 1.85 0 0 1 1.85 1.85c0 1.35-1.85 3.05-1.85 3.05S10.15 11.6 10.15 10.25A1.85 1.85 0 0 1 12 8.4Z" />
      <circle cx="12" cy="10.25" r="0.65" fill="currentColor" stroke="none" />
    </svg>
  )
}

const FEATURES: { Icon: LucideIcon; label: string }[] = [
  { Icon: Mic, label: 'Voice input' },
  { Icon: ClipboardList, label: 'Site diaries' },
  { Icon: SiteSurveyIcon as LucideIcon, label: 'Site surveys' },
  { Icon: Check, label: 'Snag lists' },
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
