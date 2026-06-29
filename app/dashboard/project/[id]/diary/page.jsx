'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  PremiumShell,
  GlassSection,
  labelStyle,
  inputStyle,
  textareaStyle,
  primaryButtonStyle,
  DIARY_ACCENT,
  pageBackground,
  premiumScopedCss,
} from '@/lib/premium-ui'

const SHIFT_OPTIONS = ['Day', 'Night', 'Weekend', 'Half day']

const emptyLabour = () => ({
  key: crypto.randomUUID(),
  trade: '',
  company: '',
  headcount: '',
  hours: '',
  notes: '',
})

const emptyPlant = () => ({
  key: crypto.randomUUID(),
  plant_type: '',
  quantity: '',
  hours: '',
  notes: '',
})

const rowGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
  marginBottom: 12,
}

const cellInputStyle = {
  ...inputStyle,
  marginBottom: 0,
  padding: '10px 12px',
  fontSize: 14,
}

const addRowButtonStyle = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px dashed rgba(255, 255, 255, 0.2)',
  borderRadius: 10,
  color: '#9eb4c8',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const removeRowStyle = {
  background: 'transparent',
  border: 'none',
  color: '#ff6b6b',
  fontSize: 12,
  cursor: 'pointer',
  padding: '4px 0',
  marginBottom: 8,
}

function resequencePhotos(photos) {
  return photos.map((photo, index) => ({
    ...photo,
    sequence_number: index + 1,
  }))
}

