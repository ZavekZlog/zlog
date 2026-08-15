'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE,
  AUTHENTICATED_SHELL_HEADER_STYLE,
  ZlogBrandRegion,
  ZlogSignOutControl,
} from '@/lib/premium-ui'
import { SIGN_OUT_LOGIN_HREF, performDashboardSignOut } from '@/lib/auth/sign-out'
import { DASHBOARD_CONTENT_GRID } from '@/lib/dashboard-content-grid'

/**
 * Compact dashboard masthead matching the accepted screenshot:
 * centred Zlog + established glow, then framed Sign out BELOW, right-aligned
 * to the dashboard card grid. Header is transparent so the page surface is continuous.
 *
 * Sign Out plate and header overflow/glow chrome come from shared authenticated-shell
 * tokens — do not restyle here. Landing page branding is separate and must stay untouched.
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
        ...AUTHENTICATED_SHELL_HEADER_STYLE,
        zIndex: 60,
        borderBottom: '1px solid var(--edge-highlight)',
        padding: '0 0 8px',
      }}
    >
      <ZlogBrandRegion style={AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE} />

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
        <ZlogSignOutControl signingOut={signingOut} onClick={handleSignOut} />
      </div>
    </header>
  )
}
