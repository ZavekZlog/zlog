'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
  SecondaryButton,
  DIARY_ACCENT,
  RecentEntryCard,
  premiumDiaryEmptyClass,
  premiumDiaryEmptyTitleClass,
  premiumDiaryEmptyHintClass,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import {
  labourAggregateTotals,
  labourRowsFromOperatives,
} from '@/lib/labour-from-register'
import { fileToVisionDataUrl, parseSignInSheetImage } from '@/lib/parse-signin-sheet'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { SignInOperativeReview } from '@/components/diary/SignInOperativeReview'
import { AiLocationWalk } from '@/components/ai-annotation'
import {
  flattenAreaGroups,
  groupPhotosByArea,
  photosMissingDescription,
} from '@/lib/ai-annotation/area-groups'
import { hasAnnotations } from '@/lib/photo-annotations'
import {
  createBlankDiaryDraft,
  createTodaysDiaryDraft,
  fetchOpenDraft,
} from '@/lib/diary-draft'
import { DiarySaveError, DIARY_SAVE_LOG, finalizeSiteDiarySave } from '@/lib/diary-save'
import { readReportSetupExtras } from '@/lib/report-setup'
import {
  loginUrlWithReturn,
  SESSION_EXPIRED_SAVE_MESSAGE,
} from '@/lib/auth/return-path'

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
  // Continuous Photo 1..N across the whole report (all layouts), recalculated on add/remove/reorder.
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

function labourRowHasData(row) {
  return Boolean(row.trade.trim() || row.company.trim() || row.headcount || row.hours || row.notes.trim())
}

