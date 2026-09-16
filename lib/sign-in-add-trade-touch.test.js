import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  addSignInTradeHoursRow,
  isSignInTradeHoursReviewPlaceholderRow,
  signInAddTradeAddsRowOnPointerDown,
  signInAddTradeClickShouldAddRow,
  signInAddTradePeakMovementPx,
  signInAddTradeShouldActivateAfterPointerUp,
  SIGN_IN_ADD_TRADE_TAP_MOVE_THRESHOLD_PX,
  signInAddTradeTapMovementWithinThreshold,
  signInAddTradeUsesTapUpActivation,
  removeManualSignInTradeHoursRow,
  simulateSignInAddTradeTouchSequence,
  signInTradeHoursReviewRowIsManualOnly,
  totalSignInTradeHoursReview,
} from './sign-in-trade-hours-review.js'
import { countSignInTradeHoursReviewRows } from './labour-from-register.js'
import {
  buildAcceptedMergedBaseline,
  buildScanOperatives,
} from './sign-in-labour-row17-op15-regression.test.js'

const reviewPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'components',
  'diary',
  'SignInOperativeReview.jsx',
)

describe('Sign-in Add trade touch activation', () => {
  it('A: touch pointerdown alone does not add a row', () => {
    assert.equal(signInAddTradeAddsRowOnPointerDown(), false)
    assert.equal(signInAddTradeUsesTapUpActivation('touch', false), true)
    let rows = [{ key: 'a', trade: 'Labour', workers: 2, hours: 8, hoursComplete: true, needsReview: false }]
    assert.equal(rows.length, 1)
  })

  it('B: touch pointerup within movement threshold adds one row', () => {
    const threshold = SIGN_IN_ADD_TRADE_TAP_MOVE_THRESHOLD_PX
    assert.equal(
      signInAddTradeShouldActivateAfterPointerUp({
        startX: 10,
        startY: 20,
        endX: 10 + threshold - 1,
        endY: 20,
        cancelled: false,
      }),
      true,
    )
    let rows = []
    rows = addSignInTradeHoursRow(rows)
    assert.equal(rows.length, 1)
    assert.equal(isSignInTradeHoursReviewPlaceholderRow(rows[0]), true)
  })

  it('C: touch move beyond threshold then pointerup adds nothing', () => {
    const threshold = SIGN_IN_ADD_TRADE_TAP_MOVE_THRESHOLD_PX
    assert.equal(
      signInAddTradeTapMovementWithinThreshold(threshold + 1, 0, threshold),
      false,
    )
    assert.equal(
      signInAddTradeShouldActivateAfterPointerUp({
        startX: 0,
        startY: 0,
        endX: threshold + 5,
        endY: 0,
        cancelled: false,
      }),
      false,
    )
    const peak = signInAddTradePeakMovementPx(0, 0, threshold + 8, 0, 0)
    assert.equal(
      signInAddTradeShouldActivateAfterPointerUp({
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        maxMovementPx: peak,
        cancelled: false,
      }),
      false,
    )
  })

  it('D: pointercancel does not activate Add trade', () => {
    assert.equal(
      signInAddTradeShouldActivateAfterPointerUp({
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        cancelled: true,
      }),
      false,
    )
  })

  it('E: intentional touch does not double-add through follow-up click', () => {
    assert.equal(
      signInAddTradeClickShouldAddRow({ pointerType: 'touch', suppressSyntheticClick: true }),
      false,
    )
    assert.equal(
      signInAddTradeClickShouldAddRow({ pointerType: 'touch', suppressSyntheticClick: false }),
      false,
    )
    const tap = simulateSignInAddTradeTouchSequence({
      pointerTypeDown: 'touch',
      endX: 2,
      endY: 1,
      clickPointerType: '',
    })
    assert.equal(tap.rowsAdded, 1)
    assert.equal(tap.clickWouldAdd, false)
  })

  it('F: mouse click may add a row', () => {
    assert.equal(
      signInAddTradeClickShouldAddRow({ pointerType: 'mouse', suppressSyntheticClick: false }),
      true,
    )
    let rows = [{ key: 'a', trade: 'Labour', workers: 1, hours: 8, hoursComplete: true, needsReview: false }]
    rows = addSignInTradeHoursRow(rows)
    assert.equal(rows.length, 2)
  })

  it('G: keyboard / native click path may add a row', () => {
    assert.equal(
      signInAddTradeClickShouldAddRow({ pointerType: '', suppressSyntheticClick: false }),
      true,
    )
    assert.equal(
      signInAddTradeClickShouldAddRow({ pointerType: undefined, suppressSyntheticClick: false }),
      true,
    )
  })

  it('H: intentional newly-added placeholder remains editable and is not auto-pruned', () => {
    let rows = addSignInTradeHoursRow([])
    assert.equal(rows.length, 1)
    assert.equal(isSignInTradeHoursReviewPlaceholderRow(rows[0]), true)
    assert.equal(rows[0].rowIds.length, 0)
    assert.equal(rows[0].needsReview, true)
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /pruneSignInTradeHoursReviewPlaceholders/)
    assert.doesNotMatch(review, /pruneDepletedSignInTradeHoursReviewRows/)
  })

  it('I: accepted labour fixture before intentional Add trade stays 5 trades / 11 / 66.75', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)
    assert.equal(baseline.reviewRows.length, 5)
    assert.equal(
      baseline.reviewRows.reduce((s, r) => s + (r.workers || 0), 0),
      11,
    )
    assert.equal(totalSignInTradeHoursReview(baseline.reviewRows), 66.75)
    const withPlaceholder = addSignInTradeHoursRow(baseline.reviewRows)
    assert.equal(withPlaceholder.length, 6)
    assert.equal(totalSignInTradeHoursReview(withPlaceholder), 66.75)
  })

  it('review UI wires tap-up touch tracking and click gating', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /onPointerDown=\{handleAddTradePointerDown\}/)
    assert.match(review, /onClick=\{handleAddTradeClick\}/)
    assert.match(review, /signInAddTradeShouldActivateAfterPointerUp/)
    assert.match(review, /signInAddTradePeakMovementPx/)
    assert.match(review, /signInAddTradeClickShouldAddRow/)
    assert.match(review, /suppressAddTradeClickRef/)
    assert.match(review, /addTradeTouchGestureActiveRef/)
    assert.match(review, /pointermove/)
    assert.doesNotMatch(review, /handleAddTradePointerDown[\s\S]*preventDefault\(\)[\s\S]*appendAddTradeRow/)
  })

  it('Android scroll sequence: down, move past threshold, release => no row; synthetic click blocked', () => {
    const threshold = SIGN_IN_ADD_TRADE_TAP_MOVE_THRESHOLD_PX
    const scroll = simulateSignInAddTradeTouchSequence({
      pointerTypeDown: 'touch',
      moves: [{ x: 0, y: threshold + 20 }, { x: 0, y: threshold + 40 }],
      endX: 0,
      endY: threshold + 5,
      clickPointerType: '',
    })
    assert.equal(scroll.rowsAdded, 0)
    assert.equal(scroll.clickWouldAdd, false)
  })

  it('deliberate tap-up adds one row only', () => {
    const tap = simulateSignInAddTradeTouchSequence({
      pointerTypeDown: 'touch',
      moves: [{ x: 1, y: 0 }],
      endX: 2,
      endY: 0,
      clickPointerType: '',
    })
    assert.equal(tap.rowsAdded, 1)
  })

  it('accepted 6 Sep review unchanged by scroll gesture; no placeholder without add', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)
    const trades = baseline.reviewRows.map((r) => r.trade).sort()
    assert.deepEqual(trades, ['Decoration', 'Electrical', 'Joinery', 'Labour', 'Mechanical'])
    assert.equal(baseline.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 11)
    assert.equal(totalSignInTradeHoursReview(baseline.reviewRows), 66.75)
    assert.equal(
      baseline.reviewRows.some((r) => isSignInTradeHoursReviewPlaceholderRow(r)),
      false,
    )
    const scroll = simulateSignInAddTradeTouchSequence({
      pointerTypeDown: 'touch',
      moves: [{ x: 0, y: 30 }],
      endX: 0,
      endY: 8,
      clickPointerType: '',
    })
    assert.equal(scroll.rowsAdded, 0)
    assert.equal(baseline.reviewRows.length, 5)
  })

  it('add one manual row then Remove restores 5 trades and 11 / 66.75 with needsReview 0', () => {
    const operatives = buildScanOperatives()
    const baseline = buildAcceptedMergedBaseline(operatives)
    let rows = addSignInTradeHoursRow(baseline.reviewRows)
    const manual = rows.find((r) => signInTradeHoursReviewRowIsManualOnly(r))
    assert.ok(manual)
    assert.equal(countSignInTradeHoursReviewRows(rows).needsReviewCount, 1)
    rows = removeManualSignInTradeHoursRow(rows, manual.key)
    assert.equal(rows.length, 5)
    assert.deepEqual(
      rows.map((r) => r.trade).sort(),
      ['Decoration', 'Electrical', 'Joinery', 'Labour', 'Mechanical'],
    )
    assert.equal(rows.reduce((s, r) => s + (r.workers || 0), 0), 11)
    assert.equal(totalSignInTradeHoursReview(rows), 66.75)
    assert.equal(countSignInTradeHoursReviewRows(rows).needsReviewCount, 0)
  })
})
