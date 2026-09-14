/**
 * Regression: row17 Architect add/remove must not re-emit op15 as Illegible
 * while op15 remains merged into Decoration (3 / 11.25).
 *
 * Production wiring (useSiteDiaryLabour.js + SignInOperativeReview.jsx):
 * - Scan / retry / replace image → handleSignInSheetFiles → initSignInTradeHoursReviewFromOperatives → setScanTradeHoursReview (FULL REPLACE)
 * - Trade/hours/workers → handleScanTradeHoursReviewChange → setScanTradeHoursReview
 * - Include / Exclude → handleOperativeLabourExclusion → applyOperativeLabourExclusionToReview → setScanOperatives + setScanTradeHoursReview
 *
 * There is NO production helper that appends init-derived rows onto existing review.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  initSignInTradeHoursReviewFromOperatives,
  renameSignInTradeHoursRow,
  applyOperativeLabourExclusionToReview,
  applyOperativeMoveToVisitorsFromReview,
  addSignInTradeHoursRow,
  totalSignInTradeHoursReview,
  scanDerivedSignInTradeHoursReviewRow,
  isSignInTradeHoursReviewPlaceholderRow,
} from './sign-in-trade-hours-review.js'
import { countSignInTradeHoursReviewRows } from './labour-from-register.js'
import {
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  hoursFromSignInOut,
} from './labour-from-register.js'
import { applyClaudeBenchmarkTradeNormalisation } from './parse-signin-sheet-claude-benchmark.js'

const OP15 = 'op-15'
const OP17 = 'op-17'

const __dirname = dirname(fileURLToPath(import.meta.url))
const labourHookPath = join(__dirname, '../components/diary/useSiteDiaryLabour.js')
const reviewUiPath = join(__dirname, '../components/diary/SignInOperativeReview.jsx')
const labourSectionPath = join(__dirname, '../components/diary/SiteDiaryLabourSection.jsx')

/** Mirrors handleSignInSheetFiles post-OCR review write (lines 210–212). */
function productionHandleSignInSheetReviewFromScan(operatives) {
  const reviewed = initSignInTradeHoursReviewFromOperatives(operatives)
  return reviewed.rows
}

/** Mirrors handleOperativeLabourExclusion (apply + state write). */
function productionHandleOperativeLabourExclusion(operatives, reviewRows, payload) {
  return applyOperativeLabourExclusionToReview({
    operatives,
    reviewRows,
    ...payload,
  })
}

/** Mirrors handleScanTradeHoursReviewChange (pass-through of helper output). */
function productionHandleScanTradeHoursReviewChange(nextRows) {
  return nextRows
}

function buildScanOperatives() {
  return applyClaudeBenchmarkTradeNormalisation([
    { id: 'j1', source_row: 1, trade: 'Joiner', trade_needs_review: false, time_in: '08:00', time_out: '16:00', dateStatus: 'match', included: true },
    { id: 'j2', source_row: 2, trade: 'Joiner', trade_needs_review: false, time_in: '08:00', time_out: '16:00', dateStatus: 'match', included: true },
    { id: 'l1', source_row: 3, trade: 'Labourer', trade_needs_review: false, time_in: '08:15', time_out: '4:00', dateStatus: 'match', included: true },
    { id: 'l2', source_row: 4, trade: 'Labourer', trade_needs_review: false, time_in: '08:15', time_out: '4:00', dateStatus: 'match', included: true },
    { id: 'e1', source_row: 5, trade: 'Electrician', trade_needs_review: false, time_in: '08:30', time_out: '16:30', dateStatus: 'match', included: true },
    { id: 'e2', source_row: 6, trade: 'Spark', trade_needs_review: false, time_in: '08:30', time_out: '4:30', dateStatus: 'match', included: true },
    { id: 'p1', source_row: 7, trade: 'Plumber', trade_needs_review: false, time_in: '12:00', time_out: '4:00', dateStatus: 'match', included: true },
    { id: 'p2', source_row: 8, trade: 'Plumber', trade_needs_review: false, time_in: '12:00', time_out: '4:00', dateStatus: 'match', included: true },
    { id: 'd1', source_row: 9, trade: 'Painter', trade_needs_review: false, time_in: '12:30', time_out: '4:15', dateStatus: 'match', included: true },
    { id: 'd2', source_row: 10, trade: 'Painter', trade_needs_review: false, time_in: '12:30', time_out: '4:15', dateStatus: 'match', included: true },
    {
      id: OP15,
      source_row: 15,
      trade: null,
      trade_needs_review: true,
      trade_reviewed: null,
      time_in: '12:30',
      time_out: '4:15',
      dateStatus: 'match',
      included: true,
      excludedFromLabour: false,
    },
    {
      id: OP17,
      source_row: 17,
      trade: 'Architect',
      trade_needs_review: false,
      trade_reviewed: 'Architect',
      time_in: '13:30',
      time_out: '16:00',
      dateStatus: 'match',
      included: true,
      excludedFromLabour: false,
    },
  ])
}

