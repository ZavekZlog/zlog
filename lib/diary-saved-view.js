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
import { normalizeCoverStoragePath, resolveCoverPhotoPreviewUrl } from './diary-cover-photo.js'
import {
  hsIncidentsFromDb,
  rfisFromDb,
  temporaryWorksApplicableFromDb,
  temporaryWorksFromDb,
  variationsFromDb,
} from './diary-daily-records.js'
import {
  coverStoragePathFromReport,
  fetchProjectRowForEditHydrate,
  hydrateEditModeCoverAndReference,
} from './diary-edit-hydrate.js'
import { hydrateAuthorName, hydrateAuthorRole } from './diary-form-hydrate.js'
import { programmeDatesForProjectDetails } from './diary-project-details.js'
import { fetchReportingCompanyForReport } from './diary-reporting-company.js'
import { hydrateProjectDatesFromRow } from './diary-setup-project-dates.js'
import { hydrateShift } from './diary-setup-shift.js'
import { hydrateStickyFromRow } from './project-sticky-fields.js'
import { formatProjectDateDisplay, toDateInputValue } from './project-day.js'
import { reportDateInputValue, todayIsoDate } from './report-setup.js'
import {
  createPhotoDisplaySignSession,
  signSavedPhotoGridRows,
} from './photo-workspace/thumbnail-display.js'

/** Shown instead of an empty value so a blank never reads as a broken field. */
export const NOT_RECORDED = 'Not recorded'

export const SAVED_DIARY_MEDIA_ABSENT = 'absent'
export const SAVED_DIARY_MEDIA_LOADING = 'loading'
export const SAVED_DIARY_MEDIA_READY = 'ready'
export const SAVED_DIARY_MEDIA_FAILED = 'failed'

/**
 * Display signing state for cover / signature.
 * Path + no preview is LOADING, never ABSENT. Null preview is not overloaded.
 */
export function savedDiaryMediaPreviewStatus({
  storagePath = null,
  previewUrl = null,
  attempted = false,
} = {}) {
  if (previewUrl) return SAVED_DIARY_MEDIA_READY
  if (!text(storagePath)) return SAVED_DIARY_MEDIA_ABSENT
  if (attempted) return SAVED_DIARY_MEDIA_FAILED
  return SAVED_DIARY_MEDIA_LOADING
}

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
  'Temporary Works & Scaffolding Checks',
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
export function savedDiaryPhotoColumns({ includeOptional = true, includePreparedAssets = true } = {}) {
  const base = 'id, url, caption, location, category, sequence, layout'
  const optional = includeOptional ? ', rotation_degrees, assigned_to' : ''
  const prepared = includePreparedAssets
    ? ', thumbnail_path, report_width, report_height, thumbnail_width, thumbnail_height, report_byte_size, thumbnail_byte_size, processing_version'
    : ''
  return `${base}${optional}${prepared}`
}

/**
 * Complete SDSC seed from already-loaded Saved Review sources.
 * Canonical / raw hydration only — never display strings or detailGroups.
 */
function buildSavedDiarySdscSeed({
  report = null,
  project = null,
  projectId = null,
  hydration = null,
  company = null,
  userId = '',
} = {}) {
  const sticky = hydrateStickyFromRow(project)
  const dates = hydrateProjectDatesFromRow(project)
  return {
    userId: userId || company?.userId || '',
    projectId: projectId || report?.project_id || '',
    reportId: report?.id || '',
    projectName: project?.name || '',
    projectStartDate: dates.projectStartDate || '',
    projectPlannedCompletionDate: dates.projectPlannedCompletionDate || '',
    projectAddress: sticky.projectAddress || '',
    projectManager: sticky.projectManager || '',
    workingDaysPerWeek: sticky.workingDaysPerWeek || '',
    projectReference: hydration?.projectReference || '',
    reportDate: reportDateInputValue(report?.report_date) || todayIsoDate(),
    shift: hydrateShift(report?.shift),
    currentPhase: String(report?.current_phase || '').trim(),
    author: hydrateAuthorName(report),
    authorRole: hydrateAuthorRole(report),
    reportingOnBehalfOf: report?.company_reporting_for || '',
    reportingCompany: company?.companyName || '',
    brandingId: company?.brandingId || null,
    brandColor: company?.brandColor || null,
    logoStoragePath: company?.logoStoragePath || null,
    coverStoragePath: hydration?.coverStoragePath || null,
  }
}

