import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  emptySignInSheetWorkingState,
  hasSignInSheetWorkingContent,
  isSignInSheetRequestCurrent,
  nextSignInSheetRequestId,
  shouldReplaceSignInSheet,
} from './sign-in-sheet-working-state.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const labourHookPath = join(root, 'components/diary/useSiteDiaryLabour.js')
const labourSectionPath = join(root, 'components/diary/SiteDiaryLabourSection.jsx')
const reviewPath = join(root, 'components/diary/SignInOperativeReview.jsx')

function labourWiring() {
  return readFileSync(labourHookPath, 'utf8') + readFileSync(labourSectionPath, 'utf8')
}

describe('Sign-in sheet Replace / Remove / Retry UX', () => {
  it('Remove image clears image + OCR-derived state', () => {
    const empty = emptySignInSheetWorkingState()
    assert.equal(empty.scanSheetPreview, null)
    assert.equal(empty.scanLastFile, null)
    assert.deepEqual(empty.scanOperatives, [])
    assert.deepEqual(empty.scanWarnings, [])
    assert.deepEqual(empty.scanMeta, { matched: 0, ignored: 0, extracted: 0 })
    assert.equal(empty.scanError, '')
    assert.equal(empty.scanApplyError, '')
    assert.equal(empty.scanApplyNotice, '')
    assert.equal(empty.scanOcrProvider, null)
    assert.equal(empty.scanLoading, false)
    assert.equal(hasSignInSheetWorkingContent(empty), false)

    const wiring = labourWiring()
    assert.match(wiring, /Delete photo/)
    assert.match(wiring, /removeSignInSheetEvidence/)
    assert.match(wiring, /emptySignInSheetWorkingState/)
    assert.match(wiring, /DestructiveButton/)
    assert.match(wiring, /signInSheetPickerKey/)
  })

  it('Replace image clears OCR-derived state before the new image is processed', () => {
    assert.equal(shouldReplaceSignInSheet([]), false)
    assert.equal(shouldReplaceSignInSheet(null), false)
    assert.equal(shouldReplaceSignInSheet([new Blob(['x'], { type: 'image/jpeg' })]), true)

    const wiring = labourWiring()
    assert.match(wiring, /Take new photo/)
    assert.match(wiring, /Choose from gallery/)
    assert.match(wiring, /shouldReplaceSignInSheet/)
    assert.match(wiring, /Genuine new\/replacement selection/)
    assert.match(wiring, /setScanOperatives\(\[\]\)/)
    assert.match(wiring, /setScanWarnings\(\[\]\)/)
    assert.match(wiring, /setScanMeta\(\{ matched: 0, ignored: 0, extracted: 0 \}\)/)
    assert.match(wiring, /Camera cancel \/ empty picker — do not touch loading or draft state/)
  })

  it('Remove/Replace do not clear unrelated Site Diary data (including labourRows)', () => {
    const empty = emptySignInSheetWorkingState()
    assert.equal(Object.prototype.hasOwnProperty.call(empty, 'reportDate'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(empty, 'labourRows'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(empty, 'plantRows'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(empty, 'labourMode'), false)

    const hook = readFileSync(labourHookPath, 'utf8')
    assert.doesNotMatch(hook, /labourAppliedFromSignInSheetRef/)
    assert.doesNotMatch(hook, /shouldClearLabourSummaryForSignInSheetReset/)

    const clearFn = hook.match(
      /const clearSignInSheetWorkingState = useCallback\(\(\) => \{[\s\S]*?\}, \[clearScanPreview\]\)/,
    )
    assert.ok(clearFn, 'clearSignInSheetWorkingState present')
    assert.doesNotMatch(clearFn[0], /setReportDate/)
    assert.doesNotMatch(clearFn[0], /setPlantRows/)
    assert.doesNotMatch(clearFn[0], /setLabourRows/)
  })

  it('Retry scan continues to use the current image', () => {
    const wiring = labourWiring()
    assert.match(wiring, /Re-scan/)
    assert.match(
      readFileSync(labourHookPath, 'utf8'),
      /const retrySignInScan = useCallback\(\(\) => \{\s*if \(scanLastFile\) \{\s*handleSignInSheetFiles\(\[scanLastFile\], \{ persistEvidence: false \}\)/,
    )
    assert.match(wiring, /onClick=\{retrySignInScan\}/)
  })

  it('stale OCR response cannot restore a removed or replaced sheet', () => {
    let active = 0
    active = nextSignInSheetRequestId(active)
    const first = active
    active = nextSignInSheetRequestId(active)
    const second = active
    assert.equal(isSignInSheetRequestCurrent(active, first), false)
    assert.equal(isSignInSheetRequestCurrent(active, second), true)

    const hook = readFileSync(labourHookPath, 'utf8')
    assert.match(hook, /scanRequestIdRef/)
    assert.match(hook, /isSignInSheetRequestCurrent/)
  })

  it('production UI does not show Phase A / Claude developer wording', () => {
    const wiring = labourWiring()
    const review = readFileSync(reviewPath, 'utf8')
    assert.doesNotMatch(wiring, /Apply disabled — Phase A/)
    assert.doesNotMatch(review, /Apply disabled — Phase A/)
    assert.doesNotMatch(wiring, /Claude review is on-screen only/)
    assert.doesNotMatch(review, /Claude review is on-screen only/)
    assert.doesNotMatch(review, /Apply disabled/)
    assert.match(wiring, /isSignInOcrApplyEnabled/)
    assert.match(review, /showApplyControl/)
    assert.match(wiring, /Scan with camera/)
    assert.match(wiring, /Choose from gallery/)
  })
})
