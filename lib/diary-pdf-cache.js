/**
 * Durable share-ready Site Diary PDF cache (IndexedDB).
 * Written after save/finalise prepare; reused on saved-diary Share when fingerprint matches.
 * TEMP companion to share/PDF performance work — does not change PDF appearance.
 */

export const SHARE_PDF_CACHE_DB_NAME = 'zlog-share-pdf-cache'
export const SHARE_PDF_CACHE_DB_VERSION = 2
const STORE = 'pdfs'
export const WORKER_ARTIFACT_STORE_NAME = 'workerArtifacts'

/**
 * Page-local open lifecycle. Callers never wait on a blocked upgrade.
 * UNOPENED — no ready database and no outstanding request.
 * OPENING — one shared IDBOpenDBRequest; callers wait on that request.
 * BLOCKED — that same request stays alive; further callers fail immediately.
 * OPEN — readyDatabase is reused and no new open is started.
 * FAILED — the request errored; the next caller may start one fresh open.
 * VERSIONCHANGE-CLOSED — this connection closed; only that database is dropped.
 * @type {IDBDatabase|null}
 */
let readyDatabase = null
/** @type {{ blocked: boolean, completed: boolean, abandoned: boolean, waiters: Array<{ resolve: (db: IDBDatabase) => void, reject: (err: Error) => void }> }|null} */
let activeOpen = null

/**
 * Additive upgrade. Creates the viewer store and the worker-artifact store
 * only when they are missing. Does not delete or recreate an existing database.
 * @param {IDBDatabase} db
 */
export function ensureSharePdfCacheStores(db) {
  if (!db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: 'reportId' })
  }
  if (!db.objectStoreNames.contains(WORKER_ARTIFACT_STORE_NAME)) {
    db.createObjectStore(WORKER_ARTIFACT_STORE_NAME, { keyPath: 'reportId' })
  }
}

/** Drop the page-local connection so the next open starts clean. */
export function resetSharePdfCacheConnection() {
  if (activeOpen) activeOpen.abandoned = true
  activeOpen = null
  readyDatabase = null
}

function releaseOwnedConnection(db) {
  try {
    db?.close?.()
  } catch {
    /* The connection may already be closing. */
  }
  if (db && readyDatabase === db) readyDatabase = null
}

function settleWaiters(waiters, action) {
  for (const waiter of waiters) {
    try {
      action(waiter)
    } catch {
      /* One waiter must not block the others. */
    }
  }
}

function bindVersionChange(db) {
  db.onversionchange = () => {
    releaseOwnedConnection(db)
  }
}

/**
 * One-shot open for an injected factory. A blocked open rejects.
 * A success that arrives after that rejection closes the connection
 * instead of handing it to a caller who already moved on.
 * @param {IDBFactory} idb
 * @param {number} [version]
 */
export function openSharePdfCacheDatabase(idb, version = SHARE_PDF_CACHE_DB_VERSION) {
  if (!idb || typeof idb.open !== 'function') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let request
    try {
      request = idb.open(SHARE_PDF_CACHE_DB_NAME, version)
    } catch (err) {
      reject(err instanceof Error ? err : new Error('IndexedDB open failed'))
      return
    }
    request.onerror = (event) => {
      event?.preventDefault?.()
      if (settled) return
      settled = true
      reject(request.error || new Error('IndexedDB open failed'))
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(new Error('IndexedDB blocked'))
    }
    request.onupgradeneeded = () => {
      ensureSharePdfCacheStores(request.result)
    }
    request.onsuccess = () => {
      const db = request.result
      if (!db) {
        if (!settled) {
          settled = true
          reject(new Error('IndexedDB open failed'))
        }
        return
      }
      bindVersionChange(db)
      if (settled) {
        try { db.close() } catch { /* already closed */ }
        return
      }
      settled = true
      resolve(db)
    }
  })
}

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (readyDatabase) return Promise.resolve(readyDatabase)
  if (activeOpen?.blocked) {
    return Promise.reject(new Error('IndexedDB blocked'))
  }
  if (activeOpen) {
    return new Promise((resolve, reject) => {
      activeOpen.waiters.push({ resolve, reject })
    })
  }

  const session = {
    blocked: false,
    completed: false,
    abandoned: false,
    waiters: [],
  }
  activeOpen = session
  const caller = new Promise((resolve, reject) => {
    session.waiters.push({ resolve, reject })
  })

  let request
  try {
    request = indexedDB.open(SHARE_PDF_CACHE_DB_NAME, SHARE_PDF_CACHE_DB_VERSION)
  } catch (err) {
    if (activeOpen === session) activeOpen = null
    session.completed = true
    settleWaiters(session.waiters.splice(0), (waiter) => {
      waiter.reject(err instanceof Error ? err : new Error('IndexedDB open failed'))
    })
    return caller
  }

  request.onupgradeneeded = () => {
    ensureSharePdfCacheStores(request.result)
  }
  request.onblocked = () => {
    if (session.abandoned || session.completed || session.blocked) return
    session.blocked = true
    settleWaiters(session.waiters.splice(0), (waiter) => {
      waiter.reject(new Error('IndexedDB blocked'))
    })
  }
  request.onerror = (event) => {
    event?.preventDefault?.()
    if (session.abandoned || session.completed) return
    session.completed = true
    if (activeOpen === session) activeOpen = null
    settleWaiters(session.waiters.splice(0), (waiter) => {
      waiter.reject(request.error || new Error('IndexedDB open failed'))
    })
  }
  request.onsuccess = () => {
    const db = request.result
    if (session.abandoned || session.completed) {
      try { db?.close?.() } catch { /* already closed */ }
      return
    }
    if (!db) {
      session.completed = true
      if (activeOpen === session) activeOpen = null
      settleWaiters(session.waiters.splice(0), (waiter) => {
        waiter.reject(new Error('IndexedDB open failed'))
      })
      return
    }
    session.completed = true
    bindVersionChange(db)
    readyDatabase = db
    if (activeOpen === session) activeOpen = null
    settleWaiters(session.waiters.splice(0), (waiter) => {
      waiter.resolve(db)
    })
  }

  return caller
}

