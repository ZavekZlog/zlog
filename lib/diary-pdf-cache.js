/**
 * Durable share-ready Site Diary PDF cache (IndexedDB).
 * Written after save/finalise prepare; reused on saved-diary Share when fingerprint matches.
 * TEMP companion to share/PDF performance work — does not change PDF appearance.
 */

const DB_NAME = 'zlog-share-pdf-cache'
const DB_VERSION = 1
const STORE = 'pdfs'

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'reportId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbPromise
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
