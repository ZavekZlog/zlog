import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { authorizeSiteDiaryReportForUser } from './site-diary-report-access-logic.js'

const root = join(import.meta.dirname, '..', '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('site-diary server PDF security', () => {
  it('authorizeSiteDiaryReportForUser returns 401 when unauthenticated', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }
    const adminSupabase = { from: () => ({}) }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      '6846b690-b3f8-4a28-b0c1-a9a825a850f0',
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
  })

  it('authorizeSiteDiaryReportForUser returns 403 when project owner mismatches', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
      },
    }
    const adminSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'report-1',
                project_id: 'proj-1',
                projects: { owner_id: 'user-b' },
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      'report-1',
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.code, 'forbidden')
  })

  it('authorizeSiteDiaryReportForUser allows matching project owner', async () => {
    const userSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
      },
    }
    const adminSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'report-1',
                project_id: 'proj-1',
                projects: { owner_id: 'user-a' },
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const result = await authorizeSiteDiaryReportForUser(
      userSupabase,
      adminSupabase,
      'report-1',
    )
    assert.equal(result.ok, true)
    assert.equal(result.reportId, 'report-1')
  })

  it('dev PDF route is production-guarded and requires sync-dev-only mode', () => {
    const route = read('app/api/site-diary/[reportId]/pdf/route.js')
    assert.match(route, /NODE_ENV.*production/)
    assert.match(route, /sync-dev-only/)
    assert.match(route, /authorizeSiteDiaryReportForUser/)
    assert.doesNotMatch(route, /prepareSiteDiaryPdf/)
  })

  it('service role key is not referenced from client PDF path', () => {
    const share = read('lib/diary-share.js')
    assert.doesNotMatch(share, /SUPABASE_SERVICE_ROLE_KEY/)
    const client = read('lib/supabase/client.js')
    assert.doesNotMatch(client, /SERVICE_ROLE/)
  })

  it('supabase-admin is server-only and not imported by diary-share', () => {
    const admin = read('lib/server/supabase-admin.js')
    assert.match(admin, /server-only/)
    assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/)
    const share = read('lib/diary-share.js')
    assert.doesNotMatch(share, /supabase-admin/)
  })

  it('client prepare path still uses DiaryPdfDocument and pdf\\(\\).toBlob', () => {
    const share = read('lib/diary-share.js')
    assert.match(share, /prepareSiteDiaryPdf/)
    assert.match(share, /DiaryPdfDocument/)
    assert.match(share, /pdf\(doc\)\.toBlob/)
  })

  it('DiaryPdfDocument no longer requires use client directive', () => {
    const doc = read('components/pdf/DiaryPdfDocument.jsx')
    assert.doesNotMatch(doc, /^'use client'/m)
  })
})
