'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { extractBrandColorFromFile } from '@/lib/extract-brand-color'
import {
  prepareBrandLogoFile,
  fetchBrandCompanyNameAnalysis,
  classifyLogoPresentationFromImageUrl,
} from '@/lib/prepare-brand-logo-image'
import { validateProjectDates } from '@/lib/project-day'
import {
  NEW_PROJECT_SENTINEL,
  fetchProjectsForSetup,
  findExistingProjectByName,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
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
  persistCanonicalCoverUpload,
} from '@/lib/diary-cover-photo'
import { putPendingCover, newCoverPendingGeneration } from '@/lib/diary-cover-pending'
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
  mergeSiteDiarySessionSnapshot,
  runSiteDiaryShadowSetupProof,
  SITE_DIARY_SHADOW_FIELD_KEYS,
} from '@/lib/site-diary-session-context'

const SETUP_BRAND_COLOR_FALLBACK = '#4B5563'

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

export function isSetupCommitReadyForLifecycle(
  reconciledLifecycleKey,
  currentLifecycleKey,
) {
  return Boolean(currentLifecycleKey) && reconciledLifecycleKey === currentLifecycleKey
}

/**
 * Seed inline Project Details from workbench-hydrated state (no second full setup hydrate).
 *
 * @param {object} opts
 * @returns {object | null}
 */
export function buildWorkbenchProjectDetailsSeed({
  projectRow,
  reportRow,
  projectReference = '',
  creatorName = '',
  creatorRole = '',
  companyReportingFor = '',
  shiftType = '',
  reportDate = '',
  coverPhoto = null,
  logoPreview = null,
  brandingSelection = null,
  reportingCompany = '',
  projectId = '',
  reportId = '',
} = {}) {
  if (!projectRow || !reportRow || !projectId || !reportId) return null
  const dates = hydrateProjectDatesFromRow(projectRow)
  const sticky = hydrateStickyFromRow(projectRow)
  const branding = brandingSelection || {}
  return {
    projectId,
    reportId,
    reportRow,
    projectRow,
    selectedProjectId: projectId,
    projectName: String(projectRow?.name || '').trim(),
    projectStartDate: dates.projectStartDate,
    projectPlannedCompletionDate: dates.projectPlannedCompletionDate,
    projectAddress: sticky.projectAddress,
    projectManager: sticky.projectManager,
    workingDaysPerWeek: sticky.workingDaysPerWeek,
    currentPhase: String(reportRow?.current_phase || '').trim(),
    projectReference: String(projectReference || '').trim(),
    reportDate: reportDateInputValue(reportRow?.report_date) || reportDate || todayIsoDate(),
    shift: hydrateShift(reportRow?.shift || shiftType),
    author: String(creatorName || '').trim(),
    authorRole: String(creatorRole || '').trim(),
    reportingOnBehalfOf: String(companyReportingFor || reportRow?.company_reporting_for || '').trim(),
    reportingCompany: String(reportingCompany || '').trim(),
    brandingId: branding.brandingId ?? reportRow?.branding_id ?? null,
    brandColor: branding.brandColor ?? reportRow?.brand_color ?? null,
    logoStoragePath: branding.brandLogoUrl ?? reportRow?.brand_logo_url ?? null,
    logoPreview: logoPreview || null,
    coverPhoto: coverPhoto || null,
    coverStoragePath: coverPhoto?.storagePath || reportRow?.cover_photo_url || null,
  }
}

/**
 * Map a successful inline Project Details persist into workbench React state updates.
 *
 * @param {object} payload
 * @returns {object}
 */
