import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateWorkerEnv,
  resolvePollMs,
  isClaimEnabled,
  DEFAULT_POLL_MS,
  CLAIM_RPC_NAME,
} from './env.js'
import { formatClaimLogLine } from './claim-loop.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

function readWorker(rel) {
  return readFileSync(join(here, rel), 'utf8')
}

describe('Site Diary PDF export worker shell (2C-2B)', () => {
  it('A — missing service-role key fails startup validation', () => {
    assert.throws(
      () => validateWorkerEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }),
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
  })

  it('B — service-role key is never exposed as NEXT_PUBLIC requirement', () => {
    const envSrc = readWorker('env.js')
    const adminSrc = readWorker('supabase-admin.js')
    const runSrc = readWorker('run.mjs')
    assert.doesNotMatch(envSrc, /NEXT_PUBLIC_SUPABASE_SERVICE/)
    assert.doesNotMatch(adminSrc, /NEXT_PUBLIC/)
    assert.match(envSrc, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.throws(
      () => validateWorkerEnv({ SUPABASE_URL: 'https://x.supabase.co' }),
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
    assert.doesNotMatch(runSrc, /NEXT_PUBLIC_SUPABASE_SERVICE/)
  })

  it('C — default poll interval = 5000', () => {
    assert.equal(resolvePollMs({}), DEFAULT_POLL_MS)
    assert.equal(DEFAULT_POLL_MS, 5000)
  })

  it('D — invalid poll interval falls back to 5000 deterministically', () => {
    assert.equal(resolvePollMs({ ZLOG_PDF_WORKER_POLL_MS: 'nope' }), 5000)
    assert.equal(resolvePollMs({ ZLOG_PDF_WORKER_POLL_MS: '0' }), 5000)
    assert.equal(resolvePollMs({ ZLOG_PDF_WORKER_POLL_MS: '9999999' }), 5000)
    assert.equal(resolvePollMs({ ZLOG_PDF_WORKER_POLL_MS: '8000' }), 8000)
  })

  it('E — claim disabled by default', () => {
    assert.equal(isClaimEnabled({}), false)
    assert.equal(isClaimEnabled({ ZLOG_PDF_WORKER_CLAIM_ENABLED: 'false' }), false)
  })

  it('F — claim RPC cannot execute unless explicit enable flag is true', () => {
    const loopSrc = readWorker('claim-loop.js')
    const runSrc = readWorker('run.mjs')
    assert.match(loopSrc, /if \(!claimEnabled\)/)
    assert.match(loopSrc, /ZLOG_PDF_WORKER_CLAIM_ENABLED=true/)
    assert.match(runSrc, /claimEnabled: config\.claimEnabled/)
    assert.equal(isClaimEnabled({ ZLOG_PDF_WORKER_CLAIM_ENABLED: 'true' }), true)
  })

  it('G — RPC name exactly claim_next_site_diary_pdf_export', () => {
    assert.equal(CLAIM_RPC_NAME, 'claim_next_site_diary_pdf_export')
    const loopSrc = readWorker('claim-loop.js')
    assert.match(loopSrc, /admin\.rpc\(CLAIM_RPC_NAME, \{ p_worker_id: workerId \}\)/)
  })

  it('H — p_worker_id is passed', () => {
    assert.match(readWorker('claim-loop.js'), /p_worker_id: workerId/)
  })

  it('I — no PDF assembler/render imports', () => {
    const serverOnlyImport = /import\s+['"]server-only['"]/
    const files = ['env.js', 'supabase-admin.js', 'claim-loop.js', 'run.mjs', 'sleep.js']
    for (const file of files) {
      const src = readWorker(file)
      assert.doesNotMatch(src, /assembleSiteDiaryPdfDocumentProps/)
      assert.doesNotMatch(src, /renderSiteDiaryPdfBuffer/)
      assert.doesNotMatch(src, /@react-pdf/)
      assert.doesNotMatch(src, /DiaryPdfDocument/)
      assert.doesNotMatch(src, /sharp/)
      assert.doesNotMatch(src, serverOnlyImport)
      assert.doesNotMatch(src, /@\//)
    }
  })

  it('J — no Storage upload', () => {
    const loopSrc = readWorker('claim-loop.js')
    assert.doesNotMatch(loopSrc, /\.storage\./)
    assert.doesNotMatch(loopSrc, /upload\(/)
  })

  it('K — no complete/fail RPC invocation', () => {
    const src = [readWorker('claim-loop.js'), readWorker('run.mjs')].join('\n')
    assert.doesNotMatch(src, /complete_site_diary_pdf_export/)
    assert.doesNotMatch(src, /fail_site_diary_pdf_export/)
  })

  it('L — SIGINT/SIGTERM shutdown path exists', () => {
    const runSrc = readWorker('run.mjs')
    assert.match(runSrc, /process\.on\('SIGINT'/)
    assert.match(runSrc, /process\.on\('SIGTERM'/)
    assert.match(readWorker('claim-loop.js'), /shutdown\.shuttingDown/)
  })

  it('M — safe logging excludes secrets/full job JSON', () => {
    const loopSrc = readWorker('claim-loop.js')
    const runSrc = readWorker('run.mjs')
    assert.match(loopSrc, /formatClaimLogLine\(row\)/)
    assert.doesNotMatch(loopSrc, /console\.log\([^)]*\bdata\b/)
    assert.doesNotMatch(runSrc, /console\.log\([^)]*process\.env/)
    assert.doesNotMatch(runSrc, /SERVICE_ROLE_KEY/)

    const sensitiveRow = {
      id: 'export-uuid',
      report_id: 'report-uuid',
      attempt: 2,
      reclaim_count: 1,
      storage_path: 'owner/report/fp.pdf',
      content_fingerprint: 'a'.repeat(64),
      error_message: 'internal detail',
      signed_photo_url: 'https://example.com/secret.jpg',
      site_summary: 'private report text',
    }
    const line = formatClaimLogLine(sensitiveRow)
    assert.deepEqual(line, {
      exportId: 'export-uuid',
      reportId: 'report-uuid',
      attempt: 2,
      reclaimCount: 1,
    })
    assert.equal(Object.keys(line).sort().join(','), 'attempt,exportId,reclaimCount,reportId')
    assert.equal(JSON.stringify(line).includes('secret'), false)
    assert.equal(JSON.stringify(line).includes('private'), false)
  })

  it('N — one claimed job causes claim-only development exit', () => {
    const loopSrc = readWorker('claim-loop.js')
    assert.match(loopSrc, /Claim-only mode: exiting/)
    assert.match(loopSrc, /exit\(0\)/)
  })

  it('does not modify Next.js supabase-admin', () => {
    const serverOnlyImport = /import\s+['"]server-only['"]/
    const nextAdmin = readFileSync(join(root, 'lib/server/supabase-admin.js'), 'utf8')
    assert.match(nextAdmin, serverOnlyImport)
    assert.doesNotMatch(readWorker('supabase-admin.js'), serverOnlyImport)
  })
})
