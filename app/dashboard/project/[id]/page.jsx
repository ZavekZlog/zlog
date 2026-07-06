'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { PremiumBackButton, pageBackground, premiumScopedCss } from '@/lib/premium-ui'

export default function ProjectPage() {
  const [project, setProject] = useState(null)
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  useEffect(() => {
    const load = async () => {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
      const { data: logs } = await supabase.from('daily_reports').select('*').eq('project_id', id).order('report_date', { ascending: false })
      setProject(proj)
      setDiaries(logs || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{premiumScopedCss}</style>
      <div
        className="premium-shell-header"
        style={{
          background: 'transparent',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <PremiumBackButton onClick={() => router.push('/dashboard')} />
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#FAFAF8' }}>{project?.name}</div>
          <div className="premium-shell-subtitle" style={{ fontSize: '12px', color: '#8ea2b5' }}>{project?.client_name} · {project?.site_address}</div>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => router.push(`/dashboard/project/${id}/diary?prefill=last`)}
            style={{ padding: '20px', background: '#111', border: '1px solid #222', borderRadius: '10px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: '600' }}>New Report</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Pre-filled from last entry</div>
          </button>
          <button onClick={() => router.push(`/dashboard/project/${id}/snags`)}
            style={{ padding: '20px', background: '#111', border: '1px solid #222', borderRadius: '10px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontWeight: '600' }}>Snag List</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Log issues</div>
          </button>
        </div>

        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#888' }}>RECENT DIARY ENTRIES</h2>

        {diaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555' }}>
            <p>No entries yet</p>
            <p style={{ fontSize: '13px' }}>Tap New Report to add your first entry</p>
          </div>
        ) : (
          diaries.map(d => (
            <div key={d.id} style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600' }}>{d.report_date}</div>
              <div style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>{d.notes?.slice(0, 100)}...</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}