export function applyProjectDetailsPersistToWorkbench(payload = {}) {
  const form = payload.continueForm || {}
  const company = payload.companySnapshot || {}
  const result = payload.persistResult || {}
  const brandingId = company.brandingId ?? form.brandingId ?? null
  const brandColor = company.brandColor ?? form.brandColor ?? null
  const brandLogoUrl = company.brandLogoUrl !== undefined
    ? company.brandLogoUrl
    : (form.brandLogoUrl ?? null)
  const companyName = company.companyName || form.reportingCompany || ''
  return {
    creatorName: String(form.author || '').trim(),
    creatorRole: String(form.authorRole || '').trim(),
    companyReportingFor: String(form.reportingOnBehalfOf || '').trim(),
    shiftType: form.shift || 'Day',
    reportDate: form.reportDate || todayIsoDate(),
    projectReference: String(form.projectReference || '').trim(),
    currentPhase: String(form.currentPhase || '').trim(),
    reportingCompany: companyName,
    brandingSelection: (brandingId || brandColor || brandLogoUrl)
      ? {
        brandingId,
        brandColor: brandColor || '#FF5000',
        brandLogoUrl,
        companyName,
      }
      : null,
    logoPreviewUrl: payload.logoPreviewUrl ?? null,
    coverPhoto: payload.coverPhotoState ?? null,
    projectRowPatch: {
      start_date: result.start_date,
      planned_completion_date: result.planned_completion_date,
      site_address: result.site_address,
      client_pm: result.client_pm,
      working_days_per_week: result.working_days_per_week,
      project_reference: result.project_reference,
      name: form.projectName,
    },
  }
}

/** Complete in-memory snapshot for existing-diary Continue — before router.push. */
function buildExistingDiaryContinueSdscSnapshot({
  userId,
  projectId,
  reportId,
  form,
  reportingCompany,
  brandingId,
  brandColor,
  logoStoragePath,
  coverStoragePath,
}) {
  return {
    userId: userId || '',
    projectId: projectId || '',
    reportId: reportId || '',
    projectName: String(form?.projectName || ''),
    projectStartDate: String(form?.startDate || ''),
    projectPlannedCompletionDate: String(form?.plannedCompletionDate || ''),
    projectAddress: String(form?.projectAddress || ''),
    projectManager: String(form?.projectManager || ''),
    workingDaysPerWeek: String(form?.workingDaysPerWeek || ''),
    projectReference: String(form?.projectReference || ''),
    reportDate: String(form?.reportDate || ''),
    shift: form?.shift || '',
    currentPhase: String(form?.currentPhase || ''),
    author: String(form?.author || ''),
    authorRole: String(form?.authorRole || ''),
    reportingOnBehalfOf: String(form?.reportingOnBehalfOf || ''),
    reportingCompany: String(reportingCompany || ''),
    brandingId: brandingId ?? null,
    brandColor: brandColor ?? null,
    logoStoragePath: logoStoragePath ?? null,
    coverStoragePath: coverStoragePath ?? null,
  }
}



/**
 * Site Diary Project Details — setup controller (shared with setup route; Unit 2 workbench).
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   router: import('next/navigation').AppRouterInstance,
 *   editingReportId: string|null,
 *   editingProjectId: string|null,
 *   hostMode?: 'setup' | 'workbench',
 *   hydrateEnabled?: boolean,
 *   workbenchSeed?: object | null,
 *   onPersistSuccess?: ((payload: object) => void) | null,
 * }} opts
 */
