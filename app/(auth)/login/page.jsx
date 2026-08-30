'use client'

import { useEffect, useRef, useState } from 'react'
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
  isTrustedPrimarySignInPointerDown,
  isTrustedSignInCtaKey,
  passwordInputType,
  passwordVisibilityLabel,
  readLoginFormCredentials,
} from '@/lib/auth/login-form'
import { safeAppReturnPath } from '@/lib/auth/return-path'

/**
 * Sign-in — inherits re-centred ZlogBrandWordmark glow.
 * Auth runs only on a trusted primary pointerdown on Sign In, or trusted
 * Enter/Space while Sign In itself has focus. Form submit never authenticates.
 *
 * Credential source (M0-02):
 * - Email/password inputs are uncontrolled (no React value / defaultValue).
 * - Zlog does not persist raw passwords to storage, cookies, logs, or DB.
 * - Fields appearing pre-filled are browser / password-manager autofill
 *   (autocomplete="username" / "current-password"), not app-held credentials.
 * - After sign-out (?signedOut=1), any in-DOM form values are cleared once;
 *   the browser may then autofill again — that is expected and preferred.
 * - Form uses conventional submit semantics so the browser can save credentials;
 *   password is left in the DOM through successful navigation (not cleared early).
 */
export default function Login() {
  const supabase = createClient()
  const router = useRouter()
  const formRef = useRef(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Clear application-held login form DOM state after sign-out.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('signedOut') !== '1') return
    const form = formRef.current
    if (form) {
      form.reset()
      const emailInput = form.elements.namedItem('email')
      const passwordInput = form.elements.namedItem('password')
      if (emailInput && 'value' in emailInput) emailInput.value = ''
      if (passwordInput && 'value' in passwordInput) passwordInput.value = ''
    }
    setShowPassword(false)
    setErrorMsg('')
    setLoading(false)
    const next = safeAppReturnPath(params.get('next'))
    router.replace(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }, [router])

  const authenticate = async () => {
    if (loading) return

    const form = formRef.current
    if (!form) return

    // Source of truth: live form DOM / FormData — not React state.
    let { email, password } = readLoginFormCredentials(form)

    // Prefer named element values when FormData is still empty (some autofill paths).
    if (!email || !password) {
      const emailInput = form.elements.namedItem('email')
      const passwordInput = form.elements.namedItem('password')
      if (!email && emailInput && 'value' in emailInput) {
        email = String(emailInput.value || '').trim()
      }
      if (!password && passwordInput && 'value' in passwordInput) {
        password = String(passwordInput.value || '')
      }
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
      // Password is passed only to Supabase Auth in-memory for this request.
      // It is never written to localStorage, sessionStorage, cookies, or logs.
      // Leave password in the DOM through navigation so the browser can offer Save.
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setErrorMsg(error.message)
        setLoading(false)
        return
      }

      const next = safeAppReturnPath(
        new URLSearchParams(window.location.search).get('next'),
      )
      // Full navigation restores the exact report URL (pathname + ?report=) with the new session.
      window.location.assign(next || '/dashboard')
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  /** Password-manager / native submit must never authenticate. */
  const handleFormSubmit = (e) => {
    e.preventDefault()
  }

  const handleSignInPointerDown = (e) => {
    if (!isTrustedPrimarySignInPointerDown(e)) return
    void authenticate()
  }

  const handleSignInKeyDown = (e) => {
    if (!isTrustedSignInCtaKey(e)) return
    e.preventDefault()
    void authenticate()
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] flex flex-col justify-center px-4 py-6 selection:bg-[#ff5500]/30">
      <style>{premiumScopedCss}</style>

      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <div style={{ marginBottom: 32, width: '100%', paddingTop: 18 }}>
          <ZlogBrandWordmark size="lg" centered={true} />
        </div>

        <div className="w-full bg-[#14171c] border border-[#222731] rounded-xl px-5 py-5 shadow-xl relative">
          <div className="mb-4">
            <h2 className="text-[20px] font-bold text-[#f3f4f6] tracking-tight mb-0.5">
              Sign in
            </h2>
            <p className="text-[14px] text-[#9ca3af] leading-relaxed">
              Sign in to create and manage your site reports.
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

          <form
            ref={formRef}
            method="post"
            onSubmit={handleFormSubmit}
            className="space-y-4"
            noValidate
          >
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

            <PrimaryCTA
              type="button"
              onPointerDown={handleSignInPointerDown}
              onKeyDown={handleSignInKeyDown}
              disabled={loading}
              className="w-full"
            >
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
