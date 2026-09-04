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
  normalizeReportPhotoReconcileValue,
  reportPhotoMetadataNeedsUpdate,
} from './diary-save.js'
import {
  labourFormToPersistRows,
  plantFormToPersistRows,
  photoRowsToBaseline,
} from './diary-save-dirty.js'
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
  assert.match(page, /Preparing report…/)
  assert.match(page, /Report Ready — Share Now/)
  assert.match(page, /Saved ✓/)
  assert.match(page, /showSaveBanner/)
  assert.match(page, /shouldShowManualSaveConfirmation/)
  assert.match(page, /zlog-manual-save-confirmation/)
  assert.match(page, /POST_SAVE_SHARE_DELAY_MS/)
  assert.match(page, /saveNavTimerRef\.current = setTimeout/)
  // Saved ✓ after share/download returns — not before PDF; saving stays true until handoff completes.
  const handleSaveStart = page.indexOf('const handleSave = async')
  assert.ok(handleSaveStart > 0, 'handleSave not found')
  const saveFn = page.slice(handleSaveStart, handleSaveStart + 28000)
  const finalizeIdx = saveFn.indexOf('finalizeSiteDiarySave')
  const prepareIdx = saveFn.indexOf('prepareSiteDiaryPdf')
  assert.ok(finalizeIdx > 0 && prepareIdx > finalizeIdx, 'PDF prepare follows finalizeSiteDiarySave')
  assert.doesNotMatch(
    saveFn.slice(finalizeIdx, prepareIdx),
    /setJustSaved\(true\)/,
    'no Saved ✓ before PDF prepare',
  )
  const afterPrepare = saveFn.slice(prepareIdx)
  assert.match(afterPrepare, /shareReadyPdfRef/)
  assert.match(afterPrepare, /setShareReady\(true\)/)
  assert.match(afterPrepare, /canNativeShare/)
  assert.match(saveFn, /snapshotUserActivation/)
  assert.match(saveFn, /\[zlog:share-diag\]/)
  assert.doesNotMatch(saveFn, /pendingSharePdfRef/)
  assert.match(saveFn, /Do NOT silent-download/)
  assert.match(saveFn, /finishAfterSuccessfulShare/)
  assert.match(saveFn, /Second tap — native share from the already-prepared file only/)
  assert.match(saveFn, /mapWithConcurrency/)
  assert.match(saveFn, /photoPersistResults = await mapWithConcurrency/)
  assert.match(page, /SHARE_PHOTO_UPLOAD_CONCURRENCY = 2/)
  const finishFn = saveFn.slice(
    saveFn.indexOf('const finishAfterSuccessfulShare'),
    saveFn.indexOf('try {'),
  )
  assert.match(finishFn, /setJustSaved\(true\)/)
  assert.match(page, /'Save & Share'/)
  assert.match(page, /Preparing report…/)
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

