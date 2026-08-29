/**
 * Phase E — durable Save Area persistence.
 * Phase F2A — bounded concurrent persist (max 2).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHADOW_PREPARE_STATUS } from './shadow-ingest.js'
import { ZLOG_PHOTO_PIPELINE_ID } from './image-pipeline.js'
import {
  photoRowNeedsPreparedUpload,
  applyPreparedPersistToAreaPhoto,
  persistSaveAreaPhotoRow,
  persistSaveAreaGroup,
  SAVE_AREA_PERSIST_FAIL_MESSAGE,
  SAVE_AREA_PERSIST_CONCURRENCY,
} from './persist-save-area.js'
import {
  preparedReportStoragePath,
  preparedThumbnailStoragePath,
} from './persist-prepared-photo.js'
import { flattenAreaGroups } from '../ai-annotation/area-groups.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const locationWalk = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const persistSource = readFileSync(
  join(root, 'lib/photo-workspace/persist-save-area.js'),
  'utf8',
)

function readyShadow(photoId = 'photo-1') {
  return {
    id: photoId,
    file: new Blob(['raw-phone'], { type: 'image/jpeg' }),
    preview: 'blob:preview',
    acceptedDescription: `Caption ${photoId}`,
    rotationDegrees: 90,
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

function alreadyPersistedPhoto(photoId, userId = 'user-1', reportId = 'rep-1') {
  const reportPath = preparedReportStoragePath(userId, reportId, photoId)
  return {
    id: photoId,
    file: null,
    preview: null,
    acceptedDescription: `Caption ${photoId}`,
    rotationDegrees: 0,
    imageUrl: reportPath,
    storagePath: reportPath,
    thumbnailPath: preparedThumbnailStoragePath(userId, reportId, photoId),
    reportWidth: 1800,
    reportHeight: 1200,
    thumbnailWidth: 512,
    thumbnailHeight: 341,
    reportByteSize: 11,
    thumbnailByteSize: 10,
    processingVersion: ZLOG_PHOTO_PIPELINE_ID,
  }
}

/**
 * @param {{
 *   uploadDelayMs?: number,
 *   failPhotoIds?: Set<string>|string[],
 *   onUploadStart?: (path: string) => void,
 *   onUploadEnd?: (path: string) => void,
 * }} [opts]
 */
function mockSupabaseForSaveArea(opts = {}) {
  const uploadDelayMs = Number(opts.uploadDelayMs) || 0
  const failPhotoIds = opts.failPhotoIds instanceof Set
    ? opts.failPhotoIds
    : new Set(opts.failPhotoIds || [])
  const onUploadStart = typeof opts.onUploadStart === 'function' ? opts.onUploadStart : null
  const onUploadEnd = typeof opts.onUploadEnd === 'function' ? opts.onUploadEnd : null
  const uploaded = []
  const rows = []
  const bucket = {
    remove(paths) {
      return Promise.resolve({ data: paths, error: null })
    },
    async upload(path, blob) {
      onUploadStart?.(path)
      try {
        if (uploadDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, uploadDelayMs))
        }
        const photoId = String(path).split('/')[3] || ''
        if (failPhotoIds.has(photoId) && String(path).endsWith('/report.jpg')) {
          return Promise.resolve({ data: null, error: { message: `upload-fail-${photoId}` } })
        }
        uploaded.push({ path, blob })
        return Promise.resolve({ data: { path }, error: null })
      } finally {
        onUploadEnd?.(path)
      }
    },
  }

  function photoTable() {
    const filters = {}
    let pendingUpdate = null
    return {
      select() { return this },
      eq(col, val) {
        filters[col] = val
        if (pendingUpdate) {
          const idx = rows.findIndex((r) => r.id === val)
          if (idx >= 0) rows[idx] = { ...rows[idx], ...pendingUpdate }
          pendingUpdate = null
          return Promise.resolve({ error: null })
        }
        return this
      },
      maybeSingle() {
        const found = rows.find((r) => (
          (filters.report_id == null || r.report_id === filters.report_id)
          && (filters.url == null || r.url === filters.url)
        ))
        return Promise.resolve({ data: found || null, error: null })
      },
      insert(records) {
        rows.push(...records.map((r) => ({ ...r, id: `row-${rows.length + 1}` })))
        return Promise.resolve({ error: null })
      },
      update(fields) {
        pendingUpdate = fields
        return this
      },
    }
  }

  return {
    uploaded,
    rows,
    storage: { from: () => bucket },
    from(table) {
      assert.equal(table, 'report_photos')
      return photoTable()
    },
  }
}

