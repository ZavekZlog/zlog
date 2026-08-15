/**
 * Site Diary draft helpers — create/continue drafts without mutating source reports.
 */
import { brandingPayload } from './branding-payload.js'
import { fetchLatestReportingOnBehalfOf } from './diary-reporting-company.js'
import { resolveSignedInAuthorProfile, todayIsoDate } from './report-setup.js'

function todayIso() {
  return todayIsoDate()
}

/** Fields copied into a templated / "today's" draft from a saved source diary. */
export function reusableDiaryFields(source) {
  if (!source) return {}
  return {
    branding_id: source.branding_id || null,
    brand_color: source.brand_color || null,
    brand_logo_url: source.brand_logo_url || null,
    company_reporting_for: source.company_reporting_for || null,
    // Author Name / Role are never copied from a previous diary — profile only.
  }
}

/** Cleared content fields for a new draft (source diary left unchanged). */
export function clearedDiaryContentFields() {
  return {
    weather: null,
    shift: null,
    site_summary: null,
    visitors: null,
    delays_issues: null,
    actions: null,
    current_phase: null,
    cover_photo_url: null,
    signature_url: null,
    equipment_hire: [],
  }
}

export async function fetchOpenDraft(supabase, projectId) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, report_date, created_at')
    .eq('project_id', projectId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    // Column missing until migration is applied — treat as no open draft
    if (/is_draft/i.test(error.message || '')) return null
    throw error
  }
  return data || null
}

export async function fetchLatestSavedDiary(supabase, projectId) {
  const withFlag = await supabase
    .from('daily_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_draft', false)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!withFlag.error) return withFlag.data || null
  if (!/is_draft/i.test(withFlag.error.message || '')) throw withFlag.error

  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function fetchDefaultCompanyProfile(supabase) {
  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) return null
    user = data?.user || null
  } catch {
    // Network / non-Auth errors (e.g. TypeError: Failed to fetch) must not abort setup.
    return null
  }
  if (!user) return null
  const { data } = await supabase
    .from('company_brandings')
    .select('id, company_name, logo_url, brand_color, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  const preferred = (data || []).find((b) => b.is_default) || (data || [])[0] || null
  return preferred
}

/**
 * Create Today's Diary — new draft ID, today's date, reusable fields from latest saved
 * (or from explicit sourceId for Use as Template). Source row is never updated.
 * Author Name always comes from the signed-in profile — never from the source diary.
 */
export async function createTodaysDiaryDraft(supabase, projectId, sourceId = null) {
  let source = null
  if (sourceId) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('id', sourceId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw error
    source = data
  } else {
    source = await fetchLatestSavedDiary(supabase, projectId)
  }

  const { authorName: profileName, authorRole: profileRole } =
    await resolveSignedInAuthorProfile(supabase)

  const base = {
    project_id: projectId,
    report_date: todayIso(),
    ...clearedDiaryContentFields(),
    ...reusableDiaryFields(source),
    creator_name: profileName || null,
    creator_role: profileRole || null,
  }

  return insertDraftRow(supabase, base)
}

/**
 * Start Blank Diary — new empty draft for today with saved Reporting Company branding
 * and the signed-in user's most recently used Reporting On Behalf Of value.
 */
export async function createBlankDiaryDraft(supabase, projectId) {
  const [profile, reportingOnBehalfOf] = await Promise.all([
    fetchDefaultCompanyProfile(supabase),
    fetchLatestReportingOnBehalfOf(supabase),
  ])
  const branding = brandingPayload(
    profile
      ? {
          brandingId: profile.id,
          brandColor: profile.brand_color || '#FF5000',
          brandLogoUrl: profile.logo_url || null,
          companyName: profile.company_name || '',
        }
      : null,
  )

  const base = {
    project_id: projectId,
    report_date: todayIso(),
    ...clearedDiaryContentFields(),
    ...branding,
    company_reporting_for: reportingOnBehalfOf || null,
    creator_name: null,
    creator_role: null,
  }

  return insertDraftRow(supabase, base)
}

/**
 * @param {object} setup
 * @param {string} setup.projectId
 * @param {string} setup.reportDate
 * @param {string} setup.creatorName
 * @param {string} setup.companyReportingFor
 * @param {string|null} [setup.brandLogoUrl]
 * @param {string|null} [setup.brandingId]
 * @param {string|null} [setup.brandColor]
 * @param {string|null} [setup.creatorRole]
 * @param {string|null} [setup.shift]
 */
export async function createDiaryDraftFromSetup(supabase, setup) {
  const profile = await fetchDefaultCompanyProfile(supabase)
  const brandingFromProfile = brandingPayload(
    profile
      ? {
          brandingId: profile.id,
          brandColor: profile.brand_color || '#FF5000',
          brandLogoUrl: profile.logo_url || null,
          companyName: profile.company_name || '',
        }
      : null,
  )

  const base = {
    project_id: setup.projectId,
    report_date: setup.reportDate || todayIso(),
    ...clearedDiaryContentFields(),
    ...brandingFromProfile,
    branding_id: setup.brandingId ?? brandingFromProfile.branding_id ?? null,
    brand_color: setup.brandColor ?? brandingFromProfile.brand_color ?? null,
    brand_logo_url:
      setup.brandLogoUrl !== undefined
        ? setup.brandLogoUrl
        : brandingFromProfile.brand_logo_url ?? null,
    company_reporting_for: setup.companyReportingFor?.trim() || null,
    creator_name: setup.creatorName?.trim() || null,
    creator_role: setup.creatorRole?.trim() || null,
    shift: setup.shift?.trim() || null,
    current_phase: setup.currentPhase?.trim() || null,
  }

  return insertDraftRow(supabase, base)
}

/**
 * Patch setup fields on an existing draft/report without touching content sections.
 */
export async function updateDiarySetupFields(supabase, { reportId, projectId, fields }) {
  const patch = {
    report_date: fields.reportDate || todayIso(),
    company_reporting_for: fields.companyReportingFor?.trim() || null,
    creator_name: fields.creatorName?.trim() || null,
  }
  if (fields.creatorRole !== undefined) {
    patch.creator_role = fields.creatorRole?.trim() || null
  }
  if (fields.shift !== undefined) {
    patch.shift = fields.shift?.trim() || null
  }
  if (fields.currentPhase !== undefined) {
    patch.current_phase = fields.currentPhase?.trim() || null
  }
  if (fields.brandLogoUrl !== undefined) {
    patch.brand_logo_url = fields.brandLogoUrl
  }
  if (fields.brandingId !== undefined) {
    patch.branding_id = fields.brandingId
  }
  if (fields.brandColor !== undefined) {
    patch.brand_color = fields.brandColor
  }
  if (fields.projectId) {
    patch.project_id = fields.projectId
  }

  let query = supabase.from('daily_reports').update(patch).eq('id', reportId)
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query.select('id, project_id').single()
  if (error) throw error
  return data
}

async function insertDraftRow(supabase, base) {
  const withDraft = { ...base, is_draft: true }
  const first = await supabase.from('daily_reports').insert(withDraft).select('id').single()
  if (!first.error) return first.data.id
  if (!/is_draft/i.test(first.error.message || '')) throw first.error

  const second = await supabase.from('daily_reports').insert(base).select('id').single()
  if (second.error) throw second.error
  return second.data.id
}
