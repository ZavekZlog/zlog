import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NOT_RECORDED,
  SAVED_DIARY_MEDIA_ABSENT,
  SAVED_DIARY_MEDIA_FAILED,
  SAVED_DIARY_MEDIA_LOADING,
  SAVED_DIARY_MEDIA_READY,
  SAVED_DIARY_SECTION_ORDER,
  buildSavedDiaryView,
  loadSavedDiaryView,
  savedDiaryDetailGroups,
  savedDiaryMediaPreviewStatus,
  savedDiaryPhotoAreas,
  totalLabourOnSite,
} from './diary-saved-view.js'
import { SITE_DIARY_SHADOW_FIELD_KEYS } from './site-diary-session-context.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const viewerPage = join(root, 'app/dashboard/project/[id]/diary/view/page.jsx')

const savedReport = {
  id: 'rep-1',
  project_id: 'proj-1',
  report_date: '2026-08-15',
  current_phase: 'Roof',
  shift: 'Day',
  weather: 'Dry, 18C',
  site_summary: 'Flooring can now proceed.',
  visitors: 'Building control, 10:30',
  delays_issues: 'Late delivery of insulation',
  actions: 'Chase insulation supplier',
  company_reporting_for: 'Outsource Pro',
  creator_name: 'Colin Walker',
  creator_role: 'Site Manager',
  cover_photo_url: 'user/rep-1/cover.jpg',
  signature_url: 'user/rep-1/signature.png',
  equipment_hire: [{ description: 'Telehandler', supplier: 'AB Hire', quantity: 1, status: 'Active' }],
  hs_incidents: [{ id: 'hs-1', description: 'Trip hazard cleared', status: 'Closed' }],
  rfis: [{ id: 'rfi-1', reference: 'RFI-04', description: 'Slab level', status: 'Open' }],
  variations: [{ id: 'v-1', reference: 'VO-02', description: 'Extra sockets', status: 'Instructed' }],
  temporary_works_applicable: true,
  temporary_works: [
    {
      id: 'tw-1',
      type: 'Scaffold',
      item: 'Scaffold',
      location: 'Level 03 east',
      status: 'Inspected',
      reference: 'TWS-014',
      checkResult: 'Satisfactory',
      notes: 'Toe boards secure',
      scaffoldCheck: 'Checked today — satisfactory',
      scaffoldTag: 'Bay A',
    },
  ],
}

const savedProject = {
  id: 'proj-1',
  name: 'Prince Street',
  site_address: '14 High St',
  client_pm: 'Jordan Lee',
  working_days_per_week: 5,
  start_date: '2026-08-01',
  planned_completion_date: '2026-09-19',
  project_reference: 'JOB-1042',
  // Legacy project-level phase — must never appear on the saved diary.
  current_phase: 'Demolition',
}

const savedPhotoRows = [
  {
    id: 'ph-1',
    key: 'ph-1',
    url: 'user/rep-1/1.jpg',
    preview: 'https://signed/1.jpg',
    storagePath: 'user/rep-1/1.jpg',
    caption: 'Roof felt complete',
    location: 'Roof',
    category: 'zlog-area-notes:v1:Felt and battens done',
    sequence: 1,
    layout: 'grid4',
    assigned_to: 'Roofing Ltd',
    rotation_degrees: 90,
    thumbnail_path: 'user/rep-1/1-thumb.jpg',
  },
  {
    id: 'ph-2',
    key: 'ph-2',
    url: 'user/rep-1/2.jpg',
    preview: 'https://signed/2.jpg',
    storagePath: 'user/rep-1/2.jpg',
    caption: 'Ridge tiles',
    location: 'Roof',
    category: 'zlog-area-notes:v1:Felt and battens done',
    sequence: 2,
    layout: 'grid4',
  },
  {
    id: 'ph-3',
    key: 'ph-3',
    url: 'user/rep-1/3.jpg',
    preview: 'https://signed/3.jpg',
    storagePath: 'user/rep-1/3.jpg',
    caption: 'Communal hallway',
    location: 'Communals',
    sequence: 3,
    layout: 'full',
  },
]

function findRow(groups, key) {
  for (const group of groups) {
    const hit = group.rows.find((r) => r.key === key)
    if (hit) return hit
  }
  return null
}

function allViewPhotos(view) {
  return (view?.photoAreas || []).flatMap((area) => area.photos || [])
}

