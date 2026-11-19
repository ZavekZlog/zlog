import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  hoursFromSignInOut,
  parseClockToMinutes,
  signInHours,
  filterSignInsByReportDate,
  aggregateLabourFromSignIns,
  operativeReviewFromSignIns,
  labourRowsFromOperatives,
  applyOperativesToLabourSummary,
  applyTradeHoursReviewToLabourSummary,
  countSignInTradeHoursReviewRows,
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
  labourAggregateTotals,
  labourRowsFromTradeHoursReview,
  labourSummaryRowsFromSignInReview,
  applyReviewChangeToLabourSummary,
  toDateKey,
} from './labour-from-register.js'
import {
  initSignInTradeHoursReviewFromOperatives,
  reviewPanelActionGuardUntil,
  reviewPanelActionIsGuarded,
} from './sign-in-trade-hours-review.js'
import { displayLabourSummaryRow } from './site-diary-labour-form.js'

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

  it('A: 08:15 → 4:00 = 7.75 (afternoon 12h-style, not overnight)', () => {
    assert.equal(hoursFromSignInOut('08:15', '4:00'), 7.75)
  })

  it('B: 08:30 → 4:30 = 8.0', () => {
    assert.equal(hoursFromSignInOut('08:30', '4:30'), 8)
  })

  it('C: 12:00 → 4:00 = 4.0', () => {
    assert.equal(hoursFromSignInOut('12:00', '4:00'), 4)
  })

  it('D: 12:30 → 4:15 = 3.75', () => {
    assert.equal(hoursFromSignInOut('12:30', '4:15'), 3.75)
  })

  it('E: 08:15 → 16:00 remains 7.75', () => {
    assert.equal(hoursFromSignInOut('08:15', '16:00'), 7.75)
  })

  it('F: 08:30 → 16:30 remains 8.0', () => {
    assert.equal(hoursFromSignInOut('08:30', '16:30'), 8)
  })

  it('G: 12:30 → 16:15 remains 3.75', () => {
    assert.equal(hoursFromSignInOut('12:30', '16:15'), 3.75)
  })

  it('H: 22:00 → 06:00 remains overnight 8.0 (PM +12 is not forced)', () => {
    assert.equal(hoursFromSignInOut('22:00', '06:00'), 8)
    assert.notEqual(hoursFromSignInOut('22:00', '06:00'), 8 - 12)
  })

  it('I: mixed 12h/24h-style rows coexist on the same sheet', () => {
    assert.equal(hoursFromSignInOut('08:15', '4:00'), 7.75)
    assert.equal(hoursFromSignInOut('08:30', '16:30'), 8)
    assert.equal(hoursFromSignInOut('12:00', '4.00'), 4)
    assert.equal(hoursFromSignInOut('12:30', '16.15'), 3.75)
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

describe('applyTradeHoursReviewToLabourSummary', () => {
  it('persists trade-only rows with empty company and no invented hours', () => {
    const result = applyTradeHoursReviewToLabourSummary(
      [
        {
          key: 't:electrical',
          trade: 'Electrical',
          workers: 3,
          hours: 24,
          hoursComplete: true,
          needsReview: false,
        },
      ],
      { makeKey: () => 'k1' },
    )
    assert.equal(result.ok, true)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].trade, 'Electrical')
    assert.equal(result.rows[0].company, '')
    assert.equal(result.rows[0].headcount, '3')
    assert.equal(result.rows[0].hours, '24')
    assert.equal(result.totals.workers, 3)
    assert.equal(result.totals.hours, 24)
  })

  it('copies review company BSCL onto the summary row', () => {
    const result = applyTradeHoursReviewToLabourSummary(
      [
        {
          key: 't:electrical',
          trade: 'Electrical',
          company: 'BSCL',
          workers: 2,
          hours: 13.5,
          hoursComplete: true,
          needsReview: false,
        },
      ],
      { makeKey: () => 'k-bscl' },
    )
    assert.equal(result.ok, true)
    assert.equal(result.rows[0].company, 'BSCL')
  })

  it('a review row with company BSCL and no trade produces a saved row with company BSCL and trade ""', () => {
    const rows = labourRowsFromTradeHoursReview(
      [{
        company: 'BSCL',
        trade: '',
        workers: 2,
        hours: 13.5,
        hoursComplete: true,
      }],
      { makeKey: () => 'k-bscl-no-trade' },
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].company, 'BSCL')
    assert.equal(rows[0].trade, '')
  })

  it('shows a trade that matches another row company under Company and leaves Trade empty', () => {
    const rows = [
      { trade: 'BSCL', company: '' },
      { trade: 'Electrical', company: 'BSCL' },
    ]
    const shown = displayLabourSummaryRow(rows[0], rows)
    assert.equal(shown.company, 'BSCL')
    assert.equal(shown.trade, '')
    assert.equal(displayLabourSummaryRow(rows[1], rows).trade, 'Electrical')
    assert.equal(displayLabourSummaryRow(rows[1], rows).company, 'BSCL')
  })

  it('a scan with one BSCL row produces exactly one row', () => {
    const { rows } = initSignInTradeHoursReviewFromOperatives([
      {
        id: 'op-bscl',
        company: 'BSCL',
        trade: null,
        trade_column_absent: true,
        dateStatus: 'match',
        included: true,
        time_in: '08:00',
        time_out: '14:45',
      },
      {
        id: 'op-blank',
        company: '',
        trade: '',
        dateStatus: 'match',
        included: true,
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].company, 'BSCL')
    assert.equal(rows[0].workers, 1)
  })

  it('a scan producing one company gives exactly one data row', () => {
    const { rows: reviewRows } = initSignInTradeHoursReviewFromOperatives([
      {
        id: 'op-1',
        company: 'BSCL',
        trade: null,
        trade_column_absent: true,
        dateStatus: 'match',
        included: true,
        time_in: '08:00',
        time_out: '14:45',
      },
      {
        id: 'op-2',
        company: 'BSCL',
        trade: null,
        trade_column_absent: true,
        dateStatus: 'match',
        included: true,
        time_in: '08:00',
        time_out: '14:45',
      },
      {
        id: 'op-blank',
        company: '',
        trade: '',
        dateStatus: 'match',
        included: true,
      },
    ])
    const data = labourSummaryRowsFromSignInReview(reviewRows, { makeKey: () => 'k-one-company' })
    assert.equal(data.length, 1)
    assert.equal(data[0].company, 'BSCL')
    assert.equal(data[0].trade, '')
    assert.equal(data[0].headcount, '2')
  })

  it('opening the Review panel and closing it leaves the operatives count and hours unchanged', () => {
    const row = { headcount: '2', hours: '13.5', rowIds: ['a', 'b'] }
    const openedAt = 5000
    const guardUntil = reviewPanelActionGuardUntil(openedAt)
    assert.equal(reviewPanelActionIsGuarded(guardUntil, openedAt + 200), true)
    const whileOpen = reviewPanelActionIsGuarded(guardUntil, openedAt + 200)
      ? row
      : { ...row, headcount: '1', hours: '6.75' }
    assert.equal(whileOpen.headcount, '2')
    assert.equal(whileOpen.hours, '13.5')
    assert.deepEqual(whileOpen.rowIds, ['a', 'b'])
    const closed = whileOpen
    assert.equal(closed.headcount, '2')
    assert.equal(closed.hours, '13.5')
    const section = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../components/diary/SiteDiaryLabourSection.jsx'),
      'utf8',
    )
    const openStart = section.indexOf('onPointerDown={armReviewPanelActionGuard}')
    const openEnd = section.indexOf("people'} · Review", openStart)
    const openBlock = section.slice(openStart, openEnd)
    assert.match(openBlock, /setPeopleOpenKey\(\(prev\) => \(prev === row\.key \? null : row\.key\)\)/)
    assert.doesNotMatch(openBlock, /handleOperativeLabourExclusion|handleOperativeMoveToVisitors|setLabourRows/)
    assert.match(section, /if \(reviewPanelActionGuarded\(\)\) return/)
    const doneStart = section.indexOf('onClick={() => setPeopleOpenKey(null)}')
    const doneBlock = section.slice(doneStart, doneStart + 80)
    assert.match(doneBlock, /setPeopleOpenKey\(null\)/)
    assert.doesNotMatch(doneBlock, /setLabourRows|handleOperativeLabourExclusion|handleOperativeMoveToVisitors/)
  })

  it('a needs-review scan row fills the summary and a blank row is dropped', () => {
    const rows = labourSummaryRowsFromSignInReview(
      [
        {
          key: SIGNIN_ILLEGIBLE_TRADE_KEY,
          trade: SIGNIN_ILLEGIBLE_TRADE_LABEL,
          company: 'BSCL',
          workers: 2,
          hours: null,
          hoursComplete: false,
          needsReview: true,
          rowIds: ['op-1', 'op-2'],
        },
        {
          key: 'blank',
          trade: '',
          company: '',
          workers: 0,
          hours: null,
          hoursComplete: false,
          needsReview: true,
          rowIds: [],
        },
      ],
      { makeKey: () => 'k-review' },
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].company, 'BSCL')
    assert.equal(rows[0].trade, '')
    assert.equal(rows[0].headcount, '2')
    assert.equal(rows[0].hours, '')
    assert.equal(rows[0].needsManualInput.trade, true)
    assert.equal(rows[0].needsManualInput.hours, true)
    assert.equal(rows[0].needsManualInput.company, false)
  })

  it('moving a person updates operatives and hours on that summary row', () => {
    const current = [{
      key: 's1',
      reviewKey: 't:1',
      trade: 'Electrical',
      company: 'BSCL',
      headcount: '2',
      hours: '13.5',
      rowIds: ['a', 'b'],
      needsManualInput: { trade: false, company: false, hours: false, operatives: false },
    }]
    const next = applyReviewChangeToLabourSummary(
      current,
      [{
        key: 't:1',
        trade: 'Electrical',
        company: 'BSCL',
        workers: 1,
        hours: 6.75,
        hoursComplete: true,
        needsReview: false,
        rowIds: ['a'],
      }],
      { makeKey: () => 'unused' },
    )
    assert.equal(next.length, 1)
    assert.equal(next[0].headcount, '1')
    assert.equal(next[0].hours, '6.75')
    assert.equal(next[0].trade, 'Electrical')
    assert.equal(next[0].company, 'BSCL')
    const cleared = applyReviewChangeToLabourSummary(
      current,
      [{
        key: 't:1',
        trade: 'Electrical',
        company: 'BSCL',
        workers: 0,
        hours: null,
        hoursComplete: false,
        rowIds: [],
      }],
      { makeKey: () => 'unused' },
    )
    assert.equal(cleared.length, 0)
  })

  it('the scan summary is the only register table', () => {
    const section = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../components/diary/SiteDiaryLabourSection.jsx'),
      'utf8',
    )
    const marker = 'Labour Attendance Summary · {labourSummaryDateLabel(reportDate)}'
    const scanStart = section.indexOf(marker, section.indexOf(marker) + marker.length)
    const scanBlock = section.slice(scanStart, section.indexOf('Attendance Register', scanStart))
    assert.match(scanBlock, />Operatives</)
    assert.match(scanBlock, /Total hrs \(all operatives\)/)
    assert.match(scanBlock, /Needs manual input/)
    assert.doesNotMatch(scanBlock, /<SignInOperativeReview/)
    assert.doesNotMatch(scanBlock, /Apply /)
    assert.match(section, /people'\} · Review/)
    assert.match(section, /Move to Visitors section/)
    assert.match(section, /Exclude from labour/)
    assert.match(section, /You have typed figures that are not saved\. Scanning again will replace this table\./)
    const hook = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../components/diary/useSiteDiaryLabour.js'),
      'utf8',
    )
    assert.match(hook, /persistAppliedLabourRows\(supabase, editingReportId, projectId, _labourRows\)/)
    assert.match(hook, /Save the diary first\. These figures stay on this screen\./)
    assert.match(hook, /setScanSummaryLocked\(true\)/)
  })

  it('rejects unresolved illegible sentinel — never persists to report_labour', () => {
    const result = applyTradeHoursReviewToLabourSummary(
      [
        {
          key: SIGNIN_ILLEGIBLE_TRADE_KEY,
          trade: SIGNIN_ILLEGIBLE_TRADE_LABEL,
          workers: 2,
          hours: null,
          hoursComplete: false,
          needsReview: true,
        },
      ],
      { makeKey: () => 'k2' },
    )
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'needs-review')
    assert.equal(result.rows.length, 0)
    assert.match(result.message, /marked for review/i)
  })

  it('S10-style review: 5 resolved trades + 1 illegible → counts 5 and 1', () => {
    const rows = [
      { key: 't:decoration', trade: 'Decoration', workers: 1, hours: 8, hoursComplete: true, needsReview: false },
      { key: 't:electrical', trade: 'Electrical', workers: 2, hours: 16, hoursComplete: true, needsReview: false },
      { key: 't:joinery', trade: 'Joinery', workers: 1, hours: 8, hoursComplete: true, needsReview: false },
      { key: 't:labour', trade: 'Labour', workers: 3, hours: 24, hoursComplete: true, needsReview: false },
      { key: 't:mechanical', trade: 'Mechanical', workers: 1, hours: 8, hoursComplete: true, needsReview: false },
      {
        key: SIGNIN_ILLEGIBLE_TRADE_KEY,
        trade: SIGNIN_ILLEGIBLE_TRADE_LABEL,
        workers: 1,
        hours: null,
        hoursComplete: false,
        needsReview: true,
      },
    ]
    const counts = countSignInTradeHoursReviewRows(rows)
    assert.equal(counts.resolvedTradeCount, 5)
    assert.equal(counts.needsReviewCount, 1)
    const blocked = applyTradeHoursReviewToLabourSummary(rows, { makeKey: () => 'k' })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.reason, 'needs-review')
  })

  it('applies when all review rows are resolved', () => {
    const result = applyTradeHoursReviewToLabourSummary(
      [
        {
          key: 't:electrical',
          trade: 'Electrical',
          workers: 3,
          hours: 24,
          hoursComplete: true,
          needsReview: false,
        },
      ],
      { makeKey: () => 'k1' },
    )
    assert.equal(result.ok, true)
    assert.equal(result.rows[0].trade, 'Electrical')
    assert.notEqual(result.rows[0].trade, SIGNIN_ILLEGIBLE_TRADE_LABEL)
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
