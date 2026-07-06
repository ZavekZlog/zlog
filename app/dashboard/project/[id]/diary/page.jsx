'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
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

function labourFromDbRow(row) {
  return {
    key: crypto.randomUUID(),
    trade: row.trade ?? '',
    company: row.company ?? '',
    headcount: row.count != null ? String(row.count) : '',
    hours: '',
    notes: '',
  }
}

function plantFromDbRow(row) {
  return {
    key: crypto.randomUUID(),
    plant_type: row.item ?? '',
    quantity: row.ref != null ? String(row.ref) : '',
    hours: row.status != null ? String(row.status) : '',
    notes: '',
  }
}

const CARRIED_AMBER = '#F5A623'

const carriedFieldWrapStyle = {
  borderLeft: `3px solid ${CARRIED_AMBER}`,
  paddingLeft: 14,
  marginBottom: 0,
  background: 'rgba(245, 166, 35, 0.06)',
  borderRadius: '0 10px 10px 0',
}

const carriedFieldNoteStyle = {
  fontSize: 11,
  color: CARRIED_AMBER,
  margin: '0 0 8px',
  letterSpacing: '0.04em',
}

async function signedUrlForPath(supabase, path) {
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export default function SiteDiaryPage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const prefillLast = searchParams.get('prefill') === 'last'
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
  const [prefilledFromLast, setPrefilledFromLast] = useState(false)
  const [companyReportingFor, setCompanyReportingFor] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [creatorRole, setCreatorRole] = useState('')
  const [coverPhoto, setCoverPhoto] = useState(null)
  const [signature, setSignature] = useState(null)
  const [carriedVisitors, setCarriedVisitors] = useState(false)
  const [carriedDelaysIssues, setCarriedDelaysIssues] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setPrefilledFromLast(false)
      setCarriedVisitors(false)
      setCarriedDelaysIssues(false)

      const [{ data: proj }, { data: allProjects }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('projects').select('id, name, client_name, site_address, status').order('name'),
      ])
      setProject(proj)
      setProjects(allProjects || [])

      const today = new Date().toISOString().slice(0, 10)
      setReportDate(today)
      setSiteSummary('')
      setActionsRequired('')
      setPhotos([])
      setCoverPhoto(null)
      setSignature(null)

      if (prefillLast) {
        const { data: lastReport } = await supabase
          .from('daily_reports')
          .select('id, shift, weather, visitors, delays_issues, company_reporting_for, creator_name, creator_role, cover_photo_url, signature_url')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastReport) {
          const [{ data: labour }, { data: plant }] = await Promise.all([
            supabase.from('report_labour').select('trade, company, count').eq('report_id', lastReport.id).order('sequence'),
            supabase.from('report_plant').select('item, ref, status').eq('report_id', lastReport.id).order('sequence'),
          ])

          setShiftType(lastReport.shift || 'Day')
          setWeather(lastReport.weather ?? '')
          setVisitors(lastReport.visitors ?? '')
          setDelaysIssues(lastReport.delays_issues ?? '')
          setCarriedVisitors(!!lastReport.visitors?.trim())
          setCarriedDelaysIssues(!!lastReport.delays_issues?.trim())
          setCompanyReportingFor(lastReport.company_reporting_for ?? '')
          setCreatorName(lastReport.creator_name ?? '')
          setCreatorRole(lastReport.creator_role ?? '')
          setLabourRows(labour?.length ? labour.map(labourFromDbRow) : [emptyLabour()])
          setPlantRows(plant?.length ? plant.map(plantFromDbRow) : [emptyPlant()])
          setPrefilledFromLast(true)

          if (lastReport.cover_photo_url) {
            const preview = await signedUrlForPath(supabase, lastReport.cover_photo_url)
            setCoverPhoto({ file: null, preview, storagePath: lastReport.cover_photo_url })
          }
          if (lastReport.signature_url) {
            const preview = await signedUrlForPath(supabase, lastReport.signature_url)
            setSignature({ file: null, preview, storagePath: lastReport.signature_url })
          }
        } else {
          setShiftType('Day')
          setWeather('')
          setVisitors('')
          setDelaysIssues('')
          setCompanyReportingFor('')
          setCreatorName('')
          setCreatorRole('')
          setLabourRows([emptyLabour()])
          setPlantRows([emptyPlant()])
        }
      } else {
        setShiftType('Day')
        setWeather('')
        setVisitors('')
        setDelaysIssues('')
        setCompanyReportingFor('')
        setCreatorName('')
        setCreatorRole('')
        setLabourRows([emptyLabour()])
        setPlantRows([emptyPlant()])
      }

      setLoading(false)
    }
    load()
  }, [projectId, prefillLast])

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

  const onCoverDrop = useCallback((accepted) => {
    const file = accepted[0]
    if (!file) return
    setCoverPhoto((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return {
        file,
        preview: URL.createObjectURL(file),
        storagePath: null,
      }
    })
  }, [])

  const onSignatureDrop = useCallback((accepted) => {
    const file = accepted[0]
    if (!file) return
    setSignature((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return {
        file,
        preview: URL.createObjectURL(file),
        storagePath: null,
      }
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif'] },
    multiple: true,
  })

  const {
    getRootProps: getCoverRootProps,
    getInputProps: getCoverInputProps,
    isDragActive: isCoverDragActive,
  } = useDropzone({
    onDrop: onCoverDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif'] },
    maxFiles: 1,
    multiple: false,
  })

  const {
    getRootProps: getSignatureRootProps,
    getInputProps: getSignatureInputProps,
    isDragActive: isSignatureDragActive,
  } = useDropzone({
    onDrop: onSignatureDrop,
    accept: { 'image/png': ['.png'] },
    maxFiles: 1,
    multiple: false,
  })

  const photosRef = useRef(photos)
  photosRef.current = photos
  const coverPhotoRef = useRef(coverPhoto)
  coverPhotoRef.current = coverPhoto
  const signatureRef = useRef(signature)
  signatureRef.current = signature
  useEffect(() => () => {
    photosRef.current.forEach((p) => {
      if (p.preview) URL.revokeObjectURL(p.preview)
    })
    if (coverPhotoRef.current?.file && coverPhotoRef.current.preview) {
      URL.revokeObjectURL(coverPhotoRef.current.preview)
    }
    if (signatureRef.current?.file && signatureRef.current.preview) {
      URL.revokeObjectURL(signatureRef.current.preview)
    }
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
      const query = prefillLast ? '?prefill=last' : ''
      router.push(`/dashboard/project/${newId}/diary${query}`)
    }
  }

  const removeCoverPhoto = () => {
    if (coverPhoto?.file && coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview)
    setCoverPhoto(null)
  }

  const removeSignature = () => {
    if (signature?.file && signature.preview) URL.revokeObjectURL(signature.preview)
    setSignature(null)
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

    const pendingId = crypto.randomUUID()
    let coverPhotoUrl = coverPhoto?.storagePath || null
    let signatureUrl = signature?.storagePath || null

    if (coverPhoto?.file) {
      const ext = coverPhoto.file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const coverPath = `${user.id}/pending/${pendingId}/cover.${ext}`
      const { error: coverUploadError } = await supabase.storage
        .from('site-photos')
        .upload(coverPath, coverPhoto.file, { contentType: coverPhoto.file.type, upsert: false })
      if (coverUploadError) {
        setError(`Cover photo upload failed: ${coverUploadError.message}`)
        setSaving(false)
        return
      }
      coverPhotoUrl = coverPath
    }

    if (signature?.file) {
      const signaturePath = `${user.id}/pending/${pendingId}/signature.png`
      const { error: signatureUploadError } = await supabase.storage
        .from('site-photos')
        .upload(signaturePath, signature.file, { contentType: signature.file.type, upsert: false })
      if (signatureUploadError) {
        setError(`Signature upload failed: ${signatureUploadError.message}`)
        setSaving(false)
        return
      }
      signatureUrl = signaturePath
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
        company_reporting_for: companyReportingFor.trim() || null,
        creator_name: creatorName.trim() || null,
        creator_role: creatorRole.trim() || null,
        cover_photo_url: coverPhotoUrl,
        signature_url: signatureUrl,
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
      {prefilledFromLast && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Standing crew, plant, weather and report details copied from your last report. Progress notes and work photos start blank — saving creates a new entry.
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

        <GlassSection title="Author & cover" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Reporting on behalf of</label>
          <input
            style={inputStyle}
            value={companyReportingFor}
            onChange={(e) => setCompanyReportingFor(e.target.value)}
            placeholder="e.g. ABC Construction Ltd"
          />

          <label style={labelStyle}>Author name</label>
          <input
            style={inputStyle}
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="e.g. Colin Walker"
          />

          <label style={labelStyle}>Author role</label>
          <input
            style={inputStyle}
            value={creatorRole}
            onChange={(e) => setCreatorRole(e.target.value)}
            placeholder="e.g. Site Manager"
          />

          <label style={labelStyle}>Cover photo</label>
          {coverPhoto?.preview ? (
            <div style={{ marginBottom: 16 }}>
              <img
                src={coverPhoto.preview}
                alt="Cover"
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 10 }}
              />
              <button type="button" onClick={removeCoverPhoto} style={removeRowStyle}>Remove cover photo</button>
            </div>
          ) : (
            <div
              {...getCoverRootProps()}
              style={{
                border: `2px dashed ${isCoverDragActive ? `rgba(${DIARY_ACCENT}, 0.6)` : 'rgba(255,255,255,0.18)'}`,
                borderRadius: 12,
                padding: '20px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isCoverDragActive ? `rgba(${DIARY_ACCENT}, 0.08)` : 'rgba(255,255,255,0.03)',
                marginBottom: 16,
              }}
            >
              <input {...getCoverInputProps()} />
              <div style={{ fontSize: 13, color: '#7a92a8' }}>One cover image for this report</div>
            </div>
          )}

          <label style={labelStyle}>Signature</label>
          {signature?.preview ? (
            <div style={{ marginBottom: 0 }}>
              <img
                src={signature.preview}
                alt="Signature"
                style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, display: 'block', marginBottom: 10, background: '#fff', padding: 8 }}
              />
              <button type="button" onClick={removeSignature} style={{ ...removeRowStyle, marginBottom: 0 }}>Remove signature</button>
            </div>
          ) : (
            <div
              {...getSignatureRootProps()}
              style={{
                border: `2px dashed ${isSignatureDragActive ? `rgba(${DIARY_ACCENT}, 0.6)` : 'rgba(255,255,255,0.18)'}`,
                borderRadius: 12,
                padding: '20px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isSignatureDragActive ? `rgba(${DIARY_ACCENT}, 0.08)` : 'rgba(255,255,255,0.03)',
              }}
            >
              <input {...getSignatureInputProps()} />
              <div style={{ fontSize: 13, color: '#7a92a8' }}>PNG signature upload</div>
            </div>
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
          <div style={carriedVisitors ? carriedFieldWrapStyle : undefined}>
            {carriedVisitors && (
              <p style={carriedFieldNoteStyle}>Carried from last report — edit or clear</p>
            )}
            <textarea
              style={{ ...textareaStyle, marginBottom: 0 }}
              value={visitors}
              onChange={(e) => {
                setVisitors(e.target.value)
                setCarriedVisitors(false)
              }}
              placeholder="Client reps, inspectors, deliveries…"
              rows={3}
            />
          </div>
        </GlassSection>

        <GlassSection title="Delays & issues" accent={DIARY_ACCENT}>
          <div style={carriedDelaysIssues ? carriedFieldWrapStyle : undefined}>
            {carriedDelaysIssues && (
              <p style={carriedFieldNoteStyle}>Carried from last report — edit or clear</p>
            )}
            <textarea
              style={{ ...textareaStyle, marginBottom: 0 }}
              value={delaysIssues}
              onChange={(e) => {
                setDelaysIssues(e.target.value)
                setCarriedDelaysIssues(false)
              }}
              placeholder="Weather delays, material shortages, access issues…"
              rows={3}
            />
          </div>
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

        <GlassSection title="Work photos" accent={DIARY_ACCENT}>
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
