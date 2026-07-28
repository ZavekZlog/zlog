'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ZlogBrandRegion, BRAND_HEADER_SPACE } from '@/lib/premium-ui'

const UTILITY_RADIUS = 10

const utilityCardBase = {
  boxSizing: 'border-box',
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 40,
  padding: '7px 10px',
  borderRadius: UTILITY_RADIUS,
  /* Secondary to report cards — lower surface contrast, finer edge, quieter highlight */
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
 * Dashboard masthead — LOCKED ZlogBrandRegion, then Reporting For + Sign out.
 * Brand spacing is owned by ZlogBrandRegion; do not add wordmark margins here.
 */
export function DashboardTopBar() {
  const router = useRouter()
  const supabase = createClient()
  const [companyLabel, setCompanyLabel] = useState('Set profile')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: brandings } = await supabase
        .from('company_brandings')
        .select('company_name, is_default')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (cancelled) return
      const preferred =
        (brandings || []).find((b) => b.is_default) ||
        (brandings || [])[0]
      setCompanyLabel(preferred?.company_name?.trim() || 'Set profile')
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
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

      {/* Page-specific utility chrome — after canonical brand region */}
      <div
        className="zlog-header-utility-row"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 8,
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
        }}
      >
        <Link
          href="/dashboard/settings/branding"
          className="zlog-header-utility-card zlog-header-utility-card--branding"
          style={{
            ...utilityCardBase,
            justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--text) 72%, var(--text-2))',
                fontWeight: 600,
                lineHeight: 1.1,
              }}
            >
              Reporting for
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.2,
                marginTop: 1,
              }}
            >
              {companyLabel}
            </span>
          </span>
          <ChevronRight
            size={15}
            strokeWidth={2}
            aria-hidden
            style={{ flexShrink: 0, color: 'color-mix(in srgb, var(--text) 68%, var(--text-2))' }}
          />
        </Link>

        <button
          type="button"
          className="zlog-header-utility-card zlog-header-utility-card--signout"
          disabled={signingOut}
          onClick={handleSignOut}
          style={{
            ...utilityCardBase,
            justifyContent: 'center',
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
