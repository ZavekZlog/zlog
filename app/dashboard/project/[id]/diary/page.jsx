'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import SignaturePad from 'signature_pad'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  PremiumShell,
  GlassSection,
  labelStyle,
  inputStyle,
  textareaStyle,
  PrimaryCTA,
  SecondaryButton,
  EqualChoiceButton,
  DIARY_ACCENT,
  RecentEntryCard,
  premiumDiaryEmptyClass,
  premiumDiaryEmptyTitleClass,
  premiumDiaryEmptyHintClass,
  typeTokens,
  recentEntryDateStyle,
  recentEntrySummaryStyle,
  recentEntryActionsStyle,
  recentEntryActionButtonStyle,
} from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import {
  labourAggregateTotals,
  labourRowsFromOperatives,
} from '@/lib/labour-from-register'
import { fileToVisionDataUrl, parseSignInSheetImage } from '@/lib/parse-signin-sheet'
import { BrandingSelector, brandingPayload } from '@/components/branding/BrandingSelector'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { SignInOperativeReview } from '@/components/diary/SignInOperativeReview'
import { DiaryDailyRecordSections } from '@/components/diary/DiaryDailyRecordSections'
import { DiaryTemporaryWorksSection } from '@/components/diary/DiaryTemporaryWorksSection'
import { PhotoWorkspace } from '@/components/photo-workspace'
import {
  flattenAreaGroups,
  groupPhotosByArea,
} from '@/lib/ai-annotation/area-groups'
import { isMissingWorkAreaNamePageError } from '@/lib/photo-workspace/commit-unsaved-area'
import { hasAnnotations } from '@/lib/photo-annotations'
import {
  createBlankDiaryDraft,
  createTodaysDiaryDraft,
  fetchOpenDraft,
  updateDiarySetupFields,
} from '@/lib/diary-draft'
import { DiarySaveError, DIARY_SAVE_LOG, finalizeSiteDiarySave } from '@/lib/diary-save'
import {
  labourFormToPersistRows,
  labourPersistRowsEqual,
  plantFormToPersistRows,
  photoRowsToBaseline,
  durablePhotosToBaseline,
  mergeAutosaveAckIntoReportRow,
} from '@/lib/diary-save-dirty'
import {
  DIARY_AUTOSAVE_DEBOUNCE_MS,
  autosavePayloadsEqual,
  autosaveStatusAfterResult,
  autosaveStatusMessage,
  shouldShowDiaryAutosaveStatus,
  shouldShowManualSaveConfirmation,
  buildDiaryAutosavePayload,
  classifyAutosaveFailure,
  runDiaryAutosave,
  shouldRunDiaryAutosave,
  resolveHydrateAutosaveSuppress,
  snapshotFromLiveRow,
} from '@/lib/diary-autosave'
import {
  hsIncidentsFromDb,
  hsIncidentsPayload,
  rfisFromDb,
  rfisPayload,
  temporaryWorksApplicableFromDb,
  temporaryWorksFromDb,
  temporaryWorksPayload,
  variationsFromDb,
  variationsPayload,
} from '@/lib/diary-daily-records'
import {
  coverPhotoStateFromSaved,
  resolveCoverPhotoPreviewUrl,
  planCoverPhotoPersistence,
  applyCoverPhotoPatch,
  coverPhotoPersistedOnRow,
  coverPhotoUrlForAutosave,
  isCoverAutosavePendingToken,
  coverPhotoStateAfterUpload,
  coverSetupFieldsFromSync,
  persistCanonicalCoverUpload,
  isPreparedCoverStoragePath,
} from '@/lib/diary-cover-photo'
import {
  getPendingCover,
  putPendingCover,
  markPendingCoverRemoved,
  fileFromPendingCover,
  syncPendingCoverUpload,
  newCoverPendingGeneration,
} from '@/lib/diary-cover-pending'
import {
  diaryHubHref,
  diaryEditHref,
  diaryComposeHref,
  existingDiaryHref,
  isTodaysDiary,
  openExistingDiaryHref,
  projectAndReportDetailsHref,
} from '@/lib/diary-routing'
import {
  diaryModeBanner,
  resolveDiaryInteractionMode,
  isDiaryWritableMode,
  showExistingDiaryModeChrome,
} from '@/lib/diary-view-mode'
import {
  hydrateAuthorName,
  hydrateAuthorRole,
  hydratePlantFormRows,
  linkedProjectForSavedDiary,
  shouldShowBrandingSelector,
  shouldShowRecentDiariesOnReportPage,
} from '@/lib/diary-form-hydrate'
import {
  canNativeShare,
  downloadSiteDiaryPdf,
  prepareSiteDiaryPdf,
  shareSiteDiaryPdfNative,
  snapshotUserActivation,
} from '@/lib/diary-share'
import { emitShareDiag } from '@/lib/share-diag-beacon'
import {
  startShareTimingRun,
  markShareTiming,
  patchShareTimingCounts,
  bumpShareTimingCount,
  subscribeShareTiming,
  getShareTimingSnapshot,
  formatShareTimingLines,
} from '@/lib/diary-share-timing-diag'
import { mapWithConcurrency } from '@/lib/diary-pdf-photos'
import { batchSignedUrlsForStoragePaths } from '@/lib/diary-share-pdf-assets'
import { prewarmDiaryPdfSessionAssets } from '@/lib/diary-pdf-asset-prewarm'
import { handlePdfVisibleTextInput } from '@/lib/diary-share-ready-invalidate'
import {
  bumpPdfPrepareGeneration,
  createDiaryPdfBackgroundPrepareScheduler,
  DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS,
  shouldAdoptBackgroundPreparedPdf,
  shouldRunBackgroundPdfPrepare,
} from '@/lib/diary-pdf-background-prepare'
import { readReportSetupExtras, reportDateInputValue, todayIsoDate } from '@/lib/report-setup'
import {
  describeDiaryWorkbenchLoadFailure,
  DIARY_PREVIEW_URL_TIMEOUT_MS,
  DIARY_WORKBENCH_LOAD_FAILED_COPY,
  DIARY_WORKBENCH_LOAD_TIMEOUT_MS,
  fetchProjectRowForEditHydrate,
  hydrateEditModeCoverAndReference,
  shouldCommitDiaryLoadState,
  withTimeout,
} from '@/lib/diary-edit-hydrate'
import {
  hydrateStickyFromRow,
} from '@/lib/project-sticky-fields'
import {
  hydrateProjectDatesFromRow,
} from '@/lib/diary-setup-project-dates'
import { runSiteDiaryShadowWorkbenchMerge } from '@/lib/site-diary-session-context'
import {
  diaryLinkedProjectSelectColumns,
  diaryProjectSelectorSelectColumns,
  programmeDatesForProjectDetails,
} from '@/lib/diary-project-details'
import {
  persistSaveAreaGroup,
  photoRowNeedsPreparedUpload,
  SAVE_AREA_PERSIST_FAIL_MESSAGE,
} from '@/lib/photo-workspace/persist-save-area'
import {
  ensurePreparedPhotoAssets,
  uploadPreparedPhotoAssets,
  buildPreparedPhotoRecordFields,
  collectLocalPreparedPdfPhotoSources,
} from '@/lib/photo-workspace/persist-prepared-photo'
import {
  createPhotoDisplaySignSession,
  signSavedPhotoGridRows,
} from '@/lib/photo-workspace/thumbnail-display'
import {
  loginUrlWithReturn,
  SESSION_EXPIRED_SAVE_MESSAGE,
} from '@/lib/auth/return-path'

