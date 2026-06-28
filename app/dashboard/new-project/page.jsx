'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { labelStyle, inputStyle } from '@/lib/premium-ui'

export default function NewProject() {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const handleCreate = async () => {
    if (!name.trim()) { setError('Project name is required'); return }
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      client_name: client.trim() || null,
      site_address: siteAddress.trim() || null,
      start_date: startDate || null,
      status,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>New Project</div>
      </div>

      <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto' }}>
        {error && <p style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>PROJECT NAME *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 14 High Street Extension"
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box' }} />

        <label style={labelStyle}>Address</label>
        <input
          value={siteAddress}
          onChange={e => setSiteAddress(e.target.value)}
          placeholder="e.g. 14 High Street, Manchester"
          style={inputStyle}
        />

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>CLIENT NAME</label>
        <input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Mr J Smith"
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box' }} />

        <label style={labelStyle}>Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ ...inputStyle, marginBottom: '32px' }}
        >
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="complete">Complete</option>
        </select>

        <button onClick={handleCreate} disabled={loading}
          style={{ width: '100%', padding: '16px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
          {loading ? 'Creating...' : 'CREATE PROJECT'}
        </button>
      </div>
    </div>
  )
}