async function signedUrlForPath(supabase, path) {
  if (!path) return null
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const [header, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png'
  const binary = atob(body || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Upload transparent overlay PNG; returns storage path or null. */
async function uploadOverlayPng(supabase, { userId, reportId, sequence, dataUrl }) {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const storagePath = `${userId}/${reportId}/overlay-${sequence}-${Date.now()}.png`
  const { error } = await supabase.storage
    .from('site-photos')
    .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
  if (error) throw error
  return storagePath
}

export default function SiteDiaryPage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const prefillLast = searchParams.get('prefill') === 'last'
  const editingReportId = searchParams.get('report') || searchParams.get('diaryId') || null
  const duplicateReportId = (!editingReportId && searchParams.get('duplicate')) || null
  const templateReportId = (!editingReportId && searchParams.get('template')) || duplicateReportId || null
  const router = useRouter()
  const supabase = createClient()

  const showStartScreen = !editingReportId

  const [loading, setLoading] = useState(true)
  const saveCtaRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [showSaveBanner, setShowSaveBanner] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [error, setError] = useState('')
  const saveNavTimerRef = useRef(null)
  const saveLockRef = useRef(false)
  const completingRef = useRef(false)

  // Clear stale locks when opening/switching a report so Save is never silently blocked.
  useEffect(() => {
    saveLockRef.current = false
    completingRef.current = false
    setSaving(false)
    setJustSaved(false)
    setShowSaveBanner(false)
  }, [editingReportId])

  // Detect session loss while editing — recover via Sign in CTA (do not leave Save enabled).
  useEffect(() => {
    let cancelled = false

    const applyAuthUser = (user) => {
      if (cancelled) return
      if (user) {
        setSessionExpired(false)
        setError((prev) => (prev === SESSION_EXPIRED_SAVE_MESSAGE ? '' : prev))
        return
      }
      setSessionExpired(true)
      setSaving(false)
      setJustSaved(false)
      setShowSaveBanner(false)
      setError(SESSION_EXPIRED_SAVE_MESSAGE)
      saveLockRef.current = false
      completingRef.current = false
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      applyAuthUser(user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Avoid a false expired flash during INITIAL_SESSION hydration; getUser owns first paint.
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        applyAuthUser(null)
        return
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        applyAuthUser(session?.user ?? null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])
  const [startBusy, setStartBusy] = useState(false)
  const [startError, setStartError] = useState('')
  const [openDraft, setOpenDraft] = useState(null)

  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [recentDiaries, setRecentDiaries] = useState([])

  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [weather, setWeather] = useState('')
  const [shiftType, setShiftType] = useState('Day')
  const [siteSummary, setSiteSummary] = useState('')
  const [labourRows, setLabourRows] = useState([emptyLabour()])
  const [labourMode, setLabourMode] = useState('manual') // 'scan' | 'manual'
  const [labourGroupBy, setLabourGroupBy] = useState('trade_company')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanMeta, setScanMeta] = useState({ matched: 0, ignored: 0, extracted: 0 })
  const [scanWarnings, setScanWarnings] = useState([])
  const [scanOperatives, setScanOperatives] = useState([])
  const [scanLastFile, setScanLastFile] = useState(null)
  const [scanSheetPreview, setScanSheetPreview] = useState(null)
  const [plantRows, setPlantRows] = useState([emptyPlant()])
  const [equipmentHireRows, setEquipmentHireRows] = useState([emptyEquipmentHire()])
  const [visitors, setVisitors] = useState('')
  const [delaysIssues, setDelaysIssues] = useState('')
  const [actionsRequired, setActionsRequired] = useState('')
  const [photos, setPhotos] = useState([])
  const [locationWalk, setLocationWalk] = useState([])
  const signatureSectionRef = useRef(null)
  const locationWalkRef = useRef(null)
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
  const [projectReference, setProjectReference] = useState('')
  const [setupLogoPreview, setSetupLogoPreview] = useState(null)

  const openReportForm = useCallback((reportId) => {
    router.replace(`/dashboard/project/${projectId}/diary?report=${reportId}`)
  }, [router, projectId])

  const refreshStartData = useCallback(async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single()
    setProject(proj)

    let draft = null
    try {
      draft = await fetchOpenDraft(supabase, projectId)
    } catch (err) {
      if (!/is_draft/i.test(err?.message || '')) throw err
    }
    setOpenDraft(draft)

    let logsQuery = supabase
      .from('daily_reports')
      .select('id, report_date')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(5)
    let { data: logs, error: logsError } = await logsQuery.eq('is_draft', false)
    if (logsError && /is_draft/i.test(logsError.message || '')) {
      const fallback = await supabase
        .from('daily_reports')
        .select('id, report_date')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(5)
      logs = fallback.data
      logsError = fallback.error
    }
    if (logsError) throw logsError
    setRecentDiaries(logs || [])
  }, [supabase, projectId])

  // Start screen bootstrap + auto-create from legacy prefill/template links
  useEffect(() => {
    if (!projectId || editingReportId) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setStartError('')
      try {
        // Legacy ?prefill=last must land on the start screen, not auto-open the form.
        if (prefillLast) {
          router.replace(`/dashboard/diary?project=${projectId}`)
          return
        }
        if (templateReportId) {
          const id = await createTodaysDiaryDraft(supabase, projectId, templateReportId)
          if (!cancelled) openReportForm(id)
          return
        }
        // Consistent entry: A/B hub (edit existing vs start new) — same on phone and laptop.
        router.replace(`/dashboard/diary?project=${projectId}`)
      } catch (err) {
        if (!cancelled) setStartError(err?.message || 'Could not load Site Diary start options')
      } finally {
        // Always clear — cancelled navigations (e.g. after camera) must not leave Loading stuck
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [projectId, editingReportId, prefillLast, templateReportId, supabase, openReportForm, router])

  useEffect(() => {
    if (!editingReportId) return
    let cancelled = false
    const load = async () => {
      console.log(DIARY_SAVE_LOG, 'load:start', { editingReportId, projectId })
      setLoading(true)
      setError('')
      setPrefilledFromLast(false)
      setDuplicatedFromReport(false)
      setCarriedVisitors(false)
      setCarriedDelaysIssues(false)

      try {
        const [{ data: proj }, { data: allProjects }] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('projects').select('id, name, client_name, site_address, status').order('name'),
        ])
        if (cancelled) return
        setProject(proj)
        setProjects(allProjects || [])

        const today = new Date().toISOString().slice(0, 10)
        setReportDate(today)
        setSiteSummary('')
        setActionsRequired('')
        setPhotos([])
        setLocationWalk([])
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
        setProjectReference('')
        setSetupLogoPreview(null)
        setLabourRows([emptyLabour()])
        setPlantRows([emptyPlant()])
        setEquipmentHireRows([emptyEquipmentHire()])

        const applyCover = async (storagePath) => {
          if (!storagePath) return
          const preview = await signedUrlForPath(supabase, storagePath)
          if (!preview || cancelled) return
          setCoverPhoto({ file: null, preview, storagePath })
        }

        const applySignature = async (storagePath) => {
          if (!storagePath) {
            setSignature(null)
            setSignatureMode('draw')
            return
          }
          const preview = await signedUrlForPath(supabase, storagePath)
          if (cancelled) return
          if (!preview) {
            setSignature(null)
            setSignatureMode('draw')
            return
          }
          setSignature({ file: null, preview, storagePath })
          setSignatureMode('carried')
        }

        const { data: existing, error: existingError } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('id', editingReportId)
          .eq('project_id', projectId)
          .maybeSingle()

        if (cancelled) return

        if (existingError || !existing) {
          console.log(DIARY_SAVE_LOG, 'load:not-found', { existingError, editingReportId })
          setError(existingError?.message || 'Diary entry not found')
          return
        }
        console.log(DIARY_SAVE_LOG, 'load:ok', {
          id: existing.id,
          site_summary: existing.site_summary,
          report_date: existing.report_date,
        })

        let labour
        let plant
        let reportPhotos
        {
          const results = await Promise.all([
            supabase.from('report_labour').select('trade, company, count, hours, notes').eq('report_id', existing.id).order('sequence'),
            supabase.from('report_plant').select('item, ref, status, notes').eq('report_id', existing.id).order('sequence'),
            supabase.from('report_photos').select('url, caption, sequence, layout, location, annotations, overlay_path').eq('report_id', existing.id).order('sequence'),
          ])
          labour = results[0].data
          plant = results[1].data
          reportPhotos = results[2].data
          if (results[2].error && /annotations|overlay_path/i.test(results[2].error.message || '')) {
            const fallback = await supabase
              .from('report_photos')
              .select('url, caption, sequence, layout')
              .eq('report_id', existing.id)
              .order('sequence')
            reportPhotos = fallback.data
          }
        }

        if (cancelled) return

        setReportDate(existing.report_date || today)
        setWeather(existing.weather || '')
        setShiftType(existing.shift || existing.shift_type || 'Day')
        setSiteSummary(existing.site_summary || '')
        setVisitors(existing.visitors || '')
        setDelaysIssues(existing.delays_issues || '')
        setActionsRequired(existing.actions || existing.actions_required || '')
        setCompanyReportingFor(existing.company_reporting_for || '')
        setCreatorName(existing.creator_name || '')
        setCreatorRole(existing.creator_role || '')
        {
          const extras = readReportSetupExtras(existing.id)
          setProjectReference(extras?.projectReference || '')
          const logoPath = existing.brand_logo_url || null
          if (logoPath) {
            const preview = await signedUrlForPath(supabase, logoPath)
            if (!cancelled) setSetupLogoPreview(preview)
          } else {
            setSetupLogoPreview(null)
          }
        }
        setEquipmentHireRows(equipmentHireFromDb(existing.equipment_hire))
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
        if (cancelled) return

        if (labour?.length) {
          setLabourRows(labour.map((row) => ({
            key: makeUuid(),
            trade: row.trade || '',
            company: row.company || '',
            headcount: row.count != null ? String(row.count) : '',
            hours: row.hours != null ? String(row.hours) : '',
            notes: row.notes || '',
          })))
        }
        if (plant?.length) {
          setPlantRows(plant.map((row) => ({
            key: makeUuid(),
            plant_type: row.item || '',
            quantity: row.ref != null ? String(row.ref) : '',
            hours: row.status != null ? String(row.status) : '',
            notes: row.notes || '',
          })))
        }
        if (reportPhotos?.length) {
          const withPreview = await Promise.all(reportPhotos.map(async (p, index) => {
            const preview = await signedUrlForPath(supabase, p.url)
            const overlayPreview = p.overlay_path
              ? await signedUrlForPath(supabase, p.overlay_path)
              : null
            return {
              key: makeUuid(),
              file: null,
              preview,
              storagePath: p.url,
              caption: p.caption || '',
              sequence_number: p.sequence ?? index + 1,
              layout: p.layout || 'grid4',
              location: p.location || '',
              annotations: p.annotations || null,
              overlayPath: p.overlay_path || null,
              overlayPreview,
              overlayDirty: false,
            }
          }))
          if (cancelled) return
          setPhotos(withPreview)
          setLocationWalk(groupPhotosByArea(withPreview))
        } else {
          setLocationWalk([])
        }

        let logsQuery = supabase
          .from('daily_reports')
          .select('id, report_date')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
          .limit(5)
        let { data: logs, error: logsError } = await logsQuery.eq('is_draft', false)
        if (logsError && /is_draft/i.test(logsError.message || '')) {
          const fallback = await supabase
            .from('daily_reports')
            .select('id, report_date')
            .eq('project_id', projectId)
            .order('report_date', { ascending: false })
            .limit(5)
          logs = fallback.data
        }
        if (!cancelled) setRecentDiaries(logs || [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load diary entry')
      } finally {
        // Camera cancel / Back mid-load remounts must not leave Loading stuck
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, editingReportId])

  const handleLocationWalkChange = useCallback((next) => {
    setLocationWalk(next)
    setPhotos(flattenAreaGroups(next))
  }, [])

  const continueToSignature = useCallback(() => {
    signatureSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
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
  const scanSheetPreviewRef = useRef(scanSheetPreview)
  scanSheetPreviewRef.current = scanSheetPreview
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
    if (scanSheetPreviewRef.current && String(scanSheetPreviewRef.current).startsWith('blob:')) {
      URL.revokeObjectURL(scanSheetPreviewRef.current)
    }
  }, [])

  const projectSubtitle = useMemo(() => {
    if (!project) return ''
    const parts = [project.client_name, project.site_address].filter(Boolean)
    return parts.join(' · ')
  }, [project])

  const labourTotals = useMemo(() => labourAggregateTotals(labourRows), [labourRows])

  const clearScanPreview = useCallback(() => {
    setScanSheetPreview((prev) => {
      if (prev && String(prev).startsWith('blob:')) {
        try { URL.revokeObjectURL(prev) } catch { /* ignore */ }
      }
      return null
    })
  }, [])

  const handleSignInSheetFiles = useCallback(async (files) => {
    const file = files?.[0]
    // Camera cancel / empty picker — do not touch loading or draft state
    if (!file || !(file instanceof Blob)) return
    if (!reportDate) {
      setScanError('Set the report date before scanning a sign-in sheet.')
      return
    }

    setLabourMode('scan')
    setScanLoading(true)
    setScanError('')
    setScanWarnings([])
    setScanOperatives([])
    setScanLastFile(file)
    clearScanPreview()
    let previewUrl = null
    try {
      const dataUrl = await fileToVisionDataUrl(file)
      previewUrl = dataUrl
      setScanSheetPreview(previewUrl)

      const result = await parseSignInSheetImage({
        dataUrl,
        reportDate,
        groupBy: labourGroupBy,
      })

      const operatives = Array.isArray(result.operatives) ? result.operatives : []
      setScanOperatives(operatives)
      setScanWarnings(Array.isArray(result.warnings) ? result.warnings : [])
      setScanMeta({
        matched: result.matchedCount || 0,
        ignored: result.ignoredCount || 0,
        extracted: result.extractedCount || operatives.length,
      })

      if (!operatives.length) {
        setScanError('No attendee rows were read from this sheet. Try another photo or enter labour manually.')
      }
    } catch (err) {
      setScanSheetPreview(null)
      setScanError(err?.message || 'Failed to scan sign-in sheet')
      setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
      setScanOperatives([])
      setScanWarnings([])
    } finally {
      setScanLoading(false)
    }
  }, [reportDate, labourGroupBy, clearScanPreview])

  const applyScanOperativesToLabour = useCallback(() => {
    const nextRows = labourRowsFromOperatives(scanOperatives, {
      groupBy: labourGroupBy,
      makeKey: makeUuid,
    })
    setLabourRows(nextRows.length > 0 ? nextRows : [emptyLabour()])
    setScanError('')
  }, [scanOperatives, labourGroupBy])

  const retrySignInScan = useCallback(() => {
    if (scanLastFile) {
      handleSignInSheetFiles([scanLastFile])
    }
  }, [scanLastFile, handleSignInSheetFiles])

  const startManualLabour = useCallback(() => {
    setLabourMode('manual')
    setScanError('')
    setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
    setScanWarnings([])
    setScanOperatives([])
    setScanLastFile(null)
    clearScanPreview()
    setLabourRows((rows) => (rows.some(labourRowHasData) ? rows : [emptyLabour()]))
  }, [clearScanPreview])

  const updateLabour = (key, field, value) => {
    setLabourRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const updatePlant = (key, field, value) => {
    setPlantRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const updateEquipmentHire = (key, field, value) => {
    setEquipmentHireRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const handleProjectChange = (newId) => {
    if (newId && newId !== projectId) {
      let query = ''
      if (editingReportId) query = `?report=${editingReportId}`
      else if (duplicateReportId) query = `?duplicate=${duplicateReportId}`
      else if (prefillLast) query = '?prefill=last'
      router.push(`/dashboard/project/${newId}/diary${query}`)
    }
  }

  const removeCoverPhoto = () => {
    if (coverPhoto?.file && coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview)
    setCoverPhoto(null)
  }

  const labourHasData = labourRowHasData

  const plantHasData = (row) =>
    row.plant_type.trim() || row.quantity || row.hours || row.notes.trim()

  const handleContinueDraft = async () => {
    if (!openDraft?.id || startBusy) return
    openReportForm(openDraft.id)
  }

  const handleCreateTodaysDiary = async () => {
    if (startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, projectId)
      openReportForm(id)
    } catch (err) {
      setStartError(err?.message || 'Could not create today’s diary')
      setStartBusy(false)
    }
  }

  const handleStartBlankDiary = async () => {
    if (startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createBlankDiaryDraft(supabase, projectId)
      openReportForm(id)
    } catch (err) {
      setStartError(err?.message || 'Could not start blank diary')
      setStartBusy(false)
    }
  }

  const handleUseAsTemplate = async (sourceId) => {
    if (!sourceId || startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, projectId, sourceId)
      openReportForm(id)
    } catch (err) {
      setStartError(err?.message || 'Could not create diary from template')
      setStartBusy(false)
    }
  }

  const diarySaveLog = (...args) => {
    if (process.env.NODE_ENV !== 'production') console.log(DIARY_SAVE_LOG, ...args)
  }

  /**
   * TODO(P1+): Persist in-progress diary form edits across login if we add a safe
   * client draft snapshot. Today React state is lost on full navigation; only the
   * report return URL is preserved via ?next=.
   */
  const goToSignInForSave = () => {
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : `/dashboard/project/${projectId}/diary${editingReportId ? `?report=${editingReportId}` : ''}`
    // Full navigation so /login?next=… is always the loaded URL (not a soft push race).
    window.location.assign(loginUrlWithReturn(path))
  }

  const friendlyDiarySaveError = (err) => {
    switch (err?.code) {
      case 'MISSING_REPORT_ID':
        return 'We couldn’t save your Site Diary because it wasn’t opened correctly. Go back to Site Diary and choose Open Latest Diary or Start New Site Diary.'
      case 'MISSING_PROJECT_ID':
        return 'We couldn’t save your Site Diary because it isn’t linked to a project. Go back to Site Diary and open it again.'
      case 'PREFLIGHT_FAILED':
      case 'PREFLIGHT_ZERO_ROWS':
      case 'ID_MISMATCH':
      case 'UPDATE_ZERO_ROWS':
      case 'UPDATE_FAILED':
      case 'VERIFY_SELECT_FAILED':
      case 'VERIFY_MISMATCH':
        return 'We couldn’t save your Site Diary. Check your connection and try again.'
      case 'LABOUR_DELETE_FAILED':
      case 'LABOUR_INSERT_FAILED':
      case 'PLANT_DELETE_FAILED':
      case 'PLANT_INSERT_FAILED':
      case 'PHOTOS_LIST_FAILED':
      case 'PHOTOS_DELETE_FAILED':
      case 'PHOTOS_INSERT_FAILED':
        return 'We couldn’t save all of your Site Diary. Check your connection and try again.'
      default:
        return 'We couldn’t save your Site Diary. Check your connection and try again.'
    }
  }

  const markSessionExpired = () => {
    diarySaveLog('session expired')
    saveLockRef.current = false
    completingRef.current = false
    flushSync(() => {
      setSessionExpired(true)
      setSaving(false)
      setJustSaved(false)
      setShowSaveBanner(false)
      setError(SESSION_EXPIRED_SAVE_MESSAGE)
    })
    saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  const handleSave = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()

    if (sessionExpired) {
      goToSignInForSave()
      return
    }

    diarySaveLog('save button clicked', {
      reportId: editingReportId,
      projectId,
      saveLocked: saveLockRef.current,
      completing: completingRef.current,
    })

    // Clear stale locks so Save is never silently no-op.
    if (saveLockRef.current && !saving && !justSaved) {
      saveLockRef.current = false
      completingRef.current = false
    }

    if (saveLockRef.current || justSaved || completingRef.current) {
      const blockMsg = justSaved || completingRef.current
        ? 'Save already completed for this attempt. Change a field or reopen the report.'
        : 'Save is already in progress.'
      flushSync(() => {
        setError(blockMsg)
      })
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }

    saveLockRef.current = true
    flushSync(() => {
      setSaving(true)
      setJustSaved(false)
      setShowSaveBanner(false)
      setError('')
    })

    const failSave = (message) => {
      diarySaveLog('fail', { message })
      saveLockRef.current = false
      completingRef.current = false
      flushSync(() => {
        setSaving(false)
        setJustSaved(false)
        setShowSaveBanner(false)
        setError(message)
      })
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }

    try {
      if (!editingReportId) {
        failSave('We couldn’t save your Site Diary because it wasn’t opened correctly. Go back to Site Diary and choose Open Latest Diary or Start New Site Diary.')
        return
      }

      if (!siteSummary.trim()) {
        failSave('Add a short site summary, then tap Save Site Diary.')
        return
      }

      const missingDescriptions = photosMissingDescription(locationWalk)
      if (missingDescriptions.length > 0) {
        const n = missingDescriptions.length
        failSave(
          n === 1
            ? '1 photo still needs a description. Add it, then tap Save Site Diary.'
            : `${n} photos still need descriptions. Add them, then tap Save Site Diary.`,
        )
        locationWalkRef.current?.openFirstIncompletePhoto?.()
        return
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      diarySaveLog('auth check', {
        userId: user?.id || null,
        authError: authError?.message || null,
      })
      if (!user) {
        markSessionExpired()
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
          failSave('We couldn’t upload the cover photo. Check your connection and try Save Site Diary again.')
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
          failSave('We couldn’t upload the signature. Check your connection and try Save Site Diary again.')
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

      const labourPayload = labourRows
        .filter(labourHasData)
        .map((row, index) => ({
          report_id: editingReportId,
          trade: row.trade.trim() || null,
          company: row.company.trim() || null,
          count: row.headcount ? parseInt(row.headcount, 10) : null,
          hours: row.hours ? parseFloat(row.hours) : null,
          notes: row.notes.trim() || null,
          sequence: index,
        }))

      const plantPayload = plantRows
        .filter(plantHasData)
        .map((row, index) => ({
          report_id: editingReportId,
          item: row.plant_type.trim() || null,
          ref: row.quantity ? parseInt(row.quantity, 10) : null,
          status: row.hours ? parseFloat(row.hours) : null,
          notes: row.notes.trim() || null,
          sequence: index,
        }))

      const sequenced = flattenAreaGroups(locationWalk)
      const keptStoragePaths = sequenced
        .filter((p) => !p.file && p.storagePath)
        .map((p) => p.storagePath)

      const photoRecords = []
      const updateExistingPhotos = []

      for (const photo of sequenced) {
        let overlayPath = photo.overlayPath || null
        if (photo.overlayDirty) {
          try {
            if (hasAnnotations(photo.annotations) && photo.overlayPreview) {
              overlayPath = await uploadOverlayPng(supabase, {
                userId: user.id,
                reportId: editingReportId,
                sequence: photo.sequence_number,
                dataUrl: photo.overlayPreview,
              })
            } else {
              overlayPath = null
            }
          } catch (overlayErr) {
            failSave('We couldn’t upload photo mark-ups. Check your connection and try Save Site Diary again.')
            return
          }
        }

        const annotationPayload = hasAnnotations(photo.annotations) ? photo.annotations : null

        if (photo.file) {
          const ext = photo.file.name.split('.').pop()?.toLowerCase() || 'jpg'
          const storagePath = `${user.id}/${editingReportId}/${photo.sequence_number}-${Date.now()}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from('site-photos')
            .upload(storagePath, photo.file, { contentType: photo.file.type, upsert: false })

          if (uploadError) {
            failSave('We couldn’t upload a photo. Check your connection and try Save Site Diary again.')
            return
          }

          photoRecords.push({
            report_id: editingReportId,
            url: storagePath,
            caption: (photo.caption || '').trim() || null,
            sequence: photo.sequence_number,
            layout: photo.layout || 'grid4',
            location: photo.location || photo.area || null,
            annotations: annotationPayload,
            overlay_path: overlayPath,
          })
        } else if (photo.storagePath) {
          updateExistingPhotos.push({
            url: photo.storagePath,
            fields: {
              caption: (photo.caption || '').trim() || null,
              sequence: photo.sequence_number,
              layout: photo.layout || 'grid4',
              location: photo.location || photo.area || null,
              annotations: annotationPayload,
              overlay_path: overlayPath,
            },
          })
        }
      }

      const saved = await finalizeSiteDiarySave(supabase, {
        reportId: editingReportId,
        projectId,
        reportPayload,
        labourPayload,
        plantPayload,
        keptStoragePaths,
        photoRecords,
        updateExistingPhotos,
      })

      if (!saved?.id || saved.id !== editingReportId) {
        failSave('We couldn’t save your Site Diary. Check your connection and try again.')
        return
      }

      // Button confirmation + non-blocking green banner (~3s), then Report Complete.
      completingRef.current = true
      flushSync(() => {
        setSaving(false)
        setJustSaved(true)
        setShowSaveBanner(true)
      })
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      diarySaveLog('success', { reportId: saved.id })

      if (saveNavTimerRef.current) clearTimeout(saveNavTimerRef.current)
      saveNavTimerRef.current = setTimeout(() => {
        router.replace(`/dashboard/project/${projectId}/diary/complete?report=${saved.id}`)
      }, 3000)
    } catch (err) {
      const message =
        err instanceof DiarySaveError
          ? friendlyDiarySaveError(err)
          : 'We couldn’t save your Site Diary. Check your connection and try again.'
      failSave(message)
    }
  }


  useEffect(() => {
    return () => {
      // Do not cancel an in-flight handoff to Report Complete (Strict Mode / remount).
      if (completingRef.current) return
      if (saveNavTimerRef.current) clearTimeout(saveNavTimerRef.current)
    }
  }, [])

  if (loading) {
    return (
      <PremiumShell
        title="Site Diary"
        backHref="/dashboard"
        accent={REPORT_THEMES.diary.accent}
        maxWidth={720}
      >
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  if (showStartScreen) {
    return (
      <PremiumShell
        title="Site Diary"
        backHref="/dashboard"
        accent={REPORT_THEMES.diary.accent}
        maxWidth={720}
      >
        {(startError || error) && (
          <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: '#ff6b6b', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
            {startError || error}
          </div>
        )}

        <h2
          style={{
            ...typeTokens.sectionTitle,
            marginTop: 0,
            marginBottom: 16,
            color: 'var(--text)',
            fontSize: 18,
            letterSpacing: '0.02em',
            textTransform: 'none',
          }}
        >
          Today’s Site Diary
        </h2>

        {openDraft ? (
          <GlassSection title="Continue existing draft" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Continue where you left off.
            </p>
            <SecondaryButton type="button" disabled={startBusy} onClick={handleContinueDraft}>
              Continue Draft
            </SecondaryButton>
          </GlassSection>
        ) : null}

        <GlassSection title="Create today’s diary" accent={DIARY_ACCENT}>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
            Start a new diary for today using reusable details from your most recent saved entry. Your previous diary stays unchanged.
          </p>
          <PrimaryCTA type="button" disabled={startBusy} accent={DIARY_ACCENT} onClick={handleCreateTodaysDiary}>
            {startBusy ? 'Working…' : 'Create Today’s Diary'}
          </PrimaryCTA>
        </GlassSection>

        <GlassSection title="Start blank diary" accent={DIARY_ACCENT}>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
            Create a completely new empty draft for today.
          </p>
          <SecondaryButton type="button" disabled={startBusy} onClick={handleStartBlankDiary}>
            Start Blank Diary
          </SecondaryButton>
        </GlassSection>

        <h2
          style={{
            ...typeTokens.sectionTitle,
            marginTop: 32,
            marginBottom: 12,
            color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
            fontSize: 16,
            letterSpacing: '0.072em',
          }}
        >
          Recent diary entries
        </h2>

        {recentDiaries.length === 0 ? (
          <div className={premiumDiaryEmptyClass}>
            <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
            <p className={premiumDiaryEmptyHintClass}>Create today’s diary to add your first saved entry</p>
          </div>
        ) : (
          recentDiaries.map((d) => (
            <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
              <div style={recentEntryDateStyle}>{project?.name || 'Project'}</div>
              <div style={recentEntrySummaryStyle}>
                {d.report_date
                  ? new Date(`${d.report_date}T12:00:00`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : ''}
              </div>
              <div style={recentEntryActionsStyle}>
                <SecondaryButton
                  type="button"
                  onClick={() => openReportForm(d.id)}
                  style={recentEntryActionButtonStyle}
                >
                  View / Edit
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  disabled={startBusy}
                  onClick={() => handleUseAsTemplate(d.id)}
                  style={recentEntryActionButtonStyle}
                >
                  Use as Template
                </SecondaryButton>
              </div>
            </RecentEntryCard>
          ))
        )}
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="Site Diary"
      backHref={`/dashboard/project/${projectId}/diary`}
      accent={REPORT_THEMES.diary.accent}
      maxWidth={720}
    >
      {error && (
        <div
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.45,
            whiteSpace: 'pre-line',
          }}
        >
          {error}
        </div>
      )}
      {showSaveBanner && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 18,
            left: '50%',
            zIndex: 80,
            width: 'min(440px, calc(100vw - 32px))',
            marginLeft: 0,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            padding: '12px 16px',
            fontSize: 14,
            lineHeight: 1.45,
            borderRadius: 10,
            textAlign: 'center',
            fontWeight: 600,
            background: 'rgba(34,197,94,0.14)',
            border: '1px solid rgba(34,197,94,0.38)',
            color: '#4ade80',
            boxShadow: '0 10px 28px color-mix(in srgb, var(--ink) 35%, transparent)',
            animation: 'zlog-save-banner 3s ease forwards',
          }}
        >
          ✓ Your Site Diary has been saved.
        </div>
      )}
      {editingReportId && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          You’re editing today’s Site Diary
          {project?.name ? (
            <>
              {' '}
              for{' '}
              <strong style={{ fontWeight: 700, color: 'var(--text)' }}>{project.name}</strong>
            </>
          ) : null}
          . Fill in the sections below, then tap <strong>Save Site Diary</strong> when you’re ready.
        </div>
      )}

      {(project?.name || creatorName || companyReportingFor || reportDate) && (
        <div
          style={{
            background: 'var(--plate)',
            border: '1px solid var(--edge)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {setupLogoPreview ? (
              <img
                src={setupLogoPreview}
                alt=""
                style={{
                  width: 48,
                  height: 48,
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--ink) 40%, var(--plate))',
                  border: '1px solid var(--edge)',
                  flexShrink: 0,
                  padding: 4,
                }}
              />
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                {project?.name || 'Project'}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'color-mix(in srgb, var(--text) 82%, var(--text-2))', lineHeight: 1.45 }}>
                {[
                  creatorName && `Author: ${creatorName}`,
                  companyReportingFor && `On behalf of: ${companyReportingFor}`,
                  reportDate &&
                    new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  projectReference && `Ref: ${projectReference}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <SecondaryButton
            type="button"
            href={`/dashboard/diary/setup?report=${editingReportId}&project=${projectId}`}
            style={{ width: '100%', minHeight: 48, marginTop: 12 }}
          >
            Edit Report Details
          </SecondaryButton>
        </div>
      )}

      <form
        method="post"
        onSubmit={(e) => {
          // Prevent native navigation that remounts the page and aborts async save.
          e.preventDefault()
          if (sessionExpired) {
            goToSignInForSave()
            return
          }
          handleSave(e)
        }}
      >
        <BrandingSelector
          value={brandingSelection}
          onChange={setBrandingSelection}
          accent={DIARY_ACCENT}
          autoSelectDefault={!editingReportId}
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

          <div ref={signatureSectionRef}>
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
                  <SecondaryButton type="button" onClick={useExistingSignature}>
                    Use Existing Signature
                  </SecondaryButton>
                )}
                <SecondaryButton type="button" onClick={resignSignature}>
                  Re-sign / Clear
                </SecondaryButton>
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
              <SecondaryButton type="button" onClick={clearSignaturePad}>
                Clear
              </SecondaryButton>
            </div>
          )}
          </div>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              className="zlog-secondary-btn"
              onClick={() => {
                setLabourMode('scan')
                setScanError('')
              }}
              style={{
                ...addRowButtonStyle,
                textTransform: 'none',
                letterSpacing: '0.02em',
                borderStyle: labourMode === 'scan' ? 'solid' : 'dashed',
                borderColor: labourMode === 'scan' ? `rgba(${DIARY_ACCENT}, 0.55)` : 'var(--edge)',
                color: 'var(--text)',
                boxShadow: labourMode === 'scan' ? `0 0 0 1px rgba(${DIARY_ACCENT}, 0.25)` : undefined,
              }}
            >
              Scan Sign-In Sheet (Camera/Upload)
            </button>
            <button
              type="button"
              className="zlog-secondary-btn"
              onClick={startManualLabour}
              style={{
                ...addRowButtonStyle,
                textTransform: 'none',
                letterSpacing: '0.02em',
                borderStyle: labourMode === 'manual' ? 'solid' : 'dashed',
                borderColor: labourMode === 'manual' ? `rgba(${DIARY_ACCENT}, 0.55)` : 'var(--edge)',
                color: 'var(--text)',
                boxShadow: labourMode === 'manual' ? `0 0 0 1px rgba(${DIARY_ACCENT}, 0.25)` : undefined,
              }}
            >
              Manual Entry
            </button>
          </div>

          {labourMode === 'scan' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0, fontSize: 10 }}>Aggregate by</label>
                <select
                  value={labourGroupBy}
                  onChange={(e) => setLabourGroupBy(e.target.value)}
                  style={{ ...cellInputStyle, width: 'auto', minWidth: 180, marginBottom: 0 }}
                  disabled={scanLoading}
                >
                  <option value="trade_company">Trade + company</option>
                  <option value="trade">Trade</option>
                  <option value="company">Company / subcontractor</option>
                </select>
              </div>
              <ImageSourceButtons
                onFiles={handleSignInSheetFiles}
                disabled={scanLoading}
                cameraLabel="Scan with camera"
                galleryLabel="Upload sheet photo"
                hint="OCR extracts sign-in/out times only. Review every operative before applying to the labour summary."
              />
              {scanLoading && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
                  Reading sign-in sheet…
                </p>
              )}
              {scanSheetPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scanSheetPreview}
                  alt="Sign-in sheet preview"
                  style={{
                    marginTop: 12,
                    width: '100%',
                    maxHeight: 180,
                    objectFit: 'contain',
                    borderRadius: 10,
                    border: '1px solid var(--edge)',
                    background: 'var(--ink)',
                  }}
                />
              )}
              {scanError && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#ff6b6b' }}>{scanError}</p>
              )}
              {!scanLoading && scanMeta.extracted > 0 && !scanError && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                  Extracted {scanMeta.extracted} operative{scanMeta.extracted === 1 ? '' : 's'}
                  {scanMeta.ignored > 0 ? ` · ${scanMeta.ignored} flagged as other date` : ''}.
                </p>
              )}
              {!scanLoading && scanOperatives.length > 0 && (
                <SignInOperativeReview
                  operatives={scanOperatives}
                  onChange={setScanOperatives}
                  onApply={applyScanOperativesToLabour}
                  onRetry={scanLastFile ? retrySignInScan : undefined}
                  warnings={scanWarnings}
                  reportDate={reportDate}
                  disabled={scanLoading}
                />
              )}
            </div>
          )}

          <div
            style={{
              marginBottom: 12,
              border: '1px solid var(--edge)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--plate)',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--edge)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Labour summary · {reportDate}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {labourTotals.operatives} operatives · {labourTotals.hours} hrs
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>Trade</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>Company</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Ops</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Hours</th>
                    <th style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {labourRows.map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%' }}
                          value={row.trade}
                          onChange={(e) => updateLabour(row.key, 'trade', e.target.value)}
                          placeholder="Carpenter"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%' }}
                          value={row.company}
                          onChange={(e) => updateLabour(row.key, 'company', e.target.value)}
                          placeholder="Subco Ltd"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          min="0"
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                          value={row.headcount}
                          onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)}
                          placeholder="4"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                          value={row.hours}
                          onChange={(e) => updateLabour(row.key, 'hours', e.target.value)}
                          placeholder="8"
                        />
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {labourRows.length > 1 && (
                          <button
                            type="button"
                            style={{ ...removeRowStyle, marginBottom: 0, padding: '4px 6px' }}
                            onClick={() => setLabourRows((rows) => rows.filter((r) => r.key !== row.key))}
                            aria-label="Remove labour row"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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

        <AiLocationWalk
          ref={locationWalkRef}
          accent={DIARY_ACCENT}
          projectId={projectId}
          value={locationWalk}
          onChange={handleLocationWalkChange}
          title="Work Photos"
          onContinueToSignature={continueToSignature}
        />

        <div ref={saveCtaRef} style={{ marginTop: 8 }}>
          {error && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.45,
                borderRadius: 10,
                whiteSpace: 'pre-line',
                background: 'rgba(220,50,50,0.1)',
                border: '1px solid rgba(220,50,50,0.3)',
                color: '#ff6b6b',
              }}
            >
              {error}
            </div>
          )}
          <PrimaryCTA
            type="button"
            onClick={sessionExpired ? goToSignInForSave : handleSave}
            disabled={sessionExpired ? false : saving || justSaved}
            accent={REPORT_THEMES.diary.accent}
            style={
              sessionExpired
                ? {
                    cursor: 'pointer',
                    opacity: 1,
                  }
                : justSaved
                ? {
                    border: '1px solid color-mix(in srgb, #22c55e, var(--ink) 45%)',
                    background:
                      'linear-gradient(180deg, color-mix(in srgb, #22c55e, var(--text) 14%) 0%, #16a34a 42%, color-mix(in srgb, #15803d, var(--ink) 18%) 100%)',
                    boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 78%)',
                    cursor: 'default',
                    opacity: 1,
                  }
                : saving
                  ? {
                      cursor: 'wait',
                      opacity: 1,
                    }
                  : undefined
            }
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              {sessionExpired ? (
                'Sign in to save your work'
              ) : saving ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid color-mix(in srgb, var(--text) 30%, transparent)',
                      borderTopColor: 'var(--text)',
                      animation: 'zlog-save-spin 0.7s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                  Saving…
                </>
              ) : justSaved ? (
                '✓ Site Diary Saved'
              ) : (
                'Save Site Diary'
              )}
            </span>
          </PrimaryCTA>
        </div>
        <style>{`
          @keyframes zlog-save-spin {
            to { transform: rotate(360deg); }
          }
          @keyframes zlog-save-banner {
            0% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
            12% { opacity: 1; transform: translateX(-50%) translateY(0); }
            78% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          }
        `}</style>
      </form>

      <h2
        style={{
          ...typeTokens.sectionTitle,
          marginTop: 32,
          marginBottom: 12,
          color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
          fontSize: 16,
          letterSpacing: '0.072em',
        }}
      >
        Recent diary entries
      </h2>

      {recentDiaries.length === 0 ? (
        <div className={premiumDiaryEmptyClass}>
          <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
          <p className={premiumDiaryEmptyHintClass}>Save a diary report to see it listed here</p>
        </div>
      ) : (
        recentDiaries.map((d) => (
          <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
            <div style={recentEntryDateStyle}>{project?.name || 'Project'}</div>
            <div style={recentEntrySummaryStyle}>
              {d.report_date
                ? new Date(`${d.report_date}T12:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </div>
            <div style={recentEntryActionsStyle}>
              <SecondaryButton
                type="button"
                onClick={() => router.push(`/dashboard/project/${projectId}/diary?report=${d.id}`)}
                style={recentEntryActionButtonStyle}
              >
                View / Edit
              </SecondaryButton>
              <SecondaryButton
                type="button"
                disabled={startBusy}
                onClick={() => handleUseAsTemplate(d.id)}
                style={recentEntryActionButtonStyle}
              >
                Use as Template
              </SecondaryButton>
            </div>
          </RecentEntryCard>
        ))
      )}
    </PremiumShell>
  )
}
