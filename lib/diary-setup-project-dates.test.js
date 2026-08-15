import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEW_PROJECT_SENTINEL,
  applyFreshSetupDefaults,
  clearStickyProjectSelection,
  findExistingProjectByName,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
  planProjectDatePersistence,
  preserveSavedProjectDates,
  projectDatesWritePayload,
  projectsSetupSelectColumns,
  showProjectDatesOnSetup,
} from './diary-setup-project-dates.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'

const EXISTING = [
  {
    id: 'proj-old',
    name: 'Site A',
    start_date: '2026-01-01',
    planned_completion_date: '2026-06-30',
    site_address: '1 Old Road',
    client_pm: 'Pat Old',
    working_days_per_week: 5,
    current_phase: 'Foundations',
  },
]

describe('diary setup project dates — persist plan', () => {
  it('creates a new project through diary setup with both dates (insert plan)', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: EXISTING,
      projectName: 'Brand New Site',
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-09-19',
      projectAddress: '25 New Street',
      projectManager: 'Morgan Lee',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'insert')
    assert.equal(plan.projectId, null)
    assert.equal(plan.dates.start_date, '2026-08-01')
    assert.equal(plan.dates.planned_completion_date, '2026-09-19')
    assert.equal(plan.fields.site_address, '25 New Street')
    assert.equal(plan.fields.client_pm, 'Morgan Lee')
    assert.equal(plan.fields.working_days_per_week, 5)
    assert.equal(plan.name, 'Brand New Site')
  })

  it('project write payload contains both columns for the projects row', () => {
    assert.deepEqual(
      projectDatesWritePayload('2026-08-01', '2026-09-19'),
      { start_date: '2026-08-01', planned_completion_date: '2026-09-19' },
    )
  })

  it('updates an existing selected project instead of inserting a duplicate', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-02-01',
      plannedCompletionDate: '2026-07-01',
      projectAddress: '1 Old Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.projectId, 'proj-old')
    assert.equal(plan.dates.start_date, '2026-02-01')
    assert.equal(plan.dates.planned_completion_date, '2026-07-01')
  })

  it('reuses an existing project when programme dates and sticky fields are unchanged', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-06-30',
      projectAddress: '1 Old Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.projectId, 'proj-old')
  })

  it('updates existing project when sticky fields change without creating a duplicate', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-06-30',
      projectAddress: '99 New Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.projectId, 'proj-old')
    assert.equal(plan.fields.site_address, '99 New Road')
    assert.equal(Object.prototype.hasOwnProperty.call(plan.fields, 'current_phase'), false)
  })

  it('diary-specific Current Phase does not update the project', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    const plan = planProjectDatePersistence({
      selectedProjectId: merged.selectedProjectId,
      existingProjects: EXISTING,
      projectName: merged.projectName,
      startDate: merged.projectStartDate,
      plannedCompletionDate: merged.projectPlannedCompletionDate,
      projectAddress: merged.projectAddress,
      projectManager: merged.projectManager,
      workingDaysPerWeek: merged.workingDaysPerWeek,
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.fields.client_pm, 'Pat Old')
    assert.equal(Object.prototype.hasOwnProperty.call(plan.fields, 'current_phase'), false)
  })

  it('same-name match updates that row and does not discard dates', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: EXISTING,
      projectName: 'site a',
      startDate: '2026-03-01',
      plannedCompletionDate: '2026-08-01',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.projectId, 'proj-old')
    assert.equal(plan.dates.start_date, '2026-03-01')
    assert.equal(plan.dates.planned_completion_date, '2026-08-01')
  })
})