function buildFinalizeSupabaseMock({
  reportId = 'rep-1',
  projectId = 'proj-1',
  beforeRow,
  updatedRow,
  onTableCall,
  labourDeleteError = null,
  plantDeleteError = null,
  existingPhotos = [],
  photoStats = null,
} = {}) {
  const baseBefore = beforeRow ?? {
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
  const baseUpdated = updatedRow ?? { ...baseBefore, site_summary: 'persisted' }
  let dailyReportsSelectPhase = 0

  return {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      onTableCall?.(table)
      if (table === 'daily_reports') {
        return {
          select() {
            return {
              eq(_col, id) {
                assert.equal(id, reportId)
                return {
                  async maybeSingle() {
                    return { data: baseBefore, error: null, status: 200, statusText: 'OK' }
                  },
                  async single() {
                    dailyReportsSelectPhase += 1
                    return { data: baseUpdated, error: null, status: 200, statusText: 'OK' }
                  },
                }
              },
            }
          },
          update(payload) {
            return {
              eq(col, id) {
                assert.equal(col, 'id')
                assert.equal(id, reportId)
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: { ...baseUpdated, ...payload },
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
      if (table === 'report_labour') {
        return {
          delete() {
            return {
              eq(_col, id) {
                assert.equal(id, reportId)
                if (labourDeleteError) {
                  return Promise.resolve({ error: labourDeleteError })
                }
                return onTableCall?.('report_labour:delete') ?? Promise.resolve({ error: null })
              },
            }
          },
          insert() {
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'report_plant') {
        return {
          delete() {
            return {
              eq(_col, id) {
                assert.equal(id, reportId)
                if (plantDeleteError) {
                  return Promise.resolve({ error: plantDeleteError })
                }
                return onTableCall?.('report_plant:delete') ?? Promise.resolve({ error: null })
              },
            }
          },
          insert() {
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'report_photos') {
        return {
          select() {
            return {
              eq() {
                onTableCall?.('report_photos:list')
                return Promise.resolve({ data: existingPhotos, error: null })
              },
            }
          },
          delete() {
            return {
              in(_col, ids) {
                photoStats?.deletes.push(ids)
                onTableCall?.('report_photos:delete')
                return Promise.resolve({ error: null })
              },
            }
          },
          update(fields) {
            return {
              eq() {
                return {
                  eq(_urlCol, url) {
                    photoStats?.updates.push({ url, fields })
                    onTableCall?.('report_photos:update')
                    return Promise.resolve({ error: null })
                  },
                }
              },
            }
          },
          insert(rows) {
            photoStats?.inserts.push(rows)
            onTableCall?.('report_photos:insert')
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from() {
        return {
          async remove() {
            return { error: null }
          },
        }
      },
    },
    get dailyReportsSelectPhase() {
      return dailyReportsSelectPhase
    },
  }
}

test('finalizeSiteDiarySave runs labour and plant replacements concurrently after report verify', async () => {
  const events = []
  let childInFlight = 0
  let maxChildConcurrent = 0
  let resolveLabour
  let resolvePlant
  let notifyLabourStarted
  let notifyPlantStarted
  const labourGate = new Promise((resolve) => { resolveLabour = resolve })
  const plantGate = new Promise((resolve) => { resolvePlant = resolve })
  const labourStarted = new Promise((resolve) => { notifyLabourStarted = resolve })
  const plantStarted = new Promise((resolve) => { notifyPlantStarted = resolve })

  const supabase = buildFinalizeSupabaseMock({
    onTableCall(table) {
      if (table === 'report_labour:delete') {
        events.push('labour_delete_start')
        childInFlight += 1
        maxChildConcurrent = Math.max(maxChildConcurrent, childInFlight)
        notifyLabourStarted()
        return labourGate.then(() => {
          childInFlight -= 1
          events.push('labour_delete_end')
          return { error: null }
        })
      }
      if (table === 'report_plant:delete') {
        events.push('plant_delete_start')
        childInFlight += 1
        maxChildConcurrent = Math.max(maxChildConcurrent, childInFlight)
        notifyPlantStarted()
        return plantGate.then(() => {
          childInFlight -= 1
          events.push('plant_delete_end')
          return { error: null }
        })
      }
      if (table === 'report_photos:list') {
        events.push('photos_list')
      }
    },
  })

  const finalizePromise = finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { site_summary: 'persisted' },
  })

  await Promise.all([labourStarted, plantStarted])
  assert.equal(maxChildConcurrent, 2, 'labour and plant overlapped')

  resolveLabour()
  resolvePlant()
  await finalizePromise

  const labourEnd = events.indexOf('labour_delete_end')
  const plantEnd = events.indexOf('plant_delete_end')
  const photosList = events.indexOf('photos_list')
  assert.ok(labourEnd >= 0 && plantEnd >= 0)
  assert.ok(photosList > labourEnd && photosList > plantEnd, 'photos reconcile waits for both child branches')
  assert.equal(supabase.dailyReportsSelectPhase, 1, 'M0 verify SELECT unchanged')
})

test('finalizeSiteDiarySave rejects when labour replacement fails', async () => {
  let photosListed = false
  const supabase = buildFinalizeSupabaseMock({
    labourDeleteError: { message: 'labour delete failed' },
    onTableCall(table) {
      if (table === 'report_photos:list') photosListed = true
    },
  })

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'LABOUR_DELETE_FAILED',
  )
  assert.equal(photosListed, false, 'photo reconcile must not start after labour failure')
})

test('finalizeSiteDiarySave rejects when plant replacement fails', async () => {
  let photosListed = false
  const supabase = buildFinalizeSupabaseMock({
    plantDeleteError: { message: 'plant delete failed' },
    onTableCall(table) {
      if (table === 'report_photos:list') photosListed = true
    },
  })

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'PLANT_DELETE_FAILED',
  )
  assert.equal(photosListed, false, 'photo reconcile must not start after plant failure')
})

test('finalizeSiteDiarySave ordering: report verify before child tables, photos after both', () => {
  const saveLib = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  const finalizeBody = saveLib.slice(
    saveLib.indexOf('export async function finalizeSiteDiarySave'),
    saveLib.indexOf('/** @deprecated kept for tests'),
  )
  assert.ok(finalizeBody.indexOf('updateDailyReportRow') < finalizeBody.indexOf('replaceLabour'))
  assert.ok(finalizeBody.indexOf('updateDailyReportRow') < finalizeBody.indexOf('replacePlant'))
  assert.ok(finalizeBody.indexOf('Promise.all') < finalizeBody.indexOf('reconcilePhotos'))
  assert.ok(finalizeBody.indexOf('reconcilePhotos') > finalizeBody.indexOf('replacePlant'))
  assert.doesNotMatch(finalizeBody, /reconcilePhotos[\s\S]*replaceLabour/)
})

function durablePhotoFixture(index, overrides = {}) {
  const url = overrides.url || `user-1/rep-1/photos/p${index}/report.jpg`
  const thumbnail_path = Object.prototype.hasOwnProperty.call(overrides, 'thumbnail_path')
    ? overrides.thumbnail_path
    : `user-1/rep-1/photos/p${index}/thumb.jpg`
  const row = {
    id: `photo-row-${index}`,
    url,
    caption: 'South wall',
    sequence: index,
    layout: 'grid4',
    location: 'Area A',
    category: null,
    rotation_degrees: 0,
    assigned_to: null,
    thumbnail_path,
    ...overrides,
    url,
  }
  const fields = {
    caption: row.caption,
    sequence: row.sequence,
    layout: row.layout,
    location: row.location,
    category: row.category,
    rotation_degrees: row.rotation_degrees,
    assigned_to: row.assigned_to,
  }
  return {
    row,
    patch: { url, fields },
  }
}

function photoStatsBag() {
  return { updates: [], deletes: [], inserts: [] }
}

async function finalizeWithPhotos({
  existingPhotos,
  updateExistingPhotos,
  photoRecords = [],
  keptStoragePaths,
  photoStats = photoStatsBag(),
}) {
  const supabase = buildFinalizeSupabaseMock({
    existingPhotos,
    photoStats,
  })
  await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { site_summary: 'persisted' },
    keptStoragePaths: keptStoragePaths ?? existingPhotos.map((row) => row.url),
    photoRecords,
    updateExistingPhotos,
  })
  return photoStats
}

test('normalizeReportPhotoReconcileValue treats blank text as null and rotation/layout defaults', () => {
  assert.equal(normalizeReportPhotoReconcileValue('caption', ''), null)
  assert.equal(normalizeReportPhotoReconcileValue('caption', null), null)
  assert.equal(normalizeReportPhotoReconcileValue('assigned_to', '  '), null)
  assert.equal(normalizeReportPhotoReconcileValue('rotation_degrees', null), 0)
  assert.equal(normalizeReportPhotoReconcileValue('rotation_degrees', 90), 90)
  assert.equal(normalizeReportPhotoReconcileValue('layout', null), 'grid4')
  assert.equal(normalizeReportPhotoReconcileValue('layout', ''), 'grid4')
})

test('reportPhotoMetadataNeedsUpdate is false when owned fields already match', () => {
  const { row, patch } = durablePhotoFixture(1)
  assert.equal(reportPhotoMetadataNeedsUpdate(row, patch.fields), false)
  assert.equal(
    reportPhotoMetadataNeedsUpdate({ ...row, caption: null }, { ...patch.fields, caption: '' }),
    false,
  )
})

test('19 identical durable photo rows issue zero report_photos UPDATEs', async () => {
  const fixtures = Array.from({ length: 19 }, (_, i) => durablePhotoFixture(i + 1))
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 0)
  assert.equal(stats.inserts.length, 0)
  assert.equal(stats.deletes.length, 0)
})

test('one caption change issues exactly one UPDATE', async () => {
  const fixtures = Array.from({ length: 3 }, (_, i) => durablePhotoFixture(i + 1))
  fixtures[1].patch.fields.caption = 'North wall'
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].url, fixtures[1].row.url)
  assert.equal(stats.updates[0].fields.caption, 'North wall')
})

test('one rotation change issues exactly one UPDATE', async () => {
  const fixtures = Array.from({ length: 3 }, (_, i) => durablePhotoFixture(i + 1))
  fixtures[2].patch.fields.rotation_degrees = 90
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].fields.rotation_degrees, 90)
})

test('one sequence/order change issues exactly one UPDATE', async () => {
  const fixtures = Array.from({ length: 3 }, (_, i) => durablePhotoFixture(i + 1))
  fixtures[0].patch.fields.sequence = 9
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].fields.sequence, 9)
})

