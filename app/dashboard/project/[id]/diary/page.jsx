'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  PremiumShell,
  GlassSection,
  labelStyle,
  inputStyle,
  textareaStyle,
  PrimaryCTA,
  DIARY_ACCENT,
  pageBackground,
  premiumScopedCss,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'

const SHIFT_OPTIONS = ['Day', 'Night', 'Weekend', 'Half day']

const makeUuid = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return `${Date.now().toString(16)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
};

const emptyLabour = () => ({
  key: makeUuid(),
  trade: '',
  company: '',
  headcount: '',
  hours: '',
  notes: '',
})

const emptyPlant = () => ({
  key: makeUuid(),
  plant_type: '',
  quantity: '',
  hours: '',
  notes: '',
})

const EQUIPMENT_HIRE_STATUSES = ['Active', 'Off-Hired', 'Awaiting Collection']

const emptyEquipmentHire = () => ({
  key: makeUuid(),
  description: '',
  supplier: '',
  quantity: '',
  status: 'Active',
})

function equipmentHireFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return [emptyEquipmentHire()]
  return items.map((item) => ({
    key: makeUuid(),
    description: item?.description ?? '',
    supplier: item?.supplier ?? '',
    quantity: item?.quantity != null ? String(item.quantity) : '',
    status: EQUIPMENT_HIRE_STATUSES.includes(item?.status) ? item.status : 'Active',
  }))
}

function equipmentHireHasData(row) {
  return row.description.trim() || row.supplier.trim() || row.quantity || (row.status && row.status !== 'Active')
}

function equipmentHirePayload(rows) {
  return rows
    .filter(equipmentHireHasData)
    .map((row) => ({
      description: row.description.trim() || null,
      supplier: row.supplier.trim() || null,
      quantity: row.quantity ? parseInt(row.quantity, 10) : null,
      status: row.status || 'Active',
    }))
}

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
  background: 'var(--plate)',
  border: '1px dashed var(--edge)',
  borderRadius: 12,
  color: 'var(--text-2)',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
}

const removeRowStyle = {
  background: 'transparent',
  border: 'none',
  color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '4px 0',
  marginBottom: 8,
}

function resequencePhotos(photos) {
  const layoutOrder = { full: 0, grid4: 1, grid6: 2 }
  const sorted = [...photos].sort((a, b) => {
    const la = layoutOrder[a.layout] ?? 1
    const lb = layoutOrder[b.layout] ?? 1
    if (la !== lb) return la - lb
    return (a.sequence_number || 0) - (b.sequence_number || 0)
  })
  return sorted.map((photo, index) => ({
    ...photo,
    sequence_number: index + 1,
  }))
}

const PHOTO_LAYOUT_SECTIONS = [
  {
    id: 'full',
    title: 'Full Page Photos (1 per page)',
    hint: 'Detailed focus shots — one large photo per PDF page',
  },
  {
    id: 'grid4',
    title: 'Standard Grid Photos (4 per page)',
    hint: 'Progress / snag shots — 2×2 grid on each PDF page',
  },
  {
    id: 'grid6',
    title: 'Compact Grid Photos (6 per page)',
    hint: 'Dense site checks — 3×2 grid on each PDF page',
  },
]

function labourFromDbRow(row) {
  return {
    key: makeUuid(),
    trade: row.trade ?? '',
    company: row.company ?? '',
    headcount: row.count != null ? String(row.count) : '',
    hours: row.hours != null ? String(row.hours) : '',
    notes: row.notes ?? '',
  }
}

function plantFromDbRow(row) {
  return {
    key: makeUuid(),
    plant_type: row.item ?? '',
    quantity: row.ref != null ? String(row.ref) : '',
    hours: row.status != null ? String(row.status) : '',
    notes: row.notes ?? '',
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
  if (!path) return null
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export default function SiteDiaryPage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const prefillLast = searchParams.get('prefill') === 'last'
  const editingReportId = searchParams.get('report') || searchParams.get('diaryId') || null
  const duplicateReportId = (!editingReportId && searchParams.get('duplicate')) || null
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
  const [equipmentHireRows, setEquipmentHireRows] = useState([emptyEquipmentHire()])
  const [visitors, setVisitors] = useState('')
  const [delaysIssues, setDelaysIssues] = useState('')
  const [actionsRequired, setActionsRequired] = useState('')
  const [photos, setPhotos] = useState([])
  const [prefilledFromLast, setPrefilledFromLast] = useState(false)
  const [duplicatedFromReport, setDuplicatedFromReport] = useState(false)
  const [companyReportingFor, setCompanyReportingFor] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [creatorRole, setCreatorRole] = useState('')
  const [coverPhoto, setCoverPhoto] = useState(null)
  const [signature, setSignature] = useState(null)
  const [signatureMode, setSignatureMode] = useState('draw') // 'carried' | 'accepted' | 'draw'
  const [brandingSelection, setBrandingSelection] = useState(null)
  const [carriedVisitors, setCarriedVisitors] = useState(false)
  const [carriedDelaysIssues, setCarriedDelaysIssues] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      setPrefilledFromLast(false)
      setDuplicatedFromReport(false)
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
      setSignatureMode('draw')
      setBrandingSelection(null)
      setWeather('')
      setShiftType('Day')
      setVisitors('')
      setDelaysIssues('')
      setCompanyReportingFor('')
      setCreatorName('')
      setCreatorRole('')
      setLabourRows([emptyLabour()])
      setPlantRows([emptyPlant()])
      setEquipmentHireRows([emptyEquipmentHire()])

      const applyCover = async (storagePath) => {
        if (!storagePath) return
        const preview = await signedUrlForPath(supabase, storagePath)
        if (!preview) return
        setCoverPhoto({ file: null, preview, storagePath })
      }

      const applySignature = async (storagePath) => {
        if (!storagePath) {
          setSignature(null)
          setSignatureMode('draw')
          return
        }
        const preview = await signedUrlForPath(supabase, storagePath)
        if (!preview) {
          setSignature(null)
          setSignatureMode('draw')
          return
        }
        setSignature({ file: null, preview, storagePath })
        setSignatureMode('carried')
      }

      if (editingReportId || duplicateReportId) {
        const sourceId = editingReportId || duplicateReportId
        const { data: existing, error: existingError } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('id', sourceId)
          .eq('project_id', projectId)
          .maybeSingle()

        if (existingError || !existing) {
          setError(existingError?.message || 'Diary entry not found')
          setLoading(false)
          return
        }

        const [{ data: labour }, { data: plant }, { data: reportPhotos }] = await Promise.all([
          supabase.from('report_labour').select('trade, company, count, hours, notes').eq('report_id', existing.id).order('sequence'),
          supabase.from('report_plant').select('item, ref, status, notes').eq('report_id', existing.id).order('sequence'),
          supabase.from('report_photos').select('url, caption, sequence, layout').eq('report_id', existing.id).order('sequence'),
        ])

        // Edit keeps the source date; duplicate always starts as today (CREATE mode — no id/created_at).
        setReportDate(editingReportId ? (existing.report_date || today) : today)
        setWeather(existing.weather ?? '')
        setShiftType(existing.shift || 'Day')
        setSiteSummary(existing.site_summary ?? '')
        setVisitors(existing.visitors ?? '')
        setDelaysIssues(existing.delays_issues ?? '')
        setActionsRequired(existing.actions ?? '')
        setCompanyReportingFor(existing.company_reporting_for ?? '')
        setCreatorName(existing.creator_name ?? '')
        setCreatorRole(existing.creator_role ?? '')
        setLabourRows(labour?.length ? labour.map(labourFromDbRow) : [emptyLabour()])
        setPlantRows(plant?.length ? plant.map(plantFromDbRow) : [emptyPlant()])
        setEquipmentHireRows(equipmentHireFromDb(existing.equipment_hire))
        if (duplicateReportId) setDuplicatedFromReport(true)

        if (existing.branding_id || existing.brand_color || existing.brand_logo_url) {
          setBrandingSelection({
            brandingId: existing.branding_id || null,
            brandColor: existing.brand_color || '#FF5000',
            brandLogoUrl: existing.brand_logo_url || null,
            companyName: '',
          })
        }

        await applyCover(existing.cover_photo_url)
        await applySignature(existing.signature_url)

        const loadedPhotos = []
        for (const p of reportPhotos || []) {
          if (!p?.url) continue
          const preview = await signedUrlForPath(supabase, p.url)
          if (!preview) continue
          loadedPhotos.push({
            key: makeUuid(),
            file: null,
            preview,
            storagePath: p.url,
            caption: p.caption ?? '',
            layout: p.layout === 'full' || p.layout === 'grid6' ? p.layout : 'grid4',
            sequence_number: p.sequence ?? 0,
          })
        }
        setPhotos(resequencePhotos(loadedPhotos))
      } else if (prefillLast) {
        const { data: lastReport } = await supabase
          .from('daily_reports')
          .select('id, shift, weather, visitors, delays_issues, company_reporting_for, creator_name, creator_role, cover_photo_url, signature_url, equipment_hire')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastReport) {
          const [{ data: labour }, { data: plant }] = await Promise.all([
            supabase.from('report_labour').select('trade, company, count, hours, notes').eq('report_id', lastReport.id).order('sequence'),
            supabase.from('report_plant').select('item, ref, status, notes').eq('report_id', lastReport.id).order('sequence'),
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
          setEquipmentHireRows(equipmentHireFromDb(lastReport.equipment_hire))
          setPrefilledFromLast(true)

          await applyCover(lastReport.cover_photo_url)
          await applySignature(lastReport.signature_url)
        }
      }

      setLoading(false)
    }
    load()
  }, [projectId, prefillLast, editingReportId, duplicateReportId])

  const addPhotosForLayout = useCallback((layout) => (accepted) => {
    const next = accepted.map((file) => ({
      key: makeUuid(),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      layout,
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

  const canvasRef = useRef(null)
  const signaturePadRef = useRef(null)
  const endStrokeHandlerRef = useRef(null)
  const touchBlockerRef = useRef(null)
  const originalReleasePointerCaptureRef = useRef(null)
  const globalReleasePointerCaptureRef = useRef(null)

  const teardownSignaturePad = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas && touchBlockerRef.current) {
      canvas.removeEventListener('touchmove', touchBlockerRef.current)
      touchBlockerRef.current = null
    }
    if (canvas && originalReleasePointerCaptureRef.current) {
      try {
        delete canvas.releasePointerCapture
      } catch {
        canvas.releasePointerCapture = originalReleasePointerCaptureRef.current
      }
      originalReleasePointerCaptureRef.current = null
    }
    if (globalReleasePointerCaptureRef.current) {
      Element.prototype.releasePointerCapture = globalReleasePointerCaptureRef.current
      globalReleasePointerCaptureRef.current = null
    }
    const pad = signaturePadRef.current
    if (!pad) return
    if (endStrokeHandlerRef.current) {
      pad.removeEventListener('endStroke', endStrokeHandlerRef.current)
      endStrokeHandlerRef.current = null
    }
    pad.off()
    signaturePadRef.current = null
  }, [])

  const attachSignatureCanvas = useCallback((canvas) => {
    if (canvasRef.current === canvas) return
    teardownSignaturePad()
    canvasRef.current = canvas
    if (!canvas) return

    canvas.style.touchAction = 'none'
    canvas.style.userSelect = 'none'
    canvas.style.webkitUserSelect = 'none'

    // Guard releasePointerCapture on this canvas and (while mounted) on Element
    // so a NotFoundError mid-pointerup cannot abort SignaturePad's cleanup and
    // leave window-level preventDefault listeners that block the back button.
    const protoRelease =
      Object.getOwnPropertyDescriptor(Element.prototype, 'releasePointerCapture')?.value ||
      Element.prototype.releasePointerCapture
    originalReleasePointerCaptureRef.current = protoRelease

    const safeReleasePointerCapture = function releasePointerCaptureSafe(pointerId) {
      try {
        if (
          typeof this.hasPointerCapture === 'function' &&
          !this.hasPointerCapture(pointerId)
        ) {
          return
        }
        return protoRelease.call(this, pointerId)
      } catch {
        // Ignore NotFoundError when no active pointer remains
      }
    }
    canvas.releasePointerCapture = safeReleasePointerCapture
    if (!globalReleasePointerCaptureRef.current) {
      globalReleasePointerCaptureRef.current = protoRelease
      Element.prototype.releasePointerCapture = safeReleasePointerCapture
    }

    // Only block scroll on move. preventDefault on touchstart/touchend can
    // cancel the pointer before capture is released and trigger the error above.
    const blockTouchScroll = (e) => {
      try {
        if (e.cancelable) e.preventDefault()
      } catch {
        // Ignore — never let touch handlers throw into the console
      }
    }
    touchBlockerRef.current = blockTouchScroll
    canvas.addEventListener('touchmove', blockTouchScroll, { passive: false })

    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    canvas.getContext('2d').scale(ratio, ratio)

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
    })
    signaturePadRef.current = pad

    // SignaturePad.on() may reset touch-action — keep scroll locked while drawing
    canvas.style.touchAction = 'none'

    const rebindPadIfNeeded = () => {
      // After the current event finishes, ensure no dangling window listeners
      queueMicrotask(() => {
        try {
          pad.off()
          pad.on()
          canvas.style.touchAction = 'none'
          canvas.style.userSelect = 'none'
          canvas.style.webkitUserSelect = 'none'
        } catch {
          // ignore
        }
      })
    }

    const onEndStroke = () => {
      if (pad.isEmpty()) {
        setSignature(null)
        rebindPadIfNeeded()
        return
      }
      canvas.toBlob((blob) => {
        if (!blob) return
        const file = new File([blob], 'signature.png', { type: 'image/png' })
        setSignature((prev) => {
          if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
          return {
            file,
            preview: URL.createObjectURL(file),
            storagePath: null,
          }
        })
      }, 'image/png')
      rebindPadIfNeeded()
    }

    endStrokeHandlerRef.current = onEndStroke
    pad.addEventListener('endStroke', onEndStroke)
  }, [teardownSignaturePad])

  useEffect(() => () => {
    teardownSignaturePad()
  }, [teardownSignaturePad])

  const clearSignaturePad = () => {
    signaturePadRef.current?.clear()
    setSignature((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return null
    })
  }

  const useExistingSignature = () => {
    setSignatureMode('accepted')
  }

  const resignSignature = () => {
    setSignature((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return null
    })
    setSignatureMode('draw')
  }

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

  const updateEquipmentHire = (key, field, value) => {
    setEquipmentHireRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const removePhoto = (key) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.key === key)
      if (removed?.file && removed.preview) URL.revokeObjectURL(removed.preview)
      return resequencePhotos(prev.filter((p) => p.key !== key))
    })
  }

  const updatePhotoCaption = (key, caption) => {
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, caption } : p)))
  }

  const handleProjectChange = (newId) => {
    if (newId && newId !== projectId) {
      let query = ''
      if (editingReportId) query = ''
      else if (duplicateReportId) query = `?duplicate=${duplicateReportId}`
      else if (prefillLast) query = '?prefill=last'
      router.push(`/dashboard/project/${newId}/diary${query}`)
    }
  }

  const removeCoverPhoto = () => {
    if (coverPhoto?.file && coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview)
    setCoverPhoto(null)
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

    const pendingId = makeUuid()
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

    const reportPayload = {
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
      equipment_hire: equipmentHirePayload(equipmentHireRows),
      ...brandingPayload(brandingSelection),
    }

    let report = null
    if (editingReportId) {
      const { data, error: reportError } = await supabase
        .from('daily_reports')
        .update(reportPayload)
        .eq('id', editingReportId)
        .eq('project_id', projectId)
        .select('id')
        .single()

      if (reportError || !data) {
        setError(reportError?.message || 'Failed to update report')
        setSaving(false)
        return
      }
      report = data

      await supabase.from('report_labour').delete().eq('report_id', report.id)
      await supabase.from('report_plant').delete().eq('report_id', report.id)
    } else {
      const { data, error: reportError } = await supabase
        .from('daily_reports')
        .insert(reportPayload)
        .select('id')
        .single()

      if (reportError || !data) {
        setError(reportError?.message || 'Failed to create report')
        setSaving(false)
        return
      }
      report = data
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
    const keptStoragePaths = sequenced
      .filter((p) => !p.file && p.storagePath)
      .map((p) => p.storagePath)

    if (editingReportId) {
      const { data: existingPhotoRows } = await supabase
        .from('report_photos')
        .select('id, url')
        .eq('report_id', report.id)

      const toRemove = (existingPhotoRows || []).filter((row) => !keptStoragePaths.includes(row.url))
      if (toRemove.length > 0) {
        const { error: deletePhotosError } = await supabase
          .from('report_photos')
          .delete()
          .in('id', toRemove.map((row) => row.id))
        if (deletePhotosError) {
          setError(deletePhotosError.message)
          setSaving(false)
          return
        }
      }
    }

    const photoRecords = []

    for (const photo of sequenced) {
      if (photo.file) {
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
          layout: photo.layout || 'grid4',
        })
      } else if (!editingReportId && photo.storagePath) {
        // Duplicate / create: link existing storage paths onto the new report row
        photoRecords.push({
          report_id: report.id,
          url: photo.storagePath,
          caption: photo.caption.trim() || null,
          sequence: photo.sequence_number,
          layout: photo.layout || 'grid4',
        })
      }
    }

    if (photoRecords.length > 0) {
      const { error: photosError } = await supabase.from('report_photos').insert(photoRecords)
      if (photosError) {
        setError(photosError.message)
        setSaving(false)
        return
      }
    }

    // Keep captions/sequence in sync for existing kept photos
    for (const photo of sequenced) {
      if (photo.file || !photo.storagePath) continue
      await supabase
        .from('report_photos')
        .update({
          caption: photo.caption.trim() || null,
          sequence: photo.sequence_number,
          layout: photo.layout || 'grid4',
        })
        .eq('report_id', report.id)
        .eq('url', photo.storagePath)
    }

    setSuccess(editingReportId ? 'Site diary updated successfully' : 'Site diary saved successfully')
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
      title={REPORT_THEMES.diary.title}
      reportName={project?.name || 'Daily site record'}
      meta={projectSubtitle}
      backHref="/dashboard"
      accent={REPORT_THEMES.diary.accent}
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
      {prefilledFromLast && !editingReportId && !duplicatedFromReport && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Standing crew, plant, weather and report details copied from your last report. Progress notes and work photos start blank — saving creates a new entry.
        </div>
      )}
      {duplicatedFromReport && !editingReportId && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Duplicated from an existing entry. Report date is set to today — saving creates a new independent report.
        </div>
      )}
      {editingReportId && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 13, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          Editing an existing diary entry. Saving updates this record.
        </div>
      )}

      <form onSubmit={handleSave}>
        <BrandingSelector
          value={brandingSelection}
          onChange={setBrandingSelection}
          accent={DIARY_ACCENT}
          autoSelectDefault={!editingReportId && !duplicateReportId}
        />

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
            <div style={{ marginBottom: 16 }}>
              <ImageSourceButtons
                onFiles={onCoverDrop}
                hint="One cover image for this report"
              />
            </div>
          )}

          <label style={labelStyle}>Signature</label>
          {(signatureMode === 'carried' || signatureMode === 'accepted') && signature?.preview ? (
            <div style={{ marginBottom: 0 }}>
              <img
                src={signature.preview}
                alt="Signature"
                style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, display: 'block', marginBottom: 10, background: '#fff', padding: 8 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {signatureMode === 'carried' && (
                  <button type="button" onClick={useExistingSignature} style={{ ...removeRowStyle, marginBottom: 0, color: '#9eb4c8' }}>
                    Use Existing Signature
                  </button>
                )}
                <button type="button" onClick={resignSignature} style={{ ...removeRowStyle, marginBottom: 0 }}>
                  Re-sign / Clear
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 0 }}>
              <canvas
                ref={attachSignatureCanvas}
                style={{
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  width: '100%',
                  height: 120,
                  display: 'block',
                  borderRadius: 8,
                  background: '#fff',
                  marginBottom: 10,
                }}
              />
              <button type="button" onClick={clearSignaturePad} style={{ ...removeRowStyle, marginBottom: 0 }}>
                Clear
              </button>
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

        <GlassSection title="Equipment on hire" accent={DIARY_ACCENT}>
          {equipmentHireRows.map((row) => (
            <div key={row.key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {equipmentHireRows.length > 1 && (
                <button
                  type="button"
                  style={removeRowStyle}
                  onClick={() => setEquipmentHireRows((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  Remove entry
                </button>
              )}
              <div style={rowGridStyle}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Equipment description</label>
                  <input
                    style={cellInputStyle}
                    value={row.description}
                    onChange={(e) => updateEquipmentHire(row.key, 'description', e.target.value)}
                    placeholder="1.5T Digger"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Hire company / supplier</label>
                  <input
                    style={cellInputStyle}
                    value={row.supplier}
                    onChange={(e) => updateEquipmentHire(row.key, 'supplier', e.target.value)}
                    placeholder="HSS Hire"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Quantity</label>
                  <input
                    type="number"
                    min="0"
                    style={cellInputStyle}
                    value={row.quantity}
                    onChange={(e) => updateEquipmentHire(row.key, 'quantity', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Status</label>
                  <select
                    style={cellInputStyle}
                    value={row.status}
                    onChange={(e) => updateEquipmentHire(row.key, 'status', e.target.value)}
                  >
                    {EQUIPMENT_HIRE_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            style={addRowButtonStyle}
            onClick={() => setEquipmentHireRows((rows) => [...rows, emptyEquipmentHire()])}
          >
            + Add Equipment
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
          {PHOTO_LAYOUT_SECTIONS.map((section) => {
            const sectionPhotos = resequencePhotos(photos).filter(
              (p) => (p.layout || 'grid4') === section.id,
            )
            return (
              <div
                key={section.id}
                style={{
                  marginBottom: 22,
                  paddingBottom: 18,
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: '#F0EDE8', marginBottom: 6 }}>
                  {section.title}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <ImageSourceButtons
                    onFiles={addPhotosForLayout(section.id)}
                    multiple
                    hint={section.hint}
                  />
                </div>
                {sectionPhotos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {sectionPhotos.map((photo) => (
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
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.key)}
                          style={{ ...removeRowStyle, marginBottom: 0, marginTop: 24 }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </GlassSection>

        <PrimaryCTA type="submit" disabled={saving} accent={REPORT_THEMES.diary.accent}>
          {saving ? 'Saving…' : (editingReportId ? 'Save changes' : 'Save site diary')}
        </PrimaryCTA>
      </form>
    </PremiumShell>
  )
}
