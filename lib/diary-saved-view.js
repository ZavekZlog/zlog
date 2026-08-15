/**
 * Saved Site Diary — read-only view model.
 *
 * A saved diary is a finished record, not a form. The compose/edit workbench
 * (app/dashboard/project/[id]/diary/page.jsx) only ever renders the fields it
 * can write, so Current Phase — which is captured on Project & Report Details —
 * never appeared when reviewing a saved diary. This module shapes one saved
 * report into a single continuous document instead.
 *
 * Ownership rules are unchanged:
 * - Current Phase is read from daily_reports.current_phase for THIS diary.
 * - projects.current_phase is never read.
 * - Nothing here writes.
 */

import { groupPhotosByArea, layoutToPerPage } from './ai-annotation/area-groups.js'
import { resolveCoverPhotoPreviewUrl } from './diary-cover-photo.js'
import { hsIncidentsFromDb, rfisFromDb, variationsFromDb } from './diary-daily-records.js'
import { loadEditDiarySetupSources } from './diary-edit-hydrate.js'
import { programmeDatesForProjectDetails } from './diary-project-details.js'
import { fetchReportingCompanyForReport } from './diary-reporting-company.js'
import { formatProjectDateDisplay, toDateInputValue } from './project-day.js'

/** Shown instead of an empty value so a blank never reads as a broken field. */
export const NOT_RECORDED = 'Not recorded'

/** Visible section order of the saved-diary document (contract). */
export const SAVED_DIARY_SECTION_ORDER = [
  'Project & Report Details',
  'Cover Photo',
  'Weather',
  'H&S Incidents / Observations',
  'RFIs',
  'Variations',
  'Site Summary',
  'Labour on Site',
  'Plant',
  'Equipment on Hire',
  'Visitors',
  'Delays & Issues',
  'Actions Required',
  'Photo Evidence',
  'Signature',
]

function text(value) {
  return value == null ? '' : String(value).trim()
}

function detailRow(key, label, value) {
  const clean = text(value)
  return { key, label, value: clean || NOT_RECORDED, recorded: Boolean(clean) }
}

/**
 * Report Date / Project Day / Current Phase and the project + reporting facts,
 * in the order they are read on the finished document.
 */
export function savedDiaryDetailGroups({
  report = null,
  project = null,
  projectReference = '',
  companyName = '',
} = {}) {
  const reportDate = toDateInputValue(report?.report_date) || null
  const programme = programmeDatesForProjectDetails(project, reportDate)

  return [
    {
      key: 'project',
      title: 'Project',
      rows: [
        detailRow('projectName', 'Project Name', project?.name),
        detailRow('projectAddress', 'Project Address', programme.address),
        detailRow('projectManager', 'Project Manager', programme.projectManager),
        detailRow('workingDays', 'Working Days per Week', programme.workingDaysPerWeek),
        detailRow('startDate', 'Project Start Date', programme.startDisplay),
        detailRow('plannedCompletion', 'Planned Completion Date', programme.plannedCompletionDisplay),
        detailRow('projectReference', 'Project Reference', projectReference),
      ],
    },
    {
      key: 'reporting',
      title: 'Reporting',
      rows: [
        detailRow('reportingCompany', 'Reporting Company', companyName),
        detailRow('reportingOnBehalfOf', 'Reporting On Behalf Of', report?.company_reporting_for),
        detailRow('author', 'Report Author', report?.creator_name),
        detailRow('authorRole', 'Author Role', report?.creator_role),
      ],
    },
    {
      key: 'report',
      title: 'This Report',
      rows: [
        detailRow('reportDate', 'Report Date', reportDate ? formatProjectDateDisplay(reportDate) : ''),
        detailRow('shift', 'Shift', report?.shift),
        detailRow('projectDay', 'Project Day', programme.projectDayLine),
        // Diary-specific — daily_reports.current_phase, never projects.current_phase.
        detailRow('currentPhase', 'Current Phase', report?.current_phase),
      ],
    },
  ]
}

function labourRowsFromDb(rows) {
  return (Array.isArray(rows) ? rows : []).map((r, index) => ({
    key: `labour-${index}`,
    trade: text(r?.trade),
    company: text(r?.company),
    headcount: r?.count == null ? '' : String(r.count),
    hours: r?.hours == null ? '' : String(r.hours),
    notes: text(r?.notes),
  })).filter((r) => r.trade || r.company || r.headcount || r.hours || r.notes)
}

function plantRowsFromDb(rows) {
  return (Array.isArray(rows) ? rows : []).map((r, index) => ({
    key: `plant-${index}`,
    item: text(r?.item),
    ref: text(r?.ref),
    status: text(r?.status),
    notes: text(r?.notes),
  })).filter((r) => r.item || r.ref || r.status || r.notes)
}

function equipmentHireRowsFromDb(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    key: `equipment-${index}`,
    description: text(item?.description),
    supplier: text(item?.supplier),
    quantity: item?.quantity == null ? '' : String(item.quantity),
    status: text(item?.status),
  })).filter((r) => r.description || r.supplier || r.quantity)
}

/** Total labour on site across all saved rows (attendance headline). */
export function totalLabourOnSite(labourRows = []) {
  return labourRows.reduce((sum, r) => {
    const n = parseInt(r.headcount, 10)
    return Number.isFinite(n) ? sum + n : sum
  }, 0)
}

