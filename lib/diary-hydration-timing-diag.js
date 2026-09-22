/**
 * TEMPORARY — Saved / workbench Site Diary hydration timing (baseline measurement only).
 * Safe counts and elapsed ms from a single load start. Never logs signed URLs or secrets.
 */

import { emitShareDiag } from './share-diag-beacon.js'

export const DIARY_HYDRATION_STAGE = {
  H0: 'H0-load-start',
  H1: 'H1-core-report-project-ready',
  H2: 'H2-photo-metadata-ready',
  H3: 'H3-photo-signing-start',
  H4: 'H4-photo-signing-complete',
  H5: 'H5-photo-sources-committed',
  H6: 'H6-first-work-photo-image-loaded',
  H7: 'H7-all-visible-work-photos-loaded',
  H8: 'H8-cover-source-available',
  H9: 'H9-cover-image-loaded',
  H10: 'H10-signature-source-available',
  H11: 'H11-signature-image-loaded',
  H12: 'H12-hydration-interactive-complete',
}

/** @type {DiaryHydrationTimingSession | null} */
let activeSession = null

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function safePathTail(path) {
  const s = String(path || '').trim()
  if (!s) return null
  const parts = s.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'path'
}

/**
 * @param {{
 *   surface: string,
 *   reportId?: string|null,
 *   projectId?: string|null,
 *   mode?: string|null,
 *   progressiveCompose?: boolean,
 *   progressiveEdit?: boolean,
 * }} opts
 */
export function beginDiaryHydrationTiming(opts = {}) {
  const session = createDiaryHydrationTimingSession(opts)
  if (activeSession && activeSession.id !== session.id) {
    activeSession.end('superseded')
  }
  activeSession = session
  session.mark(DIARY_HYDRATION_STAGE.H0, {
    surface: opts.surface || 'unknown',
    reportId: opts.reportId || null,
    projectId: opts.projectId || null,
    mode: opts.mode || null,
    progressiveCompose: opts.progressiveCompose === true,
    progressiveEdit: opts.progressiveEdit === true,
  })
  return session
}

export function getActiveDiaryHydrationTimingSession() {
  return activeSession
}

function createDiaryHydrationTimingSession(opts) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const startedAt = nowMs()
  const marks = []
  let signingPass = 0
  let workPhotoLoads = 0
  let workPhotoExpected = 0
  let firstWorkPhotoAt = null

  const mark = (stage, detail = {}) => {
    const at = nowMs()
    const entry = {
      stage,
      elapsedMs: Math.round(at - startedAt),
      ...detail,
    }
    marks.push(entry)
    const payload = {
      hydrationSessionId: id,
      surface: opts.surface || 'unknown',
      reportId: opts.reportId || null,
      projectId: opts.projectId || null,
      mode: opts.mode || null,
      ...entry,
    }
    console.info('[zlog:hydration-timing]', stage, payload)
    if (typeof window !== 'undefined') {
      emitShareDiag(stage, payload)
    }
    return entry
  }

  const end = (reason = 'complete') => {
    if (activeSession?.id === id) {
      activeSession = null
    }
    mark('hydration-session-end', { reason, markCount: marks.length })
  }

  const notePhotoSigningStart = (detail = {}) => {
    signingPass += 1
    mark(DIARY_HYDRATION_STAGE.H3, { signingPass, ...detail })
  }

  const notePhotoSigningComplete = (detail = {}) => {
    mark(DIARY_HYDRATION_STAGE.H4, { signingPass, ...detail })
  }

  const noteWorkPhotoExpected = (count) => {
    const n = Number(count) || 0
    workPhotoExpected = Math.max(workPhotoExpected, n)
  }

  const noteWorkPhotoImageLoaded = ({ visibleIndex = null } = {}) => {
    workPhotoLoads += 1
    if (firstWorkPhotoAt == null) {
      firstWorkPhotoAt = nowMs()
      mark(DIARY_HYDRATION_STAGE.H6, {
        visibleIndex,
        loadedCount: workPhotoLoads,
        expectedVisible: workPhotoExpected || null,
      })
    }
    if (workPhotoExpected > 0 && workPhotoLoads >= workPhotoExpected) {
      mark(DIARY_HYDRATION_STAGE.H7, {
        loadedCount: workPhotoLoads,
        expectedVisible: workPhotoExpected,
      })
    }
  }

  return {
    id,
    mark,
    end,
    notePhotoSigningStart,
    notePhotoSigningComplete,
    noteWorkPhotoExpected,
    noteWorkPhotoImageLoaded,
  }
}

/** @typedef {ReturnType<typeof createDiaryHydrationTimingSession>} DiaryHydrationTimingSession */

export function markDiaryHydrationTiming(stage, detail = {}) {
  if (!activeSession) return null
  return activeSession.mark(stage, detail)
}

export function endDiaryHydrationTiming(reason = 'complete') {
  if (!activeSession) return
  activeSession.end(reason)
}

/**
 * Build safe signing summary for H4 (no URLs).
 * @param {object} collected from collectGridDisplayPaths
 * @param {object} stats from photo display sign session
 */
export function diaryHydrationSigningSummary({
  collected = {},
  stats = {},
  durationMs = null,
  reportFallbackPaths = 0,
} = {}) {
  return {
    totalPhotoRows: collected.totalPhotoRows ?? null,
    pipelineV1Count: collected.thumbPathCount ?? null,
    legacyCount: collected.legacyPathCount ?? null,
    gridDisplayPaths: collected.paths?.length ?? null,
    thumbPathsRequested: collected.thumbPathCount ?? null,
    reportAssetsInGridBatch: collected.reportPathsInBatch ?? null,
    signingBatchApiCalls: stats.batchApiCalls ?? null,
    signingSingleApiCalls: stats.singleApiCalls ?? null,
    urlsReturned: collected.urlsReturned ?? null,
    reportFallbackPaths,
    signingDurationMs: durationMs != null ? Math.round(durationMs) : null,
  }
}

export function countPipelinePhotos(rows = []) {
  let pipelineV1 = 0
  let legacy = 0
  for (const row of rows || []) {
    const thumb = String(row.thumbnail_path || row.thumbnailPath || '').trim()
    if (thumb) pipelineV1 += 1
    else legacy += 1
  }
  return {
    totalPhotoRows: (rows || []).length,
    pipelineV1Count: pipelineV1,
    legacyCount: legacy,
  }
}

export { safePathTail }
