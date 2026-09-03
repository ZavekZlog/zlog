/**
 * Phase C — durable prepared report + thumbnail persistence helpers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ZLOG_PHOTO_PIPELINE_ID,
  ZLOG_REPORT_MAX_EDGE,
  ZLOG_THUMB_MAX_EDGE,
} from './image-pipeline.js'
import { SHADOW_PREPARE_STATUS } from './shadow-ingest.js'
import {
  sanitizePhotoStorageId,
  preparedReportStoragePath,
  preparedThumbnailStoragePath,
  isPreparedPhotoReadyForPersist,
  ensurePreparedPhotoAssets,
  uploadPreparedPhotoAssets,
  buildPreparedPhotoRecordFields,
  storagePathsForPhotoRow,
  collectLocalPreparedPdfPhotoSources,
  isPreparedWorkPhotoForPdfPassThrough,
} from './persist-prepared-photo.js'
import {
  LIVE_REPORT_PHOTOS,
  isMissingPreparedAssetColumnError,
  omitPreparedAssetColumns,
} from '../live-diary-schema.js'
import { flattenAreaGroups, groupPhotosByArea } from '../ai-annotation/area-groups.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260826140000_report_photos_prepared_assets.sql'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const diarySave = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
const pipelineSrc = readFileSync(join(root, 'lib/photo-workspace/image-pipeline.js'), 'utf8')

function readyShadow(photoId = 'photo-1') {
  return {
    id: photoId,
    file: new Blob(['raw-phone-original'], { type: 'image/jpeg' }),
    shadowPrepare: {
      status: SHADOW_PREPARE_STATUS.READY,
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
      report: {
        blob: new Blob(['REPORT-JPEG'], { type: 'image/jpeg' }),
        width: 1800,
        height: 1200,
        byteSize: 11,
        mimeType: 'image/jpeg',
      },
      thumbnail: {
        blob: new Blob(['THUMB-JPEG'], { type: 'image/jpeg' }),
        width: 512,
        height: 341,
        byteSize: 10,
        mimeType: 'image/jpeg',
      },
    },
  }
}

function mockStorageBucket() {
  const uploaded = []
  const removed = []
  return {
    uploaded,
    removed,
    remove(paths) {
      removed.push(...paths)
      return Promise.resolve({ data: paths, error: null })
    },
    upload(path, blob, opts) {
      uploaded.push({ path, blob, opts })
      return Promise.resolve({ data: { path }, error: null })
    },
  }
}

describe('Phase C storage paths', () => {
  it('builds deterministic report/thumb paths tied to photo id', () => {
    const report = preparedReportStoragePath('user-1', 'rep-1', 'abc-123')
    const thumb = preparedThumbnailStoragePath('user-1', 'rep-1', 'abc-123')
    assert.equal(report, 'user-1/rep-1/photos/abc-123/report.jpg')
    assert.equal(thumb, 'user-1/rep-1/photos/abc-123/thumb.jpg')
    assert.notEqual(report, thumb)
  })

  it('sanitizes unsafe photo ids', () => {
    assert.equal(sanitizePhotoStorageId('a/b c'), 'a-b-c')
    assert.equal(sanitizePhotoStorageId(''), null)
  })
})

describe('Phase C ready / ensure prepare', () => {
  it('accepts ready shadowPrepare with report+thumb blobs', () => {
    assert.equal(isPreparedPhotoReadyForPersist(readyShadow()), true)
  })

  it('rejects pending/failed/missing shadow', () => {
    assert.equal(isPreparedPhotoReadyForPersist({ shadowPrepare: { status: 'pending' } }), false)
    assert.equal(isPreparedPhotoReadyForPersist({}), false)
  })

  it('reuses ready shadow without re-prepare', async () => {
    let prepareCalls = 0
    const out = await ensurePreparedPhotoAssets(readyShadow(), {
      prepareFn: async () => {
        prepareCalls += 1
        throw new Error('should-not-run')
      },
    })
    assert.equal(out.ok, true)
    assert.equal(out.reused, true)
    assert.equal(prepareCalls, 0)
    assert.equal(out.pipelineId, ZLOG_PHOTO_PIPELINE_ID)
  })

  it('regenerates from file when shadow is missing', async () => {
    const photo = { file: new Blob(['src'], { type: 'image/jpeg' }) }
    const out = await ensurePreparedPhotoAssets(photo, {
      prepareFn: async () => ({
        pipelineId: ZLOG_PHOTO_PIPELINE_ID,
        report: { blob: new Blob(['R']), width: 100, height: 80, byteSize: 1 },
        thumbnail: { blob: new Blob(['T']), width: 50, height: 40, byteSize: 1 },
      }),
    })
    assert.equal(out.ok, true)
    assert.equal(out.reused, false)
  })

  it('does not reuse READY shadow when edit-session rotation is still pending', async () => {
    let prepareCalls = 0
    let extra = null
    const photo = { ...readyShadow(), rotationDegrees: 90 }
    const out = await ensurePreparedPhotoAssets(photo, {
      prepareFn: async (source, options = {}) => {
        prepareCalls += 1
        extra = options.extraRotationDegrees
        return {
          pipelineId: ZLOG_PHOTO_PIPELINE_ID,
          report: { blob: new Blob(['R90']), width: 80, height: 100, byteSize: 1 },
          thumbnail: { blob: new Blob(['T90']), width: 40, height: 50, byteSize: 1 },
        }
      },
    })
    assert.equal(out.ok, true)
    assert.equal(out.reused, false)
    assert.equal(prepareCalls, 1)
    assert.equal(extra, 90)
  })
})

describe('Phase C uploadPreparedPhotoAssets', () => {
  it('uploads report + thumb; DB fields point at report path; raw not uploaded', async () => {
    const bucket = mockStorageBucket()
    const supabase = { storage: { from: () => bucket } }
    const photo = readyShadow('pid-9')
    const raw = photo.file

    const uploaded = await uploadPreparedPhotoAssets(supabase, {
      userId: 'u1',
      reportId: 'r1',
      photoId: 'pid-9',
      reportBlob: photo.shadowPrepare.report.blob,
      thumbnailBlob: photo.shadowPrepare.thumbnail.blob,
      reportMeta: photo.shadowPrepare.report,
      thumbnailMeta: photo.shadowPrepare.thumbnail,
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
    })

    assert.equal(uploaded.reportPath, 'u1/r1/photos/pid-9/report.jpg')
    assert.equal(uploaded.thumbnailPath, 'u1/r1/photos/pid-9/thumb.jpg')
    assert.equal(bucket.uploaded.length, 2)
    const paths = bucket.uploaded.map((u) => u.path).sort()
    assert.deepEqual(paths, [
      'u1/r1/photos/pid-9/report.jpg',
      'u1/r1/photos/pid-9/thumb.jpg',
    ])
    const reportUpload = bucket.uploaded.find((u) => u.path.endsWith('/report.jpg'))
    const thumbUpload = bucket.uploaded.find((u) => u.path.endsWith('/thumb.jpg'))
    assert.notEqual(reportUpload.blob, raw)
    assert.equal(await reportUpload.blob.text(), 'REPORT-JPEG')
    assert.equal(await thumbUpload.blob.text(), 'THUMB-JPEG')

    const fields = buildPreparedPhotoRecordFields(uploaded)
    assert.equal(fields.url, uploaded.reportPath)
    assert.equal(fields.thumbnail_path, uploaded.thumbnailPath)
    assert.equal(fields.report_width, 1800)
    assert.equal(fields.report_height, 1200)
    assert.equal(fields.thumbnail_width, 512)
    assert.equal(fields.thumbnail_height, 341)
    assert.equal(fields.report_byte_size, 11)
    assert.equal(fields.thumbnail_byte_size, 10)
    assert.equal(fields.processing_version, ZLOG_PHOTO_PIPELINE_ID)
  })

  it('fails closed when report upload fails', async () => {
    const supabase = {
      storage: {
        from() {
          return {
            async remove() {
              return { error: null }
            },
            async upload() {
              return { error: { message: 'network' } }
            },
          }
        },
      },
    }
    await assert.rejects(
      () => uploadPreparedPhotoAssets(supabase, {
        userId: 'u1',
        reportId: 'r1',
        photoId: 'p1',
        reportBlob: new Blob(['R']),
        thumbnailBlob: new Blob(['T']),
      }),
      (err) => err.message === 'photo-upload-failed' && err.persistStage === 'photo',
    )
  })

  it('keeps report when thumbnail upload fails', async () => {
    const supabase = {
      storage: {
        from() {
          return {
            async remove() {
              return { error: null }
            },
            async upload(path) {
              if (String(path).endsWith('/thumb.jpg')) {
                return { error: { message: 'thumb-fail' } }
              }
              return { data: { path }, error: null }
            },
          }
        },
      },
    }
    const uploaded = await uploadPreparedPhotoAssets(supabase, {
      userId: 'u1',
      reportId: 'r1',
      photoId: 'p1',
      reportBlob: new Blob(['R']),
      thumbnailBlob: new Blob(['T']),
      reportMeta: { width: 10, height: 8, byteSize: 1 },
      thumbnailMeta: { width: 5, height: 4, byteSize: 1 },
    })
    assert.equal(uploaded.reportPath, 'u1/r1/photos/p1/report.jpg')
    assert.equal(uploaded.thumbnailPath, null)
    assert.equal(uploaded.thumbFailed, true)
    assert.equal(uploaded.thumbnailWidth, null)
    const fields = buildPreparedPhotoRecordFields(uploaded)
    assert.equal(fields.url, uploaded.reportPath)
    assert.equal(fields.thumbnail_path, null)
  })

  it('uploads report and thumbnail concurrently for the same photo', async () => {
    /** @type {Array<{ path: string, resolve: () => void }>} */
    const gates = []
    const supabase = {
      storage: {
        from() {
          return {
            async remove() {
              return { error: null }
            },
            upload(path) {
              return new Promise((resolve) => {
                gates.push({
                  path: String(path),
                  resolve: () => resolve({ data: { path }, error: null }),
                })
              })
            },
          }
        },
      },
    }

    const uploadPromise = uploadPreparedPhotoAssets(supabase, {
      userId: 'u1',
      reportId: 'r1',
      photoId: 'p1',
      reportBlob: new Blob(['R']),
      thumbnailBlob: new Blob(['T']),
    })

    await new Promise((r) => setImmediate(r))
    assert.equal(gates.length, 2)
    const paths = gates.map((g) => g.path).sort()
    assert.deepEqual(paths, [
      'u1/r1/photos/p1/report.jpg',
      'u1/r1/photos/p1/thumb.jpg',
    ])

    for (const gate of gates) gate.resolve()
    const uploaded = await uploadPromise
    assert.equal(uploaded.reportPath, 'u1/r1/photos/p1/report.jpg')
    assert.equal(uploaded.thumbnailPath, 'u1/r1/photos/p1/thumb.jpg')
  })

  it('invokes onAssetUploadTiming with per-asset and wall durations', async () => {
    const bucket = mockStorageBucket()
    const supabase = { storage: { from: () => bucket } }
    const timings = []
    await uploadPreparedPhotoAssets(supabase, {
      userId: 'u1',
      reportId: 'r1',
      photoId: 'p1',
      reportBlob: new Blob(['R']),
      thumbnailBlob: new Blob(['T']),
      onAssetUploadTiming: (timing) => timings.push(timing),
    })
    assert.equal(timings.length, 1)
    assert.equal(typeof timings[0].reportMs, 'number')
    assert.equal(typeof timings[0].thumbMs, 'number')
    assert.equal(typeof timings[0].wallMs, 'number')
    assert.ok(timings[0].wallMs >= 0)
  })

  it('retry uses same deterministic paths (remove-then-upload)', async () => {
    const bucket = mockStorageBucket()
    const supabase = { storage: { from: () => bucket } }
    const args = {
      userId: 'u1',
      reportId: 'r1',
      photoId: 'same-id',
      reportBlob: new Blob(['R1']),
      thumbnailBlob: new Blob(['T1']),
    }
    const first = await uploadPreparedPhotoAssets(supabase, args)
    const second = await uploadPreparedPhotoAssets(supabase, {
      ...args,
      reportBlob: new Blob(['R2']),
      thumbnailBlob: new Blob(['T2']),
    })
    assert.equal(first.reportPath, second.reportPath)
    assert.equal(first.thumbnailPath, second.thumbnailPath)
    assert.ok(bucket.removed.includes(first.reportPath))
    assert.ok(bucket.removed.includes(first.thumbnailPath))
  })
})

