import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  detailedTradeOccupationFromRow,
  toReportingTradeCategory,
} from './construction-trade-reporting-category.js'
import { canonicalizeConstructionTrade } from './construction-trade-vocabulary.js'
import { applyClaudeBenchmarkTradeNormalisation } from './parse-signin-sheet-claude-benchmark.js'
import {
  aggregateSignInOperativesByTrade,
  hoursFromSignInOut,
  tradeKeyForSignInSummary,
} from './labour-from-register.js'
import {
  addSignInTradeHoursRow,
  initSignInTradeHoursReviewFromOperatives,
  removeSignInTradeHoursRow,
  renameSignInTradeHoursRow,
  totalSignInTradeHoursReview,
} from './sign-in-trade-hours-review.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pipelinePath = join(root, 'lib/parse-signin-sheet-claude-pipeline.js')
const consensusPath = join(root, 'lib/sign-in-trade-consensus.js')
const labourPath = join(root, 'lib/labour-from-register.js')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')

function row(partial) {
  return {
    id: partial.id || `r-${Math.random().toString(16).slice(2, 8)}`,
    trade: partial.trade,
    ...(partial.trade_normalized !== undefined
      ? { trade_normalized: partial.trade_normalized }
      : {}),
    ...(partial.trade_reviewed !== undefined ? { trade_reviewed: partial.trade_reviewed } : {}),
    trade_needs_review: partial.trade_needs_review === true,
    time_in: partial.time_in ?? '08:00',
    time_out: partial.time_out ?? '16:00',
    dateStatus: partial.dateStatus ?? 'match',
    included: partial.included !== false,
    company: partial.company,
  }
}

