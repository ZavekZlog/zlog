import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSharePdfFingerprint,
  fingerprintFromSavedDiaryView,
} from './diary-pdf-cache.js'

const cacheSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'diary-pdf-cache.js'), 'utf8')

describe('share PDF durable cache fingerprint', () => {
  it('changes when a photo caption or rotation changes', () => {
    const base = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [
        { url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 },
        { url: 'b.jpg', caption: 'South', rotation_degrees: 90, sequence: 2 },
      ],
    })
    const rotated = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [
        { url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 },
        { url: 'b.jpg', caption: 'South', rotation_degrees: 180, sequence: 2 },
      ],
    })
    assert.notEqual(base, rotated)
  })

  it('builds a fingerprint from a saved diary view model', () => {
    const fp = fingerprintFromSavedDiaryView({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Works',
      weather: 'Rain',
      shift: 'Night',
      photoAreas: [
        {
          photos: [
            { url: 'p1.jpg', caption: 'One', rotation_degrees: 0, sequence: 1 },
          ],
        },
      ],
    })
    assert.ok(fp.includes('r1'))
    assert.ok(fp.includes('p1.jpg'))
  })

  it('changes when cover identity changes so a pre-migration PDF cannot be reused', () => {
    const legacy = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'user-1/r1/cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [{ url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 }],
    })
    const prepared = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'user-1/r1/covers/gen-1.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [{ url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 }],
    })
    assert.notEqual(legacy, prepared)
  })
})

function createMemoryIndexedDb() {
  const databases = new Map()
  const api = {
    deleteDatabaseCalls: 0,
    deleteDatabase(name) {
      api.deleteDatabaseCalls += 1
      databases.delete(name)
      const request = {}
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      }
      queueMicrotask(() => {
        try {
          let db = databases.get(name)
          if (!db) {
            db = createMemoryDatabase(name, 0)
            databases.set(name, db)
          }
          const oldVersion = db.version
          if (oldVersion < version) {
            db.version = version
            request.result = db
            request.onupgradeneeded?.({ oldVersion, newVersion: version })
          }
          request.result = db
          request.onsuccess?.()
        } catch (err) {
          request.error = err
          request.onerror?.()
        }
      })
      return request
    },
  }
  return api
}

function createMemoryDatabase(name, version) {
  const stores = new Map()
  return {
    name,
    version,
    objectStoreNames: {
      contains(storeName) {
        return stores.has(storeName)
      },
    },
    createObjectStore(storeName, { keyPath } = {}) {
      if (stores.has(storeName)) {
        throw new Error(`store already exists: ${storeName}`)
      }
      const records = new Map()
      stores.set(storeName, { keyPath, records })
      return { keyPath, records }
    },
    transaction(storeName) {
      const store = stores.get(storeName)
      const jobs = []
      let flushed = false
      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          tx.error = tx.error || new Error('aborted')
          if (!flushed) {
            flushed = true
            queueMicrotask(() => tx.onabort?.())
          }
        },
        objectStore() {
          if (!store) {
            throw new Error(`missing store: ${storeName}`)
          }
          return {
            put(value) {
              store.records.set(value[store.keyPath], value)
            },
            get(key) {
              const req = {
                result: undefined,
                onsuccess: null,
                onerror: null,
              }
              jobs.push(() => {
                req.result = store.records.get(key)
                req.onsuccess?.()
              })
              return req
            },
          }
        },
      }
      const flush = () => {
        if (flushed) return
        flushed = true
        try {
          for (const job of jobs) job()
          tx.oncomplete?.()
        } catch (err) {
          tx.error = err
          tx.onabort?.()
          tx.onerror?.()
        }
      }
      if (!store) {
        tx.error = new Error(`missing store: ${storeName}`)
        queueMicrotask(() => tx.onerror?.())
        return tx
      }
      queueMicrotask(flush)
      return tx
    },
    close() {},
  }
}

function pdfBlob(contents = '%PDF-1.4 worker', type = 'application/pdf') {
  return new Blob([contents], { type })
}

function requireCacheFn(cache, name) {
  assert.equal(typeof cache[name], 'function', `missing ${name}`)
  return cache[name]
}

