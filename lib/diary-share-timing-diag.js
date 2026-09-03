/**
 * TEMPORARY — Save & Share Android timing collector.
 * In-memory + dev UI only. No extra DB / storage / auth / analytics.
 * Remove after Android timing runs are complete.
 */

let run = null
/** Stable `null` when idle — `Object.is` safe for useSyncExternalStore. */
const NO_RUN_SNAPSHOT = null
let currentSnapshot = NO_RUN_SNAPSHOT
const listeners = new Set()

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* diagnostic listeners must never affect Share */
    }
  })
}

/**
 * Replace the cached snapshot, then notify. Reads must never call this.
 * Nested marks/counts are copied so later mutations do not mutate published refs.
 */
function commitSnapshotAndNotify() {
  if (!run) {
    currentSnapshot = NO_RUN_SNAPSHOT
  } else {
    currentSnapshot = {
      runId: run.runId,
      t0: run.t0,
      marks: { ...run.marks },
      counts: { ...run.counts },
    }
  }
  notify()
}

function makeRunId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null
  if (c?.randomUUID) return c.randomUUID()
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const EMPTY_COUNTS = {
  reportId: null,
  photoCount: 0,
  newUploadCount: 0,
  durablePhotoCount: 0,
  overlayUploadCount: 0,
  coverUploadNeeded: false,
  signatureUploadNeeded: false,
  unsavedAreaCommitted: false,
  pdfPhotoCount: 0,
  photoSignCount: 0,
  photoSignPathCount: 0,
  photoSignBatchRequestCount: 0,
  photoIndividualSignRequestCount: 0,
  photoFetchBakeCount: 0,
  photoPrepareCount: 0,
  photoNetworkFetchCount: 0,
  pdfLocalBlobSourceCount: 0,
  pdfNetworkSourceCount: 0,
  photoBakeCount: 0,
  photoPassThroughCount: 0,
  photoCacheHitCount: 0,
  pdfSignAccumMs: 0,
  pdfFetchAccumMs: 0,
  pdfBakeAccumMs: 0,
  pdfLocalBakeAccumMs: 0,
  photoUpdateCallCount: 0,
  photoInsertCount: 0,
  photoDeleteCount: 0,
  fromPdfCache: false,
  coverPreparedSource: null,
  coverNetworkFetchCount: 0,
  coverOrientationBakeCount: 0,
  coverPassThroughCount: 0,
}

/**
 * Start a first-tap timing run. Same runId / t0 until the next first tap.
 * @param {Record<string, unknown>} [meta]
 */
export function startShareTimingRun(meta = {}) {
  run = {
    runId: makeRunId(),
    t0: nowMs(),
    marks: {},
    counts: { ...EMPTY_COUNTS, ...meta, fromPdfCache: meta.fromPdfCache === true },
  }
  commitSnapshotAndNotify()
  return run.runId
}

/**
 * Record a named checkpoint as milliseconds elapsed from first-tap t0.
 * No-op when no run is active (production never starts a run).
 * @param {string} name
 * @param {Record<string, unknown>} [extra]
 */
export function markShareTiming(name, extra = {}) {
  if (!run || !name) return
  const elapsedMs = Math.max(0, Math.round(nowMs() - run.t0))
  run.marks[name] = elapsedMs
  if (extra && Object.keys(extra).length > 0) {
    Object.assign(run.counts, extra)
  }
  commitSnapshotAndNotify()
}

/**
 * Merge count fields onto the active run.
 * @param {Record<string, unknown>} patch
 */
export function patchShareTimingCounts(patch = {}) {
  if (!run) return
  if (!patch || Object.keys(patch).length === 0) return
  Object.assign(run.counts, patch)
  commitSnapshotAndNotify()
}

/**
 * Increment a numeric count. No-op without an active run.
 * @param {string} key
 * @param {number} [by]
 */
export function bumpShareTimingCount(key, by = 1) {
  if (!run || !key) return
  const current = Number(run.counts[key]) || 0
  run.counts[key] = current + by
  commitSnapshotAndNotify()
}