/** Accepted baseline: illegible → Decoration merge; Architect hidden via ⋯ Exclude (row removed). */
/** Operatives as returned by a fresh OCR scan (exclusion flags cleared). */
function operativesAfterFreshScan(operatives) {
  return operatives.map((o) => ({ ...o, excludedFromLabour: false }))
}

function buildAcceptedMergedBaseline(operatives) {
  let reviewRows = productionHandleSignInSheetReviewFromScan(operatives)
  const ill = reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY)
  assert.ok(ill)
  reviewRows = productionHandleScanTradeHoursReviewChange(
    renameSignInTradeHoursRow(reviewRows, ill.key, 'Decoration'),
  )
  const dec = reviewRows.find((r) => r.trade === 'Decoration')
  assert.equal(dec.workers, 3)
  assert.equal(dec.hours, 11.25)
  assert.ok(scanDerivedSignInTradeHoursReviewRow(dec))
  const arch = reviewRows.find((r) => (r.rowIds || []).includes(OP17))
  assert.ok(arch)
  const hidden = productionHandleOperativeLabourExclusion(operatives, reviewRows, {
    reviewRowKey: arch.key,
    operativeId: OP17,
    exclude: true,
  })
  assert.equal(hidden.ok, true)
  assert.equal(hidden.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 11)
  assert.equal(totalSignInTradeHoursReview(hidden.reviewRows), 66.75)
  assert.ok(!hidden.reviewRows.some((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY))
  return {
    operatives: hidden.operatives,
    reviewRows: hidden.reviewRows,
    decorationKey: dec.key,
  }
}

describe('SignInOperativeReview rendered editability (S10 scan flow)', () => {
  it('scan-derived rows: Trade editable; Workers/Hours read-only with no blur commit', () => {
    const review = readFileSync(reviewUiPath, 'utf8')
    const section = readFileSync(labourSectionPath, 'utf8')

    assert.match(review, /const scanDerived = scanDerivedSignInTradeHoursReviewRow\(t\)/)
    assert.match(review, /readOnly=\{scanDerived\}/)
    assert.match(review, /scanDerivedSignInTradeHoursReviewRow\(row\)\) return/)
    assert.match(review, /onBlur=\{\(e\) => handleTradeBlur\(t\.key, e\.target\.value\)\}/)
    assert.match(
      review,
      /scanDerived[\s\S]*onBlur=\{[\s\S]*undefined[\s\S]*handleWorkersCommit/,
    )

    assert.match(section, /disabled=\{scanLoading \|\| scanApplySaving\}/)
  })

  it('manual Add trade rows remain fully editable (empty rowIds)', () => {
    const review = readFileSync(reviewUiPath, 'utf8')
    assert.match(review, /scanDerived[\s\S]*onChange=[\s\S]*scanDerived[\s\S]*undefined/)
    const manual = [{ key: 'manual-1', trade: '', workers: 0, hours: null, rowIds: [] }]
    assert.equal(scanDerivedSignInTradeHoursReviewRow(manual[0]), false)
  })
})