describe('worker artifact cache', () => {
  it('upgrades a version-1 viewer database without deleting pdfs records', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const openSharePdfCacheDatabase = requireCacheFn(cache, 'openSharePdfCacheDatabase')
    assert.equal(cache.SHARE_PDF_CACHE_DB_NAME, 'zlog-share-pdf-cache')
    assert.equal(cache.SHARE_PDF_CACHE_DB_VERSION, 2)
    assert.equal(cache.WORKER_ARTIFACT_STORE_NAME, 'workerArtifacts')
    assert.doesNotMatch(cacheSrc, /indexedDB\.deleteDatabase/)

    const idb = createMemoryIndexedDb()
    const viewerDb = await new Promise((resolve, reject) => {
      const request = idb.open('zlog-share-pdf-cache', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pdfs', { keyPath: 'reportId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = viewerDb.transaction('pdfs', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('pdfs').put({
        reportId: 'report-1',
        fingerprint: 'viewer-fingerprint',
        blob: pdfBlob('%PDF viewer'),
      })
    })

    const upgraded = await openSharePdfCacheDatabase(idb)
    assert.equal(upgraded.objectStoreNames.contains('pdfs'), true)
    assert.equal(upgraded.objectStoreNames.contains('workerArtifacts'), true)
    assert.equal(idb.deleteDatabaseCalls, 0)

    const viewer = await new Promise((resolve, reject) => {
      const tx = upgraded.transaction('pdfs', 'readonly')
      const req = tx.objectStore('pdfs').get('report-1')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    assert.equal(viewer.fingerprint, 'viewer-fingerprint')
    assert.equal(viewer.blob.size > 0, true)
  })

  it('rejects another account for the same report, export, and fingerprint', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    const stored = await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob(),
      fileName: 'diary.pdf',
    }, { db })
    assert.equal(stored.ok, true)
    const loaded = await load({
      reportId: 'report-1',
      userId: 'USER-B',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }, { db })
    assert.equal(loaded.ok, false)
    assert.equal(loaded.file, undefined)
  })

  it('returns a resident File for the exact user, report, export, and fingerprint', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'AbC',
      blob: pdfBlob('%PDF-exact'),
      fileName: 'diary.pdf',
    }, { db })
    const loaded = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'abc',
    }, { db })
    assert.equal(loaded.ok, true)
    assert.equal(loaded.file instanceof File, true)
    assert.equal(loaded.file.type, 'application/pdf')
    assert.equal(loaded.file.size > 0, true)
    assert.equal(loaded.exportId, 'export-1')
    assert.equal(loaded.contentFingerprint, 'abc')
    assert.equal(loaded.fromWorkerArtifactCache, true)
  })

  it('misses when the export id changes and replaces the one record per report', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob('%PDF-old'),
      fileName: 'old.pdf',
    }, { db })
    const miss = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
    }, { db })
    assert.equal(miss.ok, false)
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
      blob: pdfBlob('%PDF-new'),
      fileName: 'new.pdf',
    }, { db, attemptStartedAt: Date.now() })
    const old = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }, { db })
    const current = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
    }, { db })
    assert.equal(old.ok, false)
    assert.equal(current.ok, true)
    assert.equal(current.fileName, 'new.pdf')
  })

  it('misses when the fingerprint changes even if the export id matches', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob(),
      fileName: 'diary.pdf',
    }, { db })
    const loaded = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-2',
    }, { db })
    assert.equal(loaded.ok, false)
  })

  it('misses a zero-byte blob, a non-PDF MIME, and a missing blob', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const assess = requireCacheFn(cache, 'assessWorkerReadyPdfRecord')
    const expected = {
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }
    assert.equal(assess({
      ...expected,
      blob: pdfBlob('', 'application/pdf'),
      byteLength: 0,
    }, expected).ok, false)
    assert.equal(assess({
      ...expected,
      blob: pdfBlob('%PDF', 'text/plain'),
      byteLength: 4,
    }, expected).ok, false)
    assert.equal(assess({
      ...expected,
      blob: null,
    }, expected).ok, false)
    assert.equal(assess({
      ...expected,
      blob: pdfBlob('%PDF', ''),
      byteLength: 4,
    }, expected).ok, true)
  })

  it('does not let a late older export overwrite a newer worker artifact', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const shouldPersist = requireCacheFn(cache, 'shouldPersistWorkerArtifactRecord')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const newer = { exportId: 'export-2', storedAt: 5000 }
    assert.equal(shouldPersist(
      newer,
      { exportId: 'export-1', reportId: 'report-1', blob: pdfBlob() },
      { attemptStartedAt: 1000 },
    ), false)
    assert.equal(shouldPersist(
      { exportId: 'export-1', storedAt: 1000 },
      { exportId: 'export-2', reportId: 'report-1', blob: pdfBlob() },
      { attemptStartedAt: 4000 },
    ), true)
    assert.equal(shouldPersist(
      null,
      { exportId: 'export-1', reportId: 'report-1', blob: pdfBlob() },
      { attemptStartedAt: 1000, isStillCurrent: false },
    ), false)

    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
      blob: pdfBlob('%PDF-new'),
      fileName: 'new.pdf',
    }, { db })
    const staleWrite = await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob('%PDF-old'),
      fileName: 'old.pdf',
    }, { db, attemptStartedAt: 1 })
    assert.equal(staleWrite.ok, false)
    const current = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
    }, { db })
    assert.equal(current.ok, true)
    assert.equal(current.fileName, 'new.pdf')
  })

  it('keeps the viewer pdfs record when a worker artifact is stored', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const idb = createMemoryIndexedDb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('pdfs').put({
        reportId: 'report-1',
        fingerprint: 'viewer-fingerprint',
        blob: pdfBlob('%PDF viewer'),
      })
    })
    await store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob('%PDF worker'),
      fileName: 'worker.pdf',
    }, { db })
    const viewer = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly')
      const req = tx.objectStore('pdfs').get('report-1')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    assert.equal(viewer.fingerprint, 'viewer-fingerprint')
    const worker = await new Promise((resolve, reject) => {
      const tx = db.transaction('workerArtifacts', 'readonly')
      const req = tx.objectStore('workerArtifacts').get('report-1')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    assert.equal(worker.exportId, 'export-1')
    assert.equal(worker.userId, 'USER-A')
    assert.notEqual(worker.fingerprint, 'viewer-fingerprint')
  })

  it('does not let an older in-flight read put over a newer export that commits first', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const store = requireCacheFn(cache, 'storeWorkerReadyPdfArtifact')
    const db = createMemoryDatabase('race', 2)
    db.createObjectStore('workerArtifacts', { keyPath: 'reportId' })
    const newer = store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-2',
      contentFingerprint: 'fingerprint-2',
      blob: pdfBlob('%PDF-new'),
      fileName: 'new.pdf',
    }, { db, attemptStartedAt: 5000 })
    const older = store({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
      blob: pdfBlob('%PDF-old'),
      fileName: 'old.pdf',
    }, { db, attemptStartedAt: 1000 })
    await Promise.all([newer, older])
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction('workerArtifacts', 'readonly')
      const req = tx.objectStore('workerArtifacts').get('report-1')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    assert.equal(stored.exportId, 'export-2')
    assert.equal(stored.fileName, 'new.pdf')
  })

  it('turns a storage failure into a cache miss', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const load = requireCacheFn(cache, 'loadWorkerReadyPdfArtifact')
    const broken = {
      transaction() {
        const tx = {
          error: new Error('QuotaExceededError'),
          oncomplete: null,
          onerror: null,
          objectStore() {
            throw new Error('missing store')
          },
        }
        queueMicrotask(() => tx.onerror?.())
        return tx
      },
    }
    const loaded = await load({
      reportId: 'report-1',
      userId: 'USER-A',
      exportId: 'export-1',
      contentFingerprint: 'fingerprint-1',
    }, { db: broken })
    assert.equal(loaded.ok, false)
  })
})