/** Pure assembly — every input is already fetched. Display media may still be unsigned. */
export function buildSavedDiaryView({
  report = null,
  project = null,
  projectId = null,
  projectReference = '',
  companyName = '',
  labour = [],
  plant = [],
  photoAreas = [],
  coverPhotoPath = null,
  coverPhotoUrl = null,
  coverSignAttempted = false,
  signaturePath = null,
  signatureUrl = null,
  signatureSignAttempted = false,
} = {}) {
  const labourRows = labourRowsFromDb(labour)
  const reportDate = toDateInputValue(report?.report_date) || null
  const resolvedCoverPath = coverPhotoPath || coverStoragePathFromReport(report)
  const resolvedSignaturePath =
    normalizeCoverStoragePath(signaturePath || report?.signature_url) || null

  return {
    reportId: report?.id || null,
    projectId: projectId || report?.project_id || null,
    projectName: text(project?.name),
    authorName: text(report?.creator_name),
    authorRole: text(report?.creator_role),
    reportDate,
    reportDateDisplay: reportDate ? formatProjectDateDisplay(reportDate) : NOT_RECORDED,
    detailGroups: savedDiaryDetailGroups({ report, project, projectReference, companyName }),
    coverPhotoPath: resolvedCoverPath || null,
    coverPhotoUrl: coverPhotoUrl || null,
    coverPreviewStatus: savedDiaryMediaPreviewStatus({
      storagePath: resolvedCoverPath,
      previewUrl: coverPhotoUrl,
      attempted: coverSignAttempted,
    }),
    signaturePath: resolvedSignaturePath || null,
    signatureUrl: signatureUrl || null,
    signaturePreviewStatus: savedDiaryMediaPreviewStatus({
      storagePath: resolvedSignaturePath,
      previewUrl: signatureUrl,
      attempted: signatureSignAttempted,
    }),
    weather: text(report?.weather),
    hsIncidents: hsIncidentsFromDb(report?.hs_incidents),
    rfis: rfisFromDb(report?.rfis),
    variations: variationsFromDb(report?.variations),
    siteSummary: text(report?.site_summary),
    labour: labourRows,
    labourTotal: totalLabourOnSite(labourRows),
    plant: plantRowsFromDb(plant),
    equipmentHire: equipmentHireRowsFromDb(report?.equipment_hire),
    temporaryWorksApplicable: temporaryWorksApplicableFromDb(
      report?.temporary_works_applicable,
      report?.temporary_works,
    ),
    temporaryWorks: temporaryWorksFromDb(report?.temporary_works),
    visitors: text(report?.visitors),
    delaysIssues: text(report?.delays_issues),
    actionsRequired: text(report?.actions ?? report?.actions_required),
    photoAreas,
    photoCount: photoAreas.reduce((n, area) => n + area.photos.length, 0),
    signatureUrl: signatureUrl || null,
  }
}

function mapSavedPhotoGridRow(p, signed = {}) {
  return {
    ...p,
    key: p.id,
    preview: signed.preview || null,
    thumbnailPreview: signed.thumbnailPreview || null,
    thumbnailPath: p.thumbnail_path || null,
    storagePath: p.url,
    rotationDegrees: p.rotation_degrees ?? 0,
    assignedTo: p.assigned_to || '',
    acceptedDescription: p.caption || '',
  }
}

