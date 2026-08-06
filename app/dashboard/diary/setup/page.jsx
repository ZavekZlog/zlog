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
import { validateProjectDates } from '@/lib/project-day'
import {
  NEW_PROJECT_SENTINEL,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
  projectsSetupSelectColumns,
  showProjectDatesOnSetup,
} from '@/lib/diary-setup-project-dates'
import {
  persistSetupProject,
  runDiarySetupContinue,
} from '@/lib/diary-setup-continue'
import {
  createDiaryDraftFromSetup,
  fetchDefaultCompanyProfile,
  fetchLatestSavedDiary,
  updateDiarySetupFields,
} from '@/lib/diary-draft'
import {
  authorNameFromUser,
  clearSetupFormDraft,
  readReportSetupExtras,
  readSetupFormDraft,
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
  const [author, setAuthor] = useState('')
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
    if (typeof snapshot.author === 'string') setAuthor(snapshot.author)
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
        const [{ data: { user } }, { data: projectRows }, profile] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('projects')
            .select(projectsSetupSelectColumns())
            .order('created_at', { ascending: false }),
          fetchDefaultCompanyProfile(supabase),
        ])

        if (cancelled) return
        setProjects(projectRows || [])

        let profileName = ''
        if (user) {
          const { data: userRow } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()
          if (!cancelled) profileName = authorNameFromUser(user, userRow)
        }

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

          setSelectedProjectId(editingProjectId)
          setProjectName(project?.name || '')
          setProjectStartDate(dates.projectStartDate)
          setProjectPlannedCompletionDate(dates.projectPlannedCompletionDate)
          setAuthor(report?.creator_name || profileName || '')
          setReportingOnBehalfOf(
            report?.company_reporting_for || profile?.company_name || '',
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

        // Restore in-progress setup when navigating Back
        const saved = readSetupFormDraft()
        if (saved?.projectName || saved?.author || saved?.reportingOnBehalfOf) {
          applyFormSnapshot({
            ...saved,
            author: saved.author || profileName,
            reportingOnBehalfOf: saved.reportingOnBehalfOf || profile?.company_name || '',
            reportDate: saved.reportDate || todayIsoDate(),
          })
          if (saved.logoStoragePath) {
            const preview = await signedLogoUrl(supabase, saved.logoStoragePath)
            if (!cancelled) setLogoPreview(preview)
          }
          setLoading(false)
          return
        }

        // Fresh setup defaults
        setAuthor(profileName)
        setReportingOnBehalfOf(profile?.company_name || '')
        setReportDate(todayIsoDate())
        setBrandingId(profile?.id || null)
        setBrandColor(profile?.brand_color || null)
        if (profile?.logo_url) {
          setLogoStoragePath(profile.logo_url)
          const preview = await signedLogoUrl(supabase, profile.logo_url)
          if (!cancelled) setLogoPreview(preview)
        }

        // Hub "Start New" may pass ?project= to preselect a saved project (not a diary).
        if (!editingReportId && editingProjectId) {
          const project = (projectRows || []).find((p) => p.id === editingProjectId)
          if (project) {
            const merged = mergeProjectIntoSetupState({}, project)
            setSelectedProjectId(merged.selectedProjectId)
            setProjectName(merged.projectName)
            setProjectStartDate(merged.projectStartDate)
            setProjectPlannedCompletionDate(merged.projectPlannedCompletionDate)
          }
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
      author,
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
    author,
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

  const handleSelectExisting = async (projectId) => {
    setError('')
    if (!projectId || projectId === NEW_PROJECT_VALUE) {
      setSelectedProjectId(NEW_PROJECT_VALUE)
      setProjectStartDate('')
      setProjectPlannedCompletionDate('')
      setProjectDatesError('')
      return
    }

    const project = existingProjects.find((p) => p.id === projectId)
    if (!project) return

    const merged = mergeProjectIntoSetupState({}, project)
    setSelectedProjectId(merged.selectedProjectId)
    setProjectName(merged.projectName)
    setProjectStartDate(merged.projectStartDate)
    setProjectPlannedCompletionDate(merged.projectPlannedCompletionDate)
    setProjectDatesError('')

    try {
      const [latest, profile] = await Promise.all([
        fetchLatestSavedDiary(supabase, projectId),
        fetchDefaultCompanyProfile(supabase),
      ])

      if (latest?.creator_name) setAuthor(latest.creator_name)
      if (latest?.company_reporting_for) {
        setReportingOnBehalfOf(latest.company_reporting_for)
      } else if (profile?.company_name && !reportingOnBehalfOf.trim()) {
        setReportingOnBehalfOf(profile.company_name)
      }

      // Keep date as today for a new report; only prefill date when editing.
      if (editingReportId && latest?.report_date) setReportDate(latest.report_date)

      const extras = latest?.id ? readReportSetupExtras(latest.id) : null
      if (extras?.projectReference) setProjectReference(extras.projectReference)

      const logoPath = latest?.brand_logo_url || profile?.logo_url || null
      setBrandingId(latest?.branding_id || profile?.id || null)
      setBrandColor(latest?.brand_color || profile?.brand_color || null)
      setLogoFile(null)
      if (logoObjectUrl) {
        URL.revokeObjectURL(logoObjectUrl)
        setLogoObjectUrl(null)
      }
      setLogoStoragePath(logoPath)
      if (logoPath) {
        const preview = await signedLogoUrl(supabase, logoPath)
        setLogoPreview(preview)
      } else {
        setLogoPreview(null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load project details')
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
          reportingOnBehalfOf,
          reportDate,
          startDate: projectStartDate,
          plannedCompletionDate: projectPlannedCompletionDate,
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
        setError(result.message || 'Could not continue to Site Diary')
        setSaving(false)
        return
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
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <PremiumShell title="New Site Diary" backHref="/dashboard" accent={BRAND_ACCENT} maxWidth={520}>
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="New Site Diary"
      onBack={handleBack}
      backHref="/dashboard"
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
        You’re setting up a <strong>new</strong> Site Diary. Confirm the project and date below, then continue to fill in today’s details.
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

      <GlassSection title="Project and date" accent={BRAND_ACCENT}>
        {existingProjects.length > 0 && (
          <>
            <label style={setupLabelStyle}>Which project is this diary for?</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectExisting(e.target.value)}
              style={{ ...setupInputStyle, cursor: 'pointer' }}
              aria-label="Choose which project this diary is for"
            >
              <option value={NEW_PROJECT_VALUE}>New project — type the name below</option>
              {existingProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label style={setupLabelStyle}>Project Name *</label>
        <input
          value={projectName}
          onChange={(e) => {
            setProjectName(e.target.value)
            if (selectedProjectId !== NEW_PROJECT_VALUE) {
              const match = existingProjects.find((p) => p.id === selectedProjectId)
              if (match && e.target.value.trim() !== match.name) {
                setSelectedProjectId(NEW_PROJECT_VALUE)
              }
            }
          }}
          placeholder="e.g. 14 High Street Extension"
          autoComplete="organization"
          style={setupInputStyle}
          required
        />

        {showProjectDatesOnSetup() ? (
          <div style={{ marginBottom: 4 }}>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 14,
                lineHeight: 1.45,
                color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
              }}
            >
              Project programme dates (set once for this project)
            </p>
            <ProjectDatesFields
              startDate={projectStartDate}
              plannedCompletionDate={projectPlannedCompletionDate}
              onChange={handleProjectDatesChange}
              error={projectDatesError}
            />
          </div>
        ) : null}

        <label style={setupLabelStyle}>Report Author *</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          style={setupInputStyle}
          required
        />

        <label style={setupLabelStyle}>Reporting On Behalf Of *</label>
        <input
          value={reportingOnBehalfOf}
          onChange={(e) => setReportingOnBehalfOf(e.target.value)}
          placeholder="Company or client name"
          autoComplete="organization"
          style={setupInputStyle}
          required
        />

        <label style={setupLabelStyle}>Report Date *</label>
        <input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={setupInputStyle}
          required
        />

        <label style={setupLabelStyle}>Company / Client Logo</label>
        {logoPreview ? (
          <div style={{ marginBottom: 20 }}>
            <img
              src={logoPreview}
              alt="Company or client logo preview"
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
                  aria-label="Replace logo"
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
          <div style={{ marginBottom: 20 }}>
            <ImageSourceButtons
              onFiles={handleLogoFiles}
              cameraLabel="Take Photo"
              galleryLabel="Upload Photo"
              stacked
            />
          </div>
        )}

        <label style={setupLabelStyle}>Project Reference</label>
        <input
          value={projectReference}
          onChange={(e) => setProjectReference(e.target.value)}
          placeholder="Optional job or reference number"
          style={{ ...setupInputStyle, marginBottom: 0 }}
        />
      </GlassSection>

      <PrimaryCTA
        type="button"
        onClick={handleContinue}
        disabled={saving}
        style={{ minHeight: 52, fontSize: 16, marginBottom: 12 }}
      >
        {saving ? 'Continuing…' : 'Continue to fill in your diary'}
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