function flushTurns(count = 8) {
  let pending = Promise.resolve()
  for (let i = 0; i < count; i += 1) {
    pending = pending.then(() => new Promise((resolve) => queueMicrotask(resolve)))
  }
  return pending
}

function createVersionGateIdb() {
  const database = createMemoryDatabase('zlog-share-pdf-cache', 0)
  const connections = []
  const blockedRequests = []
  const api = {
    openCount: 0,
    connections,
    database,
    open(_name, version) {
      api.openCount += 1
      const request = {
        result: null,
        error: null,
        onblocked: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        _version: version,
        _settled: false,
      }
      queueMicrotask(() => {
        if (api._hasBlocker(version)) {
          blockedRequests.push(request)
          request.onblocked?.()
          return
        }
        api._succeed(request, version)
      })
      return request
    },
    _hasBlocker(version) {
      return connections.some((connection) => !connection.closed && connection.openedVersion < version)
    },
    _succeed(request, version) {
      if (request._settled) return
      request._settled = true
      const connection = {
        openedVersion: version,
        closed: false,
        onversionchange: null,
        objectStoreNames: database.objectStoreNames,
        createObjectStore: (storeName, options) => database.createObjectStore(storeName, options),
        transaction: (storeName, mode) => database.transaction(storeName, mode),
        close() {
          connection.closed = true
          queueMicrotask(() => api._resume())
        },
      }
      connections.push(connection)
      request.result = connection
      if (database.version < version) {
        const oldVersion = database.version
        database.version = version
        try {
          request.onupgradeneeded?.({ oldVersion, newVersion: version })
        } catch (err) {
          request.error = err
          request.onerror?.({ preventDefault() {} })
          return
        }
      }
      request.onsuccess?.()
    },
    _resume() {
      const pending = blockedRequests.splice(0)
      for (const request of pending) {
        if (api._hasBlocker(request._version)) {
          blockedRequests.push(request)
          continue
        }
        api._succeed(request, request._version)
      }
    },
    failBlocked() {
      const pending = blockedRequests.splice(0)
      for (const request of pending) {
        if (request._settled) continue
        request._settled = true
        request.error = new Error('IndexedDB open failed')
        request.onerror?.({ preventDefault() {} })
      }
    },
  }
  return api
}