describe('row17 / op15 production route audit', () => {
  it('hook calls init only from scan handler, not from exclusion handler', () => {
    const hook = readFileSync(labourHookPath, 'utf8')
    assert.match(
      hook,
      /const reviewed = initSignInTradeHoursReviewFromOperatives\(operatives\)[\s\S]*setScanTradeHoursReview\(reviewed\.rows\)/,
    )
    const exclusionBlock = hook.slice(hook.indexOf('handleOperativeLabourExclusion'))
    assert.doesNotMatch(exclusionBlock, /initSignInTradeHoursReviewFromOperatives/)
    assert.match(hook, /applyOperativeMoveToVisitorsFromReview/)
    const moveBlock = hook.slice(hook.indexOf('handleOperativeMoveToVisitors'))
    assert.doesNotMatch(moveBlock, /initSignInTradeHoursReviewFromOperatives/)
  })

  it('Include in labour cannot restore row17 after ⋯ Exclude removed Architect row', () => {
    const operatives = buildScanOperatives()
    let reviewRows = productionHandleSignInSheetReviewFromScan(operatives)
    const arch = reviewRows.find((r) => (r.rowIds || []).includes(OP17))
    assert.ok(arch)
    const hidden = productionHandleOperativeLabourExclusion(operatives, reviewRows, {
      reviewRowKey: arch.key,
      operativeId: OP17,
      exclude: true,
    })
    assert.equal(hidden.ok, true)
    assert.ok(!hidden.reviewRows.some((r) => (r.rowIds || []).includes(OP17)))

    const include = productionHandleOperativeLabourExclusion(
      hidden.operatives,
      hidden.reviewRows,
      {
        reviewRowKey: arch.key,
        operativeId: OP17,
        exclude: false,
      },
    )
    assert.equal(include.ok, false)
    assert.equal(include.reason, 'row-not-found')
  })
})

