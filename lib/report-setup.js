/**
 * Ephemeral Site Diary setup persistence for the current browser session.
 * Core fields are written onto the daily_reports draft; optional extras (e.g. project
 * reference) live here until a dedicated column exists.
 */

const FORM_KEY = 'zlog:site-diary-setup:form'
const REPORT_EXTRAS_PREFIX = 'zlog:site-diary-setup:report:'

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function readSetupFormDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(FORM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeSetupFormDraft(draft) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(FORM_KEY, JSON.stringify(draft))
  } catch {
    // ignore quota / private mode
  }
}

export function clearSetupFormDraft() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(FORM_KEY)
  } catch {
    // ignore
  }
}

export function readReportSetupExtras(reportId) {
  if (typeof window === 'undefined' || !reportId) return null
  try {
    const raw = sessionStorage.getItem(`${REPORT_EXTRAS_PREFIX}${reportId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeReportSetupExtras(reportId, extras) {
  if (typeof window === 'undefined' || !reportId) return
  try {
    sessionStorage.setItem(`${REPORT_EXTRAS_PREFIX}${reportId}`, JSON.stringify(extras || {}))
  } catch {
    // ignore
  }
}

/** Resolve author display name from auth user + optional users row. */
export function authorNameFromUser(user, profile) {
  const fromProfile = profile?.full_name?.trim()
  if (fromProfile) return fromProfile
  const meta = user?.user_metadata || {}
  return (
    meta.full_name?.trim() ||
    meta.name?.trim() ||
    meta.fullName?.trim() ||
    ''
  )
}
