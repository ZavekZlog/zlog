'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  pageBackground,
  premiumScopedCss,
  ZlogWordmark,
  PrimaryCTA,
  SecondaryButton,
  labelStyle,
  inputStyle,
  typeTokens,
  glassPanelStyle,
  ModuleAccent,
  DIARY_ACCENT,
} from '@/lib/premium-ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div
      className="dashboard-premium-bg"
      style={{
        ...pageBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{premiumScopedCss}</style>
      <div style={{ width: '100%', maxWidth: 420, padding: '40px 24px' }}>
        <div style={{ ...glassPanelStyle, position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
          <ModuleAccent accent={DIARY_ACCENT} />
          <ZlogWordmark style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 20, marginTop: 4 }} />
          <h1 style={{ ...typeTokens.reportName, margin: '0 0 8px' }}>Sign in</h1>
          <p style={{ ...typeTokens.meta, margin: '0 0 24px' }}>Access your site reports and projects</p>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 16 }}>{error}</p>
          )}

          <label style={labelStyle}>Email</label>
          <input
            type="email"
            placeholder="you@company.co.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, marginBottom: 20 }}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin()
            }}
          />

          <PrimaryCTA onClick={handleLogin} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </PrimaryCTA>

          <div style={{ marginTop: 14 }}>
            <SecondaryButton href="/signup" style={{ width: '100%' }}>
              Create account
            </SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}
