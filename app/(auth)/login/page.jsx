'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px 24px' }}>
        <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6', marginBottom: '32px' }}>ZLOG</div>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Sign In</h1>
        {error && <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box' }} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', marginBottom: '20px', fontSize: '14px', boxSizing: 'border-box' }} />
        <button onClick={handleLogin} disabled={loading}
          style={{ width: '100%', padding: '14px', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
          {loading ? 'Signing in...' : 'SIGN IN'}
        </button>
      </div>
    </div>
  )
}