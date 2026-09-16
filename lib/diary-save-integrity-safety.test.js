/**
 * Checkpoint 1C — atomic final-save RPC contract (client + failure modes).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DiarySaveError,
  FINALIZE_SITE_DIARY_SAVE_RPC,
  buildDesiredPhotoRowsForFinalize,
  finalizeSiteDiarySave,
} from './diary-save.js'
import {
  labourFormToPersistRows,
  plantFormToPersistRows,
  photoRowsToBaseline,
} from './diary-save-dirty.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_ID = 'rep-integrity-1'
const PROJECT_ID = 'proj-integrity-1'

function makeReportRow() {
  return {
    id: REPORT_ID,
    owner_id: 'user-1',
    project_id: PROJECT_ID,
    site_summary: 'baseline',
    shift: 'Day',
    actions: null,
    equipment_hire: [],
    report_date: '2026-08-05',
    created_at: '2026-08-05T00:00:00Z',
  }
}

function buildRpcOnlyMock({
  rpcError = null,
  cleanupJobs = [],
  storageRemoveError = null,
  markCleanupError = null,
  onRpc = null,
} = {}) {
  const rpcCalls = []
  const storageRemoved = []
  return {
    from(table) {
      throw new Error(`unexpected from(${table})`)
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      onRpc?.(name, args)
      if (name === 'mark_report_storage_cleanup') {
        return { data: markCleanupError ? 0 : 1, error: markCleanupError }
      }
      if (name === FINALIZE_SITE_DIARY_SAVE_RPC) {
        if (rpcError) return { data: null, error: rpcError }
        return {
          data: {
            ok: true,
            report_id: REPORT_ID,
            project_id: PROJECT_ID,
            report: makeReportRow(),
            labour_count: Array.isArray(args.p_labour) ? args.p_labour.length : 0,
            plant_count: Array.isArray(args.p_plant) ? args.p_plant.length : 0,
            photo_count: Array.isArray(args.p_photos) ? args.p_photos.length : 0,
            cleanupJobs,
          },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    },
    storage: {
      from() {
        return {
          async remove(paths) {
            storageRemoved.push(...paths)
            return { error: storageRemoveError || null }
          },
        }
      },
    },
    rpcCalls,
    storageRemoved,
  }
}

const priorLabour = labourFormToPersistRows([
  { trade: 'Bricklayer', company: 'Old Co', headcount: '3', hours: '8', notes: 'Prior' },
], REPORT_ID)

const nextLabour = labourFormToPersistRows([
  { trade: 'Carpenter', company: 'New Co', headcount: '2', hours: '7', notes: 'Next' },
], REPORT_ID)

test('labour: null p_labour skips labour domain on unchanged baseline', async () => {
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'baseline', shift: 'Day', report_date: '2026-08-05' },
    labourPayload: priorLabour,
    baseline: { reportRow: makeReportRow(), labour: priorLabour, plant: [], photos: [] },
  })
  assert.equal(supabase.rpcCalls.length, 0)
})

test('labour: populated array is sent to RPC for replacement', async () => {
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'baseline', shift: 'Day', report_date: '2026-08-05' },
    labourPayload: nextLabour,
    baseline: { reportRow: makeReportRow(), labour: priorLabour, plant: [], photos: [] },
  })
  assert.deepEqual(supabase.rpcCalls[0].args.p_labour, nextLabour)
})

test('labour: RPC failure throws without client child writes', async () => {
  const supabase = buildRpcOnlyMock({ rpcError: { message: 'insert failed' } })
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: REPORT_ID,
      projectId: PROJECT_ID,
      reportPayload: { site_summary: 'changed' },
      labourPayload: nextLabour,
      baseline: { reportRow: makeReportRow(), labour: priorLabour, plant: [], photos: [] },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(supabase.rpcCalls.length, 1)
})

test('labour: empty array clears via RPC payload', async () => {
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    labourPayload: [],
    baseline: { reportRow: makeReportRow(), labour: priorLabour, plant: [], photos: [] },
  })
  assert.deepEqual(supabase.rpcCalls[0].args.p_labour, [])
})

test('plant: empty array clears via RPC payload', async () => {
  const priorPlant = plantFormToPersistRows([
    { plant_type: 'Dumper', quantity: '1', hours: '4', notes: '' },
  ], REPORT_ID)
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'baseline', shift: 'Day', report_date: '2026-08-05' },
    plantPayload: [],
    baseline: { reportRow: makeReportRow(), labour: [], plant: priorPlant, photos: [] },
  })
  assert.deepEqual(supabase.rpcCalls[0].args.p_plant, [])
})

test('photos: duplicate desired url fails before RPC', () => {
  const url = 'user-1/rep/photos/a/report.jpg'
  assert.throws(
    () => buildDesiredPhotoRowsForFinalize({
      keptStoragePaths: [url, url],
      baselinePhotos: [{ url, caption: 'a', sequence: 1, layout: 'grid4' }],
    }),
    (err) => err instanceof DiarySaveError && err.code === 'PHOTOS_DUPLICATE_URL',
  )
})

test('photos: RPC failure does not run storage remove', async () => {
  const url = 'user-1/rep-1/photos/p1/report.jpg'
  const row = {
    id: 'photo-1',
    url,
    caption: 'Old',
    sequence: 1,
    layout: 'grid4',
    location: 'A',
    category: null,
    rotation_degrees: 0,
    assigned_to: null,
    thumbnail_path: 'user-1/rep-1/photos/p1/thumb.jpg',
  }
  const supabase = buildRpcOnlyMock({ rpcError: { message: 'photo upsert failed' } })
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: REPORT_ID,
      projectId: PROJECT_ID,
      reportPayload: { site_summary: 'changed' },
      keptStoragePaths: [url],
      updateExistingPhotos: [{ url, fields: { caption: 'New' } }],
      baseline: {
        reportRow: makeReportRow(),
        labour: [],
        plant: [],
        photos: photoRowsToBaseline([row]),
      },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(supabase.storageRemoved.length, 0)
})

test('photos: storage remove runs only after RPC success', async () => {
  const dropPath = 'user-1/rep-1/photos/drop/report.jpg'
  const thumbPath = 'user-1/rep-1/photos/drop/thumb.jpg'
  const supabase = buildRpcOnlyMock({
    cleanupJobs: [
      { id: 'job-1', path: dropPath },
      { id: 'job-2', path: thumbPath },
    ],
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    baseline: {
      reportRow: makeReportRow(),
      labour: [],
      plant: [],
      photos: photoRowsToBaseline([{
        id: 'p1',
        url: dropPath,
        caption: 'Drop',
        sequence: 1,
        layout: 'grid4',
        thumbnail_path: thumbPath,
      }]),
    },
  })
  assert.equal(result.diagnostic.ok, true)
  assert.deepEqual(supabase.storageRemoved, [dropPath, thumbPath])
  assert.equal(supabase.rpcCalls.filter((c) => c.name === 'mark_report_storage_cleanup').length, 1)
})

test('photos: storage failure still returns successful DB save', async () => {
  const supabase = buildRpcOnlyMock({
    cleanupJobs: [{ id: 'job-1', path: 'user-1/rep-1/photos/drop/report.jpg' }],
    storageRemoveError: { message: 'storage down' },
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    baseline: {
      reportRow: makeReportRow(),
      labour: [],
      plant: [],
      photos: photoRowsToBaseline([{
        id: 'p1',
        url: 'user-1/rep-1/photos/drop/report.jpg',
        caption: 'Drop',
        sequence: 1,
        layout: 'grid4',
      }]),
    },
  })
  assert.equal(result.cleanupPending, true)
  assert.equal(result.diagnostic.ok, true)
})

test('unchanged-diary fast path still skips RPC', async () => {
  const supabase = buildRpcOnlyMock()
  const row = makeReportRow()
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'baseline', shift: 'Day', report_date: '2026-08-05' },
    labourPayload: [],
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    baseline: { reportRow: row, labour: [], plant: [], photos: [] },
  })
  assert.deepEqual(result.skipped, {
    report: true,
    labour: true,
    plant: true,
    photos: true,
  })
  assert.equal(supabase.rpcCalls.length, 0)
})

test('migration preflight refuses duplicate (report_id, url) without auto-dedupe', () => {
  const sql = readFileSync(
    join(root, 'supabase/migrations/20260916120000_finalize_site_diary_save.sql'),
    'utf8',
  )
  assert.match(sql, /HAVING COUNT\(\*\) > 1/)
  assert.match(sql, /RAISE EXCEPTION/)
  assert.doesNotMatch(sql, /DELETE FROM public\.report_photos[\s\S]*duplicate/i)
  assert.match(sql, /report_photos_report_id_url_uidx/)
})

test('photos: p_photos [] clears all photos in RPC payload', async () => {
  const url = 'user-1/rep-1/photos/p1/report.jpg'
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    baseline: {
      reportRow: makeReportRow(),
      labour: [],
      plant: [],
      photos: photoRowsToBaseline([{
        url,
        caption: 'x',
        sequence: 1,
        layout: 'grid4',
      }]),
    },
  })
  assert.deepEqual(supabase.rpcCalls[0].args.p_photos, [])
})

test('photos: mark_report_storage_cleanup failure still returns successful save', async () => {
  const supabase = buildRpcOnlyMock({
    cleanupJobs: [{ id: 'job-1', path: 'user-1/rep-1/photos/drop/report.jpg' }],
    markCleanupError: { message: 'mark failed' },
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    baseline: {
      reportRow: makeReportRow(),
      labour: [],
      plant: [],
      photos: photoRowsToBaseline([{
        url: 'user-1/rep-1/photos/drop/report.jpg',
        caption: 'Drop',
        sequence: 1,
        layout: 'grid4',
      }]),
    },
  })
  assert.equal(result.diagnostic.ok, true)
  assert.equal(result.cleanupPending, true)
})

test('cleanup: retry RPC returns pending jobs for storage re-attempt', async () => {
  const pending = [{ id: 'job-pending-1', path: 'user-1/rep-1/photos/drop/report.jpg' }]
  const supabase = buildRpcOnlyMock({ cleanupJobs: pending })
  const baseline = {
    reportRow: makeReportRow(),
    labour: [],
    plant: [],
    photos: photoRowsToBaseline([{
      url: 'user-1/rep-1/photos/drop/report.jpg',
      caption: 'Drop',
      sequence: 1,
      layout: 'grid4',
    }]),
  }
  const first = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    baseline,
  })
  assert.equal(first.diagnostic.ok, true)
  const second = await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    keptStoragePaths: [],
    baseline,
  })
  assert.equal(second.diagnostic.ok, true)
  const finalizeCalls = supabase.rpcCalls.filter((c) => c.name === FINALIZE_SITE_DIARY_SAVE_RPC)
  assert.equal(finalizeCalls.length, 2)
})

test('finalize uses one RPC call for dirty domains', async () => {
  const supabase = buildRpcOnlyMock()
  await finalizeSiteDiarySave(supabase, {
    reportId: REPORT_ID,
    projectId: PROJECT_ID,
    reportPayload: { site_summary: 'changed' },
    labourPayload: nextLabour,
    plantPayload: plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
    ], REPORT_ID),
    baseline: { reportRow: makeReportRow(), labour: priorLabour, plant: [], photos: [] },
  })
  assert.equal(supabase.rpcCalls.length, 1)
  assert.equal(supabase.rpcCalls[0].name, FINALIZE_SITE_DIARY_SAVE_RPC)
})
