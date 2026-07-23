'use client'

/**
 * Shared create/edit form for branding-ready report types that only need
 * date + summary today (site survey, weekly progress, weekly H&S).
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
import { formatProjectMeta } from '@/lib/report-theme'

export function SimpleBrandedReportPage({
  title,
  tableName,
  accent,
}) {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const editingReportId = searchParams.get('report') || null
  const duplicateReportId = (!editingReportId && searchParams.get('duplicate')) || null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectMeta, setProjectMeta] = useState('')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const [brandingSelection, setBrandingSelection] = useState(null)
  const [duplicatedFromReport, setDuplicatedFromReport] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      setDuplicatedFromReport(false)
      setBrandingSelection(null)
      setSummary('')
      const today = new Date().toISOString().slice(0, 10)
      setReportDate(today)

      const { data: proj } = await supabase
        .from('projects')
        .select('name, client_name, site_address')
        .eq('id', projectId)
        .single()
      setProjectName(proj?.name || '')
      setProjectMeta(formatProjectMeta(proj))

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

    const payload = {
      project_id: projectId,
      report_date: reportDate,
      summary: summary.trim(),
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
      <PremiumShell title={title} reportName="Loading…" backHref="/dashboard" accent={accent}>
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title={title}
      reportName={projectName || 'Report'}
      meta={projectMeta}
      backHref="/dashboard"
      accent={accent}
    >
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

        <PrimaryCTA type="submit" disabled={saving} accent={accent}>
          {saving ? 'Saving…' : (editingReportId ? 'Save changes' : 'Save report')}
        </PrimaryCTA>
      </form>
    </PremiumShell>
  )
}
