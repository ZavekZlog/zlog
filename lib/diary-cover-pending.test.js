/**
 * Phase F2B — durable pending cover handoff + non-blocking Continue.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createMemoryCoverPendingStore,
  putPendingCover,
  getPendingCover,
  deletePendingCover,
  markPendingCoverRemoved,
  isPendingCoverGenerationCurrent,
  fileFromPendingCover,
  rawBlobFromPendingCover,
  mergePreparedCoverIntoPending,
  syncPendingCoverUpload,
  setCoverPendingStoreForTests,
  newCoverPendingGeneration,
} from './diary-cover-pending.js'
import {
  coverPhotoStoragePath,
  coverSetupFieldsFromSync,
  coverPhotoStateFromSaved,
  normalizeCoverStoragePath,
} from './diary-cover-photo.js'
import { preparedCoverStoragePath, rawCoverStoragePath, ZLOG_COVER_PIPELINE_ID } from './cover-pipeline.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const coverPhotoLib = readFileSync(join(root, 'lib/diary-cover-photo.js'), 'utf8')
const pendingSrc = readFileSync(join(root, 'lib/diary-cover-pending.js'), 'utf8')

describe('Phase F2B pending cover store', () => {
  /** @type {ReturnType<typeof createMemoryCoverPendingStore>} */
  let store

  beforeEach(() => {
    store = createMemoryCoverPendingStore()
    setCoverPendingStoreForTests(store)
  })

  it('writes Blob durably before navigation (put/get)', async () => {
    const blob = new Blob(['COVER-BYTES'], { type: 'image/jpeg' })
    const out = await putPendingCover('rep-1', {
      blob,
      mimeType: 'image/jpeg',
      fileName: 'site.jpg',
    }, store)
    assert.equal(out.ok, true)
    assert.ok(out.generation)
    const row = await getPendingCover('rep-1', store)
    assert.equal(row.reportId, 'rep-1')
    assert.equal(row.blob.size, blob.size)
    assert.equal(row.mimeType, 'image/jpeg')
    assert.equal(row.removed, false)
  })

  it('does not store signed URLs or auth tokens', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob }, store)
    const row = await getPendingCover('rep-1', store)
    const json = JSON.stringify({
      reportId: row.reportId,
      mimeType: row.mimeType,
      fileName: row.fileName,
      generation: row.generation,
      createdAt: row.createdAt,
      removed: row.removed,
    })
    assert.doesNotMatch(json, /https?:/)
    assert.doesNotMatch(json, /blob:/)
    assert.doesNotMatch(json, /Bearer|access_token|refresh_token/i)
  })

  it('stores rawBlob for durable re-preparation', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob }, store)
    const row = await getPendingCover('rep-1', store)
    assert.equal(rawBlobFromPendingCover(row)?.size, blob.size)
    assert.equal(row.rawBlob.size, blob.size)
  })

  it('fileFromPendingCover builds uploadable File/Blob', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob, fileName: 'cover.jpg' }, store)
    const row = await getPendingCover('rep-1', store)
    const file = fileFromPendingCover(row)
    assert.ok(file)
    assert.ok(file.size >= 1)
  })

  it('fileFromPendingCover uses raw bytes for upload even when preparedBlob is dormant in IDB', async () => {
    const raw = new Blob(['RAW'], { type: 'image/jpeg' })
    const prepared = new Blob(['PREPARED-JPEG'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob: raw, preparedBlob: prepared }, store)
    const row = await getPendingCover('rep-1', store)
    const file = fileFromPendingCover(row)
    assert.equal(file.size, raw.size)
  })

  it('deletePendingCover removes the record after successful sync path', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob }, store)
    await deletePendingCover('rep-1', store)
    assert.equal(await getPendingCover('rep-1', store), null)
  })

  it('markPendingCoverRemoved tombstones so stale uploads cannot restore', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    const first = await putPendingCover('rep-1', { blob }, store)
    const tomb = await markPendingCoverRemoved('rep-1', store)
    assert.equal(tomb.ok, true)
    assert.notEqual(tomb.generation, first.generation)
    const row = await store.get('rep-1')
    assert.equal(row.removed, true)
    assert.equal(isPendingCoverGenerationCurrent(row, first.generation), false)
  })

  it('replace Cover A with Cover B invalidates A generation', async () => {
    const a = await putPendingCover('rep-1', {
      blob: new Blob(['A'], { type: 'image/jpeg' }),
      fileName: 'a.jpg',
    }, store)
    const b = await putPendingCover('rep-1', {
      blob: new Blob(['BB'], { type: 'image/jpeg' }),
      fileName: 'b.jpg',
    }, store)
    assert.notEqual(a.generation, b.generation)
    const row = await getPendingCover('rep-1', store)
    assert.equal(isPendingCoverGenerationCurrent(row, a.generation), false)
    assert.equal(isPendingCoverGenerationCurrent(row, b.generation), true)
    assert.equal(row.blob.size, 2)
  })
})