export function useSiteDiaryProjectDetailsController({
  supabase,
  router,
  editingReportId,
  editingProjectId,
  hostMode = 'setup',
  hydrateEnabled = true,
  workbenchSeed = null,
  onPersistSuccess = null,
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState([])
  const setupLifecycleKey = [
    hostMode,
    editingProjectId || '',
    editingReportId || '',
    hydrateEnabled ? 'hydrate' : 'paused',
  ].join('|')
  const [reconciledLifecycleKey, setReconciledLifecycleKey] = useState(null)
  const commitReady = isSetupCommitReadyForLifecycle(
    reconciledLifecycleKey,
    setupLifecycleKey,
  )

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
  const [logoPreviewBackdrop, setLogoPreviewBackdrop] = useState(null)
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
  const ordinaryFieldOwnershipRef = useRef({
    lifecycleKey: setupLifecycleKey,
    touched: new Set(),
  })
  useLayoutEffect(() => {
    ordinaryFieldOwnershipRef.current = {
      lifecycleKey: setupLifecycleKey,
      touched: new Set(),
    }
  }, [setupLifecycleKey])
  const userChangedLogoRef = useRef(false)
  const userChangedCoverRef = useRef(false)
  const [reportingCompanyManuallyEdited, setReportingCompanyManuallyEdited] = useState(false)
  const reportingCompanyManuallyEditedRef = useRef(false)
  const reportingCompanyUserInteractedRef = useRef(false)
  const workbenchSeedRef = useRef(workbenchSeed)
  useEffect(() => {
    workbenchSeedRef.current = workbenchSeed
  }, [workbenchSeed])
  const [namePrefilledFromLogo, setNamePrefilledFromLogo] = useState(false)
  const [logoSuggestedCompanyName, setLogoSuggestedCompanyName] = useState(null)
  const [showLogoCompanyManualHint, setShowLogoCompanyManualHint] = useState(false)

  const existingProjects = useMemo(
    () => (projects || []).filter((p) => p?.id && p?.name),
    [projects],
  )

  useEffect(() => {
    reportingCompanyManuallyEditedRef.current = reportingCompanyManuallyEdited
  }, [reportingCompanyManuallyEdited])

  const persistForm = useCallback((next) => {
    writeSetupFormDraft(next)
  }, [])

  const markOrdinaryFieldTouched = (fieldKey) => {
    if (!editingReportId) return
    if (ordinaryFieldOwnershipRef.current.lifecycleKey !== setupLifecycleKey) {
      ordinaryFieldOwnershipRef.current = {
        lifecycleKey: setupLifecycleKey,
        touched: new Set(),
      }
    }
    ordinaryFieldOwnershipRef.current.touched.add(fieldKey)
  }

  const updateOrdinaryFieldFromUser = (fieldKey, setter, value) => {
    markOrdinaryFieldTouched(fieldKey)
    setter(value)
  }

  const applyDetectedReportingCompanyName = (detectedName) => {
    const trimmed = String(detectedName || '').trim()
    if (!trimmed) return
    const oldReportingCompany = String(reportingCompany || '').trim()
    const reportingOnBehalf = String(reportingOnBehalfOf || '').trim()
    setReportingCompany(trimmed)
    if (
      oldReportingCompany
      && reportingOnBehalf.toLowerCase() === oldReportingCompany.toLowerCase()
    ) {
      setReportingOnBehalfOf(trimmed)
    }
    setNamePrefilledFromLogo(true)
    setLogoSuggestedCompanyName(null)
    setShowLogoCompanyManualHint(false)
  }

  const applyLogoSuggestedCompanyName = () => {
    const suggested = String(logoSuggestedCompanyName || '').trim()
    if (!suggested) return
    markOrdinaryFieldTouched('reportingCompany')
    applyDetectedReportingCompanyName(suggested)
  }

  useEffect(() => {
    if (!logoPreview) return undefined

    let cancelled = false
    classifyLogoPresentationFromImageUrl(logoPreview).then((presentation) => {
      if (cancelled) return
      setLogoPreviewBackdrop(presentation?.backdropColor || null)
    })

    return () => {
      cancelled = true
    }
  }, [logoPreview])

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

    const applyWorkbenchSeed = async (seed) => {
      if (!seed) return false
      setSelectedProjectId(seed.selectedProjectId || seed.projectId || editingProjectId || NEW_PROJECT_VALUE)
      setProjectName(seed.projectName || '')
      setProjectStartDate(seed.projectStartDate || '')
      setProjectPlannedCompletionDate(seed.projectPlannedCompletionDate || '')
      setProjectAddress(seed.projectAddress || '')
      setProjectManager(seed.projectManager || '')
      setWorkingDaysPerWeek(seed.workingDaysPerWeek || '')
      setCurrentPhase(seed.currentPhase || '')
      setProjectReference(seed.projectReference || '')
      setReportDate(seed.reportDate || todayIsoDate())
      setShift(hydrateShift(seed.shift))
      setAuthor(seed.author || '')
      setAuthorRole(seed.authorRole || '')
      setReportingOnBehalfOf(seed.reportingOnBehalfOf || '')
      setBrandingId(seed.brandingId || null)
      setBrandColor(seed.brandColor || null)
      setLogoStoragePath(seed.logoStoragePath || null)
      setLogoFile(null)
      setCoverRemoved(false)

      let reportingCompanyName = seed.reportingCompany || ''
      let logoPath = seed.logoStoragePath || null
      let brandingIdLocal = seed.brandingId || null
      let brandColorLocal = seed.brandColor || null

      if (seed.reportRow && !reportingCompanyName) {
        const companyIdentity = await fetchReportingCompanyForReport(supabase, seed.reportRow)
        if (cancelled) return false
        reportingCompanyName = companyIdentity.companyName || ''
        logoPath = companyIdentity.logoStoragePath || logoPath
        brandingIdLocal = companyIdentity.brandingId || brandingIdLocal
        brandColorLocal = companyIdentity.brandColor || brandColorLocal
      }

      setReportingCompany(reportingCompanyName)
      setBrandingId(brandingIdLocal)
      setBrandColor(brandColorLocal)
      setLogoStoragePath(logoPath)

      if (seed.logoPreview) {
        setLogoPreview(seed.logoPreview)
      } else if (logoPath) {
        const preview = await signedLogoUrl(supabase, logoPath)
        if (!cancelled) setLogoPreview(preview)
      } else {
        setLogoPreview(null)
      }

      const coverPath = seed.coverStoragePath || seed.coverPhoto?.storagePath || null
      if (seed.coverPhoto) {
        setCoverPhoto(seed.coverPhoto)
      } else if (coverPath) {
        const coverPreview = await resolveCoverPhotoPreviewUrl(supabase, coverPath)
        if (!cancelled) {
          setCoverPhoto(coverPhotoStateFromSaved(coverPath, coverPreview))
        }
      } else {
        setCoverPhoto(null)
      }

      if (cancelled) return false
      setLoading(false)
      return true
    }

    const load = async () => {
      setReconciledLifecycleKey(null)
      if (hostMode === 'workbench' && !hydrateEnabled) {
        setLoading(false)
        return
      }

      detailsTouchedRef.current = false
      ordinaryFieldOwnershipRef.current = {
        lifecycleKey: setupLifecycleKey,
        touched: new Set(),
      }
      userChangedLogoRef.current = false
      userChangedCoverRef.current = false
      setLoading(true)
      setError('')
      try {
        if (hostMode === 'workbench' && editingReportId && workbenchSeedRef.current) {
          const seeded = await applyWorkbenchSeed(workbenchSeedRef.current)
          if (cancelled) return
          if (seeded) {
            setReconciledLifecycleKey(setupLifecycleKey)
            return
          }
        }

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
          const shouldApplyCanonicalField = (fieldKey) => (
            !usedFastPath
            || ordinaryFieldOwnershipRef.current.lifecycleKey !== setupLifecycleKey
            || !ordinaryFieldOwnershipRef.current.touched.has(fieldKey)
          )
          const skipLogoReconcile = usedFastPath && userChangedLogoRef.current
          const skipCoverReconcile = usedFastPath && userChangedCoverRef.current

          setSelectedProjectId(loaded.projectId || editingProjectId || NEW_PROJECT_VALUE)
          if (shouldApplyCanonicalField('projectName')) setProjectName(project?.name || '')
          if (shouldApplyCanonicalField('projectStartDate')) {
            setProjectStartDate(dates.projectStartDate)
          }
          if (shouldApplyCanonicalField('projectPlannedCompletionDate')) {
            setProjectPlannedCompletionDate(dates.projectPlannedCompletionDate)
          }
          if (shouldApplyCanonicalField('projectAddress')) setProjectAddress(sticky.projectAddress)
          if (shouldApplyCanonicalField('projectManager')) setProjectManager(sticky.projectManager)
          if (shouldApplyCanonicalField('workingDaysPerWeek')) {
            setWorkingDaysPerWeek(sticky.workingDaysPerWeek)
          }
          if (shouldApplyCanonicalField('currentPhase')) {
            setCurrentPhase(String(report?.current_phase || '').trim())
          }

          // Project Reference — project column first (extras only as legacy fallback).
          if (shouldApplyCanonicalField('projectReference')) {
            setProjectReference(loaded.hydration.projectReference)
          }

          // Edit/View setup: saved diary values win; never keep account-derived aliases.
          const savedAuthor = String(report?.creator_name || '').trim()
          const safeSavedAuthor =
            savedAuthor && !isAccountDerivedAuthorName(savedAuthor, signedInUser)
              ? savedAuthor
              : ''
          if (shouldApplyCanonicalField('author')) setAuthor(safeSavedAuthor || profileName || '')
          if (shouldApplyCanonicalField('authorRole')) {
            setAuthorRole(hydrateAuthorRole(report) || profileRole || '')
          }
          if (shouldApplyCanonicalField('shift')) setShift(hydrateShift(report?.shift))
          if (shouldApplyCanonicalField('reportingOnBehalfOf')) {
            setReportingOnBehalfOf(report?.company_reporting_for || '')
          }
          if (shouldApplyCanonicalField('reportDate')) {
            setReportDate(reportDateInputValue(report?.report_date) || todayIsoDate())
          }

          // Coherent Reporting Company — name + logo from the same identity (never mix).
          const companyIdentity = await fetchReportingCompanyForReport(supabase, report)
          if (cancelled) return
          const logoPath = companyIdentity.logoStoragePath || null
          if (shouldApplyCanonicalField('reportingCompany')) {
            setReportingCompany(companyIdentity.companyName || '')
          }
          setBrandingId(companyIdentity.brandingId || null)
          if (!skipLogoReconcile) {
            setBrandColor(companyIdentity.brandColor || null)
            setLogoStoragePath(logoPath)
            if (logoPath) {
              const preview = await signedLogoUrl(supabase, logoPath)
              if (!cancelled && !userChangedLogoRef.current) setLogoPreview(preview)
            } else if (!cancelled && !userChangedLogoRef.current) {
              setLogoPreview(null)
            }
          }

          // Cover photo — same daily_reports.cover_photo_url as workbench/PDF/review.
          const coverPath = loaded.hydration?.coverStoragePath || null
          if (!skipCoverReconcile) {
            setCoverRemoved(false)
            if (coverPath) {
              setCoverPhoto(coverPhotoStateFromSaved(coverPath, null))
              const coverPreview = await resolveCoverPhotoPreviewUrl(supabase, coverPath)
              if (!cancelled && !userChangedCoverRef.current) {
                setCoverPhoto(coverPhotoStateFromSaved(coverPath, coverPreview))
              }
            } else {
              setCoverPhoto(null)
            }
          }

          // SDSC Phase 1 shadow proof only — never drives UI / loading / navigation.
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

          setReconciledLifecycleKey(setupLifecycleKey)
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
        if (!cancelled) setReconciledLifecycleKey(setupLifecycleKey)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ESLINT-SETUP-HYDRATE-DEPS
  }, [editingReportId, editingProjectId, hostMode, hydrateEnabled, setupLifecycleKey])

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
    if (editingReportId) return
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
    if (editingReportId) return
    const nextName = e.target.value
    markOrdinaryFieldTouched('projectName')
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

  const handleLogoFiles = async (files) => {
    const file = files?.[0]
    if (!file) return
    if (editingReportId) {
      detailsTouchedRef.current = true
      userChangedLogoRef.current = true
    }
    setError('')

    const isPdf =
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name || '')
    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(file.name || '')

    if (isPdf || !isImage) {
      setError('Use a photo or screenshot of the logo/letterhead so we can extract the brand colour.')
      return
    }

    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)

    const hex = await extractBrandColorFromFile(file, SETUP_BRAND_COLOR_FALLBACK)
    setBrandColor(hex)

    const prepared = await prepareBrandLogoFile(file)
    const nextLogoFile = prepared.file || file
    const previewUrl = prepared.previewUrl || URL.createObjectURL(nextLogoFile)

    setLogoPreviewBackdrop(prepared.presentation?.backdropColor || null)
    setLogoObjectUrl(previewUrl)
    setLogoFile(nextLogoFile)
    setLogoPreview(previewUrl)
    setLogoStoragePath(null)

    setLogoSuggestedCompanyName(null)
    setShowLogoCompanyManualHint(false)

    if (!reportingCompanyManuallyEditedRef.current) {
      try {
        const analyzed = await fetchBrandCompanyNameAnalysis(nextLogoFile)
        if (reportingCompanyManuallyEditedRef.current) return

        const detectedName = analyzed.company_name != null
          ? String(analyzed.company_name).trim()
          : ''

        if (analyzed.confidence === 'high' && detectedName) {
          applyDetectedReportingCompanyName(detectedName)
        } else if (analyzed.confidence === 'medium' && detectedName) {
          setNamePrefilledFromLogo(false)
          setLogoSuggestedCompanyName(detectedName)
          setShowLogoCompanyManualHint(false)
        } else {
          setNamePrefilledFromLogo(false)
          setLogoSuggestedCompanyName(null)
          setShowLogoCompanyManualHint(true)
        }
      } catch {
        if (reportingCompanyManuallyEditedRef.current) return
        setNamePrefilledFromLogo(false)
        setLogoSuggestedCompanyName(null)
        setShowLogoCompanyManualHint(true)
      }
    }
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
    setLogoPreviewBackdrop(null)
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
    if (startDate !== projectStartDate) markOrdinaryFieldTouched('projectStartDate')
    if (plannedCompletionDate !== projectPlannedCompletionDate) {
      markOrdinaryFieldTouched('projectPlannedCompletionDate')
    }
    setProjectStartDate(startDate)
    setProjectPlannedCompletionDate(plannedCompletionDate)
    const v = validateProjectDates(startDate, plannedCompletionDate)
    setProjectDatesError(v.ok ? '' : v.message)
  }

  const handleStickyFieldsChange = (next) => {
    if (next.projectAddress !== projectAddress) markOrdinaryFieldTouched('projectAddress')
    if (next.projectManager !== projectManager) markOrdinaryFieldTouched('projectManager')
    if (next.workingDaysPerWeek !== workingDaysPerWeek) {
      markOrdinaryFieldTouched('workingDaysPerWeek')
    }
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

  const runContinuePersistence = async ({ navigateAfterSuccess = true } = {}) => {
    if (saving || !commitReady) return

    setError('')
    setProjectDatesError('')
    setStickyFieldsError('')

    // Canonical continue form — same source as rendered inputs (state + live input
    // values when mobile preload/autofill has not yet synced into React state).
    // Existing saved diary: project identity is fixed to the current diary project.
    const continueSelectedProjectId = (editingReportId && editingProjectId
      && editingProjectId !== NEW_PROJECT_VALUE)
      ? editingProjectId
      : selectedProjectId
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
        selectedProjectId: continueSelectedProjectId,
        dom: {
          projectName: editingReportId ? undefined : projectNameInputRef.current?.value,
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
        brandLogoUrl = await uploadLogoIfNeeded(user.id)
        candidateBrandColor = brandColor || await extractBrandColorFromFile(
          logoFile,
          SETUP_BRAND_COLOR_FALLBACK,
        )
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
        selectedProjectId: continueSelectedProjectId,
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
      let continueCoverPath = coverRemoved ? null : (coverPhoto?.storagePath || null)
      if (coverReportId) {
        if (coverRemoved) {
          await updateDiarySetupFields(supabase, {
            reportId: coverReportId,
            projectId: coverProjectId,
            fields: { coverPhotoUrl: null, coverProcessingVersion: null },
          })
          continueCoverPath = null
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
            const {
              storagePath,
              error: coverUpErr,
              coverProcessingVersion,
            } = await persistCanonicalCoverUpload(supabase, {
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
              fields: { coverPhotoUrl: storagePath, coverProcessingVersion },
            })
            continueCoverPath = storagePath
          }
        }
      }

      // Existing-diary Continue: complete SDSC snapshot before navigation so
      // Workbench → Back keeps the proven fast-Back path.
      if (editingReportId) {
        try {
          mergeSiteDiarySessionSnapshot(buildExistingDiaryContinueSdscSnapshot({
            userId: user.id,
            projectId: result.projectId,
            reportId: result.reportId,
            form: {
              ...continueForm,
              shift: continueForm.shift || shift,
            },
            reportingCompany: companySnapshot.companyName
              || continueForm.reportingCompany
              || reportingCompany,
            brandingId: nextBrandingId,
            brandColor: nextBrandColor,
            logoStoragePath: nextLogoUrl,
            coverStoragePath: continueCoverPath,
          }))
        } catch {
          /* shadow isolation — continue navigation */
        }
      }

      const coverPhotoState = coverRemoved
        ? null
        : (coverPhoto?.file || coverPhoto?.storagePath
          ? {
            ...coverPhoto,
            storagePath: continueCoverPath || coverPhoto?.storagePath || null,
          }
          : null)

      if (navigateAfterSuccess && result.navigatedTo) {
        router.push(result.navigatedTo)
      } else if (!navigateAfterSuccess && result.ok && typeof onPersistSuccess === 'function') {
        onPersistSuccess({
          continueForm: {
            ...continueForm,
            shift: continueForm.shift || shift,
            brandLogoUrl: nextLogoUrl,
            brandingId: nextBrandingId,
            brandColor: nextBrandColor,
            reportingCompany: companySnapshot.companyName
              || continueForm.reportingCompany
              || reportingCompany,
          },
          companySnapshot,
          persistResult: result,
          logoPreviewUrl: logoPreview,
          coverPhotoState,
        })
        setSaving(false)
      }

      void persistSignedInAuthorProfile(supabase, {
        authorName: continueForm.author,
        authorRole: continueForm.authorRole || authorRole,
      }).catch(() => {
        // Best-effort only; diary continue and navigation already succeeded.
      })
      if (navigateAfterSuccess) {
        // Keep saving=true until route change unmounts this screen.
      }
    } catch (err) {
      setError(err?.message || (navigateAfterSuccess
        ? 'Could not continue to Site Diary'
        : 'Could not save project and report details'))
      setSaving(false)
    }
  }

  const handleContinue = () => runContinuePersistence({ navigateAfterSuccess: true })

  const persistProjectDetails = () => runContinuePersistence({ navigateAfterSuccess: false })



  const sectionProps = {
    editingReportId,
    existingProjects,
    projectName,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
    projectStartDate,
    projectPlannedCompletionDate,
    projectDatesError,
    shift,
    projectReference,
    reportDate,
    reportingCompany,
    reportingCompanyManuallyEdited,
    namePrefilledFromLogo,
    logoSuggestedCompanyName,
    showLogoCompanyManualHint,
    logoPreview,
    logoPreviewBackdrop,
    reportingOnBehalfOf,
    author,
    authorRole,
    coverPhoto,
    stickyFieldsError,
    projectNameInputRef,
    authorInputRef,
    reportingOnBehalfOfInputRef,
    reportDateInputRef,
    reportingCompanyUserInteractedRef,
    reportingCompanyManuallyEditedRef,
    handleProjectNameChange,
    handleStickyFieldsChange,
    setCurrentPhase: (value) => updateOrdinaryFieldFromUser('currentPhase', setCurrentPhase, value),
    handleProjectDatesChange,
    setShift: (value) => updateOrdinaryFieldFromUser('shift', setShift, value),
    setProjectReference: (value) => updateOrdinaryFieldFromUser(
      'projectReference',
      setProjectReference,
      value,
    ),
    setReportDate: (value) => updateOrdinaryFieldFromUser('reportDate', setReportDate, value),
    setReportingCompany: (value) => updateOrdinaryFieldFromUser(
      'reportingCompany',
      setReportingCompany,
      value,
    ),
    setReportingCompanyManuallyEdited,
    setNamePrefilledFromLogo,
    setLogoSuggestedCompanyName,
    setShowLogoCompanyManualHint,
    applyLogoSuggestedCompanyName,
    handleLogoFiles,
    removeLogo,
    setReportingOnBehalfOf: (value) => updateOrdinaryFieldFromUser(
      'reportingOnBehalfOf',
      setReportingOnBehalfOf,
      value,
    ),
    setAuthor: (value) => updateOrdinaryFieldFromUser('author', setAuthor, value),
    setAuthorRole: (value) => updateOrdinaryFieldFromUser('authorRole', setAuthorRole, value),
    onCoverDrop,
    removeCoverPhoto,
  }

  return {
    loading,
    commitReady,
    saving,
    error,
    handleContinue,
    persistProjectDetails,
    detailsTouchedRef,
    sectionProps,
  }
}
