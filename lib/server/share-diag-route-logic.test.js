import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SHARE_DIAG_ALLOWED_LOG_FIELDS,
  isShareDiagLoggingEnabled,
  sanitizeShareDiagPayloadForLog,
  logShareDiagSafely,
  parseShareDiagRequestBody,
} from './share-diag-route-logic.js'

const root = join(import.meta.dirname, '..', '..')
const routeSrc = readFileSync(join(root, 'app/api/share-diag/route.js'), 'utf8')

describe('share-diag route logic', () => {
  it('A — production Vercel (NODE_ENV=production, VERCEL_ENV=production) stays disabled', () => {
    assert.equal(
      isShareDiagLoggingEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production' }),
      false,
    )
    assert.equal(isShareDiagLoggingEnabled({ NODE_ENV: 'production' }), false)
  })

  it('B — Vercel Preview enables diagnostic logging', () => {
    assert.equal(
      isShareDiagLoggingEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }),
      true,
    )
  })

  it('local development remains enabled', () => {
    assert.equal(isShareDiagLoggingEnabled({ NODE_ENV: 'development' }), true)
    assert.equal(isShareDiagLoggingEnabled({}), true)
  })

  it('C — keeps only approved timing-safe fields', () => {
    const safe = sanitizeShareDiagPayloadForLog({
      stage: 'share-timing-t7-signed-fetch-blob',
      at: '2026-09-23T07:38:40.000Z',
      elapsedMsSinceTap: 52000,
      blobSize: 19876543,
      httpStatus: 200,
      exportId: '11111111-1111-4111-8111-111111111111',
    })
    assert.equal(safe.stage, 'share-timing-t7-signed-fetch-blob')
    assert.equal(safe.elapsedMsSinceTap, 52000)
    assert.equal(safe.blobSize, 19876543)
    assert.equal(safe.httpStatus, 200)
    assert.equal(safe.exportId, '11111111-1111-4111-8111-111111111111')
  })

  it('D — discards sensitive or verbose payload fields', () => {
    const safe = sanitizeShareDiagPayloadForLog({
      stage: 'share-timing-t5-artifact-authorize',
      elapsedMsSinceTap: 12000,
      href: 'https://preview.vercel.app/dashboard/project/x/diary',
      signedUrl: 'https://storage.supabase.co/object/sign/secret?token=leak',
      text: 'My Project — Site Diary',
      title: 'Site Diary',
      fileName: 'Zlog-Site-Diary-2026-09-23.pdf',
      email: 'user@example.com',
      cookie: 'sb-access-token=secret',
      userActivationIsActive: true,
    })
    assert.equal(safe.stage, 'share-timing-t5-artifact-authorize')
    assert.equal(safe.elapsedMsSinceTap, 12000)
    assert.equal(safe.href, undefined)
    assert.equal(safe.signedUrl, undefined)
    assert.equal(safe.text, undefined)
    assert.equal(safe.title, undefined)
    assert.equal(safe.fileName, undefined)
    assert.equal(safe.email, undefined)
    for (const key of ['href', 'signedUrl', 'text', 'title', 'fileName']) {
      assert.equal(SHARE_DIAG_ALLOWED_LOG_FIELDS.has(key), false)
    }
  })

  it('E — malformed JSON does not throw and yields parseError', () => {
    const parsed = parseShareDiagRequestBody('{not json')
    assert.equal(parsed.parseError, true)
    assert.equal(parsed.stage, 'unknown')
    const safe = sanitizeShareDiagPayloadForLog(parsed)
    assert.equal(safe.parseError, true)
  })

  it('logShareDiagSafely never passes disallowed keys to logFn', () => {
    const lines = []
    logShareDiagSafely(
      {
        stage: 'pdf-ready',
        elapsedMsSinceTap: 60000,
        signedUrl: 'https://example.com/secret',
      },
      (...args) => {
        lines.push(args.join(' '))
      },
    )
    assert.equal(lines.length, 1)
    assert.match(lines[0], /pdf-ready/)
    assert.doesNotMatch(lines[0], /secret/)
    assert.match(lines[0], /60000/)
  })
})

describe('share-diag route wiring', () => {
  it('uses isShareDiagLoggingEnabled and safe logging helpers', () => {
    assert.match(routeSrc, /isShareDiagLoggingEnabled/)
    assert.match(routeSrc, /logShareDiagSafely/)
    assert.match(routeSrc, /parseShareDiagRequestBody/)
    assert.doesNotMatch(routeSrc, /JSON\.stringify\(body/)
  })
})