describe('Phase F2B syncPendingCoverUpload — Option D raw upload only', () => {
  /** @type {ReturnType<typeof createMemoryCoverPendingStore>} */
  let store

  beforeEach(() => {
    store = createMemoryCoverPendingStore()
    setCoverPendingStoreForTests(store)
  })

  it('production sync uploads raw generation path with NULL processing version', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    const handoff = await putPendingCover('rep-1', { blob }, store)
    const dbWrites = []
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async ({ storagePath, coverProcessingVersion }) => {
        dbWrites.push({ storagePath, coverProcessingVersion })
      },
    })
    assert.equal(synced.ok, true)
    assert.equal(synced.prepared, false)
    assert.equal(synced.coverProcessingVersion, null)
    assert.equal(dbWrites.length, 1)
    assert.equal(
      dbWrites[0].storagePath,
      rawCoverStoragePath('user-1', 'rep-1', handoff.generation),
    )
    assert.equal(dbWrites[0].coverProcessingVersion, null)
    assert.match(dbWrites[0].storagePath, /\/covers\/raw\//)
    assert.doesNotMatch(dbWrites[0].storagePath, /\/cover\.jpg$/)
    assert.equal(await getPendingCover('rep-1', store), null)
  })

  it('successful raw upload clears pending — no automatic retry loop', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['COVER'], { type: 'image/jpeg' }),
    }, store)
    let retryCount = 0
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async () => {
        retryCount += 1
      },
    })
    assert.equal(synced.ok, true)
    assert.equal(retryCount, 1)
    assert.equal(await getPendingCover('rep-1', store), null)
    const second = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async () => ({ storagePath: 'orphan', error: null }),
      updateCoverRecord: async () => {
        retryCount += 1
      },
    })
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'stale-or-removed')
    assert.equal(retryCount, 1)
  })

  it('storage failure retains pending record', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['COVER'], { type: 'image/jpeg' }),
    }, store)
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async () => ({ storagePath: null, error: { message: 'network' } }),
      updateCoverRecord: async () => {},
    })
    assert.equal(synced.ok, false)
    assert.equal(synced.reason, 'upload-failed')
    assert.ok(await getPendingCover('rep-1', store))
  })

  it('DB update failure retains pending record', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['COVER'], { type: 'image/jpeg' }),
    }, store)
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async () => {
        throw new Error('db-down')
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(synced.reason, 'db-failed')
    assert.ok(await getPendingCover('rep-1', store))
  })

  it('G1 raw upload uses generation path — cannot overwrite G2 bytes when replaced mid-flight', async () => {
    const g1 = await putPendingCover('rep-1', {
      blob: new Blob(['G1'], { type: 'image/jpeg' }),
    }, store)
    const storageObjects = new Map()
    const dbWrites = []
    let replaceDuringUpload = false
    const syncedG1 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g1.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation, file }) => {
        const storagePath = rawCoverStoragePath(userId, reportId, generation)
        if (!replaceDuringUpload) {
          replaceDuringUpload = true
          await putPendingCover('rep-1', {
            blob: new Blob(['G2'], { type: 'image/jpeg' }),
          }, store)
        }
        storageObjects.set(storagePath, file)
        return { storagePath, error: null }
      },
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG1.ok, false)
    assert.equal(syncedG1.reason, 'stale-after-upload')
    assert.equal(dbWrites.length, 0)
    const g1Path = rawCoverStoragePath('user-1', 'rep-1', g1.generation)
    assert.ok(storageObjects.has(g1Path))
    const row = await getPendingCover('rep-1', store)
    const g2Path = rawCoverStoragePath('user-1', 'rep-1', row.generation)
    assert.notEqual(g1Path, g2Path)
    assert.equal(storageObjects.has(g2Path), false)
  })

  it('G1 raw upload cannot win DB when G2 already replaced', async () => {
    const g1 = await putPendingCover('rep-1', {
      blob: new Blob(['G1'], { type: 'image/jpeg' }),
    }, store)
    const g2 = await putPendingCover('rep-1', {
      blob: new Blob(['G2'], { type: 'image/jpeg' }),
    }, store)
    const dbWrites = []
    let uploadCount = 0
    const syncedG1 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g1.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => {
        uploadCount += 1
        return {
          storagePath: rawCoverStoragePath(userId, reportId, generation),
          error: null,
        }
      },
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG1.ok, false)
    assert.equal(syncedG1.reason, 'stale-or-removed')
    assert.equal(uploadCount, 0)
    assert.equal(dbWrites.length, 0)

    const syncedG2 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g2.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG2.ok, true)
    assert.equal(syncedG2.prepared, false)
    assert.equal(syncedG2.coverProcessingVersion, null)
    assert.equal(dbWrites.length, 1)
    assert.equal(
      dbWrites[0].storagePath,
      rawCoverStoragePath('user-1', 'rep-1', g2.generation),
    )
    assert.equal(dbWrites[0].coverProcessingVersion, null)
  })

  it('removed tombstone blocks raw upload DB restore after slow upload', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['A'], { type: 'image/jpeg' }),
    }, store)
    await markPendingCoverRemoved('rep-1', store)
    const dbWrites = []
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(synced.reason, 'stale-or-removed')
    assert.equal(dbWrites.length, 0)
  })

  it('G1 upload may complete raw storage but stale-after-upload blocks DB when replaced mid-flight', async () => {
    const g1 = await putPendingCover('rep-1', {
      blob: new Blob(['G1'], { type: 'image/jpeg' }),
    }, store)
    const dbWrites = []
    let replaceDuringUpload = false
    const syncedG1 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g1.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => {
        if (!replaceDuringUpload) {
          replaceDuringUpload = true
          await putPendingCover('rep-1', {
            blob: new Blob(['G2'], { type: 'image/jpeg' }),
          }, store)
        }
        return {
          storagePath: rawCoverStoragePath(userId, reportId, generation),
          error: null,
        }
      },
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG1.ok, false)
    assert.equal(syncedG1.reason, 'stale-after-upload')
    assert.equal(dbWrites.length, 0)
    assert.ok(syncedG1.storagePath?.includes('/covers/raw/'))
  })

  it('stale generation after replace does not commit DB', async () => {
    const a = await putPendingCover('rep-1', {
      blob: new Blob(['A'], { type: 'image/jpeg' }),
    }, store)
    await putPendingCover('rep-1', {
      blob: new Blob(['B'], { type: 'image/jpeg' }),
    }, store)
    const dbWrites = []
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: a.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(dbWrites.length, 0)
    const row = await getPendingCover('rep-1', store)
    assert.equal(row.blob.size, 1)
  })

  it('G1 upload may complete storage but stale-after-upload blocks DB when replaced mid-flight (raw path)', async () => {
    const g1 = await putPendingCover('rep-1', {
      blob: new Blob(['G1'], { type: 'image/jpeg' }),
    }, store)
    const dbWrites = []
    let replaceDuringUpload = false
    const syncedG1 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g1.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => {
        if (!replaceDuringUpload) {
          replaceDuringUpload = true
          await putPendingCover('rep-1', {
            blob: new Blob(['G2'], { type: 'image/jpeg' }),
          }, store)
        }
        return {
          storagePath: rawCoverStoragePath(userId, reportId, generation),
          error: null,
        }
      },
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG1.ok, false)
    assert.equal(syncedG1.reason, 'stale-after-upload')
    assert.equal(dbWrites.length, 0)
    assert.ok(syncedG1.storagePath?.includes('/covers/raw/'))
  })

  it('G1 may finish upload but stale-after-upload blocks DB when G2 replaced', async () => {
    const g1 = await putPendingCover('rep-1', {
      blob: new Blob(['G1'], { type: 'image/jpeg' }),
    }, store)
    const g2 = await putPendingCover('rep-1', {
      blob: new Blob(['G2'], { type: 'image/jpeg' }),
    }, store)
    const dbWrites = []
    let uploadCount = 0
    const syncedG1 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g1.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => {
        uploadCount += 1
        return {
          storagePath: rawCoverStoragePath(userId, reportId, generation),
          error: null,
        }
      },
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG1.ok, false)
    assert.equal(syncedG1.reason, 'stale-or-removed')
    assert.equal(uploadCount, 0)
    assert.equal(dbWrites.length, 0)

    const syncedG2 = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: g2.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(syncedG2.ok, true)
    assert.equal(dbWrites.length, 1)
    assert.equal(
      dbWrites[0].storagePath,
      rawCoverStoragePath('user-1', 'rep-1', g2.generation),
    )
    assert.equal(dbWrites[0].coverProcessingVersion, null)
  })

  it('removed tombstone blocks restore after slow upload', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['A'], { type: 'image/jpeg' }),
    }, store)
    await markPendingCoverRemoved('rep-1', store)
    const dbWrites = []
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async (record) => {
        dbWrites.push(record)
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(dbWrites.length, 0)
  })

  it('refresh/reopen resumes from retained pending record and retries raw upload', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['COVER'], { type: 'image/jpeg' }),
    }, store)
    await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadRawFn: async () => ({ storagePath: null, error: { message: 'offline' } }),
      updateCoverRecord: async () => {},
    })
    const still = await getPendingCover('rep-1', store)
    assert.ok(still)
    assert.ok(rawBlobFromPendingCover(still))
    const retry = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: still.generation,
      store,
      uploadRawFn: async (_sb, { userId, reportId, generation }) => ({
        storagePath: rawCoverStoragePath(userId, reportId, generation),
        error: null,
      }),
      updateCoverRecord: async () => {},
    })
    assert.equal(retry.ok, true)
    assert.equal(retry.coverProcessingVersion, null)
    assert.equal(await getPendingCover('rep-1', store), null)
  })

  it('mergePreparedCoverIntoPending stores prepared bytes for future Worker restart (dormant)', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['RAW'], { type: 'image/jpeg' }),
    }, store)
    const prepared = new Blob(['CANONICAL'], { type: 'image/jpeg' })
    const merged = await mergePreparedCoverIntoPending(
      'rep-1',
      handoff.generation,
      prepared,
      store,
    )
    assert.equal(merged.ok, true)
    const row = await getPendingCover('rep-1', store)
    assert.equal(row.preparedBlob.size, prepared.size)
    assert.equal(rawBlobFromPendingCover(row)?.size, 3)
    const uploadFile = fileFromPendingCover(row)
    assert.equal(uploadFile.size, 3)
  })

  it('coverSetupFieldsFromSync writes version only for prepared covers (dormant contract)', () => {
    assert.deepEqual(
      coverSetupFieldsFromSync({
        storagePath: 'u/r/covers/g.jpg',
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      }),
      {
        coverPhotoUrl: 'u/r/covers/g.jpg',
        coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      },
    )
    assert.deepEqual(
      coverSetupFieldsFromSync({
        storagePath: 'u/r/covers/raw/g.jpg',
        coverProcessingVersion: null,
      }),
      { coverPhotoUrl: 'u/r/covers/raw/g.jpg', coverProcessingVersion: null },
    )
    assert.deepEqual(
      coverSetupFieldsFromSync({ removed: true }),
      { coverPhotoUrl: null, coverProcessingVersion: null },
    )
  })
})

