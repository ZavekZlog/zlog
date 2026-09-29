/**
 * Phase 2A — workbench prepared-PDF invalidation on PDF-visible edits.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handlePdfVisibleTextInput } from './diary-share-ready-invalidate.js'
import { shouldReplaceSignInSheet } from './sign-in-sheet-working-state.js'
import { DIARY_AUTOSAVE_DEBOUNCE_MS } from './diary-autosave.js'
import { bumpPdfPrepareGeneration } from './diary-pdf-background-prepare.js'
import {
  SAVE_CTA_IDLE_LABEL,
  SAVE_CTA_SHARE_READY_LABEL,
} from './diary-save-pdf-coordination.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')
const labourSection = readFileSync(join(root, 'components/diary/SiteDiaryLabourSection.jsx'), 'utf8')
const labourHook = readFileSync(join(root, 'components/diary/useSiteDiaryLabour.js'), 'utf8')
const viewPage = readFileSync(join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx'), 'utf8')
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
const hsBlock = sliceFn(diaryPage, '<DiaryDailyRecordSections', '<GlassSection title="Plant"')
const brandingBlock = sliceFn(diaryPage, '<BrandingSelector', 'autoSelectDefault=')
const twBlock = sliceFn(diaryPage, '<DiaryTemporaryWorksSection', '/>')
const resign = sliceFn(diaryPage, 'const replaceSignature = () => {', 'const photosRef = useRef')
const applyScan = sliceFn(labourHook, 'const applyScanOperativesToLabour = useCallback', 'const retrySignInScan')

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
    assert.match(updateLabour, /invalidatePreparedSharePdf\(/)
    assert.match(
      labourSection,
      /invalidatePreparedSharePdf\([\s\S]{0,120}setLabourRows\(\(rows\) => rows\.filter/,
    )
    assert.match(
      labourSection,
      /invalidatePreparedSharePdf\([\s\S]{0,120}setLabourRows\(\(rows\) => \[\.\.\.rows, emptyLabour\(\)\]\)/,
    )
    assert.match(applyScan, /invalidatePreparedSharePdf\(/)
  })

  it('4 — photo workspace onChange invalidates; preview signing does not', () => {
    assert.match(walkChange, /invalidatePreparedSharePdf\(/)
    assert.match(walkChange, /setLocationWalk\(next\)/)
    assert.doesNotMatch(previewSign, /invalidatePreparedSharePdf/)
  })

  it('5 — cover replace and remove invalidate', () => {
    assert.match(coverDrop, /invalidatePreparedSharePdf\(/)
    assert.match(removeCover, /invalidatePreparedSharePdf\(/)
  })

  it('6 — signature stroke / clear / re-sign invalidate', () => {
    assert.match(diaryPage, /const onEndStroke = \(\) => \{[\s\S]*?invalidatePreparedSharePdf\(/)
    assert.match(resign, /invalidatePreparedSharePdf\(/)
    assert.match(diaryPage, /const clearSignaturePad = \(\) => \{[\s\S]*?invalidatePreparedSharePdf\(/)
  })

  it('7 — branding on this workbench invalidates; author/date/shift/project are not inline editors', () => {
    assert.match(brandingBlock, /invalidatePreparedSharePdf\(/)
    assert.match(brandingBlock, /setBrandingSelection\(next\)/)
    assert.match(diaryPage, /Review \/ Edit Project & Report Details/)
    assert.match(diaryPage, /onWorkbenchPersistSync=\{handleWorkbenchProjectDetailsSync\}/)
    assert.doesNotMatch(diaryPage, /handleInlineProjectDetailsPersistSuccess/)
    assert.match(
      sliceFn(
        diaryPage,
        'const handleWorkbenchProjectDetailsSync = useCallback',
        'const collapseInlineProjectDetails',
      ),
      /invalidatePreparedSharePdf\('committed-diary-change'\)/,
    )
    assert.doesNotMatch(diaryPage, /projectAndReportDetailsHref\(projectId, editingReportId\)/)
    const weatherOnChange = weatherBlock
    assert.doesNotMatch(weatherOnChange, /setReportDate\(/)
    assert.doesNotMatch(weatherOnChange, /setShiftType\(/)
    assert.doesNotMatch(weatherOnChange, /setCreatorName\(/)
    assert.doesNotMatch(weatherOnChange, /setCompanyReportingFor\(/)
    assert.match(diaryPage, /\[editingReportId, invalidatePreparedSharePdf\]/)
  })

  it('8 — after invalidation, next Save & Share still prepares when no File is held', () => {
    assert.match(handleSave, /isWorkbenchSharePrepared\(shareReadyPdfRef\.current\)/)
    assert.match(handleSave, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    const shareFirst = handleSave.indexOf('isWorkbenchSharePrepared(shareReadyPdfRef.current)')
    const prepareIdx = handleSave.indexOf('useNativeFileShareOnPrepare')
    assert.ok(shareFirst > 0 && prepareIdx > shareFirst)
    assert.match(helper, /shareReadyPdfRef\.current = null/)
  })

  it('9 — navigator.share is not called from an effect', () => {
    assert.doesNotMatch(diaryPage, /useEffect\([\s\S]{0,400}navigator\.share/)
    assert.doesNotMatch(viewPage, /useEffect\([\s\S]{0,400}navigator\.share/)
    assert.match(handleSave, /shareSiteDiaryPdfNative/)
  })

  it('10 — visitors, delays, actions, daily record, and plant are live diary edits', () => {
    assert.match(visitorsBlock, /setVisitors\(/)
    assert.match(delaysBlock, /setDelaysIssues\(/)
    assert.match(actionsBlock, /setActionsRequired\(/)
    assert.match(hsBlock, /setHsIncidents\(/)
    assert.match(hsBlock, /setRfis\(/)
    assert.match(hsBlock, /setVariations\(/)
    assert.match(updatePlant, /setPlantRows\(/)
    assert.match(plantBlock, /updatePlant\(/)
    assert.match(plantBlock, /rows\.filter\(\(r\) => r\.key !== row\.key\)/)
    assert.match(plantBlock, /\[\.\.\.rows, emptyPlant\(\)\]/)
  })

  it('equipment hire and temporary works edits invalidate', () => {
    assert.match(updateHire, /invalidatePreparedSharePdf\(/)
    assert.match(twBlock, /invalidatePreparedSharePdf\(/)
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
    assert.match(diaryPage, /SAVE_CTA_IDLE_LABEL/)
    assert.match(diaryPage, /SAVE_CTA_SHARE_READY_LABEL/)
    assert.match(handleSave, /runSiteDiaryPdfExportToShareReadyArtifact/)
    const prepareIdx = handleSave.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
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
  const ctaLabel = shareReady ? SAVE_CTA_SHARE_READY_LABEL : SAVE_CTA_IDLE_LABEL
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
    assert.equal(result.ctaLabel, SAVE_CTA_IDLE_LABEL)
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
    assert.equal(result.ctaLabel, SAVE_CTA_IDLE_LABEL)
  })
})

const dailyRecord = readFileSync(join(root, 'components/diary/DiaryDailyRecordSections.jsx'), 'utf8')

function extractBalanced(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openIndex, i + 1)
    }
  }
  assert.fail(`unbalanced brace at ${openIndex}`)
}

function arrowAfter(source, marker) {
  const at = source.indexOf(marker)
  assert.ok(at >= 0, `missing ${marker}`)
  const from = source.slice(at)
  const arrow = from.indexOf('=>')
  assert.ok(arrow >= 0, `missing arrow after ${marker}`)
  const paren = from.lastIndexOf('(', arrow)
  const brace = from.indexOf('{', arrow)
  const asyncPrefix = /\basync\s*$/.test(from.slice(0, paren)) ? 'async ' : ''
  return `${asyncPrefix}${from.slice(paren, arrow + 2)} ${extractBalanced(from, brace)}`
}

function bindNamed(arrowSource, scope) {
  const names = Object.keys(scope)
  return bindLive(arrowSource, names, names.map((name) => scope[name]))
}

function bindLive(arrowSource, names, values) {
  return new Function(...names, `return (${arrowSource})`)(...values)
}

const isWorkbenchSharePrepared = new Function(
  'SITE_DIARY_PDF_EXPORT_HANDOFF',
  `${sliceFn(diaryPage, 'function isWorkbenchSharePrepared(entry) {', 'function trimPdfExportId')}\nreturn isWorkbenchSharePrepared`,
)({ exportReady: 'export-ready', fileReady: 'file-ready' })

function readyHarness() {
  const prepared = { file: { name: 'A3.pdf' }, reportId: 'report-a' }
  const shareReadyPdfRef = { current: prepared }
  const pdfPrepareAbortRef = { current: { abort() {} } }
  const pdfBackgroundPrepareAbortRef = { current: null }
  const postHydratePdfReconcileAbortRef = { current: null }
  const pdfPrepareGenerationRef = { current: 3 }
  let shareReady = true
  const setShareReady = (updater) => {
    shareReady = typeof updater === 'function' ? updater(shareReady) : updater
  }
  const pdfBackgroundPrepareSchedulerRef = { current: { cancel() {}, schedule() {} } }
  const invalidatePreparedSharePdf = bindLive(
    arrowAfter(diaryPage, 'const invalidatePreparedSharePdf = useCallback'),
    [
      'emitShareDiag',
      'pdfPrepareAbortRef',
      'pdfBackgroundPrepareAbortRef',
      'postHydratePdfReconcileAbortRef',
      'shareReadyPdfRef',
      'pdfPrepareGenerationRef',
      'bumpPdfPrepareGeneration',
      'setShareReady',
      'pdfBackgroundPrepareSchedulerRef',
    ],
    [
      () => {},
      pdfPrepareAbortRef,
      pdfBackgroundPrepareAbortRef,
      postHydratePdfReconcileAbortRef,
      shareReadyPdfRef,
      pdfPrepareGenerationRef,
      bumpPdfPrepareGeneration,
      setShareReady,
      pdfBackgroundPrepareSchedulerRef,
    ],
  )
  return {
    prepared,
    shareReadyPdfRef,
    pdfPrepareGenerationRef,
    invalidatePreparedSharePdf,
    get shareReady() {
      return shareReady
    },
  }
}

function readyOutcome(harness) {
  const saving = false
  const error = ''
  const shareReady = harness.shareReady
  return {
    file: harness.shareReadyPdfRef.current,
    shareReady,
    readyBannerVisible: Boolean(shareReady && !saving && !error),
    ctaLabel: shareReady ? SAVE_CTA_SHARE_READY_LABEL : SAVE_CTA_IDLE_LABEL,
    directShare: isWorkbenchSharePrepared(harness.shareReadyPdfRef.current) && !saving,
    generation: harness.pdfPrepareGenerationRef.current,
  }
}

function assertStaleReadyCleared(prepared, result) {
  assert.equal(result.file, null)
  assert.notEqual(result.file, prepared)
  assert.equal(result.shareReady, false)
  assert.equal(result.readyBannerVisible, false)
  assert.equal(result.ctaLabel, SAVE_CTA_IDLE_LABEL)
  assert.equal(result.directShare, false)
  assert.ok(result.generation > 3)
}

function autosaveSuccessBlock() {
  const at = diaryPage.indexOf('if (result.ok) {')
  assert.ok(at >= 0, 'missing autosave success')
  const brace = diaryPage.indexOf('{', at)
  return diaryPage.slice(at, brace) + extractBalanced(diaryPage, brace)
}

function persistAutosaveSuccess(harness) {
  const block = autosaveSuccessBlock()
  const ackedSnapshotRef = { current: { visitors: 'P3' } }
  const lastPersistedReportRef = { current: { visitors: 'P3' } }
  new Function(
    'result',
    'isCurrent',
    'ackedSnapshotRef',
    'lastPersistedReportRef',
    'mergeAutosaveAckIntoReportRow',
    'paintAutosaveStatus',
    block,
  )(
    { ok: true, acked: { visitors: 'P4 visitors' } },
    () => true,
    ackedSnapshotRef,
    lastPersistedReportRef,
    (row, acked) => ({ ...row, ...acked }),
    () => {},
  )
  return harness
}

describe('Defect #3B — stale report-ready PDF after a later diary edit', () => {
  it('CASE 1 — Visitors edit invalidates the ready A3 artifact', () => {
    const harness = readyHarness()
    let visitors = 'P3 visitors'
    const edit = bindLive(
      arrowAfter(visitorsBlock, 'onChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setVisitors', 'setCarriedVisitors'],
      [() => {}, harness.invalidatePreparedSharePdf, (value) => { visitors = value }, () => {}],
    )
    edit({ target: { value: 'P4 visitors' } })
    assert.equal(visitors, 'P4 visitors')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 2 — Delays and issues edit invalidates the ready A3 artifact', () => {
    const harness = readyHarness()
    let delaysIssues = 'P3 delay'
    const edit = bindLive(
      arrowAfter(delaysBlock, 'onChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setDelaysIssues', 'setCarriedDelaysIssues'],
      [() => {}, harness.invalidatePreparedSharePdf, (value) => { delaysIssues = value }, () => {}],
    )
    edit({ target: { value: 'P4 delay' } })
    assert.equal(delaysIssues, 'P4 delay')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 3 — Actions required edit invalidates the ready A3 artifact', () => {
    const harness = readyHarness()
    let actionsRequired = 'P3 action'
    const edit = bindLive(
      arrowAfter(actionsBlock, 'onChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setActionsRequired'],
      [() => {}, harness.invalidatePreparedSharePdf, (value) => { actionsRequired = value }],
    )
    edit({ target: { value: 'P4 action' } })
    assert.equal(actionsRequired, 'P4 action')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 4 — H&S edit, add, and remove funnel through one invalidating handler', () => {
    assert.match(dailyRecord, /onHsChange\(hsIncidents\.map/)
    assert.match(dailyRecord, /onHsChange\(hsIncidents\.filter/)
    assert.match(dailyRecord, /onHsChange\(\[\.\.\.hsIncidents, emptyHsIncident\(\)\]\)/)
    const harness = readyHarness()
    let hsIncidents = []
    const edit = bindLive(
      arrowAfter(hsBlock, 'onHsChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setHsIncidents'],
      [() => {}, harness.invalidatePreparedSharePdf, (rows) => { hsIncidents = rows }],
    )
    edit([{ key: 'hs-1', description: 'P4 near miss' }])
    assert.equal(hsIncidents[0].description, 'P4 near miss')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 5 — RFI edit, add, and remove funnel through one invalidating handler', () => {
    assert.match(dailyRecord, /onRfisChange\(rfis\.map/)
    assert.match(dailyRecord, /onRfisChange\(rfis\.filter/)
    assert.match(dailyRecord, /onRfisChange\(\[\.\.\.rfis, emptyRfi\(\)\]\)/)
    const harness = readyHarness()
    let rfis = []
    const edit = bindLive(
      arrowAfter(hsBlock, 'onRfisChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setRfis'],
      [() => {}, harness.invalidatePreparedSharePdf, (rows) => { rfis = rows }],
    )
    edit([{ key: 'rfi-1', description: 'P4 query' }])
    assert.equal(rfis[0].description, 'P4 query')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 6 — Variations edit, add, and remove funnel through one invalidating handler', () => {
    assert.match(dailyRecord, /onVariationsChange\(variations\.map/)
    assert.match(dailyRecord, /onVariationsChange\(variations\.filter/)
    assert.match(dailyRecord, /onVariationsChange\(\[\.\.\.variations, emptyVariation\(\)\]\)/)
    const harness = readyHarness()
    let variations = []
    const edit = bindLive(
      arrowAfter(hsBlock, 'onVariationsChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setVariations'],
      [() => {}, harness.invalidatePreparedSharePdf, (rows) => { variations = rows }],
    )
    edit([{ key: 'var-1', description: 'P4 variation' }])
    assert.equal(variations[0].description, 'P4 variation')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 7a — plant edit invalidates the ready artifact', () => {
    const edited = readyHarness()
    let plantRows = [{ key: 'p1', plant_type: 'Telehandler' }]
    const update = bindLive(
      arrowAfter(diaryPage, 'const updatePlant = '),
      ['dismissAutosaveSuccessClaim', 'invalidatePreparedSharePdf', 'setPlantRows'],
      [
        () => {},
        edited.invalidatePreparedSharePdf,
        (updater) => { plantRows = updater(plantRows) },
      ],
    )
    update('p1', 'plant_type', 'Excavator')
    assert.equal(plantRows[0].plant_type, 'Excavator')
    assertStaleReadyCleared(edited.prepared, readyOutcome(edited))
  })

  it('CASE 7b — plant remove invalidates the ready artifact', () => {
    const removed = readyHarness()
    let removedRows = [{ key: 'drop', plant_type: 'Crane' }, { key: 'keep', plant_type: 'Pump' }]
    const remove = bindLive(
      arrowAfter(plantBlock, 'style={removeRowStyle} onClick='),
      ['dismissAutosaveSuccessClaim', 'invalidatePreparedSharePdf', 'setPlantRows', 'row'],
      [
        () => {},
        removed.invalidatePreparedSharePdf,
        (updater) => { removedRows = updater(removedRows) },
        { key: 'drop' },
      ],
    )
    remove()
    assert.deepEqual(removedRows.map((row) => row.key), ['keep'])
    assertStaleReadyCleared(removed.prepared, readyOutcome(removed))
  })

  it('CASE 7c — plant add invalidates the ready artifact', () => {
    const added = readyHarness()
    let addedRows = [{ key: 'p1', plant_type: 'Pump' }]
    const add = bindLive(
      arrowAfter(plantBlock, 'style={addRowButtonStyle} onClick='),
      ['dismissAutosaveSuccessClaim', 'invalidatePreparedSharePdf', 'setPlantRows', 'emptyPlant'],
      [
        () => {},
        added.invalidatePreparedSharePdf,
        (updater) => { addedRows = updater(addedRows) },
        () => ({ key: 'p2', plant_type: '' }),
      ],
    )
    add()
    assert.equal(addedRows.length, 2)
    assertStaleReadyCleared(added.prepared, readyOutcome(added))
  })

  it('CASE 8 — Weather still invalidates an existing ready artifact', () => {
    const harness = readyHarness()
    let weather = 'P3 sun'
    const edit = bindLive(
      arrowAfter(diaryPage, 'const handleWeatherInput = '),
      ['markLocalAutosaveMutation', 'handlePdfVisibleTextInput', 'invalidatePreparedSharePdf', 'setWeather'],
      [
        () => {},
        handlePdfVisibleTextInput,
        harness.invalidatePreparedSharePdf,
        (value) => { weather = value },
      ],
    )
    edit({ currentTarget: { value: 'P4 rain' } })
    assert.equal(weather, 'P4 rain')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 9 — live Project Details persistence still invalidates the ready artifact', () => {
    const harness = readyHarness()
    const applied = {}
    const sync = bindLive(
      arrowAfter(diaryPage, 'const handleWorkbenchProjectDetailsSync = useCallback'),
      [
        'markLocalAutosaveMutation',
        'setCreatorName',
        'setCreatorRole',
        'setCompanyReportingFor',
        'setShiftType',
        'setReportDate',
        'setProjectReference',
        'setBrandingSelection',
        'setSetupLogoPreview',
        'coverPhotoRef',
        'setCoverPhoto',
        'loadedCoverPathRef',
        'project',
        'setProject',
        'lastPersistedReportRef',
        'invalidatePreparedSharePdf',
      ],
      [
        () => {},
        (value) => { applied.creatorName = value },
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        () => {},
        { current: null },
        () => {},
        { current: null },
        null,
        () => {},
        { current: null },
        harness.invalidatePreparedSharePdf,
      ],
    )
    sync({
      creatorName: 'Pat',
      creatorRole: 'Site Manager',
      companyReportingFor: 'Zlog',
      shiftType: 'Day',
      reportDate: '2026-09-29',
      projectReference: 'REF',
      brandingSelection: null,
    })
    assert.equal(applied.creatorName, 'Pat')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('CASE 10 — later autosave of P4 does not resurrect the cleared A3 artifact', () => {
    assert.equal(DIARY_AUTOSAVE_DEBOUNCE_MS, 1500)
    const block = autosaveSuccessBlock()
    assert.doesNotMatch(block, /shareReadyPdfRef/)
    const harness = readyHarness()
    let visitors = 'P3 visitors'
    const edit = bindLive(
      arrowAfter(visitorsBlock, 'onChange='),
      ['markLocalAutosaveMutation', 'invalidatePreparedSharePdf', 'setVisitors', 'setCarriedVisitors'],
      [() => {}, harness.invalidatePreparedSharePdf, (value) => { visitors = value }, () => {}],
    )
    edit({ target: { value: 'P4 visitors' } })
    assert.equal(visitors, 'P4 visitors')
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
    persistAutosaveSuccess(harness)
    assert.equal(harness.shareReadyPdfRef.current, null)
    assert.equal(harness.shareReady, false)
    assert.equal(readyOutcome(harness).directShare, false)
    assert.equal(readyOutcome(harness).ctaLabel, SAVE_CTA_IDLE_LABEL)
  })
})

function attendanceRegisterFile() {
  return new File([Uint8Array.from([1, 2, 3])], 'register.jpg', { type: 'image/jpeg' })
}

function attendanceUploadScope(harness, { persistResult, persistEvidenceTracked, stages }) {
  const loadedSignInSheetPathRef = { current: 'registers/old.jpg' }
  const signInSheetRemovedRef = { current: false }
  const scanRequestIdRef = { current: 1 }
  const published = { path: 'registers/old.jpg' }
  const calls = { replace: 0 }
  return {
    scope: {
      shouldReplaceSignInSheet,
      setScanError() {},
      reportDate: '2026-09-29',
      loadedSignInSheetPathRef,
      signInSheetStoragePath: 'registers/old.jpg',
      evictSignInSheetSessionEvidence() {},
      nextSignInSheetRequestId(current) { return current + 1 },
      scanRequestIdRef,
      setLabourModeState() {},
      setManualLabourEditing() {},
      setManualLabourSaveError() {},
      manualLabourSnapshotRef: { current: null },
      setScanLoading() {},
      setScanSignInPreviewLoadError() {},
      setScanApplyError() {},
      setScanApplyNotice() {},
      setScanApplySaving() {},
      setScanApplySaved() {},
      setScanWarnings() {},
      setScanOperatives() {},
      setScanTradeHoursReview() {},
      setScanTradeHoursOtherDateCount() {},
      setScanTradeHoursReviewReady() {},
      setScanReviewEvidencePath() {},
      setScanOcrProvider() {},
      setScanApplyEnabled() {},
      setScanMeta() {},
      resolveSignInOcrProvider() { return 'test' },
      async prepareSignInSheetImageForProvider() {
        return { dataUrl: 'data:image/jpeg,abc', imageMeta: {} }
      },
      isSignInSheetRequestCurrent(active, requestId) { return active === requestId },
      dataUrlToJpegBlob() { return null },
      preparedSignInSheetFileFromBlob() { return null },
      editingReportId: 'report-a',
      projectId: 'project-a',
      supabase: { auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null } } } },
      async replacePersistedSignInSheetEvidence() {
        calls.replace += 1
        return persistResult
      },
      updateDiarySetupFields() {},
      SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE: 'save-failed',
      setSignInSheetStoragePath(path) { published.path = path },
      signInSheetRemovedRef,
      rememberSignInSheetSessionEvidence() {},
      setScanSheetPreview() {},
      setScanLastFile() {},
      async parseSignInSheet() {
        stages.push('ocr')
        return { operatives: [], provider: 'test', applyEnabled: false, warnings: [] }
      },
      labourGroupBy: 'trade',
      initSignInTradeHoursReviewFromOperatives() { return { rows: [], otherDateCount: 0 } },
      isSignInOcrApplyEnabled() { return false },
      scanReviewEvidencePathForCommittedGeneration() { return published.path },
      invalidatePreparedSharePdf(reason) {
        stages.push(`invalidate:${reason}`)
        harness.invalidatePreparedSharePdf(reason)
      },
    },
    loadedSignInSheetPathRef,
    published,
    calls,
    persistEvidenceTracked,
  }
}

function compileAttendanceUpload(harness, persistResult) {
  const stages = []
  const built = attendanceUploadScope(harness, { persistResult, stages })
  const upload = bindNamed(
    arrowAfter(labourHook, 'const handleSignInSheetFiles = useCallback'),
    built.scope,
  )
  return { upload, stages, ...built }
}

function compileAttendanceRemoval(harness, { confirm, clearResult }) {
  const loadedSignInSheetPathRef = { current: 'registers/old.jpg' }
  const signInSheetRemovedRef = { current: false }
  const published = { path: 'registers/old.jpg' }
  const calls = { clear: 0, evict: 0 }
  const previousWindow = globalThis.window
  globalThis.window = { confirm: () => confirm }
  const remove = bindNamed(
    arrowAfter(labourHook, 'const removeSignInSheetEvidence = useCallback'),
    {
      loadedSignInSheetPathRef,
      signInSheetStoragePath: 'registers/old.jpg',
      evictSignInSheetSessionEvidence() { calls.evict += 1 },
      editingReportId: 'report-a',
      projectId: 'project-a',
      setScanLoading() {},
      setScanError() {},
      async clearPersistedSignInSheetEvidence() {
        calls.clear += 1
        return clearResult
      },
      supabase: {},
      updateDiarySetupFields() {},
      SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE: 'remove-failed',
      clearSignInSheetWorkingState() {},
      setSignInSheetStoragePath(path) { published.path = path },
      setScanSignInPreviewLoadError() {},
      signInSheetRemovedRef,
      invalidatePreparedSharePdf(reason) {
        harness.invalidatePreparedSharePdf(reason)
      },
    },
  )
  return {
    remove,
    published,
    loadedSignInSheetPathRef,
    calls,
    restore() { globalThis.window = previousWindow },
  }
}

describe('Defect #3B — Attendance Register evidence invalidates a ready PDF', () => {
  it('AR1 — successful Attendance Register replacement clears A3 before OCR', async () => {
    const harness = readyHarness()
    const run = compileAttendanceUpload(harness, { ok: true, storagePath: 'registers/new.jpg' })
    await run.upload([attendanceRegisterFile()])
    assert.equal(run.loadedSignInSheetPathRef.current, 'registers/new.jpg')
    assert.equal(run.published.path, 'registers/new.jpg')
    const invalidateAt = run.stages.indexOf('invalidate:committed-diary-change')
    const ocrAt = run.stages.indexOf('ocr')
    assert.ok(invalidateAt >= 0 && ocrAt > invalidateAt)
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })

  it('AR1 failure — failed Attendance Register persist leaves A3 ready', async () => {
    const harness = readyHarness()
    const run = compileAttendanceUpload(harness, { ok: false, storagePath: null })
    await run.upload([attendanceRegisterFile()])
    assert.equal(run.calls.replace, 1)
    assert.equal(run.loadedSignInSheetPathRef.current, 'registers/old.jpg')
    assert.equal(run.stages.includes('invalidate:committed-diary-change'), false)
    assert.equal(run.stages.includes('ocr'), false)
    assert.equal(harness.shareReadyPdfRef.current, harness.prepared)
    assert.equal(readyOutcome(harness).directShare, true)
  })

  it('AR2 — successful Attendance Register removal clears A3', async () => {
    const harness = readyHarness()
    const run = compileAttendanceRemoval(harness, { confirm: true, clearResult: { ok: true } })
    try {
      await run.remove()
      assert.equal(run.calls.clear, 1)
      assert.equal(run.published.path, null)
      assert.equal(run.loadedSignInSheetPathRef.current, null)
      assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
    } finally {
      run.restore()
    }
  })

  it('AR2 failure — failed Attendance Register clear leaves A3 ready', async () => {
    const harness = readyHarness()
    const run = compileAttendanceRemoval(harness, { confirm: true, clearResult: { ok: false } })
    try {
      await run.remove()
      assert.equal(run.calls.clear, 1)
      assert.equal(run.published.path, 'registers/old.jpg')
      assert.equal(harness.shareReadyPdfRef.current, harness.prepared)
      assert.equal(readyOutcome(harness).directShare, true)
    } finally {
      run.restore()
    }
  })

  it('AR3 — empty picker and remove confirm cancel do not invalidate', async () => {
    const harness = readyHarness()
    const upload = compileAttendanceUpload(harness, { ok: true, storagePath: 'registers/new.jpg' })
    await upload.upload([])
    assert.equal(upload.calls.replace, 0)
    assert.equal(upload.stages.includes('invalidate:committed-diary-change'), false)
    assert.equal(harness.shareReadyPdfRef.current, harness.prepared)

    const remove = compileAttendanceRemoval(harness, { confirm: false, clearResult: { ok: true } })
    try {
      await remove.remove()
      assert.equal(remove.calls.clear, 0)
      assert.equal(remove.calls.evict, 0)
      assert.equal(harness.shareReadyPdfRef.current, harness.prepared)
      assert.equal(readyOutcome(harness).directShare, true)
    } finally {
      remove.restore()
    }
  })

  it('AR4 — OCR review edits and Re-scan do not invalidate a ready PDF', async () => {
    const harness = readyHarness()
    let review = []
    const changeReview = bindNamed(
      arrowAfter(labourHook, 'const handleScanTradeHoursReviewChange = useCallback'),
      {
        setScanApplyError() {},
        setScanApplyNotice() {},
        setScanApplySaved() {},
        setScanTradeHoursReview(next) { review = next },
        invalidatePreparedSharePdf(reason) {
          harness.invalidatePreparedSharePdf(reason)
        },
      },
    )
    changeReview([{ key: 'review-1', hours: 8 }])
    assert.equal(review[0].hours, 8)
    assert.equal(harness.shareReadyPdfRef.current, harness.prepared)

    const rescan = compileAttendanceUpload(harness, { ok: true, storagePath: 'registers/should-not-publish.jpg' })
    await rescan.upload([attendanceRegisterFile()], { persistEvidence: false })
    assert.equal(rescan.calls.replace, 0)
    assert.equal(rescan.loadedSignInSheetPathRef.current, 'registers/old.jpg')
    assert.equal(rescan.stages.includes('ocr'), true)
    assert.equal(rescan.stages.includes('invalidate:committed-diary-change'), false)
    assert.equal(harness.shareReadyPdfRef.current, harness.prepared)
    assert.equal(readyOutcome(harness).directShare, true)
  })

  it('AR5 — labour Apply still clears a ready PDF', () => {
    const harness = readyHarness()
    const labourApplyInFlightRef = { current: false }
    const apply = bindNamed(
      arrowAfter(labourHook, 'const applyScanOperativesToLabour = useCallback'),
      {
        isSignInOcrApplyEnabled() { return true },
        labourApplyInFlightRef,
        applyTradeHoursReviewToLabourSummary() {
          return { ok: true, rows: [{ key: 'row-1' }], totals: { workers: 1, hours: 8 }, message: '' }
        },
        scanTradeHoursReviewRef: { current: [] },
        makeUuid: () => 'row-1',
        scanOcrProvider: 'test',
        scanApplyEnabled: true,
        setScanApplySaved() {},
        setScanApplyNotice() {},
        setScanApplyError() {},
        setScanApplySaving() {},
        flushSync(run) { run() },
        setLabourRows() {},
        dismissAutosaveSuccessClaim() {},
        invalidatePreparedSharePdf() { harness.invalidatePreparedSharePdf('committed-diary-change') },
        editingReportId: null,
        scanLifecycleRevisionRef: { current: 0 },
        scanRequestIdRef: { current: 1 },
        scanLifecycleReportIdRef: { current: null },
        persistAppliedLabourRows() { return Promise.resolve(null) },
        supabase: {},
        projectId: 'project-a',
        lastPersistedLabourRef: { current: null },
        LABOUR_APPLY_SAVE_FAIL_MESSAGE: 'apply-failed',
      },
    )
    apply({ preventDefault() {}, stopPropagation() {} })
    assertStaleReadyCleared(harness.prepared, readyOutcome(harness))
  })
})