/** Minimal Supabase double covering only the reads the viewer performs. */
function fakeSupabase({
  report = savedReport,
  project = savedProject,
  photos = [],
  brandings = [],
  user = { id: 'user-1' },
  delayReportMs = 0,
  delaySignedUrlMs = 0,
  reportError = null,
} = {}) {
  const calls = {
    writes: [],
    tables: [],
    eq: [],
    createSignedUrl: 0,
    createSignedUrls: 0,
    signedUrlPaths: [],
    signedBatchPaths: [],
    tablesWhenReportAwaited: null,
    authWhenReportAwaited: 0,
  }

  const listBuilder = (table, rows) => {
    const result = { data: rows, error: null }
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        calls.eq.push({ table, col, val })
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  }

  const reportBuilder = () => {
    const filters = {}
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        filters[col] = val
        calls.eq.push({ table: 'daily_reports', col, val })
        return builder
      },
      maybeSingle: async () => {
        if (delayReportMs) {
          await new Promise((resolve) => setTimeout(resolve, delayReportMs))
        }
        calls.tablesWhenReportAwaited = [...calls.tables]
        calls.authWhenReportAwaited = calls.getUser || 0
        if (reportError) return { data: null, error: reportError }
        if (!report) return { data: null, error: null }
        if (filters.id && String(report.id) !== String(filters.id)) {
          return { data: null, error: null }
        }
        if (filters.project_id && String(report.project_id) !== String(filters.project_id)) {
          return { data: null, error: null }
        }
        return { data: report, error: null }
      },
      insert() {
        calls.writes.push('daily_reports.insert')
        throw new Error('viewer must not write')
      },
      update() {
        calls.writes.push('daily_reports.update')
        throw new Error('viewer must not write')
      },
    }
    return builder
  }

  const projectBuilder = () => {
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        calls.eq.push({ table: 'projects', col, val })
        return builder
      },
      maybeSingle: async () => ({ data: project, error: null }),
    }
    return builder
  }

  const brandingBuilder = () => {
    const filters = {}
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        filters[col] = val
        calls.eq.push({ table: 'company_brandings', col, val })
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (filters.id) {
          const row = brandings.find((row) => String(row.id) === String(filters.id)) || null
          return { data: row, error: null }
        }
        if (filters.user_id) {
          const row = brandings.find((row) => row.is_default)
            || brandings[0]
            || null
          return { data: row, error: null }
        }
        return { data: brandings[0] || null, error: null }
      },
      then: (resolve, reject) => Promise.resolve({ data: brandings, error: null }).then(resolve, reject),
    }
    return builder
  }

  return {
    calls,
    auth: {
      getUser: async () => {
        calls.getUser = (calls.getUser || 0) + 1
        return { data: { user }, error: null }
      },
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path) => {
          calls.createSignedUrl += 1
          calls.signedUrlPaths.push(path)
          if (delaySignedUrlMs) {
            await new Promise((resolve) => setTimeout(resolve, delaySignedUrlMs))
          }
          return { data: { signedUrl: `https://signed/${path}` }, error: null }
        },
        createSignedUrls: async (paths) => {
          calls.createSignedUrls += 1
          calls.signedBatchPaths.push(...(paths || []))
          return {
            data: (paths || []).map((path) => ({
              path,
              signedUrl: `https://signed/${path}`,
              error: null,
            })),
            error: null,
          }
        },
      }),
    },
    from(table) {
      calls.tables.push(table)
      if (table === 'daily_reports') return reportBuilder()
      if (table === 'projects') return projectBuilder()
      if (table === 'report_photos') return listBuilder('report_photos', photos)
      if (table === 'report_labour') {
        return listBuilder('report_labour', [{ trade: 'Groundworks', company: 'Acme', count: 6, hours: 8, notes: '' }])
      }
      if (table === 'report_plant') {
        return listBuilder('report_plant', [{ item: 'Excavator', ref: 'EX-1', status: 'On site', notes: '' }])
      }
      if (table === 'company_brandings') return brandingBuilder()
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

describe('saved diary view model', () => {
  it('shows Current Phase from this diary, never from the project', () => {
    const groups = savedDiaryDetailGroups({
      report: savedReport,
      project: savedProject,
      projectReference: 'JOB-1042',
      companyName: 'Zlog Construction',
    })
    const phase = findRow(groups, 'currentPhase')
    assert.equal(phase.value, 'Roof')
    assert.equal(phase.recorded, true)
    assert.notEqual(phase.value, savedProject.current_phase)
  })

  it('a diary saved without a phase reads Not recorded rather than blank', () => {
    const groups = savedDiaryDetailGroups({
      report: { ...savedReport, current_phase: null },
      project: savedProject,
    })
    const phase = findRow(groups, 'currentPhase')
    assert.equal(phase.value, NOT_RECORDED)
    assert.equal(phase.recorded, false)
  })

  it('compact snapshot fields stay Project, Report Date, Shift, Project Day, and Current Phase only when recorded', () => {
    const populated = savedDiaryDetailGroups({
      report: savedReport,
      project: savedProject,
      projectReference: 'JOB-1042',
      companyName: 'Zlog Construction',
    })
    const reportRows = populated.find((g) => g.key === 'report').rows
    assert.deepEqual(reportRows.map((r) => r.key), ['reportDate', 'shift', 'projectDay', 'currentPhase'])
    const shownWhenPhaseRecorded = reportRows
      .filter((row) => row.key !== 'reportDate')
      .filter((row) => row.key !== 'currentPhase' || row.recorded)
    assert.deepEqual(shownWhenPhaseRecorded.map((r) => r.label), ['Shift', 'Project Day', 'Current Phase'])

    const blankPhase = savedDiaryDetailGroups({
      report: { ...savedReport, current_phase: null },
      project: savedProject,
    })
    const shownWhenPhaseBlank = blankPhase
      .find((g) => g.key === 'report')
      .rows
      .filter((row) => row.key !== 'reportDate')
      .filter((row) => row.key !== 'currentPhase' || row.recorded)
    assert.deepEqual(shownWhenPhaseBlank.map((r) => r.label), ['Shift', 'Project Day'])
  })

  it('details cover project, reporting and report facts in report order', () => {
    const groups = savedDiaryDetailGroups({
      report: savedReport,
      project: savedProject,
      projectReference: 'JOB-1042',
      companyName: 'Zlog Construction',
    })
    assert.deepEqual(groups.map((g) => g.key), ['project', 'reporting', 'report'])
    assert.equal(findRow(groups, 'projectName').value, 'Prince Street')
    assert.equal(findRow(groups, 'projectAddress').value, '14 High St')
    assert.equal(findRow(groups, 'projectManager').value, 'Jordan Lee')
    assert.equal(findRow(groups, 'workingDays').value, '5 days')
    assert.equal(findRow(groups, 'startDate').value, '1 August 2026')
    assert.equal(findRow(groups, 'plannedCompletion').value, '19 September 2026')
    assert.equal(findRow(groups, 'projectReference').value, 'JOB-1042')
    assert.equal(findRow(groups, 'reportingCompany').value, 'Zlog Construction')
    assert.equal(findRow(groups, 'reportingOnBehalfOf').value, 'Outsource Pro')
    assert.equal(findRow(groups, 'author').value, 'Colin Walker')
    assert.equal(findRow(groups, 'authorRole').value, 'Site Manager')
    assert.equal(findRow(groups, 'reportDate').value, '15 August 2026')
    assert.equal(findRow(groups, 'shift').value, 'Day')
    assert.match(findRow(groups, 'projectDay').value, /Project Day/)
  })

  it('saved work areas keep their photos, captions, notes and review density', () => {
    const areas = savedDiaryPhotoAreas(savedPhotoRows)
    assert.equal(areas.length, 2)

    const [roof, communals] = areas
    assert.equal(roof.areaName, 'Roof')
    assert.equal(roof.notes, 'Felt and battens done')
    assert.equal(roof.perPage, 4)
    assert.equal(roof.photos.length, 2)
    assert.equal(roof.numberOffset, 0)
    assert.equal(roof.photos[0].acceptedDescription, 'Roof felt complete')
    assert.equal(roof.photos[0].assignedTo, 'Roofing Ltd')
    assert.equal(roof.photos[1].acceptedDescription, 'Ridge tiles')

    assert.equal(communals.areaName, 'Communals')
    assert.equal(communals.perPage, 1)
    // Photo numbering stays continuous across the whole document.
    assert.equal(communals.numberOffset, 2)
  })

  it('assembles every saved section of the document', () => {
    const view = buildSavedDiaryView({
      report: savedReport,
      project: savedProject,
      projectId: 'proj-1',
      projectReference: 'JOB-1042',
      companyName: 'Zlog Construction',
      labour: [{ trade: 'Groundworks', company: 'Acme', count: 6, hours: 8 }],
      plant: [{ item: 'Excavator', ref: 'EX-1', status: 'On site' }],
      photoAreas: savedDiaryPhotoAreas(savedPhotoRows),
      coverPhotoUrl: 'https://signed/cover.jpg',
      signatureUrl: 'https://signed/sig.png',
    })

    assert.equal(view.reportId, 'rep-1')
    assert.equal(view.reportDateDisplay, '15 August 2026')
    assert.equal(view.coverPhotoPath, 'user/rep-1/cover.jpg')
    assert.equal(view.coverPhotoUrl, 'https://signed/cover.jpg')
    assert.equal(view.coverPreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(view.signatureUrl, 'https://signed/sig.png')
    assert.equal(view.signaturePreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(view.weather, 'Dry, 18C')
    assert.equal(view.hsIncidents.length, 1)
    assert.equal(view.rfis.length, 1)
    assert.equal(view.variations.length, 1)
    assert.equal(view.siteSummary, 'Flooring can now proceed.')
    assert.equal(view.labour.length, 1)
    assert.equal(view.labourTotal, 6)
    assert.equal(view.plant.length, 1)
    assert.equal(view.equipmentHire.length, 1)
    assert.equal(view.temporaryWorksApplicable, true)
    assert.equal(view.temporaryWorks.length, 1)
    assert.equal(view.temporaryWorks[0].type, 'Scaffold')
    assert.equal(view.temporaryWorks[0].status, 'Inspected')
    assert.equal(view.temporaryWorks[0].checkResult, 'Satisfactory')
    assert.equal(view.temporaryWorks[0].scaffoldCheck, 'Checked today — satisfactory')
    assert.equal(view.visitors, 'Building control, 10:30')
    assert.equal(view.delaysIssues, 'Late delivery of insulation')
    assert.equal(view.actionsRequired, 'Chase insulation supplier')
    assert.equal(view.photoAreas.length, 2)
    assert.equal(view.photoCount, 3)
    assert.equal(view.signatureUrl, 'https://signed/sig.png')
    assert.equal(view.authorName, 'Colin Walker')
  })

  it('preserves an explicit temporary works N/A decision', () => {
    const view = buildSavedDiaryView({
      report: {
        ...savedReport,
        temporary_works_applicable: false,
        temporary_works: [],
      },
      project: savedProject,
    })
    assert.equal(view.temporaryWorksApplicable, false)
    assert.deepEqual(view.temporaryWorks, [])
  })

  it('totals labour on site across saved rows', () => {
    assert.equal(totalLabourOnSite([{ headcount: '6' }, { headcount: '4' }, { headcount: '' }]), 10)
  })

  it('distinguishes absent, loading, ready and failed cover/signature preview states', () => {
    assert.equal(savedDiaryMediaPreviewStatus({}), SAVED_DIARY_MEDIA_ABSENT)
    assert.equal(
      savedDiaryMediaPreviewStatus({ storagePath: 'user/rep/cover.jpg' }),
      SAVED_DIARY_MEDIA_LOADING,
    )
    assert.equal(
      savedDiaryMediaPreviewStatus({
        storagePath: 'user/rep/cover.jpg',
        previewUrl: 'https://signed/cover.jpg',
      }),
      SAVED_DIARY_MEDIA_READY,
    )
    assert.equal(
      savedDiaryMediaPreviewStatus({
        storagePath: 'user/rep/cover.jpg',
        attempted: true,
      }),
      SAVED_DIARY_MEDIA_FAILED,
    )
  })
})

describe('saved diary loader', () => {
  it('loads one saved report as a complete document without writing', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(result.view.reportId, 'rep-1')
    assert.equal(findRow(result.view.detailGroups, 'currentPhase').value, 'Roof')
    assert.equal(result.view.photoAreas.length, 2)
    assert.equal(result.view.labour.length, 1)
    assert.equal(result.view.plant.length, 1)
    assert.deepEqual(supabase.calls.writes, [])
  })

  it('first-paint view keeps cover path without a signed URL (loading, not absent)', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(result.view.coverPhotoPath, 'user/rep-1/cover.jpg')
    assert.equal(result.view.coverPhotoUrl, null)
    assert.equal(result.view.coverPreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.equal(supabase.calls.createSignedUrl, 0)
  })

  it('review page renders cover from view.coverPhotoUrl inside Project & Report Details', () => {
    const source = readFileSync(viewerPage, 'utf8')
    const detailsIdx = source.indexOf('title="Project & Report Details"')
    const coverLabelIdx = source.indexOf('Cover Photo', detailsIdx)
    const imgIdx = source.indexOf('view.coverPhotoUrl', coverLabelIdx)
    assert.ok(detailsIdx > 0)
    assert.ok(coverLabelIdx > detailsIdx)
    assert.ok(imgIdx > coverLabelIdx)
    assert.match(source, /src=\{view\.coverPhotoUrl\}/)
    assert.match(source, /objectFit:\s*'contain'/)
    assert.doesNotMatch(source, /objectFit:\s*'cover'/)
    assert.match(source, /Loading cover photo…/)
    assert.match(source, /coverPreviewStatus === 'loading'/)
    assert.match(source, /coverPreviewStatus === 'failed'/)
    assert.doesNotMatch(source, /title="Cover Photo"/)
  })

  it('reports a plain-language problem when the diary cannot be opened', async () => {
    const supabase = fakeSupabase({ report: null })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'missing' })
    assert.equal(result.ok, false)
    assert.equal(result.view, null)
    assert.equal(result.sdscSeed, null)
    assert.match(result.message, /saved Site Diary/i)
    assert.doesNotMatch(result.message, /null|undefined|PGRST|SELECT/i)
  })

  it('returns a complete canonical SDSC seed beside the display view; auth may start before company lookup', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.ok(result.sdscSeed)
    assert.ok(supabase.calls.getUser >= 1)
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(result.sdscSeed, key),
        true,
        `expected own-property ${key}`,
      )
      assert.notEqual(result.sdscSeed[key], undefined)
    }
    assert.equal(result.sdscSeed.userId, 'user-1')
    assert.equal(result.sdscSeed.projectId, 'proj-1')
    assert.equal(result.sdscSeed.reportId, 'rep-1')
    assert.equal(result.sdscSeed.projectName, 'Prince Street')
    assert.equal(result.sdscSeed.projectStartDate, '2026-08-01')
    assert.equal(result.sdscSeed.projectPlannedCompletionDate, '2026-09-19')
    assert.equal(result.sdscSeed.projectAddress, '14 High St')
    assert.equal(result.sdscSeed.projectManager, 'Jordan Lee')
    assert.equal(result.sdscSeed.workingDaysPerWeek, '5')
    assert.equal(result.sdscSeed.projectReference, 'JOB-1042')
    assert.equal(result.sdscSeed.reportDate, '2026-08-15')
    assert.equal(result.sdscSeed.shift, 'Day')
    assert.equal(result.sdscSeed.currentPhase, 'Roof')
    assert.equal(result.sdscSeed.author, 'Colin Walker')
    assert.equal(result.sdscSeed.authorRole, 'Site Manager')
    assert.equal(result.sdscSeed.reportingOnBehalfOf, 'Outsource Pro')
    assert.equal(result.sdscSeed.coverStoragePath, 'user/rep-1/cover.jpg')
    assert.doesNotMatch(String(result.sdscSeed.workingDaysPerWeek), /days/i)
    assert.doesNotMatch(String(result.sdscSeed.projectStartDate), /August/)
    assert.doesNotMatch(String(result.sdscSeed.projectPlannedCompletionDate), /September/)
    assert.notEqual(result.sdscSeed.currentPhase, NOT_RECORDED)
    assert.notEqual(result.sdscSeed.projectStartDate, findRow(result.view.detailGroups, 'startDate').value)
    assert.equal(findRow(result.view.detailGroups, 'workingDays').value, '5 days')
    assert.equal(findRow(result.view.detailGroups, 'startDate').value, '1 August 2026')
  })

  it('starts project, auth, labour, plant and photo-row fetches before the report row resolves', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows, delayReportMs: 40 })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    const started = supabase.calls.tablesWhenReportAwaited || []
    assert.ok(started.includes('daily_reports'))
    assert.ok(started.includes('projects'), 'project fetch must not wait for the report row')
    assert.ok(started.includes('report_labour'))
    assert.ok(started.includes('report_plant'))
    assert.ok(started.includes('report_photos'))
    assert.equal(started.includes('company_brandings'), false)
    assert.ok(supabase.calls.authWhenReportAwaited >= 1, 'auth.getUser must start independently of the report row')
    assert.ok(
      supabase.calls.eq.some((call) => call.table === 'report_labour' && call.col === 'report_id' && call.val === 'rep-1'),
    )
    assert.ok(
      supabase.calls.eq.some((call) => call.table === 'report_plant' && call.col === 'report_id' && call.val === 'rep-1'),
    )
    assert.ok(
      supabase.calls.eq.some((call) => call.table === 'report_photos' && call.col === 'report_id' && call.val === 'rep-1'),
    )
  })

  it('rejects a report that does not belong to the route project', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-other', reportId: 'rep-1' })
    assert.equal(result.ok, false)
    assert.equal(result.view, null)
    assert.equal(result.sdscSeed, null)
    assert.equal(result.reason, 'report-not-found')
    assert.match(result.message, /saved Site Diary/i)
  })

  it('keeps labour, plant and photo rows on the first-paint view before thumbnail signing', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(result.view.labour.length, 1)
    assert.equal(result.view.plant.length, 1)
    assert.equal(result.view.photoCount, 3)
    assert.equal(result.view.photoAreas.length, 2)
    assert.equal(supabase.calls.createSignedUrls, 0)

    const photos = allViewPhotos(result.view)
    assert.deepEqual(photos.map((photo) => photo.id), ['ph-1', 'ph-2', 'ph-3'])
    assert.deepEqual(photos.map((photo) => photo.imageUrl), [
      'user/rep-1/1.jpg',
      'user/rep-1/2.jpg',
      'user/rep-1/3.jpg',
    ])
    assert.equal(photos[0].thumbnailPath, 'user/rep-1/1-thumb.jpg')
    assert.equal(photos[0].acceptedDescription, 'Roof felt complete')
    assert.equal(photos[0].rotationDegrees, 90)
    assert.equal(photos[0].assignedTo, 'Roofing Ltd')
    assert.equal(photos[0].preview, null)
    assert.equal(photos[0].thumbnailPreview, null)
    assert.equal(photos[1].preview, null)
    assert.equal(photos[1].thumbnailPreview, null)
  })

  it('does not require signed photo URLs for the complete SDSC seed', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(supabase.calls.createSignedUrls, 0)
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(result.sdscSeed, key), true)
      assert.notEqual(result.sdscSeed[key], undefined)
    }
    assert.equal(result.sdscSeed.coverStoragePath, 'user/rep-1/cover.jpg')
    assert.equal(result.sdscSeed.userId, 'user-1')
  })

  it('first-paint view keeps signature path without a signed URL (loading, not absent)', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(result.view.signaturePath, 'user/rep-1/signature.png')
    assert.equal(result.view.signatureUrl, null)
    assert.equal(result.view.signaturePreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.equal(result.view.coverPhotoUrl, null)
    assert.equal(result.view.coverPreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.equal(supabase.calls.createSignedUrl, 0)
    assert.equal(supabase.calls.createSignedUrls, 0)
  })

  it('applies signed photo thumbnails after first paint without changing ids, paths, captions, rotation or order', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(supabase.calls.createSignedUrls, 0)

    const next = await result.applySignedPhotoThumbnails()
    assert.ok(supabase.calls.createSignedUrls >= 1)

    const first = allViewPhotos(result.view)
    const signed = allViewPhotos(next)
    assert.deepEqual(signed.map((photo) => photo.id), first.map((photo) => photo.id))
    assert.deepEqual(signed.map((photo) => photo.imageUrl), first.map((photo) => photo.imageUrl))
    assert.deepEqual(
      signed.map((photo) => photo.acceptedDescription),
      first.map((photo) => photo.acceptedDescription),
    )
    assert.deepEqual(
      signed.map((photo) => photo.rotationDegrees),
      first.map((photo) => photo.rotationDegrees),
    )
    assert.equal(signed[0].thumbnailPreview, 'https://signed/user/rep-1/1-thumb.jpg')
    assert.equal(signed[0].preview, null)
    assert.equal(signed[1].preview, 'https://signed/user/rep-1/2.jpg')
    assert.equal(next.coverPhotoUrl, result.view.coverPhotoUrl)
    assert.equal(next.signatureUrl, result.view.signatureUrl)
  })

  it('preserves branded reporting-company fields on the complete Edit seed', async () => {
    const branded = {
      id: 'brand-1',
      company_name: 'Acme Reporting Ltd',
      logo_url: 'user/brand/logo.png',
      brand_color: '#112233',
      is_default: true,
    }
    const supabase = fakeSupabase({
      report: { ...savedReport, branding_id: 'brand-1', brand_logo_url: 'user/brand/logo.png', brand_color: '#112233' },
      photos: savedPhotoRows,
      brandings: [branded],
    })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(result.sdscSeed.reportingCompany, 'Acme Reporting Ltd')
    assert.equal(result.sdscSeed.brandingId, 'brand-1')
    assert.equal(result.sdscSeed.brandColor, '#112233')
    assert.equal(result.sdscSeed.logoStoragePath, 'user/brand/logo.png')
    assert.equal(result.sdscSeed.userId, 'user-1')
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(result.sdscSeed, key), true)
    }
  })

  it('thumbnail signing failure after first paint is non-fatal', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)

    supabase.storage.from = () => ({
      createSignedUrl: async () => ({ data: null, error: { message: 'sign failed' } }),
      createSignedUrls: async () => {
        throw new Error('batch sign failed')
      },
    })
    const next = await result.applySignedPhotoThumbnails()
    assert.equal(next.photoCount, result.view.photoCount)
    assert.equal(allViewPhotos(next)[0].id, 'ph-1')
  })

  it('treats a missing cover path as genuinely absent', async () => {
    const supabase = fakeSupabase({
      report: { ...savedReport, cover_photo_url: null },
      photos: savedPhotoRows,
    })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(result.view.coverPhotoPath, null)
    assert.equal(result.view.coverPhotoUrl, null)
    assert.equal(result.view.coverPreviewStatus, SAVED_DIARY_MEDIA_ABSENT)
    const patch = await result.hydrateDisplayMedia.cover()
    assert.equal(patch.coverPreviewStatus, SAVED_DIARY_MEDIA_ABSENT)
    assert.equal(supabase.calls.createSignedUrl, 0)
  })

  it('treats a missing signature path as genuinely absent', async () => {
    const supabase = fakeSupabase({
      report: { ...savedReport, signature_url: null },
      photos: savedPhotoRows,
    })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(result.view.signaturePath, null)
    assert.equal(result.view.signatureUrl, null)
    assert.equal(result.view.signaturePreviewStatus, SAVED_DIARY_MEDIA_ABSENT)
    const patch = await result.hydrateDisplayMedia.signature()
    assert.equal(patch.signaturePreviewStatus, SAVED_DIARY_MEDIA_ABSENT)
  })

  it('failed cover signing becomes the existing failure state, not a full-page reload', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(result.view.coverPreviewStatus, SAVED_DIARY_MEDIA_LOADING)

    supabase.storage.from = () => ({
      createSignedUrl: async () => ({ data: null, error: { message: 'sign failed' } }),
      createSignedUrls: async () => ({ data: [], error: null }),
    })
    const patch = await result.hydrateDisplayMedia.cover()
    assert.equal(patch.coverPhotoUrl, null)
    assert.equal(patch.coverPreviewStatus, SAVED_DIARY_MEDIA_FAILED)
    assert.equal(result.view.labour.length, 1)
    assert.ok(result.sdscSeed)
  })

  it('failed signature signing becomes the existing empty-signature outcome after the attempt', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.view.signaturePreviewStatus, SAVED_DIARY_MEDIA_LOADING)

    supabase.storage.from = () => ({
      createSignedUrl: async () => ({ data: null, error: { message: 'sign failed' } }),
      createSignedUrls: async () => ({ data: [], error: null }),
    })
    const patch = await result.hydrateDisplayMedia.signature()
    assert.equal(patch.signatureUrl, null)
    assert.equal(patch.signaturePreviewStatus, SAVED_DIARY_MEDIA_FAILED)
  })

  it('hydrates cover, signature and photo thumbnails after first paint and they may overlap', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows, delaySignedUrlMs: 30 })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(supabase.calls.createSignedUrl, 0)
    assert.equal(supabase.calls.createSignedUrls, 0)
    assert.ok(result.sdscSeed)

    const coverP = result.hydrateDisplayMedia.cover()
    const signatureP = result.hydrateDisplayMedia.signature()
    const photosP = result.hydrateDisplayMedia.photos()
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.ok(supabase.calls.createSignedUrl >= 1, 'cover/signature signing must start after first paint')
    assert.ok(supabase.calls.createSignedUrls >= 1, 'photo thumbnail signing must overlap cover/signature')

    const [cover, signature, photos] = await Promise.all([coverP, signatureP, photosP])
    assert.equal(cover.coverPhotoUrl, 'https://signed/user/rep-1/cover.jpg')
    assert.equal(cover.coverPreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(signature.signatureUrl, 'https://signed/user/rep-1/signature.png')
    assert.equal(signature.signaturePreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(allViewPhotos({ photoAreas: photos.photoAreas })[0].thumbnailPreview, 'https://signed/user/rep-1/1-thumb.jpg')
  })

  it('post-paint thumbnail hydrate signs thumb/legacy paths only — never Phase C report.jpg', async () => {
    const photos = [
      {
        id: 'ph-c',
        url: 'user/rep-1/photos/p1/report.jpg',
        thumbnail_path: 'user/rep-1/photos/p1/thumb.jpg',
        caption: 'North wall',
        location: 'Roof',
        sequence: 1,
        layout: 'full',
        rotation_degrees: 0,
      },
      {
        id: 'ph-legacy',
        url: 'user/rep-1/legacy.jpg',
        thumbnail_path: null,
        caption: 'Hall',
        location: 'Hall',
        sequence: 2,
        layout: 'full',
        rotation_degrees: 0,
      },
    ]
    const supabase = fakeSupabase({ photos })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, true)
    assert.equal(supabase.calls.createSignedUrl, 0)
    assert.equal(supabase.calls.createSignedUrls, 0)
    assert.deepEqual(supabase.calls.signedBatchPaths, [])

    await result.hydrateDisplayMedia.run()
    assert.ok(supabase.calls.createSignedUrl >= 1, 'cover/signature still hydrate after first paint')
    assert.ok(supabase.calls.createSignedUrls >= 1)
    assert.ok(supabase.calls.signedBatchPaths.includes('user/rep-1/photos/p1/thumb.jpg'))
    assert.ok(supabase.calls.signedBatchPaths.includes('user/rep-1/legacy.jpg'))
    assert.ok(
      !supabase.calls.signedBatchPaths.some((path) => /\/report\.jpg$/i.test(String(path))),
      'Phase C report.jpg must not join the thumbnail signing batch',
    )
    assert.ok(!supabase.calls.signedUrlPaths.some((path) => /\/report\.jpg$/i.test(String(path))))
    assert.match(
      readFileSync(join(root, 'lib/diary-saved-view.js'), 'utf8'),
      /signSavedPhotoGridRows\(photoRows/,
    )
  })

  it('complete SDSC seed exists before background media hydrate', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(supabase.calls.createSignedUrl, 0)
    assert.equal(supabase.calls.createSignedUrls, 0)
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(result.sdscSeed, key), true)
    }
  })

  it('rejected background media fetches do not reject hydrate; siblings still complete; first-paint stays intact', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    const firstPaint = result.view
    assert.equal(firstPaint.coverPreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.equal(firstPaint.signaturePreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.match(readFileSync(join(root, 'lib/diary-saved-view.js'), 'utf8'), /Promise\.allSettled/)

    supabase.storage.from = () => ({
      createSignedUrl: async (path) => {
        if (String(path).includes('signature')) {
          return { data: { signedUrl: `https://signed/${path}` }, error: null }
        }
        throw new TypeError('Failed to fetch')
      },
      createSignedUrls: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const merged = await result.hydrateDisplayMedia.run()
    assert.equal(merged.coverPreviewStatus, SAVED_DIARY_MEDIA_FAILED)
    assert.equal(merged.coverPhotoUrl, null)
    assert.equal(merged.signaturePreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(merged.signatureUrl, 'https://signed/user/rep-1/signature.png')
    assert.equal(allViewPhotos({ photoAreas: merged.photoAreas })[0].id, 'ph-1')
    assert.equal(allViewPhotos({ photoAreas: merged.photoAreas })[0].thumbnailPreview, null)
    assert.equal(result.view, firstPaint)
    assert.equal(result.view.coverPreviewStatus, SAVED_DIARY_MEDIA_LOADING)
    assert.equal(result.view.labour.length, 1)
    assert.ok(result.sdscSeed)
  })

  it('rejected signature fetch does not reject overall hydrate and cover can still succeed', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    supabase.storage.from = () => ({
      createSignedUrl: async (path) => {
        if (String(path).includes('signature')) {
          throw new TypeError('Failed to fetch')
        }
        return { data: { signedUrl: `https://signed/${path}` }, error: null }
      },
      createSignedUrls: async (paths) => ({
        data: (paths || []).map((path) => ({
          path,
          signedUrl: `https://signed/${path}`,
          error: null,
        })),
        error: null,
      }),
    })

    const merged = await result.hydrateDisplayMedia.run()
    assert.equal(merged.signaturePreviewStatus, SAVED_DIARY_MEDIA_FAILED)
    assert.equal(merged.signatureUrl, null)
    assert.equal(merged.coverPreviewStatus, SAVED_DIARY_MEDIA_READY)
    assert.equal(merged.coverPhotoUrl, 'https://signed/user/rep-1/cover.jpg')
    assert.equal(allViewPhotos({ photoAreas: merged.photoAreas })[0].thumbnailPreview, 'https://signed/user/rep-1/1-thumb.jpg')
    assert.equal(result.view.signaturePreviewStatus, SAVED_DIARY_MEDIA_LOADING)
  })

  it('does not suppress a real report-load error', async () => {
    const supabase = fakeSupabase({
      photos: savedPhotoRows,
      reportError: { message: 'permission denied for table daily_reports' },
    })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'report-error')
    assert.match(result.message, /permission denied/)
    assert.equal(result.view, null)
    assert.equal(result.sdscSeed, null)
  })
})

