import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT,
  applySignInRichTradeConsensus,
  buildSignInRichTradeConsensusInput,
} from './sign-in-trade-consensus.js'
import { applyClaudeBenchmarkTradeNormalisation } from './parse-signin-sheet-claude-benchmark.js'
import {
  aggregateSignInOperativesByTrade,
  hoursFromSignInOut,
} from './labour-from-register.js'
import { canonicalizeConstructionTrade } from './construction-trade-vocabulary.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const helperPath = join(root, 'lib/sign-in-trade-consensus.js')
const pipelinePath = join(root, 'lib/parse-signin-sheet-claude-pipeline.js')
const vocabPath = join(root, 'lib/construction-trade-vocabulary.js')
const labourPath = join(root, 'lib/labour-from-register.js')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')
const diaryPath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')

describe('Sign-in rich internal consensus for trade only', () => {
  it('A: Current trade-only consensus is no longer used in production', () => {
    const helper = readFileSync(helperPath, 'utf8')
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.doesNotMatch(pipeline, /runSignInTradeConsensusPass\b/)
    assert.match(pipeline, /runSignInRichTradeConsensusPass/)
    assert.match(helper, /runSignInRichTradeConsensusPass/)
    assert.match(helper, /buildSignInRichTradeConsensusInput/)
    assert.doesNotMatch(helper, /source_row \+ trade only/)
  })

  it('B: First-pass internal schema may contain optional person_name, company, trade, clocks/date', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(
      pipeline,
      /"date":"YYYY-MM-DD","person_name":"string\|null","company":"string\|null","trade":"string\|null","time_in"/,
    )
  })

  it('C: Name and company are optional — null is permitted', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /person_name = optional/)
    assert.match(pipeline, /company = optional/)
    assert.match(pipeline, /use null when unclear/)
    const input = buildSignInRichTradeConsensusInput([
      { source_row: 1, person_name: null, company: null, trade: 'Electrician' },
    ])
    assert.deepEqual(input[0], {
      source_row: 1,
      work_date: null,
      time_in: null,
      time_out: null,
      trade: 'Electrician',
      person_name: null,
      company: null,
    })
  })

  it('D: Names/companies never reach the user-facing Trade + Hours summary', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.match(pipeline, /person_name: null/)
    assert.match(pipeline, /company: null/)
    assert.match(pipeline, /Internal anchors discarded before user-facing Trade \+ Hours/)
    const review = readFileSync(reviewPath, 'utf8')
    assert.match(review, /Hours on site/)
    assert.doesNotMatch(review, /person_name/)
    assert.doesNotMatch(review, /Labour by company/)
    const normalised = applyClaudeBenchmarkTradeNormalisation([
      {
        source_row: 1,
        person_name: 'Secret Worker',
        company: 'Secret Co',
        trade: 'Spark',
        trade_reviewed: 'Spark',
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'match',
        included: true,
      },
    ])
    // Aggregation uses trade only — company never becomes a summary dimension.
    const { trades } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(Object.prototype.hasOwnProperty.call(trades[0], 'company'), false)
  })

  it('E: Consensus receives row location anchors plus optional name/company', () => {
    const input = buildSignInRichTradeConsensusInput([
      {
        source_row: 5,
        person_name: 'Alex',
        company: 'SHC',
        trade: 'Scaff',
        time_in: '08:00',
        time_out: '16:00',
        work_date: '2026-09-06',
      },
    ])
    assert.deepEqual(input, [
      {
        source_row: 5,
        work_date: '2026-09-06',
        time_in: '08:00',
        time_out: '16:00',
        trade: 'Scaff',
        person_name: 'Alex',
        company: 'SHC',
      },
    ])
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /ROW LOCATION ANCHORS ONLY/)
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Do NOT infer or guess trade from the date or clock times/)
  })

  it('F: Consensus cannot alter source_row/date/time_in/time_out', () => {
    const merged = applySignInRichTradeConsensus(
      [
        {
          source_row: 2,
          trade: 'Scaff',
          work_date: '2026-09-06',
          date: '2026-09-06',
          time_in: '08:30',
          time_out: '16:30',
        },
      ],
      [
        {
          source_row: 2,
          trade: {
            raw_value: 'Scaff',
            normalized_value: 'Sparky',
            needs_review: false,
          },
          date: '1999-01-01',
          time_in: '00:00',
          time_out: '23:59',
        },
      ],
    )
    assert.equal(merged[0].source_row, 2)
    assert.equal(merged[0].work_date, '2026-09-06')
    assert.equal(merged[0].date, '2026-09-06')
    assert.equal(merged[0].time_in, '08:30')
    assert.equal(merged[0].time_out, '16:30')
    assert.equal(merged[0].trade_reviewed, 'Sparky')
  })

  it('blank first-pass trade: prompt requires independent second visual read', () => {
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /When first-pass trade is null/)
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Do NOT treat "first pass was blank"/)
    assert.doesNotMatch(
      SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT,
      /Do not invent a trade to fill a null first-pass trade/,
    )
  })

  it('G: Consensus does not infer trade from worker identity', () => {
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Do NOT infer trade from a worker's identity/)
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Forbidden: assuming a trade because of who the person is/)
  })

  it('H: Consensus does not infer trade from employer identity', () => {
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Do NOT infer trade from the employer \/ company/)
    assert.match(SIGNIN_RICH_TRADE_CONSENSUS_SYSTEM_PROMPT, /Forbidden: assuming Scaffolder because the company/)
  })

  it('I: Reviewed trade is canonicalised only AFTER consensus', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    const runFn = pipeline.slice(pipeline.indexOf('export async function runAcceptedClaudeSignInPipeline'))
    const consensusCall = runFn.indexOf('await runSignInRichTradeConsensusPass')
    const normCall = runFn.indexOf('operatives = applyClaudeBenchmarkTradeNormalisation')
    assert.ok(consensusCall > 0 && normCall > consensusCall)
    assert.doesNotMatch(pipeline, /constructionTradeVocabularyPromptBlock/)
  })

  it('row 15 fixture: blank first-pass row is sent with date/clock anchors', () => {
    const row15 = {
      source_row: 15,
      work_date: '2026-09-06',
      time_in: '12:30',
      time_out: '4:15',
      trade: null,
    }
    const input = buildSignInRichTradeConsensusInput([row15])
    assert.equal(input.length, 1)
    assert.equal(input[0].source_row, 15)
    assert.equal(input[0].work_date, '2026-09-06')
    assert.equal(input[0].time_in, '12:30')
    assert.equal(input[0].time_out, '4:15')
    assert.equal(input[0].trade, null)
  })

  it('row 15 fixture: confident Painter consensus resolves to Decoration (not illegible)', () => {
    const merged = applySignInRichTradeConsensus(
      [
        {
          id: 'op-14',
          source_row: 15,
          work_date: '2026-09-06',
          dateStatus: 'match',
          included: true,
          time_in: '12:30',
          time_out: '4:15',
          trade: null,
        },
      ],
      [
        {
          source_row: 15,
          trade: {
            normalized_value: 'Painter',
            needs_review: false,
            confidence: 0.88,
          },
        },
      ],
    )
    assert.equal(merged[0].trade_reviewed, 'Painter')
    assert.equal(merged[0].trade_needs_review, false)
    const normalised = applyClaudeBenchmarkTradeNormalisation(merged)
    assert.equal(normalised[0].trade_normalized, 'Painter')
    const { trades } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Decoration')
    assert.notEqual(trades[0].tradeKey, '__illegible_trade__')
  })

  it('row 15 fixture: uncertain consensus stays unresolved (no guessing)', () => {
    const merged = applySignInRichTradeConsensus(
      [
        {
          source_row: 15,
          work_date: '2026-09-06',
          dateStatus: 'match',
          included: true,
          time_in: '12:30',
          time_out: '4:15',
          trade: null,
        },
      ],
      [
        {
          source_row: 15,
          trade: {
            normalized_value: null,
            needs_review: true,
          },
        },
      ],
    )
    assert.equal(merged[0].trade_reviewed, null)
    assert.equal(merged[0].trade_needs_review, true)
    const { trades } = aggregateSignInOperativesByTrade(
      applyClaudeBenchmarkTradeNormalisation(merged),
    )
    assert.equal(trades[0].tradeKey, '__illegible_trade__')
  })

  it('F: null first-pass trade recovers from consensus and aggregates as Electrical', () => {
    const merged = applySignInRichTradeConsensus(
      [
        {
          id: 'op-14',
          source_row: 15,
          work_date: '2026-09-06',
          dateStatus: 'match',
          included: true,
          time_in: '12:30',
          time_out: '4:15',
          trade: null,
        },
      ],
      [
        {
          source_row: 15,
          trade: {
            normalized_value: 'Electrician',
            needs_review: false,
            confidence: 0.9,
          },
        },
      ],
    )
    assert.equal(merged[0].trade_reviewed, 'Electrician')
    assert.equal(merged[0].trade_needs_review, false)
    const normalised = applyClaudeBenchmarkTradeNormalisation(merged)
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    const { trades } = aggregateSignInOperativesByTrade(normalised)
    assert.equal(trades.length, 1)
    assert.equal(trades[0].trade, 'Electrical')
    assert.equal(trades[0].tradeKey, 't:electrical')
    assert.equal(trades[0].needsReview, false)
  })

  it('G: null first-pass trade stays unresolved when consensus needs_review true', () => {
    const merged = applySignInRichTradeConsensus(
      [
        {
          source_row: 15,
          work_date: '2026-09-06',
          dateStatus: 'match',
          included: true,
          time_in: '12:30',
          time_out: '4:15',
          trade: null,
        },
      ],
      [
        {
          source_row: 15,
          trade: {
            normalized_value: 'Joiner',
            needs_review: true,
          },
        },
      ],
    )
    assert.equal(merged[0].trade_reviewed, null)
    assert.equal(merged[0].trade_needs_review, true)
    const { trades } = aggregateSignInOperativesByTrade(
      applyClaudeBenchmarkTradeNormalisation(merged),
    )
    assert.equal(trades[0].tradeKey, '__illegible_trade__')
  })

  it('J: Spark/Sparky → Electrician', () => {
    const merged = applySignInRichTradeConsensus(
      [{ source_row: 1, trade: 'Scaff', person_name: 'A', company: 'SHC' }],
      [
        {
          source_row: 1,
          trade: {
            raw_value: 'Scaff',
            normalized_value: 'Sparky',
            needs_review: false,
          },
        },
      ],
    )
    const normalised = applyClaudeBenchmarkTradeNormalisation(merged)
    assert.equal(normalised[0].trade_reviewed, 'Sparky')
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    assert.equal(canonicalizeConstructionTrade('Spark'), 'Electrician')
  })

  it('K: Scaff/Scaffolder → Scaffolder', () => {
    const merged = applySignInRichTradeConsensus(
      [{ source_row: 1, trade: 'Scaff' }],
      [
        {
          source_row: 1,
          trade: {
            raw_value: 'Scaff',
            normalized_value: 'Scaff',
            needs_review: false,
          },
        },
      ],
    )
    const normalised = applyClaudeBenchmarkTradeNormalisation(merged)
    assert.equal(normalised[0].trade_normalized, 'Scaffolder')
  })

  it('L: No Scaff → Electrician hard-code exists', () => {
    const vocab = readFileSync(vocabPath, 'utf8')
    assert.doesNotMatch(vocab, /scaff:\s*'Electrician'/)
    assert.equal(canonicalizeConstructionTrade('Scaff'), 'Scaffolder')
    assert.notEqual(canonicalizeConstructionTrade('Scaff'), 'Electrician')
  })

  it('M: Full construction vocabulary no longer primes first-pass OCR', () => {
    const pipeline = readFileSync(pipelinePath, 'utf8')
    assert.doesNotMatch(pipeline, /constructionTradeVocabularyPromptBlock/)
    assert.doesNotMatch(pipeline, /Spark vs Scaff/)
    assert.match(pipeline, /Do not force a canonical trade label/)
    assert.match(pipeline, /Do NOT prime with construction vocabulary/)
  })

  it('N: Hours/date/UI behaviour remains unchanged', () => {
    assert.equal(hoursFromSignInOut('08:00', '16:00'), 8)
    assert.equal(hoursFromSignInOut('12:30', '16:15'), 3.75)
    const labour = readFileSync(labourPath, 'utf8')
    assert.match(labour, /export function hoursFromSignInOut/)
    assert.match(labour, /outMin < inMin/)
    assert.match(readFileSync(reviewPath, 'utf8'), /\+ Add trade/)
    assert.match(readFileSync(diaryPath, 'utf8'), /reportDate=\{reportDate\}/)
    assert.match(
      readFileSync(join(root, 'components/diary/SiteDiaryLabourSection.jsx'), 'utf8'),
      /Retry scan/,
    )
  })
})
