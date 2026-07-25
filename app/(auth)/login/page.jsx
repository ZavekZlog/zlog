'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  premiumScopedCss,
  ZlogBrandWordmark,
  PrimaryCTA,
  SecondaryButton,
  labelStyle,
  inputStyle,
} from '@/lib/premium-ui'

/**
 * Sign-in — inherits re-centred ZlogBrandWordmark glow.
 * Auth: Supabase signInWithPassword → /dashboard + refresh.
 */
export default function Login() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e) => {
    e?.preventDefault?.()
    setLoading(true)
    setErrorMsg('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setErrorMsg(error.message)
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] flex flex-col justify-center px-4 py-6 selection:bg-[#ff5500]/30">
      <style>{premiumScopedCss}</style>

      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        {/* Brand container with localized atmospheric radial glow ONLY */}
        <div style={{ marginBottom: 32, width: '100%', paddingTop: 18 }}>
          <ZlogBrandWordmark size="lg" centered={true} />
        </div>

        {/* Unchanged Authentication Card */}
        <div className="w-full bg-[#14171c] border border-[#222731] rounded-xl px-5 py-5 shadow-xl relative">
          <div className="mb-4">
            <h2 className="text-[20px] font-bold text-[#f3f4f6] tracking-tight mb-0.5">
              Sign in
            </h2>
            <p className="text-[14px] text-[#9ca3af] leading-relaxed">
              Access your reports and projects
            </p>
          </div>

          {errorMsg ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                background: 'color-mix(in srgb, var(--danger) 14%, var(--plate))',
                border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)',
                borderRadius: 10,
                color: 'color-mix(in srgb, var(--danger) 75%, var(--text))',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {errorMsg}
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    ...inputStyle,
                    minHeight: 50,
                    fontSize: 16,
                    marginBottom: 0,
                    paddingRight: 64,
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '4px 8px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <PrimaryCTA type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </PrimaryCTA>
          </form>

          <div style={{ marginTop: 16 }}>
            <SecondaryButton href="/signup" style={{ width: '100%', minHeight: 48, fontSize: 15, fontWeight: 600 }}>
              Create Zlog Account
            </SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}