describe('diary setup project dates — reload / Project & Report Details', () => {
  it('SELECT list includes programme dates and sticky columns', () => {
    const cols = projectsSetupSelectColumns()
    assert.match(cols, /start_date/)
    assert.match(cols, /planned_completion_date/)
    assert.match(cols, /site_address/)
    assert.match(cols, /client_pm/)
    assert.match(cols, /working_days_per_week/)
    assert.doesNotMatch(cols, /current_phase/)
    assert.match(cols, /project_reference/)
  })

  it('hydrates both dates from a linked project row into report details', () => {
    const dates = hydrateProjectDatesFromRow({
      id: 'proj-1',
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    })
    assert.deepEqual(dates, {
      projectStartDate: '2026-08-01',
      projectPlannedCompletionDate: '2026-09-19',
    })
  })

  it('retains project_id, dates, and sticky fields when merging into setup state', () => {
    const merged = mergeProjectIntoSetupState(
      {
        selectedProjectId: NEW_PROJECT_SENTINEL,
        projectName: '',
        projectStartDate: '',
        projectPlannedCompletionDate: '',
        author: 'Alex',
        currentPhase: 'Diary phase',
      },
      {
        id: 'proj-1',
        name: 'Site B',
        start_date: '2026-08-01',
        planned_completion_date: '2026-09-19',
        site_address: '14 High St',
        client_pm: 'Jordan Lee',
        working_days_per_week: 5,
        current_phase: 'Groundworks',
        project_reference: 'REF-1',
      },
    )
    assert.equal(merged.selectedProjectId, 'proj-1')
    assert.equal(merged.projectName, 'Site B')
    assert.equal(merged.projectStartDate, '2026-08-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-09-19')
    assert.equal(merged.projectAddress, '14 High St')
    assert.equal(merged.projectManager, 'Jordan Lee')
    assert.equal(merged.workingDaysPerWeek, '5')
    assert.equal(merged.currentPhase, 'Diary phase')
    assert.equal(merged.projectReference, 'REF-1')
    assert.equal(merged.author, 'Alex')
  })

  it('selecting an existing project with saved dates populates the form', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    assert.equal(merged.selectedProjectId, 'proj-old')
    assert.equal(merged.projectStartDate, '2026-01-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-06-30')
    assert.equal(merged.projectAddress, '1 Old Road')
    assert.equal(merged.projectManager, 'Pat Old')
    assert.equal(merged.workingDaysPerWeek, '5')
  })

  it('existing project with no saved Working Days stays blank instead of taking the new-project default', () => {
    const merged = mergeProjectIntoSetupState(
      { workingDaysPerWeek: '5' },
      { id: 'proj-no-days', name: 'No Days', working_days_per_week: null },
    )
    assert.equal(merged.workingDaysPerWeek, '')
  })

  it('New project selection clears project values without wiping diary fields', () => {
    const cleared = clearStickyProjectSelection({
      selectedProjectId: 'proj-old',
      projectName: 'Site A',
      projectStartDate: '2026-01-01',
      projectPlannedCompletionDate: '2026-06-30',
      projectAddress: '1 Old Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
      currentPhase: 'Foundations',
      author: 'Alex',
      reportingOnBehalfOf: 'Acme',
      reportDate: '2026-08-06',
    })
    assert.equal(cleared.selectedProjectId, NEW_PROJECT_SENTINEL)
    assert.equal(cleared.projectName, '')
    assert.equal(cleared.projectAddress, '')
    assert.equal(cleared.projectManager, '')
    assert.equal(cleared.workingDaysPerWeek, '5')
    assert.equal(cleared.currentPhase, 'Foundations')
    assert.equal(cleared.projectStartDate, '')
    assert.equal(cleared.projectPlannedCompletionDate, '')
    assert.equal(cleared.author, 'Alex')
    assert.equal(cleared.reportingOnBehalfOf, 'Acme')
    assert.equal(cleared.reportDate, '2026-08-06')
  })

  it('refresh / second merge keeps the same date values', () => {
    const first = mergeProjectIntoSetupState({}, {
      id: 'proj-1',
      name: 'Site B',
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    })
    const second = mergeProjectIntoSetupState(first, {
      id: 'proj-1',
      name: 'Site B',
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    })
    assert.equal(second.projectStartDate, '2026-08-01')
    assert.equal(second.projectPlannedCompletionDate, '2026-09-19')
  })

  it('async fresh defaults do not blank programme dates already loaded', () => {
    const loaded = mergeProjectIntoSetupState(
      { author: '', reportingOnBehalfOf: '', reportDate: '' },
      {
        id: 'proj-1',
        name: 'Site B',
        start_date: '2026-08-01',
        planned_completion_date: '2026-09-19',
      },
    )
    const afterDefaults = applyFreshSetupDefaults(loaded, {
      author: 'Default Author',
      reportingOnBehalfOf: 'Acme',
      reportDate: '2026-08-06',
    })
    assert.equal(afterDefaults.projectStartDate, '2026-08-01')
    assert.equal(afterDefaults.projectPlannedCompletionDate, '2026-09-19')
    assert.equal(afterDefaults.author, 'Default Author')
  })

  it('date controls remain part of setup for existing projects (not new-only)', () => {
    assert.equal(showProjectDatesOnSetup(), true)
  })
})

