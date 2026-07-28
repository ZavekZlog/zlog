/**
 * Site Diary draft helpers — create/continue drafts without mutating source reports.
 */
import { brandingPayload } from '@/components/branding/BrandingSelector'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Fields copied into a templated / "today's" draft from a saved source diary. */
export function reusableDiaryFields(source) {
  if (!source) return {}
  return {
    branding_id: source.branding_id || null,
    brand_color: source.brand_color || null,
    brand_logo_url: source.brand_logo_url || null,
    company_reporting_for: source.company_reporting_for || null,
    creator_name: source.creator_name || null,
    creator_role: source.creator_role || null,
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
  const { data: { user } } = await supabase.auth.getUser()
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

  const base = {
    project_id: projectId,
    report_date: todayIso(),
    ...clearedDiaryContentFields(),
    ...reusableDiaryFields(source),
  }

  return insertDraftRow(supabase, base)
}

/**
 * Start Blank Diary — new empty draft for today; copy Reporting For company profile only.
 */
export async function createBlankDiaryDraft(supabase, projectId) {
  const profile = await fetchDefaultCompanyProfile(supabase)
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
    company_reporting_for: profile?.company_name || null,
    creator_name: null,
    creator_role: null,
  }

  return insertDraftRow(supabase, base)
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