const makeUuid = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return `${Date.now().toString(16)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
};

const emptyLabour = () => ({
  key: makeUuid(),
  trade: '',
  company: '',
  headcount: '',
  hours: '',
  notes: '',
})

const emptyPlant = () => ({
  key: makeUuid(),
  plant_type: '',
  quantity: '',
  hours: '',
  notes: '',
})

const EQUIPMENT_HIRE_STATUSES = ['Active', 'Off-Hired', 'Awaiting Collection']

const emptyEquipmentHire = () => ({
  key: makeUuid(),
  description: '',
  supplier: '',
  quantity: '',
  status: 'Active',
})

function equipmentHireFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return [emptyEquipmentHire()]
  return items.map((item) => ({
    key: makeUuid(),
    description: item?.description ?? '',
    supplier: item?.supplier ?? '',
    quantity: item?.quantity != null ? String(item.quantity) : '',
    status: EQUIPMENT_HIRE_STATUSES.includes(item?.status) ? item.status : 'Active',
  }))
}

function equipmentHireHasData(row) {
  return row.description.trim() || row.supplier.trim() || row.quantity || (row.status && row.status !== 'Active')
}

function equipmentHirePayload(rows) {
  return rows
    .filter(equipmentHireHasData)
    .map((row) => ({
      description: row.description.trim() || null,
      supplier: row.supplier.trim() || null,
      quantity: row.quantity ? parseInt(row.quantity, 10) : null,
      status: row.status || 'Active',
    }))
}

const rowGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
  marginBottom: 12,
}

const cellInputStyle = {
  ...inputStyle,
  marginBottom: 0,
  padding: '10px 12px',
  fontSize: 14,
}

const addRowButtonStyle = {
  background: 'var(--plate)',
  border: '1px dashed var(--edge)',
  borderRadius: 12,
  color: 'var(--text-2)',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
}

// Compact divider introducing Today's Site Diary content (cover lives on setup).
// Presentation only.
const todaysDiaryDividerStyle = {
  borderTop: '1px solid var(--edge)',
  paddingTop: 14,
  margin: '0 0 14px',
}

/** Share stays in document flow; mobile chrome clearance is in .zlog-diary-save-share-action. */
const DIARY_SAVE_SHARE_ACTION_STYLE = {
  marginTop: 8,
}

/** Green Saved ✓ linger after user returns from native share (~3s). */
const POST_SAVE_SHARE_DELAY_MS = 3200

const COVER_UPLOAD_FAIL_MESSAGE =
  'We couldn’t upload the cover photo. Check your connection and try Share again.'

const todaysDiaryDividerTitleStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  lineHeight: 1.3,
}

const todaysDiaryDividerNoteStyle = {
  margin: '6px 0 0',
  fontSize: 13,
  color: 'var(--text-2)',
  lineHeight: 1.45,
}

const removeRowStyle = {
  background: 'transparent',
  border: 'none',
  color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '4px 0',
  marginBottom: 8,
}

function resequencePhotos(photos) {
  // Continuous Photo 1..N across the whole report (all layouts), recalculated on add/remove/reorder.
  const layoutOrder = { full: 0, grid4: 1, grid6: 2 }
  const sorted = [...photos].sort((a, b) => {
    const la = layoutOrder[a.layout] ?? 1
    const lb = layoutOrder[b.layout] ?? 1
    if (la !== lb) return la - lb
    return (a.sequence_number || 0) - (b.sequence_number || 0)
  })
  return sorted.map((photo, index) => ({
    ...photo,
    sequence_number: index + 1,
  }))
}

const PHOTO_LAYOUT_SECTIONS = [
  {
    id: 'full',
    title: 'Full Page Photos (1 per page)',
    hint: 'Detailed focus shots — one large photo per PDF page',
  },
  {
    id: 'grid4',
    title: 'Standard Grid Photos (4 per page)',
    hint: 'Progress / snag shots — 2×2 grid on each PDF page',
  },
  {
    id: 'grid6',
    title: 'Compact Grid Photos (6 per page)',
    hint: 'Dense site checks — 3×2 grid on each PDF page',
  },
]

function labourFromDbRow(row) {
  return {
    key: makeUuid(),
    trade: row.trade ?? '',
    company: row.company ?? '',
    headcount: row.count != null ? String(row.count) : '',
    hours: row.hours != null ? String(row.hours) : '',
    notes: row.notes ?? '',
  }
}

function plantFromDbRow(row) {
  return {
    key: makeUuid(),
    plant_type: row.item ?? '',
    quantity: row.ref != null ? String(row.ref) : '',
    hours: row.status != null ? String(row.status) : '',
    notes: row.notes ?? '',
  }
}

const CARRIED_AMBER = '#F5A623'

const carriedFieldWrapStyle = {
  borderLeft: `3px solid ${CARRIED_AMBER}`,
  paddingLeft: 14,
  marginBottom: 0,
  background: 'rgba(245, 166, 35, 0.06)',
  borderRadius: '0 10px 10px 0',
}

const carriedFieldNoteStyle = {
  fontSize: 11,
  color: CARRIED_AMBER,
  margin: '0 0 8px',
  letterSpacing: '0.04em',
}

function labourRowHasData(row) {
  return Boolean(row.trade.trim() || row.company.trim() || row.headcount || row.hours || row.notes.trim())
}

async function signedUrlForPath(supabase, path) {
  try {
    return await withTimeout(
      resolveCoverPhotoPreviewUrl(supabase, path),
      DIARY_PREVIEW_URL_TIMEOUT_MS,
      'preview-url-timeout',
    )
  } catch {
    return null
  }
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const [header, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png'
  const binary = atob(body || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Android-safe bound — never unbounded parallel storage uploads on Share. */
const SHARE_PHOTO_UPLOAD_CONCURRENCY = 2

/** TEMPORARY — development-only Android timing readout. Hidden in production builds. */
function ShareTimingDiagPanel() {
  const snap = useSyncExternalStore(
    subscribeShareTiming,
    getShareTimingSnapshot,
    getShareTimingSnapshot,
  )
  const lines = formatShareTimingLines(snap)
  return (
    <div
      data-share-timing-diag="temporary"
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px dashed color-mix(in srgb, var(--text) 35%, transparent)',
        background: 'color-mix(in srgb, var(--text) 6%, transparent)',
        fontSize: 12,
        lineHeight: 1.4,
        color: 'var(--text-2)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>
        SAVE & SHARE DIAGNOSTIC — TEMPORARY
      </p>
      {lines.map((line, i) => (
        <div key={`${i}-${line.slice(0, 24)}`}>{line || '\u00a0'}</div>
      ))}
    </div>
  )
}

/** Upload transparent overlay PNG; returns storage path or null. */
async function uploadOverlayPng(supabase, { userId, reportId, sequence, dataUrl }) {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const storagePath = `${userId}/${reportId}/overlay-${sequence}-${Date.now()}.png`
  const { error } = await supabase.storage
    .from('site-photos')
    .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
  if (error) throw error
  return storagePath
}

export default function SiteDiaryPage() {
  const { id: projectId } = useParams()
  const searchParams = useSearchParams()
  const prefillLast = searchParams.get('prefill') === 'last'
  const editingReportId = searchParams.get('report') || searchParams.get('diaryId') || null
  const editQuery = searchParams.get('edit')
  const composeQuery = searchParams.get('compose')
  const duplicateReportId = (!editingReportId && searchParams.get('duplicate')) || null
  const templateReportId = (!editingReportId && searchParams.get('template')) || duplicateReportId || null
  // After save, stay on this report in View (banner clears “editing” wording).
  const [reportIsDraft, setReportIsDraft] = useState(null)
  const [formReloadToken, setFormReloadToken] = useState(0)
  const diaryMode = resolveDiaryInteractionMode({
    reportId: editingReportId,
    editQuery,
    composeQuery,
    isDraft: reportIsDraft,
  })
  // Writable = compose (new draft) or explicit edit. View is read-only.
  const isDiaryEditMode = isDiaryWritableMode(diaryMode)
  const isDiaryViewMode = diaryMode === 'view'
  const isDiaryExplicitEditMode = diaryMode === 'edit'
  const showDiaryModeChrome = showExistingDiaryModeChrome(diaryMode)
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const supabase = useMemo(() => createClient(), [])

  const showStartScreen = !editingReportId

  const [loading, setLoading] = useState(true)
  const saveCtaRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [showSaveBanner, setShowSaveBanner] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [error, setError] = useState('')
  const [loadDiagnostic, setLoadDiagnostic] = useState('')
  const loadGenerationRef = useRef(0)
  const saveNavTimerRef = useRef(null)
  const saveLockRef = useRef(false)
  const completingRef = useRef(false)
  const shareReadyPdfRef = useRef(null)
  const pdfPrepareGenerationRef = useRef(0)
  const pdfBackgroundPrepareSchedulerRef = useRef(null)
  const pdfBackgroundPrepareRunRef = useRef(null)
  const backgroundPrepareLiveRef = useRef({})
  const [shareReady, setShareReady] = useState(false)
  const invalidatePreparedSharePdf = useCallback(() => {
    shareReadyPdfRef.current = null
    pdfPrepareGenerationRef.current = bumpPdfPrepareGeneration(pdfPrepareGenerationRef.current)
    setShareReady((prev) => (prev ? false : prev))
    pdfBackgroundPrepareSchedulerRef.current?.cancel()
    pdfBackgroundPrepareSchedulerRef.current?.schedule()
  }, [])
  const [hydrateComplete, setHydrateComplete] = useState(false)
  const [autosaveStatus, setAutosaveStatus] = useState(null)
  const persistUiErrorRef = useRef('')
  const finalSaveInProgressRef = useRef(false)
  const ackedSnapshotRef = useRef(null)
  const lastPersistedReportRef = useRef(null)
  const lastPersistedLabourRef = useRef(null)
  const lastPersistedPlantRef = useRef(null)
  const lastPersistedPhotosRef = useRef(null)
  const latestPayloadRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const autosaveInFlightRef = useRef(null)
  const autosaveQueuedRef = useRef(false)
  const suppressAutosaveRef = useRef(false)
  /** Reuses identity from the existing auth effect — no extra auth query for SDSC shadow. */
  const authUserIdRef = useRef(null)

  // Clear stale locks when opening/switching a report so Save is never silently blocked.
  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E3 */
  useEffect(() => {
    saveLockRef.current = false
    completingRef.current = false
    invalidatePreparedSharePdf()
    setSaving(false)
    setJustSaved(false)
    setShowSaveBanner(false)
    setReportIsDraft(null)
    setHydrateComplete(false)
    persistUiErrorRef.current = ''
    finalSaveInProgressRef.current = false
    setAutosaveStatus(null)
    setLoadDiagnostic('')
    ackedSnapshotRef.current = null
    lastPersistedReportRef.current = null
    lastPersistedLabourRef.current = null
    lastPersistedPlantRef.current = null
    lastPersistedPhotosRef.current = null
    suppressAutosaveRef.current = true
  }, [editingReportId, invalidatePreparedSharePdf])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Detect session loss while editing — recover via Sign in CTA (do not leave Save enabled).
  useEffect(() => {
    let cancelled = false

    const applyAuthUser = (user) => {
      if (cancelled) return
      if (user) {
        authUserIdRef.current = user.id || null
        setSessionExpired(false)
        setError((prev) => {
          if (prev !== SESSION_EXPIRED_SAVE_MESSAGE) return prev
          persistUiErrorRef.current = ''
          return ''
        })
        return
      }
      authUserIdRef.current = null
      setSessionExpired(true)
      setSaving(false)
      setJustSaved(false)
      setShowSaveBanner(false)
      setError(SESSION_EXPIRED_SAVE_MESSAGE)
      saveLockRef.current = false
      completingRef.current = false
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      applyAuthUser(user)
    }).catch(() => {
      // Non-Auth network failures (TypeError: Failed to fetch) must not surface as
      // unhandled rejections — treat as unknown session until a later auth event.
      if (!cancelled) applyAuthUser(null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Avoid a false expired flash during INITIAL_SESSION hydration; getUser owns first paint.
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        applyAuthUser(null)
        return
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        applyAuthUser(session?.user ?? null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])
  const [startBusy, setStartBusy] = useState(false)
  const [startError, setStartError] = useState('')
  const [openDraft, setOpenDraft] = useState(null)

  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [recentDiaries, setRecentDiaries] = useState([])

  const [reportDate, setReportDate] = useState(todayIsoDate())
  const [weather, setWeather] = useState('')
  const [shiftType, setShiftType] = useState('Day')
  const [siteSummary, setSiteSummary] = useState('')
  const handleWeatherInput = (event) => {
    handlePdfVisibleTextInput(invalidatePreparedSharePdf, setWeather, event)
  }
  const handleSiteSummaryInput = (event) => {
    handlePdfVisibleTextInput(invalidatePreparedSharePdf, setSiteSummary, event)
  }
  const [labourRows, setLabourRows] = useState([emptyLabour()])
  const [labourMode, setLabourMode] = useState('manual') // 'scan' | 'manual'
  const [labourGroupBy, setLabourGroupBy] = useState('trade_company')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanMeta, setScanMeta] = useState({ matched: 0, ignored: 0, extracted: 0 })
  const [scanWarnings, setScanWarnings] = useState([])
  const [scanOperatives, setScanOperatives] = useState([])
  const [scanLastFile, setScanLastFile] = useState(null)
  const [scanSheetPreview, setScanSheetPreview] = useState(null)
  const [plantRows, setPlantRows] = useState([emptyPlant()])
  const [equipmentHireRows, setEquipmentHireRows] = useState([emptyEquipmentHire()])
  const [hsIncidents, setHsIncidents] = useState([])
  const [rfis, setRfis] = useState([])
  const [variations, setVariations] = useState([])
  const [temporaryWorksApplicable, setTemporaryWorksApplicable] = useState(null)
  const [temporaryWorks, setTemporaryWorks] = useState([])
  const [visitors, setVisitors] = useState('')
  const [delaysIssues, setDelaysIssues] = useState('')
  const [actionsRequired, setActionsRequired] = useState('')
  const [photos, setPhotos] = useState([])
  const [locationWalk, setLocationWalk] = useState([])
  const signatureSectionRef = useRef(null)
  const locationWalkRef = useRef(null)
  /** Phase D: session memo for grid batch + on-demand viewer report signing. */
  const photoDisplaySignRef = useRef(null)
  const pdfPrewarmGenRef = useRef(0)
  const [prefilledFromLast, setPrefilledFromLast] = useState(false)
  const [duplicatedFromReport, setDuplicatedFromReport] = useState(false)
  const [companyReportingFor, setCompanyReportingFor] = useState('')
  const [creatorName, setCreatorName] = useState('')
  const [creatorRole, setCreatorRole] = useState('')
  const [coverPhoto, setCoverPhoto] = useState(null)
  const loadedCoverPathRef = useRef(null)
  const coverRemovedRef = useRef(false)
  const coverPhotoRef = useRef(null)
  coverPhotoRef.current = coverPhoto
  /** F2B — generation of IndexedDB pending cover; stale uploads must not commit. */
  const coverPendingGenerationRef = useRef(null)
  const [signature, setSignature] = useState(null)
  const [signatureMode, setSignatureMode] = useState('draw') // 'carried' | 'accepted' | 'draw'
  const [brandingSelection, setBrandingSelection] = useState(null)
  const [carriedVisitors, setCarriedVisitors] = useState(false)
  const [carriedDelaysIssues, setCarriedDelaysIssues] = useState(false)
  const [projectReference, setProjectReference] = useState('')
  const [setupLogoPreview, setSetupLogoPreview] = useState(null)

  const openReportForm = useCallback((reportId, { mode = 'view', reportDate: entryDate = null } = {}) => {
    const href =
      mode === 'edit'
        ? diaryEditHref(projectId, reportId)
        : mode === 'compose'
          ? diaryComposeHref(projectId, reportId)
          : openExistingDiaryHref({
              projectId,
              reportId,
              reportDate: entryDate,
            })
    if (!href) return
    router.replace(href)
  }, [router, projectId])

  const refreshStartData = useCallback(async () => {
    const { data: proj } = await supabase
      .from('projects')
      .select(diaryLinkedProjectSelectColumns())
      .eq('id', projectId)
      .single()
    setProject(proj)

    let draft = null
    try {
      draft = await fetchOpenDraft(supabase, projectId)
    } catch (err) {
      if (!/is_draft/i.test(err?.message || '')) throw err
    }
    setOpenDraft(draft)

    let logsQuery = supabase
      .from('daily_reports')
      .select('id, report_date')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(5)
    let { data: logs, error: logsError } = await logsQuery.eq('is_draft', false)
    if (logsError && /is_draft/i.test(logsError.message || '')) {
      const fallback = await supabase
        .from('daily_reports')
        .select('id, report_date')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(5)
      logs = fallback.data
      logsError = fallback.error
    }
    if (logsError) throw logsError
    setRecentDiaries(logs || [])
  }, [supabase, projectId])

  // Start screen bootstrap + auto-create from legacy prefill/template links
  useEffect(() => {
    if (!projectId || editingReportId) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setStartError('')
      try {
        // Legacy ?prefill=last must land on the start screen, not auto-open the form.
        if (prefillLast) {
          router.replace(`/dashboard/diary?project=${projectId}`)
          return
        }
        if (templateReportId) {
          const id = await createTodaysDiaryDraft(supabase, projectId, templateReportId)
          if (!cancelled) openReportForm(id, { mode: 'compose' })
          return
        }
        // Consistent entry: A/B hub (edit existing vs start new) — same on phone and laptop.
        router.replace(`/dashboard/diary?project=${projectId}`)
      } catch (err) {
        if (!cancelled) setStartError(err?.message || 'Could not load Site Diary start options')
      } finally {
        // Always clear — cancelled navigations (e.g. after camera) must not leave Loading stuck
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [projectId, editingReportId, prefillLast, templateReportId, supabase, openReportForm, router])

  useEffect(() => {
    if (!editingReportId) return
    let cancelled = false
    const generation = ++loadGenerationRef.current
    const commit = () => shouldCommitDiaryLoadState({
      cancelled,
      generation,
      activeGeneration: loadGenerationRef.current,
    })
    const failLoad = (stage, err) => {
      if (!commit()) return
      const failure = describeDiaryWorkbenchLoadFailure({
        stage,
        reportId: editingReportId,
        projectId,
        error: err,
      })
      setLoadDiagnostic(failure.diagnostic)
      setError(failure.userMessage)
      if (process.env.NODE_ENV !== 'production') {
        console.log(failure.diagnostic, err || null)
      }
    }
    const load = async () => {
      console.log(DIARY_SAVE_LOG, 'load:start', { editingReportId, projectId })
      setLoading(true)
      setHydrateComplete(false)
      setLoadDiagnostic('')
      ackedSnapshotRef.current = null
      lastPersistedReportRef.current = null
      lastPersistedLabourRef.current = null
      lastPersistedPlantRef.current = null
      lastPersistedPhotosRef.current = null
      suppressAutosaveRef.current = true
      setError('')
      setPrefilledFromLast(false)
      setDuplicatedFromReport(false)
      setCarriedVisitors(false)
      setCarriedDelaysIssues(false)

      const watchdog = setTimeout(() => {
        failLoad('timeout', new Error('diary-load-timeout'))
        if (commit()) setLoading(false)
      }, DIARY_WORKBENCH_LOAD_TIMEOUT_MS)

      try {
        // Continue landings (`?compose=1`) paint once report + project + form
        // fields are applied. Saved-diary Edit (`?edit=1`) keeps signature
        // preview blocking, then paints before unused selector/recent fetches
        // and non-critical signed cover/logo/photo previews.
        const composeFlag = String(composeQuery || '').toLowerCase()
        const progressiveCompose =
          composeFlag === '1' || composeFlag === 'true' || composeFlag === 'compose'
        const editFlag = String(editQuery || '').toLowerCase()
        const progressiveEdit =
          editFlag === '1' || editFlag === 'true' || editFlag === 'edit'

        const proj = await fetchProjectRowForEditHydrate(supabase, projectId)

        const allProjectsPromise = progressiveCompose
          ? supabase
            .from('projects')
            .select(diaryProjectSelectorSelectColumns())
            .order('name')
          : null
        const recentDiariesPromise = progressiveCompose
          ? supabase
            .from('daily_reports')
            .select('id, report_date')
            .eq('project_id', projectId)
            .order('report_date', { ascending: false })
            .limit(5)
            .eq('is_draft', false)
          : null

        // Edit Workbench does not consume the selector list — do not fetch it.
        if (!progressiveCompose && !progressiveEdit) {
          const { data: allProjects } = await supabase
            .from('projects')
            .select(diaryProjectSelectorSelectColumns())
            .order('name')
          if (cancelled) return
          setProjects(allProjects || [])
        }
        if (cancelled) return
        setProject(proj)

        const today = todayIsoDate()
        setReportDate(today)
        setSiteSummary('')
        setActionsRequired('')
        setPhotos([])
        setLocationWalk([])
        setCoverPhoto(null)
        loadedCoverPathRef.current = null
        coverRemovedRef.current = false
        setSignature(null)
        setSignatureMode('draw')
        setBrandingSelection(null)
        setWeather('')
        setShiftType('Day')
        setVisitors('')
        setDelaysIssues('')
        setCompanyReportingFor('')
        setCreatorName('')
        setCreatorRole('')
        setProjectReference('')
        setSetupLogoPreview(null)
        setLabourRows([emptyLabour()])
        setPlantRows(hydratePlantFormRows([], makeUuid))
        setEquipmentHireRows([emptyEquipmentHire()])
        setHsIncidents([])
        setRfis([])
        setVariations([])
        setTemporaryWorksApplicable(null)
        setTemporaryWorks([])

        const applyCover = async (storagePath) => {
          if (!storagePath) {
            loadedCoverPathRef.current = null
            setCoverPhoto(null)
            return
          }
          loadedCoverPathRef.current = storagePath
          coverRemovedRef.current = false
          // Set path immediately so Edit This Diary never shows empty upload while signing.
          setCoverPhoto(coverPhotoStateFromSaved(storagePath, null))
          const preview = await resolveCoverPhotoPreviewUrl(supabase, storagePath)
          if (cancelled) return
          setCoverPhoto(coverPhotoStateFromSaved(storagePath, preview))
        }

        const applyCoverPathOnly = (storagePath) => {
          if (!storagePath) {
            loadedCoverPathRef.current = null
            setCoverPhoto(null)
            return
          }
          loadedCoverPathRef.current = storagePath
          coverRemovedRef.current = false
          setCoverPhoto(coverPhotoStateFromSaved(storagePath, null))
        }

        const applySignature = async (storagePath) => {
          if (!storagePath) {
            setSignature(null)
            setSignatureMode('draw')
            return
          }
          const preview = await signedUrlForPath(supabase, storagePath)
          if (cancelled) return
          if (!preview) {
            setSignature({ file: null, preview: null, storagePath })
            setSignatureMode('carried')
            return
          }
          setSignature({ file: null, preview, storagePath })
          setSignatureMode('carried')
        }

        const applySignaturePathOnly = (storagePath) => {
          if (!storagePath) {
            setSignature(null)
            setSignatureMode('draw')
            return
          }
          setSignature({ file: null, preview: null, storagePath })
          setSignatureMode('carried')
        }

        const mapPhotoRowWithoutPreview = (p, index) => ({
          // Prefer durable identity (db id / storage path) so Edit + delete keep
          // the same photo across progressive hydrate. Never mint a fresh UUID
          // when a persisted key already exists.
          key: p.id || p.url || makeUuid(),
          file: null,
          preview: null,
          storagePath: p.url,
          caption: p.caption || '',
          sequence_number: p.sequence ?? index + 1,
          layout: p.layout || 'grid4',
          location: p.location || '',
          category: p.category || null,
          annotations: p.annotations || null,
          overlayPath: p.overlay_path || null,
          overlayPreview: null,
          overlayDirty: false,
          rotationDegrees: p.rotation_degrees ?? 0,
          assignedTo: p.assigned_to || '',
          // Phase C/D prepared-asset metadata — thumbnailPath drives grid when signed.
          thumbnailPath: p.thumbnail_path || null,
          thumbnailPreview: null,
          reportWidth: p.report_width ?? null,
          reportHeight: p.report_height ?? null,
          thumbnailWidth: p.thumbnail_width ?? null,
          thumbnailHeight: p.thumbnail_height ?? null,
          reportByteSize: p.report_byte_size ?? null,
          thumbnailByteSize: p.thumbnail_byte_size ?? null,
          processingVersion: p.processing_version || null,
        })

        // Phase D: thumb-first batch grid hydrate — do NOT sign Phase C report.jpg here.
        photoDisplaySignRef.current = createPhotoDisplaySignSession({
          expiresIn: 3600,
          batchSignPaths: async (paths, expiresIn = 3600) => {
            const { data, error } = await supabase.storage
              .from('site-photos')
              .createSignedUrls(paths, expiresIn)
            if (error) throw error
            return data || []
          },
          singleSignPath: (path) => signedUrlForPath(supabase, path),
        })
        const signReportPhotoRows = async (rows) => signSavedPhotoGridRows(rows || [], {
          session: photoDisplaySignRef.current,
          mapRow: (p, index, signed) => ({
            ...mapPhotoRowWithoutPreview(p, index),
            preview: signed.preview,
            thumbnailPreview: signed.thumbnailPreview,
            overlayPreview: signed.overlayPreview,
          }),
        })

        const { data: existing, error: existingError } = await withTimeout(
          supabase
            .from('daily_reports')
            .select('*')
            .eq('id', editingReportId)
            .eq('project_id', projectId)
            .maybeSingle(),
          DIARY_WORKBENCH_LOAD_TIMEOUT_MS,
          'daily_reports-timeout',
        )

        if (cancelled) return

        if (existingError) {
          failLoad('daily_reports', existingError)
          return
        }
        if (!existing) {
          console.log(DIARY_SAVE_LOG, 'load:not-found', { existingError, editingReportId })
          // Soft recovery — never leave the user on a raw Next.js 404.
          routerRef.current.replace(diaryHubHref({ projectId, missing: true }))
          return
        }
        console.log(DIARY_SAVE_LOG, 'load:ok', {
          id: existing.id,
          site_summary: existing.site_summary,
          report_date: existing.report_date,
          cover_photo_url: existing.cover_photo_url || null,
        })
        setReportIsDraft(existing.is_draft === true)

        // Canonical edit hydrate — Cover + Project Reference from saved rows.
        const extras = readReportSetupExtras(existing.id)
        const editHydration = hydrateEditModeCoverAndReference({
          report: existing,
          projectRow: proj,
          reportExtras: extras,
        })
        setProjectReference(editHydration.projectReference)
        // Path first so compose/edit can paint; signed preview finishes after first paint.
        if (progressiveCompose || progressiveEdit) {
          applyCoverPathOnly(editHydration.coverStoragePath)
        } else {
          await applyCover(editHydration.coverStoragePath)
          if (cancelled) return
        }

        // F2B: local durable pending cover (IndexedDB) overrides empty server path for preview.
        // Network upload must NOT block first usable UI.
        let pendingCoverGeneration = null
        try {
          const pending = await getPendingCover(editingReportId)
          if (pending && !pending.removed && pending.blob) {
            const file = fileFromPendingCover(pending)
            if (file) {
              const localPreview = URL.createObjectURL(pending.blob)
              pendingCoverGeneration = pending.generation
              coverPendingGenerationRef.current = pending.generation
              coverRemovedRef.current = false
              const localState = {
                file,
                preview: localPreview,
                storagePath: null,
              }
              coverPhotoRef.current = localState
              setCoverPhoto(localState)
            }
          }
        } catch {
          /* pending handoff optional — diary still opens */
        }

        let labour
        let plant
        let reportPhotos
        {
          const results = await Promise.all([
            supabase.from('report_labour').select('trade, company, count, hours, notes').eq('report_id', existing.id).order('sequence'),
            supabase.from('report_plant').select('item, ref, status, notes').eq('report_id', existing.id).order('sequence'),
            supabase.from('report_photos').select('id, url, caption, sequence, layout, location, category, annotations, overlay_path, rotation_degrees, assigned_to, thumbnail_path, report_width, report_height, thumbnail_width, thumbnail_height, report_byte_size, thumbnail_byte_size, processing_version').eq('report_id', existing.id).order('sequence'),
          ])
          labour = results[0].data
          plant = results[1].error ? [] : results[1].data
          reportPhotos = results[2].data
          if (results[2].error && /thumbnail_path|processing_version|report_width|report_height|thumbnail_width|thumbnail_height|report_byte_size|thumbnail_byte_size/i.test(results[2].error.message || '')) {
            const withoutPrepared = await supabase
              .from('report_photos')
              .select('id, url, caption, sequence, layout, location, category, annotations, overlay_path, rotation_degrees, assigned_to')
              .eq('report_id', existing.id)
              .order('sequence')
            reportPhotos = withoutPrepared.data
            results[2] = withoutPrepared
          }
          if (results[2].error && /assigned_to/i.test(results[2].error.message || '')) {
            const fallback = await supabase
              .from('report_photos')
              .select('url, caption, sequence, layout, location, category, annotations, overlay_path, rotation_degrees')
              .eq('report_id', existing.id)
              .order('sequence')
            reportPhotos = fallback.data
            if (fallback.error && /rotation_degrees/i.test(fallback.error.message || '')) {
              const basic = await supabase
                .from('report_photos')
                .select('url, caption, sequence, layout, location, category, annotations, overlay_path')
                .eq('report_id', existing.id)
                .order('sequence')
              reportPhotos = basic.data
            }
          } else if (results[2].error && /rotation_degrees/i.test(results[2].error.message || '')) {
            const fallback = await supabase
              .from('report_photos')
              .select('url, caption, sequence, layout, location, category, annotations, overlay_path, assigned_to')
              .eq('report_id', existing.id)
              .order('sequence')
            reportPhotos = fallback.data
          } else if (results[2].error && /annotations|overlay_path/i.test(results[2].error.message || '')) {
            const fallback = await supabase
              .from('report_photos')
              .select('url, caption, sequence, layout, location, category, rotation_degrees, assigned_to')
              .eq('report_id', existing.id)
              .order('sequence')
            reportPhotos = fallback.data
            if (fallback.error) {
              const basic = await supabase
                .from('report_photos')
                .select('url, caption, sequence, layout, location, category')
                .eq('report_id', existing.id)
                .order('sequence')
              reportPhotos = basic.data
            }
          }
        }

        if (cancelled) return

        setReportDate(reportDateInputValue(existing.report_date) || today)
        setWeather(existing.weather || '')
        setShiftType(existing.shift || existing.shift_type || 'Day')
        setSiteSummary(existing.site_summary || '')
        setVisitors(existing.visitors || '')
        setDelaysIssues(existing.delays_issues || '')
        setActionsRequired(existing.actions || existing.actions_required || '')
        setCompanyReportingFor(existing.company_reporting_for || '')
        setCreatorName(hydrateAuthorName(existing))
        setCreatorRole(hydrateAuthorRole(existing))
        if (!progressiveCompose && !progressiveEdit) {
          const logoPath = existing.brand_logo_url || null
          if (logoPath) {
            const preview = await signedUrlForPath(supabase, logoPath)
            if (!cancelled) setSetupLogoPreview(preview)
          } else {
            setSetupLogoPreview(null)
          }
        } else {
          setSetupLogoPreview(null)
        }
        setEquipmentHireRows(equipmentHireFromDb(existing.equipment_hire))
        setHsIncidents(hsIncidentsFromDb(existing.hs_incidents))
        setRfis(rfisFromDb(existing.rfis))
        setVariations(variationsFromDb(existing.variations))
        setTemporaryWorksApplicable(
          temporaryWorksApplicableFromDb(
            existing.temporary_works_applicable,
            existing.temporary_works,
          ),
        )
        setTemporaryWorks(temporaryWorksFromDb(existing.temporary_works))
        if (existing.branding_id || existing.brand_color || existing.brand_logo_url) {
          setBrandingSelection({
            brandingId: existing.branding_id || null,
            brandColor: existing.brand_color || '#FF5000',
            brandLogoUrl: existing.brand_logo_url || null,
            companyName: '',
          })
        } else {
          // Do not invent a wipe payload — null means omit branding keys on save.
          setBrandingSelection(null)
        }
        if (progressiveCompose) {
          applySignaturePathOnly(existing.signature_url)
        } else {
          await applySignature(existing.signature_url)
          if (cancelled) return
        }

        if (labour?.length) {
          setLabourRows(labour.map((row) => ({
            key: makeUuid(),
            trade: row.trade || '',
            company: row.company || '',
            headcount: row.count != null ? String(row.count) : '',
            hours: row.hours != null ? String(row.hours) : '',
            notes: row.notes || '',
          })))
        } else {
          setLabourRows([emptyLabour()])
        }
        // Always replace plant rows from this report only (never merge prior diary state).
        setPlantRows(hydratePlantFormRows(plant, makeUuid))
        if (progressiveCompose || progressiveEdit) {
          if (reportPhotos?.length) {
            const withoutPreview = reportPhotos.map(mapPhotoRowWithoutPreview)
            setPhotos(withoutPreview)
            setLocationWalk(groupPhotosByArea(withoutPreview))
          } else {
            setLocationWalk([])
          }
        } else if (reportPhotos?.length) {
          const withPreview = await signReportPhotoRows(reportPhotos)
          if (cancelled) return
          setPhotos(withPreview)
          setLocationWalk(groupPhotosByArea(withPreview))
        } else {
          setLocationWalk([])
        }

        try {
          ackedSnapshotRef.current = snapshotFromLiveRow(existing)
        } catch (snapErr) {
          console.log(DIARY_SAVE_LOG, 'load:snapshot-failed', snapErr)
          ackedSnapshotRef.current = null
        }
        lastPersistedReportRef.current = existing
        lastPersistedLabourRef.current = labourFormToPersistRows(labour || [], existing.id)
        lastPersistedPlantRef.current = plantFormToPersistRows(plant || [], existing.id)
        lastPersistedPhotosRef.current = photoRowsToBaseline(reportPhotos || [])
        suppressAutosaveRef.current = true

        const kickPdfAssetPrewarm = () => {
          if (cancelled) return
          const gen = ++pdfPrewarmGenRef.current
          void prewarmDiaryPdfSessionAssets({
            photos: reportPhotos || [],
            coverPath: editHydration.coverStoragePath || existing.cover_photo_url || null,
            coverProcessingVersion: existing.cover_processing_version || null,
            generation: gen,
            isCurrent: () => !cancelled && pdfPrewarmGenRef.current === gen,
            batchSignStoragePaths: (paths) => batchSignedUrlsForStoragePaths(supabase, paths),
          }).catch(() => {})
        }

        // SDSC Phase 1 shadow — merge only fields workbench already has (no new fetches).
        {
          const shadowUserId = authUserIdRef.current
          if (shadowUserId && editingReportId && projectId) {
            const dates = hydrateProjectDatesFromRow(proj)
            const sticky = hydrateStickyFromRow(proj)
            runSiteDiaryShadowWorkbenchMerge({
              userId: shadowUserId,
              projectId,
              reportId: editingReportId,
              projectName: proj?.name || '',
              projectStartDate: dates.projectStartDate,
              projectPlannedCompletionDate: dates.projectPlannedCompletionDate,
              projectAddress: sticky.projectAddress,
              projectManager: sticky.projectManager,
              workingDaysPerWeek: sticky.workingDaysPerWeek,
              projectReference: editHydration.projectReference,
              reportDate: reportDateInputValue(existing.report_date) || todayIsoDate(),
              shift: existing.shift || existing.shift_type || 'Day',
              author: hydrateAuthorName(existing),
              authorRole: hydrateAuthorRole(existing),
              reportingOnBehalfOf: existing.company_reporting_for || '',
              brandingId: existing.branding_id || null,
              brandColor: existing.brand_color || null,
              logoStoragePath: existing.brand_logo_url || null,
              coverStoragePath: editHydration.coverStoragePath || null,
            })
          }
        }

        if (progressiveCompose) {
          // First usable paint — secondary media/selector work continues below.
          if (commit()) {
            setLoadDiagnostic('')
            setLoading(false)
          }

          // F2B: resume canonical cover upload after first paint (non-blocking).
          if (pendingCoverGeneration && !cancelled) {
            void (async () => {
              const gen = pendingCoverGeneration
              try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user?.id || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                const synced = await syncPendingCoverUpload(supabase, {
                  userId: user.id,
                  reportId: editingReportId,
                  generation: gen,
                  updateCoverRecord: async ({ storagePath, coverProcessingVersion }) => {
                    await updateDiarySetupFields(supabase, {
                      reportId: editingReportId,
                      projectId,
                      fields: coverSetupFieldsFromSync({
                        storagePath,
                        coverProcessingVersion,
                      }),
                    })
                  },
                })
                if (!synced.ok || !synced.storagePath) return
                if (cancelled || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                loadedCoverPathRef.current = synced.storagePath
                const keepPreview = coverPhotoRef.current?.preview || null
                const nextCover = coverPhotoStateAfterUpload(synced.storagePath, keepPreview)
                coverPhotoRef.current = nextCover
                if (commit()) setCoverPhoto(nextCover)
              } catch {
                /* background resume — diary remains usable */
              }
            })()
          }

          if (allProjectsPromise) {
            const { data: allProjects } = await allProjectsPromise
            if (!cancelled && commit()) setProjects(allProjects || [])
          }

          if (editHydration.coverStoragePath && !pendingCoverGeneration) {
            const preview = await resolveCoverPhotoPreviewUrl(
              supabase,
              editHydration.coverStoragePath,
            )
            if (!cancelled && commit()) {
              setCoverPhoto(coverPhotoStateFromSaved(editHydration.coverStoragePath, preview))
            }
          }

          {
            const logoPath = existing.brand_logo_url || null
            if (logoPath) {
              const preview = await signedUrlForPath(supabase, logoPath)
              if (!cancelled && commit()) setSetupLogoPreview(preview)
            }
          }

          await applySignature(existing.signature_url)
          if (cancelled) return

          if (reportPhotos?.length) {
            const withPreview = await signReportPhotoRows(reportPhotos)
            if (!cancelled && commit()) {
              setPhotos(withPreview)
              setLocationWalk(groupPhotosByArea(withPreview))
            }
          }
          kickPdfAssetPrewarm()

          let logs = null
          if (recentDiariesPromise) {
            const primary = await recentDiariesPromise
            logs = primary.data
            if (primary.error && /is_draft/i.test(primary.error.message || '')) {
              const fallback = await supabase
                .from('daily_reports')
                .select('id, report_date')
                .eq('project_id', projectId)
                .order('report_date', { ascending: false })
                .limit(5)
              logs = fallback.data
            }
          }
          if (!cancelled && commit()) setRecentDiaries(logs || [])

          if (commit()) {
            setLoadDiagnostic('')
            setHydrateComplete(true)
          }
        } else if (progressiveEdit) {
          // First usable paint — unused selector/recent and non-critical signed
          // cover/logo/photo previews continue below. Signature preview is already applied.
          if (commit()) {
            setLoadDiagnostic('')
            setLoading(false)
          }

          // F2B: resume canonical cover upload after first paint (non-blocking).
          if (pendingCoverGeneration && !cancelled) {
            void (async () => {
              const gen = pendingCoverGeneration
              try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user?.id || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                const synced = await syncPendingCoverUpload(supabase, {
                  userId: user.id,
                  reportId: editingReportId,
                  generation: gen,
                  updateCoverRecord: async ({ storagePath, coverProcessingVersion }) => {
                    await updateDiarySetupFields(supabase, {
                      reportId: editingReportId,
                      projectId,
                      fields: coverSetupFieldsFromSync({
                        storagePath,
                        coverProcessingVersion,
                      }),
                    })
                  },
                })
                if (!synced.ok || !synced.storagePath) return
                if (cancelled || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                loadedCoverPathRef.current = synced.storagePath
                const keepPreview = coverPhotoRef.current?.preview || null
                const nextCover = coverPhotoStateAfterUpload(synced.storagePath, keepPreview)
                coverPhotoRef.current = nextCover
                if (commit()) setCoverPhoto(nextCover)
              } catch {
                /* background resume — diary remains usable */
              }
            })()
          }

          if (editHydration.coverStoragePath && !pendingCoverGeneration) {
            const preview = await resolveCoverPhotoPreviewUrl(
              supabase,
              editHydration.coverStoragePath,
            )
            if (!cancelled && commit()) {
              setCoverPhoto(coverPhotoStateFromSaved(editHydration.coverStoragePath, preview))
            }
          }

          {
            const logoPath = existing.brand_logo_url || null
            if (logoPath) {
              const preview = await signedUrlForPath(supabase, logoPath)
              if (!cancelled && commit()) setSetupLogoPreview(preview)
            }
          }

          if (reportPhotos?.length) {
            const withPreview = await signReportPhotoRows(reportPhotos)
            if (!cancelled && commit()) {
              setPhotos(withPreview)
              setLocationWalk(groupPhotosByArea(withPreview))
            }
          }
          kickPdfAssetPrewarm()

          if (commit()) {
            setLoadDiagnostic('')
            setHydrateComplete(true)
          }
        } else {
          let logsQuery = supabase
            .from('daily_reports')
            .select('id, report_date')
            .eq('project_id', projectId)
            .order('report_date', { ascending: false })
            .limit(5)
          let { data: logs, error: logsError } = await logsQuery.eq('is_draft', false)
          if (logsError && /is_draft/i.test(logsError.message || '')) {
            const fallback = await supabase
              .from('daily_reports')
              .select('id, report_date')
              .eq('project_id', projectId)
              .order('report_date', { ascending: false })
              .limit(5)
            logs = fallback.data
          }
          if (!cancelled) setRecentDiaries(logs || [])
          if (commit()) {
            setLoadDiagnostic('')
            setHydrateComplete(true)
          }
          kickPdfAssetPrewarm()

          if (pendingCoverGeneration && !cancelled) {
            void (async () => {
              const gen = pendingCoverGeneration
              try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user?.id || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                const synced = await syncPendingCoverUpload(supabase, {
                  userId: user.id,
                  reportId: editingReportId,
                  generation: gen,
                  updateCoverRecord: async ({ storagePath, coverProcessingVersion }) => {
                    await updateDiarySetupFields(supabase, {
                      reportId: editingReportId,
                      projectId,
                      fields: coverSetupFieldsFromSync({
                        storagePath,
                        coverProcessingVersion,
                      }),
                    })
                  },
                })
                if (!synced.ok || !synced.storagePath) return
                if (cancelled || coverRemovedRef.current) return
                if (coverPendingGenerationRef.current !== gen) return
                loadedCoverPathRef.current = synced.storagePath
                const keepPreview = coverPhotoRef.current?.preview || null
                const nextCover = coverPhotoStateAfterUpload(synced.storagePath, keepPreview)
                coverPhotoRef.current = nextCover
                if (commit()) setCoverPhoto(nextCover)
              } catch {
                /* background resume — diary remains usable */
              }
            })()
          }
        }
      } catch (err) {
        failLoad('exception', err)
      } finally {
        clearTimeout(watchdog)
        if (commit()) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, editingReportId, formReloadToken, composeQuery, editQuery, supabase])

  const autosavePayload = useMemo(() => buildDiaryAutosavePayload({
    weather,
    siteSummary,
    visitors,
    delaysIssues,
    actions: actionsRequired,
    equipmentHireRows,
    hsIncidents,
    rfis,
    variations,
    temporaryWorksApplicable,
    temporaryWorks,
    coverPhotoUrl: coverPhotoUrlForAutosave({
      coverPhoto,
      loadedCoverPath: loadedCoverPathRef.current,
      coverRemoved: coverRemovedRef.current,
    }),
  }), [
    weather,
    siteSummary,
    visitors,
    delaysIssues,
    actionsRequired,
    equipmentHireRows,
    hsIncidents,
    rfis,
    variations,
    temporaryWorksApplicable,
    temporaryWorks,
    coverPhoto,
  ])
  latestPayloadRef.current = autosavePayload

  const applyAutosaveSnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    setWeather(snapshot.weather || '')
    setSiteSummary(snapshot.site_summary || '')
    setVisitors(snapshot.visitors || '')
    setDelaysIssues(snapshot.delays_issues || '')
    setActionsRequired(snapshot.actions || '')
    setEquipmentHireRows(equipmentHireFromDb(snapshot.equipment_hire))
    setHsIncidents(hsIncidentsFromDb(snapshot.hs_incidents))
    setRfis(rfisFromDb(snapshot.rfis))
    setVariations(variationsFromDb(snapshot.variations))
    // Restore durable cover path from the live row so a stale recovery cannot
    // leave the form empty and later autosave-null the saved cover.
    if (Object.prototype.hasOwnProperty.call(snapshot, 'cover_photo_url') && !coverRemovedRef.current) {
      const path = snapshot.cover_photo_url
      if (path) {
        loadedCoverPathRef.current = String(path)
        setCoverPhoto((prev) => coverPhotoStateFromSaved(path, prev?.preview || null))
      }
    }
    // Temporary Works are not on live daily_reports yet — never wipe in-form values.
  }, [])

  const performAutosave = useCallback(async () => {
    if (!editingReportId || !projectId || !isDiaryEditMode) return { ok: false, reason: 'missing-report' }
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true
      return autosaveInFlightRef.current
    }

    const run = async () => {
      let payload = latestPayloadRef.current
      if (!payload || autosavePayloadsEqual(payload, ackedSnapshotRef.current)) {
        return { ok: true, reason: 'already-saved', wrote: false }
      }

      // Never autosave-null a cover that is still on the form / loaded path.
      if (
        (payload.cover_photo_url == null || payload.cover_photo_url === '')
        && !coverRemovedRef.current
      ) {
        const keepPath =
          coverPhotoRef.current?.storagePath || loadedCoverPathRef.current || null
        if (keepPath) {
          payload = { ...payload, cover_photo_url: String(keepPath) }
          latestPayloadRef.current = payload
        }
      }

      const paintAutosaveStatus = (kind) => {
        if (persistUiErrorRef.current) return
        if (finalSaveInProgressRef.current) return
        setAutosaveStatus(kind)
      }

      paintAutosaveStatus('saving')

      // Cover photo: upload local File to canonical site-photos path before PATCH.
      const liveCover = coverPhotoRef.current
      if (
        (liveCover?.file && !liveCover?.storagePath)
        || isCoverAutosavePendingToken(payload.cover_photo_url)
      ) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          if (authError || !user) {
            paintAutosaveStatus('auth')
            return {
              ok: false,
              reason: 'update-failed',
              acked: ackedSnapshotRef.current,
              wrote: false,
              error: { message: authError?.message || 'not authenticated', code: '401' },
            }
          }
          if (!liveCover?.file) {
            paintAutosaveStatus('db')
            return {
              ok: false,
              reason: 'update-failed',
              acked: ackedSnapshotRef.current,
              wrote: false,
              error: { message: 'cover-file-missing', code: null },
            }
          }
          let coverGen = coverPendingGenerationRef.current
          if (!coverGen) {
            coverGen = newCoverPendingGeneration()
            coverPendingGenerationRef.current = coverGen
          }
          const { storagePath, error: coverUploadError, preparedBlob, coverProcessingVersion } = await persistCanonicalCoverUpload(supabase, {
            userId: user.id,
            reportId: editingReportId,
            generation: coverGen,
            file: liveCover.file,
          })
          if (coverUploadError || !storagePath) {
            paintAutosaveStatus('db')
            return {
              ok: false,
              reason: 'update-failed',
              acked: ackedSnapshotRef.current,
              wrote: false,
              error: {
                message: coverUploadError?.message || 'cover-upload-failed',
                code: coverUploadError?.code || null,
              },
            }
          }
          await updateDiarySetupFields(supabase, {
            reportId: editingReportId,
            projectId,
            fields: coverSetupFieldsFromSync({
              storagePath,
              coverProcessingVersion,
            }),
          })
          loadedCoverPathRef.current = storagePath
          coverRemovedRef.current = false
          // Drop local File so Share will not re-upload this object.
          // Keep the prepared JPEG blob for same-session PDF pass-through.
          const nextCover = coverPhotoStateAfterUpload(storagePath, liveCover.preview, { preparedBlob })
          coverPhotoRef.current = nextCover
          setCoverPhoto(nextCover)
          // Successful cover persistence must clear a stale red upload banner.
          if (persistUiErrorRef.current === COVER_UPLOAD_FAIL_MESSAGE) {
            persistUiErrorRef.current = ''
            setError('')
          }
          payload = {
            ...payload,
            cover_photo_url: storagePath,
          }
          latestPayloadRef.current = payload
        } catch (err) {
          paintAutosaveStatus('network')
          return {
            ok: false,
            reason: 'update-failed',
            acked: ackedSnapshotRef.current,
            wrote: false,
            error: { message: err?.message || String(err), code: err?.code || null },
          }
        }
      }

      if (isCoverAutosavePendingToken(payload.cover_photo_url)) {
        paintAutosaveStatus('db')
        return {
          ok: false,
          reason: 'update-failed',
          acked: ackedSnapshotRef.current,
          wrote: false,
          error: { message: 'cover-still-pending', code: null },
        }
      }

      let result
      try {
        result = await runDiaryAutosave(supabase, {
          reportId: editingReportId,
          projectId,
          payload,
          ackedSnapshot: ackedSnapshotRef.current,
        })
      } catch (err) {
        result = {
          ok: false,
          reason: 'update-failed',
          acked: ackedSnapshotRef.current,
          wrote: false,
          error: { message: err?.message || String(err), code: err?.code || null },
        }
      }

      if (result.ok) {
        ackedSnapshotRef.current = result.acked
        lastPersistedReportRef.current = mergeAutosaveAckIntoReportRow(
          lastPersistedReportRef.current,
          result.acked,
        )
        paintAutosaveStatus(autosaveStatusAfterResult(result))
        return result
      }

      if (result.reason === 'stale' && result.acked) {
        suppressAutosaveRef.current = true
        ackedSnapshotRef.current = result.acked
        lastPersistedReportRef.current = mergeAutosaveAckIntoReportRow(
          lastPersistedReportRef.current,
          result.acked,
        )
        applyAutosaveSnapshot(result.acked)
        const failure = classifyAutosaveFailure({
          reason: result.reason,
          error: result.error,
          sessionExpired,
        })
        if (process.env.NODE_ENV !== 'production') {
          console.log('[zlog:diary-autosave]', failure.diagnostic, result.error || null)
        }
        paintAutosaveStatus(failure.kind)
        return result
      }

      const failure = classifyAutosaveFailure({
        reason: result.reason,
        error: result.error,
        sessionExpired,
      })
      if (process.env.NODE_ENV !== 'production') {
        console.log('[zlog:diary-autosave]', failure.diagnostic, result.error || null)
      }
      paintAutosaveStatus(failure.kind)
      return result
    }

    const pending = run().finally(() => {
      if (autosaveInFlightRef.current === pending) autosaveInFlightRef.current = null
    }).then(async (result) => {
      if (autosaveQueuedRef.current) {
        autosaveQueuedRef.current = false
        return performAutosave()
      }
      return result
    })
    autosaveInFlightRef.current = pending
    return pending
  }, [applyAutosaveSnapshot, editingReportId, isDiaryEditMode, projectId, sessionExpired, supabase])

  const flushPendingAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (!hydrateComplete || !editingReportId || !isDiaryEditMode || sessionExpired) return
    const payload = latestPayloadRef.current
    if (!payload || autosavePayloadsEqual(payload, ackedSnapshotRef.current)) return
    await performAutosave()
  }, [editingReportId, hydrateComplete, isDiaryEditMode, performAutosave, sessionExpired])

  useEffect(() => {
    if (
      !hydrateComplete ||
      !isDiaryEditMode ||
      !editingReportId ||
      sessionExpired ||
      saving ||
      justSaved ||
      error
    ) {
      return undefined
    }
    const hydrateGate = resolveHydrateAutosaveSuppress(
      suppressAutosaveRef.current,
      autosavePayload,
      ackedSnapshotRef.current,
    )
    suppressAutosaveRef.current = hydrateGate.suppress
    if (hydrateGate.block) {
      return undefined
    }
    if (!shouldRunDiaryAutosave({
      hydrateComplete,
      writable: isDiaryEditMode,
      reportId: editingReportId,
      sessionExpired,
      finalSaveInProgress: saving || justSaved || finalSaveInProgressRef.current,
      payload: autosavePayload,
      ackedSnapshot: ackedSnapshotRef.current,
    })) {
      return undefined
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null
      void performAutosave()
    }, DIARY_AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [
    autosavePayload,
    editingReportId,
    hydrateComplete,
    isDiaryEditMode,
    performAutosave,
    saving,
    justSaved,
    error,
    sessionExpired,
  ])

  useEffect(() => {
    const flush = () => {
      void flushPendingAutosave()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onOnline = () => {
      if (!autosavePayloadsEqual(latestPayloadRef.current, ackedSnapshotRef.current)) {
        void performAutosave()
      }
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [flushPendingAutosave, performAutosave])

  const handleLocationWalkChange = useCallback((next) => {
    invalidatePreparedSharePdf()
    setLocationWalk(next)
    setPhotos(flattenAreaGroups(next))
  }, [invalidatePreparedSharePdf])

  const handleAreaNameValidationResolved = useCallback(() => {
    const refMsg = persistUiErrorRef.current
    if (isMissingWorkAreaNamePageError(refMsg)) {
      persistUiErrorRef.current = ''
    }
    setError((prev) => (isMissingWorkAreaNamePageError(prev) ? '' : prev))
  }, [])

  /** Phase D: sign canonical report path only when the full viewer needs it. */
  const ensureReportPreviewForViewer = useCallback(async (photo) => {
    const session = photoDisplaySignRef.current
    if (!photo) return null
    const existing = String(photo.preview || '').trim()
    if (/^https?:\/\//i.test(existing) || existing.startsWith('blob:') || existing.startsWith('data:')) {
      return existing
    }
    // Local capture File still has blob preview via imageUrl/preview during compose.
    if (/^https?:\/\//i.test(String(photo.imageUrl || '')) || String(photo.imageUrl || '').startsWith('blob:')) {
      return photo.imageUrl
    }
    if (!session) {
      // Session may not exist yet on a brand-new blank diary; fall back to single sign.
      const path = String(photo.imageUrl || photo.storagePath || '').trim()
      if (!path || /^https?:\/\//i.test(path) || path.startsWith('blob:')) return null
      return signedUrlForPath(supabase, path)
    }
    const path = String(photo.imageUrl || photo.storagePath || '').trim()
    if (!path) return null
    const url = await session.resolveOne(path)
    if (!url) return null
    const photoId = photo.id
    if (photoId) {
      setLocationWalk((prev) => {
        const next = (prev || []).map((group) => ({
          ...group,
          photos: (group.photos || []).map((p) => (
            p.id === photoId ? { ...p, preview: url } : p
          )),
        }))
        setPhotos(flattenAreaGroups(next))
        return next
      })
    }
    return url
  }, [supabase])

  const continueToSignature = useCallback(() => {
    const el = signatureSectionRef.current
    if (!el) return
    // After Location Walk closes its stage UI, scroll + focus Signature so progression is obvious.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(() => {
        try {
          el.focus({ preventScroll: true })
        } catch {
          /* focus not supported */
        }
      }, 280)
    })
  }, [])

  const onCoverDrop = useCallback((accepted) => {
    const file = accepted[0]
    if (!file) return
    coverRemovedRef.current = false
    invalidatePreparedSharePdf()
    // New local cover replaces any previous failed upload banner.
    if (persistUiErrorRef.current === COVER_UPLOAD_FAIL_MESSAGE) {
      persistUiErrorRef.current = ''
      setError('')
    }
    setCoverPhoto((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return {
        file,
        preview: URL.createObjectURL(file),
        storagePath: null,
      }
    })
    // F2B: durable pending replace — new generation invalidates in-flight uploads.
    if (editingReportId) {
      void putPendingCover(editingReportId, {
        blob: file,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name || 'cover.jpg',
      }).then((handoff) => {
        if (handoff?.ok && handoff.generation) {
          coverPendingGenerationRef.current = handoff.generation
          void (async () => {
            const gen = handoff.generation
            try {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user?.id || coverRemovedRef.current) return
              const synced = await syncPendingCoverUpload(supabase, {
                userId: user.id,
                reportId: editingReportId,
                generation: gen,
                updateCoverRecord: async ({ storagePath, coverProcessingVersion }) => {
                  await updateDiarySetupFields(supabase, {
                    reportId: editingReportId,
                    projectId,
                    fields: coverSetupFieldsFromSync({
                      storagePath,
                      coverProcessingVersion,
                    }),
                  })
                },
              })
              if (!synced.ok || !synced.storagePath) return
              if (coverRemovedRef.current) return
              if (coverPendingGenerationRef.current !== gen) return
              loadedCoverPathRef.current = synced.storagePath
              const keepPreview = coverPhotoRef.current?.preview || null
              const nextCover = coverPhotoStateAfterUpload(synced.storagePath, keepPreview)
              coverPhotoRef.current = nextCover
              setCoverPhoto(nextCover)
            } catch {
              /* background upload — local preview remains */
            }
          })()
        }
      })
    }
  }, [editingReportId, invalidatePreparedSharePdf, projectId, supabase])

  const canvasRef = useRef(null)
  const signaturePadRef = useRef(null)
  const endStrokeHandlerRef = useRef(null)
  const touchBlockerRef = useRef(null)
  const originalReleasePointerCaptureRef = useRef(null)
  const globalReleasePointerCaptureRef = useRef(null)

  const teardownSignaturePad = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas && touchBlockerRef.current) {
      canvas.removeEventListener('touchmove', touchBlockerRef.current)
      touchBlockerRef.current = null
    }
    if (canvas && originalReleasePointerCaptureRef.current) {
      try {
        delete canvas.releasePointerCapture
      } catch {
        canvas.releasePointerCapture = originalReleasePointerCaptureRef.current
      }
      originalReleasePointerCaptureRef.current = null
    }
    if (globalReleasePointerCaptureRef.current) {
      Element.prototype.releasePointerCapture = globalReleasePointerCaptureRef.current
      globalReleasePointerCaptureRef.current = null
    }
    const pad = signaturePadRef.current
    if (!pad) return
    if (endStrokeHandlerRef.current) {
      pad.removeEventListener('endStroke', endStrokeHandlerRef.current)
      endStrokeHandlerRef.current = null
    }
    pad.off()
    signaturePadRef.current = null
  }, [])

  const attachSignatureCanvas = useCallback((canvas) => {
    if (canvasRef.current === canvas) return
    teardownSignaturePad()
    canvasRef.current = canvas
    if (!canvas) return

    canvas.style.touchAction = 'none'
    canvas.style.userSelect = 'none'
    canvas.style.webkitUserSelect = 'none'

    // Guard releasePointerCapture on this canvas and (while mounted) on Element
    // so a NotFoundError mid-pointerup cannot abort SignaturePad's cleanup and
    // leave window-level preventDefault listeners that block the back button.
    const protoRelease =
      Object.getOwnPropertyDescriptor(Element.prototype, 'releasePointerCapture')?.value ||
      Element.prototype.releasePointerCapture
    originalReleasePointerCaptureRef.current = protoRelease

    const safeReleasePointerCapture = function releasePointerCaptureSafe(pointerId) {
      try {
        if (
          typeof this.hasPointerCapture === 'function' &&
          !this.hasPointerCapture(pointerId)
        ) {
          return
        }
        return protoRelease.call(this, pointerId)
      } catch {
        // Ignore NotFoundError when no active pointer remains
      }
    }
    canvas.releasePointerCapture = safeReleasePointerCapture
    if (!globalReleasePointerCaptureRef.current) {
      globalReleasePointerCaptureRef.current = protoRelease
      Element.prototype.releasePointerCapture = safeReleasePointerCapture
    }

    // Only block scroll on move. preventDefault on touchstart/touchend can
    // cancel the pointer before capture is released and trigger the error above.
    const blockTouchScroll = (e) => {
      try {
        if (e.cancelable) e.preventDefault()
      } catch {
        // Ignore — never let touch handlers throw into the console
      }
    }
    touchBlockerRef.current = blockTouchScroll
    canvas.addEventListener('touchmove', blockTouchScroll, { passive: false })

    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    canvas.getContext('2d').scale(ratio, ratio)

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
    })
    signaturePadRef.current = pad

    // SignaturePad.on() may reset touch-action — keep scroll locked while drawing
    canvas.style.touchAction = 'none'

    const rebindPadIfNeeded = () => {
      // After the current event finishes, ensure no dangling window listeners
      queueMicrotask(() => {
        try {
          pad.off()
          pad.on()
          canvas.style.touchAction = 'none'
          canvas.style.userSelect = 'none'
          canvas.style.webkitUserSelect = 'none'
        } catch {
          // ignore
        }
      })
    }

    const onEndStroke = () => {
      invalidatePreparedSharePdf()
      if (pad.isEmpty()) {
        setSignature(null)
        rebindPadIfNeeded()
        return
      }
      canvas.toBlob((blob) => {
        if (!blob) return
        const file = new File([blob], 'signature.png', { type: 'image/png' })
        setSignature((prev) => {
          if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
          return {
            file,
            preview: URL.createObjectURL(file),
            storagePath: null,
          }
        })
      }, 'image/png')
      rebindPadIfNeeded()
    }

    endStrokeHandlerRef.current = onEndStroke
    pad.addEventListener('endStroke', onEndStroke)
  }, [invalidatePreparedSharePdf, teardownSignaturePad])

  useEffect(() => () => {
    teardownSignaturePad()
  }, [teardownSignaturePad])

  const clearSignaturePad = () => {
    invalidatePreparedSharePdf()
    signaturePadRef.current?.clear()
    setSignature((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return null
    })
  }

  const useExistingSignature = () => {
    setSignatureMode('accepted')
  }

  const resignSignature = () => {
    invalidatePreparedSharePdf()
    setSignature((prev) => {
      if (prev?.file && prev.preview) URL.revokeObjectURL(prev.preview)
      return null
    })
    setSignatureMode('draw')
  }

  const photosRef = useRef(photos)
  photosRef.current = photos
  const signatureRef = useRef(signature)
  signatureRef.current = signature
  const scanSheetPreviewRef = useRef(scanSheetPreview)
  scanSheetPreviewRef.current = scanSheetPreview
  useEffect(() => () => {
    photosRef.current.forEach((p) => {
      if (p.preview) URL.revokeObjectURL(p.preview)
    })
    if (coverPhotoRef.current?.file && coverPhotoRef.current.preview) {
      URL.revokeObjectURL(coverPhotoRef.current.preview)
    }
    if (signatureRef.current?.file && signatureRef.current.preview) {
      URL.revokeObjectURL(signatureRef.current.preview)
    }
    if (scanSheetPreviewRef.current && String(scanSheetPreviewRef.current).startsWith('blob:')) {
      URL.revokeObjectURL(scanSheetPreviewRef.current)
    }
  }, [])

  const projectProgrammeCard = useMemo(
    () => programmeDatesForProjectDetails(project, reportDate || null),
    [project, reportDate],
  )

  const labourTotals = useMemo(() => labourAggregateTotals(labourRows), [labourRows])

  backgroundPrepareLiveRef.current = {
    hydrateComplete,
    writable: isDiaryEditMode,
    reportId: editingReportId,
    sessionExpired,
    saving,
    projectId,
    locationWalk,
    labourRows,
    temporaryWorks,
    temporaryWorksApplicable,
  }

  const runBackgroundPdfPrepare = useCallback(async () => {
    const live = backgroundPrepareLiveRef.current
    const startedGeneration = pdfPrepareGenerationRef.current
    const startedReportId = live.reportId
    const shareInProgress = Boolean(
      live.saving
      || saveLockRef.current
      || completingRef.current
      || finalSaveInProgressRef.current,
    )
    if (!shouldRunBackgroundPdfPrepare({
      hydrateComplete: live.hydrateComplete,
      writable: live.writable,
      reportId: live.reportId,
      sessionExpired: live.sessionExpired,
      shareInProgress,
      hasUnsavedArea: locationWalkRef.current?.hasUnsavedAreaForShare?.() === true,
      alreadyHasCurrentFile: Boolean(shareReadyPdfRef.current?.file),
    })) {
      return
    }

    try {
      await flushPendingAutosave()
    } catch {
      return
    }

    if (pdfPrepareGenerationRef.current !== startedGeneration) return
    if (String(backgroundPrepareLiveRef.current.reportId || '') !== String(startedReportId || '')) return
    if (locationWalkRef.current?.hasUnsavedAreaForShare?.() === true) return
    if (
      backgroundPrepareLiveRef.current.saving
      || saveLockRef.current
      || completingRef.current
      || finalSaveInProgressRef.current
    ) {
      return
    }

    const labourPayload = labourFormToPersistRows(live.labourRows, live.reportId)
    if (!labourPersistRowsEqual(labourPayload, lastPersistedLabourRef.current)) return
    if (signatureRef.current?.file) return

    const persistedRow = lastPersistedReportRef.current
    const persistedTwPayload = temporaryWorksPayload(
      temporaryWorksFromDb(persistedRow?.temporary_works),
    )
    const liveTwPayload = live.temporaryWorksApplicable === true
      ? temporaryWorksPayload(live.temporaryWorks)
      : []
    const twIdentity = (rows) => JSON.stringify(
      (rows || []).map((row) => [
        row.type,
        row.item,
        row.location,
        row.status,
        row.reference,
        row.checkResult,
        row.notes,
        row.scaffoldCheck,
        row.scaffoldTag,
      ]),
    )
    if (twIdentity(liveTwPayload) !== twIdentity(persistedTwPayload)) return

    const walk = live.locationWalk || []
    const userId = authUserIdRef.current
    const flattened = flattenAreaGroups(walk)
    if (
      userId
      && live.reportId
      && flattened.some((photo) => photoRowNeedsPreparedUpload(photo, userId, live.reportId))
    ) {
      return
    }

    const livePhotos = durablePhotosToBaseline(flattened)
    const photoIdentity = (baseline) => JSON.stringify(
      (baseline || []).map((row) => ({
        url: String(row?.url || '').trim(),
        caption: String(row?.caption || '').trim() || null,
        location: String(row?.location || '').trim() || null,
        layout: row?.layout || 'grid4',
        rotation: Number(row?.rotation_degrees) || 0,
      })),
    )
    if (photoIdentity(livePhotos) !== photoIdentity(lastPersistedPhotosRef.current)) {
      if (!userId || !live.reportId) return
      for (const group of walk) {
        if (!group?.id) continue
        const result = await persistSaveAreaGroup(supabase, {
          userId,
          reportId: live.reportId,
          savedGroup: group,
          locationWalk: walk,
        })
        if (!result.ok) return
        if (pdfPrepareGenerationRef.current !== startedGeneration) return
      }
      lastPersistedPhotosRef.current = livePhotos
    }

    if (pdfPrepareGenerationRef.current !== startedGeneration) return
    if (String(backgroundPrepareLiveRef.current.reportId || '') !== String(startedReportId || '')) return
    if (
      backgroundPrepareLiveRef.current.saving
      || saveLockRef.current
      || completingRef.current
      || finalSaveInProgressRef.current
    ) {
      return
    }

    const localPreparedPhotoSources = collectLocalPreparedPdfPhotoSources({
      photos: flattened,
      userId,
      reportId: live.reportId,
    })
    const coverBlob = coverPhotoRef.current?.preparedBlob
    const localPreparedCoverBlob =
      coverBlob instanceof Blob && coverBlob.size > 0 ? coverBlob : null

    let prepared
    try {
      prepared = await prepareSiteDiaryPdf({
        projectId: live.projectId,
        reportId: live.reportId,
        localPreparedPhotoSources,
        localPreparedCoverBlob,
        skipShareCacheWrite: true,
      })
    } catch {
      return
    }

    if (!shouldAdoptBackgroundPreparedPdf({
      prepared,
      startedGeneration,
      currentGeneration: pdfPrepareGenerationRef.current,
      startedReportId,
      currentReportId: backgroundPrepareLiveRef.current.reportId,
      shareInProgress: Boolean(
        backgroundPrepareLiveRef.current.saving
        || saveLockRef.current
        || completingRef.current
        || finalSaveInProgressRef.current,
      ),
    })) {
      return
    }

    const pdfFile = prepared.file instanceof File
      ? prepared.file
      : new File(
        [prepared.blob],
        prepared.fileName || 'Zlog-Site-Diary.pdf',
        { type: 'application/pdf' },
      )
    shareReadyPdfRef.current = {
      ...prepared,
      file: pdfFile,
    }
    setShareReady(true)
  }, [flushPendingAutosave, supabase])

  pdfBackgroundPrepareRunRef.current = runBackgroundPdfPrepare

  useEffect(() => {
    const scheduler = createDiaryPdfBackgroundPrepareScheduler({
      idleMs: DIARY_PDF_BACKGROUND_PREPARE_IDLE_MS,
      run: () => pdfBackgroundPrepareRunRef.current?.(),
    })
    pdfBackgroundPrepareSchedulerRef.current = scheduler
    return () => {
      scheduler.cancel()
      pdfBackgroundPrepareSchedulerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!hydrateComplete || !isDiaryEditMode || !editingReportId || sessionExpired) return undefined
    pdfBackgroundPrepareSchedulerRef.current?.schedule()
    return undefined
  }, [hydrateComplete, isDiaryEditMode, editingReportId, sessionExpired])

  const clearScanPreview = useCallback(() => {
    setScanSheetPreview((prev) => {
      if (prev && String(prev).startsWith('blob:')) {
        try { URL.revokeObjectURL(prev) } catch { /* ignore */ }
      }
      return null
    })
  }, [])

  const handleSignInSheetFiles = useCallback(async (files) => {
    const file = files?.[0]
    // Camera cancel / empty picker — do not touch loading or draft state
    if (!file || !(file instanceof Blob)) return
    if (!reportDate) {
      setScanError('Set the report date before scanning a sign-in sheet.')
      return
    }

    setLabourMode('scan')
    setScanLoading(true)
    setScanError('')
    setScanWarnings([])
    setScanOperatives([])
    setScanLastFile(file)
    clearScanPreview()
    let previewUrl = null
    try {
      const dataUrl = await fileToVisionDataUrl(file)
      previewUrl = dataUrl
      setScanSheetPreview(previewUrl)

      const result = await parseSignInSheetImage({
        dataUrl,
        reportDate,
        groupBy: labourGroupBy,
      })

      const operatives = Array.isArray(result.operatives) ? result.operatives : []
      setScanOperatives(operatives)
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
      setScanSheetPreview(null)
      setScanError(err?.message || 'Failed to scan sign-in sheet')
      setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
      setScanOperatives([])
      setScanWarnings([])
    } finally {
      setScanLoading(false)
    }
  }, [reportDate, labourGroupBy, clearScanPreview])

  const applyScanOperativesToLabour = useCallback(() => {
    const nextRows = labourRowsFromOperatives(scanOperatives, {
      groupBy: labourGroupBy,
      makeKey: makeUuid,
    })
    setLabourRows(nextRows.length > 0 ? nextRows : [emptyLabour()])
    invalidatePreparedSharePdf()
    setScanError('')
  }, [invalidatePreparedSharePdf, scanOperatives, labourGroupBy])

  const retrySignInScan = useCallback(() => {
    if (scanLastFile) {
      handleSignInSheetFiles([scanLastFile])
    }
  }, [scanLastFile, handleSignInSheetFiles])

  const startManualLabour = useCallback(() => {
    setLabourMode('manual')
    setScanError('')
    setScanMeta({ matched: 0, ignored: 0, extracted: 0 })
    setScanWarnings([])
    setScanOperatives([])
    setScanLastFile(null)
    clearScanPreview()
    setLabourRows((rows) => (rows.some(labourRowHasData) ? rows : [emptyLabour()]))
  }, [clearScanPreview])

  const updateLabour = (key, field, value) => {
    invalidatePreparedSharePdf()
    setLabourRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const updatePlant = (key, field, value) => {
    setPlantRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const updateEquipmentHire = (key, field, value) => {
    invalidatePreparedSharePdf()
    setEquipmentHireRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const removeCoverPhoto = () => {
    invalidatePreparedSharePdf()
    if (coverPhoto?.file && coverPhoto.preview) URL.revokeObjectURL(coverPhoto.preview)
    coverRemovedRef.current = true
    loadedCoverPathRef.current = null
    if (persistUiErrorRef.current === COVER_UPLOAD_FAIL_MESSAGE) {
      persistUiErrorRef.current = ''
      setError('')
    }
    setCoverPhoto(null)
    // F2B: tombstone pending so a slow upload cannot restore this cover.
    if (editingReportId) {
      void markPendingCoverRemoved(editingReportId).then((result) => {
        if (result?.generation) coverPendingGenerationRef.current = result.generation
        else coverPendingGenerationRef.current = null
      })
    } else {
      coverPendingGenerationRef.current = null
    }
  }

  const handleContinueDraft = async () => {
    if (!openDraft?.id || startBusy) return
    openReportForm(openDraft.id, { reportDate: openDraft.report_date })
  }

  const handleCreateTodaysDiary = async () => {
    if (startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, projectId)
      openReportForm(id, { mode: 'compose' })
    } catch (err) {
      setStartError(err?.message || 'Could not create today’s diary')
      setStartBusy(false)
    }
  }

  const handleStartBlankDiary = async () => {
    if (startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createBlankDiaryDraft(supabase, projectId)
      openReportForm(id, { mode: 'compose' })
    } catch (err) {
      setStartError(err?.message || 'Could not start blank diary')
      setStartBusy(false)
    }
  }

  const handleUseAsTemplate = async (sourceId) => {
    if (!sourceId || startBusy) return
    setStartBusy(true)
    setStartError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, projectId, sourceId)
      openReportForm(id, { mode: 'compose' })
    } catch (err) {
      setStartError(err?.message || 'Could not create diary from template')
      setStartBusy(false)
    }
  }

  const handleEnterEditMode = () => {
    if (!editingReportId) return
    setJustSaved(false)
    setShowSaveBanner(false)
    const href = isTodaysDiary(reportDate)
      ? projectAndReportDetailsHref(projectId, editingReportId)
      : diaryEditHref(projectId, editingReportId)
    if (href) router.replace(href)
    // Re-load canonical saved Cover Photo + Project Reference (not stale client blanks).
    setFormReloadToken((n) => n + 1)
  }

  const handleCancelEditMode = () => {
    if (!editingReportId) return
    setError('')
    setJustSaved(false)
    setShowSaveBanner(false)
    const href = existingDiaryHref(projectId, editingReportId)
    if (href) router.replace(href)
    setFormReloadToken((n) => n + 1)
  }

  const handleUseAsBasisForNewDiary = async () => {
    if (!editingReportId || startBusy) return
    setStartBusy(true)
    setError('')
    try {
      const id = await createTodaysDiaryDraft(supabase, projectId, editingReportId)
      openReportForm(id, { mode: 'compose' })
    } catch (err) {
      setError(err?.message || 'Could not create a new diary from this one')
    } finally {
      setStartBusy(false)
    }
  }

  const retryDiaryLoad = () => {
    setLoadDiagnostic('')
    setError('')
    setHydrateComplete(false)
    setLoading(true)
    setFormReloadToken((n) => n + 1)
  }

  const diaryModeBannerCopy = useMemo(
    () => diaryModeBanner({ mode: diaryMode || 'view', projectName: project?.name || '' }),
    [diaryMode, project?.name],
  )

  const linkedProject = useMemo(
    () => linkedProjectForSavedDiary({
      reportProjectId: project?.id || projectId,
      routeProjectId: projectId,
      projectName: project?.name || '',
    }),
    [project?.id, project?.name, projectId],
  )

  const showBrandingSelector = shouldShowBrandingSelector({
    hasReportId: Boolean(editingReportId),
    allowChangeBranding: false,
  })

  const showRecentOnThisPage = shouldShowRecentDiariesOnReportPage({
    hasOpenReport: Boolean(editingReportId),
  })

  const diarySaveLog = (...args) => {
    if (process.env.NODE_ENV !== 'production') console.log(DIARY_SAVE_LOG, ...args)
  }

  /**
   * TODO(P1+): Persist in-progress diary form edits across login if we add a safe
   * client draft snapshot. Today React state is lost on full navigation; only the
   * report return URL is preserved via ?next=.
   */
  const goToSignInForSave = () => {
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : (isDiaryExplicitEditMode
          ? diaryEditHref(projectId, editingReportId)
          : diaryMode === 'compose'
            ? diaryComposeHref(projectId, editingReportId)
            : existingDiaryHref(projectId, editingReportId)) || `/dashboard/project/${projectId}/diary`
    // Full navigation so /login?next=… is always the loaded URL (not a soft push race).
    window.location.assign(loginUrlWithReturn(path))
  }

  const friendlyDiarySaveError = (err) => {
    switch (err?.code) {
      case 'MISSING_REPORT_ID':
        return 'We couldn’t save your Site Diary because it wasn’t opened correctly. Go back to Site Diary and choose Open Latest Diary or Start New Site Diary.'
      case 'MISSING_PROJECT_ID':
        return 'We couldn’t save your Site Diary because it isn’t linked to a project. Go back to Site Diary and open it again.'
      case 'PREFLIGHT_FAILED':
      case 'PREFLIGHT_ZERO_ROWS':
      case 'ID_MISMATCH':
      case 'UPDATE_ZERO_ROWS':
      case 'UPDATE_FAILED':
      case 'VERIFY_SELECT_FAILED':
      case 'VERIFY_MISMATCH':
        return 'We couldn’t save your Site Diary. Check your connection and try again.'
      case 'LABOUR_DELETE_FAILED':
      case 'LABOUR_INSERT_FAILED':
      case 'PLANT_DELETE_FAILED':
      case 'PLANT_INSERT_FAILED':
      case 'PHOTOS_LIST_FAILED':
      case 'PHOTOS_DELETE_FAILED':
      case 'PHOTOS_INSERT_FAILED':
        return 'We couldn’t save all of your Site Diary. Check your connection and try again.'
      default:
        return 'We couldn’t save your Site Diary. Check your connection and try again.'
    }
  }

  const markSessionExpired = () => {
    diarySaveLog('session expired')
    saveLockRef.current = false
    completingRef.current = false
    flushSync(() => {
      setSessionExpired(true)
      setSaving(false)
      setJustSaved(false)
      setShowSaveBanner(false)
      persistUiErrorRef.current = SESSION_EXPIRED_SAVE_MESSAGE
      finalSaveInProgressRef.current = false
      setAutosaveStatus(null)
      setError(SESSION_EXPIRED_SAVE_MESSAGE)
    })
    saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  const handleAreaSaved = useCallback(async (savedGroup, meta = {}) => {
    if (!editingReportId) {
      return { ok: false, reason: 'missing-report', message: SAVE_AREA_PERSIST_FAIL_MESSAGE }
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      markSessionExpired()
      return { ok: false, reason: 'auth', message: SESSION_EXPIRED_SAVE_MESSAGE }
    }
    const walk = meta.locationWalk || locationWalk
    try {
      const result = await persistSaveAreaGroup(supabase, {
        userId: user.id,
        reportId: editingReportId,
        savedGroup,
        locationWalk: walk,
      })
      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason || 'persist-failed',
          message: SAVE_AREA_PERSIST_FAIL_MESSAGE,
        }
      }
      if (result.locationWalk) {
        lastPersistedPhotosRef.current = durablePhotosToBaseline(
          flattenAreaGroups(result.locationWalk),
        )
      }
      return result
    } catch (err) {
      console.warn('[zlog:save-area-persist]', err)
      return {
        ok: false,
        reason: 'persist-failed',
        message: SAVE_AREA_PERSIST_FAIL_MESSAGE,
      }
    }
  }, [editingReportId, locationWalk, markSessionExpired, supabase])

  const handleSave = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()

    if (sessionExpired) {
      goToSignInForSave()
      return
    }

    diarySaveLog('save button clicked', {
      reportId: editingReportId,
      projectId,
      saveLocked: saveLockRef.current,
      completing: completingRef.current,
      shareReady: Boolean(shareReadyPdfRef.current?.file),
    })

    // Clear stale locks so Save is never silently no-op.
    if (saveLockRef.current && !saving && !justSaved) {
      saveLockRef.current = false
      completingRef.current = false
    }

    if (!shareReadyPdfRef.current?.file && (saveLockRef.current || justSaved || completingRef.current)) {
      const blockMsg = justSaved || completingRef.current
        ? 'Save already completed for this attempt. Change a field or reopen the report.'
        : 'Save is already in progress.'
      flushSync(() => {
        persistUiErrorRef.current = blockMsg
        setAutosaveStatus(null)
        setError(blockMsg)
      })
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }

    const failSave = (message) => {
      diarySaveLog('fail', { message })
      saveLockRef.current = false
      completingRef.current = false
      finalSaveInProgressRef.current = false
      flushSync(() => {
        setSaving(false)
        setJustSaved(false)
        setShowSaveBanner(false)
        persistUiErrorRef.current = message
        setAutosaveStatus(null)
        setError(message)
      })
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }

    const finishAfterSuccessfulShare = () => {
      saveLockRef.current = false
      completingRef.current = false
      finalSaveInProgressRef.current = false
      invalidatePreparedSharePdf()
      flushSync(() => {
        setSaving(false)
        setAutosaveStatus(null)
        setError('')
        persistUiErrorRef.current = ''
      })
      if (saveNavTimerRef.current) clearTimeout(saveNavTimerRef.current)
      flushSync(() => {
        setJustSaved(true)
        setShowSaveBanner(false)
      })
      saveNavTimerRef.current = setTimeout(() => {
        setJustSaved(false)
        saveNavTimerRef.current = null
      }, POST_SAVE_SHARE_DELAY_MS)
      saveCtaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }

    const sharePreparedFile = async (prepared) => {
      const pdfFile = prepared.file instanceof File
        ? prepared.file
        : new File(
          [prepared.blob],
          prepared.fileName || 'Zlog-Site-Diary.pdf',
          { type: 'application/pdf' },
        )
      const tapUserActivation = snapshotUserActivation()
      const tapStartedAt = Date.now()
      if (process.env.NODE_ENV !== 'production') {
        markShareTiming('share_now_tap')
      }
      saveLockRef.current = true
      flushSync(() => {
        setSaving(true)
        setError('')
        persistUiErrorRef.current = ''
      })
      try {
        // Do NOT silent-download. Second tap only — gesture still active.
        if (canNativeShare()) {
          const shareResult = await shareSiteDiaryPdfNative({
            file: pdfFile,
            title: prepared.title,
            text: prepared.text,
          })
          const diag = shareResult.diagnostics || {}
          emitShareDiag('share-run-summary', {
            surface: 'live-diary',
            fromCache: true,
            tapUserActivationIsActive: tapUserActivation.isActive,
            tapUserActivationHasBeenActive: tapUserActivation.hasBeenActive,
            shareErrorName: diag.errorName ?? null,
            fileReady: Boolean(pdfFile?.size > 0),
            elapsedMsToShareAttempt: Date.now() - tapStartedAt,
            shareOk: shareResult.ok,
            shareAborted: Boolean(shareResult.aborted),
          })
          if (shareResult.ok) {
            finishAfterSuccessfulShare()
            return
          }
          failSave(
            diag.errorName === 'NotAllowedError'
              ? 'Sharing was blocked because the share gesture expired. Tap Report Ready — Share Now once.'
              : (shareResult.message || 'We couldn’t open the share sheet. Try again.'),
          )
          return
        }
        if (process.env.NODE_ENV !== 'production') {
          markShareTiming('download_fallback_called')
        }
        const downloaded = await downloadSiteDiaryPdf({
          blob: prepared.blob,
          fileName: prepared.fileName,
        })
        if (!downloaded.ok && !downloaded.cancelled) {
          failSave(downloaded.message || 'We couldn’t share the PDF. Try again.')
          return
        }
        if (downloaded.cancelled) {
          saveLockRef.current = false
          completingRef.current = false
          finalSaveInProgressRef.current = false
          flushSync(() => {
            setSaving(false)
            setJustSaved(false)
            setShowSaveBanner(false)
          })
          return
        }
        finishAfterSuccessfulShare()
      } catch (err) {
        failSave(err?.message || 'We couldn’t share the PDF. Try again.')
      }
    }

    // Second tap — native share from the already-prepared file only (no PDF prepare).
    // Also the one-tap path when background prepare already stored a current File.
    if (shareReadyPdfRef.current?.file && !saving) {
      await sharePreparedFile(shareReadyPdfRef.current)
      return
    }

    saveLockRef.current = true
    finalSaveInProgressRef.current = true
    const tapUserActivation = snapshotUserActivation()
    const tapStartedAt = Date.now()
    console.info('[zlog:share-diag] CTA tap', {
      userActivation: tapUserActivation,
      reportId: editingReportId,
      projectId,
    })
    emitShareDiag('cta-tap', {
      userActivationIsActive: tapUserActivation.isActive,
      userActivationHasBeenActive: tapUserActivation.hasBeenActive,
      reportId: editingReportId,
      projectId,
    })
    diarySaveLog('save button clicked', {
      reportId: editingReportId,
      projectId,
      userActivation: tapUserActivation,
    })
    pdfPrepareGenerationRef.current = bumpPdfPrepareGeneration(pdfPrepareGenerationRef.current)
    pdfBackgroundPrepareSchedulerRef.current?.cancel()
    await pdfBackgroundPrepareSchedulerRef.current?.waitUntilIdle?.()
    shareReadyPdfRef.current = null
    if (process.env.NODE_ENV !== 'production') {
      startShareTimingRun({
        reportId: editingReportId || null,
        fromPdfCache: false,
      })
      markShareTiming('tap')
    }
    flushSync(() => {
      setShareReady(false)
      setSaving(true)
      setJustSaved(false)
      setShowSaveBanner(false)
      persistUiErrorRef.current = ''
      setAutosaveStatus(null)
      setError('')
    })

    try {
      if (!editingReportId) {
        failSave('We couldn’t save your Site Diary because it wasn’t opened correctly. Go back to Site Diary and choose Open Latest Diary or Start New Site Diary.')
        return
      }

      await flushPendingAutosave()
      if (process.env.NODE_ENV !== 'production') {
        markShareTiming('autosave_flush_done')
      }

      // Commit the active unsaved work area (same as Save Area) before persist.
      // Draft photos outside locationWalk must never be silently omitted from Share.
      let walkForPersist = locationWalk
      const areaFlush = await locationWalkRef.current?.commitUnsavedAreaForShare?.()
      if (areaFlush && areaFlush.ok === false) {
        failSave(
          areaFlush.message
            || 'Finish this work area (name and photos), or clear it, before Save & Share.',
        )
        document.querySelector('[data-photo-workspace]')?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        })
        return
      }
      if (areaFlush?.locationWalk) {
        walkForPersist = areaFlush.locationWalk
        if (areaFlush.committed) {
          flushSync(() => {
            setLocationWalk(walkForPersist)
            setPhotos(flattenAreaGroups(walkForPersist))
          })
        }
      }
      if (process.env.NODE_ENV !== 'production') {
        patchShareTimingCounts({
          unsavedAreaCommitted: Boolean(areaFlush?.committed),
        })
        markShareTiming('area_flush_done')
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      diarySaveLog('auth check', {
        userId: user?.id || null,
        authError: authError?.message || null,
      })
      if (!user) {
        markSessionExpired()
        return
      }
      if (process.env.NODE_ENV !== 'production') {
        markShareTiming('auth_done')
      }

      const pendingId = makeUuid()
      const liveCover = coverPhotoRef.current
      let coverPlan = planCoverPhotoPersistence({
        coverPhoto: liveCover,
        loadedCoverPath: loadedCoverPathRef.current,
        coverRemoved: coverRemovedRef.current,
      })
      let signatureUrl = signature?.storagePath || null
      let requiredCoverPath = null
      const coverUploadNeeded = Boolean(coverPlan.needsUpload && coverPlan.file)
      const signatureUploadNeeded = Boolean(signature?.file)
      if (process.env.NODE_ENV !== 'production') {
        patchShareTimingCounts({
          coverUploadNeeded,
          signatureUploadNeeded,
        })
      }

      let localPreparedCoverBlob =
        coverPhotoRef.current?.preparedBlob instanceof Blob
          && coverPhotoRef.current.preparedBlob.size > 0
          && isPreparedCoverStoragePath(coverPhotoRef.current.storagePath)
          ? coverPhotoRef.current.preparedBlob
          : null

      if (coverPlan.needsUpload && coverPlan.file) {
        let coverGen = coverPendingGenerationRef.current
        if (!coverGen) {
          coverGen = newCoverPendingGeneration()
          coverPendingGenerationRef.current = coverGen
        }
        const {
          storagePath: coverPath,
          error: coverUploadError,
          preparedBlob,
          coverProcessingVersion,
        } = await persistCanonicalCoverUpload(supabase, {
          userId: user.id,
          reportId: editingReportId,
          generation: coverGen,
          file: coverPlan.file,
        })
        if (coverUploadError || !coverPath) {
          failSave(COVER_UPLOAD_FAIL_MESSAGE)
          return
        }
        coverPlan = {
          needsUpload: false,
          file: null,
          patch: {
            cover_photo_url: coverPath,
            cover_processing_version: coverProcessingVersion,
          },
        }
        if (!coverPlan.patch?.cover_photo_url) {
          failSave(COVER_UPLOAD_FAIL_MESSAGE)
          return
        }
        requiredCoverPath = coverPlan.patch.cover_photo_url
        loadedCoverPathRef.current = requiredCoverPath
        coverRemovedRef.current = false
        localPreparedCoverBlob = preparedBlob instanceof Blob && preparedBlob.size > 0
          ? preparedBlob
          : null
        // Drop local File after successful upload — planner must not request a second upload.
        const nextCover = coverPhotoStateAfterUpload(requiredCoverPath, liveCover.preview, {
          preparedBlob: localPreparedCoverBlob,
        })
        coverPhotoRef.current = nextCover
        setCoverPhoto(nextCover)
        // Upload succeeded — never leave a prior cover-fail banner visible.
        if (persistUiErrorRef.current === COVER_UPLOAD_FAIL_MESSAGE) {
          persistUiErrorRef.current = ''
        }
      } else if (coverPlan.patch?.cover_photo_url) {
        requiredCoverPath = coverPlan.patch.cover_photo_url
      }

      if (signature?.file) {
        const signaturePath = `${user.id}/pending/${pendingId}/signature.png`
        const { error: signatureUploadError } = await supabase.storage
          .from('site-photos')
          .upload(signaturePath, signature.file, { contentType: signature.file.type, upsert: false })
        if (signatureUploadError) {
          failSave('We couldn’t upload the signature. Check your connection and try Share again.')
          return
        }
        signatureUrl = signaturePath
      }
      if (process.env.NODE_ENV !== 'production') {
        markShareTiming('cover_signature_done')
      }

      const reportPayload = applyCoverPhotoPatch(
        {
          project_id: projectId,
          report_date: reportDate,
          weather: weather.trim() || null,
          shift: shiftType || null,
          site_summary: siteSummary.trim(),
          visitors: visitors.trim() || null,
          delays_issues: delaysIssues.trim() || null,
          actions: actionsRequired.trim() || null,
          company_reporting_for: companyReportingFor.trim() || null,
          creator_name: creatorName.trim() || null,
          creator_role: creatorRole.trim() || null,
          signature_url: signatureUrl,
          equipment_hire: equipmentHirePayload(equipmentHireRows),
          hs_incidents: hsIncidentsPayload(hsIncidents),
          rfis: rfisPayload(rfis),
          variations: variationsPayload(variations),
          temporary_works_applicable: temporaryWorksApplicable,
          temporary_works:
            temporaryWorksApplicable === true ? temporaryWorksPayload(temporaryWorks) : [],
          ...brandingPayload(brandingSelection),
        },
        coverPlan,
      )

      const labourPayload = labourFormToPersistRows(labourRows, editingReportId)
      const plantPayload = plantFormToPersistRows(plantRows, editingReportId)

      const sequenced = flattenAreaGroups(walkForPersist)
      const keptStoragePaths = sequenced
        .filter((p) => !p.file && p.storagePath)
        .map((p) => p.storagePath)

      const photoRecords = []
      const updateExistingPhotos = []
      const sharePreparedPdfBlobs = new Map()

      let photoPersistResults
      try {
        photoPersistResults = await mapWithConcurrency(
          sequenced,
          SHARE_PHOTO_UPLOAD_CONCURRENCY,
          async (photo) => {
            let overlayPath = photo.overlayPath || null
            if (photo.overlayDirty) {
              try {
                if (hasAnnotations(photo.annotations) && photo.overlayPreview) {
                  overlayPath = await uploadOverlayPng(supabase, {
                    userId: user.id,
                    reportId: editingReportId,
                    sequence: photo.sequence_number,
                    dataUrl: photo.overlayPreview,
                  })
                  if (process.env.NODE_ENV !== 'production') {
                    bumpShareTimingCount('overlayUploadCount')
                  }
                } else {
                  overlayPath = null
                }
              } catch {
                const overlayErr = new Error('overlay-upload-failed')
                overlayErr.persistStage = 'overlay'
                throw overlayErr
              }
            }

            const annotationPayload = hasAnnotations(photo.annotations) ? photo.annotations : null

            if (photo.file) {
              // Phase C: upload prepared report + thumbnail; never store raw phone original
              // as the canonical report asset when the pipeline can produce a report JPEG.
              const prepared = await ensurePreparedPhotoAssets(photo)
              if (!prepared.ok) {
                const photoErr = new Error('photo-upload-failed')
                photoErr.persistStage = 'photo'
                photoErr.cause = prepared.error || prepared.reason
                throw photoErr
              }

              let uploaded
              try {
                uploaded = await uploadPreparedPhotoAssets(supabase, {
                  userId: user.id,
                  reportId: editingReportId,
                  photoId: photo.key,
                  reportBlob: prepared.report.blob,
                  thumbnailBlob: prepared.thumbnail?.blob || null,
                  reportMeta: prepared.report,
                  thumbnailMeta: prepared.thumbnail || {},
                  pipelineId: prepared.pipelineId,
                })
              } catch (uploadErr) {
                const photoErr = new Error('photo-upload-failed')
                photoErr.persistStage = 'photo'
                photoErr.cause = uploadErr
                throw photoErr
              }

              if (uploaded.thumbFailed) {
                console.warn('[zlog:photo-persist] thumbnail upload failed; report asset kept', {
                  photoId: photo.key,
                  reportPath: uploaded.reportPath,
                })
              }

              if (uploaded.reportPath && prepared.report?.blob instanceof Blob) {
                sharePreparedPdfBlobs.set(uploaded.reportPath, prepared.report.blob)
              }

              return {
                kind: 'new',
                record: {
                  report_id: editingReportId,
                  ...buildPreparedPhotoRecordFields(uploaded),
                  caption: (photo.caption || '').trim() || null,
                  sequence: photo.sequence_number,
                  layout: photo.layout || 'grid4',
                  location: photo.location || photo.area || null,
                  category: photo.category || null,
                  annotations: annotationPayload,
                  overlay_path: overlayPath,
                  rotation_degrees: 0,
                  assigned_to: (photo.assignedTo || photo.assigned_to || '').trim() || null,
                },
              }
            }

            if (photo.storagePath) {
              return {
                kind: 'update',
                patch: {
                  url: photo.storagePath,
                  fields: {
                    caption: (photo.caption || '').trim() || null,
                    sequence: photo.sequence_number,
                    layout: photo.layout || 'grid4',
                    location: photo.location || photo.area || null,
                    category: photo.category || null,
                    annotations: annotationPayload,
                    overlay_path: overlayPath,
                    rotation_degrees: Number(photo.rotationDegrees) || 0,
                    assigned_to: (photo.assignedTo || photo.assigned_to || '').trim() || null,
                  },
                },
              }
            }

            return { kind: 'skip' }
          },
        )
      } catch (persistErr) {
        if (persistErr?.persistStage === 'photo') {
          failSave('We couldn’t upload a photo. Check your connection and try Share again.')
          return
        }
        failSave('We couldn’t upload photo mark-ups. Check your connection and try Share again.')
        return
      }

      for (const result of photoPersistResults) {
        if (result?.kind === 'new') {
          photoRecords.push(result.record)
        } else if (result?.kind === 'update') {
          updateExistingPhotos.push(result.patch)
        }
      }
      if (process.env.NODE_ENV !== 'production') {
        patchShareTimingCounts({
          photoCount: sequenced.length,
          newUploadCount: photoRecords.length,
          durablePhotoCount: updateExistingPhotos.length,
        })
        markShareTiming('photo_persist_done')
      }

      const saved = await finalizeSiteDiarySave(supabase, {
        reportId: editingReportId,
        projectId,
        reportPayload,
        labourPayload,
        plantPayload,
        keptStoragePaths,
        photoRecords,
        updateExistingPhotos,
        user,
        baseline: {
          reportRow: lastPersistedReportRef.current,
          labour: lastPersistedLabourRef.current,
          plant: lastPersistedPlantRef.current,
          photos: lastPersistedPhotosRef.current,
        },
      })

      if (!saved?.id || saved.id !== editingReportId) {
        failSave('We couldn’t save your Site Diary. Check your connection and try again.')
        return
      }
      if (process.env.NODE_ENV !== 'production') {
        markShareTiming('finalize_done')
      }

      if (requiredCoverPath && !coverPhotoPersistedOnRow(saved.row, requiredCoverPath)) {
        failSave('We couldn’t save your Site Diary. Check your connection and try again.')
        return
      }

      // Persist first, then prepare the PDF on this tap. Native share waits for
      // a fresh second tap so Android user activation stays live.
      if (requiredCoverPath) {
        const keepPreview = coverPhotoRef.current?.preview || null
        const keepPrepared = coverPhotoRef.current?.preparedBlob || localPreparedCoverBlob || null
        const nextCover = coverPhotoStateFromSaved(requiredCoverPath, keepPreview, {
          preparedBlob: keepPrepared,
        })
        coverPhotoRef.current = nextCover
        setCoverPhoto(nextCover)
      }
      if (saved.row) {
        ackedSnapshotRef.current = snapshotFromLiveRow(saved.row)
        lastPersistedReportRef.current = saved.row
      } else if (latestPayloadRef.current) {
        ackedSnapshotRef.current = latestPayloadRef.current
      }
      lastPersistedLabourRef.current = labourPayload
      lastPersistedPlantRef.current = plantPayload
      lastPersistedPhotosRef.current = durablePhotosToBaseline(sequenced)
      setReportIsDraft(false)
      diarySaveLog('success', { reportId: saved.id })

      const localPreparedPhotoSources = collectLocalPreparedPdfPhotoSources({
        photos: flattenAreaGroups(walkForPersist),
        userId: user.id,
        reportId: saved.id,
      })
      for (const [path, blob] of sharePreparedPdfBlobs) {
        localPreparedPhotoSources.set(path, blob)
      }
      const prepared = await prepareSiteDiaryPdf({
        projectId,
        reportId: saved.id,
        localPreparedPhotoSources,
        localPreparedCoverBlob,
      })
      if (!prepared.ok) {
        failSave(prepared.message || 'We couldn’t prepare the PDF. Check your connection and try again.')
        return
      }
      if (
        prepared.coverMigrated
        && prepared.coverPhotoPath
        && isPreparedCoverStoragePath(prepared.coverPhotoPath)
      ) {
        const keepPreview = coverPhotoRef.current?.preview || null
        const migratedBlob =
          prepared.coverPreparedBlob instanceof Blob && prepared.coverPreparedBlob.size > 0
            ? prepared.coverPreparedBlob
            : null
        const nextCover = coverPhotoStateAfterUpload(prepared.coverPhotoPath, keepPreview, {
          preparedBlob: migratedBlob,
        })
        coverPhotoRef.current = nextCover
        loadedCoverPathRef.current = prepared.coverPhotoPath
        setCoverPhoto(nextCover)
        if (ackedSnapshotRef.current) {
          ackedSnapshotRef.current = {
            ...ackedSnapshotRef.current,
            cover_photo_url: prepared.coverPhotoPath,
          }
        }
      }

      const pdfReadyAt = Date.now()
      const elapsedMsToPdfReady = pdfReadyAt - tapStartedAt
      const preShareUserActivation = snapshotUserActivation()
      console.info('[zlog:share-diag] PDF prepared — about to invoke native share', {
        elapsedMsSinceTap: elapsedMsToPdfReady,
        tapUserActivation,
        preShareUserActivation,
        fileReady: Boolean(prepared.file?.size > 0),
        fileName: prepared.file?.name || prepared.fileName || null,
        fileSize: prepared.file?.size ?? prepared.blob?.size ?? null,
        hasShareApi: canNativeShare(),
      })
      emitShareDiag('pdf-ready', {
        elapsedMsToPdfReady,
        fileReady: Boolean(prepared.file?.size > 0),
        fileName: prepared.file?.name || prepared.fileName || null,
        fileSize: prepared.file?.size ?? prepared.blob?.size ?? null,
        hasShareApi: canNativeShare(),
      })
      const pdfFile = prepared.file instanceof File
        ? prepared.file
        : new File(
          [prepared.blob],
          prepared.fileName || 'Zlog-Site-Diary.pdf',
          { type: 'application/pdf' },
        )
      shareReadyPdfRef.current = {
        ...prepared,
        file: pdfFile,
      }
      saveLockRef.current = false
      completingRef.current = false
      finalSaveInProgressRef.current = false
      flushSync(() => {
        setSaving(false)
        setShareReady(true)
        setError('')
        persistUiErrorRef.current = ''
      })
      return
    } catch (err) {
      const message =
        err instanceof DiarySaveError
          ? friendlyDiarySaveError(err)
          : 'We couldn’t prepare the share. Check your connection and try again.'
      failSave(message)
    }
  }


  useEffect(() => {
    return () => {
      // Do not cancel an in-flight handoff to Report Complete (Strict Mode / remount).
      if (completingRef.current) return
      if (saveNavTimerRef.current) clearTimeout(saveNavTimerRef.current)
    }
  }, [])

  if (loading && !loadDiagnostic) {
    return (
      <PremiumShell
        title="Site Diary"
        backHref="/dashboard"
        accent={REPORT_THEMES.diary.accent}
        maxWidth={720}
      >
        <p style={{ color: 'var(--text-2)' }}>Loading…</p>
      </PremiumShell>
    )
  }

  if (loadDiagnostic && !hydrateComplete) {
    return (
      <PremiumShell
        title="Site Diary"
        backHref={diaryHubHref({ projectId }) || '/dashboard'}
        accent={REPORT_THEMES.diary.accent}
        maxWidth={720}
      >
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.45,
          }}
        >
          {error || DIARY_WORKBENCH_LOAD_FAILED_COPY}
          {process.env.NODE_ENV !== 'production' ? (
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.4, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
              {loadDiagnostic}
            </p>
          ) : null}
        </div>
        <SecondaryButton type="button" onClick={retryDiaryLoad}>
          Try again
        </SecondaryButton>
      </PremiumShell>
    )
  }

  if (showStartScreen) {
    return (
      <PremiumShell
        title="Site Diary"
        backHref="/dashboard"
        accent={REPORT_THEMES.diary.accent}
        maxWidth={720}
      >
        {(startError || error) && (
          <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: '#ff6b6b', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
            {startError || error}
          </div>
        )}

        <h2
          style={{
            ...typeTokens.sectionTitle,
            marginTop: 0,
            marginBottom: 16,
            color: 'var(--text)',
            fontSize: 18,
            letterSpacing: '0.02em',
            textTransform: 'none',
          }}
        >
          Today’s Site Diary
        </h2>

        {openDraft ? (
          <GlassSection title="Continue existing draft" accent={DIARY_ACCENT}>
            <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
              Continue where you left off.
            </p>
            <SecondaryButton type="button" disabled={startBusy} onClick={handleContinueDraft}>
              Continue Draft
            </SecondaryButton>
          </GlassSection>
        ) : null}

        <GlassSection title="Create today’s diary" accent={DIARY_ACCENT}>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
            Start a new diary for today using reusable details from your most recent saved entry. Your previous diary stays unchanged.
          </p>
          <PrimaryCTA type="button" disabled={startBusy} accent={DIARY_ACCENT} onClick={handleCreateTodaysDiary}>
            {startBusy ? 'Working…' : 'Create Today’s Diary'}
          </PrimaryCTA>
        </GlassSection>

        <GlassSection title="Start blank diary" accent={DIARY_ACCENT}>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
            Create a completely new empty draft for today.
          </p>
          <SecondaryButton type="button" disabled={startBusy} onClick={handleStartBlankDiary}>
            Start Blank Diary
          </SecondaryButton>
        </GlassSection>

        <h2
          style={{
            ...typeTokens.sectionTitle,
            marginTop: 32,
            marginBottom: 12,
            color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
            fontSize: 16,
            letterSpacing: '0.072em',
          }}
        >
          Recent diary entries
        </h2>

        {recentDiaries.length === 0 ? (
          <div className={premiumDiaryEmptyClass}>
            <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
            <p className={premiumDiaryEmptyHintClass}>Create today’s diary to add your first saved entry</p>
          </div>
        ) : (
          recentDiaries.map((d) => (
            <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
              <div style={recentEntryDateStyle}>{project?.name || 'Project'}</div>
              <div style={recentEntrySummaryStyle}>
                {d.report_date
                  ? new Date(`${d.report_date}T12:00:00`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : ''}
              </div>
              <div style={recentEntryActionsStyle}>
                <SecondaryButton
                  type="button"
                  onClick={() => openReportForm(d.id, { reportDate: d.report_date })}
                  style={recentEntryActionButtonStyle}
                >
                  View
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  disabled={startBusy}
                  onClick={() => handleUseAsTemplate(d.id)}
                  style={recentEntryActionButtonStyle}
                >
                  Use as Basis for New Diary
                </SecondaryButton>
              </div>
            </RecentEntryCard>
          ))
        )}
      </PremiumShell>
    )
  }

  // Contextual Back → same-diary Project Details (not hub). Hub only if report id missing.
  const workbenchBackHref =
    projectAndReportDetailsHref(projectId, editingReportId)
    || diaryHubHref({ projectId })
    || '/dashboard/diary'

  return (
    <PremiumShell
      title="Site Diary"
      backHref={workbenchBackHref}
      accent={REPORT_THEMES.diary.accent}
      maxWidth={720}
    >
      {error && (
        <div
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.45,
            whiteSpace: 'pre-line',
          }}
        >
          {error}
        </div>
      )}
      {showSaveBanner && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 18,
            left: '50%',
            zIndex: 80,
            width: 'min(440px, calc(100vw - 32px))',
            marginLeft: 0,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            padding: '12px 16px',
            fontSize: 14,
            lineHeight: 1.45,
            borderRadius: 10,
            textAlign: 'center',
            fontWeight: 600,
            background: 'rgba(34,197,94,0.14)',
            border: '1px solid rgba(34,197,94,0.38)',
            color: '#4ade80',
            boxShadow: '0 10px 28px color-mix(in srgb, var(--ink) 35%, transparent)',
            animation: 'zlog-save-banner 3s ease forwards',
          }}
        >
          Saved ✓
        </div>
      )}
      {justSaved && isDiaryViewMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'rgba(34,197,94,0.14)',
            border: '1px solid rgba(34,197,94,0.38)',
            color: '#4ade80',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
            borderRadius: 10,
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          ✓ Saved — you’re viewing this Site Diary.
        </div>
      )}
      {editingReportId && showDiaryModeChrome && (
        <div style={{ background: `rgba(${DIARY_ACCENT}, 0.08)`, border: `1px solid rgba(${DIARY_ACCENT}, 0.25)`, color: '#F0EDE8', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10, lineHeight: 1.5 }}>
          {diaryModeBannerCopy.emphasizeProject && project?.name ? (
            <>
              {isDiaryViewMode ? 'You’re viewing the saved Site Diary for ' : 'You’re editing the saved Site Diary for '}
              <strong style={{ fontWeight: 700, color: 'var(--text)' }}>{project.name}</strong>
              {isDiaryViewMode ? '.' : '. Make your changes, then tap Save & Share when you’re ready.'}
            </>
          ) : (
            diaryModeBannerCopy.text
          )}
          {isDiaryViewMode ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <EqualChoiceButton
                type="button"
                onClick={handleEnterEditMode}
                style={{ flex: '1 1 160px', minHeight: 48 }}
              >
                Edit This Diary
              </EqualChoiceButton>
              <EqualChoiceButton
                type="button"
                disabled={startBusy}
                onClick={handleUseAsBasisForNewDiary}
                style={{ flex: '1 1 160px', minHeight: 48 }}
              >
                Use as Basis for New Diary
              </EqualChoiceButton>
            </div>
          ) : isDiaryExplicitEditMode ? (
            <div style={{ marginTop: 12 }}>
              <SecondaryButton
                type="button"
                onClick={handleCancelEditMode}
                style={{ width: '100%', minHeight: 48 }}
              >
                Cancel editing
              </SecondaryButton>
            </div>
          ) : null}
        </div>
      )}

      {(project?.name || reportDate) && (
        <div
          style={{
            background: 'var(--plate)',
            border: '1px solid var(--edge)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {setupLogoPreview ? (
              <img
                src={setupLogoPreview}
                alt=""
                style={{
                  width: 48,
                  height: 48,
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--ink) 40%, var(--plate))',
                  border: '1px solid var(--edge)',
                  flexShrink: 0,
                  padding: 4,
                }}
              />
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                {linkedProject.projectName || project?.name || 'Project'}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'color-mix(in srgb, var(--text) 82%, var(--text-2))', lineHeight: 1.45 }}>
                {[
                  reportDate &&
                    new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  shiftType && `${shiftType} Shift`,
                  projectProgrammeCard.projectDayLine,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          {isDiaryEditMode ? (
            <SecondaryButton
              type="button"
              href={projectAndReportDetailsHref(projectId, editingReportId) || undefined}
              style={{ width: '100%', minHeight: 48, marginTop: 12 }}
            >
              {'Review / Edit Project & Report Details'}
            </SecondaryButton>
          ) : null}
        </div>
      )}

      <form
        method="post"
        onSubmit={(e) => {
          // Prevent native navigation that remounts the page and aborts async save.
          e.preventDefault()
          if (!isDiaryEditMode) return
          if (sessionExpired) {
            goToSignInForSave()
            return
          }
          handleSave(e)
        }}
      >
        <fieldset
          disabled={isDiaryViewMode}
          style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
        >
        {showBrandingSelector ? (
          <BrandingSelector
            value={brandingSelection}
            onChange={(next) => {
              invalidatePreparedSharePdf()
              setBrandingSelection(next)
            }}
            accent={DIARY_ACCENT}
            autoSelectDefault={!editingReportId}
          />
        ) : null}

        <div style={todaysDiaryDividerStyle}>
          <div style={todaysDiaryDividerTitleStyle}>{'Today’s Site Diary'}</div>
          <p style={todaysDiaryDividerNoteStyle}>
            {'Record today’s site activity, attendance, permits, deliveries and photo evidence.'}
          </p>
        </div>

        <GlassSection title="Weather" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Weather</label>
          <input
            style={{ ...inputStyle, marginBottom: 0 }}
            value={weather}
            onInput={handleWeatherInput}
            onChange={handleWeatherInput}
            placeholder="e.g. Overcast, 12°C, light rain PM"
          />
        </GlassSection>

        <DiaryDailyRecordSections
          accent={DIARY_ACCENT}
          disabled={isDiaryViewMode}
          hsIncidents={hsIncidents}
          rfis={rfis}
          variations={variations}
          onHsChange={setHsIncidents}
          onRfisChange={setRfis}
          onVariationsChange={setVariations}
        />

        <GlassSection title="Site summary" accent={DIARY_ACCENT}>
          <label style={labelStyle}>Summary</label>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={siteSummary}
            onInput={handleSiteSummaryInput}
            onChange={handleSiteSummaryInput}
            placeholder="Overall progress, key activities, and notable events today…"
            rows={5}
          />
        </GlassSection>

        <GlassSection title="Labour" accent={DIARY_ACCENT}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              className="zlog-secondary-btn"
              onClick={() => {
                setLabourMode('scan')
                setScanError('')
              }}
              style={{
                ...addRowButtonStyle,
                textTransform: 'none',
                letterSpacing: '0.02em',
                borderStyle: labourMode === 'scan' ? 'solid' : 'dashed',
                borderColor: labourMode === 'scan' ? `rgba(${DIARY_ACCENT}, 0.55)` : 'var(--edge)',
                color: 'var(--text)',
                boxShadow: labourMode === 'scan' ? `0 0 0 1px rgba(${DIARY_ACCENT}, 0.25)` : undefined,
              }}
            >
              Scan Sign-In Sheet (Camera/Upload)
            </button>
            <button
              type="button"
              className="zlog-secondary-btn"
              onClick={startManualLabour}
              style={{
                ...addRowButtonStyle,
                textTransform: 'none',
                letterSpacing: '0.02em',
                borderStyle: labourMode === 'manual' ? 'solid' : 'dashed',
                borderColor: labourMode === 'manual' ? `rgba(${DIARY_ACCENT}, 0.55)` : 'var(--edge)',
                color: 'var(--text)',
                boxShadow: labourMode === 'manual' ? `0 0 0 1px rgba(${DIARY_ACCENT}, 0.25)` : undefined,
              }}
            >
              Manual Entry
            </button>
          </div>

          {labourMode === 'scan' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0, fontSize: 10 }}>Aggregate by</label>
                <select
                  value={labourGroupBy}
                  onChange={(e) => setLabourGroupBy(e.target.value)}
                  style={{ ...cellInputStyle, width: 'auto', minWidth: 180, marginBottom: 0 }}
                  disabled={scanLoading}
                >
                  <option value="trade_company">Trade + company</option>
                  <option value="trade">Trade</option>
                  <option value="company">Company / subcontractor</option>
                </select>
              </div>
              <ImageSourceButtons
                onFiles={handleSignInSheetFiles}
                disabled={scanLoading}
                cameraLabel="Scan with camera"
                galleryLabel="Upload sheet photo"
                hint="OCR extracts sign-in/out times only. Review every operative before applying to the labour summary."
              />
              {scanLoading && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
                  Reading sign-in sheet…
                </p>
              )}
              {scanSheetPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
                <img
                  src={scanSheetPreview}
                  alt="Sign-in sheet preview"
                  style={{
                    marginTop: 12,
                    width: '100%',
                    maxHeight: 180,
                    objectFit: 'contain',
                    borderRadius: 10,
                    border: '1px solid var(--edge)',
                    background: 'var(--ink)',
                  }}
                />
              )}
              {scanError && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#ff6b6b' }}>{scanError}</p>
              )}
              {!scanLoading && scanMeta.extracted > 0 && !scanError && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                  Extracted {scanMeta.extracted} operative{scanMeta.extracted === 1 ? '' : 's'}
                  {scanMeta.ignored > 0 ? ` · ${scanMeta.ignored} flagged as other date` : ''}.
                </p>
              )}
              {!scanLoading && scanOperatives.length > 0 && (
                <SignInOperativeReview
                  operatives={scanOperatives}
                  onChange={setScanOperatives}
                  onApply={applyScanOperativesToLabour}
                  onRetry={scanLastFile ? retrySignInScan : undefined}
                  warnings={scanWarnings}
                  reportDate={reportDate}
                  disabled={scanLoading}
                />
              )}
            </div>
          )}

          <div
            style={{
              marginBottom: 12,
              border: '1px solid var(--edge)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--plate)',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--edge)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Labour summary · {reportDate}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {labourTotals.operatives} operatives · {labourTotals.hours} hrs
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>Trade</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>Company</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Ops</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Hours</th>
                    <th style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {labourRows.map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%' }}
                          value={row.trade}
                          onChange={(e) => updateLabour(row.key, 'trade', e.target.value)}
                          placeholder="Carpenter"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%' }}
                          value={row.company}
                          onChange={(e) => updateLabour(row.key, 'company', e.target.value)}
                          placeholder="Subco Ltd"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          min="0"
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                          value={row.headcount}
                          onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)}
                          placeholder="4"
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                          value={row.hours}
                          onChange={(e) => updateLabour(row.key, 'hours', e.target.value)}
                          placeholder="8"
                        />
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {labourRows.length > 1 && (
                          <button
                            type="button"
                            style={{ ...removeRowStyle, marginBottom: 0, padding: '4px 6px' }}
                            onClick={() => {
                              invalidatePreparedSharePdf()
                              setLabourRows((rows) => rows.filter((r) => r.key !== row.key))
                            }}
                            aria-label="Remove labour row"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button type="button" style={addRowButtonStyle} onClick={() => {
            invalidatePreparedSharePdf()
            setLabourRows((rows) => [...rows, emptyLabour()])
          }}>
            + Add labour row
          </button>
        </GlassSection>

        <GlassSection title="Plant" accent={DIARY_ACCENT}>
          {plantRows.map((row) => (
            <div key={row.key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {plantRows.length > 1 && (
                <button type="button" style={removeRowStyle} onClick={() => setPlantRows((rows) => rows.filter((r) => r.key !== row.key))}>
                  Remove row
                </button>
              )}
              <div style={rowGridStyle}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Plant type</label>
                  <input style={cellInputStyle} value={row.plant_type} onChange={(e) => updatePlant(row.key, 'plant_type', e.target.value)} placeholder="Telehandler" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Quantity</label>
                  <input type="number" min="0" style={cellInputStyle} value={row.quantity} onChange={(e) => updatePlant(row.key, 'quantity', e.target.value)} placeholder="1" />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Hours</label>
                  <input type="number" min="0" step="0.5" style={cellInputStyle} value={row.hours} onChange={(e) => updatePlant(row.key, 'hours', e.target.value)} placeholder="6" />
                </div>
              </div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Notes</label>
              <input style={{ ...cellInputStyle, width: '100%' }} value={row.notes} onChange={(e) => updatePlant(row.key, 'notes', e.target.value)} placeholder="Optional notes" />
            </div>
          ))}
          <button type="button" style={addRowButtonStyle} onClick={() => setPlantRows((rows) => [...rows, emptyPlant()])}>
            + Add plant row
          </button>
        </GlassSection>

        <GlassSection title="Equipment on hire" accent={DIARY_ACCENT}>
          {equipmentHireRows.map((row) => (
            <div key={row.key} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {equipmentHireRows.length > 1 && (
                <button
                  type="button"
                  style={removeRowStyle}
                  onClick={() => {
                    invalidatePreparedSharePdf()
                    setEquipmentHireRows((rows) => rows.filter((r) => r.key !== row.key))
                  }}
                >
                  Remove entry
                </button>
              )}
              <div style={rowGridStyle}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Equipment description</label>
                  <input
                    style={cellInputStyle}
                    value={row.description}
                    onChange={(e) => updateEquipmentHire(row.key, 'description', e.target.value)}
                    placeholder="1.5T Digger"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Hire company / supplier</label>
                  <input
                    style={cellInputStyle}
                    value={row.supplier}
                    onChange={(e) => updateEquipmentHire(row.key, 'supplier', e.target.value)}
                    placeholder="HSS Hire"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Quantity</label>
                  <input
                    type="number"
                    min="0"
                    style={cellInputStyle}
                    value={row.quantity}
                    onChange={(e) => updateEquipmentHire(row.key, 'quantity', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 10 }}>Status</label>
                  <select
                    style={cellInputStyle}
                    value={row.status}
                    onChange={(e) => updateEquipmentHire(row.key, 'status', e.target.value)}
                  >
                    {EQUIPMENT_HIRE_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            style={addRowButtonStyle}
            onClick={() => {
              invalidatePreparedSharePdf()
              setEquipmentHireRows((rows) => [...rows, emptyEquipmentHire()])
            }}
          >
            + Add Equipment
          </button>
        </GlassSection>

        <DiaryTemporaryWorksSection
          accent={DIARY_ACCENT}
          disabled={isDiaryViewMode}
          applicable={temporaryWorksApplicable}
          rows={temporaryWorks}
          onApplicableChange={(value) => {
            invalidatePreparedSharePdf()
            setTemporaryWorksApplicable(value)
          }}
          onRowsChange={(rows) => {
            invalidatePreparedSharePdf()
            setTemporaryWorks(rows)
          }}
        />

        <GlassSection title="Visitors" accent={DIARY_ACCENT}>
          <div style={carriedVisitors ? carriedFieldWrapStyle : undefined}>
            {carriedVisitors && (
              <p style={carriedFieldNoteStyle}>Carried from last report — edit or clear</p>
            )}
            <textarea
              style={{ ...textareaStyle, marginBottom: 0 }}
              value={visitors}
              onChange={(e) => {
                setVisitors(e.target.value)
                setCarriedVisitors(false)
              }}
              placeholder="Client reps, inspectors, deliveries…"
              rows={3}
            />
          </div>
        </GlassSection>

        <GlassSection title="Delays & issues" accent={DIARY_ACCENT}>
          <div style={carriedDelaysIssues ? carriedFieldWrapStyle : undefined}>
            {carriedDelaysIssues && (
              <p style={carriedFieldNoteStyle}>Carried from last report — edit or clear</p>
            )}
            <textarea
              style={{ ...textareaStyle, marginBottom: 0 }}
              value={delaysIssues}
              onChange={(e) => {
                setDelaysIssues(e.target.value)
                setCarriedDelaysIssues(false)
              }}
              placeholder="Weather delays, material shortages, access issues…"
              rows={3}
            />
          </div>
        </GlassSection>

        <GlassSection title="Actions required" accent={DIARY_ACCENT}>
          <textarea
            style={{ ...textareaStyle, marginBottom: 0 }}
            value={actionsRequired}
            onChange={(e) => setActionsRequired(e.target.value)}
            placeholder="Follow-ups, RFIs, instructions needed…"
            rows={3}
          />
        </GlassSection>

        <PhotoWorkspace
          ref={locationWalkRef}
          reportType="diary"
          reportId={editingReportId}
          accent={DIARY_ACCENT}
          projectId={projectId}
          value={locationWalk}
          onChange={handleLocationWalkChange}
          onAreaSaved={handleAreaSaved}
          onContinue={continueToSignature}
          ensureReportPreview={ensureReportPreviewForViewer}
          onAreaNameValidationResolved={handleAreaNameValidationResolved}
        />

        <div
          ref={signatureSectionRef}
          id="zlog-diary-signature"
          tabIndex={-1}
          style={{ outline: 'none', scrollMarginTop: 16 }}
        >
        <GlassSection title="Signature" accent={DIARY_ACCENT}>
            <label style={labelStyle}>Signature</label>
            {(signatureMode === 'carried' || signatureMode === 'accepted') && signature?.preview ? (
              <div style={{ marginBottom: 0 }}>
                <img
                  src={signature.preview}
                  alt="Signature"
                  style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, display: 'block', marginBottom: 10, background: '#fff', padding: 8 }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {signatureMode === 'carried' && (
                    <SecondaryButton type="button" onClick={useExistingSignature}>
                      Use Existing Signature
                    </SecondaryButton>
                  )}
                  <SecondaryButton type="button" onClick={resignSignature}>
                    Re-sign / Clear
                  </SecondaryButton>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 0 }}>
                <canvas
                  ref={attachSignatureCanvas}
                  style={{
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    width: '100%',
                    height: 120,
                    display: 'block',
                    borderRadius: 8,
                    background: '#fff',
                    marginBottom: 10,
                  }}
                />
                <SecondaryButton type="button" onClick={clearSignaturePad}>
                  Clear
                </SecondaryButton>
              </div>
            )}
        </GlassSection>
        </div>
        </fieldset>

        {isDiaryEditMode ? (
        <div
          ref={saveCtaRef}
          className="zlog-diary-save-share-action"
          style={DIARY_SAVE_SHARE_ACTION_STYLE}
        >
          {error && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.45,
                borderRadius: 10,
                whiteSpace: 'pre-line',
                background: 'rgba(220,50,50,0.1)',
                border: '1px solid rgba(220,50,50,0.3)',
                color: '#ff6b6b',
              }}
            >
              {error}
            </div>
          )}
          {shouldShowManualSaveConfirmation({ error, saving, justSaved }) ? (
            <div
              role="status"
              aria-live="polite"
              className="zlog-manual-save-confirmation"
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.45,
                borderRadius: 10,
                fontWeight: 600,
                background: 'rgba(34,197,94,0.14)',
                border: '1px solid rgba(34,197,94,0.38)',
                color: '#4ade80',
              }}
            >
              Saved ✓
            </div>
          ) : null}
          {shouldShowDiaryAutosaveStatus({
            error,
            saving,
            justSaved,
            autosaveStatus,
            finalSaveInProgress: saving || justSaved,
          }) ? (
            <p
              role="status"
              aria-live="polite"
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                lineHeight: 1.45,
                color:
                  autosaveStatus === 'network' || autosaveStatus === 'auth' || autosaveStatus === 'db'
                    ? '#ff6b6b'
                    : 'color-mix(in srgb, var(--text) 72%, var(--text-2))',
              }}
            >
              {autosaveStatusMessage(autosaveStatus)}
            </p>
          ) : null}
          {shareReady && !saving && !error ? (
            <p
              role="status"
              aria-live="polite"
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                lineHeight: 1.45,
                fontWeight: 600,
                color: '#4ade80',
              }}
            >
              ✓ Report ready
            </p>
          ) : null}
          <PrimaryCTA
            type="button"
            surface="workbench"
            loading={sessionExpired ? false : saving}
            onClick={sessionExpired ? goToSignInForSave : handleSave}
            disabled={sessionExpired ? false : saving || justSaved}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              {sessionExpired ? (
                'Sign in to save your work'
              ) : saving ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid color-mix(in srgb, var(--text) 30%, transparent)',
                      borderTopColor: 'var(--text)',
                      animation: 'zlog-save-spin 0.7s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                  Preparing report…
                </>
              ) : (
                shareReady ? 'Report Ready — Share Now' : 'Save & Share'
              )}
            </span>
          </PrimaryCTA>
          {process.env.NODE_ENV !== 'production' ? <ShareTimingDiagPanel /> : null}
        </div>
        ) : null}
        <style>{`
          @keyframes zlog-save-spin {
            to { transform: rotate(360deg); }
          }
          @keyframes zlog-save-banner {
            0% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
            12% { opacity: 1; transform: translateX(-50%) translateY(0); }
            78% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          }
          .zlog-diary-save-share-action {
            padding-bottom: 0;
          }
          @media (max-width: 768px) {
            .zlog-diary-save-share-action {
              padding-bottom: calc(32px + max(env(safe-area-inset-bottom, 0px), 40px));
            }
          }
        `}</style>
      </form>

      {showRecentOnThisPage ? (
        <>
      <h2
        style={{
          ...typeTokens.sectionTitle,
          marginTop: 32,
          marginBottom: 12,
          color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
          fontSize: 16,
          letterSpacing: '0.072em',
        }}
      >
        Recent diary entries
      </h2>

      {recentDiaries.length === 0 ? (
        <div className={premiumDiaryEmptyClass}>
          <p className={premiumDiaryEmptyTitleClass}>No entries yet</p>
          <p className={premiumDiaryEmptyHintClass}>Save a diary report to see it listed here</p>
        </div>
      ) : (
        recentDiaries.map((d) => (
          <RecentEntryCard key={d.id} accent={REPORT_THEMES.diary.accent}>
            <div style={recentEntryDateStyle}>{project?.name || 'Project'}</div>
            <div style={recentEntrySummaryStyle}>
              {d.report_date
                ? new Date(`${d.report_date}T12:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </div>
            <div style={recentEntryActionsStyle}>
              <SecondaryButton
                type="button"
                onClick={() => {
                  const href = openExistingDiaryHref({
                    projectId,
                    reportId: d.id,
                    reportDate: d.report_date,
                  })
                  if (href) router.push(href)
                }}
                style={recentEntryActionButtonStyle}
              >
                View
              </SecondaryButton>
              <SecondaryButton
                type="button"
                disabled={startBusy}
                onClick={() => handleUseAsTemplate(d.id)}
                style={recentEntryActionButtonStyle}
              >
                Use as Basis for New Diary
              </SecondaryButton>
            </div>
          </RecentEntryCard>
        ))
      )}
        </>
      ) : null}
    </PremiumShell>
  )
}
