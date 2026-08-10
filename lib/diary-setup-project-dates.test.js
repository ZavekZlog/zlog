import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEW_PROJECT_SENTINEL,
  applyFreshSetupDefaults,
  clearStickyProjectSelection,
  hydrateProjectDatesFromRow,
  mergeProjectIntoSetupState,
  planProjectDatePersistence,
  projectDatesWritePayload,
  projectsSetupSelectColumns,
  showProjectDatesOnSetup,
} from './diary-setup-project-dates.js'

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
    })
    assert.equal(plan.mode, 'insert')
    assert.equal(plan.projectId, null)
    assert.equal(plan.dates.start_date, '2026-08-01')
    assert.equal(plan.dates.planned_completion_date, '2026-09-19')
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
      currentPhase: 'Foundations',
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
      currentPhase: 'Foundations',
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
      currentPhase: 'Superstructure',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.projectId, 'proj-old')
    assert.equal(plan.fields.site_address, '99 New Road')
    assert.equal(plan.fields.current_phase, 'Superstructure')
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

describe('diary setup project dates — reload / Edit Report Details', () => {
  it('SELECT list includes programme dates and sticky columns', () => {
    const cols = projectsSetupSelectColumns()
    assert.match(cols, /start_date/)
    assert.match(cols, /planned_completion_date/)
    assert.match(cols, /site_address/)
    assert.match(cols, /client_pm/)
    assert.match(cols, /working_days_per_week/)
    assert.match(cols, /current_phase/)
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
      },
    )
    assert.equal(merged.selectedProjectId, 'proj-1')
    assert.equal(merged.projectName, 'Site B')
    assert.equal(merged.projectStartDate, '2026-08-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-09-19')
    assert.equal(merged.projectAddress, '14 High St')
    assert.equal(merged.projectManager, 'Jordan Lee')
    assert.equal(merged.workingDaysPerWeek, '5')
    assert.equal(merged.currentPhase, 'Groundworks')
    assert.equal(merged.author, 'Alex')
  })

  it('selecting an existing project with saved dates populates the form', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    assert.equal(merged.selectedProjectId, 'proj-old')
    assert.equal(merged.projectStartDate, '2026-01-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-06-30')
    assert.equal(merged.projectAddress, '1 Old Road')
    assert.equal(merged.projectManager, 'Pat Old')
  })

  it('New project selection clears sticky values without wiping author', () => {
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
    assert.equal(cleared.workingDaysPerWeek, '')
    assert.equal(cleared.currentPhase, '')
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
