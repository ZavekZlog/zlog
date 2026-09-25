'use client'

/**
 * S3A — persistent Site Diary report shell.
 * Mounts exactly one heavy surface (Viewer OR Workbench) from URL; passes through other diary child routes.
 */

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const SavedDiaryViewerSurface = dynamic(
  () => import('@/components/site-diary/SavedDiaryViewerSurface'),
  { ssr: false },
)

const SiteDiaryWorkbenchSurface = dynamic(
  () => import('@/components/site-diary/SiteDiaryWorkbenchSurface'),
  { ssr: false },
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