/**
 * Stable fingerprint of PDF-relevant diary content.
 * When this changes, the cached PDF must not be reused.
 *
 * @param {{
 *   reportId?: string|null,
 *   reportDate?: string|null,
 *   updatedAt?: string|null,
 *   coverPhotoPath?: string|null,
 *   siteSummary?: string|null,
 *   weather?: string|null,
 *   shift?: string|null,
 *   photoAreas?: Array<{ photos?: Array<Record<string, unknown>> }>,
 *   photos?: Array<Record<string, unknown>>,
 * }} input
 */
export function buildSharePdfFingerprint(input = {}) {
  const photos = []
  if (Array.isArray(input.photoAreas)) {
    for (const area of input.photoAreas) {
      for (const photo of area?.photos || []) {
        photos.push(photo)
      }
    }
  } else if (Array.isArray(input.photos)) {
    photos.push(...input.photos)
  }

  const photoParts = photos.map((photo, index) => {
    const path =
      photo.storagePath
      || photo.url
      || photo.path
      || photo.storage_path
      || ''
    const rotation =
      photo.rotationDegrees
      ?? photo.rotation_degrees
      ?? photo.rotation
      ?? 0
    const caption = String(photo.caption || photo.acceptedDescription || '').trim()
    const sequence = photo.sequence_number ?? photo.sequence ?? photo.sequence_number ?? index
    return `${sequence}|${path}|${rotation}|${caption}`
  })

  return [
    String(input.reportId || ''),
    String(input.reportDate || ''),
    String(input.updatedAt || ''),
    String(input.coverPhotoPath || ''),
    String(input.siteSummary || '').trim(),
    String(input.weather || '').trim(),
    String(input.shift || '').trim(),
    String(photoParts.length),
    ...photoParts,
  ].join('::')
}

/**
 * Fingerprint from a saved-diary view model.
 * @param {Record<string, unknown>|null|undefined} view
 */
export function fingerprintFromSavedDiaryView(view) {
  if (!view) return ''
  return buildSharePdfFingerprint({
    reportId: view.reportId,
    reportDate: view.reportDate,
    updatedAt: view.updatedAt || view.updated_at || null,
    coverPhotoPath: view.coverPhotoPath || null,
    siteSummary: view.siteSummary || view.site_summary || '',
    weather: view.weather || '',
    shift: view.shift || '',
    photoAreas: view.photoAreas || [],
  })
}

/**
 * @param {{
 *   reportId: string,
 *   projectId?: string|null,
 *   fingerprint: string,
 *   blob: Blob,
 *   fileName?: string,
 *   title?: string,
 *   text?: string,
 * }} entry
 */
export async function storeShareReadyPdf(entry) {
  if (!entry?.reportId || !entry?.fingerprint || !entry?.blob) {
    return { ok: false, reason: 'invalid-entry' }
  }
  try {
    const db = await openDb()
    const record = {
      reportId: String(entry.reportId),
      projectId: entry.projectId ? String(entry.projectId) : null,
      fingerprint: String(entry.fingerprint),
      blob: entry.blob,
      fileName: entry.fileName || 'Zlog-Site-Diary.pdf',
      title: entry.title || 'Site Diary',
      text: entry.text || 'Site Diary',
      storedAt: Date.now(),
      byteLength: entry.blob.size || 0,
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'))
      tx.objectStore(STORE).put(record)
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) }
  }
}