describe('Phase E Save Area persistence helpers', () => {
  it('detects when a photo still needs prepared upload', () => {
    const photo = readyShadow('abc-123')
    assert.equal(photoRowNeedsPreparedUpload(photo, 'user-1', 'rep-1'), true)
    const path = preparedReportStoragePath('user-1', 'rep-1', 'abc-123')
    assert.equal(
      photoRowNeedsPreparedUpload({
        id: 'abc-123',
        imageUrl: path,
        file: null,
      }, 'user-1', 'rep-1'),
      false,
    )
  })

  it('uses Phase C deterministic report/thumb paths', () => {
    assert.equal(
      preparedReportStoragePath('user-1', 'rep-1', 'photo-1'),
      'user-1/rep-1/photos/photo-1/report.jpg',
    )
    assert.equal(
      preparedThumbnailStoragePath('user-1', 'rep-1', 'photo-1'),
      'user-1/rep-1/photos/photo-1/thumb.jpg',
    )
  })

  it('does not persist signed URLs on the area photo', () => {
    const out = applyPreparedPersistToAreaPhoto(readyShadow(), {
      reportPath: 'user-1/rep-1/photos/photo-1/report.jpg',
      thumbnailPath: 'user-1/rep-1/photos/photo-1/thumb.jpg',
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
    })
    assert.equal(out.imageUrl, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(out.file, null)
    assert.doesNotMatch(String(out.imageUrl), /^https?:/)
  })
})

describe('Phase E persistSaveAreaPhotoRow', () => {
  it('persists caption, area name, and layout metadata', async () => {
    const supabase = mockSupabaseForSaveArea()
    const group = {
      id: 'area-1',
      areaName: 'Ground Floor',
      layout: 'full',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const out = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Ground Floor',
      category: null,
    })
    assert.equal(out.ok, true)
    assert.equal(supabase.rows.length, 1)
    assert.equal(supabase.rows[0].caption, 'Caption photo-1')
    assert.equal(supabase.rows[0].location, 'Ground Floor')
    assert.equal(supabase.rows[0].layout, 'full')
    assert.equal(supabase.rows[0].rotation_degrees, 90)
    assert.equal(supabase.rows[0].url, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(supabase.rows[0].thumbnail_path, 'user-1/rep-1/photos/photo-1/thumb.jpg')
    assert.equal(supabase.rows[0].processing_version, ZLOG_PHOTO_PIPELINE_ID)
  })

  it('retry does not duplicate the DB row or storage assets', async () => {
    const supabase = mockSupabaseForSaveArea()
    const group = {
      id: 'area-1',
      areaName: 'Roof',
      layout: 'grid4',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const first = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Roof',
      category: null,
    })
    assert.equal(first.ok, true)
    const second = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: {
        ...row,
        file: null,
        storagePath: first.uploaded.reportPath,
        imageUrl: first.uploaded.reportPath,
        thumbnailPath: first.uploaded.thumbnailPath,
      },
      areaName: 'Roof',
      category: null,
    })
    assert.equal(second.ok, true)
    assert.equal(second.upsert.action, 'updated')
    assert.equal(supabase.rows.length, 1)
    assert.equal(supabase.uploaded.filter((u) => u.path.endsWith('/report.jpg')).length, 1)
  })

  it('thumb upload failure soft-fails and still persists authoritative report photo', async () => {
    const supabase = mockSupabaseForSaveArea()
    const bucket = supabase.storage.from()
    const baseUpload = bucket.upload.bind(bucket)
    bucket.upload = async (path, blob) => {
      if (String(path).endsWith('/thumb.jpg')) {
        return { data: null, error: { message: 'thumb-fail' } }
      }
      return baseUpload(path, blob)
    }
    const group = {
      id: 'area-1',
      areaName: 'Roof',
      layout: 'grid4',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const out = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Roof',
      category: null,
    })
    assert.equal(out.ok, true)
    assert.equal(out.uploaded.thumbFailed, true)
    assert.equal(out.uploaded.thumbnailPath, null)
    assert.equal(supabase.rows.length, 1)
    assert.equal(supabase.rows[0].url, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(supabase.rows[0].thumbnail_path, null)
  })

  it('report and thumb uploads overlap before DB upsert for one photo', async () => {
    /** @type {Array<{ path: string, resolve: () => void }>} */
    const gates = []
    const supabase = mockSupabaseForSaveArea()
    const bucket = supabase.storage.from()
    bucket.upload = (path, blob) => new Promise((resolve) => {
      gates.push({
        path: String(path),
        resolve: () => resolve({ data: { path }, error: null }),
        blob,
      })
    })

    const group = {
      id: 'area-1',
      areaName: 'Roof',
      layout: 'grid4',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const persistPromise = persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Roof',
      category: null,
    })

    await new Promise((r) => setImmediate(r))
    assert.equal(gates.length, 2)
    assert.equal(supabase.rows.length, 0)
    const paths = gates.map((g) => g.path).sort()
    assert.deepEqual(paths, [
      'user-1/rep-1/photos/photo-1/report.jpg',
      'user-1/rep-1/photos/photo-1/thumb.jpg',
    ])

    for (const gate of gates) gate.resolve()
    const out = await persistPromise
    assert.equal(out.ok, true)
    assert.equal(supabase.rows.length, 1)
  })
})