test('one area/location change issues exactly one UPDATE', async () => {
  const fixtures = Array.from({ length: 3 }, (_, i) => durablePhotoFixture(i + 1))
  fixtures[0].patch.fields.location = 'Area B'
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].fields.location, 'Area B')
})

test('one assigned_to change issues exactly one UPDATE', async () => {
  const fixtures = Array.from({ length: 3 }, (_, i) => durablePhotoFixture(i + 1))
  fixtures[1].patch.fields.assigned_to = 'Foreman'
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].fields.assigned_to, 'Foreman')
})

test('report url owned-field change on an existing row issues UPDATE', async () => {
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.url = 'user-1/rep-1/photos/p1/report-new.jpg'
  const stats = await finalizeWithPhotos({
    existingPhotos: [fixture.row],
    updateExistingPhotos: [fixture.patch],
    keptStoragePaths: [fixture.row.url],
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].url, fixture.row.url)
  assert.equal(stats.updates[0].fields.url, 'user-1/rep-1/photos/p1/report-new.jpg')
})

test('thumbnail_path change in owned fields issues UPDATE', async () => {
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.thumbnail_path = 'user-1/rep-1/photos/p1/thumb-new.jpg'
  const stats = await finalizeWithPhotos({
    existingPhotos: [fixture.row],
    updateExistingPhotos: [fixture.patch],
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].fields.thumbnail_path, 'user-1/rep-1/photos/p1/thumb-new.jpg')
})

