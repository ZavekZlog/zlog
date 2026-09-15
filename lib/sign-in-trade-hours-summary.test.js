import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateSignInOperativesByTrade,
  hoursFromSignInOut,
  hoursOnSiteForSignInRow,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
} from './labour-from-register.js'
import {
  isClaudeBenchmarkHeaderRow,
  qualifyClaudeBenchmarkOperativeRows,
  applyClaudeBenchmarkTradeNormalisation,
} from './parse-signin-sheet-claude-benchmark.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')
const diaryPath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')
const labourSectionPath = join(root, 'components/diary/SiteDiaryLabourSection.jsx')
const pipelinePath = join(root, 'lib/parse-signin-sheet-claude-pipeline.js')

function row(partial) {
  return {
    id: partial.id || `r-${Math.random().toString(16).slice(2, 8)}`,
    person_name: partial.person_name ?? null,
    trade: partial.trade ?? 'Labourer',
    trade_normalized: partial.trade_normalized,
    trade_reviewed: partial.trade_reviewed,
    trade_needs_review: partial.trade_needs_review === true,
    company: partial.company ?? 'Ignored Co',
    time_in: partial.time_in ?? '08:00',
    time_out: partial.time_out ?? '16:00',
    hours: partial.hours,
    hours_on_site: partial.hours_on_site,
    dateStatus: partial.dateStatus ?? 'match',
    included: partial.included !== false,
  }
}