describe('project dates are project-level and always travel together', () => {
  it('existing project hydrates Start Date and Planned Completion Date together', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    assert.equal(merged.projectStartDate, '2026-01-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-06-30')
  })

  it('project with no saved dates hydrates both as blank', () => {
    const merged = mergeProjectIntoSetupState({}, { id: 'proj-blank', name: 'Blank Site' })
    assert.equal(merged.projectStartDate, '')
    assert.equal(merged.projectPlannedCompletionDate, '')
  })

  it('new project starts blank and saves both dates against that project', () => {
    const blank = clearStickyProjectSelection({ selectedProjectId: 'proj-old' })
    assert.equal(blank.projectStartDate, '')
    assert.equal(blank.projectPlannedCompletionDate, '')

    const plan = planProjectDatePersistence({
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: EXISTING,
      projectName: 'Riverside Depot',
      startDate: '2026-09-01',
      plannedCompletionDate: '2027-03-31',
    })
    assert.equal(plan.mode, 'insert')
    assert.equal(plan.fields.start_date, '2026-09-01')
    assert.equal(plan.fields.planned_completion_date, '2027-03-31')
  })

  it('new diary on the same project reuses the row and keeps both saved dates', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    const plan = planProjectDatePersistence({
      selectedProjectId: merged.selectedProjectId,
      existingProjects: EXISTING,
      projectName: merged.projectName,
      startDate: merged.projectStartDate,
      plannedCompletionDate: merged.projectPlannedCompletionDate,
      projectAddress: merged.projectAddress,
      projectManager: merged.projectManager,
      workingDaysPerWeek: merged.workingDaysPerWeek,
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.fields.start_date, '2026-01-01')
    assert.equal(plan.fields.planned_completion_date, '2026-06-30')
  })

  it('a blank Planned Completion Date on setup never erases the saved project date', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-01-01',
      plannedCompletionDate: '',
      projectAddress: '1 Old Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.fields.planned_completion_date, '2026-06-30')
  })

  it('a blank Start Date on setup never erases the saved project date', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '',
      plannedCompletionDate: '2026-06-30',
      projectAddress: '1 Old Road',
      projectManager: 'Pat Old',
      workingDaysPerWeek: '5',
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.fields.start_date, '2026-01-01')
  })

  it('blank diary fields cannot erase persistent project details', () => {
    const project = {
      ...EXISTING[0],
      project_reference: 'REF-77',
    }
    const plan = planProjectDatePersistence({
      selectedProjectId: project.id,
      existingProjects: [project],
      projectName: project.name,
      startDate: '',
      plannedCompletionDate: '',
      projectAddress: '',
      projectManager: '',
      workingDaysPerWeek: '',
      projectReference: '',
    })
    assert.equal(plan.mode, 'reuse')
    assert.deepEqual(
      {
        start_date: plan.fields.start_date,
        planned_completion_date: plan.fields.planned_completion_date,
        site_address: plan.fields.site_address,
        client_pm: plan.fields.client_pm,
        working_days_per_week: plan.fields.working_days_per_week,
        project_reference: plan.fields.project_reference,
      },
      {
        start_date: '2026-01-01',
        planned_completion_date: '2026-06-30',
        site_address: '1 Old Road',
        client_pm: 'Pat Old',
        working_days_per_week: 5,
        project_reference: 'REF-77',
      },
    )
  })

  it('editing a date still writes the new value for both dates', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-02-01',
      plannedCompletionDate: '2026-07-15',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.fields.start_date, '2026-02-01')
    assert.equal(plan.fields.planned_completion_date, '2026-07-15')
  })

  it('preserve helper leaves a brand-new project untouched', () => {
    const typed = projectDatesWritePayload('', '')
    assert.deepEqual(preserveSavedProjectDates(typed, null), {
      start_date: null,
      planned_completion_date: null,
    })
  })

  it('typing an existing project name in any case resolves the same project row', () => {
    assert.equal(findExistingProjectByName(EXISTING, ' site a ')?.id, 'proj-old')
    assert.equal(findExistingProjectByName(EXISTING, 'Site A')?.id, 'proj-old')
    assert.equal(findExistingProjectByName(EXISTING, 'Site B'), null)
    assert.equal(findExistingProjectByName(EXISTING, '   '), null)

    // Setup hydration uses the same matcher, so a differently-cased name still
    // fills both dates before Continue can write the project row.
    const merged = mergeProjectIntoSetupState({}, findExistingProjectByName(EXISTING, 'site a'))
    assert.equal(merged.projectStartDate, '2026-01-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-06-30')
  })

  it('switching to New project does not carry either date from the previous project', () => {
    const cleared = clearStickyProjectSelection(mergeProjectIntoSetupState({}, EXISTING[0]))
    const plan = planProjectDatePersistence({
      selectedProjectId: cleared.selectedProjectId,
      existingProjects: EXISTING,
      projectName: 'Northgate Works',
      startDate: cleared.projectStartDate,
      plannedCompletionDate: cleared.projectPlannedCompletionDate,
    })
    assert.equal(plan.mode, 'insert')
    assert.equal(plan.fields.start_date, null)
    assert.equal(plan.fields.planned_completion_date, null)
  })
})

