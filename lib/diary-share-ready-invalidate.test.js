/**
 * Phase 2A — workbench prepared-PDF invalidation on PDF-visible edits.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handlePdfVisibleTextInput } from './diary-share-ready-invalidate.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const viewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')
const prewarm = readFileSync(join(root, 'lib/diary-pdf-asset-prewarm.js'), 'utf8')
const cacheLib = readFileSync(join(root, 'lib/diary-pdf-cache.js'), 'utf8')

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing end ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const helper = sliceFn(
  diaryPage,
  'const invalidatePreparedSharePdf = useCallback',
  'const [hydrateComplete, setHydrateComplete]',
)
const handleSave = sliceFn(diaryPage, 'const handleSave = async', 'if (loading && !loadDiagnostic)')
const walkChange = sliceFn(diaryPage, 'const handleLocationWalkChange = useCallback', 'const handleAreaNameValidationResolved')
const coverDrop = sliceFn(diaryPage, 'const onCoverDrop = useCallback', 'const canvasRef = useRef')
const removeCover = sliceFn(diaryPage, 'const removeCoverPhoto = () => {', 'const handleContinueDraft')
const updateLabour = sliceFn(diaryPage, 'const updateLabour = (key, field, value) => {', 'const updatePlant')
const updatePlant = sliceFn(diaryPage, 'const updatePlant = (key, field, value) => {', 'const updateEquipmentHire')
const updateHire = sliceFn(diaryPage, 'const updateEquipmentHire = (key, field, value) => {', 'const removeCoverPhoto')
const previewSign = sliceFn(diaryPage, 'const ensureReportPreviewForViewer = useCallback', 'const continueToSignature')
const weatherBlock = sliceFn(diaryPage, '<GlassSection title="Weather"', '</GlassSection>')
const summaryBlock = sliceFn(diaryPage, '<GlassSection title="Site summary"', '</GlassSection>')
const visitorsBlock = sliceFn(diaryPage, '<GlassSection title="Visitors"', '</GlassSection>')
const delaysBlock = sliceFn(diaryPage, '<GlassSection title="Delays & issues"', '</GlassSection>')
const actionsBlock = sliceFn(diaryPage, '<GlassSection title="Actions required"', '</GlassSection>')
const plantBlock = sliceFn(diaryPage, '<GlassSection title="Plant"', '<GlassSection title="Equipment on hire"')
const hsBlock = sliceFn(diaryPage, '<DiaryDailyRecordSections', '<GlassSection title="Site summary"')
const brandingBlock = sliceFn(diaryPage, '<BrandingSelector', 'autoSelectDefault=')
const twBlock = sliceFn(diaryPage, '<DiaryTemporaryWorksSection', '/>')
const resign = sliceFn(diaryPage, 'const resignSignature = () => {', 'const photosRef = useRef')
const applyScan = sliceFn(diaryPage, 'const applyScanOperativesToLabour = useCallback', 'const retrySignInScan')

describe('Phase 2A — invalidate stale prepared Share PDF on PDF-visible edits', () => {
  it('1 — helper clears the prepared File and shareReady flag', () => {
    assert.match(helper, /shareReadyPdfRef\.current = null/)
    assert.match(helper, /setShareReady\(\(prev\) => \(prev \? false : prev\)\)/)
  })

  it('2 — weather and site summary edits call the helper', () => {
    assert.match(diaryPage, /from '@\/lib\/diary-share-ready-invalidate'/)
    assert.match(
      diaryPage,
      /const handleWeatherInput = \(event\) => \{[\s\S]*?handlePdfVisibleTextInput\(invalidatePreparedSharePdf, setWeather, event\)/,
    )
    assert.match(
      diaryPage,
      /const handleSiteSummaryInput = \(event\) => \{[\s\S]*?handlePdfVisibleTextInput\(invalidatePreparedSharePdf, setSiteSummary, event\)/,
    )
    assert.match(weatherBlock, /onInput=\{handleWeatherInput\}/)
    assert.match(weatherBlock, /onChange=\{handleWeatherInput\}/)
    assert.match(summaryBlock, /onInput=\{handleSiteSummaryInput\}/)
    assert.match(summaryBlock, /onChange=\{handleSiteSummaryInput\}/)
  })

  it('3 — labour edit / add / remove / scan-apply call the helper', () => {
    assert.match(updateLabour, /invalidatePreparedSharePdf\(\)/)
    assert.match(diaryPage, /invalidatePreparedSharePdf\(\)[\s\S]{0,80}setLabourRows\(\(rows\) => rows\.filter/)
    assert.match(diaryPage, /invalidatePreparedSharePdf\(\)[\s\S]{0,80}setLabourRows\(\(rows\) => \[\.\.\.rows, emptyLabour\(\)\]\)/)
    assert.match(applyScan, /invalidatePreparedSharePdf\(\)/)
  })

  it('4 — photo workspace onChange invalidates; preview signing does not', () => {
    assert.match(walkChange, /invalidatePreparedSharePdf\(\)/)
    assert.match(walkChange, /setLocationWalk\(next\)/)
    assert.doesNotMatch(previewSign, /invalidatePreparedSharePdf/)
  })

  it('5 — cover replace and remove invalidate', () => {
    assert.match(coverDrop, /invalidatePreparedSharePdf\(\)/)
    assert.match(removeCover, /invalidatePreparedSharePdf\(\)/)
  })

  it('6 — signature stroke / clear / re-sign invalidate', () => {
    assert.match(diaryPage, /const onEndStroke = \(\) => \{[\s\S]*?invalidatePreparedSharePdf\(\)/)
    assert.match(resign, /invalidatePreparedSharePdf\(\)/)
    assert.match(diaryPage, /const clearSignaturePad = \(\) => \{[\s\S]*?invalidatePreparedSharePdf\(\)/)
  })

  it('7 — branding on this workbench invalidates; author/date/shift/project are not inline editors', () => {
    assert.match(brandingBlock, /invalidatePreparedSharePdf\(\)/)
    assert.match(brandingBlock, /setBrandingSelection\(next\)/)
    assert.match(diaryPage, /Review \/ Edit Project & Report Details/)
    assert.match(diaryPage, /projectAndReportDetailsHref\(projectId, editingReportId\)/)
    const weatherOnChange = weatherBlock
    assert.doesNotMatch(weatherOnChange, /setReportDate\(/)
    assert.doesNotMatch(weatherOnChange, /setShiftType\(/)
    assert.doesNotMatch(weatherOnChange, /setCreatorName\(/)
    assert.doesNotMatch(weatherOnChange, /setCompanyReportingFor\(/)
    assert.match(diaryPage, /\[editingReportId, invalidatePreparedSharePdf\]/)
  })

  it('8 — after invalidation, next Save & Share still prepares when no File is held', () => {
    assert.match(handleSave, /if \(shareReadyPdfRef\.current\?\.file && !saving\)/)
    assert.match(handleSave, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    const shareFirst = handleSave.indexOf('if (shareReadyPdfRef.current?.file && !saving)')
    const prepareIdx = handleSave.indexOf('await prepareSiteDiaryPdf')
    assert.ok(shareFirst > 0 && prepareIdx > shareFirst)
    assert.match(helper, /shareReadyPdfRef\.current = null/)
  })

  it('9 — navigator.share is not called from an effect', () => {
    assert.doesNotMatch(diaryPage, /useEffect\([\s\S]{0,400}navigator\.share/)
    assert.doesNotMatch(viewPage, /useEffect\([\s\S]{0,400}navigator\.share/)
    assert.match(handleSave, /shareSiteDiaryPdfNative/)
  })

  it('10 — non-PDF-visible workbench fields do not call the helper', () => {
    assert.doesNotMatch(updatePlant, /invalidatePreparedSharePdf/)
    assert.doesNotMatch(plantBlock, /invalidatePreparedSharePdf/)
    assert.doesNotMatch(visitorsBlock, /invalidatePreparedSharePdf/)
    assert.doesNotMatch(delaysBlock, /invalidatePreparedSharePdf/)
    assert.doesNotMatch(actionsBlock, /invalidatePreparedSharePdf/)
    assert.doesNotMatch(hsBlock, /invalidatePreparedSharePdf/)
  })

  it('equipment hire and temporary works edits invalidate', () => {
    assert.match(updateHire, /invalidatePreparedSharePdf\(\)/)
    assert.match(twBlock, /invalidatePreparedSharePdf\(\)/)
    assert.match(twBlock, /setTemporaryWorksApplicable/)
    assert.match(twBlock, /setTemporaryWorks/)
  })

  it('11 — photo prewarm architecture is unchanged', () => {
    assert.match(diaryPage, /void prewarmDiaryPdfSessionAssets\(/)
    assert.doesNotMatch(diaryPage, /await prewarmDiaryPdfSessionAssets/)
    assert.match(prewarm, /storePreparedWorkPhotoSessionBlob/)
    assert.match(prewarm, /PDF_ASSET_PREWARM_CONCURRENCY/)
  })

  it('12 — two-tap Share contract remains: prepare on first tap, native share on second', () => {
    assert.match(handleSave, /Second tap — native share from the already-prepared file only/)
    assert.match(diaryPage, /'Save & Share'/)
    assert.match(diaryPage, /Report Ready — Share Now/)
    assert.match(handleSave, /await prepareSiteDiaryPdf/)
    const prepareIdx = handleSave.indexOf('await prepareSiteDiaryPdf')
    const shareNowIdx = handleSave.indexOf('await sharePreparedFile')
    assert.ok(shareNowIdx > 0 && shareNowIdx < prepareIdx)
    assert.doesNotMatch(
      handleSave,
      /await shareSiteDiaryPdfNative\([\s\S]*prepareSiteDiaryPdf[\s\S]*shareSiteDiaryPdfNative/,
    )
  })

  it('does not change durable PDF fingerprint or saved-diary viewer', () => {
    assert.match(cacheLib, /String\(input\.updatedAt \|\| ''\)/)
    assert.doesNotMatch(viewPage, /invalidatePreparedSharePdf/)
  })
})

function invokeWorkbenchTextFieldEdit({ file, shareReady: ready, nextValue }) {
  const shareReadyPdfRef = { current: file }
  let shareReady = ready
  const setShareReady = (updater) => {
    shareReady = typeof updater === 'function' ? updater(shareReady) : updater
  }
  const invalidatePreparedSharePdf = () => {
    shareReadyPdfRef.current = null
    setShareReady((prev) => (prev ? false : prev))
  }
  let fieldValue = 'before'
  handlePdfVisibleTextInput(invalidatePreparedSharePdf, (value) => {
    fieldValue = value
  }, { currentTarget: { value: nextValue } })
  const saving = false
  const error = ''
  const readyBannerVisible = Boolean(shareReady && !saving && !error)
  const ctaLabel = shareReady ? 'Report Ready — Share Now' : 'Save & Share'
  return {
    shareReadyPdfRef,
    shareReady,
    fieldValue,
    readyBannerVisible,
    ctaLabel,
  }
}

describe('Phase 2A — Weather / Site Summary input handler invalidates immediately', () => {
  it('Weather handler clears prepared File, shareReady, and ready CTA', () => {
    const prepared = { file: { name: 'Zlog-Site-Diary.pdf' } }
    const result = invokeWorkbenchTextFieldEdit({
      file: prepared,
      shareReady: true,
      nextValue: 'Rain',
    })
    assert.equal(result.shareReadyPdfRef.current, null)
    assert.equal(result.shareReady, false)
    assert.equal(result.fieldValue, 'Rain')
    assert.equal(result.readyBannerVisible, false)
    assert.equal(result.ctaLabel, 'Save & Share')
  })

  it('Site Summary handler clears prepared File, shareReady, and ready CTA', () => {
    const prepared = { file: { name: 'Zlog-Site-Diary.pdf' } }
    const result = invokeWorkbenchTextFieldEdit({
      file: prepared,
      shareReady: true,
      nextValue: 'Poured slab',
    })
    assert.equal(result.shareReadyPdfRef.current, null)
    assert.equal(result.shareReady, false)
    assert.equal(result.fieldValue, 'Poured slab')
    assert.equal(result.readyBannerVisible, false)
    assert.equal(result.ctaLabel, 'Save & Share')
  })
})
