import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAUDE_OCR_BENCHMARK_MODEL,
  CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
  parseVisionDataUrlForClaude,
  isClaudeBenchmarkHeaderRow,
  isClaudeBenchmarkBlankOperativeRow,
  isClaudeBenchmarkSparseDateOnlyRow,
  qualifyClaudeBenchmarkOperativeRows,
  buildClaudeBenchmarkCompanyTradeConsensusInput,
  applyClaudeBenchmarkCompanyTradeConsensus,
  applyClaudeBenchmarkTradeNormalisation,
  applyBulkBreakDeductionToMatchedOperatives,
  applyIndividualBreakDeductionOverride,
  breakDeductionHoursFromValue,
  netHoursAfterBreakDeduction,
  sumClaudeBenchmarkMatchedHours,
  CLAUDE_BENCHMARK_BREAK_NONE,
  CLAUDE_BENCHMARK_BREAK_30,
  CLAUDE_BENCHMARK_BREAK_60,
  normalizeClaudeBenchmarkTradeValue,
  resolveClaudeBenchmarkIdentityReviewField,
} from './parse-signin-sheet-claude-benchmark.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('Claude OCR benchmark isolation', () => {
  it('selects the confirmed strongest available Claude model', () => {
    assert.equal(CLAUDE_OCR_BENCHMARK_MODEL, 'claude-sonnet-4-5-20250929')
    assert.equal(CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL, 'claude-sonnet-4-5-20250929')
  })

  it('parses upright JPEG data URLs for Anthropic image blocks', () => {
    const parsed = parseVisionDataUrlForClaude(
      'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    )
    assert.deepEqual(parsed, {
      mediaType: 'image/jpeg',
      data: '/9j/4AAQSkZJRg==',
    })
  })

  it('normalises image/jpg to image/jpeg', () => {
    const parsed = parseVisionDataUrlForClaude('data:image/jpg;base64,abc123')
    assert.equal(parsed.mediaType, 'image/jpeg')
    assert.equal(parsed.data, 'abc123')
  })

  it('rejects non-image payloads', () => {
    assert.equal(parseVisionDataUrlForClaude('not-an-image'), null)
    assert.equal(parseVisionDataUrlForClaude('data:text/plain;base64,abc'), null)
  })

  it('does not alter the production OpenAI OCR route', () => {
    const production = readFileSync(
      join(root, 'app/api/parse-signin-sheet/route.js'),
      'utf8',
    )
    assert.match(production, /OPENAI_API_KEY/)
    assert.match(production, /gpt-4o-mini/)
    assert.doesNotMatch(production, /ANTHROPIC_API_KEY/)
    assert.doesNotMatch(production, /claude-sonnet-4-5/)
  })

  it('keeps the Claude benchmark on its own route', () => {
    const benchmark = readFileSync(
      join(root, 'app/api/parse-signin-sheet-claude-benchmark/route.js'),
      'utf8',
    )
    assert.match(benchmark, /ANTHROPIC_API_KEY/)
    assert.match(benchmark, /CLAUDE_OCR_BENCHMARK_MODEL/)
    assert.match(benchmark, /CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL/)
    assert.match(benchmark, /runCompanyTradeConsensusPass/)
    assert.match(benchmark, /applyClaudeBenchmarkCompanyTradeConsensus/)
    assert.match(benchmark, /TEMPORARY Claude vision labour OCR benchmark/)
    assert.match(benchmark, /qualifyClaudeBenchmarkOperativeRows/)
    assert.doesNotMatch(benchmark, /OPENAI_API_KEY/)
    assert.match(benchmark, /No database writes/)
  })

  it('Step B uses original file bytes — not 1600px / 0.82 vision preprocess', () => {
    const helper = readFileSync(
      join(root, 'lib/parse-signin-sheet-claude-benchmark.js'),
      'utf8',
    )
    const page = readFileSync(
      join(root, 'app/dashboard/diary/labour-ocr-claude-benchmark/page.jsx'),
      'utf8',
    )
    assert.match(helper, /fileToOriginalClaudeBenchmarkImage/)
    assert.match(helper, /original-file-bytes-v1/)
    assert.match(helper, /readAsDataURL/)
    assert.doesNotMatch(helper, /fileToVisionDataUrl/)
    assert.doesNotMatch(helper, /orientedImageToDataUrl/)
    assert.match(page, /fileToOriginalClaudeBenchmarkImage/)
    assert.doesNotMatch(page, /fileToVisionDataUrl/)
    assert.doesNotMatch(page, /lib\/parse-signin-sheet['"]/)
  })
})

describe('Claude OCR benchmark row qualification', () => {
  it('detects the table header as metadata, not an operative', () => {
    assert.equal(
      isClaudeBenchmarkHeaderRow({
        date: 'Date',
        person_name: 'Name',
        company: 'Company',
        trade: 'Trade',
        time_in: 'Time In',
        time_out: 'Time Out',
      }),
      true,
    )
  })

  it('does not treat a real operative line as a header', () => {
    assert.equal(
      isClaudeBenchmarkHeaderRow({
        date: '2026-09-06',
        person_name: 'A',
        company: 'B',
        trade: 'C',
        time_in: '08:00',
        time_out: '16:00',
      }),
      false,
    )
  })

  it('detects entirely blank operative rows', () => {
    assert.equal(
      isClaudeBenchmarkBlankOperativeRow({
        source_row: 15,
        date: null,
        person_name: null,
        trade: null,
        company: null,
        time_in: null,
        time_out: null,
      }),
      true,
    )
  })

  it('keeps a partially filled operative row', () => {
    assert.equal(
      isClaudeBenchmarkBlankOperativeRow({
        source_row: 7,
        date: '2026-09-06',
        person_name: null,
        trade: null,
        company: null,
        time_in: '08:15',
        time_out: null,
      }),
      false,
    )
    assert.equal(
      isClaudeBenchmarkSparseDateOnlyRow({
        source_row: 7,
        date: '2026-09-06',
        person_name: null,
        trade: null,
        company: null,
        time_in: '08:15',
        time_out: null,
      }),
      false,
    )
  })

  it('detects sparse date-only hallucinated rows', () => {
    assert.equal(
      isClaudeBenchmarkSparseDateOnlyRow({
        source_row: 15,
        date: '2026-09-06',
        person_name: null,
        trade: null,
        company: null,
        time_in: null,
        time_out: null,
      }),
      true,
    )
  })

  it('drops header + blank rows and renumbers source_row from 1', () => {
    const qualified = qualifyClaudeBenchmarkOperativeRows(
      [
        {
          source_row: 1,
          date: 'Date',
          person_name: 'Name',
          company: 'Company',
          trade: 'Trade',
          time_in: 'Time In',
          time_out: 'Time Out',
        },
        {
          source_row: 2,
          date: '2026-09-05',
          person_name: 'A',
          trade: 'T',
          company: 'C',
          time_in: '08:00',
          time_out: '16:00',
        },
        {
          source_row: 3,
          date: '2026-09-06',
          person_name: 'B',
          trade: 'T',
          company: 'C',
          time_in: '08:15',
          time_out: '16:00',
        },
        {
          source_row: 4,
          date: null,
          person_name: null,
          trade: null,
          company: null,
          time_in: null,
          time_out: null,
        },
      ],
      4,
    )

    assert.equal(qualified.droppedHeaderCount, 1)
    assert.equal(qualified.droppedBlankCount, 1)
    assert.equal(qualified.droppedSparseDateOnlyCount, 0)
    assert.equal(qualified.rows.length, 2)
    assert.equal(qualified.visibleAttendeeCount, 2)
    assert.equal(qualified.rawVisibleAttendeeCount, 4)
    assert.equal(qualified.rows[0].source_row, 1)
    assert.equal(qualified.rows[1].source_row, 2)
    assert.equal(qualified.rows[0].date, '2026-09-05')
    assert.equal(qualified.rows[1].date, '2026-09-06')
  })

  it('reduces the prior 15-row upright result to 14 by dropping the sparse date-only trailing row', () => {
    const rows = []
    for (let i = 1; i <= 4; i += 1) {
      rows.push({
        source_row: i,
        date: '2026-09-05',
        person_name: 'x',
        trade: 'x',
        company: 'x',
        time_in: '08:00',
        time_out: '16:00',
      })
    }
    for (let i = 5; i <= 14; i += 1) {
      rows.push({
        source_row: i,
        date: '2026-09-06',
        person_name: 'x',
        trade: 'x',
        company: 'x',
        time_in: '08:00',
        time_out: '16:00',
      })
    }
    rows.push({
      source_row: 15,
      date: '2026-09-06',
      person_name: null,
      trade: null,
      company: null,
      time_in: null,
      time_out: null,
    })

    const qualified = qualifyClaudeBenchmarkOperativeRows(rows, 15)
    assert.equal(qualified.rows.length, 14)
    assert.equal(qualified.visibleAttendeeCount, 14)
    assert.equal(qualified.droppedSparseDateOnlyCount, 1)
    assert.equal(qualified.droppedBlankCount, 0)
    assert.equal(qualified.droppedHeaderCount, 0)
    assert.equal(qualified.rows[0].source_row, 1)
    assert.equal(qualified.rows[13].source_row, 14)
    assert.equal(
      qualified.rows.filter((r) => r.date === '2026-09-05').length,
      4,
    )
    assert.equal(
      qualified.rows.filter((r) => r.date === '2026-09-06').length,
      10,
    )
  })
})

describe('Claude OCR benchmark Company/Trade consensus merge', () => {
  const firstPassOperatives = [
    {
      source_row: 5,
      person_name: 'Keep Name',
      work_date: '2026-09-06',
      dateStatus: 'match',
      time_in: '07:30',
      time_out: '16:15',
      hours: 8.25,
      company: 'SAC',
      trade: 'Labourer',
    },
    {
      source_row: 6,
      person_name: 'Other Name',
      work_date: '2026-09-06',
      dateStatus: 'match',
      time_in: '08:00',
      time_out: '16:00',
      hours: 7.5,
      company: 'SHC',
      trade: 'Carpenter',
    },
    {
      source_row: 1,
      person_name: 'Prior Day',
      work_date: '2026-09-05',
      dateStatus: 'other',
      time_in: '07:00',
      time_out: '16:00',
      hours: 8,
      company: 'SAC',
      trade: 'Labourer',
    },
  ]

  it('builds Company/Trade-only consensus input without names or times', () => {
    const input = buildClaudeBenchmarkCompanyTradeConsensusInput(firstPassOperatives)
    assert.equal(input.length, 3)
    assert.deepEqual(input[0], { source_row: 5, company: 'SAC', trade: 'Labourer' })
    assert.equal(Object.keys(input[0]).sort().join(','), 'company,source_row,trade')
  })

  it('preserves raw Company/Trade and stores reviewed values separately', () => {
    const merged = applyClaudeBenchmarkCompanyTradeConsensus(firstPassOperatives, [
      {
        source_row: 5,
        company: {
          raw_value: 'SAC',
          normalized_value: 'SHC',
          confidence: 0.9,
          needs_review: false,
        },
        trade: {
          raw_value: 'Labourer',
          normalized_value: 'Labourer',
          confidence: 0.95,
          needs_review: false,
        },
      },
    ])

    assert.equal(merged.length, 3)
    assert.equal(merged[0].company, 'SAC')
    assert.equal(merged[0].company_raw, 'SAC')
    assert.equal(merged[0].company_reviewed, 'SHC')
    assert.equal(merged[0].trade, 'Labourer')
    assert.equal(merged[0].trade_raw, 'Labourer')
    assert.equal(merged[0].trade_reviewed, 'Labourer')
    assert.equal(merged[0].needs_review, false)
    assert.equal(merged[0].company_needs_review, false)
  })

  it('keeps raw and sets needs_review when uncertain', () => {
    const field = resolveClaudeBenchmarkIdentityReviewField('SAC', {
      raw_value: 'SAC',
      normalized_value: 'SAC',
      confidence: 0.2,
      needs_review: true,
    })
    assert.equal(field.raw_value, 'SAC')
    assert.equal(field.reviewed_value, 'SAC')
    assert.equal(field.needs_review, true)

    const merged = applyClaudeBenchmarkCompanyTradeConsensus(firstPassOperatives, [
      {
        source_row: 5,
        company: {
          raw_value: 'SAC',
          normalized_value: 'SHC',
          needs_review: true,
        },
        trade: {
          raw_value: 'Labourer',
          normalized_value: 'Labourer',
          needs_review: false,
        },
      },
    ])
    assert.equal(merged[0].company_raw, 'SAC')
    assert.equal(merged[0].company_reviewed, 'SAC')
    assert.equal(merged[0].company_needs_review, true)
    assert.equal(merged[0].needs_review, true)
  })

  it('does not invent a company/trade when first-pass raw is null', () => {
    const merged = applyClaudeBenchmarkCompanyTradeConsensus(
      [
        {
          source_row: 7,
          person_name: 'Blank Co',
          work_date: '2026-09-06',
          dateStatus: 'match',
          time_in: '08:00',
          time_out: '16:00',
          hours: 7.5,
          company: null,
          trade: 'Labourer',
        },
      ],
      [
        {
          source_row: 7,
          company: {
            raw_value: null,
            normalized_value: 'SHC',
            needs_review: false,
          },
          trade: {
            raw_value: 'Labourer',
            normalized_value: 'Labourer',
            needs_review: false,
          },
        },
      ],
    )
    assert.equal(merged[0].company_raw, null)
    assert.equal(merged[0].company_reviewed, null)
    assert.equal(merged[0].company_needs_review, true)
    assert.equal(merged[0].needs_review, true)
  })

  it('cannot change Name, Date, Times, hours, source_row, or row count via consensus merge', () => {
    const merged = applyClaudeBenchmarkCompanyTradeConsensus(firstPassOperatives, [
      {
        source_row: 5,
        person_name: 'Hacked Name',
        work_date: '2099-01-01',
        time_in: '00:00',
        time_out: '23:59',
        hours: 99,
        company: {
          raw_value: 'SAC',
          normalized_value: 'SHC',
          needs_review: false,
        },
        trade: {
          raw_value: 'Labourer',
          normalized_value: 'Joiner',
          needs_review: false,
        },
      },
      {
        source_row: 99,
        company: { raw_value: 'X', normalized_value: 'Y', needs_review: false },
        trade: { raw_value: 'X', normalized_value: 'Y', needs_review: false },
      },
    ])

    assert.equal(merged.length, firstPassOperatives.length)
    assert.equal(merged[0].source_row, 5)
    assert.equal(merged[0].person_name, 'Keep Name')
    assert.equal(merged[0].work_date, '2026-09-06')
    assert.equal(merged[0].time_in, '07:30')
    assert.equal(merged[0].time_out, '16:15')
    assert.equal(merged[0].hours, 8.25)
    assert.equal(merged[0].dateStatus, 'match')
    assert.equal(merged[1].source_row, 6)
    assert.equal(merged[2].source_row, 1)
    assert.equal(merged.some((row) => row.source_row === 99), false)
  })

  it('benchmark page shows raw vs reviewed Company/Trade for matched rows', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/diary/labour-ocr-claude-benchmark/page.jsx'),
      'utf8',
    )
    assert.match(page, /companyTradeConsensusRows/)
    assert.match(page, /Raw Company/)
    assert.match(page, /Reviewed Company/)
    assert.match(page, /Raw Trade/)
    assert.match(page, /Reviewed Trade/)
    assert.match(page, /Normalized Trade/)
    assert.match(page, /Needs review/)
    assert.match(page, /Break deduction/)
    assert.match(page, /Applied to each included operative/)
    assert.match(page, /Apply disabled — benchmark only/)
    assert.match(page, /disabled/)
  })
})

