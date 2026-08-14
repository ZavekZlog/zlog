'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ZlogBrandRegion } from '@/lib/premium-ui'
import { SIGN_OUT_LOGIN_HREF, performDashboardSignOut } from '@/lib/auth/sign-out'
import { DASHBOARD_CONTENT_GRID } from '@/lib/dashboard-content-grid'

/**
 * Compact dashboard masthead matching the accepted screenshot:
 * centred Zlog + established glow, then framed Sign out BELOW, right-aligned
 * to the dashboard card grid. Header is transparent so the page surface is continuous.
 */
export function DashboardTopBar() {
  const router = useRouter()
  const supabase = createClient()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      // Clears local auth session only — never stores or clears a raw password.
      // Login form DOM is reset via ?signedOut=1. Always navigate even if signOut hangs/throws.
      await performDashboardSignOut({
        signOut: (options) => supabase.auth.signOut(options),
        goToLogin: (href) => {
          const target = href || SIGN_OUT_LOGIN_HREF
          router.replace(target)
          router.refresh()
          if (typeof window !== 'undefined') {
            window.location.assign(target)
          }
        },
      })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header
      className="premium-shell-header zlog-dashboard-topbar"
      style={{
        position: 'relative',
        zIndex: 60,
        overflowX: 'hidden',
        overflowY: 'visible',
        background: 'transparent',
        borderBottom: '1px solid var(--edge-highlight)',
        padding: '0 0 8px',
      }}
    >
      <ZlogBrandRegion
        style={{
          minHeight: 64,
          paddingTop: 30,
          paddingBottom: 8,
        }}
      />

      <div
        className="zlog-header-utility-row"
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'flex-end',
          width: '100%',
          maxWidth: DASHBOARD_CONTENT_GRID.maxWidth,
          margin: '0 auto',
          padding: `0 ${DASHBOARD_CONTENT_GRID.padX}px`,
        }}
      >
        <button
          type="button"
          className="zlog-dashboard-signout"
          disabled={signingOut}
          onClick={handleSignOut}
          aria-label={signingOut ? 'Signing out' : 'Sign out'}
        >
          <LogOut size={16} strokeWidth={2.25} aria-hidden className="zlog-dashboard-signout__icon" />
          <span className="zlog-dashboard-signout__label">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </span>
        </button>
      </div>
    </header>
  )
}
