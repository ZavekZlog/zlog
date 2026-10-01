'use client'

/**
 * S3A — persistent Site Diary report shell.
 * Mounts exactly one heavy surface (Viewer OR Workbench) from URL; passes through other diary child routes.
 */

import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { emitShareDiag } from '@/lib/share-diag-beacon'
import { loadSiteDiaryWorkbenchSurface } from '@/lib/diary-workbench-module'
import { DIARY_ACCENT, PremiumShell } from '@/lib/premium-ui'

const EDIT_NAV_TIMING_KEY = 'zlog.siteDiary.editNavTiming.v1'

function readEditNavTiming() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(EDIT_NAV_TIMING_KEY) || 'null')
    if (!parsed || typeof parsed.hydrationSessionId !== 'string' || typeof parsed.tapStartedAtMs !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function claimEditRouteCommitted(timing) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(EDIT_NAV_TIMING_KEY) || 'null')
    if (!parsed || parsed.hydrationSessionId !== timing.hydrationSessionId || parsed.routeCommitted) return false
    parsed.routeCommitted = 1
    sessionStorage.setItem(EDIT_NAV_TIMING_KEY, JSON.stringify(parsed))
    return true
  } catch {
    return false
  }
}

function emitEditHandoff(stage, timing, reason) {
  emitShareDiag(stage, {
    reportId: typeof timing.reportId === 'string' ? timing.reportId : null,
    projectId: typeof timing.projectId === 'string' ? timing.projectId : null,
    surface: 'site-diary-shell',
    hydrationSessionId: timing.hydrationSessionId,
    elapsedMs: Math.max(0, Date.now() - timing.tapStartedAtMs),
    ...(reason ? { reason } : {}),
  })
}

function handoffResourceReason(before, tap) {
  let entries = []
  const origin = typeof performance !== 'undefined' ? performance.timeOrigin : NaN
  try { entries = performance.getEntriesByType('resource') } catch { /* unavailable */ }
  if (!Array.isArray(entries) || !Number.isFinite(origin)) return 'rsc=unavailable;chunk=unavailable'
  const pathOf = (name) => { try { return new URL(name, 'https://r.invalid').pathname } catch { return '' } }
  const one = (entry) => {
    const type = ['fetch', 'script', 'xmlhttprequest', 'navigation', 'link'].includes(entry.initiatorType) ? entry.initiatorType : 'other'
    return `path=${pathOf(entry.name)} type=${type} start=${Math.round(entry.startTime)} duration=${Math.round(entry.duration)} responseEnd=${Math.round(entry.responseEnd)} startElapsedMs=${Math.round(origin + entry.startTime - tap)}`
  }
  const rsc = []
  const chunks = []
  const seen = new Set(before || [])
  for (const entry of entries) {
    if (!entry?.name || typeof entry.startTime !== 'number' || origin + entry.startTime < tap) continue
    const path = pathOf(entry.name)
    const type = entry.initiatorType
    if (type !== 'script' && type !== 'img' && type !== 'css' && type !== 'font' && type !== 'beacon' && /^\/dashboard\/project\/[^/]+\/diary\/?$/.test(path)) rsc.push(entry)
    if (before && (type === 'script' || type === 'link') && !seen.has(entry.name) && /^\/_next\/static\/.+\.js$/.test(path) && path.length <= 200) chunks.push(entry)
  }
  const text = (list, empty, many) => (list.length === 1 ? one(list[0]) : list.length ? many : empty)
  return `rsc=${text(rsc, 'none', 'multiple')};chunk=${before ? text(chunks, 'no-new-script', 'multiple-new-scripts') : 'unavailable'}`
}

function ViewerOpeningShell() {
  const router = useRouter()
  return (
    <PremiumShell
      title="Site Diary"
      backHref="/dashboard/diary?view=saved"
      onBack={(event) => {
        event?.preventDefault()
        router.replace('/dashboard/diary?view=saved')
      }}
      accent={DIARY_ACCENT}
      maxWidth={640}
      stickyBack
    >
      <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Opening saved diary…</p>
    </PremiumShell>
  )
}

const SavedDiaryViewerSurface = dynamic(
  () => import('@/components/site-diary/SavedDiaryViewerSurface'),
  {
    ssr: false,
    loading: ViewerOpeningShell,
  },
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
  () => {
    const timing = readEditNavTiming()
    let scriptsBefore = null
    if (timing) {
      try {
        scriptsBefore = performance.getEntriesByType('resource')
          .filter((entry) => entry && (entry.initiatorType === 'script' || entry.initiatorType === 'link'))
          .map((entry) => entry.name)
      } catch { scriptsBefore = null }
      emitEditHandoff('edit-navigation-workbench-import-start', timing)
    }
    const pending = loadSiteDiaryWorkbenchSurface()
    if (timing) {
      Promise.resolve(pending).then(() => {
        try { emitEditHandoff('edit-navigation-workbench-import-resolved', timing, handoffResourceReason(scriptsBefore, timing.tapStartedAtMs)) } catch { /* diagnostic only */ }
      }, () => {})
    }
    return pending
  },
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
    const timing = readEditNavTiming()
    if (timing && claimEditRouteCommitted(timing)) emitEditHandoff('edit-navigation-route-committed', timing)
    return <SiteDiaryWorkbenchSurface />
  }

  return children
}