function createSavedPhotoSignSession(supabase) {
  return createPhotoDisplaySignSession({
    expiresIn: 3600,
    batchSignPaths: async (paths, expiresIn = 3600) => {
      const { data, error } = await supabase.storage
        .from('site-photos')
        .createSignedUrls(paths, expiresIn)
      if (error) throw error
      return data || []
    },
    singleSignPath: (path) => resolveCoverPhotoPreviewUrl(supabase, path),
  })
}

async function fetchSavedReportRow(supabase, reportId, projectId) {
  let reportQuery = supabase
    .from('daily_reports')
    .select('*')
    .eq('id', reportId)

  if (projectId) {
    reportQuery = reportQuery.eq('project_id', projectId)
  }

  return reportQuery.maybeSingle()
}

async function fetchSavedPhotoRows(supabase, reportId) {
  const full = await supabase
    .from('report_photos')
    .select(savedDiaryPhotoColumns({ includeOptional: true, includePreparedAssets: true }))
    .eq('report_id', reportId)
    .order('sequence')
  if (!full.error) return full.data || []

  if (/thumbnail_path|processing_version|report_width|report_height|thumbnail_width|thumbnail_height|report_byte_size|thumbnail_byte_size/i.test(full.error.message || '')) {
    const withoutPrepared = await supabase
      .from('report_photos')
      .select(savedDiaryPhotoColumns({ includeOptional: true, includePreparedAssets: false }))
      .eq('report_id', reportId)
      .order('sequence')
    if (!withoutPrepared.error) return withoutPrepared.data || []
  }

  const basic = await supabase
    .from('report_photos')
    .select(savedDiaryPhotoColumns({ includeOptional: false, includePreparedAssets: false }))
    .eq('report_id', reportId)
    .order('sequence')
  return basic.error ? [] : basic.data || []
}

function savedDiaryOpenFailure(reason, message) {
  return {
    ok: false,
    reason,
    message:
      message
      || 'We couldn’t open that saved Site Diary. Go back and choose it again.',
    view: null,
    sdscSeed: null,
  }
}

/**
 * Load one saved diary as a read-only document.
 * Performs no writes and creates no rows.
 *
 * First useful paint waits only for the report and project identity rows.
 * Labour, plant, photo metadata, reporting company, and signed media hydrate after paint.
 */
