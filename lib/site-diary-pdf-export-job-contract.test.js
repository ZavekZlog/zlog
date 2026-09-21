import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const MIGRATION = join(root, 'supabase/migrations/20260921120000_site_diary_pdf_exports.sql')
const CONTRACT = join(root, 'docs/contracts/SITE_DIARY_PDF_EXPORT_JOB.md')
const PDF_ROUTE = join(root, 'app/api/site-diary/[reportId]/pdf/route.js')
const ASSEMBLE = join(root, 'lib/server/assemble-site-diary-pdf-props.js')
const RENDER = join(root, 'lib/server/render-site-diary-pdf.js')

function readMigration() {
  return readFileSync(MIGRATION, 'utf8')
}

describe('SITE_DIARY_PDF_EXPORT_JOB migration contract', () => {
  const sql = readMigration()

  it('A — table name is site_diary_pdf_exports', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.site_diary_pdf_exports/)
    assert.match(readFileSync(CONTRACT, 'utf8'), /site_diary_pdf_exports/)
  })

  it('B — RLS is enabled with owner-only SELECT', () => {
    assert.match(sql, /ALTER TABLE public\.site_diary_pdf_exports ENABLE ROW LEVEL SECURITY/)
    assert.match(sql, /CREATE POLICY "site_diary_pdf_exports_select_own"/)
    assert.match(sql, /USING \(owner_id = auth\.uid\(\)\)/)
  })

  it('C — status constraint allows only queued / processing / ready / failed', () => {
    assert.match(sql, /site_diary_pdf_exports_status_chk/)
    assert.match(sql, /CHECK \(status IN \('queued', 'processing', 'ready', 'failed'\)\)/)
  })

  it('D/E — active partial unique index; ready not in predicate', () => {
    assert.match(sql, /site_diary_pdf_exports_active_uidx/)
    assert.match(
      sql,
      /ON public\.site_diary_pdf_exports \(report_id, content_fingerprint\)\s+WHERE status IN \('queued', 'processing'\)/,
    )
    assert.doesNotMatch(sql, /WHERE status IN \('queued', 'processing', 'ready'\)/)
  })

  it('fingerprint format constraint', () => {
    assert.match(sql, /site_diary_pdf_exports_fingerprint_format_chk/)
    assert.match(sql, /CHECK \(content_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  })

  it('F/G — enqueue does not accept owner_id; verifies ownership', () => {
    assert.match(sql, /FUNCTION public\.enqueue_site_diary_pdf_export\(\s*p_report_id uuid,\s*p_content_fingerprint text,\s*p_snapshot_version integer/)
    assert.doesNotMatch(sql, /p_owner_id/)
    assert.match(sql, /p\.owner_id = v_user_id/)
    assert.match(sql, /INNER JOIN public\.projects p ON p\.id = dr\.project_id/)
  })

  it('H — ready row is reused (no new insert)', () => {
    assert.match(sql, /AND e\.status = 'ready'/)
    assert.match(sql, /IF FOUND THEN\s+RETURN to_jsonb\(v_row\);/s)
  })

  it('I — active queued/processing row is reused', () => {
    assert.match(sql, /AND e\.status IN \('queued', 'processing'\)/)
    assert.match(sql, /WHEN unique_violation THEN/)
  })

  it('J — failed is not treated as ready cache', () => {
    const enqueueBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_site_diary_pdf_export'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_site_diary_pdf_export'),
    )
    assert.doesNotMatch(enqueueBody, /status = 'failed'[\s\S]*RETURN to_jsonb\(v_row\)/)
    assert.match(enqueueBody, /COALESCE\(MAX\(e\.attempt\), 0\) \+ 1/)
  })

  it('K — storage bucket site-diary-pdf-exports', () => {
    assert.match(sql, /storage_bucket text NOT NULL DEFAULT 'site-diary-pdf-exports'/)
    assert.match(sql, /'site-diary-pdf-exports'/)
  })

  it('L — no broad authenticated UPDATE/DELETE on export table', () => {
    assert.doesNotMatch(sql, /FOR UPDATE/)
    assert.doesNotMatch(sql, /FOR DELETE/)
    assert.doesNotMatch(sql, /FOR INSERT/)
    assert.match(sql, /GRANT SELECT ON TABLE public\.site_diary_pdf_exports TO authenticated/)
  })

  it('get_site_diary_pdf_export is ownership-checked', () => {
    assert.match(sql, /FUNCTION public\.get_site_diary_pdf_export\(\s*p_export_id uuid/)
    assert.match(sql, /AND e\.owner_id = v_user_id/)
  })
})

describe('SITE_DIARY_PDF_EXPORT_JOB scope guards', () => {
  it('M/O/P — no worker, assembler, render, or PDF route changes in migration', () => {
    const sql = readMigration()
    assert.doesNotMatch(sql, /assembleSiteDiaryPdfDocumentProps/)
    assert.doesNotMatch(sql, /renderSiteDiaryPdfBuffer/)
    assert.doesNotMatch(sql, /buildDiaryPdfPhotos/)
    assert.doesNotMatch(sql, /INSERT INTO storage\.buckets/)
    assert.doesNotMatch(sql, /storage\.objects/)
  })

  it('N — production PDF paths unchanged (source still dev sync route only)', () => {
    const route = readFileSync(PDF_ROUTE, 'utf8')
    assert.match(route, /sync-dev-only/)
    assert.doesNotMatch(route, /enqueue_site_diary_pdf_export/)
    assert.doesNotMatch(readFileSync(ASSEMBLE, 'utf8'), /site_diary_pdf_exports/)
    assert.doesNotMatch(readFileSync(RENDER, 'utf8'), /site_diary_pdf_exports/)
  })
})
