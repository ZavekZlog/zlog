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

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing end ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const applyScan = sliceFn(diaryPage, 'const applyScanOperativesToLabour = useCallback', 'const retrySignInScan')

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
    assert.match(reviewSrc, /Apply \$\{includedCount\} to labour summary/)
    assert.match(reviewSrc, /disabled=\{disabled \|\| applying \|\| appliedSaved \|\| includedCount === 0\}/)
    assert.match(reviewSrc, /if \(disabled \|\| applying \|\| appliedSaved \|\| includedCount === 0\) return/)
  })
})

describe('Labour OCR Apply handler on Site Diary page', () => {
  it('applies current selected rows via applyOperativesToLabourSummary and updates labour rows', () => {
    assert.match(diaryPage, /applyOperativesToLabourSummary/)
    assert.match(applyScan, /applyOperativesToLabourSummary\(scanOperativesRef\.current/)
    assert.match(applyScan, /setLabourRows\(result\.rows\)/)
    assert.match(applyScan, /invalidatePreparedSharePdf\(/)
  })

  it('failed apply sets a visible message and does not replace labour with an empty row', () => {
    assert.match(applyScan, /if \(!result\.ok\)/)
    assert.match(applyScan, /setScanApplyError\(result\.message\)/)
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
    assert.match(applyScan, /labourApplySavedNotice\(result\.totals\)/)
    const persistAt = applyScan.indexOf('persistAppliedLabourRows')
    const savedAt = applyScan.indexOf('setScanApplySaved(true)')
    const refAt = applyScan.indexOf('lastPersistedLabourRef.current = labourPayload')
    const noticeAt = applyScan.indexOf('labourApplySavedNotice(result.totals)')
    assert.ok(persistAt >= 0 && savedAt > persistAt)
    assert.ok(refAt > persistAt)
    assert.ok(noticeAt > persistAt)
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