test('new durable photo is INSERTed and does not UPDATE unchanged rows', async () => {
  const existing = durablePhotoFixture(1)
  const stats = await finalizeWithPhotos({
    existingPhotos: [existing.row],
    updateExistingPhotos: [existing.patch],
    keptStoragePaths: [existing.row.url, 'user-1/rep-1/photos/p2/report.jpg'],
    photoRecords: [{
      report_id: 'rep-1',
      owner_id: 'user-1',
      url: 'user-1/rep-1/photos/p2/report.jpg',
      caption: 'New',
      sequence: 2,
      layout: 'grid4',
      location: 'Area A',
      rotation_degrees: 0,
    }],
  })
  assert.equal(stats.updates.length, 0)
  assert.equal(stats.inserts.length, 1)
  assert.equal(stats.inserts[0][0].url, 'user-1/rep-1/photos/p2/report.jpg')
  assert.equal(stats.deletes.length, 0)
})

test('removed durable photo is DELETEd without UPDATE of remaining identical rows', async () => {
  const keep = durablePhotoFixture(1)
  const drop = durablePhotoFixture(2)
  const stats = await finalizeWithPhotos({
    existingPhotos: [keep.row, drop.row],
    updateExistingPhotos: [keep.patch],
    keptStoragePaths: [keep.row.url],
  })
  assert.equal(stats.updates.length, 0)
  assert.equal(stats.inserts.length, 0)
  assert.equal(stats.deletes.length, 1)
  assert.deepEqual(stats.deletes[0], [drop.row.id])
})

