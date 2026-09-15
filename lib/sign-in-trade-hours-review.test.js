import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addSignInTradeHoursRow,
  signInAddTradeUsesPointerDownActivation,
  formatSignInTradeHoursReviewStatus,
  initSignInTradeHoursReviewFromOperatives,
  parseSignInTradeHoursInput,
  removeSignInTradeHoursRow,
  renameSignInTradeHoursRow,
  setSignInTradeHoursRowHours,
  formatLabourHoursForDisplay,
  totalSignInTradeHoursReview,
  applyOperativeLabourExclusionToReview,
  applyOperativeMoveToVisitorsFromReview,
  appendVisitorNarrative,
  upsertSignInDerivedVisitorLine,
  signInVisitorIdentityKeyFromLine,
  formatVisitorLineFromSignInOperative,
  formatSignInOperativeLabourLine,
  SIGNIN_LABOUR_EXCLUSION_HOURS_CONFLICT_MESSAGE,
  SIGNIN_LABOUR_EXCLUSION_WORKERS_CONFLICT_MESSAGE,
  setSignInTradeHoursRowWorkers,
  scanDerivedSignInTradeHoursReviewRow,
  pruneDepletedSignInTradeHoursReviewRows,
  signInTradeReviewRowPeoplePanelAnchor,
  signInTradeReviewRowsPresenceKey,
  resolveOpenAdjustPeopleRowKey,
  shouldClearPeoplePanelAnchor,
} from './sign-in-trade-hours-review.js'
import {
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
  countSignInTradeHoursReviewRows,
} from './labour-from-register.js'

const REGISTER_EVIDENCE = 'uid/report-a/sign-in-sheet/1000.jpg'

function peoplePanelAnchorForRows(row, rows) {
  return {
    rowKey: row.key,
    anchor: signInTradeReviewRowPeoplePanelAnchor(row),
    rowsPresenceKey: signInTradeReviewRowsPresenceKey(rows),
  }
}