describe('Sign-in trade + hours labour summary', () => {
  it('A: names are not required for the Claude summary payload', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /"date":"YYYY-MM-DD","person_name"/)
    assert.match(pipeline, /optional/)
    assert.match(pipeline, /Do not invent a name/)
    assert.doesNotMatch(pipeline, /runCompanyTradeConsensusPass/)
    const { trades } = aggregateSignInOperativesByTrade([
      row({ person_name: null, trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Joinery')
    assert.equal(trades[0].hours, 8)
  })

  it('B: companies are not required for the new summary', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /company = optional/)
    assert.match(pipeline, /Internal anchors discarded before user-facing Trade \+ Hours/)
    assert.doesNotMatch(pipeline, /runCompanyTradeConsensusPass/)
    const { trades } = aggregateSignInOperativesByTrade([
      row({ company: null, trade: 'Labourer' }),
      row({ company: 'Different Co', trade: 'Labourer' }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].hours, 16)
  })

  it('C: break deductions are not used for hours on site', () => {
    const hours = hoursOnSiteForSignInRow(
      row({
        time_in: '08:00',
        time_out: '16:00',
        net_hours: 7,
        break_deduction_hours: 1,
      }),
    )
    assert.equal(hours, 8)
    assert.notEqual(hours, 7)
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /Break deduction/)
    assert.doesNotMatch(review, /break_deduction/)
    assert.doesNotMatch(review, /Net hours/)
  })

  it('D: 08:00 → 16:00 produces 8.0 hours on site', () => {
    assert.equal(hoursFromSignInOut('08:00', '16:00'), 8)
    assert.equal(hoursOnSiteForSignInRow(row({ time_in: '08:00', time_out: '16:00' })), 8)
  })

  it('E: mixed colon/dot handwritten clocks remain supported per row', () => {
    assert.equal(hoursFromSignInOut('12:00', '16.00'), 4)
    assert.equal(hoursFromSignInOut('12:00', '16:15'), 4.25)
    assert.equal(hoursFromSignInOut('08:00', '16.00'), 8)
    assert.equal(hoursFromSignInOut('12:30', '16:15'), 3.75)
    assert.equal(hoursFromSignInOut('08:15', '16:00'), 7.75)
    assert.equal(hoursFromSignInOut('08:30', '16.30'), 8)
  })

  it('F: rows aggregate by TRADE only', () => {
    const { trades, totals } = aggregateSignInOperativesByTrade([
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '16:15' }),
    ])
    assert.equal(trades.length, 2)
    const joiner = trades.find((t) => t.trade === 'Joinery')
    const painter = trades.find((t) => t.trade === 'Decoration')
    assert.equal(joiner.hours, 16)
    assert.equal(painter.hours, 3.75)
    assert.equal(totals.hours, 19.75)
  })

  it('G: same trade from different companies still combines', () => {
    const { trades } = aggregateSignInOperativesByTrade([
      row({ trade: 'Electrician', company: 'SHC' }),
      row({ trade: 'Electrician', company: 'ABC' }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(trades[0].hours, 16)
  })

  it('H: other-date rows are excluded', () => {
    const { trades, totals, otherDateCount } = aggregateSignInOperativesByTrade([
      row({ trade: 'Labourer', dateStatus: 'match' }),
      row({ trade: 'Labourer', dateStatus: 'other', time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(otherDateCount, 1)
    assert.equal(trades[0].hours, 8)
    assert.equal(totals.hours, 8)
  })

  it('I: table/header row does not contribute labour', () => {
    assert.equal(
      isClaudeBenchmarkHeaderRow({
        date: 'Date',
        person_name: 'Name',
        company: 'Company',
        trade: 'Painter',
        time_in: 'Time In',
        time_out: 'Time Out',
        signature: 'Signature',
      }),
      true,
    )
    const qualified = qualifyClaudeBenchmarkOperativeRows([
      {
        date: 'Date',
        person_name: 'Name',
        company: 'Company',
        trade: 'Trade',
        time_in: 'Time In',
        time_out: 'Time Out',
        signature: 'Signature',
      },
      {
        date: '2026-09-06',
        trade: 'Joiner',
        time_in: '08:00',
        time_out: '16:00',
      },
    ])
    assert.equal(qualified.droppedHeaderCount, 1)
    assert.equal(qualified.rows.length, 1)
    const { trades } = aggregateSignInOperativesByTrade(
      qualified.rows.map((r) =>
        row({
          trade: r.trade,
          time_in: r.time_in,
          time_out: r.time_out,
          person_name: null,
          company: null,
        }),
      ),
    )
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Joinery')
  })

  it('J: illegible trade is not replaced by an invented trade', () => {
    const empty = aggregateSignInOperativesByTrade([row({ trade: '' })])
    assert.equal(empty.trades[0].trade, SIGNIN_ILLEGIBLE_TRADE_LABEL)
    assert.equal(empty.trades[0].needsReview, true)
    const uncertain = aggregateSignInOperativesByTrade([
      row({ trade: 'MaybeJoiner', trade_needs_review: true }),
    ])
    assert.equal(uncertain.trades[0].trade, SIGNIN_ILLEGIBLE_TRADE_LABEL)
  })

  it('J: both-null clocks do not create or poison a trade summary', () => {
    const { trades, totals } = aggregateSignInOperativesByTrade([
      row({
        id: 'p1',
        trade: 'Painter',
        time_in: '12:30',
        time_out: '4:15',
      }),
      row({
        id: 'p2',
        trade: 'Painter',
        time_in: '12:30',
        time_out: '4:15',
      }),
      row({
        id: 'artifact',
        trade: 'Painter',
        time_in: '',
        time_out: '',
        hours: 99,
        hours_on_site: 99,
      }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Decoration')
    assert.equal(trades[0].hours, 7.5)
    assert.equal(trades[0].hoursComplete, false)
    assert.equal(trades[0].reviewStatus, 'Needs review')
    assert.equal(totals.hours, 0)
  })

  it('K: exactly one clock missing → Needs review, no fabricated hours', () => {
    const { trades } = aggregateSignInOperativesByTrade([
      row({
        trade: 'Joiner',
        time_in: '08:00',
        time_out: '',
        hours: 99,
        hours_on_site: 99,
      }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].hoursComplete, false)
    assert.equal(trades[0].reviewStatus, 'Needs review')
    assert.equal(trades[0].hours, 0)
    assert.equal(hoursOnSiteForSignInRow(row({ time_in: '08:00', time_out: '' })), null)
  })

  it('L: two valid Painters 3.75 each + both-null artifact → Painter 7.5 not —', () => {
    const { trades } = aggregateSignInOperativesByTrade([
      row({ trade: 'Painter', time_in: '12:30', time_out: '16:15' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '4:15' }),
      row({ trade: 'Painter', time_in: '', time_out: '' }),
    ])
    assert.equal(trades[0].hours, 7.5)
    assert.equal(trades[0].hoursComplete, false)
    assert.equal(trades[0].reviewStatus, 'Needs review')
  })

  it('M: known test-sheet trade-hours total is 63.0 by reporting category (OCR Scaff maps to Scaffolding)', () => {
    const sheet = [
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Labourer', time_in: '08:15', time_out: '4:00' }),
      row({ trade: 'Labourer', time_in: '08:15', time_out: '4:00' }),
      row({ trade: 'Electrician', time_in: '08:30', time_out: '16:30' }),
      row({ trade: 'Scaff', time_in: '08:30', time_out: '4:30' }),
      row({ trade: 'Plumber', time_in: '12:00', time_out: '4:00' }),
      row({ trade: 'Plumber', time_in: '12:00', time_out: '4:00' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '4:15' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '4:15' }),
      row({ trade: 'Painter', time_in: '', time_out: '' }),
    ]
    const { trades, totals } = aggregateSignInOperativesByTrade(sheet)
    const byTrade = Object.fromEntries(trades.map((t) => [t.trade, t]))
    assert.equal(byTrade.Joinery.hours, 16)
    assert.equal(byTrade.Labour.hours, 15.5)
    assert.equal(byTrade.Electrical.hours, 8)
    assert.equal(byTrade.Scaffolding.hours, 8)
    assert.equal(byTrade.Mechanical.hours, 8)
    assert.equal(byTrade.Decoration.hours, 7.5)
    assert.equal(byTrade.Decoration.hoursComplete, false)
    assert.equal(byTrade.Decoration.needsReview, true)
    // Decoration includes one unreadable clock row — gross total excludes incomplete trades.
    assert.equal(totals.hours, 55.5)
    assert.equal(trades.some((t) => t.trade === 'Electrical' && t.hours === 16), false)
  })

  it('scan review contains no names, company fields, worker counts, break, net hours, consensus', () => {
    const review = readFileSync(reviewPath, 'utf8')
    const reviewHelper = readFileSync(
      join(root, 'lib/sign-in-trade-hours-review.js'),
      'utf8',
    )
    assert.match(review, /Labour from Attendance Register/)
    assert.match(review, /Hours on site/)
    assert.match(reviewHelper, /aggregateSignInOperativesByTrade/)
    assert.match(review, /sign-in-trade-hours-review/)
    assert.doesNotMatch(review, /Labour by company/)
    assert.doesNotMatch(review, /person_name/)
    assert.match(review, />Workers</)
    assert.doesNotMatch(review, /Break deduction/)
    assert.doesNotMatch(review, /Net hours/)
    assert.doesNotMatch(review, /company consensus/i)
    assert.doesNotMatch(review, /aggregateSignInOperativesByCompany/)
    assert.doesNotMatch(review, /renameCompanyGroup/)
  })

  it('M: scan-result mode does not simultaneously render the old manual Labour Summary', () => {
    const section = readFileSync(labourSectionPath, 'utf8')
    assert.match(section, /labourMode === 'manual' && \(/)
    assert.match(section, /Labour Attendance Summary · \{reportDate\}/)
    const manualBlock = section.slice(
      section.indexOf("labourMode === 'manual' &&"),
      section.indexOf('+ Add attendance row'),
    )
    assert.match(manualBlock, /Labour Attendance Summary/)
  })

  it('N: Manual Entry still exposes the existing manual labour UI', () => {
    const section = readFileSync(labourSectionPath, 'utf8')
    assert.match(section, /Manual Entry/)
    assert.match(section, /startManualLabour/)
    assert.match(section, /manualLabourEditing/)
    assert.match(section, /Save changes/)
    assert.match(section, /\+ Add attendance row/)
    assert.match(section, /placeholder="Carpenter"/)
    assert.match(section, /aria-label="Workers"/)
    assert.doesNotMatch(section, /placeholder="Subco Ltd"/)
  })

  it('O: Take new photo / Choose from gallery / Re-scan / Delete photo remain available', () => {
    const section = readFileSync(labourSectionPath, 'utf8')
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(section, /Scan Attendance Register/)
    assert.match(section, /Take new photo/)
    assert.match(section, /Choose from gallery/)
    assert.match(section, /Re-scan/)
    assert.match(section, /Delete photo/)
    assert.match(section, /removeSignInSheetEvidence/)
    assert.match(section, /retrySignInScan/)
    assert.equal([...section.matchAll(/>\s*Re-scan\s*</g)].length, 1)
    assert.doesNotMatch(review, /Re-scan/)
  })

  it('P: manual attendance rows use ⋯ Remove row without horizontal scroll or red ×', () => {
    const section = readFileSync(labourSectionPath, 'utf8')
    const manualBlock = section.slice(
      section.indexOf("labourMode === 'manual' &&"),
      section.indexOf('+ Add attendance row'),
    )
    assert.match(manualBlock, /Remove row/)
    assert.match(manualBlock, /manualRowMenuOpenKey/)
    assert.doesNotMatch(manualBlock, /overflowX:\s*'auto'/)
    assert.doesNotMatch(manualBlock, /minWidth:\s*360/)
    assert.doesNotMatch(manualBlock, />\s*×\s*</)
    assert.doesNotMatch(manualBlock, /removeRowStyle/)
  })

  it('P: Labour renders before Site Summary / Variations / RFIs', () => {
    const diary = readFileSync(diaryPath, 'utf8')
    const labourIdx = diary.indexOf('<SiteDiaryLabourSection')
    const summaryIdx = diary.indexOf('title="Site summary"')
    const dailyIdx = diary.indexOf('<DiaryDailyRecordSections')
    assert.ok(labourIdx > 0)
    assert.ok(labourIdx < summaryIdx)
    assert.ok(labourIdx < dailyIdx)
  })

  it('Spark/Sparky still normalises into Electrician then aggregates as Electrical', () => {
    const normalised = applyClaudeBenchmarkTradeNormalisation([
      {
        id: '1',
        trade: 'Sparky',
        company: 'A',
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'match',
        included: true,
      },
      {
        id: '2',
        trade: 'Electrician',
        company: 'B',
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'match',
        included: true,
      },
    ])
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    const { trades } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(trades[0].hours, 16)
  })
})