/** Clock for wrapping existing awaits. No-op consumers ignore this when no run. */
export function shareTimingNow() {
  return nowMs()
}

/**
 * Add milliseconds to an accumulated counter without notifying.
 * Used so per-photo work does not refresh the Android panel 19 times.
 * @param {string} key
 * @param {number} durationMs
 */
export function accumulateShareTimingMs(key, durationMs) {
  if (!run || !key) return
  const add = Math.max(0, Math.round(Number(durationMs) || 0))
  run.counts[key] = (Number(run.counts[key]) || 0) + add
}

/**
 * Increment a count without notifying (aggregate, then flush).
 * @param {string} key
 * @param {number} [by]
 */
export function bumpShareTimingCountSilent(key, by = 1) {
  if (!run || !key) return
  run.counts[key] = (Number(run.counts[key]) || 0) + by
}

/** Publish silent accumulators to the cached snapshot and notify once. */
export function flushShareTimingSnapshot() {
  if (!run) return
  commitSnapshotAndNotify()
}

/**
 * Cached snapshot for useSyncExternalStore.
 * Same object reference until a diagnostic mutation commits a replacement.
 * @returns {object|null}
 */
export function getShareTimingSnapshot() {
  return currentSnapshot
}

/** @param {() => void} fn */
export function subscribeShareTiming(fn) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Exclusive milliseconds between two marks, or null. */
export function exclusiveMs(marks, fromName, toName) {
  const from = marks?.[fromName]
  const to = marks?.[toName]
  if (from == null || to == null) return null
  return to - from
}

/** Wall of one named stage (start→done), even when that stage overlapped other work. */
function overlappedWall(marks, fromName, toName) {
  const to = marks?.[toName]
  if (to == null) return '—'
  const wall = exclusiveMs(marks, fromName, toName)
  if (wall == null) return `${to} ms elapsed`
  return `${wall} ms wall (${to} ms elapsed)`
}

function fmtSeg(marks, fromName, toName) {
  const to = marks?.[toName]
  if (to == null) return '—'
  const exclusive = exclusiveMs(marks, fromName, toName)
  if (exclusive == null) return `${to} ms elapsed`
  return `${exclusive} ms exclusive (${to} ms elapsed)`
}

function yn(value) {
  return value ? 'yes' : 'no'
}

/**
 * Compact lines for the Android diagnostic panel.
 * @param {ReturnType<typeof getShareTimingSnapshot>} snap
 * @returns {string[]}
 */
