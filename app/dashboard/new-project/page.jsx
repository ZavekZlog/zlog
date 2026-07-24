'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  labelStyle,
  inputStyle,
  BRAND_ACCENT,
} from '@/lib/premium-ui'

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
    const { error: insertError } = await supabase.from('projects').insert({
      name: name.trim(),
      client_name: client.trim() || null,
      site_address: siteAddress.trim() || null,
      start_date: startDate || null,
      status,
    })
    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <PremiumShell
      title="New project"
      reportName="Create a site"
      meta="Add a project before opening reports"
      backHref="/dashboard"
      accent={BRAND_ACCENT}
      maxWidth={500}
    >
      {error && <p style={{ color: '#ef4444', marginBottom: 16, fontSize: 14 }}>{error}</p>}

      <GlassSection title="Project details" accent={BRAND_ACCENT}>
        <label style={labelStyle}>Project name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 14 High Street Extension"
          style={inputStyle}
        />

        <label style={labelStyle}>Address</label>
        <input
          value={siteAddress}
          onChange={(e) => setSiteAddress(e.target.value)}
          placeholder="e.g. 14 High Street, Manchester"
          style={inputStyle}
        />

        <label style={labelStyle}>Client name</label>
        <input
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="e.g. Mr J Smith"
          style={inputStyle}
        />

        <label style={labelStyle}>Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0 }}
        >
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="complete">Complete</option>
        </select>
      </GlassSection>

      <PrimaryCTA onClick={handleCreate} disabled={loading}>
        {loading ? 'Creating…' : 'Create project'}
      </PrimaryCTA>
    </PremiumShell>
  )
}
