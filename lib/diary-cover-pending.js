/**
 * Phase F2B — durable pending cover handoff (IndexedDB).
 *
 * Local Blob durability only until canonical upload + daily_reports.cover_photo_url
 * succeed. Not a general offline framework.
 *
 * Never stores signed URLs, auth tokens, or diary content.
 */

import {
  bestEffortRemoveCoverObject,
  uploadRawCoverFallbackFile,
} from './diary-cover-photo.js'

export const COVER_PENDING_DB_NAME = 'zlog-cover-pending'
export const COVER_PENDING_DB_VERSION = 1
export const COVER_PENDING_STORE = 'pending'

/**
 * @returns {string}
 */
export function newCoverPendingGeneration() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * In-memory store for Node tests (same surface as IndexedDB adapter).
 * @returns {{
 *   put: (reportId: string, record: object) => Promise<{ ok: boolean, error?: unknown }>,
 *   get: (reportId: string) => Promise<object|null>,
 *   delete: (reportId: string) => Promise<{ ok: boolean, error?: unknown }>,
 *   _map: Map<string, object>,
 * }}
 */
export function createMemoryCoverPendingStore() {
  /** @type {Map<string, object>} */
  const map = new Map()
  return {
    _map: map,
    async put(reportId, record) {
      const id = String(reportId || '').trim()
      if (!id || !record) return { ok: false, error: { message: 'missing-args' } }
      map.set(id, { ...record, reportId: id })
      return { ok: true }
    },
    async get(reportId) {
      const id = String(reportId || '').trim()
      if (!id) return null
      return map.has(id) ? map.get(id) : null
    },
    async delete(reportId) {
      const id = String(reportId || '').trim()
      if (!id) return { ok: false, error: { message: 'missing-args' } }
      map.delete(id)
      return { ok: true }
    },
  }
}

function openPendingDb(idbFactory) {
  return new Promise((resolve, reject) => {
    const req = idbFactory.open(COVER_PENDING_DB_NAME, COVER_PENDING_DB_VERSION)
    req.onerror = () => reject(req.error || new Error('idb-open-failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(COVER_PENDING_STORE)) {
        db.createObjectStore(COVER_PENDING_STORE, { keyPath: 'reportId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('idb-request-failed'))
  })
}

/**
 * @param {IDBFactory} [indexedDBImpl]
 */
export function createIndexedDbCoverPendingStore(indexedDBImpl) {
  const idb = indexedDBImpl
    || (typeof globalThis !== 'undefined' && globalThis.indexedDB
      ? globalThis.indexedDB
      : null)

  return {
    async put(reportId, record) {
      const id = String(reportId || '').trim()
      if (!id || !record) return { ok: false, error: { message: 'missing-args' } }
      if (!idb) return { ok: false, error: { message: 'indexeddb-unavailable' } }
      let db
      try {
        db = await openPendingDb(idb)
        const tx = db.transaction(COVER_PENDING_STORE, 'readwrite')
        await idbRequest(tx.objectStore(COVER_PENDING_STORE).put({ ...record, reportId: id }))
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('idb-tx-aborted'))
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error }
      } finally {
        try {
          db?.close()
        } catch {
          /* ignore */
        }
      }
    },
    async get(reportId) {
      const id = String(reportId || '').trim()
      if (!id || !idb) return null
      let db
      try {
        db = await openPendingDb(idb)
        const tx = db.transaction(COVER_PENDING_STORE, 'readonly')
        return (await idbRequest(tx.objectStore(COVER_PENDING_STORE).get(id))) || null
      } catch {
        return null
      } finally {
        try {
          db?.close()
        } catch {
          /* ignore */
        }
      }
    },
    async delete(reportId) {
      const id = String(reportId || '').trim()
      if (!id) return { ok: false, error: { message: 'missing-args' } }
      if (!idb) return { ok: false, error: { message: 'indexeddb-unavailable' } }
      let db
      try {
        db = await openPendingDb(idb)
        const tx = db.transaction(COVER_PENDING_STORE, 'readwrite')
        await idbRequest(tx.objectStore(COVER_PENDING_STORE).delete(id))
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('idb-tx-aborted'))
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error }
      } finally {
        try {
          db?.close()
        } catch {
          /* ignore */
        }
      }
    },
  }
}

/** @type {ReturnType<typeof createIndexedDbCoverPendingStore>|null} */
let defaultStore = null

function getDefaultStore() {
  if (!defaultStore) {
    defaultStore = createIndexedDbCoverPendingStore()
  }
  return defaultStore
}

/**
 * @param {object} [store]
 */
export function setCoverPendingStoreForTests(store) {
  defaultStore = store || null
}