export default function SiteDiaryPage() {
  const { id: projectId } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)

  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [weather, setWeather] = useState('')
  const [shiftType, setShiftType] = useState('Day')
  const [siteSummary, setSiteSummary] = useState('')
  const [labourRows, setLabourRows] = useState([emptyLabour()])
  const [plantRows, setPlantRows] = useState([emptyPlant()])
  const [visitors, setVisitors] = useState('')
  const [delaysIssues, setDelaysIssues] = useState('')
  const [actionsRequired, setActionsRequired] = useState('')
  const [photos, setPhotos] = useState([])

  useEffect(() => {
    const load = async () => {
      const [{ data: proj }, { data: allProjects }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('projects').select('id, name, client_name, site_address, status').order('name'),
      ])
      setProject(proj)
      setProjects(allProjects || [])
      setLoading(false)
    }
    load()
  }, [projectId])

  const onDrop = useCallback((accepted) => {
    const next = accepted.map((file) => ({
      key: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      sequence_number: 0,
    }))
    setPhotos((prev) => resequencePhotos([...prev, ...next]))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif'] },
    multiple: true,
  })

  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => {
    photosRef.current.forEach((p) => {
      if (p.preview) URL.revokeObjectURL(p.preview)
    })
  }, [])

  const projectSubtitle = useMemo(() => {
    if (!project) return ''
    const parts = [project.client_name, project.site_address].filter(Boolean)
    return parts.join(' · ')
  }, [project])

  const updateLabour = (key, field, value) => {
    setLabourRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const updatePlant = (key, field, value) => {
    setPlantRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const removePhoto = (key) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.key === key)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return resequencePhotos(prev.filter((p) => p.key !== key))
    })
  }

  const updatePhotoCaption = (key, caption) => {
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, caption } : p)))
  }

  const handleProjectChange = (newId) => {
    if (newId && newId !== projectId) {
      router.push(`/dashboard/project/${newId}/diary`)
    }
  }

  const labourHasData = (row) =>
    row.trade.trim() || row.company.trim() || row.headcount || row.hours || row.notes.trim()

  const plantHasData = (row) =>
    row.plant_type.trim() || row.quantity || row.hours || row.notes.trim()

  const handleSave = async (e) => {
    e.preventDefault()
    if (!siteSummary.trim()) {
      setError('Site summary is required')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to save a report')
      setSaving(false)
      return
    }

    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .insert({
        project_id: projectId,
        report_date: reportDate,
        weather: weather.trim() || null,
        shift: shiftType || null,
        site_summary: siteSummary.trim(),
        visitors: visitors.trim() || null,
        delays_issues: delaysIssues.trim() || null,
        actions: actionsRequired.trim() || null,
      })
      .select('id')
      .single()

    if (reportError || !report) {
      setError(reportError?.message || 'Failed to create report')
      setSaving(false)
      return
    }

    const labourPayload = labourRows
      .filter(labourHasData)
      .map((row, index) => ({
        report_id: report.id,
        trade: row.trade.trim() || null,
        company: row.company.trim() || null,
        count: row.headcount ? parseInt(row.headcount, 10) : null,
        hours: row.hours ? parseFloat(row.hours) : null,
        notes: row.notes.trim() || null,
        sequence: index,
      }))

    if (labourPayload.length > 0) {
      const { error: labourError } = await supabase.from('report_labour').insert(labourPayload)
      if (labourError) {
        setError(labourError.message)
        setSaving(false)
        return
      }
    }

    const plantPayload = plantRows
      .filter(plantHasData)
      .map((row, index) => ({
        report_id: report.id,
        item: row.plant_type.trim() || null,
        ref: row.quantity ? parseInt(row.quantity, 10) : null,
        status: row.hours ? parseFloat(row.hours) : null,
        notes: row.notes.trim() || null,
        sequence: index,
      }))

    if (plantPayload.length > 0) {
      const { error: plantError } = await supabase.from('report_plant').insert(plantPayload)
      if (plantError) {
        setError(plantError.message)
        setSaving(false)
        return
      }
    }

    const sequenced = resequencePhotos(photos)
    const photoRecords = []

    for (const photo of sequenced) {
      const ext = photo.file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const storagePath = `${user.id}/${report.id}/${photo.sequence_number}-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('site-photos')
        .upload(storagePath, photo.file, { contentType: photo.file.type, upsert: false })

      if (uploadError) {
        setError(`Photo upload failed: ${uploadError.message}`)
        setSaving(false)
        return
      }

      photoRecords.push({
        report_id: report.id,
        url: storagePath,
        caption: photo.caption.trim() || null,
        sequence: photo.sequence_number,
      })
    }

    if (photoRecords.length > 0) {
      const { error: photosError } = await supabase.from('report_photos').insert(photoRecords)
      if (photosError) {
        setError(photosError.message)
        setSaving(false)
        return
      }
    }

    setSuccess('Site diary saved successfully')
    setSaving(false)
    setTimeout(() => router.push(`/dashboard/project/${projectId}`), 800)
  }

  if (loading) {
    return (
      <div className="dashboard-premium-bg" style={{ ...pageBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{premiumScopedCss}</style>
        Loading…
      </div>
    )
  }

  return (
    <PremiumShell
      title="Site Diary Report"
      subtitle={project?.name || 'Daily site record'}
      onBack={() => router.push(`/dashboard/project/${projectId}`)}
      maxWidth={720}
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

      <form onSubmit={handleSave}>
        <GlassSection title="Project" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Project</label>
          <select
            style={{ ...inputStyle, marginBottom: projectSubtitle ? 8 : 0 }}
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {projectSubtitle && (
            <p style={{ margin: 0, fontSize: 13, color: '#7a92a8', lineHeight: 1.5 }}>{projectSubtitle}</p>
          )}
        </GlassSection>

        <GlassSection title="Report details" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Report date</label>
          <input
            type="date"
            style={inputStyle}
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            required
          />

          <label style={labelStyle}>Weather</label>
          <input
            style={inputStyle}
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            placeholder="e.g. Overcast, 12°C, light rain PM"
          />

          <label style={labelStyle}>Shift type</label>
          <select
            style={{ ...inputStyle, marginBottom: 0 }}
            value={shiftType}
            onChange={(e) => setShiftType(e.target.value)}
          >
            {SHIFT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </GlassSection>

        <GlassSection title="Site summary" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Summary *</label>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={siteSummary}
            onChange={(e) => setSiteSummary(e.target.value)}
            placeholder="Overall progress, key activities, and notable events today…"
            rows={5}
            required
          />
        </GlassSection>

        <GlassSection title="Labour" accent={DIARY_ACCENT}>
          {labourRows.map((row) => (
            <div key={row.key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {labourRows.length > 1 && (
                <button type="button" style={removeRowStyle} onClick={() => setLabourRows((rows) => rows.filter((r) => r.key !== row.key))}>
                  Remove row
                </button>
              )}
              <div style={rowGridStyle}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Trade</label>
                  <input style={cellInputStyle} value={row.trade} onChange={(e) => updateLabour(row.key, 'trade', e.target.value)} placeholder="Carpenter" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Company</label>
                  <input style={cellInputStyle} value={row.company} onChange={(e) => updateLabour(row.key, 'company', e.target.value)} placeholder="Subco Ltd" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Headcount</label>
                  <input type="number" min="0" style={cellInputStyle} value={row.headcount} onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)} placeholder="4" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Hours</label>
                  <input type="number" min="0" step="0.5" style={cellInputStyle} value={row.hours} onChange={(e) => updateLabour(row.key, 'hours', e.target.value)} placeholder="8" />
                </div>
              </div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Notes</label>
              <input style={{ ...cellInputStyle, width: '100%' }} value={row.notes} onChange={(e) => updateLabour(row.key, 'notes', e.target.value)} placeholder="Optional notes" />
            </div>
          ))}
          <button type="button" style={addRowButtonStyle} onClick={() => setLabourRows((rows) => [...rows, emptyLabour()])}>
            + Add labour row
          </button>
        </GlassSection>

        <GlassSection title="Plant" accent={DIARY_ACCENT}>
          {plantRows.map((row) => (
            <div key={row.key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {plantRows.length > 1 && (
                <button type="button" style={removeRowStyle} onClick={() => setPlantRows((rows) => rows.filter((r) => r.key !== row.key))}>
                  Remove row
                </button>
              )}
              <div style={rowGridStyle}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Plant type</label>
                  <input style={cellInputStyle} value={row.plant_type} onChange={(e) => updatePlant(row.key, 'plant_type', e.target.value)} placeholder="Telehandler" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Quantity</label>
                  <input type="number" min="0" style={cellInputStyle} value={row.quantity} onChange={(e) => updatePlant(row.key, 'quantity', e.target.value)} placeholder="1" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Hours</label>
                  <input type="number" min="0" step="0.5" style={cellInputStyle} value={row.hours} onChange={(e) => updatePlant(row.key, 'hours', e.target.value)} placeholder="6" />
                </div>
              </div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Notes</label>
              <input style={{ ...cellInputStyle, width: '100%' }} value={row.notes} onChange={(e) => updatePlant(row.key, 'notes', e.target.value)} placeholder="Optional notes" />
            </div>
          ))}
          <button type="button" style={addRowButtonStyle} onClick={() => setPlantRows((rows) => [...rows, emptyPlant()])}>
            + Add plant row
          </button>
        </GlassSection>

        <GlassSection title="Visitors" accent={DIARY_ACCENT}>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={visitors}
            onChange={(e) => setVisitors(e.target.value)}
            placeholder="Client reps, inspectors, deliveries…"
            rows={3}
          />
        </GlassSection>

        <GlassSection title="Delays & issues" accent={DIARY_ACCENT}>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={delaysIssues}
            onChange={(e) => setDelaysIssues(e.target.value)}
            placeholder="Weather delays, material shortages, access issues…"
            rows={3}
          />
        </GlassSection>

        <GlassSection title="Actions required" accent={DIARY_ACCENT}>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={actionsRequired}
            onChange={(e) => setActionsRequired(e.target.value)}
            placeholder="Follow-ups, RFIs, instructions needed…"
            rows={3}
          />
        </GlassSection>

        <GlassSection title="Photos" accent={DIARY_ACCENT}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? `rgba(${DIARY_ACCENT}, 0.6)` : 'rgba(255,255,255,0.18)'}`,
              borderRadius: 12,
              padding: '28px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragActive ? `rgba(${DIARY_ACCENT}, 0.08)` : 'rgba(255,255,255,0.03)',
              marginBottom: photos.length ? 20 : 0,
              transition: 'all 180ms ease',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#F0EDE8' }}>
              {isDragActive ? 'Drop photos here' : 'Tap or drag photos to upload'}
            </div>
            <div style={{ fontSize: 12, color: '#7a92a8', marginTop: 6 }}>JPEG, PNG, WebP · max 10 MB each</div>
          </div>

          {photos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {resequencePhotos(photos).map((photo) => (
                <div
                  key={photo.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 1fr auto',
                    gap: 14,
                    alignItems: 'start',
                    padding: 12,
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <img
                      src={photo.preview}
                      alt={`Photo ${photo.sequence_number}`}
                      style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        background: `rgba(${DIARY_ACCENT}, 0.92)`,
                        color: '#0b0d12',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                      }}
                    >
                      #{photo.sequence_number}
                    </span>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Caption</label>
                    <input
                      style={{ ...cellInputStyle, width: '100%' }}
                      value={photo.caption}
                      onChange={(e) => updatePhotoCaption(photo.key, e.target.value)}
                      placeholder={`Caption for photo ${photo.sequence_number}`}
                    />
                  </div>
                  <button type="button" onClick={() => removePhoto(photo.key)} style={{ ...removeRowStyle, marginBottom: 0, marginTop: 24 }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassSection>

        <button type="submit" disabled={saving} style={primaryButtonStyle(DIARY_ACCENT, saving)}>
          {saving ? 'Saving…' : 'Save site diary'}
        </button>
      </form>
    </PremiumShell>
  )
}
