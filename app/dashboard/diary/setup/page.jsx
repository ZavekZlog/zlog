'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  labelStyle,
  inputStyle,
  BRAND_ACCENT,
  typeTokens,
} from '@/lib/premium-ui'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { ProjectDatesFields } from '@/components/project/ProjectDatesFields'
import { ProjectStickyFields } from '@/components/project/ProjectStickyFields'
import { validateProjectDates } from '@/lib/project-day'
import {
  NEW_PROJECT_SENTINEL,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
  projectsSetupSelectColumns,
  showProjectDatesOnSetup,
} from '@/lib/diary-setup-project-dates'
import {
  brandingDefaultsFromCompanyProfile,
  clearToNewProjectSelection,
  initialiseNewDiarySetupState,
  shouldRestoreSetupFormDraft,
} from '@/lib/diary-setup-blank'
import {
  DEFAULT_SITE_DIARY_SHIFT,
  SITE_DIARY_SHIFT_OPTIONS,
  hydrateShift,
} from '@/lib/diary-setup-shift'
import {
  persistSetupProject,
  runDiarySetupContinue,
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
import {
  resolveSignedInAuthorProfile,
  persistSignedInAuthorProfile,
  isAccountDerivedAuthorName,
  clearSetupFormDraft,
  readReportSetupExtras,
  todayIsoDate,
  writeReportSetupExtras,
  writeSetupFormDraft,
} from '@/lib/report-setup'

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

const NEW_PROJECT_VALUE = NEW_PROJECT_SENTINEL

async function signedLogoUrl(supabase, path) {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('blob:')) return path
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

function SiteDiarySetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editingReportId = searchParams.get('report') || null
  const editingProjectId = searchParams.get('project') || null
  const supabase = createClient()

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

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [{ data: projectRows }, profile] = await Promise.all([
          supabase
            .from('projects')
            .select(projectsSetupSelectColumns())
            .order('created_at', { ascending: false }),
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

        // Editing an existing diary's setup details
        if (editingReportId && editingProjectId) {
          const { data: report, error: reportError } = await supabase
            .from('daily_reports')
            .select('*')
            .eq('id', editingReportId)
            .eq('project_id', editingProjectId)
            .maybeSingle()
          if (reportError) throw reportError

          let project = (projectRows || []).find((p) => p.id === editingProjectId)
          if (!project) {
            const { data: fetchedProject } = await supabase
              .from('projects')
              .select(projectsSetupSelectColumns())
              .eq('id', editingProjectId)
              .maybeSingle()
            project = fetchedProject
          }
          const extras = readReportSetupExtras(editingReportId)
          const dates = hydrateProjectDatesFromRow(project)
          const sticky = hydrateStickyFromRow(project)

          setSelectedProjectId(editingProjectId)
          setProjectName(project?.name || '')
          setProjectStartDate(dates.projectStartDate)
          setProjectPlannedCompletionDate(dates.projectPlannedCompletionDate)
          setProjectAddress(sticky.projectAddress)
          setProjectManager(sticky.projectManager)
          setWorkingDaysPerWeek(sticky.workingDaysPerWeek)
          setCurrentPhase(sticky.currentPhase)
          // Edit/View setup: saved diary values win; never keep account-derived aliases.
          const savedAuthor = String(report?.creator_name || '').trim()
          const safeSavedAuthor =
            savedAuthor && !isAccountDerivedAuthorName(savedAuthor, signedInUser)
              ? savedAuthor
              : ''
          setAuthor(safeSavedAuthor || profileName || '')
          setAuthorRole(hydrateAuthorRole(report) || profileRole || '')
          setShift(hydrateShift(report?.shift))
          setReportingCompany(profile?.company_name || '')
          setReportingOnBehalfOf(
            report?.company_reporting_for || '',
          )
          setReportDate(report?.report_date || todayIsoDate())
          setProjectReference(extras?.projectReference || '')
          setBrandingId(report?.branding_id || profile?.id || null)
          setBrandColor(report?.brand_color || profile?.brand_color || null)

          const logoPath = report?.brand_logo_url || null
          setLogoStoragePath(logoPath)
          if (logoPath) {
            const preview = await signedLogoUrl(supabase, logoPath)
            if (!cancelled) setLogoPreview(preview)
          }
          setLoading(false)
          return
        }

        // Brand-new diary setup — never restore a prior session draft / last diary.
        // (Edit Report Details uses editingReportId above; Use as Basis is a separate route.)
        // Scratch author: signed-in profile only — not prior diary, project, or draft.
        if (!shouldRestoreSetupFormDraft({ editingReportId })) {
          clearSetupFormDraft()
        }

        const existingProject =
          !editingReportId && editingProjectId
            ? (projectRows || []).find((p) => p.id === editingProjectId) || null
            : null

        const fresh = initialiseNewDiarySetupState({
          authorName: profileName,
          authorRole: profileRole,
          reportDate: todayIsoDate(),
          companyProfile: profile,
          existingProject,
        })
        if (cancelled) return
        applyFormSnapshot(fresh)
        // Explicit profile author — do not rely solely on snapshot apply path.
        setAuthor(fresh.author)
        setAuthorRole(fresh.authorRole)
        setReportingCompany(profile?.company_name || '')

        const logoPath = fresh.logoStoragePath
        if (logoPath) {
          const preview = await signedLogoUrl(supabase, logoPath)
          if (!cancelled) setLogoPreview(preview)
        } else if (!cancelled) {
          setLogoPreview(null)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load setup')
      } finally {
        if (!cancelled) setLoading(false)
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
    setCurrentPhase(merged.currentPhase || '')
  }

  const handleSelectExisting = async (projectId) => {
    setError('')
    if (!projectId || projectId === NEW_PROJECT_VALUE) {
      const cleared = clearToNewProjectSelection({
        author,
        reportDate,
      })
      applyStickyFormState(cleared)
      setProjectReference('')
      setReportingOnBehalfOf('')
      setProjectDatesError('')
      setStickyFieldsError('')
      // Branding may use company-profile default only — not the previously selected diary.
      try {
        const profile = await fetchDefaultCompanyProfile(supabase)
        const branding = brandingDefaultsFromCompanyProfile(profile)
        setBrandingId(branding.brandingId)
        setBrandColor(branding.brandColor)
        setLogoFile(null)
        if (logoObjectUrl) {
          URL.revokeObjectURL(logoObjectUrl)
          setLogoObjectUrl(null)
        }
        setLogoStoragePath(branding.logoStoragePath)
        if (branding.logoStoragePath) {
          const preview = await signedLogoUrl(supabase, branding.logoStoragePath)
          setLogoPreview(preview)
        } else {
          setLogoPreview(null)
        }
      } catch {
        setBrandingId(null)
        setBrandColor(null)
        setLogoStoragePath(null)
        setLogoPreview(null)
      }
      return
    }

    const project = existingProjects.find((p) => p.id === projectId)
    if (!project) return

    // Project fields only — do not copy diary content from latest report.
    const merged = mergeProjectIntoSetupState({}, project)
    applyStickyFormState(merged)
    setProjectDatesError('')
    setStickyFieldsError('')
  }

  const handleProjectNameChange = (e) => {
    const nextName = e.target.value
    setProjectName(nextName)
    setError('')

    const trimmed = nextName.trim()
    const match = trimmed
      ? existingProjects.find((p) => String(p.name || '').trim() === trimmed)
      : null

    if (match) {
      if (selectedProjectId !== match.id) {
        void handleSelectExisting(match.id)
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
      setReportingOnBehalfOf('')
      setProjectDatesError('')
      setStickyFieldsError('')
    }
  }

  const handleLogoFiles = (files) => {
    const file = files?.[0]
    if (!file) return
    setError('')
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    const url = URL.createObjectURL(file)
    setLogoObjectUrl(url)
    setLogoFile(file)
    setLogoPreview(url)
    setLogoStoragePath(null)
  }

  const removeLogo = () => {
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    setLogoObjectUrl(null)
    setLogoFile(null)
    setLogoPreview(null)
    setLogoStoragePath(null)
  }

  const handleProjectDatesChange = ({ startDate, plannedCompletionDate }) => {
    setProjectStartDate(startDate)
    setProjectPlannedCompletionDate(plannedCompletionDate)
    const v = validateProjectDates(startDate, plannedCompletionDate)
    setProjectDatesError(v.ok ? '' : v.message)
  }

  const handleStickyFieldsChange = (next) => {
    setProjectAddress(next.projectAddress)
    setProjectManager(next.projectManager)
    setWorkingDaysPerWeek(next.workingDaysPerWeek)
    setCurrentPhase(next.currentPhase)
    const v = validateStickyProjectFields(next)
    setStickyFieldsError(v.ok ? '' : v.message)
  }

  const uploadLogoIfNeeded = async (userId) => {
    if (!logoFile) return logoStoragePath
    const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/branding/setup-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('site-photos')
      .upload(path, logoFile, { contentType: logoFile.type || 'image/jpeg', upsert: false })
    if (upErr) throw upErr
    return path
  }

  const handleContinue = async () => {
    if (saving) return

    setSaving(true)
    setError('')
    setProjectDatesError('')
    setStickyFieldsError('')

    try {
      let brandLogoUrl = logoStoragePath
      if (logoFile) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('You must be signed in')
        brandLogoUrl = await uploadLogoIfNeeded(user.id)
      }

      const result = await runDiarySetupContinue({
        alreadySaving: false,
        form: {
          projectName,
          author,
          authorRole,
          shift,
          reportingOnBehalfOf,
          reportDate,
          startDate: projectStartDate,
          plannedCompletionDate: projectPlannedCompletionDate,
          projectAddress,
          projectManager,
          workingDaysPerWeek,
          currentPhase,
          projectReference,
          brandLogoUrl: brandLogoUrl || null,
          brandingId,
          brandColor,
        },
        existingProjects,
        selectedProjectId,
        editingReportId,
        editingProjectId,
        getUser: async () => {
          const { data: { user } } = await supabase.auth.getUser()
          return user
        },
        persistProject: (plan) => persistSetupProject({ supabase, plan }),
        createDraft: (fields) => createDiaryDraftFromSetup(supabase, fields),
        updateDraft: (args) => updateDiarySetupFields(supabase, args),
        writeExtras: writeReportSetupExtras,
        clearFormDraft: clearSetupFormDraft,
        navigate: async (href) => {
          router.push(href)
        },
      })

      if (!result.ok) {
        if (result.field === 'dates') setProjectDatesError(result.message)
        if (result.field === 'workingDays') setStickyFieldsError(result.message)
        setError(result.message || 'Could not continue to Site Diary')
        setSaving(false)
        return
      }

      // Persist the explicit name confirmed on setup — never invent from email.
      try {
        await persistSignedInAuthorProfile(supabase, {
          authorName: author,
          authorRole,
        })
      } catch {
        // Profile persist is best-effort; diary continue already succeeded.
      }
      // Keep saving=true until route change unmounts this screen.
    } catch (err) {
      setError(err?.message || 'Could not continue to Site Diary')
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (editingReportId && editingProjectId) {
      router.push(`/dashboard/project/${editingProjectId}/diary?report=${editingReportId}`)
      return
    }
    router.push('/dashboard/diary')
  }

  if (loading) {
    return (
      <PremiumShell title="New Site Diary" backHref="/dashboard/diary" accent={BRAND_ACCENT} maxWidth={520}>
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="New Site Diary"
      onBack={handleBack}
      backHref="/dashboard/diary"
      accent={BRAND_ACCENT}
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
        Confirm the details for today’s Site Diary, then continue.
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

      <GlassSection title="Reporting Company" accent={BRAND_ACCENT}>
        <label style={setupLabelStyle}>Reporting Company Name</label>
        <input
          value={reportingCompany}
          onChange={(e) => setReportingCompany(e.target.value)}
          placeholder="Your company name"
          autoComplete="organization"
          style={setupInputStyle}
          aria-label="Reporting Company Name"
        />

        <label style={setupLabelStyle}>Reporting Company Logo</label>
        {logoPreview ? (
          <div style={{ marginBottom: 20 }}>
            <img
              src={logoPreview}
              alt="Reporting company logo preview"
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 180,
                objectFit: 'contain',
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--plate) 70%, var(--ink))',
                border: '1px solid var(--edge)',
                marginBottom: 12,
                padding: 12,
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <SecondaryButton type="button" style={{ width: '100%', minHeight: 48 }}>
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
              <SecondaryButton type="button" onClick={removeLogo} style={{ width: '100%', minHeight: 48 }}>
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

      <GlassSection title="Reporting On Behalf Of" accent={BRAND_ACCENT}>
        <label style={setupLabelStyle}>Reporting On Behalf Of *</label>
        <input
          value={reportingOnBehalfOf}
          onChange={(e) => setReportingOnBehalfOf(e.target.value)}
          placeholder="Client, main contractor, or organisation"
          autoComplete="organization"
          style={{ ...setupInputStyle, marginBottom: 0 }}
          required
        />
      </GlassSection>

      <GlassSection title="Author" accent={BRAND_ACCENT}>
        <label style={setupLabelStyle}>Author Name *</label>
        <input
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

      <GlassSection title="Project Details" accent={BRAND_ACCENT}>
        <label style={setupLabelStyle}>Project Name *</label>
        <input
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
          currentPhase={currentPhase}
          onChange={handleStickyFieldsChange}
          error={stickyFieldsError}
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
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={{ ...setupInputStyle, marginBottom: 0 }}
          required
        />
      </GlassSection>

      <PrimaryCTA
        type="button"
        onClick={handleContinue}
        disabled={saving}
        style={{ minHeight: 52, fontSize: 16, marginBottom: 12 }}
      >
        {saving ? 'Continuing…' : 'Continue to Site Diary'}
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

      <SecondaryButton
        type="button"
        onClick={handleBack}
        disabled={saving}
        style={{ width: '100%', minHeight: 48, marginBottom: 32 }}
      >
        Back
      </SecondaryButton>
    </PremiumShell>
  )
}

export default function SiteDiarySetupRoute() {
  return (
    <Suspense
      fallback={
        <PremiumShell title="New Site Diary" backHref="/dashboard/diary" accent={BRAND_ACCENT}>
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiarySetupPage />
    </Suspense>
  )
}