describe('row17 Architect must not re-expose op15 illegible after remove', () => {
  it('operative identities: op15 and op17 remain distinct', () => {
    const ops = buildScanOperatives()
    const op15 = ops.find((o) => o.id === OP15)
    const op17 = ops.find((o) => o.id === OP17)
    assert.equal(op15.source_row, 15)
    assert.equal(op17.source_row, 17)
    assert.equal(op15.trade_needs_review, true)
    assert.equal(op17.trade, 'Architect')
    assert.equal(hoursFromSignInOut(op15.time_in, op15.time_out), 3.75)
    assert.equal(hoursFromSignInOut(op17.time_in, op17.time_out), 2.5)
    assert.notEqual(op15.id, op17.id)
  })

  it('S10 accepted baseline: 11 workers, 5 trades, 66.75 hrs, Decoration 3/11.25, no Illegible', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)
    const dec = baseline.reviewRows.find((r) => r.trade === 'Decoration')
    assert.deepEqual([...(dec.rowIds || [])].sort(), [OP15, 'd1', 'd2'].sort())
    assert.equal(baseline.reviewRows.length, 5)
    assert.equal(baseline.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 11)
    assert.equal(totalSignInTradeHoursReview(baseline.reviewRows), 66.75)
  })

  it('blocked UI path: scan-derived Decoration cannot be diverged via Workers/Hours in review UI', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)
    const freshOps = operativesAfterFreshScan(baseline.operatives)
    let reviewRows = productionHandleSignInSheetReviewFromScan(freshOps)
    const decPainter = reviewRows.find(
      (r) => r.trade === 'Decoration' && !(r.rowIds || []).includes(OP15),
    )
    assert.ok(decPainter)
    assert.equal(scanDerivedSignInTradeHoursReviewRow(decPainter), true)

    const review = readFileSync(reviewUiPath, 'utf8')
    assert.match(review, /readOnly=\{scanDerived\}/)
    assert.match(review, /if \(scanDerivedSignInTradeHoursReviewRow\(row\)\) return/)

    const unchanged = reviewRows
    assert.equal(unchanged.find((r) => r.key === decPainter.key).workers, 2)
    assert.equal(unchanged.find((r) => r.key === decPainter.key).hours, 7.5)
  })

  it('move row17 architect to Visitors: no Decoration+Illegible double ownership', () => {
    const operatives = buildScanOperatives()
    let reviewRows = productionHandleSignInSheetReviewFromScan(operatives)
    const ill = reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY)
    reviewRows = productionHandleScanTradeHoursReviewChange(
      renameSignInTradeHoursRow(reviewRows, ill.key, 'Decoration'),
    )
    const dec = reviewRows.find((r) => r.trade === 'Decoration')
    assert.equal(dec.hours, 11.25)
    assert.ok((dec.rowIds || []).includes(OP15))
    const arch = reviewRows.find((r) => (r.rowIds || []).includes(OP17))
    assert.ok(arch)

    const moved = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows,
      reviewRowKey: arch.key,
      operativeId: OP17,
      existingVisitorsText: '',
      tradeLabel: 'Architect',
    })
    assert.equal(moved.ok, true)
    assert.equal(moved.reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY), undefined)
    assert.equal(totalSignInTradeHoursReview(moved.reviewRows), 66.75)
    assert.equal(moved.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 11)
    assert.ok(!moved.reviewRows.some((r) => (r.rowIds || []).includes(OP17)))
    assert.equal(
      moved.visitorsText,
      'Architect · 13:30–16:00 · Sign-in row 17',
    )
  })

  it('move Architect to Visitors drops manual placeholder row and clears needs review', () => {
    const operatives = buildScanOperatives()
    let reviewRows = productionHandleSignInSheetReviewFromScan(operatives)
    const ill = reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY)
    reviewRows = productionHandleScanTradeHoursReviewChange(
      renameSignInTradeHoursRow(reviewRows, ill.key, 'Decoration'),
    )
    reviewRows = addSignInTradeHoursRow(reviewRows)
    assert.equal(reviewRows.length, 7)
    assert.ok(reviewRows.some(isSignInTradeHoursReviewPlaceholderRow))

    const arch = reviewRows.find((r) => (r.rowIds || []).includes(OP17))
    assert.ok(arch)

    const moved = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows,
      reviewRowKey: arch.key,
      operativeId: OP17,
      existingVisitorsText: '',
      tradeLabel: 'Architect',
    })
    assert.equal(moved.ok, true)
    assert.equal(moved.reviewRows.length, 5)
    assert.ok(!moved.reviewRows.some(isSignInTradeHoursReviewPlaceholderRow))
    const counts = countSignInTradeHoursReviewRows(moved.reviewRows)
    assert.equal(counts.needsReviewCount, 0)
    assert.equal(counts.resolvedTradeCount, 5)
    assert.equal(moved.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 11)
    assert.equal(totalSignInTradeHoursReview(moved.reviewRows), 66.75)
  })

  it('retry scan + trade merge + exclude architect: no rogue Illegible after row17 remove', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)

    const freshOps = operativesAfterFreshScan(baseline.operatives)
    let reviewRows = productionHandleSignInSheetReviewFromScan(freshOps)
    const ill = reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY)
    reviewRows = productionHandleScanTradeHoursReviewChange(
      renameSignInTradeHoursRow(reviewRows, ill.key, 'Decoration'),
    )
    const dec = reviewRows.find((r) => r.trade === 'Decoration')
    assert.equal(dec.hours, 11.25)
    assert.ok((dec.rowIds || []).includes(OP15))
    const arch = reviewRows.find((r) => (r.rowIds || []).includes(OP17))
    assert.ok(arch)

    const removed = productionHandleOperativeLabourExclusion(freshOps, reviewRows, {
      reviewRowKey: arch.key,
      operativeId: OP17,
      exclude: true,
    })
    assert.equal(removed.ok, true)
    assert.equal(removed.reviewRows.find((r) => r.key === SIGNIN_ILLEGIBLE_TRADE_KEY), undefined)
    assert.equal(totalSignInTradeHoursReview(removed.reviewRows), 66.75)
  })
})
