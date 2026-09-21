import { LIVE_REPORT_LABOUR, LIVE_REPORT_PHOTOS, LIVE_REPORT_PLANT } from './live-diary-schema.js'
import { buildSiteDiaryPdfSnapshotRawInput } from './site-diary-pdf-snapshot-source.js'

export const SITE_DIARY_PDF_SNAPSHOT_DAILY_REPORT_SELECT = `
  id,
  project_id,
  report_number,
  report_date,
  weather,
  shift,
  site_summary,
  current_phase,
  visitors,
  visitors_register_provenance,
  delays_issues,
  actions,
  company_reporting_for,
  creator_name,
  creator_role,
  signature_url,
  cover_photo_url,
  cover_processing_version,
  branding_id,
  brand_color,
  brand_logo_url,
  sign_in_sheet_url,
  equipment_hire,
  hs_incidents,
  rfis,
  variations,
  temporary_works_applicable,
  temporary_works,
  permits,
  projects (
    id,
    owner_id,
    name,
    site_address,
    client_pm,
    start_date,
    planned_completion_date,
    working_days_per_week,
    project_reference
  )
`

export const SITE_DIARY_PDF_SNAPSHOT_DAILY_REPORT_SELECT_WITHOUT_PERMITS = `
  id,
  project_id,
  report_number,
  report_date,
  weather,
  shift,
  site_summary,
  current_phase,
  visitors,
  visitors_register_provenance,
  delays_issues,
  actions,
  company_reporting_for,
  creator_name,
  creator_role,
  signature_url,
  cover_photo_url,
  cover_processing_version,
  branding_id,
  brand_color,
  brand_logo_url,
  sign_in_sheet_url,
  equipment_hire,
  hs_incidents,
  rfis,
  variations,
  temporary_works_applicable,
  temporary_works,
  projects (
    id,
    owner_id,
    name,
    site_address,
    client_pm,
    start_date,
    planned_completion_date,
    working_days_per_week,
    project_reference
  )
`

const PROJECT_SELECT = `
  id,
  owner_id,
  name,
  site_address,
  client_pm,
  start_date,
  planned_completion_date,
  working_days_per_week,
  project_reference
`

function labourSelectColumns() {
  return LIVE_REPORT_LABOUR.columns.filter((c) => c !== 'id' && c !== 'owner_id' && c !== 'report_id').join(', ')
}

function plantSelectColumns() {
  return LIVE_REPORT_PLANT.columns.filter((c) => c !== 'id' && c !== 'owner_id' && c !== 'report_id').join(', ')
}

function photoSelectColumns() {
  const cols = LIVE_REPORT_PHOTOS.columns.filter(
    (c) => c !== 'id' && c !== 'owner_id' && c !== 'report_id' && c !== 'created_at',
  )
  return cols.join(', ')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string|null|undefined} brandingId
 */