test('mixed reconcile: skip unchanged, UPDATE changed, INSERT new, DELETE extra', async () => {
  const unchanged = durablePhotoFixture(1)
  const changed = durablePhotoFixture(2)
  changed.patch.fields.caption = 'Changed caption'
  const extra = durablePhotoFixture(3)
  const stats = await finalizeWithPhotos({
    existingPhotos: [unchanged.row, changed.row, extra.row],
    updateExistingPhotos: [unchanged.patch, changed.patch],
    keptStoragePaths: [unchanged.row.url, changed.row.url, 'user-1/rep-1/photos/p4/report.jpg'],
    photoRecords: [{
      report_id: 'rep-1',
      owner_id: 'user-1',
      url: 'user-1/rep-1/photos/p4/report.jpg',
      caption: 'Inserted',
      sequence: 4,
      layout: 'grid4',
    }],
  })
  assert.equal(stats.updates.length, 1)
  assert.equal(stats.updates[0].url, changed.row.url)
  assert.equal(stats.inserts.length, 1)
  assert.equal(stats.inserts[0][0].url, 'user-1/rep-1/photos/p4/report.jpg')
  assert.equal(stats.deletes.length, 1)
  assert.deepEqual(stats.deletes[0], [extra.row.id])
})

test('unchanged-row skip still writes the same owned fields when a change is present', () => {
  const { row, patch } = durablePhotoFixture(1)
  patch.fields.caption = 'Edited'
  assert.equal(reportPhotoMetadataNeedsUpdate(row, patch.fields), true)
  assert.equal(reportPhotoMetadataNeedsUpdate(row, {
    ...patch.fields,
    caption: row.caption,
  }), false)
})

const MATCHING_REPORT_PAYLOAD = {
  project_id: 'proj-1',
  site_summary: 'old',
  shift: 'Day',
  report_date: '2026-08-05',
}

function matchingReportRow() {
  return {
    id: 'rep-1',
    owner_id: 'user-1',
    project_id: 'proj-1',
    site_summary: 'old',
    shift: 'Day',
    actions: null,
    equipment_hire: [],
    report_date: '2026-08-05',
    created_at: '2026-08-05T00:00:00Z',
    signature_url: null,
  }
}

function wrapFinalizeOps(supabase) {
  const ops = {
    getUser: 0,
    reportSelect: 0,
    reportUpdate: 0,
    labourDelete: 0,
    labourInsert: 0,
    plantDelete: 0,
    plantInsert: 0,
    photosList: 0,
  }
  const origGetUser = supabase.auth.getUser.bind(supabase.auth)
  supabase.auth.getUser = async () => {
    ops.getUser += 1
    return origGetUser()
  }
  const origFrom = supabase.from.bind(supabase)
  supabase.from = (table) => {
    const q = origFrom(table)
    if (table === 'daily_reports') {
      const origSelect = q.select.bind(q)
      const origUpdate = q.update.bind(q)
      q.select = (...args) => {
        ops.reportSelect += 1
        return origSelect(...args)
      }
      q.update = (...args) => {
        ops.reportUpdate += 1
        return origUpdate(...args)
      }
    }
    if (table === 'report_labour') {
      const origDelete = q.delete.bind(q)
      const origInsert = q.insert.bind(q)
      q.delete = (...args) => {
        ops.labourDelete += 1
        return origDelete(...args)
      }
      q.insert = (...args) => {
        ops.labourInsert += 1
        return origInsert(...args)
      }
    }
    if (table === 'report_plant') {
      const origDelete = q.delete.bind(q)
      const origInsert = q.insert.bind(q)
      q.delete = (...args) => {
        ops.plantDelete += 1
        return origDelete(...args)
      }
      q.insert = (...args) => {
        ops.plantInsert += 1
        return origInsert(...args)
      }
    }
    if (table === 'report_photos') {
      const origSelect = q.select.bind(q)
      q.select = (...args) => {
        ops.photosList += 1
        return origSelect(...args)
      }
    }
    return q
  }
  return ops
}