describe('Claude OCR benchmark Spark/Sparky trade normalisation', () => {
  it('maps Spark / Sparky to Electrician case-insensitively and whitespace-tolerantly', () => {
    assert.equal(normalizeClaudeBenchmarkTradeValue('Spark'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('spark'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('Sparky'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue(' SPARKY '), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('  Spark  '), 'Electrician')
  })

  it('leaves Electrician and unrelated trades unchanged', () => {
    assert.equal(normalizeClaudeBenchmarkTradeValue('Electrician'), 'Electrician')
    assert.equal(normalizeClaudeBenchmarkTradeValue('Labourer'), 'Labourer')
    assert.equal(normalizeClaudeBenchmarkTradeValue('Carpenter'), 'Carpenter')
    assert.equal(normalizeClaudeBenchmarkTradeValue(null), null)
  })

  it('sets trade_normalized without overwriting trade_raw or trade_reviewed', () => {
    const rows = applyClaudeBenchmarkTradeNormalisation([
      {
        source_row: 5,
        trade_raw: 'Spark',
        trade_reviewed: 'Spark',
        trade: 'Spark',
        company_raw: 'SHC',
        company_reviewed: 'SHC',
      },
      {
        source_row: 6,
        trade_raw: 'Labourer',
        trade_reviewed: 'Labourer',
        trade: 'Labourer',
      },
    ])

    assert.equal(rows[0].trade_raw, 'Spark')
    assert.equal(rows[0].trade_reviewed, 'Spark')
    assert.equal(rows[0].trade_normalized, 'Electrician')
    assert.equal(rows[0].trade, 'Spark')
    assert.equal(rows[1].trade_raw, 'Labourer')
    assert.equal(rows[1].trade_reviewed, 'Labourer')
    assert.equal(rows[1].trade_normalized, 'Labourer')
  })

  it('normalises after consensus merge while preserving raw/reviewed OCR text', () => {
    const merged = applyClaudeBenchmarkCompanyTradeConsensus(
      [
        {
          source_row: 5,
          person_name: 'Keep Name',
          work_date: '2026-09-06',
          dateStatus: 'match',
          time_in: '07:30',
          time_out: '16:15',
          hours: 8.25,
          company: 'SHC',
          trade: 'Sparky',
        },
      ],
      [
        {
          source_row: 5,
          company: {
            raw_value: 'SHC',
            normalized_value: 'SHC',
            needs_review: false,
          },
          trade: {
            raw_value: 'Sparky',
            normalized_value: 'Sparky',
            needs_review: false,
          },
        },
      ],
    )
    const normalised = applyClaudeBenchmarkTradeNormalisation(merged)

    assert.equal(normalised[0].trade_raw, 'Sparky')
    assert.equal(normalised[0].trade_reviewed, 'Sparky')
    assert.equal(normalised[0].trade_normalized, 'Electrician')
    assert.equal(normalised[0].person_name, 'Keep Name')
    assert.equal(normalised[0].time_in, '07:30')
    assert.equal(normalised[0].company_reviewed, 'SHC')
  })
})

describe('Claude OCR benchmark break deduction', () => {
  /** Accepted 10 matched 6 Sep fixture — gross total 63.0 */
  const matchedTen = [8, 7.5, 7, 6.5, 6, 5.5, 5, 6, 6.5, 5].map((hours, index) => ({
    source_row: index + 5,
    dateStatus: 'match',
    included: true,
    work_date: '2026-09-06',
    time_in: '08:00',
    time_out: '16:00',
    hours,
  }))

  it('maps break options to deduction hours', () => {
    assert.equal(breakDeductionHoursFromValue(CLAUDE_BENCHMARK_BREAK_NONE), 0)
    assert.equal(breakDeductionHoursFromValue(CLAUDE_BENCHMARK_BREAK_30), 0.5)
    assert.equal(breakDeductionHoursFromValue(CLAUDE_BENCHMARK_BREAK_60), 1)
  })

  it('None leaves gross unchanged as net', () => {
    assert.equal(netHoursAfterBreakDeduction(6.5, 0), 6.5)
    assert.equal(netHoursAfterBreakDeduction(6.5, breakDeductionHoursFromValue('none')), 6.5)
  })

  it('30 min subtracts 0.5 and 60 min subtracts 1', () => {
    assert.equal(netHoursAfterBreakDeduction(6.5, 0.5), 6)
    assert.equal(netHoursAfterBreakDeduction(6.5, 1), 5.5)
  })

  it('result never falls below zero', () => {
    assert.equal(netHoursAfterBreakDeduction(0.25, 0.5), 0)
    assert.equal(netHoursAfterBreakDeduction(0, 1), 0)
  })

  it('bulk value applies to all included matched rows', () => {
    const applied = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_30,
    )
    assert.equal(applied.length, 10)
    for (const row of applied) {
      assert.equal(row.break_deduction, CLAUDE_BENCHMARK_BREAK_30)
      assert.equal(row.break_deduction_hours, 0.5)
      assert.equal(row.net_hours, netHoursAfterBreakDeduction(row.gross_hours, 0.5))
    }
  })

  it('individual override supersedes bulk value for that row', () => {
    const bulk = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_30,
    )
    const overridden = applyIndividualBreakDeductionOverride(
      bulk,
      5,
      CLAUDE_BENCHMARK_BREAK_NONE,
    )
    assert.equal(overridden[0].break_deduction, CLAUDE_BENCHMARK_BREAK_NONE)
    assert.equal(overridden[0].net_hours, overridden[0].gross_hours)
    assert.equal(overridden[1].break_deduction, CLAUDE_BENCHMARK_BREAK_30)
    assert.equal(
      overridden[1].net_hours,
      netHoursAfterBreakDeduction(overridden[1].gross_hours, 0.5),
    )
  })

  it('changing deductions does not change raw times or gross hours', () => {
    const bulk = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_60,
    )
    for (let i = 0; i < matchedTen.length; i += 1) {
      assert.equal(bulk[i].time_in, matchedTen[i].time_in)
      assert.equal(bulk[i].time_out, matchedTen[i].time_out)
      assert.equal(bulk[i].hours, matchedTen[i].hours)
      assert.equal(bulk[i].gross_hours, matchedTen[i].hours)
    }
  })

  it('current 10-row fixture totals 63.0 / 58.0 / 53.0', () => {
    const none = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_NONE,
    )
    const half = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_30,
    )
    const hour = applyBulkBreakDeductionToMatchedOperatives(
      matchedTen,
      CLAUDE_BENCHMARK_BREAK_60,
    )
    assert.equal(sumClaudeBenchmarkMatchedHours(none, 'gross'), 63)
    assert.equal(sumClaudeBenchmarkMatchedHours(none, 'net'), 63)
    assert.equal(sumClaudeBenchmarkMatchedHours(half, 'net'), 58)
    assert.equal(sumClaudeBenchmarkMatchedHours(hour, 'net'), 53)
  })
})