async function loadReportingCompanyName(admin, brandingId) {
  const id = String(brandingId || '').trim()
  if (!id) return null
  const { data, error } = await admin
    .from('company_brandings')
    .select('company_name')
    .eq('id', id)
    .maybeSingle()
  if (error) return null
  const name = String(data?.company_name || '').trim()
  return name || null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 */
async function fetchReportWithProject(admin, reportId) {
  const primary = await admin
    .from('daily_reports')
    .select(SITE_DIARY_PDF_SNAPSHOT_DAILY_REPORT_SELECT)
    .eq('id', reportId)
    .maybeSingle()

  if (!primary.error && primary.data) {
    return { report: primary.data, error: null }
  }

  const msg = String(primary.error?.message || '')
  if (!/permits/i.test(msg)) {
    return { report: null, error: primary.error }
  }

  const fallback = await admin
    .from('daily_reports')
    .select(SITE_DIARY_PDF_SNAPSHOT_DAILY_REPORT_SELECT_WITHOUT_PERMITS)
    .eq('id', reportId)
    .maybeSingle()

  return { report: fallback.data, error: fallback.error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} projectId
 */
async function fetchProjectRow(admin, projectId) {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', projectId)
    .maybeSingle()
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 */
async function fetchLabourRows(admin, reportId) {
  const { data, error } = await admin
    .from('report_labour')
    .select(labourSelectColumns())
    .eq('report_id', reportId)
    .order('sequence')
  return { data: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 */
async function fetchPlantRows(admin, reportId) {
  const { data, error } = await admin
    .from('report_plant')
    .select(plantSelectColumns())
    .eq('report_id', reportId)
    .order('sequence')
  return { data: data || [], error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 */
async function fetchPhotoRows(admin, reportId) {
  const columns = photoSelectColumns()
  const primary = await admin
    .from('report_photos')
    .select(columns)
    .eq('report_id', reportId)
    .order('sequence')

  if (!primary.error) {
    return { data: primary.data || [], error: null }
  }

  const msg = String(primary.error?.message || '')
  const withoutPrepared = LIVE_REPORT_PHOTOS.columns.filter(
    (c) =>
      !LIVE_REPORT_PHOTOS.preparedAssetColumns.includes(c)
      && c !== 'id'
      && c !== 'owner_id'
      && c !== 'report_id'
      && c !== 'created_at',
  ).join(', ')

  if (/report_byte_size|processing_version|thumbnail_/i.test(msg)) {
    const fallback = await admin
      .from('report_photos')
      .select(withoutPrepared)
      .eq('report_id', reportId)
      .order('sequence')
    return { data: fallback.data || [], error: fallback.error }
  }

  return { data: [], error: primary.error }
}

/**
 * Load persisted Site Diary state for SITE_DIARY_PDF_SNAPSHOT_V1 fingerprinting.
 * Side-effect free aside from read queries — no signing, downloads, or PDF work.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} reportId
 */
export async function loadSiteDiaryPdfSnapshotSource(admin, reportId) {
  const id = String(reportId || '').trim()
  if (!id) {
    return { ok: false, code: 'report_not_found', message: 'Site Diary report was not found.' }
  }

  const { report, error: reportError } = await fetchReportWithProject(admin, id)
  if (reportError) {
    return {
      ok: false,
      code: 'snapshot_load_failed',
      message: 'Could not load Site Diary data for export validation.',
    }
  }
  if (!report) {
    return { ok: false, code: 'report_not_found', message: 'Site Diary report was not found.' }
  }

  let project = report.projects && typeof report.projects === 'object' ? report.projects : null
  if (!project && report.project_id) {
    const projectResult = await fetchProjectRow(admin, String(report.project_id))
    if (projectResult.error) {
      return {
        ok: false,
        code: 'snapshot_load_failed',
        message: 'Could not load Site Diary data for export validation.',
      }
    }
    project = projectResult.data
  }

  if (!project?.id || project.owner_id == null) {
    return {
      ok: false,
      code: 'snapshot_load_failed',
      message: 'Could not load Site Diary data for export validation.',
    }
  }

  const [labourResult, plantResult, photoResult, reportingCompany] = await Promise.all([
    fetchLabourRows(admin, id),
    fetchPlantRows(admin, id),
    fetchPhotoRows(admin, id),
    loadReportingCompanyName(admin, report.branding_id),
  ])

  if (labourResult.error || plantResult.error || photoResult.error) {
    return {
      ok: false,
      code: 'snapshot_load_failed',
      message: 'Could not load Site Diary data for export validation.',
    }
  }

  const snapshotRaw = buildSiteDiaryPdfSnapshotRawInput({
    report,
    project,
    labourRows: labourResult.data,
    plantRows: plantResult.data,
    photoRows: photoResult.data,
    reportingCompany,
  })

  return {
    ok: true,
    reportId: String(report.id),
    projectId: String(report.project_id),
    ownerId: String(project.owner_id),
    snapshotRaw,
  }
}
