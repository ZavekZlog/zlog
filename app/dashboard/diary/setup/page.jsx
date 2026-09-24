'use client'

import { Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  PrimaryCTA,
  ZlogBackControl,
  DIARY_ACCENT,
  typeTokens,
} from '@/lib/premium-ui'
import { SiteDiaryProjectDetailsSection } from '@/components/site-diary/SiteDiaryProjectDetailsSection'
import { useSiteDiaryProjectDetailsController } from '@/lib/use-site-diary-project-details'
import { diaryHubHref } from '@/lib/diary-routing'

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

  const {
    loading,
    saving,
    error,
    handleContinue,
    detailsTouchedRef,
    sectionProps,
  } = useSiteDiaryProjectDetailsController({
    supabase,
    router,
    editingReportId,
    editingProjectId,
  })

  useEffect(() => {
    if (!error) return
    const el = document.getElementById('diary-setup-continue-error')
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [error])

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
        <SiteDiaryProjectDetailsSection {...sectionProps} />
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
