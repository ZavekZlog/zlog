'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  premiumScopedCss,
  ZlogBrandWordmark,
  PrimaryCTA,
  SecondaryButton,
  labelStyle,
  inputStyle,
} from '@/lib/premium-ui'

/**
 * Sign-up — synced with login: flat #0d0f12 + localized ZlogBrandWordmark glow only.
 * Auth: Supabase signUp → companies/users insert → /onboarding.
 */
export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    companyName: '',
  })

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.fullName } },
      })
      if (authError) throw authError
      const userId = authData.user?.id
      if (!userId) throw new Error('Signup failed')
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({ name: form.companyName })
        .select()
        .single()
      if (companyError) throw companyError
      const { error: profileError } = await supabase.from('users').insert({
        id: userId,
        company_id: company.id,
        full_name: form.fullName,
        email: form.email,
        role: 'admin',
      })
      if (profileError) throw profileError
      router.push('/onboarding')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
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
              Create an account
            </h2>
            <p className="text-[14px] text-[#9ca3af] leading-relaxed">
              Get started with Zlog today
            </p>
          </div>

          {error ? (
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
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Your name
              </label>
              <input
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
                name="fullName"
                type="text"
                placeholder="John Smith"
                value={form.fullName}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Company name
              </label>
              <input
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
                name="companyName"
                type="text"
                placeholder="Smith Building Ltd"
                value={form.companyName}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Email address
              </label>
              <input
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
                name="email"
                type="email"
                placeholder="john@smithbuilding.co.uk"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label style={{ ...labelStyle, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 }}>
                Password
              </label>
              <input
                style={{ ...inputStyle, minHeight: 50, fontSize: 16, marginBottom: 0 }}
                name="password"
                type="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>

            <PrimaryCTA type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </PrimaryCTA>
          </form>

          <div style={{ marginTop: 16 }}>
            <SecondaryButton href="/login" style={{ width: '100%', minHeight: 48, fontSize: 15, fontWeight: 600 }}>
              Already have an account? Sign in
            </SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}
