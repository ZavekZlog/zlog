/**
 * Checkpoint 1D — finalize_site_diary_save RPC + client contract.
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
  finalizeLabourOnly,
  finalizeSiteDiarySave,
} from './diary-save.js'
import { photoRowsToBaseline } from './diary-save-dirty.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION = join(root, 'supabase/migrations/20260916120000_finalize_site_diary_save.sql')

function readMigration() {
  return readFileSync(MIGRATION, 'utf8')
}

test('migration defines SECURITY DEFINER finalize_site_diary_save for authenticated only', () => {
  const sql = readMigration()
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.finalize_site_diary_save/)
  assert.match(sql, /SECURITY DEFINER/)
  assert.match(sql, /search_path = pg_catalog, public/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finalize_site_diary_save\(uuid, uuid, jsonb, jsonb, jsonb, jsonb\)/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.finalize_site_diary_save\(uuid, uuid, jsonb, jsonb, jsonb, jsonb\) TO authenticated/)
  assert.match(sql, /IF v_user_id IS NULL THEN[\s\S]*RAISE EXCEPTION 'Authentication required'/)
  assert.match(sql, /p\.owner_id = v_user_id/)
  assert.match(sql, /dr\.project_id = p_project_id/)
  assert.match(sql, /FOR UPDATE OF dr/)
})

test('migration rejects duplicate and blank photo urls before mutation', () => {
  const sql = readMigration()
  assert.match(sql, /Duplicate photo url in desired set/)
  assert.match(sql, /non-blank canonical url/)
})

test('migration photo upsert preserves omitted JSON keys on conflict', () => {
  const sql = readMigration()
  assert.match(sql, /WHEN v_elem \? 'report_width'/)
  assert.match(sql, /ELSE public\.report_photos\.report_width/)
  assert.match(sql, /WHEN v_elem \? 'caption'/)
})

test('migration returns all pending cleanup jobs for report on success', () => {
  const sql = readMigration()
  assert.match(sql, /FROM public\.report_storage_cleanup_jobs j/)
  assert.match(sql, /j\.status = 'pending'/)
  assert.match(sql, /j\.report_module = 'site-diary'/)
})

test('migration blocks same-report cover/signature/logo cleanup candidates', () => {
  const sql = readMigration()
  assert.match(sql, /FROM public\.daily_reports self_dr/)
  assert.match(sql, /self_dr\.id = p_report_id/)
  assert.match(sql, /self_dr\.cover_photo_url/)
})

test('migration dedupes pending cleanup job inserts', () => {
  const sql = readMigration()
  assert.match(sql, /FROM public\.report_storage_cleanup_jobs existing_job/)
  assert.match(sql, /existing_job\.status = 'pending'/)
})

test('migration cleanup outbox INSERT is direct (no discarded SELECT from inserted CTE)', () => {
  const sql = readMigration()
  assert.doesNotMatch(sql, /SELECT 1 FROM inserted/)
  assert.match(sql, /INSERT INTO public\.report_storage_cleanup_jobs/)
  assert.match(sql, /FROM safe_candidates safe/)
})

test('migration rejects malformed non-object report patch; NULL patch remains valid skip', () => {
  const sql = readMigration()
  assert.match(
    sql,
    /IF p_report_patch IS NOT NULL AND jsonb_typeof\(p_report_patch\) <> 'object' THEN[\s\S]*RAISE EXCEPTION 'Report patch must be a JSON object'/,
  )
  assert.match(sql, /IF p_report_patch IS NOT NULL THEN[\s\S]*UPDATE public\.daily_reports dr/)
  assert.doesNotMatch(sql, /jsonb_typeof\(p_report_patch\) = 'object' THEN/)
})

test('buildDesiredPhotoRowsForFinalize is stable for retry inputs', () => {
  const baseline = [{
    url: 'user/u/rep/p/report.jpg',
    caption: 'A',
    sequence: 1,
    layout: 'grid4',
    location: 'North',
    category: null,
    rotation_degrees: 0,
    assigned_to: null,
    thumbnail_path: 'user/u/rep/p/thumb.jpg',
  }]
  const input = {
    keptStoragePaths: [baseline[0].url],
    photoRecords: [],
    updateExistingPhotos: [{ url: baseline[0].url, fields: { caption: 'B' } }],
    baselinePhotos: baseline,
  }
  const a = buildDesiredPhotoRowsForFinalize(input)
  const b = buildDesiredPhotoRowsForFinalize(input)
  assert.deepEqual(a, b)
  assert.equal(a[0].caption, 'B')
})

test('desired photo caption-only omits prepared fields for SQL preserve semantics', () => {
  const url = 'user-1/rep-1/photos/p1/report.jpg'
  const persisted = {
    url,
    caption: 'Old',
    sequence: 1,
    layout: 'grid4',
    report_width: 800,
    report_height: 600,
  }
  const rows = buildDesiredPhotoRowsForFinalize({
    keptStoragePaths: [url],
    updateExistingPhotos: [{ url, fields: { caption: 'New' } }],
    baselinePhotos: photoRowsToBaseline([persisted]),
  })
  assert.equal(rows[0].caption, 'New')
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], 'report_width'), false)
})

test('desired photo missing baseline row fails closed', () => {
  assert.throws(
    () => buildDesiredPhotoRowsForFinalize({
      keptStoragePaths: ['user-1/rep/missing/report.jpg'],
      baselinePhotos: [],
    }),
    (err) => err instanceof DiarySaveError && err.code === 'PHOTOS_MISSING_ROW',
  )
})

test('finalizeSiteDiarySave rejects wrong RPC report_id', async () => {
  const supabase = {
    from() { throw new Error('from must not run') },
    async rpc(name) {
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) throw new Error(name)
      return {
        data: {
          ok: true,
          report_id: 'wrong-id',
          project_id: 'proj-1',
          report: { id: 'wrong-id', project_id: 'proj-1' },
          cleanupJobs: [],
        },
        error: null,
      }
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'x' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
  )
})

test('finalizeSiteDiarySave rejects wrong RPC project_id', async () => {
  const supabase = {
    from() { throw new Error('from must not run') },
    async rpc(name) {
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) throw new Error(name)
      return {
        data: {
          ok: true,
          report_id: 'rep-1',
          project_id: 'wrong-proj',
          report: { id: 'rep-1', project_id: 'wrong-proj' },
          cleanupJobs: [],
        },
        error: null,
      }
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'x' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
  )
})

test('finalizeLabourOnly calls RPC with labour-only null domains', async () => {
  const rpcCalls = []
  const labour = [{
    report_id: 'rep-1',
    trade: 'Bricklaying',
    company: 'Co',
    count: 2,
    hours: 16,
    notes: null,
    sequence: 0,
  }]
  const supabase = {
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) throw new Error(name)
      return {
        data: {
          ok: true,
          report_id: 'rep-1',
          project_id: 'proj-1',
          report: { id: 'rep-1', project_id: 'proj-1' },
          labour_count: 1,
          cleanupJobs: [{ id: 'job-1', path: 'user/u/rep/p/report.jpg' }],
        },
        error: null,
      }
    },
    storage: {
      from() {
        throw new Error('storage must not run for finalizeLabourOnly')
      },
    },
  }
  const result = await finalizeLabourOnly(supabase, 'rep-1', 'proj-1', labour)
  assert.equal(result.id, 'rep-1')
  assert.equal(result.labourCount, 1)
  assert.equal(rpcCalls.length, 1)
  assert.deepEqual(rpcCalls[0].args, {
    p_report_id: 'rep-1',
    p_project_id: 'proj-1',
    p_report_patch: null,
    p_labour: labour,
    p_plant: null,
    p_photos: null,
  })
})

test('finalizeLabourOnly does not call processFinalizeStorageCleanup', () => {
  const saveSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'diary-save.js'), 'utf8')
  const body = saveSrc.slice(
    saveSrc.indexOf('export async function finalizeLabourOnly'),
    saveSrc.indexOf('export async function finalizeSiteDiarySave'),
  )
  assert.doesNotMatch(body, /processFinalizeStorageCleanup/)
})

test('finalizeLabourOnly rejects RPC report_id mismatch', async () => {
  const supabase = {
    from() { throw new Error('from must not run') },
    async rpc(name) {
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) throw new Error(name)
      return {
        data: {
          ok: true,
          report_id: 'wrong-id',
          project_id: 'proj-1',
          report: { id: 'wrong-id', project_id: 'proj-1' },
          cleanupJobs: [],
        },
        error: null,
      }
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }
  await assert.rejects(
    () => finalizeLabourOnly(supabase, 'rep-1', 'proj-1', []),
    (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
  )
})

test('finalizeSiteDiarySave rejects RPC report.id mismatch', async () => {
  const supabase = {
    from() { throw new Error('from must not run') },
    async rpc(name) {
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) throw new Error(name)
      return {
        data: {
          ok: true,
          report_id: 'rep-1',
          project_id: 'proj-1',
          report: { id: 'other-id', project_id: 'proj-1' },
          cleanupJobs: [],
        },
        error: null,
      }
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'x' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
  )
})