function unchangedBaseline(extra = {}) {
  return {
    reportRow: matchingReportRow(),
    labour: [],
    plant: [],
    photos: [],
    ...extra,
  }
}

test('DIARY-SAVE-FAST-PATH unchanged diary skips report/labour/plant/photo writes', async () => {
  const photoStats = photoStatsBag()
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    photoStats,
  })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload: [],
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(result.id, 'rep-1')
  assert.deepEqual(result.skipped, {
    report: true,
    labour: true,
    plant: true,
    photos: true,
  })
  assert.equal(ops.getUser, 0)
  assert.equal(ops.reportSelect, 0)
  assert.equal(ops.reportUpdate, 0)
  assert.equal(ops.labourDelete, 0)
  assert.equal(ops.labourInsert, 0)
  assert.equal(ops.plantDelete, 0)
  assert.equal(ops.plantInsert, 0)
  assert.equal(ops.photosList, 0)
  assert.equal(photoStats.updates.length, 0)
  assert.equal(photoStats.inserts.length, 0)
  assert.equal(photoStats.deletes.length, 0)
})

test('DIARY-SAVE-FAST-PATH report-only edit updates report and skips other domains', async () => {
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
  })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { ...MATCHING_REPORT_PAYLOAD, site_summary: 'changed' },
    labourPayload: [],
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(result.skipped.report, false)
  assert.equal(result.skipped.labour, true)
  assert.equal(result.skipped.plant, true)
  assert.equal(result.skipped.photos, true)
  assert.equal(ops.getUser, 0)
  assert.equal(ops.reportUpdate, 1)
  assert.equal(ops.labourDelete, 0)
  assert.equal(ops.photosList, 0)
})

test('DIARY-SAVE-FAST-PATH labour-only edit rewrites labour and skips plant/photos', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const supabase = buildFinalizeSupabaseMock({ beforeRow: matchingReportRow() })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload,
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(result.skipped.report, true)
  assert.equal(result.skipped.labour, false)
  assert.equal(result.skipped.plant, true)
  assert.equal(result.skipped.photos, true)
  assert.equal(ops.reportUpdate, 0)
  assert.equal(ops.labourDelete, 1)
  assert.equal(ops.labourInsert, 1)
  assert.equal(ops.plantDelete, 0)
  assert.equal(ops.photosList, 0)
})

test('DIARY-SAVE-FAST-PATH plant-only edit rewrites plant and skips labour/photos', async () => {
  const plantPayload = plantFormToPersistRows([
    { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
  ], 'rep-1')
  const supabase = buildFinalizeSupabaseMock({ beforeRow: matchingReportRow() })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload: [],
    plantPayload,
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(result.skipped.report, true)
  assert.equal(result.skipped.labour, true)
  assert.equal(result.skipped.plant, false)
  assert.equal(result.skipped.photos, true)
  assert.equal(ops.labourDelete, 0)
  assert.equal(ops.plantDelete, 1)
  assert.equal(ops.plantInsert, 1)
  assert.equal(ops.photosList, 0)
})

test('DIARY-SAVE-FAST-PATH photo-only edit reconciles photos and skips labour/plant', async () => {
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.caption = 'Edited'
  const photoStats = photoStatsBag()
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    existingPhotos: [fixture.row],
    photoStats,
  })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload: [],
    plantPayload: [],
    keptStoragePaths: [fixture.row.url],
    photoRecords: [],
    updateExistingPhotos: [fixture.patch],
    user: { id: 'user-1' },
    baseline: unchangedBaseline({
      photos: photoRowsToBaseline([fixture.row]),
    }),
  })
  assert.equal(result.skipped.report, true)
  assert.equal(result.skipped.labour, true)
  assert.equal(result.skipped.plant, true)
  assert.equal(result.skipped.photos, false)
  assert.equal(ops.labourDelete, 0)
  assert.equal(ops.plantDelete, 0)
  assert.equal(ops.photosList, 1)
  assert.equal(photoStats.updates.length, 1)
})