/**
 * Saved work areas with every photo visible, in saved order, with the area's
 * own review density and continuous Photo 1..N numbering across the document.
 */
export function savedDiaryPhotoAreas(signedPhotoRows = []) {
  let offset = 0
  return groupPhotosByArea(signedPhotoRows).map((group) => {
    const area = {
      id: group.id,
      areaName: group.areaName,
      notes: text(group.description),
      perPage: layoutToPerPage(group.layout),
      photos: group.photos,
      numberOffset: offset,
    }
    offset += group.photos.length
    return area
  })
}

/** Columns that exist on live report_photos (see lib/live-diary-schema.js). */
export function savedDiaryPhotoColumns({ includeOptional = true } = {}) {
  const base = 'id, url, caption, location, category, sequence, layout'
  return includeOptional ? `${base}, rotation_degrees, assigned_to` : base
}

/** Pure assembly — every input is already fetched and signed. */
export function buildSavedDiaryView({
  report = null,
  project = null,
  projectId = null,
  projectReference = '',
  companyName = '',
  labour = [],
  plant = [],
  photoAreas = [],
  coverPhotoUrl = null,
  signatureUrl = null,
} = {}) {
  const labourRows = labourRowsFromDb(labour)
  const reportDate = toDateInputValue(report?.report_date) || null

  return {
    reportId: report?.id || null,
    projectId: projectId || report?.project_id || null,
    projectName: text(project?.name),
    authorName: text(report?.creator_name),
    authorRole: text(report?.creator_role),
    reportDate,
    reportDateDisplay: reportDate ? formatProjectDateDisplay(reportDate) : NOT_RECORDED,
    detailGroups: savedDiaryDetailGroups({ report, project, projectReference, companyName }),
    coverPhotoUrl: coverPhotoUrl || null,
    weather: text(report?.weather),
    hsIncidents: hsIncidentsFromDb(report?.hs_incidents),
    rfis: rfisFromDb(report?.rfis),
    variations: variationsFromDb(report?.variations),
    siteSummary: text(report?.site_summary),
    labour: labourRows,
    labourTotal: totalLabourOnSite(labourRows),
    plant: plantRowsFromDb(plant),
    equipmentHire: equipmentHireRowsFromDb(report?.equipment_hire),
    visitors: text(report?.visitors),
    delaysIssues: text(report?.delays_issues),
    actionsRequired: text(report?.actions ?? report?.actions_required),
    photoAreas,
    photoCount: photoAreas.reduce((n, area) => n + area.photos.length, 0),
    signatureUrl: signatureUrl || null,
  }
}

async function fetchSavedPhotoRows(supabase, reportId) {
  const full = await supabase
    .from('report_photos')
    .select(savedDiaryPhotoColumns({ includeOptional: true }))
    .eq('report_id', reportId)
    .order('sequence')
  if (!full.error) return full.data || []

  const basic = await supabase
    .from('report_photos')
    .select(savedDiaryPhotoColumns({ includeOptional: false }))
    .eq('report_id', reportId)
    .order('sequence')
  return basic.error ? [] : basic.data || []
}

/**
 * Load one saved diary as a complete read-only document.
 * Performs no writes and creates no rows.
 */
export async function loadSavedDiaryView(supabase, { projectId = null, reportId = null } = {}) {
  const sources = await loadEditDiarySetupSources(supabase, { reportId, projectId })
  if (!sources.ok || !sources.report) {
    return {
      ok: false,
      reason: sources.reason || 'report-not-found',
      message:
        sources.message
        || 'We couldn’t open that saved Site Diary. Go back and choose it again.',
      view: null,
    }
  }

  const report = sources.report
  const resolvedProjectId = sources.projectId || report.project_id || null

  const [labourResult, plantResult, photoRows, company] = await Promise.all([
    supabase
      .from('report_labour')
      .select('trade, company, count, hours, notes')
      .eq('report_id', report.id)
      .order('sequence'),
    supabase
      .from('report_plant')
      .select('item, ref, status, notes')
      .eq('report_id', report.id)
      .order('sequence'),
    fetchSavedPhotoRows(supabase, report.id),
    fetchReportingCompanyForReport(supabase, report),
  ])

  const signedPhotos = await Promise.all(
    (photoRows || []).map(async (p) => ({
      ...p,
      key: p.id,
      preview: await resolveCoverPhotoPreviewUrl(supabase, p.url),
      storagePath: p.url,
    })),
  )

  const [coverPhotoUrl, signatureUrl] = await Promise.all([
    resolveCoverPhotoPreviewUrl(supabase, report.cover_photo_url),
    resolveCoverPhotoPreviewUrl(supabase, report.signature_url),
  ])

  return {
    ok: true,
    reason: null,
    message: null,
    view: buildSavedDiaryView({
      report,
      project: sources.project,
      projectId: resolvedProjectId,
      projectReference: sources.hydration?.projectReference || '',
      companyName: company?.companyName || '',
      labour: labourResult?.error ? [] : labourResult?.data || [],
      plant: plantResult?.error ? [] : plantResult?.data || [],
      photoAreas: savedDiaryPhotoAreas(signedPhotos),
      coverPhotoUrl,
      signatureUrl,
    }),
  }
}
