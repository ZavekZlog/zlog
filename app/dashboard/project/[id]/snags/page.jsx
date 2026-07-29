'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'
import { AiLocationWalk } from '@/components/ai-annotation'
import { uploadAnnotationImage } from '@/lib/ai-annotation/persist'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  RecentEntryCard,
  inputStyle,
  labelStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'

const SNAG_THEME = REPORT_THEMES.snag

export default function SnagList() {
  const [snags, setSnags] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicatedFromSnag, setDuplicatedFromSnag] = useState(false)
  const [brandingSelection, setBrandingSelection] = useState(null)
  const [locationWalk, setLocationWalk] = useState([])
  const persistedWalkPhotoIds = useRef(new Set())
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { id } = useParams()
  const duplicateSnagId = searchParams.get('duplicate') || null

  const fetchSnags = useCallback(async () => {
    const { data } = await supabase.from('snags').select('*').eq('project_id', id).order('created_at', { ascending: false })
    setSnags(data || [])
    setLoading(false)
  }, [supabase, id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('snags')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      setSnags(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, supabase])

  useEffect(() => {
    if (!duplicateSnagId) return

    let cancelled = false
    ;(async () => {
      setError('')
      const { data: source, error: sourceError } = await supabase
        .from('snags')
        .select('*')
        .eq('id', duplicateSnagId)
        .eq('project_id', id)
        .maybeSingle()

      if (cancelled) return

      if (sourceError || !source) {
        setError(sourceError?.message || 'Snag not found')
        setDuplicatedFromSnag(false)
        return
      }

      setDescription(source.description ?? '')
      setLocation(source.location ?? '')
      setShowForm(true)
      setDuplicatedFromSnag(true)
      if (source.branding_id || source.brand_color || source.brand_logo_url) {
        setBrandingSelection({
          brandingId: source.branding_id || null,
          brandColor: source.brand_color || '#FF5000',
          brandLogoUrl: source.brand_logo_url || null,
          companyName: '',
        })
      }
    })()

    return () => { cancelled = true }
  }, [duplicateSnagId, id, supabase])

  const clearForm = () => {
    setDescription('')
    setLocation('')
    setShowForm(false)
    setDuplicatedFromSnag(false)
    setBrandingSelection(null)
    setError('')
    if (duplicateSnagId) {
      router.replace(`/dashboard/project/${id}/snags`)
    }
  }

  const handleSave = async () => {
    if (!description.trim()) return
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save a snag')
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('snags').insert({
      project_id: id,
      user_id: user.id,
      description: description.trim(),
      location: location.trim() || null,
      status: 'open',
      ...brandingPayload(brandingSelection),
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setDescription('')
    setLocation('')
    setShowForm(false)
    setDuplicatedFromSnag(false)
    setBrandingSelection(null)
    setSaving(false)
    if (duplicateSnagId) {
      router.replace(`/dashboard/project/${id}/snags`)
    }
    fetchSnags()
  }

  const handleAreaSaved = useCallback(async (group) => {
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save a snag')
      return
    }

    for (const photo of group.photos || []) {
      if (persistedWalkPhotoIds.current.has(photo.id)) continue
      if (!photo.file && !photo.imageUrl) continue
      try {
        let storagePath = photo.imageUrl || null
        if (photo.file) {
          storagePath = await uploadAnnotationImage(supabase, {
            userId: user.id,
            projectId: id,
            folder: 'snags',
            file: photo.file,
          })
        }
        const { error: insertError } = await supabase.from('snags').insert({
          project_id: id,
          user_id: user.id,
          description: photo.acceptedDescription || '',
          location: group.areaName,
          photo_url: storagePath,
          status: 'open',
          ...brandingPayload(brandingSelection),
        })
        if (insertError) throw new Error(insertError.message)
        persistedWalkPhotoIds.current.add(photo.id)
      } catch (err) {
        setError(err?.message || 'Could not save snag photos')
        return
      }
    }
    fetchSnags()
  }, [supabase, id, brandingSelection, fetchSnags])

  const toggleStatus = async (snag) => {
    const next = snag.status === 'open' ? 'resolved' : 'open'
    await supabase.from('snags').update({ status: next }).eq('id', snag.id)
    fetchSnags()
  }

  const openDuplicate = (snagId) => {
    router.push(`/dashboard/project/${id}/snags?duplicate=${snagId}`)
  }

  if (loading) {
    return (
      <PremiumShell
        title={SNAG_THEME.title}
        backHref="/dashboard"
        accent={SNAG_THEME.accent}
      >
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title={SNAG_THEME.title}
      backHref="/dashboard"
      accent={SNAG_THEME.accent}
      trailing={
        <SecondaryButton
          type="button"
          onClick={() => {
            if (showForm) clearForm()
            else {
              setShowForm(true)
              setDuplicatedFromSnag(false)
            }
          }}
          style={{ flexShrink: 0 }}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </SecondaryButton>
      }
    >
      {error && (
        <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: '#ff6b6b', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <BrandingSelector
          value={brandingSelection}
          onChange={setBrandingSelection}
          accent={SNAG_THEME.accent}
          autoSelectDefault
          compact
        />
      </div>

      <AiLocationWalk
        accent={SNAG_THEME.accent}
        projectId={id}
        contextId="snag"
        value={locationWalk}
        onChange={setLocationWalk}
        onAreaSaved={handleAreaSaved}
      />

      {showForm && (
        <GlassSection title={duplicatedFromSnag ? 'Duplicate snag' : 'New snag (manual)'} accent={SNAG_THEME.accent}>
          {duplicatedFromSnag && (
            <div style={{ background: `rgba(${SNAG_THEME.accent}, 0.1)`, border: `1px solid rgba(${SNAG_THEME.accent}, 0.35)`, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 14, borderRadius: 8, lineHeight: 1.5 }}>
              Duplicated from an existing snag — saving creates a new independent entry.
            </div>
          )}
          <label style={labelStyle}>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the snag..."
            style={inputStyle}
          />
          <label style={labelStyle}>Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. 1st floor bathroom)"
            style={{ ...inputStyle, marginBottom: 16 }}
          />
          <PrimaryCTA onClick={handleSave} disabled={saving} accent={SNAG_THEME.accent}>
            {saving ? 'Saving…' : (duplicatedFromSnag ? 'Save duplicate snag' : 'Save snag')}
          </PrimaryCTA>
        </GlassSection>
      )}

      {snags.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-2)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <p>No snags logged yet</p>
        </div>
      ) : (
        snags.map((s) => (
          <RecentEntryCard key={s.id} accent={SNAG_THEME.accent}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleStatus(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleStatus(s)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{s.description}</div>
                <span
                  style={{
                    fontSize: 11,
                    background: s.status === 'resolved' ? 'rgba(34,197,94,0.18)' : 'rgba(229,72,77,0.18)',
                    color: s.status === 'resolved' ? '#4ade80' : '#fca5a5',
                    border: `1px solid ${s.status === 'resolved' ? 'rgba(34,197,94,0.35)' : 'rgba(229,72,77,0.35)'}`,
                    padding: '2px 8px',
                    borderRadius: 20,
                    marginLeft: 8,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.status}
                </span>
              </div>
              {s.location && <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>📍 {s.location}</div>}
              <div style={{ color: 'var(--text-2)', fontSize: 11, marginTop: 8, opacity: 0.8 }}>Tap to toggle status</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <SecondaryButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openDuplicate(s.id)
                }}
              >
                Duplicate
              </SecondaryButton>
            </div>
          </RecentEntryCard>
        ))
      )}
    </PremiumShell>
  )
}