test('DIARY-SAVE-FAST-PATH combined dirty domains all persist', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const plantPayload = plantFormToPersistRows([
    { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
  ], 'rep-1')
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.caption = 'Edited'
  const photoStats = photoStatsBag()
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
    existingPhotos: [fixture.row],
    photoStats,
  })
  const ops = wrapFinalizeOps(supabase)
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { ...MATCHING_REPORT_PAYLOAD, site_summary: 'changed' },
    labourPayload,
    plantPayload,
    keptStoragePaths: [fixture.row.url],
    photoRecords: [],
    updateExistingPhotos: [fixture.patch],
    user: { id: 'user-1' },
    baseline: unchangedBaseline({
      photos: photoRowsToBaseline([fixture.row]),
    }),
  })
  assert.equal(result.skipped.report, false)
  assert.equal(result.skipped.labour, false)
  assert.equal(result.skipped.plant, false)
  assert.equal(result.skipped.photos, false)
  assert.equal(ops.reportUpdate, 1)
  assert.equal(ops.labourDelete, 1)
  assert.equal(ops.plantDelete, 1)
  assert.equal(ops.photosList, 1)
})

test('DIARY-SAVE-FAST-PATH failed labour rewrite does not skip a retry', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const baseline = unchangedBaseline()
  const failing = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    labourDeleteError: { message: 'labour delete failed' },
  })
  await assert.rejects(
    () => finalizeSiteDiarySave(failing, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: MATCHING_REPORT_PAYLOAD,
      labourPayload,
      plantPayload: [],
      user: { id: 'user-1' },
      baseline,
    }),
    (err) => err instanceof DiarySaveError && err.code === 'LABOUR_DELETE_FAILED',
  )
  const retry = buildFinalizeSupabaseMock({ beforeRow: matchingReportRow() })
  const ops = wrapFinalizeOps(retry)
  const result = await finalizeSiteDiarySave(retry, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload,
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    user: { id: 'user-1' },
    baseline,
  })
  assert.equal(result.skipped.labour, false)
  assert.equal(ops.labourDelete, 1)
  assert.equal(ops.labourInsert, 1)
})

test('DIARY-SAVE-FAST-PATH omitted user still authenticates on report UPDATE', async () => {
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
  })
  const ops = wrapFinalizeOps(supabase)
  await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { ...MATCHING_REPORT_PAYLOAD, site_summary: 'changed' },
    baseline: unchangedBaseline(),
  })
  assert.equal(ops.getUser, 1)
})

test('DIARY-SAVE-FAST-PATH anti-wipe verify SELECT remains on report UPDATE', async () => {
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
  })
  wrapFinalizeOps(supabase)
  await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { ...MATCHING_REPORT_PAYLOAD, site_summary: 'changed' },
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(supabase.dailyReportsSelectPhase, 1)
})

test('DIARY-SAVE-FAST-PATH page wiring: snapshots commit after success; PDF still follows finalize', () => {
  const page = readFileSync(
    join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
    'utf8',
  )
  const handleSaveStart = page.indexOf('const handleSave = async')
  const saveFn = page.slice(handleSaveStart, handleSaveStart + 32000)
  const finalizeIdx = saveFn.indexOf('finalizeSiteDiarySave')
  const savedCheck = saveFn.indexOf('if (!saved?.id')
  const labourCommit = saveFn.indexOf('lastPersistedLabourRef.current = labourPayload')
  const plantCommit = saveFn.indexOf('lastPersistedPlantRef.current = plantPayload')
  const photosCommit = saveFn.indexOf('lastPersistedPhotosRef.current = durablePhotosToBaseline')
  const prepareIdx = saveFn.indexOf('prepareSiteDiaryPdf')
  assert.ok(finalizeIdx > 0)
  assert.ok(savedCheck > finalizeIdx)
  assert.ok(labourCommit > savedCheck)
  assert.ok(plantCommit > savedCheck)
  assert.ok(photosCommit > savedCheck)
  assert.ok(prepareIdx > finalizeIdx)
  assert.match(saveFn, /baseline:\s*\{/)
  assert.match(saveFn, /user,/)
  assert.doesNotMatch(saveFn, /persist-prepared-photo\.js/)
  assert.match(page, /mergeAutosaveAckIntoReportRow/)
  assert.match(page, /persistSaveAreaGroup/)
})
