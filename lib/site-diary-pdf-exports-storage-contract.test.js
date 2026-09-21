import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const STORAGE_MIGRATION = join(
  root,
  'supabase/migrations/20260921160000_site_diary_pdf_exports_storage.sql',
)
const MIGRATION_2C1 = join(root, 'supabase/migrations/20260921120000_site_diary_pdf_exports.sql')
const MIGRATION_2C2A = join(
  root,
  'supabase/migrations/20260921140000_site_diary_pdf_export_worker_state.sql',
)
const RUNBOOK = join(root, 'docs/runbooks/SITE_DIARY_PDF_WORKER_DEPLOYMENT.md')
const PACKAGE_JSON = join(root, 'package.json')
const EXECUTOR_CORE = join(
  root,
  'worker/site-diary-pdf-export/execute-claimed-site-diary-pdf-export-core.js',
)
const UPLOAD_HELPER = EXECUTOR_CORE
const ENV_JS = join(root, 'worker/site-diary-pdf-export/env.js')

function read(path) {
  return readFileSync(path, 'utf8')
}

describe('SITE_DIARY_PDF_EXPORTS storage migration (2D-1)', () => {
  const sql = read(STORAGE_MIGRATION)

  it('A — bucket name exactly site-diary-pdf-exports', () => {
    assert.match(sql, /'site-diary-pdf-exports'/)
    assert.match(sql, /INSERT INTO storage\.buckets/)
  })

  it('B — bucket is not public', () => {
    assert.match(sql, /false,\s*\n\s*104857600/)
    assert.doesNotMatch(sql, /public,\s*true/i)
  })

  it('C — no anon read policy', () => {
    assert.doesNotMatch(sql, /TO anon/)
    assert.doesNotMatch(sql, /auth\.role\(\)\s*=\s*'anon'/)
  })

  it('D — no broad authenticated storage.objects policies', () => {
    assert.doesNotMatch(sql, /CREATE POLICY/)
    assert.doesNotMatch(sql, /ON storage\.objects/)
    assert.doesNotMatch(sql, /FOR SELECT/)
    assert.doesNotMatch(sql, /FOR INSERT/)
  })

  it('G — migration filename orders after export job and worker state', () => {
    const name = '20260921160000_site_diary_pdf_exports_storage.sql'
    assert.ok(STORAGE_MIGRATION.endsWith(name))
    assert.ok('20260921160000' > '20260921120000')
    assert.ok('20260921160000' > '20260921140000')
    assert.doesNotMatch(read(MIGRATION_2C1), /INSERT INTO storage\.buckets/)
    assert.doesNotMatch(read(MIGRATION_2C2A), /INSERT INTO storage\.buckets/)
  })

  it('allows application/pdf at bucket level', () => {
    assert.match(sql, /application\/pdf/)
  })

  it('file size limit safely exceeds ~20 MiB baseline', () => {
    assert.match(sql, /104857600/)
    assert.ok(104857600 > 20 * 1024 * 1024)
  })
})

describe('Worker path and upload contract unchanged', () => {
  it('E — deterministic path contract', () => {
    const src = read(EXECUTOR_CORE)
    assert.match(src, /buildSiteDiaryPdfExportStoragePath/)
    assert.match(src, /\$\{ownerId\}\/\$\{reportId\}\/\$\{fingerprint\}\.pdf/)
  })

  it('F — application/pdf upload MIME', () => {
    const src = read(UPLOAD_HELPER)
    assert.match(src, /contentType:\s*'application\/pdf'/)
  })
})

describe('Deployment runbook and worker scripts (2D-1)', () => {
  const runbook = read(RUNBOOK)
  const pkg = JSON.parse(read(PACKAGE_JSON))
  const envSrc = read(ENV_JS)

  it('I — runbook contains disable switch', () => {
    assert.match(runbook, /ZLOG_PDF_WORKER_CLAIM_ENABLED=false/)
    assert.match(runbook, /claims disabled/i)
  })

  it('H — claims disabled by default in env contract', () => {
    assert.match(envSrc, /isClaimEnabled/)
    assert.match(envSrc, /=== 'true'/)
    assert.doesNotMatch(envSrc, /CLAIM_ENABLED.*true.*default/i)
  })

  it('J — build/start scripts exist in package.json', () => {
    assert.equal(typeof pkg.scripts['build:worker-site-diary-pdf'], 'string')
    assert.equal(typeof pkg.scripts['worker:site-diary-pdf-export'], 'string')
    assert.match(runbook, /build:worker-site-diary-pdf/)
    assert.match(runbook, /worker:site-diary-pdf-export/)
  })

  it('runbook lists migration order', () => {
    assert.match(runbook, /20260921120000_site_diary_pdf_exports\.sql/)
    assert.match(runbook, /20260921140000_site_diary_pdf_export_worker_state\.sql/)
    assert.match(runbook, /20260921160000_site_diary_pdf_exports_storage\.sql/)
  })
})
