import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalizeConstructionTrade,
  constructionTradeVocabularyPromptBlock,
} from './construction-trade-vocabulary.js'
import {
  applyClaudeBenchmarkTradeNormalisation,
  normalizeClaudeBenchmarkTradeValue,
} from './parse-signin-sheet-claude-benchmark.js'
import {
  aggregateSignInOperativesByTrade,
  hoursFromSignInOut,
  SIGNIN_ILLEGIBLE_TRADE_LABEL,
} from './labour-from-register.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vocabPath = join(root, 'lib/construction-trade-vocabulary.js')
const pipelinePath = join(root, 'lib/parse-signin-sheet-claude-pipeline.js')
const labourPath = join(root, 'lib/labour-from-register.js')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')
const diaryPath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')

function row(partial) {
  const base = {
    id: partial.id || `r-${Math.random().toString(16).slice(2, 8)}`,
    trade: partial.trade,
    time_in: partial.time_in ?? '08:00',
    time_out: partial.time_out ?? '16:00',
    dateStatus: partial.dateStatus ?? 'match',
    included: partial.included !== false,
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'trade_normalized')) {
    base.trade_normalized = partial.trade_normalized
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'trade_raw')) {
    base.trade_raw = partial.trade_raw
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'trade_reviewed')) {
    base.trade_reviewed = partial.trade_reviewed
  }
  if (partial.trade_needs_review === true) {
    base.trade_needs_review = true
  }
  return base
}

describe('Construction trade vocabulary / Spark vs Scaff', () => {
  it('A: Raw Spark canonicalises to Electrician', () => {
    assert.equal(canonicalizeConstructionTrade('Spark'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('Spark'), 'Electrician')
  })

  it('B: Raw Sparky canonicalises to Electrician', () => {
    assert.equal(canonicalizeConstructionTrade('Sparky'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue(' SPARKY '), 'Electrician')
  })

  it('C: Raw Electrician remains Electrician', () => {
    assert.equal(canonicalizeConstructionTrade('Electrician'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('electrician'), 'Electrician')
  })

  it('D: Raw Scaff canonicalises to Scaffolder', () => {
    assert.equal(canonicalizeConstructionTrade('Scaff'), 'Scaffolder')
    assert.equal(normalizeClaudeBenchmarkTradeValue('scaff'), 'Scaffolder')
  })

  it('E: Raw Scaffolder remains Scaffolder', () => {
    assert.equal(canonicalizeConstructionTrade('Scaffolder'), 'Scaffolder')
    assert.equal(normalizeClaudeBenchmarkTradeValue('SCAFFOLDER'), 'Scaffolder')
  })

  it('F: There is NO deterministic Scaff → Electrician rule', () => {
    const vocab = readFileSync(vocabPath, 'utf8')
    assert.doesNotMatch(vocab, /scaff:\s*'Electrician'/)
    assert.doesNotMatch(vocab, /scaff:\s*"Electrician"/)
    assert.notEqual(canonicalizeConstructionTrade('Scaff'), 'Electrician')
    assert.notEqual(canonicalizeConstructionTrade('scaffold'), 'Electrician')
    assert.notEqual(canonicalizeConstructionTrade('Scaffolder'), 'Electrician')
    assert.equal(canonicalizeConstructionTrade('Scaff'), 'Scaffolder')
  })

  it('G: Genuine Scaffolder cannot be silently converted to Electrician', () => {
    const rows = applyClaudeBenchmarkTradeNormalisation([
      { trade: 'Scaffolder', trade_raw: 'Scaffolder', trade_reviewed: 'Scaffolder' },
      { trade: 'Scaff', trade_raw: 'Scaff', trade_reviewed: 'Scaff' },
    ])
    assert.equal(rows[0].trade_normalized, 'Scaffolder')
    assert.equal(rows[1].trade_normalized, 'Scaffolder')
    assert.equal(rows[0].trade_raw, 'Scaffolder')
    assert.equal(rows[1].trade_raw, 'Scaff')
    assert.notEqual(rows[0].trade_normalized, 'Electrician')
    assert.notEqual(rows[1].trade_normalized, 'Electrician')
  })

  it('H: Common shorthand aliases canonicalise correctly', () => {
    assert.equal(canonicalizeConstructionTrade('chippy'), 'Joiner')
    assert.equal(canonicalizeConstructionTrade('Brickie'), 'Bricklayer')
    assert.equal(canonicalizeConstructionTrade('plumbing'), 'Plumber')
    assert.equal(canonicalizeConstructionTrade('laborer'), 'Labourer')
    assert.equal(canonicalizeConstructionTrade('dry lining'), 'Dryliner')
    assert.equal(canonicalizeConstructionTrade('banksman'), 'Banksman')
  })

  it('I: Unknown/uncertain trade can remain Needs review rather than being forced', () => {
    assert.equal(canonicalizeConstructionTrade('Zzxq Trade'), 'Zzxq Trade')
    assert.equal(canonicalizeConstructionTrade(null), null)
    const { trades } = aggregateSignInOperativesByTrade([
      row({ trade: null, trade_needs_review: true, time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(trades.length, 1)
    assert.equal(trades[0].needsReview, true)
    assert.equal(trades[0].trade, SIGNIN_ILLEGIBLE_TRADE_LABEL)
  })

  it('J: Trade aggregation combines canonical equivalents (Spark 8 + Electrician 8 → 16)', () => {
    const normalised = applyClaudeBenchmarkTradeNormalisation([
      row({ trade: 'Spark', trade_raw: 'Spark', time_in: '08:00', time_out: '16:00' }),
      row({ trade: 'Electrician', trade_raw: 'Electrician', time_in: '08:00', time_out: '16:00' }),
    ])
    assert.equal(normalised[0].trade_raw, 'Spark')
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    assert.equal(normalised[0].trade, 'Spark')
    const { trades, totals } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(trades[0].hours, 16)
    assert.equal(totals.hours, 16)

    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /trade_raw/)
    assert.match(pipeline, /trade_normalized/)
  })

  it('K: Hours and date calculations remain unchanged', () => {
    assert.equal(hoursFromSignInOut('08:00', '16:00'), 8)
    assert.equal(hoursFromSignInOut('08:30', '16:30'), 8)
    assert.equal(hoursFromSignInOut('12:30', '16:15'), 3.75)
    const labour = readFileSync(labourPath, 'utf8')
    assert.match(labour, /export function hoursFromSignInOut/)
    assert.match(labour, /outMin < inMin/)
  })

  it('Claude prompt includes calm first-pass (no vocabulary priming); aliases remain post-review', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.doesNotMatch(pipeline, /constructionTradeVocabularyPromptBlock/)
    assert.doesNotMatch(pipeline, /Spark vs Scaff/)
    assert.match(pipeline, /runSignInRichTradeConsensusPass/)
    assert.match(pipeline, /applyClaudeBenchmarkTradeNormalisation/)
    const block = constructionTradeVocabularyPromptBlock()
    assert.match(block, /Scaff \/ scaffold \/ scaffolder means Scaffolder/)
    assert.match(block, /NOT Electrician/)
    assert.match(block, /Spark\/Sparky → Electrician/)
  })

  it('Trade + Hours UI and reportDate reaches Labour integration', () => {
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /Hours on site/)
    assert.match(review, /\+ Add trade/)
    assert.doesNotMatch(review, /construction-trade-vocabulary/)
    const diary = readFileSync(diaryPath, 'utf8')
    assert.match(diary, /const \[reportDate, setReportDate\]/)
    assert.match(diary, /useSiteDiaryLabour\(/)
    assert.match(diary, /reportDate=\{reportDate\}/)
  })
})
