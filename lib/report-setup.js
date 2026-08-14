/**
 * Ephemeral Site Diary setup persistence for the current browser session.
 * Core fields are written onto the daily_reports draft; optional extras (e.g. project
 * reference) live here until a dedicated column exists.
 */

const FORM_KEY = 'zlog:site-diary-setup:form'
const REPORT_EXTRAS_PREFIX = 'zlog:site-diary-setup:report:'

/**
 * Local calendar YYYY-MM-DD for a Date (browser/user timezone).
 * Never use toISOString().slice(0, 10) — that is UTC and shifts the calendar day.
 *
 * @param {Date|number|string} [when]
 * @returns {string}
 */
export function localCalendarIsoDate(when = new Date()) {
  const d = when instanceof Date ? when : new Date(when)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * User's current local calendar date as YYYY-MM-DD (timezone-safe).
 */
export function todayIsoDate() {
  return localCalendarIsoDate(new Date())
}

/**
 * Normalise a stored report_date for a date input — date-only prefix, no UTC shift.
 * @param {unknown} value
 * @returns {string}
 */
export function reportDateInputValue(value) {
  if (value == null || value === '') return ''
  const raw = String(value).trim()
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
  return match ? match[1] : ''
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

function firstNonEmptyTrimmed(...candidates) {
  for (const value of candidates) {
    const t = typeof value === 'string' ? value.trim() : ''
    if (t) return t
  }
  return ''
}

/** Account-level roles — never use as Site Diary Author Role. */
const ACCOUNT_ROLE_NAMES = new Set([
  'admin',
  'user',
  'member',
  'owner',
  'authenticated',
  'anon',
  'service_role',
])

/**
 * Email local-part (e.g. spaceclampit9 from spaceclampit9@example.com).
 * @param {string|null|undefined} email
 * @returns {string}
 */
export function emailLocalPart(email) {
  const e = String(email || '').trim()
  const at = e.indexOf('@')
  if (at <= 0) return ''
  return e.slice(0, at).trim()
}

/**
 * True when a candidate “name” is really an account identifier (not a human Author Name).
 * Rejects email, email local-part, and common username metadata keys.
 *
 * @param {string|null|undefined} candidate
 * @param {object|null|undefined} user Auth user
 * @returns {boolean}
 */
export function isAccountDerivedAuthorName(candidate, user) {
  const name = String(candidate || '').trim().toLowerCase()
  if (!name) return true
  const email = String(user?.email || '').trim().toLowerCase()
  if (email && name === email) return true
  const local = emailLocalPart(email).toLowerCase()
  if (local && name === local) return true
  const meta = user?.user_metadata || {}
  const identity = user?.identities?.[0]?.identity_data || {}
  const accountAliases = [
    meta.user_name,
    meta.username,
    meta.preferred_username,
    meta.name,
    meta.display_name,
    identity.user_name,
    identity.username,
    identity.preferred_username,
    identity.name,
    identity.email,
  ]
  for (const alias of accountAliases) {
    const a = String(alias || '').trim().toLowerCase()
    if (a && a === name) return true
    if (a && a.includes('@') && emailLocalPart(a).toLowerCase() === name) return true
  }
  return false
}

/**
 * Resolve author display name from an explicitly saved profile author name only.
 * Prefer public.users.full_name, then auth user_metadata.full_name / fullName.
 * Never use email local-part, username, login address, or account identifiers —
 * including when those values were previously written into full_name.
 * Never use a prior diary creator_name or project field.
 */
export function authorNameFromUser(user, profile) {
  const candidates = [
    profile?.full_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.fullName,
  ]
  for (const value of candidates) {
    const t = typeof value === 'string' ? value.trim() : ''
    if (t && !isAccountDerivedAuthorName(t, user)) return t
  }
  return ''
}

/**
 * Resolve Author Role from profile / auth metadata when a job title exists.
 * Does not invent a role; ignores account roles such as admin/user/member.
 */
export function authorRoleFromUser(user, profile) {
  const fromProfile = firstNonEmptyTrimmed(
    profile?.job_title,
    profile?.author_role,
    profile?.title,
  )
  if (fromProfile) return fromProfile
  const meta = user?.user_metadata || {}
  const identity = user?.identities?.[0]?.identity_data || {}
  const candidate = firstNonEmptyTrimmed(
    meta.job_title,
    meta.author_role,
    meta.title,
    meta.role_title,
    identity.job_title,
    identity.title,
  )
  if (candidate) return candidate
  const role = firstNonEmptyTrimmed(meta.role, profile?.role)
  if (role && !ACCOUNT_ROLE_NAMES.has(role.toLowerCase())) return role
  return ''
}

/**
 * Scratch Site Diary Author Name — signed-in profile / auth metadata only.
 * Never pass a prior diary `creator_name`, project field, or session draft here.
 *
 * @param {object|null|undefined} user Auth user from supabase.auth.getUser()
 * @param {{ full_name?: string|null }|null|undefined} profileRow public.users row
 * @returns {string}
 */
export function scratchSetupAuthorFromProfile(user, profileRow) {
  return authorNameFromUser(user, profileRow)
}

/**
 * Scratch Author Role from signed-in profile only (optional).
 * @returns {string}
 */
export function scratchSetupAuthorRoleFromProfile(user, profileRow) {
  return authorRoleFromUser(user, profileRow)
}

/**
 * Resolve the signed-in auth user. Prefer getUser(); merge with session.user
 * so metadata present on the session cookie is not dropped when getUser is sparse.
 */
export async function resolveSignedInAuthUser(supabase) {
  if (!supabase?.auth) return null
  let user = null
  let sessionUser = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user || null
  } catch {
    // continue to session fallback
  }
  try {
    const { data } = await supabase.auth.getSession()
    sessionUser = data?.session?.user || null
  } catch {
    // ignore
  }
  if (!user && !sessionUser) return null
  if (!user) return sessionUser
  if (!sessionUser) return user
  return {
    ...sessionUser,
    ...user,
    email: user.email || sessionUser.email,
    user_metadata: {
      ...(sessionUser.user_metadata || {}),
      ...(user.user_metadata || {}),
    },
    identities:
      Array.isArray(user.identities) && user.identities.length > 0
        ? user.identities
        : sessionUser.identities,
  }
}

/**
 * Load optional public.users profile row. Missing table/columns must not throw
 * or blank the author — live envs may not expose public.users via PostgREST.
 */
export async function fetchOptionalUsersProfileRow(supabase, userId) {
  if (!supabase || !userId) return null
  const trySelect = async (columns) => {
    const { data, error } = await supabase
      .from('users')
      .select(columns)
      .eq('id', userId)
      .maybeSingle()
    if (error) return null
    return data || null
  }
  try {
    return (
      (await trySelect('full_name, job_title, author_role, role, title')) ||
      (await trySelect('full_name, role')) ||
      (await trySelect('full_name'))
    )
  } catch {
    return null
  }
}

/**
 * Author Name + Author Role for new Site Diary setup / drafts.
 * Profile / auth only — never prior diary or project fields.
 *
 * @returns {Promise<{ authorName: string, authorRole: string, user: object|null }>}
 */
export async function resolveSignedInAuthorProfile(supabase) {
  const user = await resolveSignedInAuthUser(supabase)
  if (!user) return { authorName: '', authorRole: '', user: null }
  const profileRow = await fetchOptionalUsersProfileRow(supabase, user.id)
  return {
    authorName: scratchSetupAuthorFromProfile(user, profileRow),
    authorRole: scratchSetupAuthorRoleFromProfile(user, profileRow),
    user,
  }
}

/**
 * Persist an explicitly entered Author Name (and optional job role) onto the
 * signed-in profile for future diaries. Never stores email-derived names.
 * Best-effort: auth metadata always; public.users when the table exists.
 *
 * @returns {Promise<{ ok: boolean, savedAuth: boolean, savedUsersRow: boolean }>}
 */
export async function persistSignedInAuthorProfile(supabase, { authorName = '', authorRole = '' } = {}) {
  const name = String(authorName || '').trim()
  if (!supabase?.auth || !name) {
    return { ok: false, savedAuth: false, savedUsersRow: false }
  }

  const userForCheck = await resolveSignedInAuthUser(supabase)
  if (isAccountDerivedAuthorName(name, userForCheck)) {
    return { ok: false, savedAuth: false, savedUsersRow: false }
  }

  const role = String(authorRole || '').trim()
  let savedAuth = false
  let savedUsersRow = false

  try {
    const meta = { full_name: name }
    if (role) meta.job_title = role
    const { error } = await supabase.auth.updateUser({ data: meta })
    savedAuth = !error
  } catch {
    savedAuth = false
  }

  try {
    const user = userForCheck || (await resolveSignedInAuthUser(supabase))
    if (user?.id) {
      const row = { id: user.id, full_name: name }
      if (role) row.job_title = role
      const { error } = await supabase.from('users').upsert(row, { onConflict: 'id' })
      savedUsersRow = !error
    }
  } catch {
    savedUsersRow = false
  }

  return { ok: savedAuth || savedUsersRow, savedAuth, savedUsersRow }
}
