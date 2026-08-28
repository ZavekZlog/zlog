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
  syncPendingCoverUpload,
  setCoverPendingStoreForTests,
  newCoverPendingGeneration,
} from './diary-cover-pending.js'
import { coverPhotoStoragePath } from './diary-cover-photo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const coverPhotoLib = readFileSync(join(root, 'lib/diary-cover-photo.js'), 'utf8')

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

  it('fileFromPendingCover builds uploadable File/Blob', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    await putPendingCover('rep-1', { blob, fileName: 'cover.jpg' }, store)
    const row = await getPendingCover('rep-1', store)
    const file = fileFromPendingCover(row)
    assert.ok(file)
    assert.ok(file.size >= 1)
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

describe('Phase F2B syncPendingCoverUpload', () => {
  /** @type {ReturnType<typeof createMemoryCoverPendingStore>} */
  let store

  beforeEach(() => {
    store = createMemoryCoverPendingStore()
    setCoverPendingStoreForTests(store)
  })

  it('successful storage + DB deletes pending record', async () => {
    const blob = new Blob(['COVER'], { type: 'image/jpeg' })
    const handoff = await putPendingCover('rep-1', { blob }, store)
    const dbWrites = []
    const synced = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadFn: async () => ({
        storagePath: coverPhotoStoragePath('user-1', 'rep-1'),
        error: null,
      }),
      updateCoverUrl: async (path) => {
        dbWrites.push(path)
      },
    })
    assert.equal(synced.ok, true)
    assert.equal(dbWrites[0], 'user-1/rep-1/cover.jpg')
    assert.equal(await getPendingCover('rep-1', store), null)
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
      uploadFn: async () => ({ storagePath: null, error: { message: 'network' } }),
      updateCoverUrl: async () => {},
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
      uploadFn: async () => ({
        storagePath: coverPhotoStoragePath('user-1', 'rep-1'),
        error: null,
      }),
      updateCoverUrl: async () => {
        throw new Error('db-down')
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(synced.reason, 'db-failed')
    assert.ok(await getPendingCover('rep-1', store))
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
      uploadFn: async () => ({
        storagePath: 'user-1/rep-1/cover.jpg',
        error: null,
      }),
      updateCoverUrl: async (path) => {
        dbWrites.push(path)
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(dbWrites.length, 0)
    const row = await getPendingCover('rep-1', store)
    assert.equal(row.blob.size, 1)
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
      uploadFn: async () => ({
        storagePath: 'user-1/rep-1/cover.jpg',
        error: null,
      }),
      updateCoverUrl: async (path) => {
        dbWrites.push(path)
      },
    })
    assert.equal(synced.ok, false)
    assert.equal(dbWrites.length, 0)
  })

  it('refresh/reopen resumes from retained pending record', async () => {
    const handoff = await putPendingCover('rep-1', {
      blob: new Blob(['COVER'], { type: 'image/jpeg' }),
    }, store)
    // Simulate failed first attempt
    await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: handoff.generation,
      store,
      uploadFn: async () => ({ storagePath: null, error: { message: 'offline' } }),
      updateCoverUrl: async () => {},
    })
    const still = await getPendingCover('rep-1', store)
    assert.ok(still)
    const retry = await syncPendingCoverUpload({}, {
      userId: 'user-1',
      reportId: 'rep-1',
      generation: still.generation,
      store,
      uploadFn: async () => ({
        storagePath: coverPhotoStoragePath('user-1', 'rep-1'),
        error: null,
      }),
      updateCoverUrl: async () => {},
    })
    assert.equal(retry.ok, true)
    assert.equal(await getPendingCover('rep-1', store), null)
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
    const uploadAt = continueFn.indexOf('uploadCoverPhotoFile')
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
    // Blocking upload only inside handoff failure branch — not on the success path.
    const handoffAt = continueFn.indexOf('putPendingCover(coverReportId')
    const failBranchAt = continueFn.indexOf('if (!handoff?.ok)')
    const uploadAt = continueFn.indexOf('uploadCoverPhotoFile')
    assert.ok(handoffAt > 0 && failBranchAt > handoffAt && uploadAt > failBranchAt)
    const successPath = continueFn.slice(handoffAt, failBranchAt)
    assert.doesNotMatch(successPath, /uploadCoverPhotoFile/)
  })

  it('IndexedDB handoff failure falls back to blocking upload before navigation', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    assert.match(
      continueFn,
      /if \(!handoff\?\.ok\) \{[\s\S]*uploadCoverPhotoFile[\s\S]*updateDiarySetupFields/,
    )
    const navAt = continueFn.indexOf('router.push(result.navigatedTo)')
    const fallbackUploadAt = continueFn.indexOf('uploadCoverPhotoFile')
    assert.ok(navAt > fallbackUploadAt)
  })

  it('diary hydrate loads pending cover and resumes upload after first usable UI', () => {
    assert.match(diaryPage, /getPendingCover\(editingReportId\)/)
    assert.match(diaryPage, /fileFromPendingCover\(pending\)/)
    assert.match(diaryPage, /coverPendingGenerationRef/)
    assert.match(diaryPage, /syncPendingCoverUpload/)
    assert.match(diaryPage, /F2B: resume canonical cover upload after first paint/)
    const pendingHydrate = diaryPage.indexOf('getPendingCover(editingReportId)')
    const resumeComment = diaryPage.indexOf('F2B: resume canonical cover upload after first paint')
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

  it('canonical cover.jpg path contract unchanged', () => {
    assert.match(coverPhotoLib, /coverPhotoStoragePath/)
    assert.match(coverPhotoLib, /\$\{userId\}\/\$\{reportId\}\/cover\.\$\{safeExt\}/)
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
