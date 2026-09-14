import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  isSignInOcrApplyEnabled,
  parseSignInSheet,
  prepareSignInSheetImageForProvider,
  resolveSignInOcrProvider,
} from '@/lib/sign-in-ocr-provider'
import {
  emptySignInSheetWorkingState,
  hasSignInSheetEvidence,
  isSignInSheetRequestCurrent,
  nextSignInSheetRequestId,
  shouldReplaceSignInSheet,
} from '@/lib/sign-in-sheet-working-state'
import {
  clearPersistedSignInSheetEvidence,
  dataUrlToJpegBlob,
  preparedSignInSheetFileFromBlob,
  replacePersistedSignInSheetEvidence,
  SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE,
  SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE,
  SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE,
  signInSheetPathFromReport,
} from '@/lib/diary-sign-in-sheet-evidence'
import {
  applyOperativeLabourExclusionToReview,
  applyOperativeMoveToVisitorsFromReview,
  initSignInTradeHoursReviewFromOperatives,
} from '@/lib/sign-in-trade-hours-review'
import { applyTradeHoursReviewToLabourSummary } from '@/lib/labour-from-register'
import {
  LABOUR_APPLY_SAVE_FAIL_MESSAGE,
  persistAppliedLabourRows,
} from '@/lib/diary-labour-apply'
import { updateDiarySetupFields as updateDiarySetupFieldsImport } from '@/lib/diary-draft'
import {
  createEmptyLabourRow,
  labourRowHasData,
} from '@/lib/site-diary-labour-form'

const labourGroupBy = 'trade'