/**
 * @param {string} reportId
 * @param {string} expectedFingerprint
 */
export async function loadShareReadyPdf(reportId, expectedFingerprint) {
  if (!reportId || !expectedFingerprint) {
    return { ok: false, reason: 'missing-key' }
  }
  try {
    const db = await openDb()
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(String(reportId))
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'))
    })
    if (!record?.blob) {
      return { ok: false, reason: 'miss' }
    }
    if (String(record.fingerprint) !== String(expectedFingerprint)) {
      return { ok: false, reason: 'stale', storedFingerprint: record.fingerprint }
    }
    const fileName = record.fileName || 'Zlog-Site-Diary.pdf'
    const file = new File([record.blob], fileName, { type: 'application/pdf' })
    return {
      ok: true,
      blob: record.blob,
      file,
      fileName,
      title: record.title || 'Site Diary',
      text: record.text || 'Site Diary',
      projectId: record.projectId || null,
      reportId: record.reportId,
      fingerprint: record.fingerprint,
      fromDurableCache: true,
    }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) }
  }
}

function normalizeCacheId(value) {
  return String(value || '').trim()
}

function workerArtifactMime(blob) {
  return String(blob?.type || '').trim().toLowerCase()
}

/**
 * A worker-artifact record is usable only for the signed-in user and the
 * authoritative export identity. Anything else is a cache miss.
 * @param {Record<string, unknown>|null|undefined} record
 * @param {{ reportId?: string, userId?: string, exportId?: string, contentFingerprint?: string }} expected
 */
export function assessWorkerReadyPdfRecord(record, expected = {}) {
  const reportId = normalizeCacheId(expected.reportId)
  const userId = normalizeCacheId(expected.userId)
  const exportId = normalizeCacheId(expected.exportId)
  const fingerprint = normalizeCacheId(expected.contentFingerprint).toLowerCase()
  if (!record || !reportId || !userId || !exportId || !fingerprint) {
    return { ok: false, reason: 'miss' }
  }
  if (normalizeCacheId(record.reportId) !== reportId) return { ok: false, reason: 'miss' }
  if (normalizeCacheId(record.userId) !== userId) return { ok: false, reason: 'miss' }
  if (normalizeCacheId(record.exportId) !== exportId) return { ok: false, reason: 'miss' }
  if (normalizeCacheId(record.contentFingerprint).toLowerCase() !== fingerprint) {
    return { ok: false, reason: 'miss' }
  }
  if (!(record.blob instanceof Blob) || record.blob.size <= 0) {
    return { ok: false, reason: 'miss' }
  }
  if (typeof record.byteLength === 'number' && record.byteLength !== record.blob.size) {
    return { ok: false, reason: 'miss' }
  }
  const mime = workerArtifactMime(record.blob)
  if (mime && !mime.startsWith('application/pdf')) {
    return { ok: false, reason: 'miss' }
  }
  return { ok: true }
}

/**
 * Do not replace a newer worker artifact for this report with an older download.
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {{ exportId?: string, reportId?: string, blob?: Blob }} incoming
 * @param {{ attemptStartedAt?: number, isStillCurrent?: boolean }} [options]
 */
export function shouldPersistWorkerArtifactRecord(existing, incoming, options = {}) {
  if (options.isStillCurrent === false) return false
  const exportId = normalizeCacheId(incoming?.exportId)
  const reportId = normalizeCacheId(incoming?.reportId)
  if (!exportId || !reportId || !(incoming?.blob instanceof Blob) || incoming.blob.size <= 0) {
    return false
  }
  if (existing && normalizeCacheId(existing.exportId) !== exportId) {
    const started = Number(options.attemptStartedAt) || 0
    const storedAt = Number(existing.storedAt) || 0
    if (storedAt > started) return false
  }
  return true
}

function requestStoreRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err instanceof Error ? err : new Error('IndexedDB read failed'))
    }
    const ok = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const tx = db.transaction(storeName, 'readonly')
      tx.onerror = () => fail(tx.error || new Error('IndexedDB read failed'))
      const req = tx.objectStore(storeName).get(String(key))
      req.onsuccess = () => ok(req.result || null)
      req.onerror = () => fail(req.error || new Error('IndexedDB read failed'))
    } catch (err) {
      fail(err)
    }
  })
}

/**
 * @param {{
 *   reportId?: string,
 *   userId?: string,
 *   exportId?: string,
 *   contentFingerprint?: string,
 * }} expected
 * @param {{ db?: IDBDatabase }} [options]
 */