describe('Option D — production path never prepares covers', () => {
  it('syncPendingCoverUpload never invokes preparation helpers', () => {
    const syncStart = pendingSrc.indexOf('export async function syncPendingCoverUpload')
    const syncBody = pendingSrc.slice(syncStart)
    assert.doesNotMatch(pendingSrc, /prepareCanonicalCoverBlob/)
    assert.doesNotMatch(syncBody, /cover_prepare_start/)
    assert.doesNotMatch(syncBody, /mergePreparedCoverIntoPending\(/)
    assert.doesNotMatch(syncBody, /uploadPreparedCoverFile/)
  })

  it('app pages never call prepareCanonicalCoverBlob', () => {
    assert.doesNotMatch(setupPage, /prepareCanonicalCoverBlob/)
    assert.doesNotMatch(diaryPage, /prepareCanonicalCoverBlob/)
  })

  it('Continue does not await cover preparation', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    assert.doesNotMatch(continueFn, /prepareCanonicalCoverBlob/)
    assert.doesNotMatch(continueFn, /cover_prepare/)
  })

  it('diary hydrate resumes upload without preparation markers', () => {
    assert.doesNotMatch(diaryPage, /cover_prepare/)
    assert.match(diaryPage, /syncPendingCoverUpload/)
    assert.match(diaryPage, /F2B: resume raw cover upload after first paint/)
  })

  it('uprightCoverSrcForPdf remains the PDF cover path', () => {
    const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
    assert.match(shareSrc, /export async function uprightCoverSrcForPdf/)
    assert.match(shareSrc, /decodeBrowserDisplayImage/)
  })

  it('area-photo Phase D shadow ingest is untouched by Option D', () => {
    const walkSrc = readFileSync(join(root, 'components/ai-annotation/AiLocationWalk.jsx'), 'utf8')
    const shadowSrc = readFileSync(join(root, 'lib/photo-workspace/shadow-ingest.js'), 'utf8')
    assert.match(walkSrc, /runShadowPrepareJobs/)
    assert.match(shadowSrc, /prepareZlogPhoto/)
    assert.doesNotMatch(pendingSrc, /prepareZlogPhoto/)
  })
})

