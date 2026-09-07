import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  hoursFromSignInOut,
  parseClockToMinutes,
  signInHours,
  filterSignInsByReportDate,
  aggregateLabourFromSignIns,
  operativeReviewFromSignIns,
  labourRowsFromOperatives,
  applyOperativesToLabourSummary,
  labourAggregateTotals,
  toDateKey,
} from './labour-from-register.js'

describe('hoursFromSignInOut (deterministic, never from AI)', () => {
  it('07:00 → 16:00 = 9 hours', () => {
    assert.equal(hoursFromSignInOut('07:00', '16:00'), 9)
  })

  it('7:00 → 16:00 = 9 hours', () => {
    assert.equal(hoursFromSignInOut('7:00', '16:00'), 9)
  })

  it('ignores any AI hours field on the record', () => {
    assert.equal(
      signInHours({ signed_in_at: '07:00', signed_out_at: '16:00', hours: 12 }),
      9,
    )
  })

  it('overnight wrap: 22:00 → 06:00 = 8 hours', () => {
    assert.equal(hoursFromSignInOut('22:00', '06:00'), 8)
  })

  it('returns null when a time is missing', () => {
    assert.equal(hoursFromSignInOut('07:00', null), null)
    assert.equal(hoursFromSignInOut(null, '16:00'), null)
  })
})

describe('parseClockToMinutes', () => {
  it('parses HH:MM and HH.MM', () => {
    assert.equal(parseClockToMinutes('07:00'), 7 * 60)
    assert.equal(parseClockToMinutes('16.30'), 16 * 60 + 30)
  })
})

describe('operativeReviewFromSignIns preserves every row', () => {
  it('keeps both operatives with calculated hours', () => {
    const ops = operativeReviewFromSignIns(
      [
        {
          work_date: '2026-07-28',
          person_name: 'Alice',
          trade: 'Carpenter',
          company: 'Build Co',
          signed_in_at: '07:00',
          signed_out_at: '16:00',
          hours: 12,
        },
        {
          work_date: '2026-07-28',
          person_name: 'Bob',
          trade: 'Carpenter',
          company: 'Build Co',
          signed_in_at: '08:00',
          signed_out_at: '17:00',
          hours: 99,
        },
      ],
      '2026-07-28',
    )
    assert.equal(ops.length, 2)
    assert.equal(ops[0].person_name, 'Alice')
    assert.equal(ops[1].person_name, 'Bob')
    assert.equal(ops[0].hours, 9)
    assert.equal(ops[1].hours, 9)
    assert.equal(ops[0].included, true)
  })

  it('flags other-date rows but does not drop them', () => {
    const ops = operativeReviewFromSignIns(
      [
        { work_date: '2026-07-28', person_name: 'Today', signed_in_at: '07:00', signed_out_at: '16:00' },
        { work_date: '2026-07-27', person_name: 'Yesterday', signed_in_at: '07:00', signed_out_at: '16:00' },
      ],
      '2026-07-28',
    )
    assert.equal(ops.length, 2)
    assert.equal(ops.find((o) => o.person_name === 'Yesterday').dateStatus, 'other')
    assert.equal(ops.find((o) => o.person_name === 'Yesterday').included, false)
  })

  it('includes missing-date rows by default', () => {
    const ops = operativeReviewFromSignIns(
      [{ work_date: null, person_name: 'NoDate', signed_in_at: '07:00', signed_out_at: '16:00' }],
      '2026-07-28',
    )
    assert.equal(ops[0].dateStatus, 'missing')
    assert.equal(ops[0].included, true)
  })
})

describe('labourRowsFromOperatives', () => {
  it('aggregates included operatives with calculated hours', () => {
    const rows = labourRowsFromOperatives(
      [
        {
          included: true,
          trade: 'Carpenter',
          company: 'Co',
          time_in: '07:00',
          time_out: '16:00',
        },
        {
          included: true,
          trade: 'Carpenter',
          company: 'Co',
          time_in: '08:00',
          time_out: '17:00',
        },
        {
          included: false,
          trade: 'Electrician',
          company: 'Co',
          time_in: '07:00',
          time_out: '16:00',
        },
      ],
      { groupBy: 'trade_company', makeKey: () => 'k' },
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].headcount, '2')
    assert.equal(rows[0].hours, '18')
  })
})

describe('applyOperativesToLabourSummary', () => {
  it('applies selected OCR rows into labour summary with trade+company grouping', () => {
    const result = applyOperativesToLabourSummary(
      [
        {
          included: true,
          trade: 'Carpenter',
          company: 'Acme',
          time_in: '07:00',
          time_out: '16:00',
        },
        {
          included: true,
          trade: 'Carpenter',
          company: 'Acme',
          time_in: '08:00',
          time_out: '17:00',
        },
        {
          included: true,
          trade: 'Electrician',
          company: 'Sparks',
          time_in: '07:00',
          time_out: '16:00',
        },
      ],
      { groupBy: 'trade_company', makeKey: () => 'k' },
    )
    assert.equal(result.ok, true)
    assert.equal(result.rows.length, 2)
    assert.equal(result.totals.operatives, 3)
    assert.equal(result.totals.hours, 27)
    const carpenter = result.rows.find((row) => row.trade === 'Carpenter')
    assert.equal(carpenter.company, 'Acme')
    assert.equal(carpenter.headcount, '2')
    assert.equal(carpenter.hours, '18')
  })

  it('still applies Unknown OCR values instead of silently emptying labour summary', () => {
    const operatives = Array.from({ length: 12 }, (_, index) => ({
      id: `op-${index}`,
      included: true,
      person_name: 'Unknown',
      trade: 'Unknown',
      company: 'Unknown',
      time_in: 'Unknown',
      time_out: 'Unknown',
    }))
    const result = applyOperativesToLabourSummary(operatives, {
      groupBy: 'trade_company',
      makeKey: () => 'k',
    })
    assert.equal(result.ok, true)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].trade, 'Unknown')
    assert.equal(result.rows[0].company, 'Unknown')
    assert.equal(result.rows[0].headcount, '12')
    assert.equal(result.rows[0].hours, '0')
    assert.equal(result.totals.operatives, 12)
    assert.equal(result.totals.hours, 0)
    assert.equal(labourAggregateTotals(result.rows).operatives, 12)
  })

  it('returns a visible validation message when no rows are selected', () => {
    const result = applyOperativesToLabourSummary([
      {
        included: false,
        trade: 'Carpenter',
        company: 'Acme',
        time_in: '07:00',
        time_out: '16:00',
      },
    ])
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'none-selected')
    assert.equal(result.rows.length, 0)
    assert.match(result.message, /Select at least one operative/i)
  })
})

describe('toDateKey UK dates', () => {
  it('parses DD/MM/YYYY', () => {
    assert.equal(toDateKey('28/07/2026'), '2026-07-28')
  })
})

describe('filterSignInsByReportDate', () => {
  it('strict match only', () => {
    const rows = [{ work_date: '2026-07-28' }, { work_date: '2026-07-27' }]
    assert.equal(filterSignInsByReportDate(rows, '2026-07-28').length, 1)
  })
})

describe('aggregateLabourFromSignIns uses calculated hours', () => {
  it('sums hours from times, not OCR hours field', () => {
    const rows = [
      {
        work_date: '2026-07-28',
        trade: 'Carpenter',
        company: 'Co',
        signed_in_at: '07:00',
        signed_out_at: '16:00',
        hours: 12,
      },
    ]
    const agg = aggregateLabourFromSignIns(rows, { reportDate: '2026-07-28' })
    assert.equal(agg[0].hours, 9)
  })
})
