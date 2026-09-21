/**
 * Pure adapter from persisted Site Diary DB shapes → SITE_DIARY_PDF_SNAPSHOT_V1 raw input.
 * Shared by worker preflight and future enqueue API (single fingerprint mapping).
 */

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function mapPhotoRowForSnapshot(row) {
  if (!row || typeof row !== 'object') return null
  const url = row.url ?? row.storage_path ?? row.storagePath
  if (url == null || String(url).trim() === '') return null
  return {
    url: String(url).trim(),
    processing_version: row.processing_version ?? row.processingVersion ?? null,
    report_byte_size: row.report_byte_size ?? row.reportByteSize ?? null,
    sequence: row.sequence ?? row.sequence_number ?? row.sequenceNumber ?? null,
    caption: row.caption ?? null,
    location: row.location ?? null,
    layout: row.layout ?? null,
    rotation_degrees: row.rotation_degrees ?? row.rotationDegrees ?? row.rotation ?? null,
    assigned_to: row.assigned_to ?? row.assignedTo ?? null,
  }
}

/**
 * @param {unknown} rows
 */
function mapPhotoRowsForSnapshot(rows) {
  if (!Array.isArray(rows)) return []
  const out = []
  for (const row of rows) {
    const mapped = mapPhotoRowForSnapshot(row)
    if (mapped) out.push(mapped)
  }
  return out
}

/**
 * @param {Record<string, unknown>|null|undefined} report
 * @param {Record<string, unknown>|null|undefined} project
 */
function snapshotReportSlice(report, project) {
  const r = report && typeof report === 'object' ? report : {}
  const p = project && typeof project === 'object' ? project : {}
  return {
    id: r.id ?? null,
    report_number: r.report_number ?? r.reportNumber ?? null,
    report_date: r.report_date ?? r.reportDate ?? null,
    weather: r.weather ?? null,
    shift: r.shift ?? null,
    site_summary: r.site_summary ?? r.siteSummary ?? null,
    current_phase: r.current_phase ?? r.currentPhase ?? null,
    visitors: r.visitors ?? null,
    delays_issues: r.delays_issues ?? r.delaysIssues ?? null,
    actions: r.actions ?? r.actions_required ?? null,
    company_reporting_for: r.company_reporting_for ?? r.companyReportingFor ?? null,
    creator_name: r.creator_name ?? r.creatorName ?? null,
    creator_role: r.creator_role ?? r.creatorRole ?? null,
    signature_url: r.signature_url ?? r.signatureUrl ?? null,
    cover_photo_url: r.cover_photo_url ?? r.coverPhotoUrl ?? null,
    cover_processing_version: r.cover_processing_version ?? r.coverProcessingVersion ?? null,
    brand_color: r.brand_color ?? r.brandColor ?? null,
    brand_logo_url: r.brand_logo_url ?? r.brandLogoUrl ?? null,
    sign_in_sheet_url: r.sign_in_sheet_url ?? r.signInSheetUrl ?? null,
    visitors_register_provenance: r.visitors_register_provenance ?? r.visitorsRegisterProvenance ?? null,
    equipment_hire: r.equipment_hire ?? r.equipmentHire ?? null,
    temporary_works_applicable: r.temporary_works_applicable ?? r.temporaryWorksApplicable ?? null,
    temporary_works: r.temporary_works ?? r.temporaryWorks ?? null,
    hs_incidents: r.hs_incidents ?? r.hsIncidents ?? null,
    rfis: r.rfis ?? null,
    variations: r.variations ?? null,
    permits: r.permits ?? null,
    includeReportIdInPdf: r.includeReportIdInPdf === true,
    includeProjectIdInPdf: p.includeProjectIdInPdf === true,
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} project
 */
function snapshotProjectSlice(project) {
  const p = project && typeof project === 'object' ? project : {}
  return {
    id: p.id ?? null,
    name: p.name ?? p.projectName ?? null,
    project_reference: p.project_reference ?? p.projectReference ?? null,
    site_address: p.site_address ?? p.siteAddress ?? null,
    client_pm: p.client_pm ?? p.clientPm ?? null,
    start_date: p.start_date ?? p.startDate ?? null,
    planned_completion_date: p.planned_completion_date ?? p.plannedCompletionDate ?? null,
    working_days_per_week: p.working_days_per_week ?? p.workingDaysPerWeek ?? null,
  }
}

/**
 * Build the raw adapter object consumed by SITE_DIARY_PDF_SNAPSHOT_V1.fingerprint().
 *
 * @param {{
 *   report: Record<string, unknown>
 *   project: Record<string, unknown>
 *   labourRows?: unknown[]
 *   plantRows?: unknown[]
 *   photoRows?: unknown[]
 *   reportingCompany?: string|null
 * }} input
 */
export function buildSiteDiaryPdfSnapshotRawInput({
  report,
  project,
  labourRows = [],
  plantRows = [],
  photoRows = [],
  reportingCompany = null,
}) {
  const reportSlice = snapshotReportSlice(report, project)
  const projectSlice = snapshotProjectSlice(project)

  return {
    report: reportSlice,
    project: projectSlice,
    reportingCompany: reportingCompany != null ? String(reportingCompany).trim() || null : null,
    labour: Array.isArray(labourRows) ? labourRows : [],
    plant: Array.isArray(plantRows) ? plantRows : [],
    photos: mapPhotoRowsForSnapshot(photoRows),
    equipment_hire: reportSlice.equipment_hire ?? [],
    temporary_works_applicable: reportSlice.temporary_works_applicable,
    temporary_works: reportSlice.temporary_works ?? [],
    hs_incidents: reportSlice.hs_incidents ?? [],
    rfis: reportSlice.rfis ?? [],
    variations: reportSlice.variations ?? [],
    permits: reportSlice.permits ?? [],
    visitors_register_provenance: reportSlice.visitors_register_provenance ?? [],
  }
}

/** Persisted snapshot categories required by SITE_DIARY_PDF_SNAPSHOT_V1 (for contract tests). */
export const SITE_DIARY_PDF_SNAPSHOT_RAW_CATEGORIES = [
  'report',
  'project',
  'reportingCompany',
  'labour',
  'plant',
  'photos',
  'equipment_hire',
  'temporary_works_applicable',
  'temporary_works',
  'hs_incidents',
  'rfis',
  'variations',
  'permits',
  'visitors_register_provenance',
]