describe('Phase E persistSaveAreaGroup', () => {
  it('durably persists a new prepared photo area and returns updated walk', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Basement',
      layout: 'grid6',
      description: '',
      photos: [readyShadow('photo-1')],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    assert.equal(out.locationWalk[0].photos[0].imageUrl, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(out.locationWalk[0].photos[0].acceptedDescription, 'Caption photo-1')
    assert.equal(out.locationWalk[0].layout, 'grid6')
    assert.equal(supabase.rows.length, 1)
  })

  it('returns failure without mutating when prepare/upload fails', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Basement',
      layout: 'grid4',
      photos: [{ id: 'photo-1', acceptedDescription: 'Cap' }],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, false)
    assert.equal(supabase.rows.length, 0)
  })

  it('one-photo area still works', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Lift lobby',
      layout: 'grid4',
      photos: [readyShadow('solo')],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    assert.equal(out.locationWalk[0].photos.length, 1)
    assert.equal(supabase.rows.length, 1)
  })
})

describe('Phase F2A bounded concurrent Save Area persistence', () => {
  it('exports concurrency ceiling of 2 and uses mapWithConcurrency', () => {
    assert.equal(SAVE_AREA_PERSIST_CONCURRENCY, 2)
    assert.match(persistSource, /mapWithConcurrency/)
    assert.match(persistSource, /SAVE_AREA_PERSIST_CONCURRENCY/)
    assert.doesNotMatch(persistSource, /for \(let i = 0; i < rows\.length; i \+= 1\)/)
  })

  it('two independent photos overlap rather than run serially', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const starts = []
    const track = (path, delta) => {
      if (!String(path).endsWith('/report.jpg')) return
      if (delta > 0) {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        starts.push({ path, t: Date.now(), inFlight })
      } else {
        inFlight -= 1
      }
    }
    const supabase = mockSupabaseForSaveArea({
      uploadDelayMs: 40,
      onUploadStart(path) { track(path, 1) },
      onUploadEnd(path) { track(path, -1) },
    })
    const walk = [{
      id: 'area-1',
      areaName: 'Zone A',
      layout: 'grid4',
      photos: [readyShadow('photo-a'), readyShadow('photo-b')],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    assert.equal(SAVE_AREA_PERSIST_CONCURRENCY, 2)
    assert.equal(maxInFlight, 2)
    assert.equal(starts.length, 2)
    // Starts must be near-simultaneous — serial would separate them by a full upload.
    assert.ok(
      Math.abs(starts[0].t - starts[1].t) < 25,
      `report uploads should overlap; start delta=${Math.abs(starts[0].t - starts[1].t)}ms`,
    )
  })

  it('never exceeds concurrency 2 for 3+ photos', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const track = (path, delta) => {
      if (!String(path).endsWith('/report.jpg')) return
      inFlight += delta
      if (delta > 0) maxInFlight = Math.max(maxInFlight, inFlight)
    }
    const supabase = mockSupabaseForSaveArea({
      uploadDelayMs: 25,
      onUploadStart(path) { track(path, 1) },
      onUploadEnd(path) { track(path, -1) },
    })
    const walk = [{
      id: 'area-1',
      areaName: 'Zone B',
      layout: 'grid4',
      photos: [
        readyShadow('p1'),
        readyShadow('p2'),
        readyShadow('p3'),
        readyShadow('p4'),
      ],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    assert.equal(supabase.rows.length, 4)
    assert.ok(maxInFlight <= 2, `maxInFlight ${maxInFlight} exceeded 2`)
    assert.equal(maxInFlight, 2)
  })

  it('output photo ordering matches input ordering', async () => {
    const uploaded = []
    const rows = []
    const delays = { 'photo-a': 50, 'photo-b': 30, 'photo-c': 5 }
    const bucket = {
      remove(paths) {
        return Promise.resolve({ data: paths, error: null })
      },
      async upload(path, blob) {
        const photoId = String(path).split('/')[3] || ''
        const delay = delays[photoId] || 10
        await new Promise((r) => setTimeout(r, delay))
        uploaded.push({ path, blob, at: Date.now() })
        return Promise.resolve({ data: { path }, error: null })
      },
    }
    function photoTable() {
      const filters = {}
      let pendingUpdate = null
      return {
        select() { return this },
        eq(col, val) {
          filters[col] = val
          if (pendingUpdate) {
            const idx = rows.findIndex((r) => r.id === val)
            if (idx >= 0) rows[idx] = { ...rows[idx], ...pendingUpdate }
            pendingUpdate = null
            return Promise.resolve({ error: null })
          }
          return this
        },
        maybeSingle() {
          const found = rows.find((r) => (
            (filters.report_id == null || r.report_id === filters.report_id)
            && (filters.url == null || r.url === filters.url)
          ))
          return Promise.resolve({ data: found || null, error: null })
        },
        insert(records) {
          rows.push(...records.map((r) => ({ ...r, id: `row-${rows.length + 1}` })))
          return Promise.resolve({ error: null })
        },
        update(fields) {
          pendingUpdate = fields
          return this
        },
      }
    }
    const custom = {
      uploaded,
      rows,
      storage: { from: () => bucket },
      from(table) {
        assert.equal(table, 'report_photos')
        return photoTable()
      },
    }
    const walk = [{
      id: 'area-1',
      areaName: 'Ordered',
      layout: 'grid4',
      photos: [
        readyShadow('photo-a'),
        readyShadow('photo-b'),
        readyShadow('photo-c'),
      ],
    }]
    const out = await persistSaveAreaGroup(custom, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    const ids = out.locationWalk[0].photos.map((p) => p.id)
    assert.deepEqual(ids, ['photo-a', 'photo-b', 'photo-c'])
    const reportDone = uploaded
      .filter((u) => String(u.path).endsWith('/report.jpg'))
      .sort((a, b) => a.at - b.at)
      .map((u) => String(u.path).split('/')[3])
    // With concurrency 2, faster later slots can finish before slower earlier ones.
    assert.notDeepEqual(reportDone, ['photo-a', 'photo-b', 'photo-c'])
    assert.ok(reportDone.includes('photo-a'))
    assert.ok(reportDone.includes('photo-b'))
    assert.ok(reportDone.includes('photo-c'))
  })

  it('already-persisted photos do not re-upload', async () => {
    const supabase = mockSupabaseForSaveArea({ uploadDelayMs: 5 })
    const walk = [{
      id: 'area-1',
      areaName: 'Reuse',
      layout: 'grid4',
      photos: [
        alreadyPersistedPhoto('kept'),
        readyShadow('fresh'),
      ],
    }]
    supabase.rows.push({
      id: 'row-existing',
      report_id: 'rep-1',
      url: preparedReportStoragePath('user-1', 'rep-1', 'kept'),
      caption: 'Caption kept',
    })
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    const reportUploads = supabase.uploaded.filter((u) => String(u.path).endsWith('/report.jpg'))
    assert.equal(reportUploads.length, 1)
    assert.match(reportUploads[0].path, /\/fresh\/report\.jpg$/)
    assert.equal(supabase.rows.length, 2)
  })

  it('group retry after success does not duplicate DB/storage records', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Retry',
      layout: 'grid4',
      photos: [readyShadow('photo-1'), readyShadow('photo-2')],
    }]
    const first = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(first.ok, true)
    const second = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: first.locationWalk[0],
      locationWalk: first.locationWalk,
    })
    assert.equal(second.ok, true)
    assert.equal(supabase.rows.length, 2)
    assert.equal(
      supabase.uploaded.filter((u) => String(u.path).endsWith('/report.jpg')).length,
      2,
    )
  })

  it('partial failure does not falsely report success and leaves walk unchanged', async () => {
    const supabase = mockSupabaseForSaveArea({
      uploadDelayMs: 15,
      failPhotoIds: ['photo-b'],
    })
    const walk = [{
      id: 'area-1',
      areaName: 'Partial',
      layout: 'grid4',
      photos: [readyShadow('photo-a'), readyShadow('photo-b')],
    }]
    const snapshot = JSON.stringify(walk)
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, false)
    assert.equal(out.locationWalk, undefined)
    assert.equal(JSON.stringify(walk), snapshot)
    const urls = supabase.rows.map((r) => r.url)
    assert.ok(urls.every((u) => !String(u).includes('/photo-b/')))
  })

  it('partial failure remains retryable without duplicating the successful photo', async () => {
    const supabase = mockSupabaseForSaveArea({
      uploadDelayMs: 10,
      failPhotoIds: ['photo-b'],
    })
    const walk = [{
      id: 'area-1',
      areaName: 'Retry Partial',
      layout: 'grid4',
      photos: [readyShadow('photo-a'), readyShadow('photo-b')],
    }]
    const first = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(first.ok, false)
    assert.ok(supabase.rows.length >= 1)

    const retrySupabase = mockSupabaseForSaveArea()
    retrySupabase.rows.push(...supabase.rows.map((r) => ({ ...r })))
    const durableA = alreadyPersistedPhoto('photo-a')
    const retryWalk = [{
      id: 'area-1',
      areaName: 'Retry Partial',
      layout: 'grid4',
      photos: [durableA, readyShadow('photo-b')],
    }]
    const second = await persistSaveAreaGroup(retrySupabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: retryWalk[0],
      locationWalk: retryWalk,
    })
    assert.equal(second.ok, true)
    assert.equal(retrySupabase.rows.length, 2)
    assert.equal(
      retrySupabase.uploaded.filter((u) => String(u.path).endsWith('/report.jpg')).length,
      1,
    )
    assert.match(
      retrySupabase.uploaded.find((u) => String(u.path).endsWith('/report.jpg')).path,
      /\/photo-b\/report\.jpg$/,
    )
  })
})

