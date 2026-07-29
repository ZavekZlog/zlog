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
import {
  passwordInputType,
  passwordVisibilityLabel,
  readLoginFormCredentials,
} from '@/lib/auth/login-form'

/**
 * Sign-in — inherits re-centred ZlogBrandWordmark glow.
 * Auth: FormData from the live form → Supabase signInWithPassword → /dashboard.
 *
 * Inputs stay uncontrolled so password-manager autofill is not wiped by React state.
 * Form uses noValidate: Android Chrome often shows autofill before input.value is set;
 * native `required` can block submit and dismiss the preview (fields look cleared).
 */
export default function Login() {
  const supabase = createClient()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()

    const form = e.currentTarget
    if (!form) return

    // Submission source of truth: FormData from the actual form DOM — not React state.
    let formData = new FormData(form)
    let email = String(formData.get('email') ?? '')
    let password = String(formData.get('password') ?? '')

    // Android Chrome may not have flushed autofill into input.value yet.
    if (!email.trim() || !password) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      formData = new FormData(form)
      email = String(formData.get('email') ?? '')
      password = String(formData.get('password') ?? '')
    }

    // Prefer live element values if FormData is still empty after flush.
    if (!email.trim() || !password) {
      const fromDom = readLoginFormCredentials(form)
      if (!email.trim()) email = fromDom.email
      if (!password) password = fromDom.password
    }

    email = email.trim()

    // Cement non-empty values into the DOM before any re-render so autofill
    // preview dismissal cannot leave blank fields.
    const emailInput = form.elements.namedItem('email')
    const passwordInput = form.elements.namedItem('password')
    if (email && emailInput && 'value' in emailInput) {
      emailInput.value = email
    }
    if (password && passwordInput && 'value' in passwordInput) {
      passwordInput.value = password
    }

    if (!email || !password) {
      setErrorMsg('Enter your email and password.')
      return
    }

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

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
              />
            </div>

            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  name="password"
                  type={passwordInputType(showPassword)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    ...inputStyle,
                    minHeight: 50,
                    fontSize: 16,
                    marginBottom: 0,
                    paddingRight: 128,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={passwordVisibilityLabel(showPassword)}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 48,
                    minHeight: 48,
                    padding: '8px 10px',
                    border: '1px solid color-mix(in srgb, var(--text) 28%, transparent)',
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--ink) 55%, var(--plate))',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    lineHeight: 1.2,
                    color: '#F4F2EF',
                    cursor: 'pointer',
                  }}
                >
                  {passwordVisibilityLabel(showPassword)}
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
