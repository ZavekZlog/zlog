'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ZlogBrandRegion, BRAND_HEADER_SPACE } from '@/lib/premium-ui'

const UTILITY_RADIUS = 10

const utilityCardBase = {
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 40,
  padding: '7px 10px',
  borderRadius: UTILITY_RADIUS,
  border: '1px solid color-mix(in srgb, var(--edge) 52%, transparent)',
  background:
    'linear-gradient(165deg, color-mix(in srgb, var(--plate) 70%, var(--ink) 30%) 0%, color-mix(in srgb, var(--ink) 72%, var(--plate)) 100%)',
  boxShadow:
    'inset 0 1px 0 color-mix(in srgb, var(--edge-highlight) 40%, transparent), 0 2px 8px color-mix(in srgb, var(--ink) 22%, transparent)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  lineHeight: 1.15,
}

/**
 * Dashboard masthead — LOCKED ZlogBrandRegion, then Sign out.
 * Project/client context lives on Report Setup, not the dashboard.
 */
export function DashboardTopBar() {
  const router = useRouter()
  const supabase = createClient()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    // Clears Supabase auth session/cookies only — never stores or clears a raw password
    // (Zlog does not persist passwords). Login form DOM is reset via ?signedOut=1.
    await supabase.auth.signOut()
    router.replace('/login?signedOut=1')
    router.refresh()
  }

  return (
    <header
      className="premium-shell-header zlog-dashboard-topbar"
      style={{
        position: 'relative',
        zIndex: 60,
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--ink) 72%, var(--plate))',
        borderBottom: '1px solid var(--edge-highlight)',
        padding: `0 ${BRAND_HEADER_SPACE.headerPadX}px ${BRAND_HEADER_SPACE.headerPadX}px`,
      }}
    >
      <ZlogBrandRegion />

      <div
        className="zlog-header-utility-row"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'flex-end',
          gap: 8,
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          className="zlog-header-utility-card zlog-header-utility-card--signout"
          disabled={signingOut}
          onClick={handleSignOut}
          style={{
            ...utilityCardBase,
            flex: '0 0 auto',
            justifyContent: 'center',
            paddingInline: 14,
            fontSize: 13,
            fontWeight: 600,
            color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
            cursor: signingOut ? 'wait' : 'pointer',
            opacity: signingOut ? 0.7 : 1,
          }}
        >
          <LogOut size={14} strokeWidth={2} aria-hidden style={{ flexShrink: 0, opacity: 0.85 }} />
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </header>
  )
}
