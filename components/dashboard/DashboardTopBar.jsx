'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ZlogBrandRegion } from '@/lib/premium-ui'
import { SIGN_OUT_LOGIN_HREF, performDashboardSignOut } from '@/lib/auth/sign-out'

/** Safe inset from the viewport/header edge (matches dashboard content padX). */
const HEADER_EDGE_PAD_X = 20

/**
 * Dashboard masthead — Zlog independently centred; Sign out anchored to the
 * padded page-right edge (not grouped with the wordmark, not card-column-aligned).
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
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--ink) 72%, var(--plate))',
        borderBottom: '1px solid var(--edge-highlight)',
        padding: `0 ${HEADER_EDGE_PAD_X}px 8px`,
      }}
    >
      <div
        className="zlog-dashboard-masthead"
        style={{
          position: 'relative',
          width: '100%',
          margin: 0,
        }}
      >
        <button
          type="button"
          className="zlog-secondary-cta zlog-dashboard-signout"
          disabled={signingOut}
          onClick={handleSignOut}
          aria-label={signingOut ? 'Signing out' : 'Sign out'}
        >
          <LogOut size={18} strokeWidth={2.5} aria-hidden className="zlog-secondary-cta__icon" />
          <span className="zlog-secondary-cta__label">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </span>
        </button>

        <ZlogBrandRegion
          style={{
            minHeight: 64,
            paddingTop: 20,
            paddingBottom: 12,
            /* Clear the far-right CTA on narrow viewports; wordmark stays page-centred */
            paddingInline: 118,
          }}
        />
      </div>
    </header>
  )
}
