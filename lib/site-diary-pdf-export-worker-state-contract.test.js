import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const MIGRATION_2C1 = join(root, 'supabase/migrations/20260921120000_site_diary_pdf_exports.sql')
const WORKER_MIGRATION = join(
  root,
  'supabase/migrations/20260921140000_site_diary_pdf_export_worker_state.sql',
)
const CONTRACT = join(root, 'docs/contracts/SITE_DIARY_PDF_EXPORT_JOB.md')
const PDF_ROUTE = join(root, 'app/api/site-diary/[reportId]/pdf/route.js')
const ASSEMBLE = join(root, 'lib/server/assemble-site-diary-pdf-props.js')
const RENDER = join(root, 'lib/server/render-site-diary-pdf.js')

function readWorkerMigration() {
  return readFileSync(WORKER_MIGRATION, 'utf8')
}

describe('SITE_DIARY_PDF_EXPORT_JOB worker state (2C-2A)', () => {
  const sql = readWorkerMigration()
  const sql2c1 = readFileSync(MIGRATION_2C1, 'utf8')
  const claimBody = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_next_site_diary_pdf_export'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_site_diary_pdf_export'),
  )

  it('A — original 2C-1 migration remains unchanged', () => {
    assert.doesNotMatch(sql2c1, /claim_next_site_diary_pdf_export/)
    assert.doesNotMatch(sql2c1, /lease_expires_at/)
    assert.doesNotMatch(sql2c1, /locked_by/)
    assert.doesNotMatch(sql2c1, /reclaim_count/)
  })

  it('B — new migration adds only worker-state delta', () => {
    assert.match(sql, /ALTER TABLE public\.site_diary_pdf_exports/)
    assert.match(sql, /claim_next_site_diary_pdf_export/)
    assert.match(sql, /complete_site_diary_pdf_export/)
    assert.match(sql, /fail_site_diary_pdf_export/)
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.site_diary_pdf_exports/)
    assert.doesNotMatch(sql, /enqueue_site_diary_pdf_export/)
  })

  it('C — lease_expires_at exists', () => {
    assert.match(sql, /lease_expires_at timestamptz/)
  })

  it('D — locked_by exists', () => {
    assert.match(sql, /locked_by text/)
  })

  it('E — reclaim_count exists with default 0', () => {
    assert.match(sql, /reclaim_count integer NOT NULL DEFAULT 0/)
  })

  it('F — reclaim_count cannot be negative', () => {
    assert.match(sql, /site_diary_pdf_exports_reclaim_count_chk/)
    assert.match(sql, /CHECK \(reclaim_count >= 0\)/)
  })

  it('G — claim uses FOR UPDATE SKIP LOCKED', () => {
    assert.match(claimBody, /FOR UPDATE SKIP LOCKED/)
  })

  it('H — claim is service_role-only', () => {
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_next_site_diary_pdf_export\(text\) TO service_role/)
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_next_site_diary_pdf_export\(text\) FROM authenticated/)
  })

  it('I — authenticated cannot execute worker RPCs', () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_site_diary_pdf_export\(uuid, text, bigint, text\) FROM authenticated/)
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.fail_site_diary_pdf_export\(uuid, text, text, text\) FROM authenticated/)
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.claim_next_site_diary_pdf_export\(text\) TO authenticated/)
  })

  it('J — queued jobs are preferred over stale processing', () => {
    assert.match(claimBody, /ORDER BY \(e\.status = 'processing'\)::integer ASC, e\.created_at ASC/)
    assert.match(claimBody, /e\.status = 'queued'/)
    assert.match(
      claimBody,
      /e\.status = 'processing'\s+AND e\.lease_expires_at IS NOT NULL\s+AND e\.lease_expires_at < now\(\)/,
    )
  })

  it('K — oldest queued job is preferred', () => {
    assert.match(claimBody, /created_at ASC/)
  })

  it('L — queued claim sets processing + 20-minute lease', () => {
    assert.match(claimBody, /status = 'processing'/)
    assert.match(claimBody, /lease_expires_at = now\(\) \+ interval '20 minutes'/)
    assert.match(claimBody, /started_at = COALESCE\(e\.started_at, now\(\)\)/)
    assert.match(claimBody, /locked_by = v_worker_id/)
  })

  it('M — stale reclaim increments reclaim_count', () => {
    assert.match(claimBody, /reclaim_count = e\.reclaim_count \+ 1/)
  })

  it('N — started_at is preserved on reclaim', () => {
    const staleUpdate = claimBody.slice(claimBody.indexOf('ELSE\n      UPDATE public.site_diary_pdf_exports e'))
    assert.doesNotMatch(staleUpdate, /started_at =/)
    assert.match(claimBody, /AND e\.reclaim_count < 3/)
  })

  it('O — maximum stale reclaims = 3', () => {
    assert.match(claimBody, /v_candidate\.reclaim_count >= 3/)
    assert.match(claimBody, /AND e\.reclaim_count < 3/)
  })

  it('P — exhausted stale job becomes failed/processing_timeout', () => {
    assert.match(claimBody, /error_code = 'processing_timeout'/)
    assert.match(claimBody, /status = 'failed'/)
    assert.match(claimBody, /PDF export timed out while processing\./)
  })

  it('Q — complete requires matching locked_by', () => {
    assert.match(sql, /AND e\.locked_by = v_worker_id/)
  })

  it('R — complete rejects expired lease', () => {
    assert.match(sql, /AND e\.lease_expires_at >= now\(\)/)
  })

  it('S — complete sets ready/storage_path/byte_size/completed_at', () => {
    const completeBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_site_diary_pdf_export'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fail_site_diary_pdf_export'),
    )
    assert.match(completeBody, /status = 'ready'/)
    assert.match(completeBody, /storage_path = v_path/)
    assert.match(completeBody, /byte_size = p_byte_size/)
    assert.match(completeBody, /completed_at = now\(\)/)
  })

  it('T — complete clears lease/lock', () => {
    const completeBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_site_diary_pdf_export'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fail_site_diary_pdf_export'),
    )
    assert.match(completeBody, /lease_expires_at = NULL/)
    assert.match(completeBody, /locked_by = NULL/)
  })

  it('U — fail requires matching locked_by', () => {
    const failBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fail_site_diary_pdf_export'))
    assert.match(failBody, /AND e\.locked_by = v_worker_id/)
  })

  it('V — fail sets failed/completed_at and clears lease/lock', () => {
    const failBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fail_site_diary_pdf_export'))
    assert.match(failBody, /status = 'failed'/)
    assert.match(failBody, /completed_at = now\(\)/)
    assert.match(failBody, /lease_expires_at = NULL/)
    assert.match(failBody, /locked_by = NULL/)
    assert.match(failBody, /left\(trim\(COALESCE\(p_error_message, ''\)\), 500\)/)
  })

  it('W — no heartbeat/extend RPC exists', () => {
    assert.doesNotMatch(sql, /extend_site_diary_pdf_export/)
    assert.doesNotMatch(sql, /heartbeat/)
  })

  it('X — no worker code exists', () => {
    const workerDirs = ['worker', 'workers', 'railway']
    for (const dir of workerDirs) {
      try {
        const entries = readdirSync(join(root, dir))
        assert.equal(entries.length, 0, `unexpected ${dir}/ contents`)
      } catch (err) {
        assert.equal(err.code, 'ENOENT')
      }
    }
    assert.doesNotMatch(sql, /assembleSiteDiaryPdfDocumentProps/)
    assert.doesNotMatch(sql, /renderSiteDiaryPdfBuffer/)
  })

  it('Y — no Storage bucket is created', () => {
    assert.doesNotMatch(sql, /INSERT INTO storage\.buckets/)
    assert.doesNotMatch(sql, /storage\.objects/)
  })

  it('Z — no client/API/PDF code is modified', () => {
    const route = readFileSync(PDF_ROUTE, 'utf8')
    assert.match(route, /sync-dev-only/)
    assert.doesNotMatch(route, /claim_next_site_diary_pdf_export/)
    assert.doesNotMatch(readFileSync(ASSEMBLE, 'utf8'), /claim_next_site_diary_pdf_export/)
    assert.doesNotMatch(readFileSync(RENDER, 'utf8'), /claim_next_site_diary_pdf_export/)
  })

  it('contract documents worker claim/lease semantics', () => {
    const doc = readFileSync(CONTRACT, 'utf8')
    assert.match(doc, /Phase 2C-2A/)
    assert.match(doc, /FOR UPDATE SKIP LOCKED/)
    assert.match(doc, /20 minutes/)
    assert.match(doc, /reclaim_count/)
    assert.match(doc, /service_role/)
    assert.match(doc, /complete_site_diary_pdf_export/)
    assert.match(doc, /fail_site_diary_pdf_export/)
  })

  it('queue claim indexes exist', () => {
    assert.match(sql, /site_diary_pdf_exports_queued_created_idx/)
    assert.match(sql, /WHERE status = 'queued'/)
    assert.match(sql, /site_diary_pdf_exports_processing_lease_idx/)
    assert.match(sql, /WHERE status = 'processing'/)
  })
})