function openRawVersion(idb, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const request = idb.open('zlog-share-pdf-cache', version)
    request.onupgradeneeded = () => onUpgrade?.(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('raw open failed'))
    request.onblocked = () => reject(new Error('raw open blocked'))
  })
}

const workerIdentity = {
  reportId: 'report-1',
  userId: 'USER-A',
  exportId: 'export-1',
  contentFingerprint: 'fingerprint-1',
}

describe('share PDF cache blocked upgrade', () => {
  it('settles a version-2 open as unavailable while a live version-1 connection blocks it', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const idb = createVersionGateIdb()
    await openRawVersion(idb, 1, (db) => {
      db.createObjectStore('pdfs', { keyPath: 'reportId' })
    })
    let status = 'pending'
    cache.openSharePdfCacheDatabase(idb).then(
      () => { status = 'opened' },
      () => { status = 'unavailable' },
    )
    await flushTurns()
    assert.equal(status, 'unavailable')
  })

  it('closes the current connection on versionchange so a later open can proceed', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const idb = createVersionGateIdb()
    const db = await cache.openSharePdfCacheDatabase(idb)
    assert.equal(typeof db.onversionchange, 'function')
    db.onversionchange()
    assert.equal(db.closed, true)
    const reopened = await cache.openSharePdfCacheDatabase(idb)
    assert.equal(reopened.closed, false)
    assert.equal(idb.openCount, 2)
  })

  it('shares one blocked upgrade across callers, then reuses the late success', async () => {
    const cache = await import('./diary-pdf-cache.js')
    if (typeof cache.resetSharePdfCacheConnection === 'function') {
      cache.resetSharePdfCacheConnection()
    }
    const idb = createVersionGateIdb()
    const v1 = await openRawVersion(idb, 1, (db) => {
      db.createObjectStore('pdfs', { keyPath: 'reportId' })
    })
    await new Promise((resolve, reject) => {
      const tx = v1.transaction('pdfs', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('pdfs').put({
        reportId: 'report-1',
        fingerprint: 'viewer-fingerprint',
        blob: pdfBlob('%PDF viewer'),
      })
    })
    const previous = globalThis.indexedDB
    globalThis.indexedDB = idb
    try {
      let workerStatus = 'pending'
      let viewerStatus = 'pending'
      let storeStatus = 'pending'
      const worker = cache.loadWorkerReadyPdfArtifact(workerIdentity).then((result) => {
        workerStatus = result.ok ? 'hit' : 'miss'
      })
      const viewer = cache.loadShareReadyPdf('report-1', 'viewer-fingerprint').then((result) => {
        viewerStatus = result.ok ? 'hit' : 'miss'
      })
      const write = cache.storeWorkerReadyPdfArtifact({
        ...workerIdentity,
        blob: pdfBlob('%PDF worker'),
        fileName: 'worker.pdf',
      }).then((result) => {
        storeStatus = result.ok ? 'stored' : 'failed'
      })
      await flushTurns()
      assert.equal(workerStatus, 'miss')
      assert.equal(viewerStatus, 'miss')
      assert.equal(storeStatus, 'failed')
      assert.equal(idb.openCount, 2)
      let laterStatus = 'pending'
      const later = cache.loadWorkerReadyPdfArtifact(workerIdentity).then((result) => {
        laterStatus = result.ok ? 'hit' : 'miss'
      })
      await flushTurns()
      assert.equal(laterStatus, 'miss')
      assert.equal(idb.openCount, 2)
      v1.close()
      await flushTurns()
      assert.equal(workerStatus, 'miss')
      assert.equal(viewerStatus, 'miss')
      assert.equal(storeStatus, 'failed')
      const stored = await cache.storeWorkerReadyPdfArtifact({
        ...workerIdentity,
        blob: pdfBlob('%PDF worker'),
        fileName: 'worker.pdf',
      })
      assert.equal(stored.ok, true)
      assert.equal(idb.openCount, 2)
      const loaded = await cache.loadWorkerReadyPdfArtifact(workerIdentity)
      assert.equal(loaded.ok, true)
      assert.equal(loaded.file instanceof File, true)
      const viewerRecord = await new Promise((resolve, reject) => {
        const tx = idb.database.transaction('pdfs', 'readonly')
        const req = tx.objectStore('pdfs').get('report-1')
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
      assert.equal(viewerRecord.fingerprint, 'viewer-fingerprint')
      assert.equal(idb.database.objectStoreNames.contains('workerArtifacts'), true)
      await Promise.all([worker, viewer, write, later])
    } finally {
      globalThis.indexedDB = previous
      if (typeof cache.resetSharePdfCacheConnection === 'function') {
        cache.resetSharePdfCacheConnection()
      }
    }
  })

  it('retries a fresh open after a blocked request later errors', async () => {
    const cache = await import('./diary-pdf-cache.js')
    if (typeof cache.resetSharePdfCacheConnection === 'function') {
      cache.resetSharePdfCacheConnection()
    }
    const idb = createVersionGateIdb()
    const v1 = await openRawVersion(idb, 1, (db) => {
      db.createObjectStore('pdfs', { keyPath: 'reportId' })
    })
    const previous = globalThis.indexedDB
    globalThis.indexedDB = idb
    try {
      let status = 'pending'
      const first = cache.loadWorkerReadyPdfArtifact(workerIdentity).then((result) => {
        status = result.ok ? 'hit' : 'miss'
      })
      await flushTurns()
      assert.equal(status, 'miss')
      idb.failBlocked()
      v1.close()
      await flushTurns()
      const stored = await cache.storeWorkerReadyPdfArtifact({
        ...workerIdentity,
        blob: pdfBlob('%PDF worker'),
        fileName: 'worker.pdf',
      })
      assert.equal(stored.ok, true)
      assert.equal(idb.openCount, 3)
      await first
    } finally {
      globalThis.indexedDB = previous
      if (typeof cache.resetSharePdfCacheConnection === 'function') {
        cache.resetSharePdfCacheConnection()
      }
    }
  })

  it('reopens after the current connection closes for a newer version', async () => {
    const cache = await import('./diary-pdf-cache.js')
    if (typeof cache.resetSharePdfCacheConnection === 'function') {
      cache.resetSharePdfCacheConnection()
    }
    const idb = createVersionGateIdb()
    const previous = globalThis.indexedDB
    globalThis.indexedDB = idb
    try {
      const stored = await cache.storeWorkerReadyPdfArtifact({
        ...workerIdentity,
        blob: pdfBlob('%PDF worker'),
        fileName: 'worker.pdf',
      })
      assert.equal(stored.ok, true)
      const connection = idb.connections[0]
      assert.equal(typeof connection.onversionchange, 'function')
      connection.onversionchange()
      assert.equal(connection.closed, true)
      const again = await cache.storeWorkerReadyPdfArtifact({
        ...workerIdentity,
        blob: pdfBlob('%PDF worker'),
        fileName: 'again.pdf',
      })
      assert.equal(again.ok, true)
      assert.equal(idb.openCount, 2)
      const newer = idb.connections[1]
      connection.onversionchange()
      assert.equal(connection.closed, true)
      assert.equal(newer.closed, false)
      const loaded = await cache.loadWorkerReadyPdfArtifact(workerIdentity)
      assert.equal(loaded.ok, true)
      assert.equal(idb.openCount, 2)
    } finally {
      globalThis.indexedDB = previous
      if (typeof cache.resetSharePdfCacheConnection === 'function') {
        cache.resetSharePdfCacheConnection()
      }
    }
  })

  it('uses the network artifact when the worker-cache upgrade is blocked', async () => {
    const cache = await import('./diary-pdf-cache.js')
    const { hydrateReadyArtifactFromPersistentCacheOrNetwork } = await import('./diary-pdf-background-prepare.js')
    if (typeof cache.resetSharePdfCacheConnection === 'function') {
      cache.resetSharePdfCacheConnection()
    }
    const idb = createVersionGateIdb()
    await openRawVersion(idb, 1, (db) => {
      db.createObjectStore('pdfs', { keyPath: 'reportId' })
    })
    const previous = globalThis.indexedDB
    globalThis.indexedDB = idb
    let status = 'pending'
    let downloads = 0
    let persistStatus = 'pending'
    try {
      hydrateReadyArtifactFromPersistentCacheOrNetwork({
        userId: 'USER-A',
        reportId: 'report-1',
        identity: {
          ok: true,
          exportId: 'export-1',
          contentFingerprint: 'fingerprint-1',
        },
        loadCached: (query) => cache.loadWorkerReadyPdfArtifact(query),
        download: async () => {
          downloads += 1
          const blob = pdfBlob('%PDF network')
          return {
            ok: true,
            blob,
            file: new File([blob], 'network.pdf', { type: 'application/pdf' }),
            fileName: 'network.pdf',
            exportId: 'export-1',
            contentFingerprint: 'fingerprint-1',
          }
        },
        persist: (entry) => {
          const write = cache.storeWorkerReadyPdfArtifact({
            reportId: entry.reportId,
            userId: entry.userId,
            exportId: entry.exportId,
            contentFingerprint: entry.contentFingerprint,
            blob: entry.blob,
            fileName: entry.fileName,
          }, {
            attemptStartedAt: entry.attemptStartedAt,
            isStillCurrent: entry.isStillCurrent,
          })
          write.then(
            (result) => { persistStatus = result?.ok ? 'stored' : 'failed' },
            () => { persistStatus = 'failed' },
          )
          return write
        },
      }).then(
        (result) => { status = result?.ok && result.file?.size > 0 ? 'ready' : 'failed' },
        () => { status = 'failed' },
      )
      await flushTurns(24)
      assert.equal(
        `${status}|downloads=${downloads}|persist=${persistStatus}`,
        'ready|downloads=1|persist=failed',
      )
    } finally {
      globalThis.indexedDB = previous
      if (typeof cache.resetSharePdfCacheConnection === 'function') {
        cache.resetSharePdfCacheConnection()
      }
    }
  })
})