describe('Phase C delete path collection', () => {
  it('new architecture rows include report + thumbnail', () => {
    assert.deepEqual(
      storagePathsForPhotoRow({
        url: 'u/r/photos/p/report.jpg',
        thumbnail_path: 'u/r/photos/p/thumb.jpg',
      }),
      ['u/r/photos/p/report.jpg', 'u/r/photos/p/thumb.jpg'],
    )
  })

  it('legacy rows with null thumbnail only list canonical url', () => {
    assert.deepEqual(
      storagePathsForPhotoRow({ url: 'u/r/1-legacy.jpg', thumbnail_path: null }),
      ['u/r/1-legacy.jpg'],
    )
  })
})

describe('Phase C legacy schema fallback', () => {
  it('omitPreparedAssetColumns keeps url and drops new metadata', () => {
    const stripped = omitPreparedAssetColumns({
      url: 'u/r/photos/p/report.jpg',
      thumbnail_path: 'u/r/photos/p/thumb.jpg',
      processing_version: ZLOG_PHOTO_PIPELINE_ID,
      caption: 'Steel',
    })
    assert.equal(stripped.url, 'u/r/photos/p/report.jpg')
    assert.equal(stripped.caption, 'Steel')
    assert.equal(stripped.thumbnail_path, undefined)
    assert.equal(stripped.processing_version, undefined)
  })

  it('detects missing prepared-column PostgREST errors', () => {
    assert.equal(
      isMissingPreparedAssetColumnError({
        code: 'PGRST204',
        message: "Could not find the 'thumbnail_path' column of 'report_photos' in the schema cache",
      }),
      true,
    )
    assert.equal(
      isMissingPreparedAssetColumnError({
        code: 'PGRST204',
        message: "Could not find the 'is_draft' column",
      }),
      false,
    )
  })

  it('LIVE_REPORT_PHOTOS lists prepared columns as nullable allowlist entries', () => {
    for (const col of LIVE_REPORT_PHOTOS.preparedAssetColumns) {
      assert.ok(LIVE_REPORT_PHOTOS.columns.includes(col))
    }
  })
})