export async function loadSavedDiaryView(supabase, { projectId = null, reportId = null } = {}) {
  if (!reportId) {
    return savedDiaryOpenFailure('missing-report-id')
  }

  const routeProjectId = projectId || null

  const reportPromise = fetchSavedReportRow(supabase, reportId, routeProjectId)
  const projectPromise = routeProjectId
    ? fetchProjectRowForEditHydrate(supabase, routeProjectId)
    : Promise.resolve(null)
  const authPromise = Promise.resolve(supabase.auth.getUser()).catch(() => ({
    data: { user: null },
    error: true,
  }))
  const labourPromise = supabase
    .from('report_labour')
    .select('trade, company, count, hours, notes')
    .eq('report_id', reportId)
    .order('sequence')
  const plantPromise = supabase
    .from('report_plant')
    .select('item, ref, status, notes')
    .eq('report_id', reportId)
    .order('sequence')
  const photosPromise = fetchSavedPhotoRows(supabase, reportId)

  const [{ data: report, error: reportError }, projectFromRoute] = await Promise.all([
    reportPromise,
    projectPromise,
  ])

  if (reportError) {
    return savedDiaryOpenFailure('report-error', reportError.message)
  }
  if (!report) {
    return savedDiaryOpenFailure('report-not-found')
  }
  if (routeProjectId && report.project_id && String(report.project_id) !== String(routeProjectId)) {
    return savedDiaryOpenFailure('report-not-found')
  }

  let project = projectFromRoute
  if (!project && !routeProjectId && report.project_id) {
    project = await fetchProjectRowForEditHydrate(supabase, report.project_id)
  }

  const resolvedProjectId = routeProjectId || report.project_id || null
  const companyPromise = authPromise
    .then((authResult) => {
      const user = authResult?.data?.user || null
      return fetchReportingCompanyForReport(supabase, report, { user })
    })
    .catch(() => null)

  const hydration = hydrateEditModeCoverAndReference({
    report,
    projectRow: project,
    reportExtras: null,
  })
  const coverPhotoPath =
    hydration?.coverStoragePath || coverStoragePathFromReport(report)
  const signaturePath = normalizeCoverStoragePath(report.signature_url)

  const view = buildSavedDiaryView({
    report,
    project,
    projectId: resolvedProjectId,
    projectReference: hydration?.projectReference || '',
    companyName: '',
    labour: [],
    plant: [],
    coverPhotoPath,
    coverPhotoUrl: null,
    coverSignAttempted: false,
    signaturePath,
    signatureUrl: null,
    signatureSignAttempted: false,
    photoAreas: [],
  })
  view.secondaryReady = false

  const sdscSeed = buildSavedDiarySdscSeed({
    report,
    project,
    projectId: resolvedProjectId,
    hydration,
    company: null,
    userId: '',
  })

  let lastPhotoAreas = []

  const notify = (onPatch, patch) => {
    if (patch && typeof onPatch === 'function') {
      try {
        onPatch(patch)
      } catch {
        /* applying a display patch must not fail the hydrate */
      }
    }
    return patch
  }

  const runHydrateSecondary = async (onPatch) => {
    const [authResult, labourResult, plantResult, photoRows, company] = await Promise.all([
      authPromise,
      Promise.resolve(labourPromise).catch(() => ({ data: [], error: true })),
      Promise.resolve(plantPromise).catch(() => ({ data: [], error: true })),
      Promise.resolve(photosPromise).catch(() => []),
      companyPromise,
    ])
    const userId = company?.userId || authResult?.data?.user?.id || ''
    const labour = labourResult?.error ? [] : labourResult?.data || []
    const plant = plantResult?.error ? [] : plantResult?.data || []
    const unsignedPhotos = (photoRows || []).map((row) => mapSavedPhotoGridRow(row))
    lastPhotoAreas = savedDiaryPhotoAreas(unsignedPhotos)
    const labourRows = labourRowsFromDb(labour)
    const plantRows = plantRowsFromDb(plant)
    const nextSeed = buildSavedDiarySdscSeed({
      report,
      project,
      projectId: resolvedProjectId,
      hydration,
      company,
      userId,
    })
    Object.assign(sdscSeed, nextSeed)
    const patch = {
      labour: labourRows,
      labourTotal: totalLabourOnSite(labourRows),
      plant: plantRows,
      photoAreas: lastPhotoAreas,
      photoCount: lastPhotoAreas.reduce((n, area) => n + area.photos.length, 0),
      detailGroups: savedDiaryDetailGroups({
        report,
        project,
        projectReference: hydration?.projectReference || '',
        companyName: company?.companyName || '',
      }),
      secondaryReady: true,
    }
    notify(onPatch, patch)
    return { ...patch, sdscSeed: { ...sdscSeed } }
  }

  const hydrateCover = async () => {
    try {
      if (!coverPhotoPath) {
        return {
          coverPhotoUrl: null,
          coverPreviewStatus: SAVED_DIARY_MEDIA_ABSENT,
        }
      }
      const coverPhotoUrl = await resolveCoverPhotoPreviewUrl(supabase, coverPhotoPath)
      return {
        coverPhotoUrl,
        coverPreviewStatus: savedDiaryMediaPreviewStatus({
          storagePath: coverPhotoPath,
          previewUrl: coverPhotoUrl,
          attempted: true,
        }),
      }
    } catch {
      return {
        coverPhotoUrl: null,
        coverPreviewStatus: savedDiaryMediaPreviewStatus({
          storagePath: coverPhotoPath,
          previewUrl: null,
          attempted: true,
        }),
      }
    }
  }

  const hydrateSignature = async () => {
    try {
      if (!signaturePath) {
        return {
          signatureUrl: null,
          signaturePreviewStatus: SAVED_DIARY_MEDIA_ABSENT,
        }
      }
      const signatureUrl = await resolveCoverPhotoPreviewUrl(supabase, signaturePath)
      return {
        signatureUrl,
        signaturePreviewStatus: savedDiaryMediaPreviewStatus({
          storagePath: signaturePath,
          previewUrl: signatureUrl,
          attempted: true,
        }),
      }
    } catch {
      return {
        signatureUrl: null,
        signaturePreviewStatus: savedDiaryMediaPreviewStatus({
          storagePath: signaturePath,
          previewUrl: null,
          attempted: true,
        }),
      }
    }
  }

  const hydratePhotos = async () => {
    try {
      const rows = (await Promise.resolve(photosPromise).catch(() => [])) || []
      const signedPhotos = await signSavedPhotoGridRows(rows, {
        session: createSavedPhotoSignSession(supabase),
        mapRow: (row, _index, signed) => mapSavedPhotoGridRow(row, signed),
      })
      lastPhotoAreas = savedDiaryPhotoAreas(signedPhotos)
      return {
        photoAreas: lastPhotoAreas,
        photoCount: lastPhotoAreas.reduce((n, area) => n + area.photos.length, 0),
      }
    } catch {
      return {
        photoAreas: lastPhotoAreas,
        photoCount: lastPhotoAreas.reduce((n, area) => n + area.photos.length, 0),
      }
    }
  }

  const applySignedPhotoThumbnails = async () => {
    const photosPatch = await hydratePhotos()
    return {
      ...view,
      ...photosPatch,
    }
  }

  const failedCoverPatch = () => ({
    coverPhotoUrl: null,
    coverPreviewStatus: savedDiaryMediaPreviewStatus({
      storagePath: coverPhotoPath,
      previewUrl: null,
      attempted: true,
    }),
  })

  const failedSignaturePatch = () => ({
    signatureUrl: null,
    signaturePreviewStatus: savedDiaryMediaPreviewStatus({
      storagePath: signaturePath,
      previewUrl: null,
      attempted: true,
    }),
  })

  const failedPhotosPatch = () => ({
    photoAreas: lastPhotoAreas,
    photoCount: lastPhotoAreas.reduce((n, area) => n + area.photos.length, 0),
  })

  /**
   * Background display signing. Never rejects.
   * Cover / signature / photo tasks overlap; one failure does not stop siblings.
   */
  const runHydrateDisplayMedia = async (onPatch) => {
    const notify = (patch) => {
      if (patch && typeof onPatch === 'function') {
        try {
          onPatch(patch)
        } catch {
          /* applying a display patch must not fail the hydrate */
        }
      }
      return patch
    }

    const coverTask = Promise.resolve()
      .then(() => hydrateCover())
      .then(notify, () => notify(failedCoverPatch()))
    const signatureTask = Promise.resolve()
      .then(() => hydrateSignature())
      .then(notify, () => notify(failedSignaturePatch()))
    const photosTask = Promise.resolve()
      .then(() => hydratePhotos())
      .then(notify, () => notify(failedPhotosPatch()))

    const settled = await Promise.allSettled([coverTask, signatureTask, photosTask])
    const merged = {}
    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value) Object.assign(merged, item.value)
    }
    return merged
  }

  return {
    ok: true,
    reason: null,
    message: null,
    view,
    sdscSeed,
    applySignedPhotoThumbnails,
    hydrateSecondary: {
      run: runHydrateSecondary,
    },
    hydrateDisplayMedia: {
      cover: hydrateCover,
      signature: hydrateSignature,
      photos: hydratePhotos,
      run: runHydrateDisplayMedia,
    },
  }
}
