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
import { ProjectDatesFields } from '@/components/project/ProjectDatesFields'
import { toDateColumnValue, validateProjectDates } from '@/lib/project-day'

export default function NewProject() {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [startDate, setStartDate] = useState('')
  const [plannedCompletionDate, setPlannedCompletionDate] = useState('')
  const [datesError, setDatesError] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const handleDatesChange = ({ startDate: s, plannedCompletionDate: p }) => {
    setStartDate(s)
    setPlannedCompletionDate(p)
    const v = validateProjectDates(s, p)
    setDatesError(v.ok ? '' : v.message)
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('Project name is required'); return }
    const v = validateProjectDates(startDate, plannedCompletionDate)
    if (!v.ok) {
      setDatesError(v.message)
      setError(v.message)
      return
    }
    setLoading(true)
    setError('')
    const start_date = toDateColumnValue(startDate)
    const planned_completion_date = toDateColumnValue(plannedCompletionDate)
    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        client_name: client.trim() || null,
        site_address: siteAddress.trim() || null,
        start_date,
        planned_completion_date,
        status,
      })
      .select('id, start_date, planned_completion_date')
      .single()
    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }
    if (!data?.id) {
      setError('We couldn’t create the project. Check your connection and try again.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <PremiumShell
      title="New project"
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

      <GlassSection title="Project programme dates" accent={BRAND_ACCENT}>
        <p
          style={{
            margin: '0 0 14px',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
          }}
        >
          Set once for this project. Progress reports use these dates for Project Day.
        </p>
        <ProjectDatesFields
          startDate={startDate}
          plannedCompletionDate={plannedCompletionDate}
          onChange={handleDatesChange}
          error={datesError}
        />
      </GlassSection>

      <PrimaryCTA onClick={handleCreate} disabled={loading || Boolean(datesError)}>
        {loading ? 'Creating…' : 'Create project'}
      </PrimaryCTA>
    </PremiumShell>
  )
}