describe('Phase C hydrate / flatten passthrough', () => {
  it('legacy hydrate without thumbnail remains valid', () => {
    const flat = [{
      id: 'db-1',
      url: 'u/legacy.jpg',
      caption: 'Old',
      location: 'Roof',
      sequence: 1,
      layout: 'grid4',
      rotation_degrees: 90,
      thumbnail_path: null,
    }]
    const walk = groupPhotosByArea(flat.map((p) => ({
      ...p,
      storagePath: p.url,
      thumbnailPath: p.thumbnail_path,
    })))
    assert.equal(walk[0].photos[0].imageUrl, 'u/legacy.jpg')
    assert.equal(walk[0].photos[0].thumbnailPath, null)
    assert.equal(walk[0].photos[0].rotationDegrees, 90)
    assert.equal(walk[0].photos[0].acceptedDescription, 'Old')
  })

  it('preserves captions, order, area, rotation, shadowPrepare through flatten', () => {
    const shadow = readyShadow('p1').shadowPrepare
    const walk = [{
      id: 'area-1',
      areaName: 'Basement',
      description: 'Notes',
      layout: 'grid4',
      photos: [{
        id: 'p1',
        file: new Blob(['x']),
        preview: 'blob:x',
        acceptedDescription: 'Cap A',
        rotationDegrees: 180,
        shadowPrepare: shadow,
        annotations: { strokes: [{ id: 1 }] },
      }],
    }]
    const flat = flattenAreaGroups(walk)
    assert.equal(flat[0].caption, 'Cap A')
    assert.equal(flat[0].location, 'Basement')
    assert.equal(flat[0].rotationDegrees, 180)
    assert.equal(flat[0].shadowPrepare, shadow)
    assert.deepEqual(flat[0].annotations, { strokes: [{ id: 1 }] })
  })
})

