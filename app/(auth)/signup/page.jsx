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

  const handleSubmit = async (e) => {
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
      <div style={{ width: '100%', maxWidth: 440, padding: '40px 24px' }}>
        <div style={{ ...glassPanelStyle, position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
          <ModuleAccent accent={DIARY_ACCENT} />
          <ZlogWordmark style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 20, marginTop: 4 }} />
          <h1 style={{ ...typeTokens.reportName, margin: '0 0 8px' }}>Create your account</h1>
          <p style={{ ...typeTokens.meta, margin: '0 0 24px' }}>14-day free trial. No card required.</p>

          {error && (
            <div
              style={{
                background: 'rgba(220,50,50,0.1)',
                border: '1px solid rgba(220,50,50,0.3)',
                color: '#ff6b6b',
                padding: '12px 14px',
                fontSize: 14,
                marginBottom: 20,
                borderRadius: 10,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Your name</label>
            <input
              style={inputStyle}
              name="fullName"
              type="text"
              placeholder="John Smith"
              value={form.fullName}
              onChange={handleChange}
              required
            />
            <label style={labelStyle}>Company name</label>
            <input
              style={inputStyle}
              name="companyName"
              type="text"
              placeholder="Smith Building Ltd"
              value={form.companyName}
              onChange={handleChange}
              required
            />
            <label style={labelStyle}>Email address</label>
            <input
              style={inputStyle}
              name="email"
              type="email"
              placeholder="john@smithbuilding.co.uk"
              value={form.email}
              onChange={handleChange}
              required
            />
            <label style={labelStyle}>Password</label>
            <input
              style={{ ...inputStyle, marginBottom: 20 }}
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
            />
            <PrimaryCTA type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </PrimaryCTA>
          </form>

          <div style={{ marginTop: 14 }}>
            <SecondaryButton href="/login" style={{ width: '100%' }}>
              Already have an account? Sign in
            </SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}
