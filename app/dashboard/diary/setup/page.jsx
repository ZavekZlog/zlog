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

const NEW_PROJECT_VALUE = '__new__'

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
            .select('id, name, client_name, site_address, status, created_at')
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

          const project = (projectRows || []).find((p) => p.id === editingProjectId)
          const extras = readReportSetupExtras(editingReportId)

          setSelectedProjectId(editingProjectId)
          setProjectName(project?.name || '')
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
            setSelectedProjectId(project.id)
            setProjectName(project.name || '')
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

  const requiredOk =
    projectName.trim() &&
    author.trim() &&
    reportingOnBehalfOf.trim() &&
    reportDate

  const handleSelectExisting = async (projectId) => {
    setError('')
    if (!projectId || projectId === NEW_PROJECT_VALUE) {
      setSelectedProjectId(NEW_PROJECT_VALUE)
      return
    }

    const project = existingProjects.find((p) => p.id === projectId)
    if (!project) return

    setSelectedProjectId(projectId)
    setProjectName(project.name || '')

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

  const resolveProjectId = async () => {
    const name = projectName.trim()
    if (selectedProjectId !== NEW_PROJECT_VALUE) {
      const match = existingProjects.find((p) => p.id === selectedProjectId)
      if (match) {
        // Do not overwrite stored project rows — use selected id as-is.
        return match.id
      }
    }

    const exact = existingProjects.find(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (exact) return exact.id

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({
        name,
        status: 'active',
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    return data.id
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
    if (!requiredOk) {
      setError('Please complete Project Name, Report Author, Reporting On Behalf Of, and Report Date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be signed in')

      const projectId = await resolveProjectId()
      const brandLogoUrl = await uploadLogoIfNeeded(user.id)

      const setupFields = {
        projectId,
        reportDate,
        creatorName: author,
        companyReportingFor: reportingOnBehalfOf,
        brandLogoUrl: brandLogoUrl || null,
        brandingId,
        brandColor,
      }

      let reportId = editingReportId
      if (editingReportId) {
        await updateDiarySetupFields(supabase, {
          reportId: editingReportId,
          projectId: editingProjectId,
          fields: setupFields,
        })
        reportId = editingReportId
      } else {
        reportId = await createDiaryDraftFromSetup(supabase, setupFields)
      }

      writeReportSetupExtras(reportId, {
        projectReference: projectReference.trim() || '',
        projectName: projectName.trim(),
      })
      clearSetupFormDraft()

      router.push(`/dashboard/project/${projectId}/diary?report=${reportId}`)
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
      <PremiumShell title="Site Diary Setup" backHref="/dashboard" accent={BRAND_ACCENT} maxWidth={520}>
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading…</p>
      </PremiumShell>
    )
  }

  return (
    <PremiumShell
      title="Site Diary Setup"
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
        Confirm the project and report details before starting a <strong>new</strong> report.
        This screen selects a <strong>saved project</strong> (kkk / zzz / aaa names) — it is not a list of previous diaries.
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

      <GlassSection title="Report details" accent={BRAND_ACCENT}>
        {existingProjects.length > 0 && (
          <>
            <label style={setupLabelStyle}>Saved project (not a previous diary)</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectExisting(e.target.value)}
              style={{ ...setupInputStyle, cursor: 'pointer' }}
              aria-label="Choose a saved project for a new report"
            >
              <option value={NEW_PROJECT_VALUE}>New project — type name below</option>
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
        disabled={saving || !requiredOk}
        style={{ minHeight: 52, fontSize: 16, marginBottom: 12 }}
      >
        {saving ? 'Opening…' : 'Continue to Site Diary'}
      </PrimaryCTA>

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
        <PremiumShell title="Site Diary setup" backHref="/dashboard/diary" accent={BRAND_ACCENT}>
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SiteDiarySetupPage />
    </Suspense>
  )
}
