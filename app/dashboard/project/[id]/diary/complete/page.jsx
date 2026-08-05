'use client'

import { useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  PremiumShell,
  PrimaryCTA,
  SecondaryButton,
  BRAND_ACCENT,
  typeTokens,
} from '@/lib/premium-ui'
import { shareSiteDiaryReport } from '@/lib/diary-share'

const fullWidthBtn = {
  width: '100%',
  minHeight: 52,
  fontSize: 16,
  marginBottom: 12,
}

export default function SiteDiaryReportCompletePage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const reportId = searchParams.get('report') || null
  const router = useRouter()
  const [shareMessage, setShareMessage] = useState('')
  const [sharing, setSharing] = useState(false)

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    setShareMessage('')
    try {
      const result = await shareSiteDiaryReport({
        projectId: String(projectId || ''),
        reportId: reportId || '',
      })
      if (!result?.ok) {
        setShareMessage(result?.message || 'PDF generation coming next.')
      }
    } catch (err) {
      setShareMessage(err?.message || 'PDF generation coming next.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <PremiumShell
      title="Report Complete"
      backHref="/dashboard"
      accent={BRAND_ACCENT}
      maxWidth={480}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '28px 8px 8px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
            background: 'color-mix(in srgb, #22c55e 16%, var(--plate))',
            border: '1px solid color-mix(in srgb, #22c55e 42%, var(--edge))',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#4ade80"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '0.01em',
            color: 'var(--text)',
          }}
        >
          Report Saved Successfully
        </h1>
        <p
          style={{
            ...typeTokens.body,
            margin: '12px 0 0',
            fontSize: 16,
            lineHeight: 1.5,
            color: 'color-mix(in srgb, var(--text) 86%, var(--text-2))',
            maxWidth: 340,
          }}
        >
          Your Site Diary has been securely saved.
        </p>
      </div>

      <div style={{ marginTop: 36, paddingBottom: 28 }}>
        <PrimaryCTA
          type="button"
          onClick={handleShare}
          disabled={sharing}
          style={fullWidthBtn}
        >
          {sharing ? 'Preparing…' : 'Share Report'}
        </PrimaryCTA>

        <SecondaryButton
          type="button"
          onClick={() => router.push('/dashboard')}
          style={fullWidthBtn}
        >
          Return to Dashboard
        </SecondaryButton>

        <SecondaryButton
          type="button"
          onClick={() => router.push('/dashboard')}
          style={{ ...fullWidthBtn, marginBottom: 0 }}
        >
          Create Another Report
        </SecondaryButton>

        {shareMessage ? (
          <p
            role="status"
            style={{
              margin: '18px 0 0',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--edge)',
              background: 'var(--plate)',
              color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))',
              fontSize: 15,
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            {shareMessage}
          </p>
        ) : null}
      </div>
    </PremiumShell>
  )
}
