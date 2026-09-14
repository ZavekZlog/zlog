/**
 * Labour OCR Apply path — Android tap must update Labour Summary, never silently no-op.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reviewSrc = readFileSync(join(root, 'components/diary/SignInOperativeReview.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const labourHook = readFileSync(join(root, 'components/diary/useSiteDiaryLabour.js'), 'utf8')
const parseRoute = readFileSync(join(root, 'app/api/parse-signin-sheet/route.js'), 'utf8')
const parseSheet = readFileSync(join(root, 'lib/parse-signin-sheet.js'), 'utf8')
const signInPrepSrc = readFileSync(join(root, 'lib/sign-in-image-preparation.js'), 'utf8')
const labourRegister = readFileSync(join(root, 'lib/labour-from-register.js'), 'utf8')

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing end ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const applyScan = sliceFn(labourHook, 'const applyScanOperativesToLabour = useCallback', 'const retrySignInScan')

describe('Labour OCR Apply button — Android form-tap isolation', () => {
  it('Apply is type=button, disconnected from the diary form, and stops the tap', () => {
    assert.match(reviewSrc, /type="button"/)
    assert.match(reviewSrc, /form="zlog-labour-ocr-apply-disconnected"/)
    assert.match(reviewSrc, /event\.preventDefault\(\)/)
    assert.match(reviewSrc, /event\.stopPropagation\(\)/)
    assert.match(reviewSrc, /touchAction: 'manipulation'/)
    assert.match(reviewSrc, /onClick=\{handleApply\}/)
  })

  it('shows inline validation or confirmation next to Apply — never a silent no-op', () => {
    assert.match(reviewSrc, /role="alert"/)
    assert.match(reviewSrc, /role="status"/)
    assert.match(reviewSrc, /applyError/)
    assert.match(reviewSrc, /applyNotice/)
  })

  it('shows Applying… while saving, then Applied and saved only after success', () => {
    assert.match(reviewSrc, /applying\s*\?\s*'Applying…'/)
    assert.match(reviewSrc, /appliedSaved/)
    assert.match(reviewSrc, /✓ Applied and saved/)
    assert.match(reviewSrc, /Apply \$\{resolvedTradeCount\} trade/)
    assert.match(reviewSrc, /applyNeedsReviewBlocked/)
    assert.match(reviewSrc, /formatSignInTradeHoursReviewStatus/)
    assert.match(reviewSrc, /Resolve the item marked for review before applying/)
    // Apply control is omitted while gated (Claude / applyEnabled=false); when shown it uses this disabled guard.
    assert.match(reviewSrc, /showApplyControl/)
    assert.match(reviewSrc, /applyNeedsReviewBlocked/)
  })
})

describe('Labour OCR Apply handler on Site Diary page', () => {
  it('applies reviewed Trade + Workers + Hours via applyTradeHoursReviewToLabourSummary', () => {
    assert.match(labourHook, /applyTradeHoursReviewToLabourSummary/)
    assert.match(applyScan, /applyTradeHoursReviewToLabourSummary\(scanTradeHoursReviewRef\.current/)
    assert.match(applyScan, /setLabourRows\(result\.rows\)/)
    assert.match(applyScan, /invalidatePreparedSharePdf\(/)
  })

  it('domain guard blocks unresolved review rows before labour summary update', () => {
    assert.match(labourRegister, /tradeHoursReviewRowNeedsResolution/)
    assert.match(labourRegister, /reason: 'needs-review'/)
    assert.match(labourRegister, /SIGNIN_ILLEGIBLE_TRADE_LABEL/)
  })

  it('failed apply sets a visible message and does not replace labour with an empty row', () => {
    assert.match(applyScan, /if \(!result\.ok\)/)
    assert.match(applyScan, /setScanApplyError\(result\.message\)/)
    assert.doesNotMatch(applyScan, /setLabourRows\(result\.rows\)[\s\S]*if \(!result\.ok\)/)
    assert.doesNotMatch(applyScan, /emptyLabour\(\)/)
    assert.match(applyScan, /setScanApplyNotice\(/)
  })

  it('stops the event so Android cannot treat Apply as diary form submit', () => {
    assert.match(applyScan, /event\?\.preventDefault/)
    assert.match(applyScan, /event\?\.stopPropagation/)
  })
})

describe('Edit existing diary — Apply persists report_labour', () => {
  it('persists applied rows with replaceLabour before claiming saved', () => {
    assert.match(applyScan, /persistAppliedLabourRows\(supabase, editingReportId, result\.rows\)/)
    assert.match(applyScan, /lastPersistedLabourRef\.current = labourPayload/)
    assert.match(applyScan, /setScanApplySaved\(true\)/)
    assert.match(applyScan, /result\.totals\.workers/)
    const persistAt = applyScan.indexOf('persistAppliedLabourRows')
    const savedAt = applyScan.indexOf('setScanApplySaved(true)')
    const refAt = applyScan.indexOf('lastPersistedLabourRef.current = labourPayload')
    assert.ok(persistAt >= 0 && savedAt > persistAt)
    assert.ok(refAt > persistAt)
    assert.doesNotMatch(applyScan, /finalizeSiteDiarySave/)
  })

  it('does not claim saved or update lastPersistedLabourRef on persistence failure', () => {
    const catchBlock = applyScan.slice(applyScan.indexOf('.catch(() => {'))
    assert.match(catchBlock, /setScanApplySaved\(false\)/)
    assert.match(catchBlock, /LABOUR_APPLY_SAVE_FAIL_MESSAGE/)
    assert.doesNotMatch(catchBlock, /lastPersistedLabourRef/)
    assert.doesNotMatch(catchBlock, /setScanApplySaved\(true\)/)
    assert.match(applyScan, /setLabourRows\(result\.rows\)/)
  })

  it('blocks a second tap while Apply is in flight', () => {
    const guardAt = applyScan.indexOf('if (labourApplyInFlightRef.current) return')
    const claimAt = applyScan.indexOf('labourApplyInFlightRef.current = true')
    const persistAt = applyScan.indexOf('persistAppliedLabourRows')
    assert.ok(guardAt >= 0 && claimAt > guardAt && persistAt > claimAt)
  })
})

describe('Sign-in OCR vision request — high-detail image (step 1 experiment)', () => {
  it('sends the register photo with detail high without changing model, temperature, or prompt', () => {
    assert.match(parseRoute, /image_url:\s*\{\s*url:\s*image,\s*detail:\s*['"]high['"]\s*\}/)
    assert.match(parseRoute, /model:\s*process\.env\.OPENAI_VISION_MODEL \|\| 'gpt-4o-mini'/)
    assert.match(parseRoute, /temperature:\s*0/)
    assert.match(parseRoute, /time_in \/ time_out = 24-hour clock strings as written on the sheet/)
    assert.match(parseRoute, /response_format:\s*\{\s*type:\s*['"]json_object['"]\s*\}/)
  })
})

describe('Sign-in OCR vision prompt — row completeness (step 2 experiment)', () => {
  it('requires a full top-to-bottom pass and keeps unreadable fields as null rows', () => {
    assert.match(parseRoute, /Inspect the table row by row from top to bottom/)
    assert.match(parseRoute, /stop early after a subset/)
    assert.match(parseRoute, /Never merge neighbouring handwritten rows/)
    assert.match(parseRoute, /Never copy one row's data into another/)
    assert.match(parseRoute, /Treat each physically populated row independently/)
    assert.match(parseRoute, /Count the populated rows before you return JSON/)
    assert.match(parseRoute, /Do not drop a populated line because one cell is unreadable/)
    assert.match(parseRoute, /Do not infer or fabricate missing people/)
  })

  it('asks for diagnostic source_row and logs count plus physical index without PII', () => {
    assert.match(parseRoute, /\{"visible_attendee_count":number,"rows":\[\{"source_row":number/)
    assert.match(parseRoute, /source_row = physical row index on the sheet/)
    assert.match(parseRoute, /rowCount: rows\.length/)
    assert.match(parseRoute, /source_row: row\?\.source_row \?\? null/)
    assert.doesNotMatch(parseRoute, /person_name: row/)
  })
})

describe('Sign-in OCR vision prompt — time column accuracy (step 3 experiment)', () => {
  it('requires independent Time In / Time Out column reads and forbids inferred shifts', () => {
    assert.match(parseRoute, /identify the exact physical Time In column and Time Out column/)
    assert.match(parseRoute, /Read each row’s own handwritten clocks independently/)
    assert.match(parseRoute, /Never infer a standard shift/)
    assert.match(parseRoute, /Never copy a time pair from another row/)
    assert.match(parseRoute, /Never convert an unclear time into a plausible common site time/)
    assert.match(parseRoute, /Preserve the handwritten minutes exactly/)
    assert.match(parseRoute, /handwritten 5 and 7/)
    assert.match(parseRoute, /between 0, 3, 5, and 8/)
    assert.match(parseRoute, /Do NOT calculate, estimate, or invent hours/)
    assert.match(parseRoute, /If name, trade or company is unreadable, use null/)
  })
})

describe('Sign-in OCR orientation — explicit EXIF flatten once', () => {
  it('bakes with prepareSignInImageToDataUrl (sign-in prep module), not browser-display PDF path', () => {
    const bake = parseSheet.slice(parseSheet.indexOf('export async function fileToVisionPreparedImage'))
    assert.match(bake, /prepareSignInImageToDataUrl\(file, maxEdge, quality\)/)
    assert.doesNotMatch(bake, /image-orientation/)
    assert.doesNotMatch(bake, /orientedImageToDataUrlForPdf/)
    assert.doesNotMatch(bake, /decodeBrowserDisplayImage/)
    assert.match(signInPrepSrc, /decodeSignInImageForExifBake/)
    assert.match(signInPrepSrc, /exifBake: true/)
    assert.match(parseSheet, /maxEdge = 1600/)
    assert.match(parseSheet, /quality = 0\.82/)
  })

  it('preview and OCR use the same prepared data URL from the provider boundary', () => {
    // Phase A: scan goes through prepareSignInSheetImageForProvider — not inline fileToVisionDataUrl.
    const scan = sliceFn(
      labourHook,
      'const prepared = await prepareSignInSheetImageForProvider(file, provider)',
      'const operatives =',
    )
    assert.match(scan, /setScanSheetPreview\(prepared\.dataUrl\)/)
    assert.match(scan, /dataUrl: prepared\.dataUrl/)
    assert.match(scan, /parseSignInSheet\(\{/)
    assert.match(scan, /dataUrl: prepared\.dataUrl/)
    assert.doesNotMatch(scan, /fileToOriginalClaudeBenchmarkImage/)
    assert.doesNotMatch(scan, /parseSignInSheetImage\(/)
    const providerSrc = readFileSync(join(root, 'lib/sign-in-ocr-provider.js'), 'utf8')
    assert.match(providerSrc, /fileToVisionPreparedImage/)
    assert.doesNotMatch(providerSrc, /fileToOriginalClaudeBenchmarkImage/)
  })

  it('does not change labour hours calculation or persist wiring', () => {
    assert.match(applyScan, /applyTradeHoursReviewToLabourSummary/)
    assert.match(applyScan, /persistAppliedLabourRows/)
    assert.match(parseSheet, /hours: calculated/)
    assert.doesNotMatch(parseSheet, /hours: row\.hours/)
  })
})

