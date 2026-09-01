'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  ZlogBackControl,
  labelStyle,
  inputStyle,
  DIARY_ACCENT,
  typeTokens,
  sectionTitleStyle,
} from '@/lib/premium-ui'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { extractBrandColorFromFile } from '@/lib/extract-brand-color'
import { ProjectDatesFields } from '@/components/project/ProjectDatesFields'
import { ProjectStickyFields } from '@/components/project/ProjectStickyFields'
import { validateProjectDates } from '@/lib/project-day'
import {
  NEW_PROJECT_SENTINEL,
  fetchProjectsForSetup,
  findExistingProjectByName,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
  showProjectDatesOnSetup,
} from '@/lib/diary-setup-project-dates'
import {
  clearToNewProjectSelection,
  initialiseNewDiarySetupState,
  shouldRestoreSetupFormDraft,
} from '@/lib/diary-setup-blank'
import {
  fetchReportingCompanyForReport,
  fetchStickyReportingCompany,
  persistReportingCompanyIdentity,
} from '@/lib/diary-reporting-company'
import {
  DEFAULT_SITE_DIARY_SHIFT,
  SITE_DIARY_SHIFT_OPTIONS,
  hydrateShift,
} from '@/lib/diary-setup-shift'
import {
  buildDiarySetupContinueForm,
  persistSetupProject,
  runDiarySetupContinue,
  validateDiarySetupContinue,
} from '@/lib/diary-setup-continue'
import {
  hydrateStickyFromRow,
  validateStickyProjectFields,
} from '@/lib/project-sticky-fields'
import { hydrateAuthorRole } from '@/lib/diary-form-hydrate'
import {
  createDiaryDraftFromSetup,
  fetchDefaultCompanyProfile,
  updateDiarySetupFields,
} from '@/lib/diary-draft'
import { loadEditDiarySetupSources } from '@/lib/diary-edit-hydrate'
import {
  coverPhotoStateFromSaved,
  resolveCoverPhotoPreviewUrl,
  uploadRawCoverFallbackFile,
} from '@/lib/diary-cover-photo'
import { putPendingCover, newCoverPendingGeneration } from '@/lib/diary-cover-pending'
import { diaryHubHref } from '@/lib/diary-routing'
import {
  resolveSignedInAuthorProfile,
  persistSignedInAuthorProfile,
  isAccountDerivedAuthorName,
  clearSetupFormDraft,
  readReportSetupExtras,
  reportDateInputValue,
  todayIsoDate,
  writeReportSetupExtras,
  writeSetupFormDraft,
} from '@/lib/report-setup'
import {
  getSiteDiarySessionSnapshot,
  runSiteDiaryShadowSetupProof,
  SITE_DIARY_SHADOW_FIELD_KEYS,
} from '@/lib/site-diary-session-context'

const setupInputStyle = {
  ...inputStyle,
  minHeight: 48,
  fontSize: 16,
  padding: '14px 16px',
  marginBottom: 20,
}

const setupLabelStyle = {
  ...labelStyle,
  fontSize: 13,
  letterSpacing: '0.08em',
  marginBottom: 10,
  color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
}

const logoControlButtonStyle = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  padding: '8px 10px',
  boxSizing: 'border-box',
}

const NEW_PROJECT_VALUE = NEW_PROJECT_SENTINEL

async function signedLogoUrl(supabase, path) {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('blob:')) return path
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

function isCompleteSdscSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key) || snapshot[key] === undefined) {
      return false
    }
  }
  return true
}

function sdscSnapshotMatchesEditTarget(snapshot, { userId, projectId, reportId } = {}) {
  if (!snapshot) return false
  const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()
  return (
    same(snapshot.userId, userId)
    && same(snapshot.projectId, projectId)
    && same(snapshot.reportId, reportId)
  )
}

function SiteDiarySetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editingReportId = searchParams.get('report') || null
  const editingProjectId = searchParams.get('project') || null
  const supabase = createClient()
  const setupTitle = editingReportId ? 'Project & Report Details' : 'New Site Diary'
  const setupBackHref = useMemo(
    () => (editingProjectId ? diaryHubHref({ projectId: editingProjectId }) : '/dashboard/diary'),
    [editingProjectId],
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState([])

  const [selectedProjectId, setSelectedProjectId] = useState(NEW_PROJECT_VALUE)
  const [projectName, setProjectName] = useState('')
  const [projectStartDate, setProjectStartDate] = useState('')
  const [projectPlannedCompletionDate, setProjectPlannedCompletionDate] = useState('')
  const [projectDatesError, setProjectDatesError] = useState('')
  const [projectAddress, setProjectAddress] = useState('')
  const [projectManager, setProjectManager] = useState('')
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState('')
  const [currentPhase, setCurrentPhase] = useState('')
  const [stickyFieldsError, setStickyFieldsError] = useState('')
  const [author, setAuthor] = useState('')
  const [authorRole, setAuthorRole] = useState('')
  const [shift, setShift] = useState(DEFAULT_SITE_DIARY_SHIFT)
  const [reportingCompany, setReportingCompany] = useState('')
  const [reportingOnBehalfOf, setReportingOnBehalfOf] = useState('')
  const [reportDate, setReportDate] = useState(todayIsoDate())
  const [projectReference, setProjectReference] = useState('')

  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoStoragePath, setLogoStoragePath] = useState(null)
  const [logoObjectUrl, setLogoObjectUrl] = useState(null)
  const [brandingId, setBrandingId] = useState(null)
  const [brandColor, setBrandColor] = useState(null)
  // Cover photo lives on Project & Report Details (this setup stage), not Today's Site Diary.
  const [coverPhoto, setCoverPhoto] = useState(null)
  const [coverRemoved, setCoverRemoved] = useState(false)

  const projectNameInputRef = useRef(null)
  const authorInputRef = useRef(null)
  const reportingOnBehalfOfInputRef = useRef(null)
  const reportDateInputRef = useRef(null)
  const detailsTouchedRef = useRef(false)
  const userChangedLogoRef = useRef(false)
  const userChangedCoverRef = useRef(false)

  const existingProjects = useMemo(
    () => (projects || []).filter((p) => p?.id && p?.name),
    [projects],
  )

  const persistForm = useCallback((next) => {
    writeSetupFormDraft(next)
  }, [])

  const applyFormSnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    if (snapshot.selectedProjectId) setSelectedProjectId(snapshot.selectedProjectId)
    if (typeof snapshot.projectName === 'string') setProjectName(snapshot.projectName)
    if (typeof snapshot.projectStartDate === 'string') setProjectStartDate(snapshot.projectStartDate)
    if (typeof snapshot.projectPlannedCompletionDate === 'string') {
      setProjectPlannedCompletionDate(snapshot.projectPlannedCompletionDate)
    }
    if (typeof snapshot.projectAddress === 'string') setProjectAddress(snapshot.projectAddress)
    if (typeof snapshot.projectManager === 'string') setProjectManager(snapshot.projectManager)
    if (typeof snapshot.workingDaysPerWeek === 'string') setWorkingDaysPerWeek(snapshot.workingDaysPerWeek)
    if (typeof snapshot.currentPhase === 'string') setCurrentPhase(snapshot.currentPhase)
    if (typeof snapshot.author === 'string') setAuthor(snapshot.author)
    if (typeof snapshot.authorRole === 'string') setAuthorRole(snapshot.authorRole)
    if (typeof snapshot.shift === 'string' && snapshot.shift) setShift(hydrateShift(snapshot.shift))
    if (typeof snapshot.reportingOnBehalfOf === 'string') setReportingOnBehalfOf(snapshot.reportingOnBehalfOf)
    if (typeof snapshot.reportDate === 'string' && snapshot.reportDate) setReportDate(snapshot.reportDate)
    if (typeof snapshot.projectReference === 'string') setProjectReference(snapshot.projectReference)
    if (typeof snapshot.logoStoragePath === 'string' || snapshot.logoStoragePath === null) {
      setLogoStoragePath(snapshot.logoStoragePath)
    }
    if (typeof snapshot.brandingId === 'string' || snapshot.brandingId === null) {
      setBrandingId(snapshot.brandingId)
    }
    if (typeof snapshot.brandColor === 'string' || snapshot.brandColor === null) {
      setBrandColor(snapshot.brandColor)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let usedFastPath = false

    const applySdscSnapshotToForm = (snapshot) => {
      setSelectedProjectId(snapshot.projectId || NEW_PROJECT_VALUE)
      setProjectName(snapshot.projectName || '')
      setProjectAddress(snapshot.projectAddress || '')
      setProjectManager(snapshot.projectManager || '')
      setWorkingDaysPerWeek(snapshot.workingDaysPerWeek || '')
      setCurrentPhase(snapshot.currentPhase || '')
      setProjectStartDate(snapshot.projectStartDate || '')
      setProjectPlannedCompletionDate(snapshot.projectPlannedCompletionDate || '')
      setShift(hydrateShift(snapshot.shift))
      setProjectReference(snapshot.projectReference || '')
      setReportDate(snapshot.reportDate || '')
      setReportingCompany(snapshot.reportingCompany || '')
      setReportingOnBehalfOf(snapshot.reportingOnBehalfOf || '')
      setAuthor(snapshot.author || '')
      setAuthorRole(snapshot.authorRole || '')
      setBrandingId(snapshot.brandingId || null)
      setBrandColor(snapshot.brandColor || null)
      setLogoStoragePath(snapshot.logoStoragePath || null)
      setLogoFile(null)
      setCoverRemoved(false)
      const coverPath = snapshot.coverStoragePath || null
      if (coverPath) {
        setCoverPhoto(coverPhotoStateFromSaved(coverPath, null))
      } else {
        setCoverPhoto(null)
      }
    }

    const trySdscFastPath = async () => {
      if (!editingReportId || !editingProjectId) {
        return false
      }

      let sessionUserId = ''
      try {
        const { data } = await supabase.auth.getSession()
        sessionUserId = data?.session?.user?.id || ''
      } catch {
        return false
      }
      if (!String(sessionUserId).trim()) {
        return false
      }

      const snapshot = getSiteDiarySessionSnapshot({
        userId: sessionUserId,
        projectId: editingProjectId,
        reportId: editingReportId,
      })
      const complete = isCompleteSdscSnapshot(snapshot)
        && sdscSnapshotMatchesEditTarget(snapshot, {
          userId: sessionUserId,
          projectId: editingProjectId,
          reportId: editingReportId,
        })
      if (!complete) {
        return false
      }

      applySdscSnapshotToForm(snapshot)

      const logoPath = snapshot.logoStoragePath || null
      if (logoPath) {
        let preview = null
        try {
          preview = await signedLogoUrl(supabase, logoPath)
        } catch {
          preview = null
        }
        if (cancelled) return false
        if (!preview) {
          return false
        }
        setLogoPreview(preview)
      } else {
        setLogoPreview(null)
      }

      if (cancelled) return false
      setLoading(false)
      return true
    }

    const load = async () => {
      detailsTouchedRef.current = false
      userChangedLogoRef.current = false
      userChangedCoverRef.current = false
      setLoading(true)
      setError('')
      try {
        if (editingReportId) {
          usedFastPath = await trySdscFastPath()
          if (cancelled) return
        }

        const [projectRows, profile] = await Promise.all([
          fetchProjectsForSetup(supabase),
          fetchDefaultCompanyProfile(supabase),
        ])

        if (cancelled) return
        setProjects(projectRows || [])

        // Author from signed-in profile / auth metadata only.
        // public.users may be missing (404) — resolver must not blank the form.
        // Do not resolve author from prior diary, project, or session draft.
        const authorProfile = await resolveSignedInAuthorProfile(supabase)
        const profileName = authorProfile.authorName
        const profileRole = authorProfile.authorRole
        const signedInUser = authorProfile.user
        if (cancelled) return

        // Existing diary pre-flight (Project & Report Details).
        // Hydrate from canonical DB rows — never session draft / blank defaults.
        if (editingReportId) {
          const loaded = await loadEditDiarySetupSources(supabase, {
            reportId: editingReportId,
            projectId: editingProjectId,
            readExtras: readReportSetupExtras,
          })
          if (cancelled) return
          if (!loaded.ok || !loaded.report) {
            throw new Error(
              loaded.message
                || 'We couldn’t open this Site Diary’s details. Go back and try again.',
            )
          }

          const report = loaded.report
          const project = loaded.project
          const dates = hydrateProjectDatesFromRow(project)
          const sticky = hydrateStickyFromRow(project)
          const skipFormReconcile = usedFastPath && detailsTouchedRef.current
          const skipLogoReconcile = usedFastPath && userChangedLogoRef.current
          const skipCoverReconcile = usedFastPath && userChangedCoverRef.current

          if (!skipFormReconcile) {
            setSelectedProjectId(loaded.projectId || editingProjectId || NEW_PROJECT_VALUE)
            setProjectName(project?.name || '')
            setProjectStartDate(dates.projectStartDate)
            setProjectPlannedCompletionDate(dates.projectPlannedCompletionDate)
            setProjectAddress(sticky.projectAddress)
            setProjectManager(sticky.projectManager)
            setWorkingDaysPerWeek(sticky.workingDaysPerWeek)
            setCurrentPhase(String(report?.current_phase || '').trim())

            // Project Reference — project column first (extras only as legacy fallback).
            setProjectReference(loaded.hydration.projectReference)

            // Edit/View setup: saved diary values win; never keep account-derived aliases.
            const savedAuthor = String(report?.creator_name || '').trim()
            const safeSavedAuthor =
              savedAuthor && !isAccountDerivedAuthorName(savedAuthor, signedInUser)
                ? savedAuthor
                : ''
            setAuthor(safeSavedAuthor || profileName || '')
            setAuthorRole(hydrateAuthorRole(report) || profileRole || '')
            setShift(hydrateShift(report?.shift))
            setReportingOnBehalfOf(
              report?.company_reporting_for || '',
            )
            setReportDate(reportDateInputValue(report?.report_date) || todayIsoDate())
          }

          // Coherent Reporting Company — name + logo from the same identity (never mix).
          const companyIdentity = await fetchReportingCompanyForReport(supabase, report)
          if (cancelled) return
          const logoPath = companyIdentity.logoStoragePath || null
          if (!skipFormReconcile) {
            setReportingCompany(companyIdentity.companyName || '')
            setBrandingId(companyIdentity.brandingId || null)
            setBrandColor(companyIdentity.brandColor || null)
          }
          if (!skipLogoReconcile) {
            if (!skipFormReconcile) setLogoStoragePath(logoPath)
            if (logoPath) {
              const preview = await signedLogoUrl(supabase, logoPath)
              if (!cancelled && !userChangedLogoRef.current) setLogoPreview(preview)
            } else if (!skipFormReconcile && !cancelled && !userChangedLogoRef.current) {
              setLogoPreview(null)
            }
          }

          // Cover photo — same daily_reports.cover_photo_url as workbench/PDF/review.
          const coverPath = loaded.hydration?.coverStoragePath || null
          if (!skipCoverReconcile) {
            if (!skipFormReconcile) setCoverRemoved(false)
            if (coverPath) {
              if (!skipFormReconcile) {
                setCoverPhoto(coverPhotoStateFromSaved(coverPath, null))
              }
              const coverPreview = await resolveCoverPhotoPreviewUrl(supabase, coverPath)
              if (!cancelled && !userChangedCoverRef.current) {
                setCoverPhoto(coverPhotoStateFromSaved(coverPath, coverPreview))
              }
            } else if (!skipFormReconcile) {
              setCoverPhoto(null)
            }
          }

          // SDSC Phase 1 shadow proof only — never drives UI / loading / navigation.
          const savedAuthor = String(report?.creator_name || '').trim()
          const safeSavedAuthor =
            savedAuthor && !isAccountDerivedAuthorName(savedAuthor, signedInUser)
              ? savedAuthor
              : ''
          runSiteDiaryShadowSetupProof({
            userId: signedInUser?.id || '',
            projectId: loaded.projectId || editingProjectId || '',
            reportId: editingReportId,
            projectName: project?.name || '',
            projectStartDate: dates.projectStartDate,
            projectPlannedCompletionDate: dates.projectPlannedCompletionDate,
            projectAddress: sticky.projectAddress,
            projectManager: sticky.projectManager,
            workingDaysPerWeek: sticky.workingDaysPerWeek,
            projectReference: loaded.hydration.projectReference,
            reportDate: reportDateInputValue(report?.report_date) || todayIsoDate(),
            shift: hydrateShift(report?.shift),
            currentPhase: String(report?.current_phase || '').trim(),
            author: (safeSavedAuthor || profileName || ''),
            authorRole: hydrateAuthorRole(report) || profileRole || '',
            reportingOnBehalfOf: report?.company_reporting_for || '',
            reportingCompany: companyIdentity.companyName || '',
            brandingId: companyIdentity.brandingId || null,
            brandColor: companyIdentity.brandColor || null,
            logoStoragePath: logoPath,
            coverStoragePath: coverPath,
          })

          if (!usedFastPath) setLoading(false)
          return
        }

        // Brand-new diary setup — never restore a prior session draft or diary content.
        // The last-used project is an approved editable setup default.
        // (Project & Report Details uses editingReportId above; Use as Basis is separate.)
        // Scratch author: signed-in profile only — not prior diary, project, or draft.
        if (!shouldRestoreSetupFormDraft({ editingReportId })) {
          clearSetupFormDraft()
        }

        // Sticky Reporting Company = latest saved identity (name+logo paired), not a stale default name.
        const stickyCompany = await fetchStickyReportingCompany(supabase)
        if (cancelled) return
        const preferredProjectId = editingProjectId || stickyCompany.latestProjectId
        const existingProject = preferredProjectId
          ? (projectRows || []).find((p) => p.id === preferredProjectId) || null
          : null

        const fresh = initialiseNewDiarySetupState({
          authorName: profileName,
          authorRole: profileRole,
          reportingOnBehalfOf: stickyCompany.reportingOnBehalfOf,
          reportDate: todayIsoDate(),
          companyProfile: stickyCompany.brandingId
            ? {
                id: stickyCompany.brandingId,
                company_name: stickyCompany.companyName,
                logo_url: stickyCompany.logoStoragePath,
                brand_color: stickyCompany.brandColor,
              }
            : profile,
          existingProject,
        })
        if (cancelled) return
        applyFormSnapshot(fresh)
        // Explicit profile author — do not rely solely on snapshot apply path.
        setAuthor(fresh.author)
        setAuthorRole(fresh.authorRole)
        setReportingCompany(stickyCompany.companyName || profile?.company_name || '')
        setBrandingId(stickyCompany.brandingId || fresh.brandingId || null)
        setBrandColor(stickyCompany.brandColor || fresh.brandColor || null)
        setLogoStoragePath(stickyCompany.logoStoragePath || fresh.logoStoragePath || null)

        const logoPath = stickyCompany.logoStoragePath || fresh.logoStoragePath
        if (logoPath) {
          const preview = await signedLogoUrl(supabase, logoPath)
          if (!cancelled) setLogoPreview(preview)
        } else if (!cancelled) {
          setLogoPreview(null)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load setup')
      } finally {
        if (!cancelled && !usedFastPath) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // Intentionally load once per edit target; createClient() is not referentially stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingReportId, editingProjectId])

  // Persist form fields while editing (supports Back → return)
  useEffect(() => {
    if (loading || editingReportId) return
    persistForm({
      selectedProjectId,
      projectName,
      projectStartDate,
      projectPlannedCompletionDate,
      projectAddress,
      projectManager,
      workingDaysPerWeek,
      currentPhase,
      author,
      authorRole,
      shift,
      reportingOnBehalfOf,
      reportDate,
      projectReference,
      logoStoragePath,
      brandingId,
      brandColor,
    })
  }, [
    loading,
    editingReportId,
    selectedProjectId,
    projectName,
    projectStartDate,
    projectPlannedCompletionDate,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
    author,
    authorRole,
    shift,
    reportingOnBehalfOf,
    reportDate,
    projectReference,
    logoStoragePath,
    brandingId,
    brandColor,
    persistForm,
  ])

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    }
  }, [logoObjectUrl])

  useEffect(() => {
    if (!error) return
    const el = document.getElementById('diary-setup-continue-error')
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  const applyStickyFormState = (merged) => {
    setSelectedProjectId(merged.selectedProjectId)
    setProjectName(merged.projectName || '')
    setProjectStartDate(merged.projectStartDate || '')
    setProjectPlannedCompletionDate(merged.projectPlannedCompletionDate || '')
    setProjectAddress(merged.projectAddress || '')
    setProjectManager(merged.projectManager || '')
    setWorkingDaysPerWeek(merged.workingDaysPerWeek || '')
    setProjectReference(merged.projectReference || '')
  }

  const handleSelectExisting = (projectId, { keepProjectName = null } = {}) => {
    setError('')
    if (!projectId || projectId === NEW_PROJECT_VALUE) {
      const cleared = clearToNewProjectSelection({
        author,
        reportDate,
      })
      applyStickyFormState(cleared)
      setProjectReference('')
      setProjectDatesError('')
      setStickyFieldsError('')
      return
    }

    const project = existingProjects.find((p) => p.id === projectId)
    if (!project) return

    // Project fields only — do not copy diary content from latest report.
    const merged = mergeProjectIntoSetupState({}, project)
    applyStickyFormState(
      keepProjectName == null ? merged : { ...merged, projectName: keepProjectName },
    )
    setProjectDatesError('')
    setStickyFieldsError('')
  }

  const handleProjectNameChange = (e) => {
    const nextName = e.target.value
    setProjectName(nextName)
    setError('')

    const match = findExistingProjectByName(existingProjects, nextName)

    if (match) {
      if (selectedProjectId !== match.id) {
        // Keep the name exactly as typed; project-level fields come from the project row.
        handleSelectExisting(match.id, { keepProjectName: nextName })
      }
      return
    }

    if (selectedProjectId !== NEW_PROJECT_VALUE) {
      const cleared = clearToNewProjectSelection({
        author,
        reportDate,
      })
      applyStickyFormState(cleared)
      setProjectName(nextName)
      setProjectReference('')
      setProjectDatesError('')
      setStickyFieldsError('')
    }
  }

  const handleLogoFiles = (files) => {
    const file = files?.[0]
    if (!file) return
    if (editingReportId) {
      detailsTouchedRef.current = true
      userChangedLogoRef.current = true
    }
    setError('')
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    const url = URL.createObjectURL(file)
    setLogoObjectUrl(url)
    setLogoFile(file)
    setLogoPreview(url)
    setLogoStoragePath(null)
  }

  const removeLogo = () => {
    if (editingReportId) {
      detailsTouchedRef.current = true
      userChangedLogoRef.current = true
    }
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    setLogoObjectUrl(null)
    setLogoFile(null)
    setLogoPreview(null)
    setLogoStoragePath(null)
  }

  const onCoverDrop = (files) => {
    const file = files?.[0]
    if (!file) return
    if (editingReportId) {
      detailsTouchedRef.current = true
      userChangedCoverRef.current = true
    }
    setError('')
    setCoverRemoved(false)
    setCoverPhoto((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return {
        file,
        preview: URL.createObjectURL(file),
        storagePath: null,
      }
    })
  }

  const removeCoverPhoto = () => {
    if (editingReportId) {
      detailsTouchedRef.current = true
      userChangedCoverRef.current = true
    }
    setCoverPhoto((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return null
    })
    setCoverRemoved(true)
  }

  const handleProjectDatesChange = ({ startDate, plannedCompletionDate }) => {
    if (editingReportId) detailsTouchedRef.current = true
    setProjectStartDate(startDate)
    setProjectPlannedCompletionDate(plannedCompletionDate)
    const v = validateProjectDates(startDate, plannedCompletionDate)
    setProjectDatesError(v.ok ? '' : v.message)
  }

  const handleStickyFieldsChange = (next) => {
    if (editingReportId) detailsTouchedRef.current = true
    setProjectAddress(next.projectAddress)
    setProjectManager(next.projectManager)
    setWorkingDaysPerWeek(next.workingDaysPerWeek)
    const v = validateStickyProjectFields(next)
    setStickyFieldsError(v.ok ? '' : v.message)
  }

  const uploadLogoIfNeeded = async (userId) => {
    if (!logoFile) return logoStoragePath
    const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/branding/setup-colour-v2-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('site-photos')
      .upload(path, logoFile, { contentType: logoFile.type || 'image/jpeg', upsert: false })
    if (upErr) throw upErr
    return path
  }

  const handleContinue = async () => {
    if (saving) return

    setError('')
    setProjectDatesError('')
    setStickyFieldsError('')

    // Canonical continue form — same source as rendered inputs (state + live input
    // values when mobile preload/autofill has not yet synced into React state).
    const continueForm = buildDiarySetupContinueForm(
      {
        projectName,
        author,
        reportingOnBehalfOf,
        reportDate,
        startDate: projectStartDate,
        plannedCompletionDate: projectPlannedCompletionDate,
        workingDaysPerWeek,
        authorRole,
        shift,
        currentPhase,
        projectAddress,
        projectManager,
        projectReference,
        brandLogoUrl: logoStoragePath,
        brandingId,
        brandColor,
        reportingCompany,
      },
      {
        existingProjects,
        selectedProjectId,
        dom: {
          projectName: projectNameInputRef.current?.value,
          author: authorInputRef.current?.value,
          reportingOnBehalfOf: reportingOnBehalfOfInputRef.current?.value,
          reportDate: reportDateInputRef.current?.value,
        },
      },
    )

    try {
      // Validate before uploading or persisting company branding. Invalid setup
      // must not mutate the saved profile or create storage objects.
      const formValidation = validateDiarySetupContinue(continueForm)
      if (!formValidation.ok) {
        if (formValidation.field === 'dates') setProjectDatesError(formValidation.message)
        if (formValidation.field === 'workingDays') setStickyFieldsError(formValidation.message)
        setError(formValidation.message || 'Could not continue to Site Diary')
        return
      }

      setSaving(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be signed in')

      let brandLogoUrl = logoStoragePath
      let candidateBrandColor = brandColor
      if (logoFile) {
        ;[brandLogoUrl, candidateBrandColor] = await Promise.all([
          uploadLogoIfNeeded(user.id),
          extractBrandColorFromFile(logoFile, '#4B5563'),
        ])
      }

      // Persist Reporting Company as one identity (name + logo + metadata) before draft write.
      const companySnapshot = await persistReportingCompanyIdentity(supabase, {
        companyName: reportingCompany,
        logoUrl: brandLogoUrl || null,
        brandingId,
        brandColor: candidateBrandColor,
        userId: user.id,
      })
      const nextBrandingId = companySnapshot.brandingId || brandingId
      const nextBrandColor = companySnapshot.brandColor || candidateBrandColor
      const nextLogoUrl = companySnapshot.brandLogoUrl !== undefined
        ? companySnapshot.brandLogoUrl
        : brandLogoUrl || null
      setBrandingId(nextBrandingId)
      setBrandColor(nextBrandColor)
      setLogoStoragePath(nextLogoUrl)

      const result = await runDiarySetupContinue({
        alreadySaving: false,
        form: {
          ...continueForm,
          authorRole: continueForm.authorRole,
          shift: continueForm.shift || shift,
          brandLogoUrl: nextLogoUrl,
          brandingId: nextBrandingId,
          brandColor: nextBrandColor,
          reportingCompany: companySnapshot.companyName || continueForm.reportingCompany || reportingCompany,
        },
        existingProjects,
        selectedProjectId,
        editingReportId,
        editingProjectId,
        getUser: async () => user,
        persistProject: (plan) => persistSetupProject({ supabase, plan }),
        createDraft: (fields) => createDiaryDraftFromSetup(supabase, fields),
        updateDraft: (args) => updateDiarySetupFields(supabase, args),
        writeExtras: writeReportSetupExtras,
        clearFormDraft: clearSetupFormDraft,
        // Navigate after cover is persisted onto the new/updated report id.
        navigate: async () => {},
      })

      if (!result.ok) {
        if (result.field === 'dates') setProjectDatesError(result.message)
        if (result.field === 'workingDays') setStickyFieldsError(result.message)
        setError(result.message || 'Could not continue to Site Diary')
        setSaving(false)
        return
      }

      // Persist cover onto the diary row (same cover_photo_url path as workbench/PDF).
      // F2B: prefer durable IndexedDB handoff → navigate; fall back to blocking upload.
      const coverReportId = result.reportId
      const coverProjectId = result.projectId
      if (coverReportId) {
        if (coverRemoved) {
          await updateDiarySetupFields(supabase, {
            reportId: coverReportId,
            projectId: coverProjectId,
            fields: { coverPhotoUrl: null, coverProcessingVersion: null },
          })
        } else if (coverPhoto?.file) {
          const handoff = await putPendingCover(coverReportId, {
            blob: coverPhoto.file,
            mimeType: coverPhoto.file.type || 'image/jpeg',
            fileName: coverPhoto.file.name || 'cover.jpg',
          })
          if (!handoff?.ok) {
            // Critical fallback: cover exists only in React memory — block until durable.
            // C1: immutable generation-scoped raw path (never shared cover.jpg).
            const generation = newCoverPendingGeneration()
            const { storagePath, error: coverUpErr } = await uploadRawCoverFallbackFile(supabase, {
              userId: user.id,
              reportId: coverReportId,
              generation,
              file: coverPhoto.file,
            })
            if (coverUpErr || !storagePath) {
              throw new Error(
                coverUpErr?.message
                  || 'We couldn\u2019t upload the cover photo. Check your connection and try again.',
              )
            }
            await updateDiarySetupFields(supabase, {
              reportId: coverReportId,
              projectId: coverProjectId,
              fields: { coverPhotoUrl: storagePath, coverProcessingVersion: null },
            })
          }
        }
      }

      // Cover is durable via IndexedDB handoff (preferred) or blocking upload
      // fallback before navigation. Author profile persist is best-effort.
      if (result.navigatedTo) {
        router.push(result.navigatedTo)
      }
      void persistSignedInAuthorProfile(supabase, {
        authorName: continueForm.author,
        authorRole: continueForm.authorRole || authorRole,
      }).catch(() => {
        // Best-effort only; diary continue and navigation already succeeded.
      })
      // Keep saving=true until route change unmounts this screen.
    } catch (err) {
      setError(err?.message || 'Could not continue to Site Diary')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PremiumShell title={setupTitle} backHref={setupBackHref} accent={DIARY_ACCENT} maxWidth={520}>
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title={setupTitle}
      backHref={setupBackHref}
      accent={DIARY_ACCENT}
      maxWidth={520}
    >
      <p
        style={{
          ...typeTokens.body,
          margin: '0 0 22px',
          fontSize: 16,
          lineHeight: 1.5,
          color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))',
        }}
      >
        {editingReportId
          ? 'Review the saved project and report details. Change only what’s different, then continue.'
          : 'Confirm the details for today’s Site Diary, then continue.'}
      </p>

      {error && (
        <div
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '14px 16px',
            fontSize: 15,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      <div
        onChange={() => {
          if (editingReportId) detailsTouchedRef.current = true
        }}
      >
      <GlassSection accent={DIARY_ACCENT}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(7.5rem, 0.4fr) minmax(0, 0.6fr)',
            gap: 12,
            alignItems: 'center',
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          <h2
            className="premium-section-title"
            style={{ ...sectionTitleStyle, margin: 0, marginBottom: 0 }}
          >
            Reporting Company
          </h2>
          <input
            value={reportingCompany}
            onChange={(e) => setReportingCompany(e.target.value)}
            placeholder="Your company name"
            autoComplete="organization"
            style={{ ...setupInputStyle, marginBottom: 0 }}
            aria-label="Reporting Company Name"
          />
        </div>

        <label style={{ ...setupLabelStyle, marginBottom: 6 }}>LOGO</label>
        <p
          style={{
            ...typeTokens.helper,
            margin: '0 0 8px',
            maxWidth: '36em',
          }}
        >
          Your logo helps Zlog create your report’s corporate branding, including colours and report styling.
        </p>
        {logoPreview ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 0.85fr)',
              gap: 10,
              alignItems: 'stretch',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 92,
                padding: 8,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--plate) 70%, var(--ink))',
                border: '1px solid var(--edge)',
              }}
            >
              <img
                src={logoPreview}
                alt="Reporting company logo preview"
                style={{
                  display: 'block',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateRows: '1fr 1fr',
                gap: 8,
                height: 92,
                minHeight: 92,
              }}
            >
              <div style={{ position: 'relative', minHeight: 0 }}>
                <SecondaryButton type="button" style={logoControlButtonStyle}>
                  Replace
                </SecondaryButton>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Replace reporting company logo"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleLogoFiles([file])
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                />
              </div>
              <SecondaryButton type="button" onClick={removeLogo} style={logoControlButtonStyle}>
                Remove
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 0 }}>
            <ImageSourceButtons
              onFiles={handleLogoFiles}
              cameraLabel="Take Photo"
              galleryLabel="Upload Photo"
              stacked
            />
          </div>
        )}
      </GlassSection>

      <GlassSection title="Reporting On Behalf Of" accent={DIARY_ACCENT}>
        <input
          ref={reportingOnBehalfOfInputRef}
          value={reportingOnBehalfOf}
          onChange={(e) => setReportingOnBehalfOf(e.target.value)}
          placeholder="Client, main contractor, or organisation"
          autoComplete="organization"
          style={{ ...setupInputStyle, marginBottom: 0 }}
          aria-label="Reporting On Behalf Of"
          required
        />
      </GlassSection>

      <GlassSection title="Author" accent={DIARY_ACCENT}>
        <label style={setupLabelStyle}>Author Name *</label>
        <input
          ref={authorInputRef}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          style={setupInputStyle}
          required
        />

        <label style={setupLabelStyle}>Author Role</label>
        <input
          type="text"
          value={authorRole}
          onChange={(e) => setAuthorRole(e.target.value)}
          placeholder="e.g. Site Manager"
          autoComplete="organization-title"
          style={{ ...setupInputStyle, marginBottom: 0 }}
        />
      </GlassSection>

      <GlassSection title="Cover photo" accent={DIARY_ACCENT}>
        {coverPhoto?.preview ? (
          <div style={{ marginBottom: 0 }}>
            <img
              src={coverPhoto.preview}
              alt="Cover"
              style={{
                width: '100%',
                maxHeight: 200,
                objectFit: 'cover',
                borderRadius: 10,
                display: 'block',
                marginBottom: 10,
              }}
            />
            <button
              type="button"
              onClick={removeCoverPhoto}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
                fontSize: 14,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Remove cover photo
            </button>
          </div>
        ) : coverPhoto?.storagePath ? (
          <div style={{ marginBottom: 0 }}>
            <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Cover photo is attached to this diary.
            </p>
            <button
              type="button"
              onClick={removeCoverPhoto}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
                fontSize: 14,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Remove cover photo
            </button>
            <div style={{ marginTop: 10 }}>
              <ImageSourceButtons onFiles={onCoverDrop} hint="Replace cover image" />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 0 }}>
            <ImageSourceButtons onFiles={onCoverDrop} hint="One cover image for this report" />
          </div>
        )}
      </GlassSection>

      <GlassSection title="Project Details" accent={DIARY_ACCENT}>
        <label style={setupLabelStyle}>Project Name *</label>
        <input
          ref={projectNameInputRef}
          value={projectName}
          onChange={handleProjectNameChange}
          list={existingProjects.length > 0 ? 'diary-setup-project-names' : undefined}
          placeholder="Select an existing project or type a new name"
          autoComplete="organization"
          style={setupInputStyle}
          required
          aria-label="Project Name"
        />
        {existingProjects.length > 0 ? (
          <datalist id="diary-setup-project-names">
            {existingProjects.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        ) : null}

        <ProjectStickyFields
          projectAddress={projectAddress}
          projectManager={projectManager}
          workingDaysPerWeek={workingDaysPerWeek}
          onChange={handleStickyFieldsChange}
          error={stickyFieldsError}
        />

        <label style={setupLabelStyle}>Current Phase</label>
        <input
          type="text"
          value={currentPhase}
          onChange={(e) => setCurrentPhase(e.target.value)}
          placeholder="e.g. Groundworks"
          style={setupInputStyle}
        />

        {showProjectDatesOnSetup() ? (
          <div style={{ marginBottom: 4 }}>
            <ProjectDatesFields
              startDate={projectStartDate}
              plannedCompletionDate={projectPlannedCompletionDate}
              onChange={handleProjectDatesChange}
              error={projectDatesError}
            />
          </div>
        ) : null}

        <label style={setupLabelStyle}>Shift *</label>
        <select
          value={shift}
          onChange={(e) => setShift(hydrateShift(e.target.value))}
          style={{ ...setupInputStyle, cursor: 'pointer' }}
          aria-label="Shift"
          required
        >
          <option value="Day">Day</option>
          <option value="Back">Back</option>
          <option value="Night">Night</option>
          {!SITE_DIARY_SHIFT_OPTIONS.includes(shift) && shift ? (
            <option value={shift}>{shift}</option>
          ) : null}
        </select>

        <label style={setupLabelStyle}>Project Reference</label>
        <input
          value={projectReference}
          onChange={(e) => setProjectReference(e.target.value)}
          placeholder="Optional job or reference number"
          style={setupInputStyle}
        />

        <label style={setupLabelStyle}>Report Date *</label>
        <input
          ref={reportDateInputRef}
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={{ ...setupInputStyle, marginBottom: 0 }}
          required
        />
      </GlassSection>
      </div>

      <PrimaryCTA
        type="button"
        onClick={handleContinue}
        disabled={saving}
        style={{ minHeight: 52, fontSize: 16, marginBottom: 12 }}
      >
        {saving
          ? 'Continuing…'
          : editingReportId
            ? "Continue to Today's Diary"
            : 'Continue to Site Diary'}
      </PrimaryCTA>

      {error ? (
        <div
          id="diary-setup-continue-error"
          role="alert"
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.35)',
            color: '#ff6b6b',
            padding: '14px 16px',
            fontSize: 15,
            marginBottom: 12,
            borderRadius: 10,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      ) : null}

      <ZlogBackControl
        href={setupBackHref}
        disabled={saving}
        style={{ marginBottom: 32 }}
      />
    </PremiumShell>
  )
}

export default function SiteDiarySetupRoute() {
  return (
    <Suspense
      fallback={
        <PremiumShell title="Site Diary" backHref="/dashboard/diary" accent={DIARY_ACCENT}>
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiarySetupPage />
    </Suspense>
  )
}
