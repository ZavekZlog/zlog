'use client'

/**
 * Shared create/edit form for branding-ready report types
 * (site survey, weekly progress, weekly H&S).
 * Location Walk via area-group AiLocationWalk.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  PremiumShell,
  GlassSection,
  labelStyle,
  inputStyle,
  textareaStyle,
  PrimaryCTA,
} from '@/lib/premium-ui'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'
import { AiLocationWalk } from '@/components/ai-annotation'
import { persistAnnotationItems } from '@/lib/ai-annotation/persist'
import { getAnnotationContext } from '@/lib/ai-annotation/contexts'
import {
  flattenAreaGroups,
  groupPhotosByArea,
} from '@/lib/ai-annotation/area-groups'

async function signedUrlForPath(supabase, path) {
  if (!path) return null
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export function SimpleBrandedReportPage({
  title,
  tableName,
  accent,
  contextId = 'survey',
}) {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const ctx = getAnnotationContext(contextId)

  const editingReportId = searchParams.get('report') || null
  const duplicateReportId = (!editingReportId && searchParams.get('duplicate')) || null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const [brandingSelection, setBrandingSelection] = useState(null)
  const [duplicatedFromReport, setDuplicatedFromReport] = useState(false)
  const [locationWalk, setLocationWalk] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      setDuplicatedFromReport(false)
      setBrandingSelection(null)
      setSummary('')
      setLocationWalk([])
      const today = new Date().toISOString().slice(0, 10)
      setReportDate(today)

      const sourceId = editingReportId || duplicateReportId
      if (sourceId) {
        const { data: existing, error: existingError } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', sourceId)
          .eq('project_id', projectId)
          .maybeSingle()

        if (existingError || !existing) {
          setError(existingError?.message || 'Report not found')
          setLoading(false)
          return
        }

        setReportDate(editingReportId ? (existing.report_date || today) : today)
        setSummary(existing.summary ?? '')
        if (duplicateReportId) setDuplicatedFromReport(true)
        if (existing.branding_id || existing.brand_color || existing.brand_logo_url) {
          setBrandingSelection({
            brandingId: existing.branding_id || null,
            brandColor: existing.brand_color || '#FF5000',
            brandLogoUrl: existing.brand_logo_url || null,
            companyName: '',
          })
        }

        const stored = Array.isArray(existing.photos) ? existing.photos : []
        const withPreview = await Promise.all(
          stored.map(async (p, index) => {
            const preview = p.url ? await signedUrlForPath(supabase, p.url) : null
            return {
              key: p.key || `photo-${index}`,
              file: null,
              preview,
              description: p.description || p.caption || '',
              location: p.location || p.area || '',
              storagePath: p.url || null,
            }
          }),
        )
        setLocationWalk(groupPhotosByArea(withPreview))
      }

      setLoading(false)
    }
    load()
  }, [projectId, editingReportId, duplicateReportId, tableName])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!summary.trim()) {
      setError('Summary is required')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save')
      setSaving(false)
      return
    }

    let photoPayload = []
    try {
      photoPayload = await persistAnnotationItems(supabase, {
        userId: user.id,
        projectId,
        folder: tableName,
        items: flattenAreaGroups(locationWalk),
      })
    } catch (uploadErr) {
      setError(uploadErr?.message || 'Photo upload failed')
      setSaving(false)
      return
    }

    const payload = {
      project_id: projectId,
      report_date: reportDate,
      summary: summary.trim(),
      photos: photoPayload,
      ...brandingPayload(brandingSelection),
    }

    if (editingReportId) {
      const { error: updErr } = await supabase
        .from(tableName)
        .update(payload)
        .eq('id', editingReportId)
        .eq('project_id', projectId)
      if (updErr) {
        setError(updErr.message)
        setSaving(false)
        return
      }
      setSuccess('Report updated')
    } else {
      const { error: insErr } = await supabase.from(tableName).insert(payload)
      if (insErr) {
        setError(insErr.message)
        setSaving(false)
        return
      }
      setSuccess('Report saved')
    }

    setSaving(false)
    setTimeout(() => router.push(`/dashboard/project/${projectId}`), 800)
  }

  if (loading) {
    return (
      <PremiumShell title={title} backHref="/dashboard" accent={accent}>
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell title={title} backHref="/dashboard" accent={accent}>
      {error && (
        <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: '#ff6b6b', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
          {success}
        </div>
      )}
      {duplicatedFromReport && !editingReportId && (
        <div style={{ background: `rgba(${accent}, 0.08)`, border: `1px solid rgba(${accent}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Duplicated from an existing entry. Report date is today — saving creates a new independent report.
        </div>
      )}
      {editingReportId && (
        <div style={{ background: `rgba(${accent}, 0.08)`, border: `1px solid rgba(${accent}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Editing an existing report. Saving updates this record.
        </div>
      )}

      <form onSubmit={handleSave}>
        <BrandingSelector
          value={brandingSelection}
          onChange={setBrandingSelection}
          accent={accent}
          autoSelectDefault={!editingReportId && !duplicateReportId}
        />

        <GlassSection title="Report details" accent={accent}>
          <label style={labelStyle}>Report date</label>
          <input type="date" style={inputStyle} value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
          <label style={labelStyle}>Summary *</label>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={6}
            required
            placeholder="Key observations and notes…"
          />
        </GlassSection>

        <AiLocationWalk
          accent={accent}
          projectId={projectId}
          contextId={ctx.id}
          value={locationWalk}
          onChange={setLocationWalk}
        />

        <PrimaryCTA type="submit" disabled={saving} accent={accent}>
          {saving ? 'Saving…' : (editingReportId ? 'Save changes' : 'Save report')}
        </PrimaryCTA>
      </form>
    </PremiumShell>
  )
}
