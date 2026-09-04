/**
 * One-time legacy/raw cover → canonical prepared cover (fresh PDF generate only).
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coverOwnerUserIdFromPath,
  isLegacyCoverEligibleForMigration,
  isPreparedCoverStoragePath,
  migrateLegacyCoverIfNeeded,
  resolveCoverPdfSource,
} from './diary-cover-photo.js'
import {
  preparedCoverStoragePath,
  rawCoverStoragePath,
  ZLOG_COVER_MAX_EDGE,
  ZLOG_COVER_PIPELINE_ID,
} from './cover-pipeline.js'
import { computeContainDimensions } from './photo-workspace/image-pipeline.js'
import {
  getShareTimingSnapshot,
  startShareTimingRun,
} from './diary-share-timing-diag.js'
import { clearPreparedCoverSessionCache } from './diary-cover-prepared-session-cache.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coverSrc = readFileSync(join(root, 'lib/diary-cover-photo.js'), 'utf8')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const viewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')

function jpegBlob(bytes = 'cover-bytes') {
  return new Blob([bytes], { type: 'image/jpeg' })
}

function preparedResult(blob = jpegBlob('prepared-jpeg')) {
  return { blob, width: 1800, height: 2400, pipelineId: ZLOG_COVER_PIPELINE_ID }
}

function makeMigrationSupabase({
  row,
  onUpload = null,
  persistError = null,
  persistEmpty = false,
} = {}) {
  const calls = { uploads: [], removes: [], updates: [], getUser: 0 }
  return {
    calls,
    auth: {
      async getUser() {
        calls.getUser += 1
        return { data: { user: { id: 'user-1' } } }
      },
    },
    storage: {
      from() {
        return {
          async upload(path, file, opts) {
            calls.uploads.push({ path, file, opts })
            if (typeof onUpload === 'function') return onUpload(path, file, opts)
            return { error: null }
          },
          async remove(paths) {
            calls.removes.push(paths)
            return { error: null }
          },
        }
      },
    },
    from(table) {
      assert.equal(table, 'daily_reports')
      return {
        update(payload) {
          calls.updates.push({ ...payload })
          const filters = {}
          const q = {
            eq(col, val) {
              filters[col] = val
              return q
            },
            select() {
              return q
            },
            async maybeSingle() {
              if (persistError) return { data: null, error: persistError }
              if (persistEmpty) return { data: null, error: null }
              if (filters.id !== row.id) return { data: null, error: null }
              if (filters.cover_photo_url !== row.cover_photo_url) {
                return { data: null, error: null }
              }
              row.cover_photo_url = payload.cover_photo_url
              row.cover_processing_version = payload.cover_processing_version
              return {
                data: {
                  id: row.id,
                  cover_photo_url: row.cover_photo_url,
                  cover_processing_version: row.cover_processing_version,
                },
                error: null,
              }
            },
          }
          return q
        },
      }
    },
  }
}

async function migrateWithFetch(supabase, args, sourceBytes = 'legacy-source') {
  return migrateLegacyCoverIfNeeded(supabase, {
    ...args,
    fetchFn: async () => ({
      ok: true,
      async blob() {
        return jpegBlob(sourceBytes)
      },
    }),
    prepareFn: args.prepareFn || (async () => preparedResult()),
  })
}

describe('legacy cover migration eligibility', () => {
  it('does not migrate prepared canonical covers, missing covers, or data/blob URLs', () => {
    const prepared = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    assert.equal(isPreparedCoverStoragePath(prepared), true)
    assert.equal(isLegacyCoverEligibleForMigration(prepared), false)
    assert.equal(isLegacyCoverEligibleForMigration(null), false)
    assert.equal(isLegacyCoverEligibleForMigration(''), false)
    assert.equal(isLegacyCoverEligibleForMigration('data:image/jpeg;base64,abc'), false)
    assert.equal(isLegacyCoverEligibleForMigration('blob:https://example/1'), false)
  })

  it('treats legacy cover.jpg, raw fallback, and https URLs as eligible — never as prepared', () => {
    assert.equal(isLegacyCoverEligibleForMigration('user-1/rep-1/cover.jpg'), true)
    assert.equal(
      isLegacyCoverEligibleForMigration(rawCoverStoragePath('user-1', 'rep-1', 'raw-1')),
      true,
    )
    assert.equal(isLegacyCoverEligibleForMigration('https://cdn.example/cover.jpg'), true)
    assert.equal(isPreparedCoverStoragePath('https://cdn.example/cover.jpg'), false)
    assert.equal(isPreparedCoverStoragePath('user-1/rep-1/cover.jpg'), false)
  })
})

describe('legacy cover one-time migration', () => {
  beforeEach(() => {
    startShareTimingRun({ reportId: 'rep-1' })
    clearPreparedCoverSessionCache()
  })

  it('skips already prepared covers with no upload or metadata write', async () => {
    const preparedPath = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    const row = {
      id: 'rep-1',
      cover_photo_url: preparedPath,
      cover_processing_version: ZLOG_COVER_PIPELINE_ID,
    }
    const supabase = makeMigrationSupabase({ row })
    const result = await migrateLegacyCoverIfNeeded(supabase, {
      reportId: 'rep-1',
      coverPath: preparedPath,
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      signedCoverUrl: 'https://signed.example/cover.jpg',
    })
    assert.equal(result.ok, false)
    assert.equal(result.skipped, true)
    assert.equal(result.reason, 'already-prepared')
    assert.equal(row.cover_photo_url, preparedPath)
    assert.equal(supabase.calls.uploads.length, 0)
    assert.equal(supabase.calls.updates.length, 0)
    assert.equal(supabase.calls.removes.length, 0)
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.coverMigrationNeeded, false)
    assert.equal(counts.coverMigrationPrepareCount, 0)
  })

  it('migrates a legacy cover.jpg once onto a new prepared object for this report only', async () => {
    const legacyPath = 'user-1/other-rep/cover.jpg'
    const row = { id: 'rep-new', cover_photo_url: legacyPath, cover_processing_version: null }
    const stickyRow = { id: 'other-rep', cover_photo_url: legacyPath }
    const supabase = makeMigrationSupabase({ row })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-new',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-mig-1',
    })
    assert.equal(result.ok, true)
    assert.equal(result.coverPath, preparedCoverStoragePath('user-1', 'rep-new', 'gen-mig-1'))
    assert.equal(result.coverProcessingVersion, ZLOG_COVER_PIPELINE_ID)
    assert.ok(result.localPreparedBlob instanceof Blob)
    assert.equal(row.cover_photo_url, result.coverPath)
    assert.equal(stickyRow.cover_photo_url, legacyPath)
    assert.equal(supabase.calls.uploads.length, 1)
    assert.equal(supabase.calls.uploads[0].path, result.coverPath)
    assert.equal(supabase.calls.removes.length, 0)
    assert.equal(coverOwnerUserIdFromPath(legacyPath), 'user-1')
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.coverMigrationNeeded, true)
    assert.equal(counts.coverMigrationPrepareCount, 1)
    assert.equal(counts.coverMigrationUploadCount, 1)
    assert.equal(counts.coverMigrationPersistCount, 1)
  })

  it('migrates a raw fallback cover once', async () => {
    const rawPath = rawCoverStoragePath('user-1', 'rep-1', 'raw-old')
    const row = { id: 'rep-1', cover_photo_url: rawPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({ row })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: rawPath,
      signedCoverUrl: 'https://signed.example/raw.jpg',
      generation: 'gen-raw-fix',
    })
    assert.equal(result.ok, true)
    assert.equal(result.coverPath, preparedCoverStoragePath('user-1', 'rep-1', 'gen-raw-fix'))
    assert.equal(row.cover_photo_url, result.coverPath)
    assert.equal(supabase.calls.removes.length, 0)
  })

  it('canonical prepared JPEG keeps full-frame contain aspect ratio', () => {
    const { width, height } = computeContainDimensions(3000, 4000, ZLOG_COVER_MAX_EDGE)
    assert.equal(height, 2400)
    assert.equal(width, 1800)
    assert.ok(Math.abs(width / height - 3000 / 4000) < 0.001)
  })

  it('successful upload updates cover_photo_url and processing version on the current report', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({ row })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-ok',
    })
    assert.equal(result.ok, true)
    assert.equal(row.cover_photo_url, preparedCoverStoragePath('user-1', 'rep-1', 'gen-ok'))
    assert.equal(row.cover_processing_version, ZLOG_COVER_PIPELINE_ID)
    assert.equal(supabase.calls.updates.length, 1)
    assert.deepEqual(Object.keys(supabase.calls.updates[0]).sort(), [
      'cover_photo_url',
      'cover_processing_version',
    ])
  })

  it('failed prepare leaves the legacy reference intact and does not upload raw', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({ row })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-fail',
      prepareFn: async () => {
        throw new Error('prepare-unavailable')
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'prepare-failed')
    assert.equal(row.cover_photo_url, legacyPath)
    assert.equal(row.cover_processing_version, null)
    assert.equal(supabase.calls.uploads.length, 0)
    assert.equal(supabase.calls.updates.length, 0)
    assert.equal(supabase.calls.removes.length, 0)
  })

  it('failed upload leaves the legacy reference intact', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({
      row,
      onUpload: async () => ({ error: { message: 'storage-fail' } }),
    })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-up',
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'upload-failed')
    assert.equal(row.cover_photo_url, legacyPath)
    assert.equal(supabase.calls.updates.length, 0)
    assert.equal(supabase.calls.removes.length, 0)
  })

  it('failed DB metadata update leaves the report on the legacy cover', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({
      row,
      persistError: { message: 'update-fail' },
    })
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-db',
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'persist-failed')
    assert.equal(row.cover_photo_url, legacyPath)
    assert.equal(row.cover_processing_version, null)
    assert.equal(supabase.calls.uploads.length, 1)
    assert.equal(supabase.calls.removes.length, 0)
    const counts = getShareTimingSnapshot().counts
    assert.equal(counts.coverMigrationPrepareCount, 1)
    assert.equal(counts.coverMigrationUploadCount, 1)
    assert.equal(counts.coverMigrationPersistCount, 0)
  })

  it('same migration run returns the local prepared blob for PDF pass-through', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({ row })
    const localJpeg = jpegBlob('same-run-prepared')
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-local',
      prepareFn: async () => preparedResult(localJpeg),
    })
    assert.equal(result.ok, true)
    assert.equal(result.localPreparedBlob, localJpeg)

    let bakeCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      fetchCalls += 1
      throw new Error('same-run PDF must not refetch cover')
    }
    try {
      const src = await resolveCoverPdfSource('https://signed.example/legacy.jpg', {
        coverPath: result.coverPath,
        coverProcessingVersion: result.coverProcessingVersion,
        localPreparedBlob: result.localPreparedBlob,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,second-bake'
        },
      })
      assert.equal(fetchCalls, 0)
      assert.equal(bakeCalls, 0)
      assert.ok(String(src).startsWith('data:image/'))
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('does not run a second orientation bake after a successful migration', async () => {
    const legacyPath = 'user-1/rep-1/cover.jpg'
    const row = { id: 'rep-1', cover_photo_url: legacyPath, cover_processing_version: null }
    const supabase = makeMigrationSupabase({ row })
    let prepareCount = 0
    const result = await migrateWithFetch(supabase, {
      reportId: 'rep-1',
      coverPath: legacyPath,
      signedCoverUrl: 'https://signed.example/legacy.jpg',
      generation: 'gen-once',
      prepareFn: async () => {
        prepareCount += 1
        return preparedResult()
      },
    })
    assert.equal(result.ok, true)
    assert.equal(prepareCount, 1)
    let bakeCalls = 0
    await resolveCoverPdfSource('https://signed.example/legacy.jpg', {
      coverPath: result.coverPath,
      localPreparedBlob: result.localPreparedBlob,
      uprightCoverFn: async () => {
        bakeCalls += 1
        return 'data:image/jpeg;base64,baked'
      },
    })
    assert.equal(bakeCalls, 0)
  })

  it('subsequent fresh PDF skips migration and uses prepared pass-through', async () => {
    const preparedPath = preparedCoverStoragePath('user-1', 'rep-1', 'gen-1')
    const row = {
      id: 'rep-1',
      cover_photo_url: preparedPath,
      cover_processing_version: ZLOG_COVER_PIPELINE_ID,
    }
    const supabase = makeMigrationSupabase({ row })
    const skipped = await migrateLegacyCoverIfNeeded(supabase, {
      reportId: 'rep-1',
      coverPath: preparedPath,
      coverProcessingVersion: ZLOG_COVER_PIPELINE_ID,
      signedCoverUrl: 'https://signed.example/prepared.jpg',
    })
    assert.equal(skipped.skipped, true)
    assert.equal(supabase.calls.uploads.length, 0)

    let bakeCalls = 0
    let fetchCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      fetchCalls += 1
      return {
        ok: true,
        async blob() {
          return jpegBlob('network-prepared')
        },
      }
    }
    try {
      await resolveCoverPdfSource('https://signed.example/prepared.jpg', {
        coverPath: preparedPath,
        localPreparedBlob: null,
        uprightCoverFn: async () => {
          bakeCalls += 1
          return 'data:image/jpeg;base64,baked'
        },
      })
      assert.equal(fetchCalls, 1)
      assert.equal(bakeCalls, 0)
      const counts = getShareTimingSnapshot().counts
      assert.equal(counts.coverOrientationBakeCount, 0)
      assert.equal(counts.coverPassThroughCount, 1)
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      else delete globalThis.fetch
    }
  })

  it('does not delete the historical legacy object', async () => {
    const start = coverSrc.indexOf('export async function migrateLegacyCoverIfNeeded')
    const end = coverSrc.indexOf('export async function coverBlobToPdfDataUrl')
    const body = coverSrc.slice(start, end)
    assert.ok(start > 0 && end > start)
    assert.doesNotMatch(body, /\.remove\(/)
    assert.doesNotMatch(body, /bestEffortRemoveCoverObject/)
    assert.doesNotMatch(body, /uploadRawCoverFallbackFile/)
    assert.doesNotMatch(body, /persistCanonicalCoverUpload/)
  })
})

describe('migration trigger is fresh PDF generate only', () => {
  it('runs from prepareSiteDiaryPdf, not cached-PDF Share or diary open', () => {
    const prepareStart = shareSrc.indexOf('export async function prepareSiteDiaryPdf')
    const prepareEnd = shareSrc.indexOf('export function snapshotUserActivation')
    const prepareBlock = shareSrc.slice(prepareStart, prepareEnd)
    assert.match(prepareBlock, /migrateLegacyCoverIfNeeded/)
    assert.match(prepareBlock, /resolveCoverPdfSource/)

    const saveIdx = diaryPage.indexOf('const handleSave')
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 36000)
    assert.match(saveBlock, /prepareSiteDiaryPdf/)
    assert.match(saveBlock, /coverMigrated/)
    assert.match(saveBlock, /coverPhotoStateAfterUpload/)

    assert.doesNotMatch(viewPage, /migrateLegacyCoverIfNeeded/)
    const hydrate = viewPage.slice(
      viewPage.indexOf('Hydrate durable share-ready PDF'),
      viewPage.indexOf('const handleGeneratePdf'),
    )
    assert.doesNotMatch(hydrate, /prepareSiteDiaryPdf/)
    const handler = viewPage.slice(
      viewPage.indexOf('const handleGeneratePdf'),
      viewPage.indexOf('const confirmDeleteDiary'),
    )
    const cacheShare = handler.slice(handler.indexOf("if (pdfCacheState !== 'ready'"))
    assert.doesNotMatch(cacheShare, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(cacheShare, /migrateLegacyCoverIfNeeded/)
  })
})