describe('saved diary viewer page — read-only artifact', () => {
  const source = readFileSync(viewerPage, 'utf8')

  it('renders the whole diary in report order on one page', () => {
    let cursor = 0
    for (const section of SAVED_DIARY_SECTION_ORDER) {
      const index = source.indexOf(section, cursor)
      assert.ok(index > 0, `expected section "${section}" in the viewer`)
      cursor = index + section.length
    }
  })

  it('places Cover Photo inside Project & Report Details near the beginning', () => {
    const identityIndex = source.indexOf('This Saved Diary')
    const detailsIndex = source.indexOf('title="Project & Report Details"')
    const coverIndex = source.indexOf('Cover Photo', detailsIndex)
    const weatherIndex = source.indexOf('title="Weather"')
    assert.ok(identityIndex > 0)
    assert.ok(detailsIndex > identityIndex)
    assert.ok(coverIndex > detailsIndex)
    assert.ok(weatherIndex > coverIndex)
    // Standalone Cover Photo section must not return — cover lives in Details.
    assert.doesNotMatch(source, /title="Cover Photo"/)
    const orderDetails = SAVED_DIARY_SECTION_ORDER.indexOf('Project & Report Details')
    const orderCover = SAVED_DIARY_SECTION_ORDER.indexOf('Cover Photo')
    assert.ok(orderDetails >= 0 && orderCover > orderDetails)
  })

  it('keeps a compact identity snapshot with each field once; full Details follow with Cover inside', () => {
    const identityStart = source.indexOf('title="This Saved Diary"')
    const detailsIndex = source.indexOf('title="Project & Report Details"')
    assert.ok(identityStart > 0 && detailsIndex > identityStart)
    const snapshot = source.slice(identityStart, detailsIndex)
    assert.match(snapshot, /label="Project"/)
    assert.match(snapshot, /label="Report Date"/)
    assert.match(snapshot, /reportGroup\?\.rows/)
    assert.match(snapshot, /row\.key !== 'reportDate'/)
    assert.match(snapshot, /row\.key !== 'currentPhase' \|\| row\.recorded/)
    assert.match(snapshot, /label=\{row\.label\}/)
    assert.equal((snapshot.match(/label="Report Date"/g) || []).length, 1)
    assert.doesNotMatch(snapshot, /label="Shift"|label="Project Day"|label="Current Phase"/)
    assert.doesNotMatch(snapshot, /title="Project & Report Details"/)
    assert.doesNotMatch(snapshot, /Cover Photo/)
  })

  it('shows the complete diary without requiring Edit — Edit only changes editability', () => {
    assert.match(source, /title="Weather"/)
    assert.match(source, /title="Labour on Site"/)
    assert.match(source, /title="Photo Evidence"/)
    assert.match(source, /title="Signature"/)
    assert.match(source, /editExistingDiaryHref/)
    assert.match(source, /Edit This Diary/)
    assert.match(source, /mergeSiteDiarySessionSnapshot/)
    assert.match(
      source,
      /mergeSiteDiarySessionSnapshot\(seed\)[\s\S]*?router\.push\(editHref\)/,
    )
    assert.doesNotMatch(source, /await mergeSiteDiarySessionSnapshot/)
    assert.doesNotMatch(source, /runSiteDiaryShadowSetupProof/)
    // Review content is not gated on edit mode or setup-only routing.
    assert.doesNotMatch(source, /isDiaryEditMode|isDiaryViewMode/)
    assert.doesNotMatch(source, /projectAndReportDetailsHref\(view\.projectId, view\.reportId\)/)
  })

  it('has no compose or capture controls', () => {
    assert.doesNotMatch(source, /Add Photo|Take Photo|Upload|Add Another Area|Save Area/)
    assert.doesNotMatch(source, /<input|<textarea|<select|placeholder=/)
    assert.doesNotMatch(source, /Continue to|Save \/ Share|Save Site Diary/)
  })

  it('does not hide the rest of the diary behind a details button', () => {
    assert.doesNotMatch(source, /Review \/ Edit Project & Report Details|Continue to Today/)
    assert.doesNotMatch(source, /Expand|Collapse/)
  })

  it('shows saved photos automatically and never enters the photo composer', () => {
    assert.match(source, /SavedPhotoGrid/)
    assert.doesNotMatch(source, /PhotoWorkspace|AiLocationWalk/)
  })

  it('keeps Back reachable through the long record without freezing the header or diary identity', () => {
    const identity = source.indexOf('This is your saved diary exactly as it was recorded')
    const shell = source.slice(source.lastIndexOf('<PremiumShell', identity), identity)
    assert.match(shell, /stickyBack/)
    assert.match(shell, /backHref=\{savedReportListHref\(\)\}/)
    assert.doesNotMatch(source, /diaryHubHref/)
    assert.doesNotMatch(source, /router\.back\s*\(/)
    assert.doesNotMatch(source, /onBack=/)
    assert.doesNotMatch(source, /clearSavedDiaryListSnapshot/)
    assert.doesNotMatch(source, /title="Saved Site Diary"/)
    // The shell owns the sticky treatment; the viewer must not invent its own chrome.
    assert.doesNotMatch(source, /position: 'sticky'|position: 'fixed'/)
    assert.doesNotMatch(source, /hideModuleNav/)
  })

  it('offers Share Report with workbench primary and Edit This Diary as secondary', () => {
    assert.match(source, /<PrimaryCTA[\s\S]*surface="workbench"/)
    assert.match(source, /Share Report/)
    assert.doesNotMatch(source, /Generate \/ Share PDF|Generate PDF/)
    assert.match(source, /SecondaryButton/)
    assert.match(source, /editExistingDiaryHref/)
    assert.match(source, /Edit This Diary/)
    const pdfIndex = source.indexOf('<PrimaryCTA')
    const editIndex = source.indexOf('<SecondaryButton', pdfIndex)
    assert.ok(pdfIndex > 0 && editIndex > pdfIndex)
    assert.doesNotMatch(source, /EqualChoiceButton/)
  })

  it('offers Use as Basis for New Diary through the established new-diary helper', () => {
    assert.match(source, /Use as Basis for New Diary/)
    assert.match(source, /CopyPlus/)
    assert.match(source, /createTodaysDiaryDraft/)
    assert.match(source, /projectAndReportDetailsHref/)
    const editIndex = source.indexOf('Edit This Diary')
    const basisIndex = source.indexOf('Use as Basis for New Diary')
    assert.ok(basisIndex > editIndex)
    assert.doesNotMatch(source, /diaryFormHref|compose=1/)
  })

  it('offers confirmed Delete Diary with destructive-border treatment, separated from Edit and PDF', () => {
    assert.match(source, /Delete Diary/)
    assert.match(source, /ReportDeletionDialog/)
    assert.match(source, /deleteSiteDiaries/)
    assert.match(source, /savedReportListHref\(\)/)
    assert.match(source, /setDeleteOpen\(true\)/)
    assert.match(source, /<DestructiveButton/)
    assert.match(source, /deleteActionStyle/)
    assert.doesNotMatch(source, /Reviewing does not change this diary/)
    assert.doesNotMatch(source, /Remove this saved diary/)
    const basisIndex = source.indexOf('Use as Basis for New Diary')
    const deleteIndex = source.indexOf('Delete Diary')
    const divider = source.indexOf('borderTop: \'1px solid var(--edge)\'', basisIndex)
    assert.ok(deleteIndex > basisIndex)
    assert.ok(divider > basisIndex && divider < deleteIndex)
  })

  it('generates the current saved report through the established PDF pipeline', () => {
    assert.match(source, /prepareSiteDiaryPdf/)
    assert.match(source, /downloadSiteDiaryPdf/)
    assert.match(
      source,
      /prepareSiteDiaryPdf\(\{[\s\S]*?projectId:\s*view\.projectId,[\s\S]*?reportId:\s*view\.reportId/,
    )
    assert.doesNotMatch(source, /DiaryPdfDocument|@react-pdf\/renderer|pdf\(doc\)/)
  })

  it('Share Report shares a pre-cached File on tap; download only when native file share is unavailable', () => {
    const start = source.indexOf('const handleGeneratePdf')
    const end = source.indexOf('const confirmDeleteDiary')
    assert.ok(start > 0 && end > start)
    const handler = source.slice(start, end)
    assert.match(source, /pdf-cache-hydrate|pdfCacheState|loadShareReadyPdf/)
    assert.match(handler, /fromCache/)
    assert.match(handler, /application\/pdf/)
    assert.match(handler, /if \(canShare\)/)
    assert.match(
      handler,
      /shareSiteDiaryPdfNative\(\{[\s\S]*?file:\s*pdfFile/,
    )
    assert.match(handler, /shareResult\.ok/)
    assert.doesNotMatch(handler, /setPdfStatus\(shareResult\.message/)
    assert.doesNotMatch(handler, /Tap Share Report again/)
    assert.match(handler, /share-failed-no-download/)
    assert.doesNotMatch(handler, /Fall through to download delivery in this same gesture/)
    const shareIdx = handler.indexOf('shareSiteDiaryPdfNative')
    const downloadIdx = handler.indexOf('downloadSiteDiaryPdf')
    assert.ok(shareIdx > 0 && downloadIdx > shareIdx)
    assert.match(handler, /isSecureContext === false/)
    assert.match(handler, /secure connection/)
    assert.doesNotMatch(
      handler,
      /userAgent|Android|iPhone|iPad|iOS|Linux|Windows|macOS|Macintosh/,
    )
    assert.doesNotMatch(handler, /diaryNativeShareUnavailableMessage|More options aren’t available/)
    assert.match(source, /canSharePdfFile/)
    assert.match(source, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(source, /DiaryPdfDocument|@react-pdf\/renderer|pdf\(doc\)/)
  })

  it('keeps Share Report wording and starts timing diagnostics only in development', () => {
    const start = source.indexOf('const handleGeneratePdf')
    const end = source.indexOf('const confirmDeleteDiary')
    const handler = source.slice(start, end)
    const prepareStart = handler.indexOf("if (pdfCacheState === 'missing'")
    const shareReady = handler.indexOf("if (pdfCacheState !== 'ready'")
    const prepareBranch = handler.slice(prepareStart, shareReady)
    assert.match(source, /: 'Share Report'/)
    assert.doesNotMatch(source, /Save & Share/)
    assert.match(
      source,
      /\{process\.env\.NODE_ENV !== 'production' \? <ShareTimingDiagPanel \/> : null\}/,
    )
    assert.match(source, /SHARE TIMING DIAGNOSTIC — TEMPORARY/)
    assert.match(prepareBranch, /startShareTimingRun/)
    assert.match(prepareBranch, /fromPdfCache: false/)
    assert.match(prepareBranch, /prepareSiteDiaryPdf/)
    const runIdx = prepareBranch.indexOf('startShareTimingRun')
    const pdfIdx = prepareBranch.indexOf('prepareSiteDiaryPdf')
    assert.ok(runIdx > 0 && pdfIdx > runIdx)
    assert.match(handler, /fromPdfCache: true/)
    assert.doesNotMatch(handler, /await prepareSiteDiaryPdf\([\s\S]*await prepareSiteDiaryPdf/)
    const hydrate = source.slice(
      source.indexOf('Hydrate durable share-ready PDF'),
      source.indexOf('const handleGeneratePdf'),
    )
    assert.doesNotMatch(hydrate, /startShareTimingRun/)
    assert.doesNotMatch(hydrate, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(source, /migrateLegacyCoverIfNeeded/)
  })

  it('does not regenerate PDF on saved-diary open; hydrates durable cache only', () => {
    assert.match(source, /pdf-cache-hydrate|loadShareReadyPdf|fingerprintFromSavedDiaryView/)
    assert.doesNotMatch(source, /pdf-precache-start/)
    assert.match(source, /Preparing report|pdf-prepare-on-demand/)
  })

    it('never writes on open; Use as Basis uses the established helper; deletion uses the safe RPC', () => {
    assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(/)
    assert.doesNotMatch(source, /\.from\('daily_reports'\)[\s\S]*\.delete\(/)
    assert.match(source, /createTodaysDiaryDraft/)
    assert.match(source, /rpc\('delete_site_diaries'|deleteSiteDiaries/)
  })

  it('releases first paint before cover, signature and photo thumbnail hydrate', () => {
    const start = source.indexOf('const load = async')
    const end = source.indexOf('void load()')
    assert.ok(start > 0 && end > start)
    const load = source.slice(start, end)
    const loadingFalse = load.indexOf('setLoading(false)')
    const hydrateIdx = load.indexOf('hydrate.run')
    assert.ok(loadingFalse > 0)
    assert.ok(hydrateIdx > loadingFalse)
    assert.match(load, /hydrate\.run\(applyPatch\)/)
    assert.doesNotMatch(load, /await hydrate\.run/)
    assert.match(source, /void load\(\)\.catch/)
  })

  it('Edit This Diary remains available before media preview hydrate completes', () => {
    assert.match(source, /Edit This Diary/)
    assert.match(
      source,
      /mergeSiteDiarySessionSnapshot\(seed\)[\s\S]*?router\.push\(editHref\)/,
    )
    assert.doesNotMatch(source, /disabled=\{[^}]*coverPhotoUrl/)
    assert.doesNotMatch(source, /disabled=\{[^}]*signatureUrl/)
    assert.doesNotMatch(source, /disabled=\{[^}]*coverPreviewStatus/)
    assert.doesNotMatch(source, /disabled=\{[^}]*signaturePreviewStatus/)
  })

  it('signed-URL patches do not retrigger full saved-diary load or PDF cache hydrate', () => {
    const loadStart = source.indexOf('}, [projectId, reportId])')
    assert.ok(loadStart > 0)
    assert.match(source, /sharePdfFingerprint/)
    assert.match(source, /\[view\?\.projectId, view\?\.reportId, sharePdfFingerprint\]/)
    assert.doesNotMatch(source, /}, \[view\]\)/)
    assert.match(source, /Loading signature…/)
    assert.match(source, /\)\(\)\.catch/)
  })

  it('Edit This Diary still merges the complete seed then navigates', () => {
    assert.match(
      source,
      /mergeSiteDiarySessionSnapshot\(seed\)[\s\S]*?router\.push\(editHref\)/,
    )
    assert.match(source, /editExistingDiaryHref/)
    assert.doesNotMatch(source, /diaryFormHref|compose=1/)
  })

  it('rejected background media cannot restore page loading, clear the view, or navigate', () => {
    const start = source.indexOf('const load = async')
    const end = source.indexOf('void load()')
    assert.ok(start > 0 && end > start)
    const load = source.slice(start, end)
    assert.equal((load.match(/setLoading\(true\)/g) || []).length, 1)
    assert.match(load, /let painted = false/)
    assert.match(load, /painted = true/)
    assert.match(
      load,
      /setView\(\(current\) => \(current \? \{ \.\.\.current, \.\.\.patch \} : current\)\)/,
    )
    assert.match(load, /hydrate\.run\(applyPatch\)\.catch\(\(\) => \{\}\)/)
    assert.doesNotMatch(load, /await hydrate\.run/)
    assert.match(load, /if \(!cancelled && !painted\) \{\s*sdscSeedRef\.current = null/)
    assert.doesNotMatch(load, /setView\(null\)/)
    assert.doesNotMatch(load, /setView\(\{\}\)/)
    assert.doesNotMatch(load, /router\.(push|replace|back)/)
    assert.doesNotMatch(source, /ensureReportPreview/)
    const loadingTrueAt = load.indexOf('setLoading(true)')
    const paintedAt = load.indexOf('painted = true')
    assert.ok(loadingTrueAt > 0 && paintedAt > loadingTrueAt)
    assert.equal(load.indexOf('setLoading(true)', paintedAt), -1)
  })
})
