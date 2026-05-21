'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function NewDiaryEntry() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [weather, setWeather] = useState('')
  const [workers, setWorkers] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  const handleSave = async () => {
    if (!notes.trim()) { setError('Please add some notes'); return }
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('diary_entries').insert({
      project_id: id,
      user_id: user.id,
      entry_date: date,
      weather: weather.trim(),
      workers_on_site: workers ? parseInt(workers) : null,
      notes: notes.trim()
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(`/dashboard/project/${id}`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>New Diary Entry</div>
      </div>

      <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto' }}>
        {error && <p style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>DATE</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>WEATHER</label>
        <input value={weather} onChange={e => setWeather(e.target.value)} placeholder="e.g. Sunny, 18°C"
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>WORKERS ON SITE</label>
        <input type="number" value={workers} onChange={e => setWorkers(e.target.value)} placeholder="e.g. 4"
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>SITE NOTES *</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened on site today..."
          rows={6}
          style={{ width: '100%', padding: '14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '15px', marginBottom: '32px', boxSizing: 'border-box', resize: 'vertical' }} />

        <button onClick={handleSave} disabled={loading}
          style={{ width: '100%', padding: '16px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
          {loading ? 'Saving...' : 'SAVE ENTRY'}
        </button>
      </div>
    </div>
  )
}