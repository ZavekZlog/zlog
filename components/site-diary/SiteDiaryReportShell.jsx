'use client'

/**
 * S3A — persistent Site Diary report shell.
 * Mounts exactly one heavy surface (Viewer OR Workbench) from URL; passes through other diary child routes.
 */

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { DIARY_ACCENT, PremiumShell } from '@/lib/premium-ui'

const SavedDiaryViewerSurface = dynamic(
  () => import('@/components/site-diary/SavedDiaryViewerSurface'),
  { ssr: false },
)

function WorkbenchOpeningShell() {
  const editing = typeof window !== 'undefined'
    && /(?:^|[?&])edit=(?:1|true|edit)(?:&|$)/i.test(window.location.search)
  return (
    <PremiumShell
      title="Site Diary"
      backHref="/dashboard"
      accent={DIARY_ACCENT}
      maxWidth={720}
    >
      <p style={{ color: 'var(--text-2)' }}>
        {editing ? 'Opening diary for editing…' : 'Loading…'}
      </p>
    </PremiumShell>
  )
}

const SiteDiaryWorkbenchSurface = dynamic(
  () => import('@/components/site-diary/SiteDiaryWorkbenchSurface'),
  {
    ssr: false,
    loading: WorkbenchOpeningShell,
  },
)

/** @param {string | null | undefined} pathname */
export function isSavedDiaryViewerDiaryPath(pathname) {
  return /\/diary\/view\/?$/.test(String(pathname || ''))
}

/** @param {string | null | undefined} pathname */
export function isDiaryCompleteChildPath(pathname) {
  return /\/diary\/complete\/?$/.test(String(pathname || ''))
}

/** @param {string | null | undefined} pathname */
export function isSiteDiaryWorkbenchDiaryPath(pathname) {
  const path = String(pathname || '')
  if (!/\/diary\/?$/.test(path)) return false
  if (/\/diary\/(view|complete)\/?$/.test(path)) return false
  return true
}

export default function SiteDiaryReportShell({ children }) {
  const pathname = usePathname()

  if (isDiaryCompleteChildPath(pathname)) {
    return children
  }

  if (isSavedDiaryViewerDiaryPath(pathname)) {
    return <SavedDiaryViewerSurface />
  }

  if (isSiteDiaryWorkbenchDiaryPath(pathname)) {
    return <SiteDiaryWorkbenchSurface />
  }

  return children
}