export function useSiteDiaryLabour({
  reportDate,
  editingReportId,
  projectId,
  supabase,
  updateDiarySetupFields = updateDiarySetupFieldsImport,
  labourRows: _labourRows,
  setLabourRows,
  lastPersistedLabourRef,
  dismissAutosaveSuccessClaim,
  invalidatePreparedSharePdf,
  makeUuid,
  signedUrlForPath,
  visitors = '',
  onVisitorsChange,
}) {
  const [labourMode, setLabourMode] = useState('manual')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanApplyError, setScanApplyError] = useState('')
  const [scanApplyNotice, setScanApplyNotice] = useState('')
  const [scanApplySaving, setScanApplySaving] = useState(false)
  const [scanApplySaved, setScanApplySaved] = useState(false)
  const labourApplyInFlightRef = useRef(false)
  const [scanMeta, setScanMeta] = useState({ matched: 0, ignored: 0, extracted: 0 })
  const [scanWarnings, setScanWarnings] = useState([])
  const [scanOperatives, setScanOperatives] = useState([])
  const [scanTradeHoursReview, setScanTradeHoursReview] = useState([])
  const scanTradeHoursReviewRef = useRef(scanTradeHoursReview)
  const [scanTradeHoursOtherDateCount, setScanTradeHoursOtherDateCount] = useState(0)
  const [scanTradeHoursReviewReady, setScanTradeHoursReviewReady] = useState(false)
  const [scanOcrProvider, setScanOcrProvider] = useState(null)
  const [scanApplyEnabled, setScanApplyEnabled] = useState(true)
  const [scanLastFile, setScanLastFile] = useState(null)
  const [scanSheetPreview, setScanSheetPreview] = useState(null)
  const [scanSignInPreviewLoadError, setScanSignInPreviewLoadError] = useState('')
  const [signInSheetStoragePath, setSignInSheetStoragePath] = useState(null)
  const loadedSignInSheetPathRef = useRef(null)
  const signInSheetRemovedRef = useRef(false)
  const [signInSheetPickerKey, setSignInSheetPickerKey] = useState(0)
  const scanRequestIdRef = useRef(0)
  const scanSheetPreviewRef = useRef(scanSheetPreview)

  useEffect(() => {
    scanTradeHoursReviewRef.current = scanTradeHoursReview
  }, [scanTradeHoursReview])

  useEffect(() => {
    scanSheetPreviewRef.current = scanSheetPreview
  }, [scanSheetPreview])

  useEffect(() => () => {
    if (scanSheetPreviewRef.current && String(scanSheetPreviewRef.current).startsWith('blob:')) {
      URL.revokeObjectURL(scanSheetPreviewRef.current)
    }
  }, [])

  const clearScanPreview = useCallback(() => {
    setScanSheetPreview((prev) => {
      if (prev && String(prev).startsWith('blob:')) {
        try { URL.revokeObjectURL(prev) } catch { /* ignore */ }
      }
      return null
    })
  }, [])

  const clearSignInSheetWorkingState = useCallback(() => {
    // Invalidate any in-flight Claude/OpenAI OCR so a late response cannot repopulate.
    scanRequestIdRef.current = nextSignInSheetRequestId(scanRequestIdRef.current)
    const empty = emptySignInSheetWorkingState()
    setScanLoading(empty.scanLoading)
    setScanError(empty.scanError)
    setScanApplyError(empty.scanApplyError)
    setScanApplyNotice(empty.scanApplyNotice)
    setScanApplySaving(empty.scanApplySaving)
    setScanApplySaved(empty.scanApplySaved)
    setScanMeta(empty.scanMeta)
    setScanWarnings(empty.scanWarnings)
    setScanOperatives(empty.scanOperatives)
    setScanTradeHoursReview([])
    setScanTradeHoursOtherDateCount(0)
    setScanTradeHoursReviewReady(false)
    setScanOcrProvider(empty.scanOcrProvider)
    setScanApplyEnabled(empty.scanApplyEnabled)
    setScanLastFile(empty.scanLastFile)
    clearScanPreview()
    setSignInSheetPickerKey((key) => key + 1)
  }, [clearScanPreview])

  const handleSignInSheetFiles = useCallback(async (files, { persistEvidence = true } = {}) => {
    // Camera cancel / empty picker — do not touch loading or draft state
    if (!shouldReplaceSignInSheet(files)) return
    const file = files[0]
    if (!file || !(file instanceof Blob)) return
    if (!reportDate) {
      setScanError('Set the report date before scanning a sign-in sheet.')
      return
    }

    // Genuine new/replacement selection — invalidate prior generation and replace (no merge).
    const requestId = nextSignInSheetRequestId(scanRequestIdRef.current)
    scanRequestIdRef.current = requestId

    setLabourMode('scan')
    setScanLoading(true)
    setScanError('')
    setScanSignInPreviewLoadError('')
    setScanApplyError('')
    setScanApplyNotice('')
    setScanApplySaving(false)
    setScanApplySaved(false)
    setScanWarnings([])
    setScanOperatives([])
    setScanTradeHoursReview([])
    setScanTradeHoursOtherDateCount(0)
    setScanTradeHoursReviewReady(false)
    setScanOcrProvider(null)
    setScanApplyEnabled(true)
    setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
    try {
      const provider = resolveSignInOcrProvider()
      const prepared = await prepareSignInSheetImageForProvider(file, provider)
      if (!isSignInSheetRequestCurrent(scanRequestIdRef.current, requestId)) return

      const preparedBlob = dataUrlToJpegBlob(prepared.dataUrl)
      const preparedFile = preparedSignInSheetFileFromBlob(preparedBlob)

      const mustPersist = Boolean(persistEvidence && editingReportId && projectId)
      if (mustPersist) {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user?.id) {
          setScanError(SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE)
          return
        }
        const persistResult = await replacePersistedSignInSheetEvidence(
          supabase,
          updateDiarySetupFields,
          {
            userId: user.id,
            reportId: editingReportId,
            projectId,
            dataUrl: prepared.dataUrl,
            previousStoragePath: loadedSignInSheetPathRef.current,
          },
        )
        if (!isSignInSheetRequestCurrent(scanRequestIdRef.current, requestId)) return
        if (!persistResult.ok || !persistResult.storagePath) {
          setScanError(SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE)
          return
        }
        loadedSignInSheetPathRef.current = persistResult.storagePath
        setSignInSheetStoragePath(persistResult.storagePath)
        signInSheetRemovedRef.current = false
      }

      setScanSheetPreview(prepared.dataUrl)
      if (preparedFile) setScanLastFile(preparedFile)

      const result = await parseSignInSheet({
        dataUrl: prepared.dataUrl,
        reportDate,
        groupBy: labourGroupBy,
        provider,
        imageMeta: prepared.imageMeta,
      })

      if (!isSignInSheetRequestCurrent(scanRequestIdRef.current, requestId)) return

      const operatives = Array.isArray(result.operatives) ? result.operatives : []
      setScanOperatives(operatives)
      const reviewed = initSignInTradeHoursReviewFromOperatives(operatives)
      setScanTradeHoursReview(reviewed.rows)
      setScanTradeHoursOtherDateCount(reviewed.otherDateCount)
      setScanTradeHoursReviewReady(true)
      setScanOcrProvider(result.provider || provider)
      setScanApplyEnabled(isSignInOcrApplyEnabled(result.provider || provider, result.applyEnabled))
      setScanWarnings(Array.isArray(result.warnings) ? result.warnings : [])
      setScanMeta({
        matched: result.matchedCount || 0,
        ignored: result.ignoredCount || 0,
        extracted: result.extractedCount || operatives.length,
      })

      if (!operatives.length) {
        setScanError('No attendee rows were read from this sheet. Try another photo or enter labour manually.')
      }
    } catch (err) {
      if (!isSignInSheetRequestCurrent(scanRequestIdRef.current, requestId)) return
      const hasPersistedPath = Boolean(
        loadedSignInSheetPathRef.current || signInSheetStoragePath,
      )
      if (!hasPersistedPath) {
        setScanSheetPreview(null)
      }
      setScanError(err?.message || 'Failed to scan sign-in sheet')
      setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
      setScanOperatives([])
      setScanTradeHoursReview([])
      setScanTradeHoursOtherDateCount(0)
      setScanTradeHoursReviewReady(false)
      setScanOcrProvider(null)
      setScanApplyEnabled(true)
      setScanWarnings([])
    } finally {
      if (isSignInSheetRequestCurrent(scanRequestIdRef.current, requestId)) {
        setScanLoading(false)
      }
    }
  }, [reportDate, editingReportId, projectId, signInSheetStoragePath, supabase, updateDiarySetupFields])

  const hasSignInSheetEvidenceOnForm = hasSignInSheetEvidence({
    signInSheetStoragePath,
    scanSheetPreview,
    scanOperatives,
    scanLoading,
    scanLastFile,
    scanError,
    scanMeta,
  })

  const applyScanOperativesToLabour = useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (typeof event?.nativeEvent?.stopImmediatePropagation === 'function') {
      event.nativeEvent.stopImmediatePropagation()
    }
    // Apply writes the Site Manager's reviewed Trade + Workers + Hours draft.
    if (!isSignInOcrApplyEnabled(scanOcrProvider, scanApplyEnabled)) {
      setScanApplySaved(false)
      setScanApplyNotice('')
      setScanApplyError(
        'Scanned labour cannot be applied to the summary yet. Review the sheet, or enter labour manually.',
      )
      return
    }
    if (labourApplyInFlightRef.current) return
    const result = applyTradeHoursReviewToLabourSummary(scanTradeHoursReviewRef.current, {
      makeKey: makeUuid,
    })
    if (!result.ok) {
      setScanApplySaved(false)
      setScanApplyNotice('')
      setScanApplyError(result.message)
      return
    }
    labourApplyInFlightRef.current = true
    flushSync(() => {
      setScanApplySaving(true)
      setScanApplySaved(false)
      setScanApplyError('')
      setScanApplyNotice('')
      setLabourRows(result.rows)
    })
    dismissAutosaveSuccessClaim()
    invalidatePreparedSharePdf('committed-diary-change')

    const finishApply = () => {
      labourApplyInFlightRef.current = false
      setScanApplySaving(false)
    }

    if (!editingReportId) {
      setScanApplyNotice(
        result.totals.hours > 0
          ? `Labour summary now shows ${result.totals.workers} ${result.totals.workers === 1 ? 'worker' : 'workers'} · ${result.totals.hours} hrs.`
          : `Labour summary now shows ${result.totals.workers} ${result.totals.workers === 1 ? 'worker' : 'workers'}. Check sign-in and sign-out times to add hours.`,
      )
      finishApply()
      return
    }

    void persistAppliedLabourRows(supabase, editingReportId, result.rows)
      .then((labourPayload) => {
        lastPersistedLabourRef.current = labourPayload
        setScanApplySaved(true)
        setScanApplyNotice(
          result.totals.hours > 0
            ? `${result.totals.workers} ${result.totals.workers === 1 ? 'worker' : 'workers'} · ${result.totals.hours} hrs saved.`
            : `${result.totals.workers} ${result.totals.workers === 1 ? 'worker' : 'workers'} saved.`,
        )
      })
      .catch(() => {
        setScanApplySaved(false)
        setScanApplyError(LABOUR_APPLY_SAVE_FAIL_MESSAGE)
      })
      .finally(() => {
        finishApply()
      })
  }, [
    dismissAutosaveSuccessClaim,
    editingReportId,
    invalidatePreparedSharePdf,
    makeUuid,
    scanApplyEnabled,
    scanOcrProvider,
    setLabourRows,
    supabase,
  ])

  const retrySignInScan = useCallback(() => {
    if (scanLastFile) {
      handleSignInSheetFiles([scanLastFile], { persistEvidence: false })
    }
  }, [scanLastFile, handleSignInSheetFiles])

  const removeSignInSheetEvidence = useCallback(async () => {
    if (
      typeof window !== 'undefined'
      && !window.confirm(
        'Remove this sign-in sheet photo? Your labour summary will stay as it is.',
      )
    ) {
      return
    }
    const path = loadedSignInSheetPathRef.current || signInSheetStoragePath
    if (editingReportId && projectId && path) {
      setScanLoading(true)
      setScanError('')
      try {
        const result = await clearPersistedSignInSheetEvidence(supabase, updateDiarySetupFields, {
          reportId: editingReportId,
          projectId,
          storagePath: path,
        })
        if (!result.ok) {
          setScanError(SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE)
          return
        }
      } finally {
        setScanLoading(false)
      }
    }
    clearSignInSheetWorkingState()
    loadedSignInSheetPathRef.current = null
    setSignInSheetStoragePath(null)
    setScanSignInPreviewLoadError('')
    signInSheetRemovedRef.current = true
  }, [
    clearSignInSheetWorkingState,
    editingReportId,
    projectId,
    signInSheetStoragePath,
    supabase,
    updateDiarySetupFields,
  ])

  const startManualLabour = useCallback(() => {
    setLabourMode('manual')
    setScanError('')
    setScanApplyError('')
    setScanApplyNotice('')
    setScanApplySaving(false)
    setScanApplySaved(false)
    setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
    setScanWarnings([])
    setScanOperatives([])
    setScanTradeHoursReview([])
    setScanTradeHoursOtherDateCount(0)
    setScanTradeHoursReviewReady(false)
    setLabourRows((rows) => (
      rows.some(labourRowHasData) ? rows : [createEmptyLabourRow(makeUuid())]
    ))
  }, [makeUuid, setLabourRows])

  const hydrateSignInFromReport = useCallback(async (existing, isCancelled) => {
    const hydratedSignInPath = signInSheetRemovedRef.current
      ? null
      : signInSheetPathFromReport(existing)
    if (hydratedSignInPath) {
      loadedSignInSheetPathRef.current = hydratedSignInPath
      setSignInSheetStoragePath(hydratedSignInPath)
      signInSheetRemovedRef.current = false
      setScanSignInPreviewLoadError('')
      const signInPreview = await signedUrlForPath(supabase, hydratedSignInPath)
      if (isCancelled()) return
      if (signInPreview) {
        setScanSheetPreview(signInPreview)
        try {
          const res = await fetch(signInPreview)
          const blob = await res.blob()
          const preparedFile = preparedSignInSheetFileFromBlob(blob)
          if (preparedFile) setScanLastFile(preparedFile)
        } catch {
          setScanSignInPreviewLoadError(SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE)
        }
      } else {
        setScanSignInPreviewLoadError(SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE)
      }
    } else {
      loadedSignInSheetPathRef.current = null
      setSignInSheetStoragePath(null)
      setScanSignInPreviewLoadError('')
    }
  }, [signedUrlForPath, supabase])

  const handleScanTradeHoursReviewChange = useCallback((next) => {
    setScanApplyError('')
    setScanApplyNotice('')
    setScanApplySaved(false)
    setScanTradeHoursReview(next)
  }, [])

  const handleOperativeLabourExclusion = useCallback(
    ({ reviewRowKey, operativeId, exclude }) => {
      const result = applyOperativeLabourExclusionToReview({
        operatives: scanOperatives,
        reviewRows: scanTradeHoursReviewRef.current,
        reviewRowKey,
        operativeId,
        exclude: exclude === true,
      })
      if (!result.ok) {
        setScanApplySaved(false)
        setScanApplyNotice('')
        setScanApplyError(
          result.conflict
            || 'Could not update labour for that person. Try again.',
        )
        return
      }
      setScanApplyError('')
      setScanApplyNotice('')
      setScanApplySaved(false)
      setScanOperatives(result.operatives)
      setScanTradeHoursReview(result.reviewRows)
    },
    [scanOperatives],
  )

  const handleOperativeMoveToVisitors = useCallback(
    ({ reviewRowKey, operativeId, tradeLabel }) => {
      const result = applyOperativeMoveToVisitorsFromReview({
        operatives: scanOperatives,
        reviewRows: scanTradeHoursReviewRef.current,
        reviewRowKey,
        operativeId,
        existingVisitorsText: visitors,
        tradeLabel: tradeLabel || '',
      })
      if (!result.ok) {
        setScanApplySaved(false)
        setScanApplyNotice('')
        if (result.reason === 'already-moved') {
          setScanApplyError('')
          return
        }
        setScanApplyError(
          result.conflict
            || 'Could not move that person to Visitors. Try again.',
        )
        return
      }
      setScanApplyError('')
      setScanApplyNotice('')
      setScanApplySaved(false)
      setScanOperatives(result.operatives)
      setScanTradeHoursReview(result.reviewRows)
      if (typeof onVisitorsChange === 'function') {
        onVisitorsChange(result.visitorsText)
      }
    },
    [scanOperatives, visitors, onVisitorsChange],
  )

  return {
    labourMode,
    setLabourMode,
    scanLoading,
    scanError,
    setScanError,
    scanApplyError,
    scanApplyNotice,
    scanApplySaving,
    scanApplySaved,
    scanMeta,
    scanWarnings,
    scanOperatives,
    scanTradeHoursReview,
    scanTradeHoursOtherDateCount,
    scanTradeHoursReviewReady,
    scanOcrProvider,
    scanApplyEnabled,
    scanLastFile,
    scanSheetPreview,
    scanSignInPreviewLoadError,
    signInSheetPickerKey,
    clearSignInSheetWorkingState,
    handleSignInSheetFiles,
    applyScanOperativesToLabour,
    retrySignInScan,
    removeSignInSheetEvidence,
    startManualLabour,
    hasSignInSheetEvidenceOnForm,
    hydrateSignInFromReport,
    handleScanTradeHoursReviewChange,
    handleOperativeLabourExclusion,
    handleOperativeMoveToVisitors,
  }
}
