import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIGNIN_OCR_PROVIDER_CLAUDE,
  SIGNIN_OCR_PROVIDER_OPENAI,
  isSignInOcrApplyEnabled,
  resolveSignInOcrProvider,
} from './sign-in-ocr-provider.js'
import {
  applyClaudeBenchmarkTradeNormalisation,
  qualifyClaudeBenchmarkOperativeRows,
} from './parse-signin-sheet-claude-benchmark.js'
import { dateStatusForReport, hoursFromSignInOut, operativeReviewFromSignIns } from './labour-from-register.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Local mirror of shapeClaudePhaseAReviewOperatives for node tests (avoids @/ pipeline import). */
function shapePhaseA(operatives) {
  return (Array.isArray(operatives) ? operatives : []).map((row) => {
    if (!row || typeof row !== 'object') return row
    const tradeNormalized =
      row.trade_normalized ?? row.trade_reviewed ?? row.trade ?? null
    const hoursOnSite = hoursFromSignInOut(row.time_in, row.time_out)
    return {
      ...row,
      trade: tradeNormalized,
      hours: hoursOnSite,
      hours_on_site: hoursOnSite,
    }
  })
}

describe('Sign-in OCR provider boundary (Phase A)', () => {
  it('defaults to Claude without deleting the OpenAI option', () => {
    assert.equal(resolveSignInOcrProvider(), SIGNIN_OCR_PROVIDER_CLAUDE)
    assert.equal(resolveSignInOcrProvider('openai'), SIGNIN_OCR_PROVIDER_OPENAI)
    assert.equal(resolveSignInOcrProvider('claude'), SIGNIN_OCR_PROVIDER_CLAUDE)
    const providerSrc = readFileSync(join(root, 'lib/sign-in-ocr-provider.js'), 'utf8')
    assert.match(providerSrc, /parseSignInSheetImage/)
    assert.match(providerSrc, /\/api\/parse-signin-sheet-claude/)
    assert.match(providerSrc, /fileToVisionPreparedImage/)
    assert.doesNotMatch(providerSrc, /labour-ocr-claude-benchmark/)
  })

  it('Claude and OpenAI both prepare explicit EXIF-upright JPEG for preview + OCR', () => {
    const providerSrc = readFileSync(join(root, 'lib/sign-in-ocr-provider.js'), 'utf8')
    const parseSheet = readFileSync(join(root, 'lib/parse-signin-sheet.js'), 'utf8')
    assert.match(providerSrc, /fileToVisionPreparedImage/)
    assert.doesNotMatch(providerSrc, /fileToOriginalClaudeBenchmarkImage/)
    assert.match(parseSheet, /prepareSignInImageToDataUrl\(/)
    assert.doesNotMatch(parseSheet, /image-orientation/)
    assert.match(parseSheet, /SIGNIN_UPRIGHT_IMAGE_PIPELINE/)
    assert.match(parseSheet, /explicit-exif-upright-signin-v2/)
    const route = readFileSync(
      join(root, 'app/api/parse-signin-sheet-claude/route.js'),
      'utf8',
    )
    assert.doesNotMatch(route, /original uploaded image bytes/)
    assert.doesNotMatch(route, /reencoded === true\)/)
    const labourHook = readFileSync(
      join(root, 'components/diary/useSiteDiaryLabour.js'),
      'utf8',
    )
    const scanSlice = labourHook.slice(
      labourHook.indexOf('const prepared = await prepareSignInSheetImageForProvider(file, provider)'),
      labourHook.indexOf('const operatives = Array.isArray(result.operatives)'),
    )
    assert.match(scanSlice, /replacePersistedSignInSheetEvidence\([\s\S]*dataUrl: prepared\.dataUrl/)
    assert.match(scanSlice, /setScanSheetPreview\(prepared\.dataUrl\)/)
    assert.match(scanSlice, /parseSignInSheet\(\{[\s\S]*dataUrl: prepared\.dataUrl/)
  })

  it('Apply is enabled when scan succeeds; review UI does not call persistence directly', () => {
    assert.equal(isSignInOcrApplyEnabled('claude', true), true)
    assert.equal(isSignInOcrApplyEnabled('claude', false), false)
    assert.equal(isSignInOcrApplyEnabled('openai', true), true)
    const labourHook = readFileSync(
      join(root, 'components/diary/useSiteDiaryLabour.js'),
      'utf8',
    )
    assert.match(labourHook, /isSignInOcrApplyEnabled/)
    assert.match(labourHook, /parseSignInSheet\(/)
    assert.doesNotMatch(labourHook, /todayIsoDate\(\)\s*,\s*groupBy/)
    assert.doesNotMatch(labourHook, /Apply disabled — Phase A/)
    assert.doesNotMatch(labourHook, /Claude review is on-screen only/)
    const review = readFileSync(
      join(root, 'components/diary/SignInOperativeReview.jsx'),
      'utf8',
    )
    assert.doesNotMatch(review, /Apply disabled — Phase A/)
    assert.doesNotMatch(review, /Claude review is on-screen only/)
    assert.match(review, /showApplyControl/)
    assert.doesNotMatch(review, /persistAppliedLabourRows/)
    assert.doesNotMatch(review, /replaceLabour/)
  })

  it('passes the Site Diary report date into classification — not todayIsoDate or hard-coded 6 Sep', () => {
    const labourHook = readFileSync(
      join(root, 'components/diary/useSiteDiaryLabour.js'),
      'utf8',
    )
    assert.match(
      labourHook,
      /parseSignInSheet\(\{[\s\S]*?reportDate,[\s\S]*?groupBy: labourGroupBy/,
    )
    const scanSlice = labourHook.slice(
      labourHook.indexOf('const prepared = await prepareSignInSheetImageForProvider'),
      labourHook.indexOf('const operatives = Array.isArray(result.operatives)'),
    )
    assert.doesNotMatch(scanSlice, /todayIsoDate\(\)/)

    const rows = [
      {
        source_row: 1,
        work_date: '2026-09-06',
        person_name: 'A',
        trade: 'Labourer',
        company: 'SHC',
        time_in: '08:00',
        time_out: '16:00',
      },
      {
        source_row: 2,
        work_date: '2026-09-05',
        person_name: 'B',
        trade: 'Labourer',
        company: 'SHC',
        time_in: '08:00',
        time_out: '16:00',
      },
    ]
    assert.equal(dateStatusForReport(rows[0], '2026-09-06'), 'match')
    assert.equal(dateStatusForReport(rows[1], '2026-09-06'), 'other')
    const reviewed = operativeReviewFromSignIns(rows, '2026-09-06')
    assert.equal(reviewed.filter((r) => r.dateStatus === 'match').length, 1)
    assert.equal(reviewed.filter((r) => r.dateStatus === 'other').length, 1)
  })
})

describe('Claude Phase A accepted review shape', () => {
  it('keeps row qualification and source_row', () => {
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
          date: '2026-09-06',
          person_name: 'A',
          trade: 'Sparky',
          company: 'SAC',
          time_in: '08:00',
          time_out: '16:00',
        },
        {
          source_row: 3,
          date: '2026-09-06',
          person_name: null,
          trade: null,
          company: null,
          time_in: null,
          time_out: null,
        },
      ],
      3,
    )
    assert.equal(qualified.rows.length, 1)
    assert.equal(qualified.rows[0].source_row, 1)
    assert.equal(qualified.droppedHeaderCount, 1)
    assert.equal(qualified.droppedSparseDateOnlyCount, 1)
  })

  it('normalises Spark→Electrician and sets hours_on_site from clocks without break deduction', () => {
    const base = operativeReviewFromSignIns(
      [
        {
          source_row: 5,
          work_date: '2026-09-06',
          trade: 'Sparky',
          time_in: '08:00',
          time_out: '16:00',
        },
      ],
      '2026-09-06',
    )
    const normalised = applyClaudeBenchmarkTradeNormalisation(base)
    const shaped = shapePhaseA(normalised)
    assert.equal(shaped[0].trade_normalized, 'Electrician')
    assert.equal(shaped[0].trade, 'Electrician')
    assert.equal(shaped[0].source_row, 5)
    assert.equal(shaped[0].time_in, '08:00')
    assert.equal(shaped[0].time_out, '16:00')
    assert.equal(shaped[0].hours_on_site, 8)
    assert.equal(shaped[0].hours, 8)
    assert.equal(shaped[0].break_deduction, undefined)
  })

  it('production pipeline no longer runs company/trade consensus or break shaping', () => {
    const pipeline = readFileSync(
      join(root, 'lib/parse-signin-sheet-claude-pipeline.js'),
      'utf8',
    )
    assert.doesNotMatch(pipeline, /runCompanyTradeConsensusPass/)
    assert.doesNotMatch(pipeline, /applyBulkBreakDeductionToMatchedOperatives/)
    assert.match(pipeline, /hours_on_site/)
    assert.match(pipeline, /person_name/)
    assert.match(pipeline, /optional/)
    assert.match(pipeline, /Do not invent a name/)
  })
})
