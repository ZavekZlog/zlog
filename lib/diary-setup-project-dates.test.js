import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEW_PROJECT_SENTINEL,
  applyFreshSetupDefaults,
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
    assert.deepEqual(plan.dates, {
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    })
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
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.projectId, 'proj-old')
    assert.deepEqual(plan.dates, {
      start_date: '2026-02-01',
      planned_completion_date: '2026-07-01',
    })
  })

  it('reuses an existing project when programme dates are unchanged', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-old',
      existingProjects: EXISTING,
      projectName: 'Site A',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-06-30',
    })
    assert.equal(plan.mode, 'reuse')
    assert.equal(plan.projectId, 'proj-old')
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
  it('SELECT list includes start_date and planned_completion_date', () => {
    const cols = projectsSetupSelectColumns()
    assert.match(cols, /start_date/)
    assert.match(cols, /planned_completion_date/)
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

  it('retains project_id and dates when merging into setup state (reload)', () => {
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
      },
    )
    assert.equal(merged.selectedProjectId, 'proj-1')
    assert.equal(merged.projectName, 'Site B')
    assert.equal(merged.projectStartDate, '2026-08-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-09-19')
    assert.equal(merged.author, 'Alex')
  })

  it('selecting an existing project with saved dates populates the form', () => {
    const merged = mergeProjectIntoSetupState({}, EXISTING[0])
    assert.equal(merged.selectedProjectId, 'proj-old')
    assert.equal(merged.projectStartDate, '2026-01-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-06-30')
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