export async function loadWorkerReadyPdfArtifact(expected = {}, options = {}) {
  try {
    const db = options.db || await openDb()
    const record = await requestStoreRecord(db, WORKER_ARTIFACT_STORE_NAME, expected.reportId)
    if (!assessWorkerReadyPdfRecord(record, expected).ok) {
      return { ok: false, reason: 'miss' }
    }
    const fileName = record.fileName || 'Zlog-Site-Diary.pdf'
    const file = new File([record.blob], fileName, { type: 'application/pdf' })
    return {
      ok: true,
      fromWorkerArtifactCache: true,
      blob: record.blob,
      file,
      fileName,
      reportId: normalizeCacheId(record.reportId),
      exportId: normalizeCacheId(record.exportId),
      contentFingerprint: normalizeCacheId(record.contentFingerprint).toLowerCase(),
      title: 'Site Diary',
      text: 'Site Diary',
    }
  } catch {
    return { ok: false, reason: 'miss' }
  }
}

/**
 * One worker artifact per report. A newer current export replaces the previous record.
 * @param {{
 *   reportId?: string,
 *   userId?: string,
 *   exportId?: string,
 *   contentFingerprint?: string,
 *   blob?: Blob,
 *   fileName?: string,
 * }} entry
 * @param {{ db?: IDBDatabase, attemptStartedAt?: number, isStillCurrent?: boolean|(() => boolean) }} [options]
 */
export async function storeWorkerReadyPdfArtifact(entry = {}, options = {}) {
  try {
    const blob = entry.blob
    const record = {
      reportId: normalizeCacheId(entry.reportId),
      userId: normalizeCacheId(entry.userId),
      exportId: normalizeCacheId(entry.exportId),
      contentFingerprint: normalizeCacheId(entry.contentFingerprint).toLowerCase(),
      blob,
      fileName: entry.fileName || 'Zlog-Site-Diary.pdf',
      storedAt: Date.now(),
      byteLength: blob instanceof Blob ? blob.size : 0,
    }
    const mime = blob instanceof Blob ? workerArtifactMime(blob) : 'invalid'
    if (
      !record.reportId
      || !record.userId
      || !record.exportId
      || !record.contentFingerprint
      || !(blob instanceof Blob)
      || blob.size <= 0
      || (mime && !mime.startsWith('application/pdf'))
    ) {
      return { ok: false, reason: 'invalid-entry' }
    }

    const stillCurrent = typeof options.isStillCurrent === 'function'
      ? options.isStillCurrent()
      : options.isStillCurrent
    if (stillCurrent === false) {
      return { ok: false, reason: 'stale' }
    }

    const db = options.db || await openDb()
    return await commitWorkerArtifactRecord(db, record, options)
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
}

/**
 * Read the current worker record and conditionally put it in the same
 * readwrite transaction. No await runs between that get and put.
 */
function commitWorkerArtifactRecord(db, record, options) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let tx
    try {
      tx = db.transaction(WORKER_ARTIFACT_STORE_NAME, 'readwrite')
    } catch {
      finish({ ok: false, reason: 'write-failed' })
      return
    }
    let outcome = { ok: false, reason: 'write-failed' }
    tx.oncomplete = () => finish(outcome)
    tx.onerror = () => finish({ ok: false, reason: 'write-failed' })
    tx.onabort = () => finish({ ok: false, reason: 'write-failed' })
    try {
      const req = tx.objectStore(WORKER_ARTIFACT_STORE_NAME).get(record.reportId)
      req.onerror = () => {
        outcome = { ok: false, reason: 'write-failed' }
        try {
          tx.abort?.()
        } catch {
          finish(outcome)
        }
      }
      req.onsuccess = () => {
        try {
          const stillCurrent = typeof options.isStillCurrent === 'function'
            ? options.isStillCurrent()
            : options.isStillCurrent
          if (!shouldPersistWorkerArtifactRecord(req.result || null, record, {
            attemptStartedAt: options.attemptStartedAt,
            isStillCurrent: stillCurrent,
          })) {
            outcome = { ok: false, reason: 'stale' }
            return
          }
          tx.objectStore(WORKER_ARTIFACT_STORE_NAME).put(record)
          outcome = { ok: true }
        } catch {
          outcome = { ok: false, reason: 'write-failed' }
          try {
            tx.abort?.()
          } catch {
            finish(outcome)
          }
        }
      }
    } catch {
      finish({ ok: false, reason: 'write-failed' })
    }
  })
}

/** @param {string} reportId */
export async function invalidateShareReadyPdf(reportId) {
  if (!reportId) return { ok: false }
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'))
      tx.objectStore(STORE).delete(String(reportId))
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) }
  }
}