describe('collectLocalPreparedPdfPhotoSources', () => {
  const userId = 'user-1'
  const reportId = 'rep-1'

  it('maps READY report Blob by canonical report.jpg path, not array index', () => {
    const photoA = readyShadow('photo-a')
    const photoB = readyShadow('photo-b')
    photoA.storagePath = preparedReportStoragePath(userId, reportId, 'photo-a')
    photoB.storagePath = preparedReportStoragePath(userId, reportId, 'photo-b')
    photoA.file = null
    photoB.file = null
    const mapped = collectLocalPreparedPdfPhotoSources({
      photos: [photoB, photoA],
      userId,
      reportId,
    })
    assert.equal(mapped.size, 2)
    assert.equal(mapped.get(photoA.storagePath), photoA.shadowPrepare.report.blob)
    assert.equal(mapped.get(photoB.storagePath), photoB.shadowPrepare.report.blob)
    assert.notEqual(mapped.get(photoA.storagePath), photoB.shadowPrepare.report.blob)
  })

  it('never uses thumbnail, preview, or original File as the PDF report source', () => {
    const photo = readyShadow('photo-1')
    photo.storagePath = preparedReportStoragePath(userId, reportId, 'photo-1')
    photo.preview = 'blob:preview-original'
    photo.file = new Blob(['ORIGINAL-CAPTURE'], { type: 'image/jpeg' })
    const mapped = collectLocalPreparedPdfPhotoSources({
      photos: [photo],
      userId,
      reportId,
    })
    const blob = mapped.get(photo.storagePath)
    assert.equal(blob, photo.shadowPrepare.report.blob)
    assert.notEqual(blob, photo.shadowPrepare.thumbnail.blob)
    assert.notEqual(blob, photo.file)
  })

  it('requires READY shadowPrepare and matching durable report path', () => {
    const pending = readyShadow('pending-1')
    pending.shadowPrepare.status = SHADOW_PREPARE_STATUS.PENDING
    pending.storagePath = preparedReportStoragePath(userId, reportId, 'pending-1')

    const mismatched = readyShadow('mismatch-1')
    mismatched.storagePath = 'other-user/rep-1/photos/mismatch-1/report.jpg'

    const noBlob = readyShadow('empty-1')
    noBlob.storagePath = preparedReportStoragePath(userId, reportId, 'empty-1')
    noBlob.shadowPrepare.report.blob = null

    const mapped = collectLocalPreparedPdfPhotoSources({
      photos: [pending, mismatched, noBlob],
      userId,
      reportId,
    })
    assert.equal(mapped.size, 0)
  })
})

