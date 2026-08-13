'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { PremiumShell, BRAND_ACCENT } from '@/lib/premium-ui'
import { ReportCompleteSharePanel } from '@/components/reports/ReportCompleteSharePanel'
import {
  buildDiaryEmailMailto,
  canSharePdfFile,
  diaryEmailFallbackMessage,
  diaryNativeShareUnavailableMessage,
  diaryWhatsAppUnavailableMessage,
  downloadSiteDiaryPdf,
  prepareSiteDiaryPdf,
  shareSiteDiaryPdfNative,
} from '@/lib/diary-share'

export default function SiteDiaryReportCompletePage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const reportId = searchParams.get('report') || null
  const router = useRouter()
  const [statusMessage, setStatusMessage] = useState('')
  const [busyAction, setBusyAction] = useState(null)
  const pdfCacheRef = useRef(null)
  const statusClearRef = useRef(null)

  const showStatus = useCallback((message) => {
    if (statusClearRef.current) {
      clearTimeout(statusClearRef.current)
      statusClearRef.current = null
    }
    setStatusMessage(message || '')
    if (!message) return
    statusClearRef.current = setTimeout(() => {
      setStatusMessage('')
      statusClearRef.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    return () => {
      if (statusClearRef.current) clearTimeout(statusClearRef.current)
    }
  }, [])

  const ensurePdf = useCallback(async () => {
    if (pdfCacheRef.current?.ok && pdfCacheRef.current.file && pdfCacheRef.current.blob) {
      return pdfCacheRef.current
    }
    const prepared = await prepareSiteDiaryPdf({
      projectId: String(projectId || ''),
      reportId: reportId || '',
    })
    if (prepared.ok) {
      pdfCacheRef.current = prepared
    }
    return prepared
  }, [projectId, reportId])

  const runAction = useCallback(
    async (actionId, handler) => {
      if (busyAction) return
      setBusyAction(actionId)
      showStatus('')
      try {
        await handler()
      } catch (err) {
        showStatus(err?.message || 'Something went wrong. Try again.')
      } finally {
        setBusyAction(null)
      }
    },
    [busyAction, showStatus],
  )

  const handleMore = () =>
    runAction('more', async () => {
      const prepared = await ensurePdf()
      if (!prepared.ok) {
        showStatus(prepared.message || 'We couldn’t prepare the PDF.')
        return
      }
      if (!canSharePdfFile(prepared.file)) {
        showStatus(diaryNativeShareUnavailableMessage())
        return
      }
      const result = await shareSiteDiaryPdfNative({
        file: prepared.file,
        title: prepared.title,
        text: prepared.text,
      })
      if (!result.ok) {
        showStatus(result.message || diaryNativeShareUnavailableMessage())
      }
    })

  const handleEmail = () =>
    runAction('email', async () => {
      const prepared = await ensurePdf()
      if (!prepared.ok) {
        showStatus(prepared.message || 'We couldn’t prepare the PDF.')
        return
      }
      if (canSharePdfFile(prepared.file)) {
        const result = await shareSiteDiaryPdfNative({
          file: prepared.file,
          title: prepared.title,
          text: prepared.text,
        })
        if (!result.ok) {
          showStatus(result.message || diaryNativeShareUnavailableMessage())
        }
        return
      }
      const mailto = buildDiaryEmailMailto({
        projectName: prepared.projectName,
        reportDate: prepared.reportDate,
        fileName: prepared.fileName,
      })
      if (typeof window !== 'undefined') {
        window.location.href = mailto
      }
      showStatus(diaryEmailFallbackMessage())
    })

  const handleWhatsApp = () =>
    runAction('whatsapp', async () => {
      const prepared = await ensurePdf()
      if (!prepared.ok) {
        showStatus(prepared.message || 'We couldn’t prepare the PDF.')
        return
      }
      if (canSharePdfFile(prepared.file)) {
        const result = await shareSiteDiaryPdfNative({
          file: prepared.file,
          title: prepared.title,
          text: prepared.text,
        })
        if (!result.ok) {
          showStatus(result.message || diaryWhatsAppUnavailableMessage())
        }
        return
      }
      showStatus(diaryWhatsAppUnavailableMessage())
    })

  const handleSavePdf = () =>
    runAction('save-pdf', async () => {
      const prepared = await ensurePdf()
      if (!prepared.ok) {
        showStatus(prepared.message || 'We couldn’t prepare the PDF.')
        return
      }
      const result = downloadSiteDiaryPdf({
        blob: prepared.blob,
        fileName: prepared.fileName,
      })
      if (!result.ok) {
        showStatus(result.message || 'Could not save the PDF.')
        return
      }
      showStatus(result.message || 'PDF saved.')
    })

  return (
    <PremiumShell
      title="Report Complete"
      backHref="/dashboard"
      accent={BRAND_ACCENT}
      maxWidth={480}
    >
      <ReportCompleteSharePanel
        savedTitle="Site Diary saved"
        savedSubtitle="Your report is ready."
        savePdfLabel="Save PDF"
        busyAction={busyAction}
        statusMessage={statusMessage}
        onSavePdf={handleSavePdf}
        onEmail={handleEmail}
        onWhatsApp={handleWhatsApp}
        onMore={handleMore}
        onReturnDashboard={() => router.push('/dashboard')}
      />
    </PremiumShell>
  )
}
