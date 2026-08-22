import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NOT_RECORDED,
  SAVED_DIARY_SECTION_ORDER,
  buildSavedDiaryView,
  loadSavedDiaryView,
  savedDiaryDetailGroups,
  savedDiaryPhotoAreas,
  totalLabourOnSite,
} from './diary-saved-view.js'

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

/** Minimal Supabase double covering only the reads the viewer performs. */
function fakeSupabase({ report = savedReport, project = savedProject, photos = [] } = {}) {
  const calls = { writes: [], tables: [] }

  const listBuilder = (rows) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => ({ data: rows, error: null }),
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    }
    return builder
  }

  const reportBuilder = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: report, error: null }),
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
      eq: () => builder,
      maybeSingle: async () => ({ data: project, error: null }),
    }
    return builder
  }

  return {
    calls,
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    storage: {
      from: () => ({
        createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
      }),
    },
    from(table) {
      calls.tables.push(table)
      if (table === 'daily_reports') return reportBuilder()
      if (table === 'projects') return projectBuilder()
      if (table === 'report_photos') return listBuilder(photos)
      if (table === 'report_labour') {
        return listBuilder([{ trade: 'Groundworks', company: 'Acme', count: 6, hours: 8, notes: '' }])
      }
      if (table === 'report_plant') {
        return listBuilder([{ item: 'Excavator', ref: 'EX-1', status: 'On site', notes: '' }])
      }
      if (table === 'company_brandings') return listBuilder([])
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

  it('persisted cover_photo_url is signed and returned for read-only review', async () => {
    const supabase = fakeSupabase({ photos: savedPhotoRows })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'rep-1' })

    assert.equal(result.ok, true)
    assert.equal(result.view.coverPhotoPath, 'user/rep-1/cover.jpg')
    assert.equal(result.view.coverPhotoUrl, 'https://signed/user/rep-1/cover.jpg')
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
    assert.doesNotMatch(source, /title="Cover Photo"/)
  })

  it('reports a plain-language problem when the diary cannot be opened', async () => {
    const supabase = fakeSupabase({ report: null })
    const result = await loadSavedDiaryView(supabase, { projectId: 'proj-1', reportId: 'missing' })
    assert.equal(result.ok, false)
    assert.equal(result.view, null)
    assert.match(result.message, /saved Site Diary/i)
    assert.doesNotMatch(result.message, /null|undefined|PGRST|SELECT/i)
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
    assert.match(shell, /backHref=\{diaryHubHref\(\)\}/)
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

  it('Share Report shares the prepared File natively, with download only as fallback', () => {
    const start = source.indexOf('const handleGeneratePdf')
    const end = source.indexOf('const confirmDeleteDiary')
    assert.ok(start > 0 && end > start)
    const handler = source.slice(start, end)
    assert.match(handler, /new File\(/)
    assert.match(handler, /type: 'application\/pdf'/)
    assert.match(handler, /if \(canSharePdfFile\(pdfFile\)\)/)
    assert.match(
      handler,
      /shareSiteDiaryPdfNative\(\{[\s\S]*?file:\s*pdfFile/,
    )
    assert.match(handler, /shareResult\.ok/)
    assert.doesNotMatch(handler, /setPdfStatus\(shareResult\.message/)
    assert.doesNotMatch(handler, /Tap Share Report again/)
    assert.match(handler, /Fall through to download delivery in this same gesture/)
    const shareIdx = handler.indexOf('shareSiteDiaryPdfNative')
    const downloadIdx = handler.indexOf('downloadSiteDiaryPdf')
    assert.ok(shareIdx > 0 && downloadIdx > shareIdx)
    assert.match(handler, /window\.isSecureContext === false/)
    assert.match(handler, /Sharing needs a secure connection\. The PDF has been saved instead\./)
    assert.doesNotMatch(
      handler,
      /userAgent|Android|iPhone|iPad|iOS|Linux|Windows|macOS|Macintosh/,
    )
    assert.doesNotMatch(handler, /diaryNativeShareUnavailableMessage|More options aren’t available/)
    assert.match(source, /canSharePdfFile/)
    assert.match(source, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(source, /DiaryPdfDocument|@react-pdf\/renderer|pdf\(doc\)/)
  })

  it('never writes on open; Use as Basis uses the established helper; deletion uses the safe RPC', () => {
    assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(/)
    assert.doesNotMatch(source, /\.from\('daily_reports'\)[\s\S]*\.delete\(/)
    assert.match(source, /createTodaysDiaryDraft/)
    assert.match(source, /rpc\('delete_site_diaries'|deleteSiteDiaries/)
  })
})