describe('Construction trade reporting categories', () => {
  it('A: Electrician → Electrical', () => {
    assert.equal(toReportingTradeCategory('Electrician'), 'Electrical')
  })

  it('B: Spark/Sparky → Electrician → Electrical', () => {
    assert.equal(canonicalizeConstructionTrade('Spark'), 'Electrician')
    assert.equal(canonicalizeConstructionTrade('Sparky'), 'Electrician')
    assert.equal(toReportingTradeCategory('Spark'), 'Electrical')
    assert.equal(toReportingTradeCategory('Sparky'), 'Electrical')
  })

  it('C: Joiner → Joinery', () => {
    assert.equal(toReportingTradeCategory('Joiner'), 'Joinery')
  })

  it('D: Carpenter/Chippy → Joinery', () => {
    assert.equal(toReportingTradeCategory('Carpenter'), 'Joinery')
    assert.equal(toReportingTradeCategory('chippy'), 'Joinery')
  })

  it('E: Plumber → Mechanical', () => {
    assert.equal(toReportingTradeCategory('Plumber'), 'Mechanical')
  })

  it('F: Pipefitter → Mechanical where approved', () => {
    assert.equal(toReportingTradeCategory('Pipefitter'), 'Mechanical')
    assert.equal(toReportingTradeCategory('Mechanical fitter'), 'Mechanical')
  })

  it('G: Painter/Decorator → Decoration', () => {
    assert.equal(toReportingTradeCategory('Painter'), 'Decoration')
    assert.equal(toReportingTradeCategory('Decorator'), 'Decoration')
    assert.equal(toReportingTradeCategory('Painter & Decorator'), 'Decoration')
  })

  it('H: Labourer → Labour', () => {
    assert.equal(toReportingTradeCategory('Labourer'), 'Labour')
  })

  it('I: Scaffolder → Scaffolding', () => {
    assert.equal(toReportingTradeCategory('Scaffolder'), 'Scaffolding')
    assert.equal(toReportingTradeCategory('Scaff'), 'Scaffolding')
  })

  it('J: Bricklayer → Masonry', () => {
    assert.equal(toReportingTradeCategory('Bricklayer'), 'Masonry')
    assert.equal(toReportingTradeCategory('Brickie'), 'Masonry')
  })

  it('K: Groundworker → Groundworks', () => {
    assert.equal(toReportingTradeCategory('Groundworker'), 'Groundworks')
  })

  it('L: Detailed canonical occupation is still retained internally', () => {
    const operative = row({
      trade: 'Sparky',
      trade_reviewed: 'Sparky',
      trade_normalized: 'Electrician',
    })
    assert.equal(operative.trade_normalized, 'Electrician')
    assert.equal(detailedTradeOccupationFromRow(operative), 'Electrician')
    const key = tradeKeyForSignInSummary(operative)
    assert.equal(key.detailedOccupation, 'Electrician')
    assert.equal(key.label, 'Electrical')
  })

  it('M: Aggregation occurs by reporting category', () => {
    const { trades } = aggregateSignInOperativesByTrade([
      row({ trade: 'Joiner' }),
      row({ trade: 'Carpenter' }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Joinery')
    assert.equal(trades[0].hours, 16)
  })

  it('N: Electrician 8 + Spark 8 → Electrical 16', () => {
    const normalised = applyClaudeBenchmarkTradeNormalisation([
      row({ trade: 'Electrician' }),
      row({ trade: 'Spark' }),
    ])
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    assert.equal(normalised[1].trade_normalized, 'Electrician')
    const { trades, totals } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(trades[0].hours, 16)
    assert.equal(totals.hours, 16)
  })

  it('O: Known test sheet headline total excludes incomplete Decoration hours', () => {
    // Accepted Android sheet after rich consensus + detailed aliases:
    // Electrician+Spark, Joiner×2, Labourer×2, Painter×2 (+ blank clocks), Plumber×2
    // Decoration line shows 7.5 h from readable rows but hoursComplete is false — totals.hours omits it.
    const sheet = [
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Joiner', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Labourer', time_in: '08:15', time_out: '4:00' }),
      row({ trade: 'Labourer', time_in: '08:15', time_out: '4:00' }),
      row({ trade: 'Electrician', time_in: '08:30', time_out: '16:30' }),
      row({ trade: 'Spark', time_in: '08:30', time_out: '4:30' }),
      row({ trade: 'Plumber', time_in: '12:00', time_out: '4:00' }),
      row({ trade: 'Plumber', time_in: '12:00', time_out: '4:00' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '4:15' }),
      row({ trade: 'Painter', time_in: '12:30', time_out: '4:15' }),
      row({ trade: 'Painter', time_in: '', time_out: '' }),
    ]
    const normalised = applyClaudeBenchmarkTradeNormalisation(sheet)
    const { trades, totals } = aggregateSignInOperativesByTrade(normalised)
    const byTrade = Object.fromEntries(trades.map((t) => [t.trade, t]))
    assert.equal(byTrade.Electrical.hours, 16)
    assert.equal(byTrade.Joinery.hours, 16)
    assert.equal(byTrade.Labour.hours, 15.5)
    assert.equal(byTrade.Decoration.workers, 3)
    assert.equal(byTrade.Decoration.hours, 7.5)
    assert.equal(byTrade.Decoration.hoursComplete, false)
    assert.equal(byTrade.Decoration.needsReview, true)
    assert.equal(byTrade.Mechanical.hours, 8)
    // Joinery 16 + Labour 15.5 + Electrical 16 + Mechanical 8 = 55.5 (Decoration excluded)
    assert.equal(totals.hours, 55.5)
    assert.equal(byTrade.Electrician, undefined)
    assert.equal(byTrade.Joiner, undefined)
    assert.equal(byTrade.Painter, undefined)
    assert.equal(byTrade.Plumber, undefined)
    assert.equal(byTrade.Labourer, undefined)
  })

  it('P: Hours/date/consensus behaviour is unchanged', () => {
    assert.equal(hoursFromSignInOut('08:00', '16:00'), 8)
    assert.equal(hoursFromSignInOut('12:30', '16:15'), 3.75)
    const labour = readFileSync(labourPath, 'utf8')
    assert.match(labour, /export function hoursFromSignInOut/)
    assert.match(labour, /outMin < inMin/)
    const consensus = readFileSync(consensusPath, 'utf8')
    assert.match(consensus, /runSignInRichTradeConsensusPass/)
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /runSignInRichTradeConsensusPass/)
    assert.match(pipeline, /applyClaudeBenchmarkTradeNormalisation/)
  })

  it('Q: Editable reviewed category still supports merge/add/remove/free text', () => {
    let { rows } = initSignInTradeHoursReviewFromOperatives([
      row({ trade: 'Electrician' }),
      row({ trade: 'Joiner' }),
    ])
    assert.equal(rows.find((r) => r.trade === 'Electrical')?.hours, 8)
    assert.equal(rows.find((r) => r.trade === 'Joinery')?.hours, 8)
    const joinery = rows.find((r) => r.trade === 'Joinery')
    rows = renameSignInTradeHoursRow(rows, joinery.key, 'Electrical')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, 'Electrical')
    assert.equal(rows[0].hours, 16)
    assert.equal(totalSignInTradeHoursReview(rows), 16)
    rows = addSignInTradeHoursRow(rows)
    assert.equal(rows.length, 2)
    rows = removeSignInTradeHoursRow(rows, rows[1].key)
    assert.equal(rows.length, 1)
    rows = renameSignInTradeHoursRow(rows, rows[0].key, 'Custom gang')
    assert.equal(rows[0].trade, 'Custom gang')
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /\+ Add trade/)
    assert.match(review, /Hours on site/)
  })
})
