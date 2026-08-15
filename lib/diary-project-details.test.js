import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaryLinkedProjectSelectColumns,
  diaryProjectSelectorSelectColumns,
  diaryRetainsProjectId,
  programmeDatesForProjectDetails,
} from './diary-project-details.js'

describe('diary programme view model — dates and Project Day', () => {
  it('linked project and selector SELECT include programme dates and sticky columns', () => {
    for (const cols of [diaryLinkedProjectSelectColumns(), diaryProjectSelectorSelectColumns()]) {
      assert.match(cols, /start_date/)
      assert.match(cols, /planned_completion_date/)
      assert.match(cols, /site_address/)
      assert.match(cols, /client_pm/)
      assert.match(cols, /working_days_per_week/)
      assert.doesNotMatch(cols, /current_phase/)
    }
  })

  it('programme view model returns sticky fields, dates, and Project Day in order', () => {
    const view = programmeDatesForProjectDetails(
      {
        id: 'proj-1',
        site_address: '14 High St',
        client_pm: 'Jordan Lee',
        working_days_per_week: 5,
        current_phase: 'Groundworks',
        start_date: '2026-08-01',
        planned_completion_date: '2026-09-19',
      },
      '2026-08-17',
    )
    assert.equal(view.status, 'set')
    assert.deepEqual(view.stickyRows.map((r) => r.label), ['Project Address', 'Project Manager'])
    assert.equal(view.startDisplay, '1 August 2026')
    assert.equal(view.plannedCompletionDisplay, '19 September 2026')
    assert.deepEqual(view.afterDateStickyRows.map((r) => r.label), [
      'Working Days Per Week',
    ])
    assert.equal(view.afterDateStickyRows[0].value, '5 days')
    assert.equal(view.projectDayLine, 'Project Day: 17 of 50')
    assert.equal(view.missingMessage, null)
  })

  it('empty sticky fields are omitted from the programme view model', () => {
    const view = programmeDatesForProjectDetails(
      {
        id: 'proj-1',
        site_address: null,
        client_pm: '',
        working_days_per_week: null,
        current_phase: null,
        start_date: '2026-08-01',
        planned_completion_date: '2026-09-19',
      },
      '2026-08-01',
    )
    assert.equal(view.stickyRows.length, 0)
    assert.equal(view.afterDateStickyRows.length, 0)
    assert.equal(view.projectDayLine, 'Project Day: 1 of 50')
  })

  it('refresh / reopen keeps the same programme view model values', () => {
    const row = {
      id: 'proj-1',
      site_address: '14 High St',
      client_pm: 'Jordan Lee',
      working_days_per_week: 5,
      current_phase: 'Groundworks',
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    }
    const first = programmeDatesForProjectDetails(row, '2026-08-06')
    const second = programmeDatesForProjectDetails(row, '2026-08-06')
    assert.deepEqual(first, second)
  })

  it('project without dates shows Project dates not set', () => {
    const view = programmeDatesForProjectDetails({ id: 'proj-2', name: 'Bare Site' })
    assert.equal(view.status, 'missing')
    assert.equal(view.missingMessage, 'Project dates not set')
    assert.equal(view.projectDayLine, null)
  })

  it('only one date set shows available value and marks the other not set', () => {
    const onlyStart = programmeDatesForProjectDetails({
      start_date: '2026-08-01',
      planned_completion_date: null,
    })
    assert.equal(onlyStart.status, 'partial')
    assert.equal(onlyStart.startDisplay, '1 August 2026')
    assert.equal(onlyStart.startNotSet, false)
    assert.equal(onlyStart.plannedCompletionNotSet, true)
    assert.equal(onlyStart.plannedCompletionDisplay, null)
    assert.equal(onlyStart.projectDayLine, null)

    const onlyEnd = programmeDatesForProjectDetails({
      start_date: '',
      planned_completion_date: '2026-09-19',
    })
    assert.equal(onlyEnd.status, 'partial')
    assert.equal(onlyEnd.plannedCompletionDisplay, '19 September 2026')
    assert.equal(onlyEnd.startNotSet, true)
  })

  it('diary retains project_id; selector still keyed by project id', () => {
    assert.equal(
      diaryRetainsProjectId({ id: 'rep-1', project_id: 'proj-1' }, 'proj-1'),
      true,
    )
    const selectorCols = diaryProjectSelectorSelectColumns()
    assert.match(selectorCols, /^id, name/)
  })

  it('saved diary linked to project with both dates → card contract', () => {
    const project = {
      id: 'proj-new',
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
      site_address: '14 High St',
      client_pm: 'Jordan Lee',
    }
    const diary = { id: 'rep-new', project_id: project.id }
    assert.equal(diaryRetainsProjectId(diary, project.id), true)
    const card = programmeDatesForProjectDetails(project, '2026-08-01')
    assert.equal(card.status, 'set')
    assert.equal(card.projectDayLine, 'Project Day: 1 of 50')
    assert.equal(card.stickyRows[0].value, '14 High St')
  })
})