describe('Phase C wiring + migration contracts', () => {
  it('migration is additive nullable and includes thumbnail_path in delete RPC', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS thumbnail_path text/)
    assert.match(migration, /ADD COLUMN IF NOT EXISTS processing_version text/)
    assert.match(migration, /report_width/)
    assert.match(migration, /thumbnail_byte_size/)
    assert.doesNotMatch(migration, /DROP COLUMN/i)
    assert.match(migration, /to_jsonb\(rp\)->>'thumbnail_path'/)
    assert.match(migration, /to_jsonb\(other_photo\)->>'thumbnail_path'/)
  })

  it('Share path uses prepared upload helpers (not raw phone file upload)', () => {
    assert.match(diaryPage, /ensurePreparedPhotoAssets/)
    assert.match(diaryPage, /uploadPreparedPhotoAssets/)
    assert.match(diaryPage, /buildPreparedPhotoRecordFields/)
    assert.doesNotMatch(
      diaryPage,
      /upload\(storagePath, photo\.file/,
    )
  })

  it('Share persist of a newly prepared photo stores rotation 0 and overlays the baked JPEG for PDF', () => {
    const fileBranchStart = diaryPage.indexOf('if (photo.file) {')
    const storageBranchStart = diaryPage.indexOf('if (photo.storagePath) {', fileBranchStart)
    assert.ok(fileBranchStart > 0 && storageBranchStart > fileBranchStart)
    const newPhotoPersist = diaryPage.slice(fileBranchStart, storageBranchStart)
    assert.match(newPhotoPersist, /ensurePreparedPhotoAssets/)
    assert.match(newPhotoPersist, /rotation_degrees: 0/)
    assert.doesNotMatch(newPhotoPersist, /rotation_degrees: Number\(photo\.rotationDegrees\)/)
    assert.match(diaryPage, /sharePreparedPdfBlobs\.set\(uploaded\.reportPath, prepared\.report\.blob\)/)
    const updatePersist = diaryPage.slice(storageBranchStart, diaryPage.indexOf("return { kind: 'skip' }"))
    assert.match(updatePersist, /rotation_degrees: Number\(photo\.rotationDegrees\) \|\| 0/)
  })

  it('reopened diary maps persisted rotation_degrees with no extra bake field', () => {
    assert.match(diaryPage, /rotationDegrees: p\.rotation_degrees \?\? 0/)
  })

  it('reconcile cleans both storage paths and falls back without prepared columns', () => {
    assert.match(diarySave, /storagePathsForPhotoRow/)
    assert.match(diarySave, /omitPreparedAssetColumns/)
    assert.match(diarySave, /isMissingPreparedAssetColumnError/)
  })

  it('pipeline constants remain 2400 / 512 with no crop', () => {
    assert.equal(ZLOG_REPORT_MAX_EDGE, 2400)
    assert.equal(ZLOG_THUMB_MAX_EDGE, 512)
    assert.match(pipelineSrc, /NO CROPPING|no crop|contain/i)
    assert.doesNotMatch(pipelineSrc, /drawImage\([^)]+,\s*sx\s*,/)
  })
})

describe('prepared work-photo PDF pass-through eligibility', () => {
  it('allows pass-through for pipeline photos with neutral rotation', () => {
    assert.equal(
      isPreparedWorkPhotoForPdfPassThrough({
        processing_version: ZLOG_PHOTO_PIPELINE_ID,
        rotation_degrees: 0,
      }),
      true,
    )
  })

  it('keeps non-zero rotation on the legacy bake path', () => {
    assert.equal(
      isPreparedWorkPhotoForPdfPassThrough({
        processing_version: ZLOG_PHOTO_PIPELINE_ID,
        rotation_degrees: 90,
      }),
      false,
    )
  })

  it('allows same-session local READY blob with rotation 0', () => {
    assert.equal(
      isPreparedWorkPhotoForPdfPassThrough(
        { rotationDegrees: 0 },
        { hasLocalPreparedBlob: true },
      ),
      true,
    )
  })

  it('hydrated prepared photo with rotation 0 remains pass-through after reopen', () => {
    assert.equal(
      isPreparedWorkPhotoForPdfPassThrough({
        processingVersion: ZLOG_PHOTO_PIPELINE_ID,
        rotationDegrees: 0,
      }),
      true,
    )
  })
})