describe('C1 final race audit — no new writes to shared cover.jpg', () => {
  it('production app pages never call uploadCoverPhotoFile for new cover uploads', () => {
    assert.doesNotMatch(setupPage, /uploadCoverPhotoFile/)
    assert.doesNotMatch(diaryPage, /uploadCoverPhotoFile/)
  })

  it('new prepared upload uses immutable covers/{generation}.jpg only', () => {
    const fnStart = coverPhotoLib.indexOf('export async function uploadPreparedCoverFile')
    const fnEnd = coverPhotoLib.indexOf('export async function uploadRawCoverFallbackFile', fnStart)
    const fnBody = coverPhotoLib.slice(fnStart, fnEnd)
    assert.match(fnBody, /preparedCoverStoragePath/)
    assert.doesNotMatch(fnBody, /coverPhotoStoragePath/)
  })

  it('production sync uses covers/raw/{generation}.jpg only', () => {
    assert.match(pendingSrc, /uploadRawCoverFallbackFile/)
    const syncStart = pendingSrc.indexOf('export async function syncPendingCoverUpload')
    const syncBody = pendingSrc.slice(syncStart)
    assert.doesNotMatch(syncBody, /uploadCoverPhotoFile/)
    assert.doesNotMatch(syncBody, /uploadPreparedCoverFile/)
    assert.doesNotMatch(syncBody, /prepareCanonicalCoverBlob/)
  })

  it('setup IDB-failure blocking fallback uses generation-scoped raw upload', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    assert.match(
      continueFn,
      /if \(!handoff\?\.ok\) \{[\s\S]*newCoverPendingGeneration[\s\S]*uploadRawCoverFallbackFile[\s\S]*updateDiarySetupFields/,
    )
    assert.doesNotMatch(continueFn, /uploadCoverPhotoFile/)
  })

  it('diary autosave and Save & Share use generation-scoped raw upload', () => {
    assert.match(diaryPage, /uploadRawCoverFallbackFile\(supabase/)
    assert.match(diaryPage, /newCoverPendingGeneration/)
    assert.match(diaryPage, /cover_processing_version: null/)
    assert.doesNotMatch(diaryPage, /uploadCoverPhotoFile/)
  })

  it('replacement uses a different path for each generation', () => {
    const g1 = '11111111-1111-4111-8111-111111111111'
    const g2 = '22222222-2222-4222-8222-222222222222'
    assert.notEqual(
      preparedCoverStoragePath('u', 'r', g1),
      preparedCoverStoragePath('u', 'r', g2),
    )
    assert.notEqual(
      rawCoverStoragePath('u', 'r', g1),
      rawCoverStoragePath('u', 'r', g2),
    )
    assert.notEqual(
      rawCoverStoragePath('u', 'r', g1),
      coverPhotoStoragePath('u', 'r'),
    )
  })

  it('legacy DB row containing cover.jpg remains readable via hydrate helpers', () => {
    const state = coverPhotoStateFromSaved('user/rep/cover.jpg', 'https://signed/cover.jpg')
    assert.equal(state.storagePath, 'user/rep/cover.jpg')
    assert.equal(normalizeCoverStoragePath('user/rep/cover.jpg'), 'user/rep/cover.jpg')
  })
})

describe('Phase F2B Continue / diary wiring contracts', () => {
  it('Continue creates draft before pending cover handoff', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    const draftAt = continueFn.indexOf('runDiarySetupContinue')
    const idbAt = continueFn.indexOf('putPendingCover')
    const uploadAt = continueFn.indexOf('uploadRawCoverFallbackFile')
    assert.ok(draftAt > 0 && idbAt > draftAt)
    assert.ok(uploadAt > idbAt)
  })

  it('successful IndexedDB handoff skips blocking network cover upload', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    assert.match(continueFn, /putPendingCover\(coverReportId/)
    assert.match(continueFn, /if \(!handoff\?\.ok\)/)
    assert.match(continueFn, /F2B: prefer durable IndexedDB handoff/)
    assert.match(continueFn, /fields: \{ coverPhotoUrl: null, coverProcessingVersion: null \}/)
    // Blocking upload only inside handoff failure branch — not on the success path.
    const handoffAt = continueFn.indexOf('putPendingCover(coverReportId')
    const failBranchAt = continueFn.indexOf('if (!handoff?.ok)')
    const uploadAt = continueFn.indexOf('uploadRawCoverFallbackFile')
    assert.ok(handoffAt > 0 && failBranchAt > handoffAt && uploadAt > failBranchAt)
    const successPath = continueFn.slice(handoffAt, failBranchAt)
    assert.doesNotMatch(successPath, /uploadRawCoverFallbackFile/)
  })

  it('IndexedDB handoff failure falls back to blocking upload before navigation', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    assert.match(
      continueFn,
      /if \(!handoff\?\.ok\) \{[\s\S]*uploadRawCoverFallbackFile[\s\S]*updateDiarySetupFields/,
    )
    const navAt = continueFn.indexOf('router.push(result.navigatedTo)')
    const fallbackUploadAt = continueFn.indexOf('uploadRawCoverFallbackFile')
    assert.ok(navAt > fallbackUploadAt)
  })

  it('diary hydrate loads pending cover and resumes upload after first usable UI', () => {
    assert.match(diaryPage, /getPendingCover\(editingReportId\)/)
    assert.match(diaryPage, /fileFromPendingCover\(pending\)/)
    assert.match(diaryPage, /coverPendingGenerationRef/)
    assert.match(diaryPage, /coverSetupFieldsFromSync/)
    assert.match(diaryPage, /updateCoverRecord/)
    assert.match(diaryPage, /F2B: resume raw cover upload after first paint/)
    const pendingHydrate = diaryPage.indexOf('getPendingCover(editingReportId)')
    const resumeComment = diaryPage.indexOf('F2B: resume raw cover upload after first paint')
    const syncAfterResume = diaryPage.indexOf('syncPendingCoverUpload', resumeComment)
    assert.ok(pendingHydrate > 0 && resumeComment > pendingHydrate && syncAfterResume > resumeComment)
    // Compose path: first paint clears loading before background resume.
    const composePaint = diaryPage.indexOf('// First usable paint')
    const loadingFalseAfterPaint = diaryPage.indexOf('setLoading(false)', composePaint)
    assert.ok(composePaint > 0 && loadingFalseAfterPaint > composePaint && syncAfterResume > loadingFalseAfterPaint)
    assert.match(diaryPage, /coverPendingGenerationRef\.current !== gen/)
  })

  it('replace/remove race protection uses generation + tombstone', () => {
    assert.match(diaryPage, /coverPendingGenerationRef/)
    assert.match(diaryPage, /putPendingCover\(editingReportId/)
    assert.match(diaryPage, /markPendingCoverRemoved\(editingReportId\)/)
    assert.match(diaryPage, /coverPendingGenerationRef\.current !== gen/)
  })

  it('immutable prepared + raw cover path contracts', () => {
    assert.match(coverPhotoLib, /preparedCoverStoragePath/)
    assert.match(coverPhotoLib, /rawCoverStoragePath/)
    assert.match(coverPhotoLib, /uploadPreparedCoverFile/)
    assert.match(coverPhotoLib, /uploadRawCoverFallbackFile/)
    const gen = '550e8400-e29b-41d4-a716-446655440000'
    assert.equal(
      preparedCoverStoragePath('user-1', 'rep-1', gen),
      'user-1/rep-1/covers/550e8400-e29b-41d4-a716-446655440000.jpg',
    )
    assert.equal(
      rawCoverStoragePath('user-1', 'rep-1', gen),
      'user-1/rep-1/covers/raw/550e8400-e29b-41d4-a716-446655440000.jpg',
    )
    assert.equal(coverPhotoStoragePath('user-1', 'rep-1'), 'user-1/rep-1/cover.jpg')
  })

  it('PDF / saved-cover reopen contracts still use cover_photo_url helpers', () => {
    assert.match(coverPhotoLib, /coverPhotoStateFromSaved/)
    assert.match(coverPhotoLib, /resolveCoverPhotoPreviewUrl/)
    assert.match(diaryPage, /cover_photo_url/)
    assert.doesNotMatch(diaryPage, /blob:.*cover_photo_url/)
  })

  it('generation helper is unique enough for replace races', () => {
    const a = newCoverPendingGeneration()
    const b = newCoverPendingGeneration()
    assert.notEqual(a, b)
  })
})