describe('Phase E wiring contracts', () => {
  it('diary wires Save Area to durable persist helper', () => {
    assert.match(diaryPage, /persistSaveAreaGroup/)
    assert.match(diaryPage, /onAreaSaved=\{handleAreaSaved\}/)
    assert.match(diaryPage, /SAVE_AREA_PERSIST_FAIL_MESSAGE/)
  })

  it('Save Area waits for durable persist before success UI', () => {
    assert.match(locationWalk, /persistCommittedArea/)
    assert.match(locationWalk, /persistingArea/)
    assert.match(locationWalk, /finalizeAreaSave/)
  })

  it('Share path still uses prepared upload helpers for any remaining file photos', () => {
    assert.match(diaryPage, /ensurePreparedPhotoAssets/)
    assert.match(diaryPage, /uploadPreparedPhotoAssets/)
    assert.match(diaryPage, /photo\.file/)
  })

  it('failure copy is field-friendly', () => {
    assert.match(SAVE_AREA_PERSIST_FAIL_MESSAGE, /Save Area again/)
  })
})

describe('Phase E zero-photo diary reopen regression', () => {
  it('keeps capturing and persistingArea as separate useState hooks', () => {
    assert.match(locationWalk, /const \[capturing, setCapturing\] = useState\(false\)/)
    assert.match(locationWalk, /const \[persistingArea, setPersistingArea\] = useState\(false\)/)
    const captureDecl = locationWalk.indexOf('const [capturing, setCapturing] = useState(false)')
    const persistDecl = locationWalk.indexOf('const [persistingArea, setPersistingArea] = useState(false)')
    const captureRender = locationWalk.indexOf('{capturing ? (')
    assert.ok(captureDecl > 0 && captureRender > captureDecl)
    assert.ok(persistDecl > 0)
  })

  it('capture handlers still use setCapturing (not replaced by persistingArea)', () => {
    assert.match(locationWalk, /setCapturing\(true\)/)
    assert.match(locationWalk, /setCapturing\(false\)/)
    const handleFiles = locationWalk.slice(
      locationWalk.indexOf('const handleFiles'),
      locationWalk.indexOf('const applyCommittedArea'),
    )
    assert.match(handleFiles, /setCapturing\(true\)/)
    assert.match(handleFiles, /setCapturing\(false\)/)
    assert.doesNotMatch(handleFiles, /setPersistingArea/)
  })

  it('zero-photo hydrate clears locationWalk without calling Save Area persistence', () => {
    assert.deepEqual(flattenAreaGroups([]), [])
    assert.match(diaryPage, /setLocationWalk\(\[\]\)/)
    const loadStart = diaryPage.indexOf('loadGenerationRef')
    const handleAreaAt = diaryPage.indexOf('const handleAreaSaved')
    const firstPersistCall = diaryPage.indexOf('persistSaveAreaGroup(')
    assert.ok(handleAreaAt > 0 && firstPersistCall > handleAreaAt)
    assert.ok(loadStart > 0)
    assert.doesNotMatch(
      diaryPage.slice(0, handleAreaAt),
      /persistSaveAreaGroup\(/,
    )
  })

  it('markSessionExpired is declared before handleAreaSaved (no TDZ)', () => {
    const markAt = diaryPage.indexOf('const markSessionExpired = () =>')
    const handleAt = diaryPage.indexOf('const handleAreaSaved = useCallback')
    assert.ok(markAt > 0 && handleAt > markAt)
  })
})

describe('Phase E Save Area busy feedback + double-tap guard', () => {
  it('uses a synchronous persistingAreaRef lock separate from capturing/persistingArea state', () => {
    assert.match(locationWalk, /const persistingAreaRef = useRef\(false\)/)
    assert.match(locationWalk, /const \[capturing, setCapturing\] = useState\(false\)/)
    assert.match(locationWalk, /const \[persistingArea, setPersistingArea\] = useState\(false\)/)
  })

  it('second Save Area invocation exits immediately while the ref lock is held', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /if \(persistingAreaRef\.current\) return/)
    const lockAt = saveArea.indexOf('if (persistingAreaRef.current) return')
    const setTrueAt = saveArea.indexOf('persistingAreaRef.current = true')
    assert.ok(lockAt >= 0 && setTrueAt > lockAt)
  })

  it('first valid tap sets visible persisting state and Saving area… label', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /persistingAreaRef\.current = true/)
    assert.match(saveArea, /setPersistingArea\(true\)/)
    assert.match(locationWalk, /persistingArea \? 'Saving area…' : copy\.saveGroup/)
    assert.match(locationWalk, /disabled=\{capturing \|\| persistingArea\}/)
  })

  it('yields one paint frame before commit/persist heavy work', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(locationWalk, /yieldForSaveAreaPaint/)
    assert.match(locationWalk, /requestAnimationFrame/)
    const yieldAt = saveArea.indexOf('await yieldForSaveAreaPaint()')
    const commitAt = saveArea.indexOf('commitUnsavedPhotoAreaToWalk')
    const finalizeAt = saveArea.indexOf('finalizeAreaSave')
    assert.ok(yieldAt > 0 && commitAt > yieldAt && finalizeAt > commitAt)
  })

  it('releases busy state and ref lock after success or failure', () => {
    assert.match(locationWalk, /const releasePersistingBusy = useCallback/)
    assert.match(locationWalk, /persistingAreaRef\.current = false/)
    assert.match(locationWalk, /setPersistingArea\(false\)/)
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /finally \{\s*releasePersistingBusy\(\)/)
  })

  it('does not claim Area saved until finalizeAreaSave / applyCommittedArea', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /await finalizeAreaSave\(result\)/)
    assert.doesNotMatch(saveArea, /setPhase\('after_save'\)/)
    assert.match(locationWalk, /setPhase\('after_save'\)/)
    const applyAt = locationWalk.indexOf('const applyCommittedArea')
    const afterSaveAt = locationWalk.indexOf("setPhase('after_save')", applyAt)
    assert.ok(applyAt > 0 && afterSaveAt > applyAt)
  })
})