describe('new diary setup — project-level hydration is all-or-nothing', () => {
  // Shaped like a live projects row that holds every project-level value.
  const FULL_PROJECT = {
    id: 'proj-full',
    name: 'Queens Street',
    start_date: '2026-02-14',
    planned_completion_date: '2026-08-15',
    site_address: 'Manchester',
    client_pm: 'John Kingswell',
    working_days_per_week: 5,
    project_reference: '3333333',
  }

  it('the setup fetch asks for every project-level column', () => {
    const columns = projectsSetupSelectColumns()
      .split(',')
      .map((c) => c.trim())
    for (const column of [
      'name',
      'site_address',
      'client_pm',
      'working_days_per_week',
      'start_date',
      'planned_completion_date',
      'project_reference',
    ]) {
      assert.ok(columns.includes(column), `setup select is missing ${column}`)
    }
  })

  it('a new diary on a fully populated project shows all seven project fields', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      authorRole: 'Site Manager',
      reportDate: '2026-08-15',
      existingProject: FULL_PROJECT,
    })

    assert.deepEqual(
      {
        projectName: state.projectName,
        projectAddress: state.projectAddress,
        projectManager: state.projectManager,
        workingDaysPerWeek: state.workingDaysPerWeek,
        projectStartDate: state.projectStartDate,
        projectPlannedCompletionDate: state.projectPlannedCompletionDate,
        projectReference: state.projectReference,
      },
      {
        projectName: 'Queens Street',
        projectAddress: 'Manchester',
        projectManager: 'John Kingswell',
        workingDaysPerWeek: '5',
        projectStartDate: '2026-02-14',
        projectPlannedCompletionDate: '2026-08-15',
        projectReference: '3333333',
      },
    )

    // Report Date stays the new diary's own date, never the project programme.
    assert.equal(state.reportDate, '2026-08-15')
  })

  it('a stored Planned Completion Date and Project Reference survive an untouched save', () => {
    const state = initialiseNewDiarySetupState({
      reportDate: '2026-08-15',
      existingProject: FULL_PROJECT,
    })
    const plan = planProjectDatePersistence({
      selectedProjectId: state.selectedProjectId,
      existingProjects: [FULL_PROJECT],
      projectName: state.projectName,
      startDate: state.projectStartDate,
      plannedCompletionDate: state.projectPlannedCompletionDate,
      projectAddress: state.projectAddress,
      projectManager: state.projectManager,
      workingDaysPerWeek: state.workingDaysPerWeek,
      projectReference: state.projectReference,
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.fields.planned_completion_date, '2026-08-15')
    assert.equal(plan.fields.project_reference, '3333333')
  })

  it('a project row without those values hydrates blank instead of inventing data', () => {
    // Shaped like a live row that only ever stored a start date.
    const partial = {
      id: 'proj-partial',
      name: 'Prince Street',
      start_date: '2025-12-22',
      planned_completion_date: null,
      site_address: 'Edinburgh',
      client_pm: 'S Haugh',
      working_days_per_week: 5,
      project_reference: null,
    }
    const state = initialiseNewDiarySetupState({
      reportDate: '2026-08-15',
      existingProject: partial,
    })

    assert.equal(state.projectStartDate, '2025-12-22')
    assert.equal(state.projectAddress, 'Edinburgh')
    assert.equal(state.projectManager, 'S Haugh')
    assert.equal(state.projectPlannedCompletionDate, '')
    assert.equal(state.projectReference, '')
  })
})
