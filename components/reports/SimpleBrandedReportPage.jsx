'use client'

/**
 * Shared create/edit form for branding-ready report types that only need
 * date + summary today (site survey, weekly progress, weekly H&S).
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  ZlogBrandWordmark,
  premiumScopedCss,
  GlassSection,
  labelStyle,
  inputStyle,
  textareaStyle,
  PrimaryCTA,
} from '@/lib/premium-ui'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'

/** Sign-in-matched shell — wordmark + glow, standalone back button, prominent title */
function BrandedReportShell({ title, backHref = '/dashboard', children }) {
  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f3f4f6] flex flex-col px-4 py-6 selection:bg-[#ff5500]/30">
      <style>{premiumScopedCss}</style>

      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <div style={{ marginBottom: 24, width: '100%', paddingTop: 12 }}>
          <ZlogBrandWordmark size="lg" centered={true} />
        </div>

        <div className="w-full flex items-center justify-between mb-6 px-1">
          <Link
            href={backHref}
            className="px-3 py-1.5 bg-[#14171c] border border-[#222731] hover:border-[#323846] rounded-lg text-xs font-semibold text-[#9ca3af] hover:text-[#f3f4f6] flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span>←</span> Back
          </Link>

          {title ? (
            <h1 className="text-base font-bold text-[#f3f4f6] tracking-tight text-right m-0">
              {title}
            </h1>
          ) : null}
        </div>
      </div>

      <main className="w-full max-w-md mx-auto flex-1">
        {children}
      </main>
    </div>
  )
}

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
      <BrandedReportShell title={title} backHref="/dashboard">
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </BrandedReportShell>
    )
  }

  return (
    <BrandedReportShell title={title} backHref="/dashboard">
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
    </BrandedReportShell>
  )
}
