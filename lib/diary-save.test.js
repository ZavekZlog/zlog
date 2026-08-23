/**
 * M0 — unit checks for live-schema diary save contract (no live network).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  DiarySaveError,
  adaptReportPayloadForLiveRow,
  finalizeSiteDiarySave,
} from './diary-save.js'
import {
  LIVE_DAILY_REPORTS,
  buildLiveDailyReportUpdatePayload,
} from './live-diary-schema.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('live schema allowlist matches the approved post-migration schema snapshot', () => {
  const snap = JSON.parse(
    readFileSync(join(root, 'docs/LIVE_SCHEMA_DAILY_REPORTS.json'), 'utf8'),
  )
  assert.deepEqual(
    LIVE_DAILY_REPORTS.columns,
    snap.tables.daily_reports.columnNames,
  )
  assert.ok(!LIVE_DAILY_REPORTS.columns.includes('is_draft'))
  assert.ok(LIVE_DAILY_REPORTS.columns.includes('owner_id'))
  assert.ok(LIVE_DAILY_REPORTS.columns.includes('shift'))
  assert.ok(LIVE_DAILY_REPORTS.columns.includes('actions'))
})

test('buildLiveDailyReportUpdatePayload never emits is_draft or legacy column names', () => {
  const { payload, dropped } = buildLiveDailyReportUpdatePayload({
    site_summary: 'x',
    shift_type: 'Day',
    actions_required: 'Do thing',
    is_draft: false,
    mystery: 1,
    equipment_hire: null,
    temporary_works_applicable: true,
    temporary_works: [{ item: 'Scaffold', location: 'North elevation' }],
  })
  assert.equal(payload.site_summary, 'x')
  assert.equal(payload.shift, 'Day')
  assert.equal(payload.actions, 'Do thing')
  assert.deepEqual(payload.equipment_hire, [])
  assert.equal(payload.temporary_works_applicable, true)
  assert.deepEqual(payload.temporary_works, [{ item: 'Scaffold', location: 'North elevation' }])
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'is_draft'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'shift_type'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'actions_required'), false)
  assert.ok(!('mystery' in payload))
  void dropped
})

test('finalizeSiteDiarySave rejects missing report id without writing', async () => {
  let called = false
  const supabase = {
    from() {
      called = true
      throw new Error('from() must not be called when reportId is missing')
    },
  }

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: null,
      projectId: 'proj-1',
      reportPayload: { site_summary: 'x' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'MISSING_REPORT_ID',
  )
  assert.equal(called, false)
})

test('finalizeSiteDiarySave rejects missing project id', async () => {
  await assert.rejects(
    () => finalizeSiteDiarySave({}, {
      reportId: 'rep-1',
      projectId: '',
      reportPayload: { site_summary: 'x' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'MISSING_PROJECT_ID',
  )
})

test('diary page final save has no daily_reports insert branch', () => {
  const page = readFileSync(
    join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
    'utf8',
  )
  assert.match(page, /finalizeSiteDiarySave/)
  assert.doesNotMatch(
    page,
    /\.from\(\s*['"]daily_reports['"]\s*\)\s*\n?\s*\.insert/,
  )
})

test('diary page session expiry recovers via Sign in to Save (not enabled Save Changes)', () => {
  const page = readFileSync(
    join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
    'utf8',
  )
  assert.match(page, /SESSION_EXPIRED_SAVE_MESSAGE/)
  assert.match(page, /Sign in to save your work/)
  assert.match(page, /loginUrlWithReturn/)
  assert.match(page, /sessionExpired \? goToSignInForSave : handleSave/)
  assert.match(page, /window\.location\.assign\(loginUrlWithReturn/)
  assert.match(page, /Preparing PDF…/)
  assert.match(page, /Saved ✓/)
  assert.match(page, /showSaveBanner/)
  assert.match(page, /shouldShowManualSaveConfirmation/)
  assert.match(page, /zlog-manual-save-confirmation/)
  assert.match(page, /POST_SAVE_SHARE_DELAY_MS/)
  assert.match(page, /saveNavTimerRef\.current = setTimeout/)
  // Saved ✓ after share/download returns — not before PDF; saving stays true until handoff completes.
  const handleSaveStart = page.indexOf('const handleSave = async')
  assert.ok(handleSaveStart > 0, 'handleSave not found')
  const saveFn = page.slice(handleSaveStart, handleSaveStart + 18000)
  const finalizeIdx = saveFn.indexOf('finalizeSiteDiarySave')
  const prepareIdx = saveFn.indexOf('prepareSiteDiaryPdf')
  assert.ok(finalizeIdx > 0 && prepareIdx > finalizeIdx, 'PDF prepare follows finalizeSiteDiarySave')
  assert.doesNotMatch(
    saveFn.slice(finalizeIdx, prepareIdx),
    /setJustSaved\(true\)/,
    'no Saved ✓ before PDF prepare',
  )
  const afterPrepare = saveFn.slice(prepareIdx)
  assert.match(afterPrepare, /shareSiteDiaryPdfNative/)
  assert.match(afterPrepare, /canNativeShare/)
  assert.match(saveFn, /snapshotUserActivation/)
  assert.match(saveFn, /\[zlog:share-diag\]/)
  assert.doesNotMatch(saveFn, /pendingSharePdfRef/)
  assert.doesNotMatch(saveFn, /Tap .* again to open/)
  assert.match(saveFn, /Do NOT silent-download/)
  assert.match(saveFn, /finishAfterSuccessfulShare/)
  const finishFn = saveFn.slice(
    saveFn.indexOf('const finishAfterSuccessfulShare'),
    saveFn.indexOf('try {'),
  )
  assert.match(finishFn, /setJustSaved\(true\)/)
  assert.match(page, /'Save & Share'/)
  assert.match(page, /Preparing PDF…/)
  assert.match(page, /COVER_UPLOAD_FAIL_MESSAGE/)
  assert.match(page, /Successful cover persistence must clear a stale red upload banner/)
  assert.doesNotMatch(page, /You must be signed in to save a report/)
  assert.doesNotMatch(page, /report id:/)
  assert.doesNotMatch(page, /No INSERT performed/)
  assert.match(page, /TODO\(P1\+\): Persist in-progress diary form edits/)
})

test('diary-save module never calls insert on daily_reports', () => {
  const src = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  assert.match(src, /\.update\(/)
  assert.doesNotMatch(
    src,
    /\.from\(\s*['"]daily_reports['"]\s*\)[\s\S]{0,80}\.insert/,
  )
})

test('adaptReportPayloadForLiveRow maps legacy names onto live columns', () => {
  const { payload, skipped } = adaptReportPayloadForLiveRow(
    { shift: 'Day', actions: 'Fix fence', site_summary: 'Work done', is_draft: false },
    {},
  )
  assert.deepEqual(payload.shift, 'Day')
  assert.deepEqual(payload.actions, 'Fix fence')
  assert.equal(payload.site_summary, 'Work done')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'is_draft'), false)
  void skipped
})

test('finalizeSiteDiarySave verifies fresh SELECT matches UPDATE', async () => {
  const reportId = 'rep-1'
  const projectId = 'proj-1'
  const beforeRow = {
    id: reportId,
    owner_id: 'user-1',
    project_id: projectId,
    site_summary: 'old',
    shift: 'Day',
    actions: null,
    equipment_hire: [],
    report_date: '2026-08-05',
    created_at: '2026-08-05T00:00:00Z',
  }
  const updatedRow = { ...beforeRow, site_summary: 'persisted' }
  let updatePayload = null

  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      if (table === 'daily_reports') {
        return {
          select() {
            return {
              eq(_col, id) {
                assert.equal(id, reportId)
                return {
                  async maybeSingle() {
                    return { data: beforeRow, error: null, status: 200, statusText: 'OK' }
                  },
                  async single() {
                    // after-select
                    return { data: updatedRow, error: null, status: 200, statusText: 'OK' }
                  },
                }
              },
            }
          },
          update(payload) {
            updatePayload = payload
            assert.equal(payload.site_summary, 'persisted')
            assert.equal(Object.prototype.hasOwnProperty.call(payload, 'is_draft'), false)
            return {
              eq(col, id) {
                assert.equal(col, 'id')
                assert.equal(id, reportId)
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: updatedRow,
                          error: null,
                          status: 200,
                          statusText: 'OK',
                          count: 1,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }
      // labour/plant/photos delete/list chains
      return {
        delete() {
          return {
            eq() {
              return Promise.resolve({ error: null })
            },
          }
        },
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
        insert() {
          return Promise.resolve({ error: null })
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        },
      }
    },
  }

  const result = await finalizeSiteDiarySave(supabase, {
    reportId,
    projectId,
    reportPayload: { site_summary: 'persisted', shift: 'Day', is_draft: false },
  })
  assert.equal(result.id, reportId)
  assert.equal(result.diagnostic.ok, true)
  assert.equal(result.diagnostic.verifiedSiteSummary, 'persisted')
  assert.equal(updatePayload.is_draft, undefined)
})

test('finalizeSiteDiarySave fails when fresh SELECT does not match', async () => {
  const reportId = 'rep-1'
  const projectId = 'proj-1'
  const beforeRow = {
    id: reportId,
    owner_id: 'user-1',
    project_id: projectId,
    site_summary: 'old',
    equipment_hire: [],
    report_date: '2026-08-05',
    created_at: '2026-08-05T00:00:00Z',
  }
  const lyingUpdate = { ...beforeRow, site_summary: 'persisted' }
  const staleSelect = { ...beforeRow, site_summary: 'old' }

  let selectPhase = 0
  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      if (table !== 'daily_reports') {
        return {
          delete() {
            return { eq() { return Promise.resolve({ error: null }) } }
          },
          select() {
            return { eq() { return Promise.resolve({ data: [], error: null }) } }
          },
          insert() {
            return Promise.resolve({ error: null })
          },
        }
      }
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: beforeRow, error: null, status: 200, statusText: 'OK' }
                },
                async single() {
                  selectPhase += 1
                  return { data: staleSelect, error: null, status: 200, statusText: 'OK' }
                },
              }
            },
          }
        },
        update() {
          return {
            eq() {
              return {
                select() {
                  return {
                    async single() {
                      return { data: lyingUpdate, error: null, status: 200, statusText: 'OK' }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId,
      projectId,
      reportPayload: { site_summary: 'persisted' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'VERIFY_MISMATCH',
  )
  assert.equal(selectPhase, 1)
})
