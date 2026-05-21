'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function SnagList() {
  const [snags, setSnags] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  useEffect(() => { fetchSnags() }, [])

  const fetchSnags = async () => {
    const { data } = await supabase.from('snags').select('*').eq('project_id', id).order('created_at', { ascending: false })
    setSnags(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!description.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('snags').insert({
      project_id: id,
      user_id: user.id,
      description: description.trim(),
      location: location.trim()
    })
    setDescription('')
    setLocation('')
    setShowForm(false)
    setSaving(false)
    fetchSnags()
  }

  const toggleStatus = async (snag) => {
    const next = snag.status === 'open' ? 'resolved' : 'open'
    await supabase.from('snags').update({ status: next }).eq('id', snag.id)
    fetchSnags()
  }

  if (loading) return <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>Snag List</div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
          + Add
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
        {showForm && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the snag..."
              style={{ width: '100%', padding: '12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }} />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (e.g. 1st floor bathroom)"
              style={{ width: '100%', padding: '12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }} />
            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', padding: '12px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'SAVE SNAG'}
            </button>
          </div>
        )}

        {snags.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <p>No snags logged yet</p>
          </div>
        ) : (
          snags.map(s => (
            <div key={s.id} onClick={() => toggleStatus(s)}
              style={{ background: '#111', border: `1px solid ${s.status === 'resolved' ? '#14532d' : '#7f1d1d'}`, borderRadius: '10px', padding: '16px', marginBottom: '12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: '600', fontSize: '15px' }}>{s.description}</div>
                <span style={{ fontSize: '11px', background: s.status === 'resolved' ? '#14532d' : '#7f1d1d', color: s.status === 'resolved' ? '#4ade80' : '#fca5a5', padding: '2px 8px', borderRadius: '20px', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                  {s.status}
                </span>
              </div>
              {s.location && <div style={{ color: '#666', fontSize: '13px', marginTop: '4px' }}>📍 {s.location}</div>}
              <div style={{ color: '#444', fontSize: '11px', marginTop: '8px' }}>Tap to toggle status</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}