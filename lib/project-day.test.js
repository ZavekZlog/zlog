import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calendarDaysBetween,
  computeProjectDay,
  formatDateOnly,
  inclusiveCalendarDays,
  parseDateOnly,
  pluralDays,
  todayDateOnly,
  toDateColumnValue,
  toDateInputValue,
  validateProjectDates,
} from './project-day.js'

describe('parseDateOnly / timezone safety', () => {
  it('parses YYYY-MM-DD without UTC midnight shift', () => {
    const p = parseDateOnly('2026-08-01')
    assert.deepEqual(p, { y: 2026, m: 8, d: 1 })
    assert.equal(formatDateOnly(p), '2026-08-01')
  })

  it('rejects invalid calendar dates', () => {
    assert.equal(parseDateOnly('2023-02-29'), null)
    assert.equal(parseDateOnly('not-a-date'), null)
  })

  it('todayDateOnly matches local calendar components', () => {
    const fixed = new Date(2026, 7, 6, 23, 30, 0) // local 6 Aug evening
    assert.equal(todayDateOnly(fixed), '2026-08-06')
  })

  it('toDateInputValue / toDateColumnValue round-trip stored dates', () => {
    assert.equal(toDateInputValue('2026-08-01'), '2026-08-01')
    assert.equal(toDateInputValue('2026-08-01T00:00:00.000Z'), '2026-08-01')
    assert.equal(toDateInputValue(null), '')
    assert.equal(toDateColumnValue('2026-08-01'), '2026-08-01')
    assert.equal(toDateColumnValue(''), null)
  })
})

describe('inclusive totals and Day 1', () => {
  it('start date equals Day 1', () => {
    const r = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-09-19',
      asOfDate: '2026-08-01',
    })
    assert.equal(r.status, 'in_progress')
    assert.equal(r.currentDay, 1)
    assert.equal(r.headline, 'Project Day: 1 of 50')
  })

  it('inclusive total-day calculation (50 calendar days)', () => {
    const start = parseDateOnly('2026-08-01')
    const end = parseDateOnly('2026-09-19')
    assert.equal(inclusiveCalendarDays(start, end), 50)
  })

  it('one-day project', () => {
    const r = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-08-01',
      asOfDate: '2026-08-01',
    })
    assert.equal(r.totalDays, 1)
    assert.equal(r.currentDay, 1)
    assert.equal(r.headline, 'Project Day: 1 of 1')
    assert.equal(r.plannedDaysRemaining, 0)
  })

  it('leap-year date range', () => {
    // 2024-02-28 through 2024-03-01 inclusive = 3 days (28, 29, 1)
    assert.equal(
      inclusiveCalendarDays(parseDateOnly('2024-02-28'), parseDateOnly('2024-03-01')),
      3,
    )
    const r = computeProjectDay({
      startDate: '2024-02-28',
      plannedCompletionDate: '2024-03-01',
      asOfDate: '2024-02-29',
    })
    assert.equal(r.currentDay, 2)
    assert.equal(r.totalDays, 3)
  })
})

describe('mid-project and edges', () => {
  it('normal mid-project date (Day 17 of 50)', () => {
    const r = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-09-19',
      asOfDate: '2026-08-17',
    })
    assert.equal(r.status, 'in_progress')
    assert.equal(r.currentDay, 17)
    assert.equal(r.totalDays, 50)
    assert.equal(r.plannedDaysRemaining, 33)
    assert.equal(r.headline, 'Project Day: 17 of 50')
  })

  it('report date before project start', () => {
    const r = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-09-19',
      asOfDate: '2026-07-25',
    })
    assert.equal(r.status, 'before_start')
    assert.equal(r.daysUntilStart, 7)
    assert.equal(r.headline, 'Project starts in 7 days')
  })

  it('report date after planned completion', () => {
    const r = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-09-19',
      asOfDate: '2026-09-24',
    })
    assert.equal(r.status, 'beyond')
    assert.equal(r.currentDay, 55)
    assert.equal(r.totalDays, 50)
    assert.equal(r.daysBeyond, 5)
    assert.equal(r.headline, 'Project Day: 55 of 50')
    assert.equal(r.detail, '5 days beyond planned completion')
  })

  it('missing dates', () => {
    const r = computeProjectDay({
      startDate: null,
      plannedCompletionDate: '2026-09-19',
      asOfDate: '2026-08-17',
    })
    assert.equal(r.status, 'missing')
    assert.equal(r.headline, 'Project dates not set')
  })

  it('completion date earlier than start date', () => {
    const v = validateProjectDates('2026-08-10', '2026-08-01')
    assert.equal(v.ok, false)
    assert.match(v.message, /cannot be earlier/i)
    const r = computeProjectDay({
      startDate: '2026-08-10',
      plannedCompletionDate: '2026-08-01',
      asOfDate: '2026-08-05',
    })
    assert.equal(r.status, 'invalid_range')
  })
})

describe('wording', () => {
  it('correct singular/plural wording', () => {
    assert.equal(pluralDays(1), '1 day')
    assert.equal(pluralDays(2), '2 days')
    const before = computeProjectDay({
      startDate: '2026-08-02',
      plannedCompletionDate: '2026-08-10',
      asOfDate: '2026-08-01',
    })
    assert.equal(before.headline, 'Project starts in 1 day')
    const beyond = computeProjectDay({
      startDate: '2026-08-01',
      plannedCompletionDate: '2026-08-01',
      asOfDate: '2026-08-02',
    })
    assert.equal(beyond.detail, '1 day beyond planned completion')
  })
})

describe('calendarDaysBetween', () => {
  it('is timezone-safe for date-only parts', () => {
    assert.equal(
      calendarDaysBetween(parseDateOnly('2026-08-01'), parseDateOnly('2026-08-17')),
      16,
    )
  })
})
