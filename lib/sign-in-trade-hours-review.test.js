import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addSignInTradeHoursRow,
  formatSignInTradeHoursReviewStatus,
  initSignInTradeHoursReviewFromOperatives,
  parseSignInTradeHoursInput,
  removeSignInTradeHoursRow,
  renameSignInTradeHoursRow,
  setSignInTradeHoursRowHours,
  totalSignInTradeHoursReview,
} from './sign-in-trade-hours-review.js'
import {
  SIGNIN_ILLEGIBLE_TRADE_KEY,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
  countSignInTradeHoursReviewRows,
} from './labour-from-register.js'

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
    person_name: partial.person_name ?? 'Should Not Appear',
    trade: partial.trade ?? 'Labourer',
    company: partial.company ?? 'Should Not Appear Co',
    time_in: partial.time_in ?? '08:00',
    time_out: partial.time_out ?? '16:00',
    dateStatus: partial.dateStatus ?? 'match',
    included: partial.included !== false,
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
    assert.match(section, /Replace image/)
    assert.match(section, /Remove image/)
    assert.match(section, /Retry scan/)
    assert.match(hook, /clearSignInSheetWorkingState/)
    assert.match(section, /retrySignInScan/)
    // Exactly one visible Retry scan string in the labour section (beside image controls).
    assert.equal([...section.matchAll(/Retry scan/g)].length, 1)
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(review, /Retry scan/)
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

  it('OCR / time / date / header logic files are not part of this edit surface', () => {
    // Smoke: authorised helper exists; OCR pipeline files still present (untouched by this suite's subject).
    assert.ok(readFileSync(helperPath, 'utf8').includes('initSignInTradeHoursReviewFromOperatives'))
    assert.ok(readFileSync(pipelinePath, 'utf8').length > 100)
    assert.ok(readFileSync(labourPath, 'utf8').includes('hoursFromSignInOut'))
    assert.ok(readFileSync(headerPath, 'utf8').includes('isClaudeBenchmarkHeaderRow'))
  })
})