export function formatShareTimingLines(snap) {
  if (!snap) {
    return ['No run yet. Tap Save & Share.']
  }
  const m = snap.marks || {}
  const c = snap.counts || {}
  const lines = [
    `runId ${snap.runId}`,
    `reportId ${c.reportId || '—'}`,
    m.file_ready != null ? `Total Tap 1: ${m.file_ready} ms` : 'Tap 1 in progress…',
    `Autosave: ${fmtSeg(m, 'tap', 'autosave_flush_done')}`,
    `Area flush: ${fmtSeg(m, 'autosave_flush_done', 'area_flush_done')}`,
    `Auth: ${fmtSeg(m, 'area_flush_done', 'auth_done')}`,
    `Cover/signature: ${fmtSeg(m, 'auth_done', 'cover_signature_done')}`,
    `Photo persistence: ${fmtSeg(m, 'cover_signature_done', 'photo_persist_done')}`,
    `Finalize save: ${fmtSeg(m, 'photo_persist_done', 'finalize_done')}`,
    'Finalize:',
    `Report row: ${fmtSeg(m, 'finalize_report_start', 'finalize_report_done')}`,
    `  auth: ${fmtSeg(m, 'finalize_report_start', 'finalize_report_auth_done')}`,
    `  SELECT before: ${fmtSeg(m, 'finalize_report_auth_done', 'finalize_report_select_before_done')}`,
    `  UPDATE: ${fmtSeg(m, 'finalize_report_select_before_done', 'finalize_report_update_done')}`,
    `  SELECT verify: ${fmtSeg(m, 'finalize_report_update_done', 'finalize_report_select_verify_done')}`,
    `Labour: ${fmtSeg(m, 'finalize_labour_start', 'finalize_labour_done')}`,
    `Plant: ${fmtSeg(m, 'finalize_plant_start', 'finalize_plant_done')}`,
    `Labour+plant barrier: ${fmtSeg(m, 'finalize_labour_plant_start', 'finalize_labour_plant_done')}`,
    `Photo reconcile: ${fmtSeg(m, 'finalize_photos_start', 'finalize_photos_done')}`,
    `  LIST: ${fmtSeg(m, 'finalize_photos_start', 'finalize_photos_list_done')}`,
    `  delete extras: ${fmtSeg(m, 'finalize_photos_list_done', 'finalize_photos_delete_done')}`,
    `  UPDATE ${Number(c.photoUpdateCallCount) || 0} rows: ${fmtSeg(m, 'finalize_photos_update_start', 'finalize_photos_update_done')}`,
    `  INSERT ${Number(c.photoInsertCount) || 0} rows: ${fmtSeg(m, 'finalize_photos_insert_start', 'finalize_photos_insert_done')}`,
    `PDF queries: ${fmtSeg(m, 'finalize_done', 'pdf_queries_done')}`,
    `  report query @ ${m.pdf_report_query_done ?? '—'} ms`,
    `  photos query @ ${m.pdf_photos_query_done ?? '—'} ms`,
    `  labour query @ ${m.pdf_labour_query_done ?? '—'} ms`,
    `PDF photo sign/fetch/bake: ${fmtSeg(m, 'pdf_queries_done', 'pdf_photo_sign_fetch_bake_done')}`,
    'PDF photos:',
    `Total wall: ${fmtSeg(m, 'pdf_photos_prep_start', 'pdf_photo_sign_fetch_bake_done')}`,
    `Signing: ${Number(c.pdfSignAccumMs) || 0} ms (batch source resolution)`,
    `Local-source decode/bake: ${Number(c.pdfLocalBakeAccumMs) || 0} ms accumulated`,
    `Fetching: ${Number(c.pdfFetchAccumMs) || 0} ms accumulated (network; conc=6 overlap)`,
    `Decode/bake: ${Number(c.pdfBakeAccumMs) || 0} ms accumulated (not wall; conc=6 overlap)`,
    `pdfPhotoCount ${Number(c.pdfPhotoCount) || 0}`,
    `pdfLocalBlobSourceCount ${Number(c.pdfLocalBlobSourceCount) || 0}`,
    `pdfNetworkSourceCount ${Number(c.pdfNetworkSourceCount) || 0}`,
    `photoSignPathCount ${Number(c.photoSignPathCount) || 0}`,
    `photoSignBatchRequestCount ${Number(c.photoSignBatchRequestCount) || 0}`,
    `photoIndividualSignRequestCount ${Number(c.photoIndividualSignRequestCount) || 0}`,
    `photoPrepareCount ${Number(c.photoPrepareCount) || 0}`,
    `photoNetworkFetchCount ${Number(c.photoNetworkFetchCount) || 0}`,
    `photoFetchBakeCount ${Number(c.photoFetchBakeCount) || 0}`,
    `photoPassThroughCount ${Number(c.photoPassThroughCount) || 0}`,
    `${Number(c.pdfPhotoCount) || 0} photos / ${Number(c.pdfLocalBlobSourceCount) || 0} local / ${Number(c.pdfNetworkSourceCount) || 0} network / ${Number(c.photoSignPathCount) || 0} sign paths / ${Number(c.photoSignBatchRequestCount) || 0} batch / ${Number(c.photoIndividualSignRequestCount) || 0} individual / ${Number(c.photoBakeCount) || 0} bakes / ${Number(c.photoPassThroughCount) || 0} pass-through / ${Number(c.photoCacheHitCount) || 0} cache hits`,
    `Branding wall: ${overlappedWall(m, 'pdf_branding_start', 'pdf_branding_query_done')} (overlapped)`,
    `PDF asset + cover wall: ${overlappedWall(m, 'pdf_asset_prep_start', m.pdf_cover_source_done != null ? 'pdf_cover_source_done' : 'pdf_cover_bake_done')} (overlapped)`,
    `  branding start @ ${m.pdf_branding_start ?? '—'} ms`,
    `  branding done @ ${m.pdf_branding_query_done ?? '—'} ms`,
    `  asset prep start @ ${m.pdf_asset_prep_start ?? '—'} ms`,
    `  asset sign @ ${m.pdf_asset_sign_done ?? '—'} ms`,
    `  cover bake @ ${m.pdf_cover_bake_done ?? '—'} ms`,
    `  cover PDF source @ ${m.pdf_cover_source_done ?? '—'} ms`,
    `  cover prepare start @ ${m.cover_prepare_start ?? '—'} ms`,
    `  cover persist @ ${m.cover_persist_done ?? '—'} ms`,
    `coverPreparedSource ${c.coverPreparedSource || '—'}`,
    `coverNetworkFetchCount ${Number(c.coverNetworkFetchCount) || 0}`,
    `coverOrientationBakeCount ${Number(c.coverOrientationBakeCount) || 0}`,
    `coverPassThroughCount ${Number(c.coverPassThroughCount) || 0}`,
    `Cover PDF source: ${overlappedWall(m, 'pdf_cover_source_start', 'pdf_cover_source_done')}`,
    `  project_reference @ ${m.pdf_project_reference_done ?? '—'} ms`,
    `PDF toBlob: ${fmtSeg(m, 'pdf_toBlob_start', 'pdf_toBlob_done')}`,
    `File ready: ${m.file_ready != null ? `${m.file_ready} ms elapsed` : '—'}`,
    '',
    'Photos:',
    `${Number(c.photoCount) || 0} total`,
    `${Number(c.newUploadCount) || 0} new uploads`,
    `${Number(c.durablePhotoCount) || 0} durable`,
    `overlay uploads: ${Number(c.overlayUploadCount) || 0}`,
    `coverUploadNeeded ${yn(c.coverUploadNeeded)}`,
    `signatureUploadNeeded ${yn(c.signatureUploadNeeded)}`,
    `unsavedAreaCommitted ${yn(c.unsavedAreaCommitted)}`,
    `pdfPhotoCount ${Number(c.pdfPhotoCount) || 0}`,
    `pdfLocalBlobSourceCount ${Number(c.pdfLocalBlobSourceCount) || 0}`,
    `pdfNetworkSourceCount ${Number(c.pdfNetworkSourceCount) || 0}`,
    `photoSignPathCount ${Number(c.photoSignPathCount) || 0}`,
    `photoSignBatchRequestCount ${Number(c.photoSignBatchRequestCount) || 0}`,
    `photoIndividualSignRequestCount ${Number(c.photoIndividualSignRequestCount) || 0}`,
    `photoPrepareCount ${Number(c.photoPrepareCount) || 0}`,
    `photoNetworkFetchCount ${Number(c.photoNetworkFetchCount) || 0}`,
    `photoFetchBakeCount ${Number(c.photoFetchBakeCount) || 0}`,
    `photoPassThroughCount ${Number(c.photoPassThroughCount) || 0}`,
    `fromPdfCache ${c.fromPdfCache === true ? 'true' : 'false'}`,
  ]

  if (m.share_now_tap != null) {
    lines.push('')
    if (m.navigator_share_called != null) {
      lines.push(
        `Share Now tap → navigator.share called: ${fmtSeg(m, 'share_now_tap', 'navigator_share_called')}`,
      )
    }
    if (m.navigator_share_resolved != null) {
      lines.push(
        `Native share duration: ${fmtSeg(m, 'navigator_share_called', 'navigator_share_resolved')}`,
      )
    }
    if (m.download_fallback_called != null) {
      lines.push(
        `Download fallback called: ${m.download_fallback_called} ms elapsed from first tap`,
      )
    }
  }

  lines.push('')
  lines.push('Exclusive = adjacent checkpoint delta. Branding / PDF asset + cover walls are overlapped, not exclusive adjacent time.')
  return lines
}