/**
 * Persist a pending cover Blob for a report. Overwrites any prior pending row.
 *
 * @param {string} reportId
 * @param {{
 *   blob: Blob,
 *   mimeType?: string|null,
 *   fileName?: string|null,
 *   generation?: string|null,
 * }} args
 * @param {object} [store]
 * @returns {Promise<{ ok: boolean, generation?: string, error?: unknown }>}
 */
export async function putPendingCover(reportId, args = {}, store = getDefaultStore()) {
  const id = String(reportId || '').trim()
  const blob = args.blob
  if (!id || !(blob instanceof Blob) || blob.size < 1) {
    return { ok: false, error: { message: 'missing-pending-cover' } }
  }
  const generation = String(args.generation || newCoverPendingGeneration())
  const mimeType = String(args.mimeType || blob.type || 'image/jpeg')
  const fileName = args.fileName != null ? String(args.fileName).slice(0, 120) : 'cover.jpg'
  const record = {
    reportId: id,
    blob,
    rawBlob: blob,
    preparedBlob: args.preparedBlob instanceof Blob ? args.preparedBlob : null,
    mimeType,
    fileName,
    generation,
    createdAt: Date.now(),
    removed: false,
  }
  try {
    const result = await store.put(id, record)
    if (!result?.ok) return { ok: false, error: result?.error || { message: 'idb-put-failed' } }
    return { ok: true, generation }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * @param {string} reportId
 * @param {object} [store]
 */
export async function getPendingCover(reportId, store = getDefaultStore()) {
  try {
    const row = await store.get(reportId)
    if (!row || row.removed) return row?.removed ? { ...row, blob: null } : null
    return row
  } catch {
    return null
  }
}

/**
 * @param {string} reportId
 * @param {object} [store]
 */
export async function deletePendingCover(reportId, store = getDefaultStore()) {
  try {
    return await store.delete(reportId)
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Tombstone so in-flight uploads for this report must not restore a cover.
 * @param {string} reportId
 * @param {object} [store]
 */
export async function markPendingCoverRemoved(reportId, store = getDefaultStore()) {
  const id = String(reportId || '').trim()
  if (!id) return { ok: false, error: { message: 'missing-args' }, generation: null }
  const generation = newCoverPendingGeneration()
  try {
    const result = await store.put(id, {
      reportId: id,
      blob: null,
      mimeType: null,
      fileName: null,
      generation,
      createdAt: Date.now(),
      removed: true,
    })
    if (!result?.ok) {
      return { ok: false, error: result?.error || { message: 'idb-put-failed' }, generation: null }
    }
    return { ok: true, generation }
  } catch (error) {
    return { ok: false, error, generation: null }
  }
}

/**
 * True when a background upload may still commit for this generation.
 * @param {object|null|undefined} pending
 * @param {string} generation
 */
export function isPendingCoverGenerationCurrent(pending, generation) {
  if (!pending || !generation) return false
  if (pending.removed) return false
  return String(pending.generation) === String(generation)
}

/**
 * Persist prepared JPEG bytes onto the current pending row when generation matches.
 * @param {string} reportId
 * @param {string} generation
 * @param {Blob} preparedBlob
 * @param {object} [store]
 */
export async function mergePreparedCoverIntoPending(reportId, generation, preparedBlob, store = getDefaultStore()) {
  const id = String(reportId || '').trim()
  if (!id || !generation || !(preparedBlob instanceof Blob) || preparedBlob.size < 1) {
    return { ok: false, error: { message: 'missing-prepared-blob' } }
  }
  const row = await store.get(id)
  if (!isPendingCoverGenerationCurrent(row, generation)) {
    return { ok: false, error: { message: 'stale-generation' } }
  }
  try {
    const result = await store.put(id, {
      ...row,
      preparedBlob,
      mimeType: 'image/jpeg',
    })
    if (!result?.ok) return { ok: false, error: result?.error || { message: 'idb-put-failed' } }
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Raw source bytes for (re)preparation — always the original user selection.
 * @param {object|null|undefined} pending
 * @returns {Blob|null}
 */
export function rawBlobFromPendingCover(pending) {
  if (!pending || pending.removed) return null
  const raw = pending.rawBlob || pending.blob
  return raw instanceof Blob && raw.size > 0 ? raw : null
}

/**
 * Build a File suitable for upload from a pending record (raw user selection only).
 * Prepared bytes are dormant until a future Worker pipeline — never used in production sync.
 * @param {object} pending
 * @returns {File|Blob|null}
 */
export function fileFromPendingCover(pending) {
  const blob = rawBlobFromPendingCover(pending)
  if (!(blob instanceof Blob) || blob.size < 1) return null
  const name = pending?.fileName || 'cover.jpg'
  const type = pending?.mimeType || blob.type || 'image/jpeg'
  try {
    return new File([blob], name, { type })
  } catch {
    return blob
  }
}

/**
 * Upload pending raw cover to immutable storage + DB when generation is still current.
 *
 * Option D: upload-only — no decode/canvas/JPEG preparation on any thread.
 * cover_processing_version is always NULL until a future Worker pipeline ships.
 *
 * @param {object} supabase
 * @param {{
 *   userId: string,
 *   reportId: string,
 *   generation: string,
 *   priorCoverPath?: string|null,
 *   uploadRawFn?: Function,
 *   updateCoverRecord?: (args: {
 *     storagePath: string,
 *     coverProcessingVersion: string|null,
 *   }) => Promise<void>,
 *   updateCoverUrl?: (storagePath: string) => Promise<void>,
 *   store?: object,
 *   onPerf?: (stage: string, detail?: object) => void,
 * }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   storagePath?: string|null,
 *   coverProcessingVersion?: string|null,
 *   prepared?: boolean,
 * }>}
 */
export async function syncPendingCoverUpload(supabase, args = {}) {
  const {
    userId,
    reportId,
    generation,
    priorCoverPath = null,
    uploadRawFn,
    updateCoverRecord,
    updateCoverUrl,
    store = getDefaultStore(),
    onPerf,
  } = args

  const mark = (stage, detail) => {
    try {
      onPerf?.(stage, detail)
    } catch {
      /* diagnostic only */
    }
  }

  if (!userId || !reportId || !generation) {
    return { ok: false, reason: 'missing-args' }
  }

  mark('resume_start', { reportId: String(reportId).slice(0, 36) })

  const pending = await getPendingCover(reportId, store)
  if (!isPendingCoverGenerationCurrent(pending, generation)) {
    mark('complete', { ok: false, reason: 'stale-or-removed' })
    return { ok: false, reason: 'stale-or-removed' }
  }

  const uploadFile = fileFromPendingCover(pending)
  if (!uploadFile) {
    mark('complete', { ok: false, reason: 'missing-blob' })
    return { ok: false, reason: 'missing-blob' }
  }

  const uploadRaw = uploadRawFn || uploadRawCoverFallbackFile

  mark('cover_upload_start')
  let storagePath = null
  try {
    const up = await uploadRaw(supabase, { userId, reportId, generation, file: uploadFile })
    if (up.error || !up.storagePath) {
      mark('cover_upload_end', { ok: false })
      mark('complete', { ok: false, reason: 'upload-failed' })
      return { ok: false, reason: 'upload-failed', storagePath: null }
    }
    storagePath = up.storagePath
    mark('cover_upload_end', { ok: true, prepared: false })
  } catch {
    mark('cover_upload_end', { ok: false })
    mark('complete', { ok: false, reason: 'upload-failed' })
    return { ok: false, reason: 'upload-failed', storagePath: null }
  }

  const still = await getPendingCover(reportId, store)
  if (!isPendingCoverGenerationCurrent(still, generation)) {
    mark('complete', { ok: false, reason: 'stale-after-upload' })
    return { ok: false, reason: 'stale-after-upload', storagePath }
  }

  mark('db_update_start')
  try {
    if (typeof updateCoverRecord === 'function') {
      await updateCoverRecord({
        storagePath,
        coverProcessingVersion: null,
      })
    } else if (typeof updateCoverUrl === 'function') {
      await updateCoverUrl(storagePath)
    } else {
      mark('db_update_end', { ok: false })
      mark('complete', { ok: false, reason: 'missing-db-updater' })
      return { ok: false, reason: 'missing-db-updater', storagePath }
    }
    mark('db_update_end', { ok: true })
  } catch {
    mark('db_update_end', { ok: false })
    mark('complete', { ok: false, reason: 'db-failed' })
    return { ok: false, reason: 'db-failed', storagePath }
  }

  const finalCheck = await getPendingCover(reportId, store)
  if (!isPendingCoverGenerationCurrent(finalCheck, generation)) {
    mark('complete', { ok: false, reason: 'stale-after-db' })
    return { ok: false, reason: 'stale-after-db', storagePath }
  }

  if (priorCoverPath && priorCoverPath !== storagePath) {
    await bestEffortRemoveCoverObject(supabase, priorCoverPath)
  }

  await deletePendingCover(reportId, store)
  mark('complete', { ok: true, prepared: false })
  return {
    ok: true,
    storagePath,
    coverProcessingVersion: null,
    prepared: false,
  }
}