function assertOpenPanel(adjustPeopleRowKey, rows, panelAnchor, expectedKey) {
  const presenceKey = signInTradeReviewRowsPresenceKey(rows)
  const effectiveAnchor = shouldClearPeoplePanelAnchor(panelAnchor, presenceKey) ? null : panelAnchor
  assert.equal(
    resolveOpenAdjustPeopleRowKey(adjustPeopleRowKey, rows, effectiveAnchor, presenceKey),
    expectedKey,
  )
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')
const labourHookPath = join(root, 'components/diary/useSiteDiaryLabour.js')
const labourSectionPath = join(root, 'components/diary/SiteDiaryLabourSection.jsx')
const helperPath = join(root, 'lib/sign-in-trade-hours-review.js')
const pipelinePath = join(root, 'lib/parse-signin-sheet-claude-pipeline.js')
const labourPath = join(root, 'lib/labour-from-register.js')
const headerPath = join(root, 'lib/parse-signin-sheet-claude-benchmark.js')

function operative(partial) {
  return {
    id: partial.id || `r-${Math.random().toString(16).slice(2, 8)}`,
    source_row: partial.source_row ?? null,
    person_name: partial.person_name ?? 'Should Not Appear',
    trade: partial.trade ?? 'Labourer',
    company: partial.company ?? 'Should Not Appear Co',
    time_in: partial.time_in ?? '08:00',
    time_out: partial.time_out ?? '16:00',
    dateStatus: partial.dateStatus ?? 'match',
    included: partial.included !== false,
    excludedFromLabour: partial.excludedFromLabour === true,
    movedToVisitors: partial.movedToVisitors === true,
  }
}

describe('Sign-in Trade + Hours reviewed summary edits', () => {
  it('A: OCR summary initializes from Trade + Hours aggregation', () => {
    const { rows, otherDateCount } = initSignInTradeHoursReviewFromOperatives([
      operative({ trade: 'Electrician', time_in: '08:00', time_out: '16:00' }),
      operative({ trade: 'Joiner', time_in: '07:00', time_out: '15:00' }),
      operative({
        trade: 'Labourer',
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'other',
        included: true,
      }),
    ])
    assert.equal(otherDateCount, 1)
    assert.equal(rows.length, 2)
    const byTrade = Object.fromEntries(rows.map((r) => [r.trade, r.hours]))
    assert.equal(byTrade.Electrical, 8)
    assert.equal(byTrade.Joinery, 8)
    assert.equal(totalSignInTradeHoursReview(rows), 16)
  })

  it('B: Trade can be edited', () => {
    let { rows } = initSignInTradeHoursReviewFromOperatives([
      operative({ trade: 'Scaff', time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(rows[0].trade, 'Scaffolding')
    const key = rows[0].key
    rows = renameSignInTradeHoursRow(rows, key, 'Electrical')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, 'Electrical')
    assert.equal(rows[0].hours, 8)
  })

  it('C+D: editing Scaffolding -> Electrical merges into existing Electrical (8+8=16)', () => {
    let { rows } = initSignInTradeHoursReviewFromOperatives([
      operative({ trade: 'Electrician', time_in: '08:00', time_out: '16:00' }),
      operative({ trade: 'Scaff', time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(rows.length, 2)
    const scaff = rows.find((r) => r.trade === 'Scaffolding')
    rows = renameSignInTradeHoursRow(rows, scaff.key, 'electrical')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, 'electrical')
    assert.equal(rows[0].hours, 16)
    assert.equal(totalSignInTradeHoursReview(rows), 16)
  })

  it('E: Hours can be edited (Painter 11.3 -> 7.5)', () => {
    let rows = [
      {
        key: 't:painter',
        trade: 'Painter',
        hours: 11.3,
        hoursComplete: true,
        needsReview: false,
      },
    ]
    rows = setSignInTradeHoursRowHours(rows, 't:painter', '7.5')
    assert.equal(rows[0].hours, 7.5)
    assert.equal(rows[0].hoursComplete, true)
    assert.equal(rows[0].needsReview, false)
  })

  it('S10 accepted 6 Sep trade totals sum to 66.75 and display as 66.75 not 66.8', () => {
    const rows = [
      { key: 'dec', trade: 'Decoration', hours: 11.25, hoursComplete: true, needsReview: false },
      { key: 'ele', trade: 'Electrical', hours: 16, hoursComplete: true, needsReview: false },
      { key: 'joi', trade: 'Joinery', hours: 16, hoursComplete: true, needsReview: false },
      { key: 'lab', trade: 'Labour', hours: 15.5, hoursComplete: true, needsReview: false },
      { key: 'mec', trade: 'Mechanical', hours: 8, hoursComplete: true, needsReview: false },
    ]
    assert.equal(totalSignInTradeHoursReview(rows), 66.75)
    assert.equal(formatLabourHoursForDisplay(totalSignInTradeHoursReview(rows)), '66.75')
    assert.notEqual(formatLabourHoursForDisplay(totalSignInTradeHoursReview(rows)), '66.8')
    assert.equal(formatLabourHoursForDisplay(16), '16')
    assert.equal(formatLabourHoursForDisplay(15.5), '15.5')
    assert.equal(formatLabourHoursForDisplay(11.25), '11.25')
  })

  it('F: TOTAL recalculates immediately after edits', () => {
    let rows = [
      { key: 'a', trade: 'Electrical', hours: 16, hoursComplete: true, needsReview: false },
      { key: 'b', trade: 'Joinery', hours: 16, hoursComplete: true, needsReview: false },
      { key: 'c', trade: 'Labour', hours: 15.5, hoursComplete: true, needsReview: false },
      { key: 'd', trade: 'Decoration', hours: 11.3, hoursComplete: true, needsReview: false },
      { key: 'e', trade: 'Mechanical', hours: 8, hoursComplete: true, needsReview: false },
    ]
    assert.equal(totalSignInTradeHoursReview(rows), 66.8)
    rows = setSignInTradeHoursRowHours(rows, 'd', '7.5')
    assert.equal(totalSignInTradeHoursReview(rows), 63)
  })

  it('+ Add trade uses one-touch pointerdown activation on mobile', () => {
    assert.equal(signInAddTradeUsesPointerDownActivation('touch', false), true)
    assert.equal(signInAddTradeUsesPointerDownActivation('pen', false), true)
    assert.equal(signInAddTradeUsesPointerDownActivation('mouse', false), false)
    assert.equal(signInAddTradeUsesPointerDownActivation('touch', true), false)
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /onPointerDown=\{handleAddTradePointerDown\}/)
    assert.match(review, /onClick=\{handleAddTrade\}/)
    assert.match(review, /signInAddTradeUsesPointerDownActivation/)
    let rows = [{ key: 'a', trade: 'Labour', hours: 8, hoursComplete: true, needsReview: false }]
    const before = rows.length
    rows = addSignInTradeHoursRow(rows)
    assert.equal(rows.length, before + 1)
    assert.equal(rows[rows.length - 1].trade, '')
    assert.equal(rows[rows.length - 1].needsReview, true)
  })

  it('G: A summary row can be removed', () => {
    let { rows } = initSignInTradeHoursReviewFromOperatives([
      operative({ trade: 'Electrician' }),
      operative({ trade: 'Joiner' }),
    ])
    const key = rows.find((r) => r.trade === 'Joinery').key
    rows = removeSignInTradeHoursRow(rows, key)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, 'Electrical')
  })

  it('H: A summary row can be added', () => {
    let rows = []
    rows = addSignInTradeHoursRow(rows)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, '')
    assert.equal(rows[0].hoursComplete, false)
    assert.equal(rows[0].needsReview, true)
  })

  it('I: Invalid/negative hours are not accepted', () => {
    assert.equal(parseSignInTradeHoursInput('-1').ok, false)
    assert.equal(parseSignInTradeHoursInput('abc').ok, false)
    assert.equal(parseSignInTradeHoursInput('8.5.5').ok, false)
    assert.equal(parseSignInTradeHoursInput('7.5').ok, true)
    assert.equal(parseSignInTradeHoursInput('7.75').hours, 7.75)
    assert.equal(parseSignInTradeHoursInput('3.75').hours, 3.75)
    assert.equal(parseSignInTradeHoursInput('8').hours, 8)

    const prior = [
      { key: 'p', trade: 'Painter', hours: 11.3, hoursComplete: true, needsReview: false },
    ]
    const rejected = setSignInTradeHoursRowHours(prior, 'p', '-2')
    assert.equal(rejected[0].hours, 11.3)
    const rejected2 = setSignInTradeHoursRowHours(prior, 'p', 'nope')
    assert.equal(rejected2[0].hours, 11.3)
  })

  it('J: Original OCR clocks are not fabricated/rewritten for an hours override', () => {
    const operatives = [
      operative({
        id: 'op-1',
        trade: 'Painter',
        time_in: '12:30',
        time_out: '16:15',
      }),
    ]
    const clocksBefore = JSON.stringify(
      operatives.map((o) => ({ id: o.id, time_in: o.time_in, time_out: o.time_out })),
    )
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    rows = setSignInTradeHoursRowHours(rows, rows[0].key, '7.5')
    assert.equal(rows[0].hours, 7.5)
    const clocksAfter = JSON.stringify(
      operatives.map((o) => ({ id: o.id, time_in: o.time_in, time_out: o.time_out })),
    )
    assert.equal(clocksAfter, clocksBefore)
    assert.equal(operatives[0].time_in, '12:30')
    assert.equal(operatives[0].time_out, '16:15')

    const helper = readFileSync(helperPath, 'utf8')
    assert.doesNotMatch(helper, /time_in\s*=/)
    assert.doesNotMatch(helper, /time_out\s*=/)
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /time_in/)
    assert.doesNotMatch(review, /time_out/)
  })

  it('K: New Retry/Replace scan resets previous review overrides (wiring)', () => {
    const hook = readFileSync(labourHookPath, 'utf8')
    assert.match(hook, /initSignInTradeHoursReviewFromOperatives/)
    assert.match(hook, /setScanTradeHoursReview\(\[\]\)/)
    assert.match(hook, /setScanTradeHoursReviewReady\(false\)/)
    // Replace / retry path clears before OCR, then reinits from new operatives
    assert.match(
      hook,
      /setScanOperatives\(\[\]\)[\s\S]*setScanTradeHoursReview\(\[\]\)[\s\S]*setScanTradeHoursReviewReady\(false\)/,
    )
    assert.match(
      hook,
      /const reviewed = initSignInTradeHoursReviewFromOperatives\(operatives\)[\s\S]*setScanTradeHoursReview\(reviewed\.rows\)/,
    )
  })

  it('L: Remove image clears reviewed summary state', () => {
    const hook = readFileSync(labourHookPath, 'utf8')
    assert.match(hook, /clearSignInSheetWorkingState/)
    assert.match(
      hook,
      /setScanOperatives\(empty\.scanOperatives\)[\s\S]*setScanTradeHoursReview\(\[\]\)[\s\S]*setScanTradeHoursReviewReady\(false\)/,
    )
  })

  it('M: illegible row corrected to existing trade merges (Electrical)', () => {
    let rows = [
      {
        key: 't:electrical',
        trade: 'Electrical',
        workers: 2,
        hours: 16,
        hoursComplete: true,
        needsReview: false,
      },
      {
        key: SIGNIN_ILLEGIBLE_TRADE_KEY,
        trade: SIGNIN_ILLEGIBLE_TRADE_LABEL,
        workers: 1,
        hours: 8,
        hoursComplete: true,
        needsReview: true,
      },
    ]
    rows = renameSignInTradeHoursRow(rows, SIGNIN_ILLEGIBLE_TRADE_KEY, 'Electrical')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].trade, 'Electrical')
    assert.equal(rows[0].workers, 3)
    const counts = countSignInTradeHoursReviewRows(rows)
    assert.equal(counts.resolvedTradeCount, 1)
    assert.equal(counts.needsReviewCount, 0)
  })

  it('N: status copy for 5 resolved + 1 needs review', () => {
    assert.equal(formatSignInTradeHoursReviewStatus(5, 1), '5 trades · 1 needs review')
  })

  it('O: other-date operatives do not inflate review trade counts', () => {
    const { rows, otherDateCount } = initSignInTradeHoursReviewFromOperatives([
      operative({ trade: 'Electrician' }),
      operative({ trade: 'Joiner', dateStatus: 'other' }),
      operative({ trade: 'Labourer', dateStatus: 'other' }),
      operative({ trade: 'Painter', dateStatus: 'other' }),
      operative({ trade: 'Plumber', dateStatus: 'other' }),
    ])
    assert.equal(otherDateCount, 4)
    assert.equal(rows.length, 1)
    const counts = countSignInTradeHoursReviewRows(rows)
    assert.equal(counts.resolvedTradeCount, 1)
    assert.equal(counts.needsReviewCount, 0)
  })

  it('review UI has Trade / Workers / Hours on site without per-row delete control', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, />Trade</)
    assert.match(review, />Workers</)
    assert.match(review, /Hours on site/)
    assert.doesNotMatch(review, /removeSignInTradeHoursRow/)
    assert.doesNotMatch(review, /Remove \$\{t\.trade/)
    assert.doesNotMatch(review, /aria-label=\{`Remove/)
  })

  it('M: Trade + Workers + hours on site only — no names, company, breaks, or net hours', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /Hours on site/)
    assert.match(review, />Trade</)
    assert.match(review, />Workers</)
    assert.doesNotMatch(review, /\bGross\b/)
    assert.doesNotMatch(review, /\bNet hours\b/)
    assert.doesNotMatch(review, /\bNet\b/)
    assert.doesNotMatch(review, /Break deduction/)
    assert.doesNotMatch(review, /person_name/)
    assert.doesNotMatch(review, /Labour by company/)
    assert.doesNotMatch(review, /\bcompany\b/i)
    assert.match(review, /\+ Add trade/)
  })

  it('N: Existing Replace / Remove / Retry controls remain available', () => {
    const section = readFileSync(labourSectionPath, 'utf8')
    const hook = readFileSync(labourHookPath, 'utf8')
    assert.match(section, /Take new photo/)
    assert.match(section, /Delete photo/)
    assert.match(section, /Re-scan/)
    assert.match(hook, /clearSignInSheetWorkingState/)
    assert.match(section, /retrySignInScan/)
    assert.equal([...section.matchAll(/>\s*Re-scan\s*</g)].length, 1)
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /Re-scan/)
  })

  it('Needs review clears after a valid manual hours correction', () => {
    let rows = [
      {
        key: 't:painter',
        trade: 'Painter',
        hours: null,
        hoursComplete: false,
        needsReview: true,
      },
    ]
    rows = setSignInTradeHoursRowHours(rows, 't:painter', '7.5')
    assert.equal(rows[0].needsReview, false)
    assert.equal(rows[0].hoursComplete, true)
    assert.equal(rows[0].hours, 7.5)
  })

  it('P: init propagates rowIds for Adjust people', () => {
    const { rows } = initSignInTradeHoursReviewFromOperatives([
      operative({ id: 'a', trade: 'Electrician', source_row: 3 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 4 }),
    ])
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].rowIds.sort(), ['a', 'b'])
    assert.equal(rows[0].workers, 2)
  })
})

describe('Sign-in per-operative labour exclusion', () => {
  it('excludes one operative from a multi-person aggregate', () => {
    const operatives = [
      operative({ id: 'a', trade: 'QS', source_row: 2, time_in: '09:00', time_out: '17:00' }),
      operative({ id: 'b', trade: 'Labourer', source_row: 5 }),
      operative({ id: 'c', trade: 'Labourer', source_row: 6 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const labour = rows.find((r) => r.trade === 'Labour')
    const qs = rows.find((r) => r.trade === 'QS' || r.trade.includes('QS'))
    assert.equal(labour.workers, 2)
    assert.equal(labour.hours, 16)
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: labour.key,
      operativeId: 'b',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.operatives.find((o) => o.id === 'b').excludedFromLabour, true)
    assert.equal(result.reviewRows.length, 2)
    const labourAfter = result.reviewRows.find((r) => r.key === labour.key)
    assert.equal(labourAfter.workers, 1)
    assert.equal(labourAfter.hours, 8)
    assert.equal(totalSignInTradeHoursReview(result.reviewRows), 16)
  })

  it('removes aggregate when last productive operative is excluded', () => {
    const operatives = [
      operative({ id: 'qs', trade: 'QS', source_row: 7, time_in: '09:00', time_out: '17:00' }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].workers, 1)
    assert.equal(rows[0].hours, 8)
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'qs',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows.length, 0)
    assert.equal(totalSignInTradeHoursReview(result.reviewRows), 0)
    assert.equal(result.operatives[0].excludedFromLabour, true)
    assert.equal(result.operatives[0].dateStatus, 'match')
  })

  it('re-including restores workers and hours', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const key = rows[0].key
    let state = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: key,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(state.reviewRows[0].workers, 1)
    state = applyOperativeLabourExclusionToReview({
      operatives: state.operatives,
      reviewRows: state.reviewRows,
      reviewRowKey: key,
      operativeId: 'a',
      exclude: false,
    })
    assert.equal(state.ok, true)
    assert.equal(state.reviewRows[0].workers, 2)
    assert.equal(state.reviewRows[0].hours, 16)
  })

  it('preserves quarter-hour precision (66.75 total, exclude 8.25)', () => {
    const operatives = []
    for (let i = 0; i < 8; i += 1) {
      operatives.push(
        operative({
          id: `e${i}`,
          trade: 'Electrician',
          source_row: i + 1,
          time_in: '08:00',
          time_out: '16:15',
        }),
      )
    }
    operatives.push(
      operative({
        id: 'short',
        trade: 'Electrician',
        source_row: 9,
        time_in: '08:00',
        time_out: '08:45',
      }),
    )
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    assert.equal(rows[0].hours, 66.75)
    assert.equal(formatLabourHoursForDisplay(totalSignInTradeHoursReview(rows)), '66.75')
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'e0',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows[0].hours, 58.5)
    assert.equal(formatLabourHoursForDisplay(totalSignInTradeHoursReview(result.reviewRows)), '58.5')
  })

  it('does not reset unrelated manually edited review rows', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Joiner', source_row: 2 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const joinerKey = rows.find((r) => r.trade === 'Joinery').key
    rows = setSignInTradeHoursRowHours(rows, joinerKey, '7.5')
    const electricalKey = rows.find((r) => r.trade === 'Electrical').key
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: electricalKey,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows.length, 1)
    assert.equal(result.reviewRows[0].trade, 'Joinery')
    assert.equal(result.reviewRows[0].hours, 7.5)
    assert.equal(result.reviewRows[0].hoursManuallyEdited, true)
  })

  it('other-date operatives stay out of aggregates independently', () => {
    const operatives = [
      operative({ id: 'm', trade: 'Electrician' }),
      operative({ id: 'o', trade: 'Client', dateStatus: 'other', source_row: 99 }),
    ]
    const { rows, otherDateCount } = initSignInTradeHoursReviewFromOperatives(operatives)
    assert.equal(otherDateCount, 1)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].rowIds, ['m'])
    operatives[1].excludedFromLabour = true
    const { rows: rows2 } = initSignInTradeHoursReviewFromOperatives(operatives)
    assert.equal(rows2.length, 1)
    assert.equal(rows2[0].workers, 1)
  })

  it('blocks exclusion when manual workers conflict with operative count', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    rows = setSignInTradeHoursRowWorkers(rows, rows[0].key, '3')
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'workers-conflict')
    assert.equal(result.conflict, SIGNIN_LABOUR_EXCLUSION_WORKERS_CONFLICT_MESSAGE)
  })

  it('allows exclusion when manual workers still match operative count', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    rows = setSignInTradeHoursRowWorkers(rows, rows[0].key, '2')
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows[0].workers, 1)
    assert.equal(result.reviewRows[0].workersManuallyEdited, false)
  })

  it('blocks exclusion when manual hours conflict with operative sum', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    rows = setSignInTradeHoursRowHours(rows, rows[0].key, '15')
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'hours-conflict')
    assert.equal(result.conflict, SIGNIN_LABOUR_EXCLUSION_HOURS_CONFLICT_MESSAGE)
  })

  it('people panel stays closed after trade row disappears and same key returns (stale-key regression)', () => {
    const archKey = 't:Architect'
    const decKey = 't:Decoration'
    const archRow = { key: archKey, trade: 'Architect', rowIds: ['op-arch'], workers: 1, hours: 2.5 }
    const decRow = { key: decKey, trade: 'Decoration', rowIds: ['op-dec'], workers: 3, hours: 11.25 }

    let adjustPeopleRowKey = archKey

    let rows = [archRow, decRow]
    let panelAnchor = peoplePanelAnchorForRows(archRow, rows)
    assertOpenPanel(adjustPeopleRowKey, rows, panelAnchor, archKey)

    rows = [decRow]
    const decorationOnlyPresence = signInTradeReviewRowsPresenceKey(rows)
    assert.equal(shouldClearPeoplePanelAnchor(panelAnchor, decorationOnlyPresence), true)
    assert.equal(
      resolveOpenAdjustPeopleRowKey(adjustPeopleRowKey, rows, null, decorationOnlyPresence),
      null,
    )

    rows = [archRow, decRow]
    panelAnchor = null
    assertOpenPanel(adjustPeopleRowKey, rows, panelAnchor, null)

    panelAnchor = peoplePanelAnchorForRows(archRow, rows)
    assertOpenPanel(adjustPeopleRowKey, rows, panelAnchor, archKey)
  })

  it('⋯ opens People on trade panel directly without intermediate menu', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /Review people/)
    assert.doesNotMatch(review, /role="menuitem"/)
    assert.match(review, /peoplePanelAnchor/)
    assert.match(review, /signInTradeReviewRowPeoplePanelAnchor\(t\)/)
    assert.match(review, /signInTradeReviewRowsPresenceKey/)
    assert.match(review, /shouldClearPeoplePanelAnchor/)
    assert.match(review, /setAdjustPeopleRowKey\(\(prev\) =>/)
    assert.match(review, /People on \{t\.trade \|\| 'this trade'\}/)
    assert.match(review, /Move to Visitors/)
    assert.match(review, /Exclude from labour/)
    assert.match(review, /Include in labour/)
    assert.doesNotMatch(review, /removeSignInTradeHoursRow/)
    const moveIdx = review.indexOf('Move to Visitors')
    const excludeIdx = review.indexOf('Exclude from labour')
    assert.ok(moveIdx > 0 && excludeIdx > moveIdx)
  })

  it('People on trade panel omits redundant trade on each operative line', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /formatSignInOperativeLabourLine\(op, t\.trade, \{\s*includeTradeSuffix: false/)
    const op = operative({
      trade: 'Decoration',
      source_row: 13,
      time_in: '12:30',
      time_out: '16:15',
    })
    const panelLine = formatSignInOperativeLabourLine(op, 'Decoration', { includeTradeSuffix: false })
    assert.doesNotMatch(panelLine, /Decoration/)
    assert.match(panelLine, /^Row 13 · 12:30–16:15 · [\d.]+ hrs$/)
    const legacyLine = formatSignInOperativeLabourLine(op, 'Decoration')
    assert.match(legacyLine, / · Decoration$/)
  })

  it('People on trade panel places Move and Exclude actions side-by-side with touch targets', () => {
    const review = readFileSync(reviewPath, 'utf8')
    const panelStart = review.indexOf('People on {t.trade')
    const panelEnd = review.indexOf(
      "{excluded ? 'Include in labour' : 'Exclude from labour'}",
      panelStart,
    )
    assert.ok(panelStart > 0 && panelEnd > panelStart)
    const panel = review.slice(panelStart, panelEnd + 800)
    assert.match(panel, /flexWrap: 'wrap'/)
    assert.match(panel, /minHeight: 44/)
    assert.match(panel, /flex: '1 1 140px'/)
    const actionsStart = panel.indexOf("flexWrap: 'wrap'")
    const actionsEnd = panel.indexOf('Include in labour', actionsStart)
    const actionsBlock = panel.slice(actionsStart, actionsEnd)
    assert.doesNotMatch(actionsBlock, /flexDirection: 'column'/)
  })

  it('review UI uses Attendance Register terminology and Labour Attendance Summary apply label', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /Labour from Attendance Register/)
    assert.match(review, /to Labour Attendance Summary/)
    assert.doesNotMatch(review, /sign-in sheet/i)
  })

  it('review UI: scan-derived rows read-only Workers/Hours; manual Add trade rows editable', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /scanDerivedSignInTradeHoursReviewRow/)
    assert.match(review, /readOnly=\{scanDerived\}/)
    assert.match(review, /scanDerivedSignInTradeHoursReviewRow\(row\)\) return/)
    assert.match(
      review,
      /Use ⋯ to correct scan errors or separate visitors from production workers\./,
    )
    assert.match(review, /readOnly=\{scanDerived\}/)
    assert.match(review, /handleHoursCommit[\s\S]*scanDerivedSignInTradeHoursReviewRow\(row\)\) return/)
  })

  it('scanDerivedSignInTradeHoursReviewRow distinguishes scan vs manual rows', () => {
    assert.equal(scanDerivedSignInTradeHoursReviewRow({ rowIds: ['op-1'] }), true)
    assert.equal(scanDerivedSignInTradeHoursReviewRow({ rowIds: [] }), false)
    const manual = addSignInTradeHoursRow([])
    assert.equal(scanDerivedSignInTradeHoursReviewRow(manual[0]), false)
  })

})

describe('Sign-in operative move to Visitors', () => {
  it('moves one operative from a multi-person trade and appends visitor line once', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const key = rows[0].key
    const result = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: key,
      operativeId: 'a',
      existingVisitorsText: '',
      evidencePath: REGISTER_EVIDENCE,
      tradeLabel: 'Electrical',
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows[0].workers, 1)
    assert.equal(result.visitorsRegisterProvenance.length, 1)
    assert.equal(result.reviewRows[0].hours, 8)
    assert.deepEqual(result.reviewRows[0].rowIds, ['b'])
    assert.equal(result.operatives.find((o) => o.id === 'a').movedToVisitors, true)
    assert.equal(result.operatives.find((o) => o.id === 'a').excludedFromLabour, true)
    assert.equal(
      result.visitorsText,
      'Electrical · 08:00–16:00 · Register row 1',
    )
  })

  it('removes trade review row when last operative is moved', () => {
    const operatives = [
      operative({
        id: 'qs',
        trade: 'QS',
        source_row: 7,
        time_in: '09:00',
        time_out: '17:00',
      }),
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const result = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'qs',
      existingVisitorsText: '',
      evidencePath: REGISTER_EVIDENCE,
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows.length, 0)
    assert.match(result.visitorsText, /Register row 7/)
  })

  it('removes operative id from every review row rowIds', () => {
    const operatives = [
      operative({ id: 'x', trade: 'Architect', source_row: 16, time_in: '13:30', time_out: '16:00' }),
    ]
    let { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    rows = [
      ...rows,
      {
        ...rows[0],
        key: 'duplicate-bucket',
        rowIds: ['x'],
      },
    ]
    const result = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'x',
      existingVisitorsText: '',
      evidencePath: REGISTER_EVIDENCE,
      tradeLabel: 'Architect',
    })
    assert.equal(result.ok, true)
    assert.equal(result.reviewRows.length, 0)
    assert.ok(
      !result.reviewRows.some((r) => (r.rowIds || []).includes('x')),
    )
  })

  it('repeat move does not duplicate Visitors text', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Client', source_row: 3 }),
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const first = applyOperativeMoveToVisitorsFromReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      existingVisitorsText: 'Existing visitor',
      evidencePath: REGISTER_EVIDENCE,
    })
    const second = applyOperativeMoveToVisitorsFromReview({
      operatives: first.operatives,
      reviewRows: first.reviewRows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      existingVisitorsText: first.visitorsText,
      existingVisitorsRegisterProvenance: first.visitorsRegisterProvenance,
      evidencePath: REGISTER_EVIDENCE,
    })
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'already-moved')
    assert.equal(first.visitorsText.split('\n').length, 2)
    assert.equal(second.visitorsText.split('\n').length, 2)
    assert.match(second.visitorsText, /Register row 3/)
  })

  it('legacy Sign-in row is claimed into provenance with canonical Register row (no duplicate)', async () => {
    const { applyRegisterVisitorMoveFromSignIn } = await import('./visitors-register-provenance.js')
    const op = operative({
      id: 'arch-16',
      trade: 'Architect',
      source_row: 16,
      time_in: '13:30',
      time_out: '16:00',
    })
    const legacy =
      'Electrical subcontractor pm,\nArchitect · 13:30–16:00 · Sign-in row 16'
    const merged = applyRegisterVisitorMoveFromSignIn({
      visitorsText: legacy,
      visitorsRegisterProvenance: [],
      operative: op,
      tradeLabel: 'Architect',
      evidencePath: REGISTER_EVIDENCE,
    })
    assert.equal(merged.visitorsText.split('\n').length, 2)
    assert.match(merged.visitorsText, /Electrical subcontractor pm,/)
    assert.match(merged.visitorsText, /Architect · 13:30–16:00 · Register row 16/)
    assert.doesNotMatch(merged.visitorsText, /Sign-in row/i)
    assert.equal(merged.visitorsRegisterProvenance.length, 1)
    assert.equal(signInVisitorIdentityKeyFromLine('Architect · 13:30–16:00 · Sign-in row 16'), 'row:16')
  })

  it('replay move after legacy visitor line keeps one Architect entry and labour totals', () => {
    const operatives = [
      operative({ id: 'arch-16', trade: 'Architect', source_row: 16, time_in: '13:30', time_out: '16:00' }),
      operative({ id: 'b', trade: 'Electrician', source_row: 1 }),
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const archKey = rows.find((r) => (r.rowIds || []).includes('arch-16')).key
    const replayOperatives = operatives.map((o) =>
      o.id === 'arch-16' ? { ...o, movedToVisitors: false } : o,
    )
    const visitorsBefore = 'Architect · 13:30–16:00 · Sign-in row 16'
    const moved = applyOperativeMoveToVisitorsFromReview({
      operatives: replayOperatives,
      reviewRows: rows,
      reviewRowKey: archKey,
      operativeId: 'arch-16',
      existingVisitorsText: visitorsBefore,
      evidencePath: REGISTER_EVIDENCE,
      tradeLabel: 'Architect',
    })
    assert.equal(moved.ok, true)
    assert.equal(moved.visitorsText.split('\n').length, 1)
    assert.equal(moved.visitorsText, 'Architect · 13:30–16:00 · Register row 16')
    assert.equal(moved.visitorsRegisterProvenance.length, 1)
    assert.equal(moved.reviewRows.reduce((s, r) => s + (r.workers || 0), 0), 1)
    const again = applyOperativeMoveToVisitorsFromReview({
      operatives: moved.operatives,
      reviewRows: moved.reviewRows,
      reviewRowKey: archKey,
      operativeId: 'arch-16',
      existingVisitorsText: moved.visitorsText,
      existingVisitorsRegisterProvenance: moved.visitorsRegisterProvenance,
      evidencePath: REGISTER_EVIDENCE,
      tradeLabel: 'Architect',
    })
    assert.equal(again.reason, 'already-moved')
    assert.equal(again.visitorsText, 'Architect · 13:30–16:00 · Register row 16')
  })

  it('exclude from labour does not alter Visitors narrative', () => {
    const operatives = [
      operative({ id: 'a', trade: 'Electrician', source_row: 1 }),
      operative({ id: 'b', trade: 'Electrician', source_row: 2 }),
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const visitorsBefore = 'Building control, 10:30'
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: rows[0].key,
      operativeId: 'a',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.operatives.find((o) => o.id === 'a').excludedFromLabour, true)
    assert.notEqual(result.operatives.find((o) => o.id === 'a').movedToVisitors, true)
    assert.equal(visitorsBefore, 'Building control, 10:30')
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'visitorsText'), false)
  })

  it('preserves multiline Visitors narrative and appends cleanly', () => {
    const line = formatVisitorLineFromSignInOperative(
      operative({ id: 'a', trade: 'Architect', source_row: 16, time_in: '13:30', time_out: '16:00' }),
      'Architect',
    )
    assert.equal(line, 'Architect · 13:30–16:00 · Register row 16')
    const merged = appendVisitorNarrative('Line one\nLine two', line)
    assert.equal(merged, 'Line one\nLine two\nArchitect · 13:30–16:00 · Register row 16')
  })

  it('OCR / time / date / header logic files are not part of this edit surface', () => {
    // Smoke: authorised helper exists; OCR pipeline files still present (untouched by this suite's subject).
    assert.ok(readFileSync(helperPath, 'utf8').includes('initSignInTradeHoursReviewFromOperatives'))
    assert.ok(readFileSync(pipelinePath, 'utf8').length > 100)
    assert.ok(readFileSync(labourPath, 'utf8').includes('hoursFromSignInOut'))
    assert.ok(readFileSync(headerPath, 'utf8').includes('isClaudeBenchmarkHeaderRow'))
  })
})
