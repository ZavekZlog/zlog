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
  FINALIZE_SITE_DIARY_SAVE_RPC,
  adaptReportPayloadForLiveRow,
  buildRpcReportPatch,
  buildDesiredPhotoRowsForFinalize,
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

test('live schema final-save allowlist is writable subset of OpenAPI snapshot', () => {
  const snap = JSON.parse(
    readFileSync(join(root, 'docs/LIVE_SCHEMA_DAILY_REPORTS.json'), 'utf8'),
  )
  const snapshotNames = new Set(snap.tables.daily_reports.columnNames)
  const neverWrite = ['is_draft', 'shift_type', 'actions_required', 'current_phase', 'sign_in_sheet_url']
  for (const col of neverWrite) {
    assert.ok(!LIVE_DAILY_REPORTS.columns.includes(col), `allowlist must not write ${col}`)
  }
  assert.ok(!snapshotNames.has('is_draft'), 'live OpenAPI must not expose is_draft')
  const requiredWritable = [
    'owner_id',
    'project_id',
    'site_summary',
    'shift',
    'actions',
    'equipment_hire',
    'permits',
    'cover_photo_url',
    'visitors_register_provenance',
  ]
  for (const col of requiredWritable) {
    assert.ok(LIVE_DAILY_REPORTS.columns.includes(col), `allowlist includes ${col}`)
  }
  const snapshotAlignedWritable = requiredWritable.filter((col) => col !== 'permits')
  for (const col of snapshotAlignedWritable) {
    assert.ok(snapshotNames.has(col), `snapshot includes ${col}`)
  }
  assert.ok(
    LIVE_DAILY_REPORTS.columns.includes('permits'),
    'permits must be writable via finalize RPC even when OpenAPI snapshot predates the column',
  )
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
  assert.match(page, /SAVE_CTA_PREPARING_LABEL/)
  assert.match(page, /SAVE_CTA_SHARE_READY_LABEL/)
  assert.match(page, /Shared ✓/)
  assert.match(page, /showSaveBanner/)
  assert.match(page, /shouldShowManualSaveConfirmation/)
  assert.match(page, /zlog-manual-save-confirmation/)
  assert.match(page, /POST_SAVE_SHARE_DELAY_MS/)
  assert.match(page, /saveNavTimerRef\.current = setTimeout/)
  // Shared ✓ after share/download returns — not before PDF; saving stays true until handoff completes.
  const handleSaveStart = page.indexOf('const handleSave = async')
  assert.ok(handleSaveStart > 0, 'handleSave not found')
  const saveFn = page.slice(handleSaveStart, handleSaveStart + 120000)
  const finalizeIdx = saveFn.indexOf('finalizeSiteDiarySave')
  const postFinalize = saveFn.slice(finalizeIdx)
  const prepareIdx = postFinalize.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
  assert.ok(finalizeIdx > 0 && prepareIdx > 0, 'worker PDF export follows finalizeSiteDiarySave')
  assert.doesNotMatch(
    postFinalize.slice(0, prepareIdx),
    /setJustSaved\(true\)/,
    'no Shared ✓ before worker PDF export',
  )
  const afterPrepare = postFinalize.slice(prepareIdx)
  assert.doesNotMatch(saveFn, /prepareSiteDiaryPdf/)
  assert.match(postFinalize, /useNativeFileShareOnPrepare = canShareSiteDiaryPdfViaNativeFile\(\)/)
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
  assert.match(page, /SAVE_CTA_IDLE_LABEL/)
  assert.match(page, /SAVE_CTA_SAVING_LABEL/)
  assert.match(page, /SAVE_CTA_PREPARING_LABEL/)
  assert.match(page, /COVER_UPLOAD_FAIL_MESSAGE/)
  assert.match(page, /Successful cover persistence must clear a stale red upload banner/)
  assert.doesNotMatch(page, /You must be signed in to save a report/)
  assert.doesNotMatch(page, /report id:/)
  assert.doesNotMatch(page, /No INSERT performed/)
  assert.match(page, /TODO\(P1\+\): Persist in-progress diary form edits/)
})

test('diary-save module never calls insert on daily_reports', () => {
  const src = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  assert.match(src, /supabase\.rpc\(FINALIZE_SITE_DIARY_SAVE_RPC/)
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

test('finalizeSiteDiarySave succeeds via atomic RPC and returns verified row', async () => {
  const reportId = 'rep-1'
  const projectId = 'proj-1'
  let rpcPatch = null
  const supabase = buildFinalizeRpcMock({
    reportId,
    projectId,
    reportRow: {
      id: reportId,
      owner_id: 'user-1',
      project_id: projectId,
      site_summary: 'persisted',
      shift: 'Day',
      actions: null,
      equipment_hire: [],
      report_date: '2026-08-05',
      created_at: '2026-08-05T00:00:00Z',
    },
    onRpc(name, args) {
      if (name === FINALIZE_SITE_DIARY_SAVE_RPC) rpcPatch = args.p_report_patch
    },
  })

  const result = await finalizeSiteDiarySave(supabase, {
    reportId,
    projectId,
    reportPayload: { site_summary: 'persisted', shift: 'Day', is_draft: false },
  })
  assert.equal(result.id, reportId)
  assert.equal(result.diagnostic.ok, true)
  assert.equal(result.diagnostic.mode, 'RPC')
  assert.equal(result.diagnostic.verifiedSiteSummary, 'persisted')
  assert.equal(rpcPatch.site_summary, 'persisted')
  assert.equal(Object.prototype.hasOwnProperty.call(rpcPatch, 'is_draft'), false)
  assert.equal(supabase.rpcCalls.length, 1)
  assert.equal(supabase.rpcCalls[0].name, FINALIZE_SITE_DIARY_SAVE_RPC)
})

test('finalizeSiteDiarySave fails when RPC response identity mismatches', async () => {
  const supabase = buildFinalizeRpcMock({
    identityMismatch: { report_id: 'other-report', project_id: 'proj-1' },
  })

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
  )
})

function buildFinalizeRpcMock({
  reportId = 'rep-1',
  projectId = 'proj-1',
  reportRow = null,
  beforeRow = null,
  updatedRow = null,
  rpcError = null,
  rpcResult = null,
  identityMismatch = null,
  cleanupJobs = [],
  storageRemoveError = null,
  markCleanupError = null,
  onRpc = null,
  onDailyReportUpdate = null,
  dailyReportUpdateError = null,
} = {}) {
  const baseRow = reportRow ?? updatedRow ?? beforeRow ?? {
    id: reportId,
    owner_id: 'user-1',
    project_id: projectId,
    site_summary: 'persisted',
    shift: 'Day',
    actions: null,
    equipment_hire: [],
    report_date: '2026-08-05',
    created_at: '2026-08-05T00:00:00Z',
  }
  const rpcCalls = []
  const storageRemoved = []
  const markCleanupCalls = []

  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null }
      },
    },
    from(table) {
      throw new Error(`unexpected from(${table})`)
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      onRpc?.(name, args)
      if (name === 'mark_report_storage_cleanup') {
        markCleanupCalls.push(args)
        return { data: 1, error: markCleanupError || null }
      }
      if (name === FINALIZE_SITE_DIARY_SAVE_RPC) {
        if (dailyReportUpdateError) {
          return { data: null, error: dailyReportUpdateError }
        }
        if (rpcError) {
          return { data: null, error: rpcError }
        }
        onDailyReportUpdate?.(args.p_report_patch)
        const result = rpcResult ?? {
          ok: true,
          report_id: identityMismatch?.report_id ?? reportId,
          project_id: identityMismatch?.project_id ?? projectId,
          report: {
            ...baseRow,
            ...(args.p_report_patch && typeof args.p_report_patch === 'object' ? args.p_report_patch : {}),
            id: identityMismatch?.report_id ?? reportId,
            project_id: identityMismatch?.project_id ?? projectId,
          },
          labour_count: Array.isArray(args.p_labour) ? args.p_labour.length : 0,
          plant_count: Array.isArray(args.p_plant) ? args.p_plant.length : 0,
          photo_count: Array.isArray(args.p_photos) ? args.p_photos.length : 0,
          cleanupJobs,
        }
        if (identityMismatch?.report_id && String(result.report.id) !== String(reportId)) {
          result.report.id = identityMismatch.report_id
        }
        return { data: result, error: null }
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
    markCleanupCalls,
  }
  return supabase
}

const buildFinalizeSupabaseMock = buildFinalizeRpcMock

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

function unchangedBaseline(extra = {}) {
  return {
    reportRow: matchingReportRow(),
    labour: [],
    plant: [],
    photos: [],
    ...extra,
  }
}

test('finalizeSiteDiarySave sends labour and plant in one atomic RPC', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const plantPayload = plantFormToPersistRows([
    { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
  ], 'rep-1')
  const priorLabour = labourFormToPersistRows([
    { trade: 'Bricklayer', company: 'B', headcount: '1', hours: '8', notes: '' },
  ], 'rep-1').map((row, i) => ({ ...row, id: `labour-prior-${i}` }))
  const priorPlant = plantFormToPersistRows([
    { plant_type: 'Dumper', quantity: '1', hours: '4', notes: '' },
  ], 'rep-1').map((row, i) => ({ ...row, id: `plant-prior-${i}` }))
  const supabase = buildFinalizeRpcMock({})
  await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { site_summary: 'persisted' },
    labourPayload,
    plantPayload,
    baseline: unchangedBaseline({ labour: priorLabour, plant: priorPlant }),
  })
  assert.equal(supabase.rpcCalls.length, 1)
  const { args } = supabase.rpcCalls[0]
  assert.deepEqual(args.p_labour, labourPayload)
  assert.deepEqual(args.p_plant, plantPayload)
})

test('finalizeSiteDiarySave rejects when RPC fails', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const priorLabour = labourFormToPersistRows([
    { trade: 'Bricklayer', company: 'B', headcount: '1', hours: '8', notes: '' },
  ], 'rep-1').map((row, i) => ({ ...row, id: `labour-prior-${i}` }))
  const supabase = buildFinalizeRpcMock({
    rpcError: { message: 'labour delete failed' },
  })

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
      labourPayload,
      baseline: unchangedBaseline({ labour: priorLabour }),
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(supabase.rpcCalls.length, 1)
})

test('finalizeSiteDiarySave does not call child-table from() after RPC error', async () => {
  const supabase = buildFinalizeRpcMock({
    rpcError: { message: 'plant replace failed' },
  })
  let fromCalled = false
  supabase.from = () => {
    fromCalled = true
    throw new Error('from should not run')
  }

  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
      plantPayload: plantFormToPersistRows([
        { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
      ], 'rep-1'),
      baseline: unchangedBaseline({
        plant: plantFormToPersistRows([
          { plant_type: 'Dumper', quantity: '1', hours: '4', notes: '' },
        ], 'rep-1'),
      }),
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(fromCalled, false)
})

test('finalizeSiteDiarySave uses single RPC — no client child reconciliation', () => {
  const saveLib = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  const finalizeBody = saveLib.slice(
    saveLib.indexOf('export async function finalizeSiteDiarySave'),
    saveLib.indexOf('/** @deprecated kept for tests'),
  )
  assert.match(finalizeBody, /supabase\.rpc\(FINALIZE_SITE_DIARY_SAVE_RPC/)
  assert.doesNotMatch(finalizeBody, /replaceLabour/)
  assert.doesNotMatch(finalizeBody, /replacePlant/)
  assert.doesNotMatch(finalizeBody, /reconcilePhotos/)
  assert.doesNotMatch(finalizeBody, /\.from\(\s*['"]report_labour['"]\)/)
  assert.doesNotMatch(finalizeBody, /\.from\(\s*['"]report_plant['"]\)/)
  assert.doesNotMatch(finalizeBody, /\.from\(\s*['"]report_photos['"]\)/)
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
  return { rpcArgs: null, finalizeRpcCount: 0, skippedPhotos: null }
}

function analyzeDesiredPhotos(p_photos, baselineRows) {
  if (p_photos == null) {
    return { updates: [], deletes: [], inserts: [] }
  }
  const desired = p_photos
  const desiredUrls = new Set(desired.map((r) => r.url))
  const inserts = desired.filter((r) => !baselineRows.some((b) => b.url === r.url))
  const deletes = baselineRows.filter((b) => !desiredUrls.has(b.url)).map((b) => b.id)
  const updates = []
  for (const row of desired) {
    const base = baselineRows.find((b) => b.url === row.url)
    if (base && reportPhotoMetadataNeedsUpdate(base, row)) {
      updates.push({ url: row.url, fields: row })
    }
  }
  return { updates, deletes, inserts }
}

async function finalizeWithPhotos({
  existingPhotos,
  updateExistingPhotos,
  photoRecords = [],
  keptStoragePaths,
  photoStats = photoStatsBag(),
}) {
  const baselinePhotos = photoRowsToBaseline(existingPhotos)
  const supabase = buildFinalizeRpcMock({
    onRpc(name, args) {
      if (name === FINALIZE_SITE_DIARY_SAVE_RPC) {
        photoStats.finalizeRpcCount += 1
        photoStats.rpcArgs = args
      }
    },
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: MATCHING_REPORT_PAYLOAD,
    labourPayload: [],
    plantPayload: [],
    keptStoragePaths: keptStoragePaths ?? existingPhotos.map((row) => row.url),
    photoRecords,
    updateExistingPhotos,
    baseline: unchangedBaseline({ photos: baselinePhotos }),
  })
  photoStats.skippedPhotos = result.skipped?.photos ?? null
  const intent = analyzeDesiredPhotos(photoStats.rpcArgs?.p_photos, existingPhotos)
  return {
    updates: intent.updates,
    deletes: intent.deletes.length ? [intent.deletes] : [],
    inserts: intent.inserts.length ? [intent.inserts] : [],
    finalizeRpcCount: photoStats.finalizeRpcCount,
    skippedPhotos: photoStats.skippedPhotos,
    p_photos: photoStats.rpcArgs?.p_photos ?? null,
  }
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

test('19 identical durable photo rows skip photo RPC domain', async () => {
  const fixtures = Array.from({ length: 19 }, (_, i) => durablePhotoFixture(i + 1))
  const stats = await finalizeWithPhotos({
    existingPhotos: fixtures.map((f) => f.row),
    updateExistingPhotos: fixtures.map((f) => f.patch),
  })
  assert.equal(stats.skippedPhotos, true)
  assert.equal(stats.p_photos, null)
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

test('buildDesiredPhotoRowsForFinalize fails closed when kept url has no row data', () => {
  assert.throws(
    () => buildDesiredPhotoRowsForFinalize({
      keptStoragePaths: ['user-1/rep-1/photos/ghost/report.jpg'],
      baselinePhotos: [],
    }),
    (err) => err instanceof DiarySaveError && err.code === 'PHOTOS_MISSING_ROW',
  )
})

test('report url patch does not alter canonical kept-path identity in RPC desired set', async () => {
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.url = 'user-1/rep-1/photos/p1/report-new.jpg'
  const stats = await finalizeWithPhotos({
    existingPhotos: [fixture.row],
    updateExistingPhotos: [fixture.patch],
    keptStoragePaths: [fixture.row.url],
  })
  assert.ok(Array.isArray(stats.p_photos))
  assert.equal(stats.p_photos[0].url, fixture.row.url)
  assert.notEqual(stats.p_photos[0].url, 'user-1/rep-1/photos/p1/report-new.jpg')
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

function wrapFinalizeRpcOps(supabase) {
  const ops = { finalizeRpc: 0, lastArgs: null, markCleanup: 0 }
  const origRpc = supabase.rpc.bind(supabase)
  supabase.rpc = async (name, args) => {
    if (name === FINALIZE_SITE_DIARY_SAVE_RPC) {
      ops.finalizeRpc += 1
      ops.lastArgs = args
    }
    if (name === 'mark_report_storage_cleanup') ops.markCleanup += 1
    return origRpc(name, args)
  }
  return ops
}

const wrapFinalizeOps = wrapFinalizeRpcOps

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
  assert.equal(ops.finalizeRpc, 0)
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
  assert.equal(ops.finalizeRpc, 1)
  assert.ok(ops.lastArgs.p_report_patch)
  assert.equal(ops.lastArgs.p_labour, null)
  assert.equal(ops.lastArgs.p_plant, null)
  assert.equal(ops.lastArgs.p_photos, null)
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
  assert.equal(ops.finalizeRpc, 1)
  assert.equal(ops.lastArgs.p_report_patch, null)
  assert.ok(Array.isArray(ops.lastArgs.p_labour))
  assert.equal(ops.lastArgs.p_plant, null)
  assert.equal(ops.lastArgs.p_photos, null)
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
  assert.equal(ops.finalizeRpc, 1)
  assert.equal(ops.lastArgs.p_report_patch, null)
  assert.equal(ops.lastArgs.p_labour, null)
  assert.ok(Array.isArray(ops.lastArgs.p_plant))
  assert.equal(ops.lastArgs.p_photos, null)
})

test('DIARY-SAVE-FAST-PATH photo-only edit reconciles photos and skips labour/plant', async () => {
  const fixture = durablePhotoFixture(1)
  fixture.patch.fields.caption = 'Edited'
  const supabase = buildFinalizeSupabaseMock({ beforeRow: matchingReportRow() })
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
  assert.equal(ops.finalizeRpc, 1)
  assert.ok(Array.isArray(ops.lastArgs.p_photos))
  assert.equal(ops.lastArgs.p_photos.length, 1)
  assert.equal(ops.lastArgs.p_photos[0].caption, 'Edited')
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
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
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
  assert.equal(ops.finalizeRpc, 1)
  assert.ok(ops.lastArgs.p_report_patch)
  assert.ok(Array.isArray(ops.lastArgs.p_labour))
  assert.ok(Array.isArray(ops.lastArgs.p_plant))
  assert.ok(Array.isArray(ops.lastArgs.p_photos))
})

test('DIARY-SAVE-FAST-PATH failed labour rewrite does not skip a retry', async () => {
  const labourPayload = labourFormToPersistRows([
    { trade: 'Carpenter', company: 'A', headcount: '2', hours: '8', notes: '' },
  ], 'rep-1')
  const priorLabour = labourFormToPersistRows([
    { trade: 'Bricklayer', company: 'B', headcount: '1', hours: '8', notes: '' },
  ], 'rep-1').map((row, i) => ({ ...row, id: `labour-prior-${i}` }))
  const baseline = unchangedBaseline({ labour: priorLabour })
  const failing = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    rpcError: { message: 'labour delete failed' },
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
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
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
  assert.equal(ops.finalizeRpc, 1)
})

test('DIARY-SAVE-FAST-PATH omitted user still calls finalize RPC', async () => {
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
  assert.equal(ops.finalizeRpc, 1)
})

test('DIARY-SAVE-FAST-PATH RPC response identity is verified on report UPDATE', async () => {
  const supabase = buildFinalizeSupabaseMock({
    beforeRow: matchingReportRow(),
    updatedRow: { ...matchingReportRow(), site_summary: 'changed' },
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { ...MATCHING_REPORT_PAYLOAD, site_summary: 'changed' },
    user: { id: 'user-1' },
    baseline: unchangedBaseline(),
  })
  assert.equal(result.diagnostic.ok, true)
  assert.equal(result.row.site_summary, 'changed')
})

test('buildRpcReportPatch weather-only omits unrelated JSON array fields', () => {
  const patch = buildRpcReportPatch({ weather: 'Rain' }, 'proj-1')
  assert.equal(patch.weather, 'Rain')
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'equipment_hire'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'hs_incidents'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'rfis'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'variations'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'temporary_works'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'permits'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'visitors_register_provenance'), false)
})

test('buildRpcReportPatch cover omit vs explicit null', () => {
  const omitted = buildRpcReportPatch({ site_summary: 'x' }, 'proj-1')
  assert.equal(Object.prototype.hasOwnProperty.call(omitted, 'cover_photo_url'), false)
  const cleared = buildRpcReportPatch({ cover_photo_url: null }, 'proj-1')
  assert.equal(Object.prototype.hasOwnProperty.call(cleared, 'cover_photo_url'), true)
  assert.equal(cleared.cover_photo_url, null)
})

test('buildRpcReportPatch preserves explicit empty array and maps alias keys', () => {
  const patch = buildRpcReportPatch({
    shift_type: 'Night',
    actions_required: 'Fix gate',
    equipment_hire: [],
    hs_incidents: null,
  }, 'proj-1')
  assert.equal(patch.shift, 'Night')
  assert.equal(patch.actions, 'Fix gate')
  assert.deepEqual(patch.equipment_hire, [])
  assert.deepEqual(patch.hs_incidents, [])
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'rfis'), false)
})

test('final save uses atomic RPC only — no client daily_reports update path', () => {
  const src = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  assert.doesNotMatch(src, /async function updateDailyReportRow/)
  assert.doesNotMatch(src, /missingLiveColumnFromError/)
  assert.match(src, /supabase\.rpc\(FINALIZE_SITE_DIARY_SAVE_RPC/)
})

test('autosave keeps private missing-column fallback; final save does not import it', () => {
  const autosave = readFileSync(join(root, 'lib/diary-autosave.js'), 'utf8')
  const save = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
  assert.match(autosave, /function missingLiveColumnFromError/)
  assert.doesNotMatch(autosave, /export function missingLiveColumnFromError/)
  assert.match(autosave, /drop-missing-column/)
  assert.doesNotMatch(save, /missingLiveColumnFromError/)
})

test('finalizeSiteDiarySave succeeds with permits on payload when UPDATE accepts all columns', async () => {
  const permits = [{ id: 'p1', permitType: 'Hot works', reference: 'A', issuedTo: 'Co', status: 'Issued', formPhotoPath: null }]
  let seenPayload = null
  const supabase = buildFinalizeSupabaseMock({
    onDailyReportUpdate: (payload) => {
      seenPayload = payload
    },
  })
  const result = await finalizeSiteDiarySave(supabase, {
    reportId: 'rep-1',
    projectId: 'proj-1',
    reportPayload: { site_summary: 'persisted', permits },
  })
  assert.equal(result.diagnostic.ok, true)
  assert.deepEqual(seenPayload.permits, permits)
})

test('finalizeSiteDiarySave fails on missing permits column — no retry or partial success', async () => {
  const permitsError = {
    code: 'PGRST204',
    message: "Could not find the 'permits' column of 'daily_reports' in the schema cache",
  }
  const supabase = buildFinalizeSupabaseMock({
    dailyReportUpdateError: permitsError,
  })
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: {
        site_summary: 'persisted',
        permits: [{ id: 'p1', permitType: 'Dig', reference: null, issuedTo: null, status: 'Issued', formPhotoPath: null }],
      },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(supabase.rpcCalls.length, 1)
})

test('finalizeSiteDiarySave fails on non-schema RPC errors without retry', async () => {
  let updateCalls = 0
  const supabase = buildFinalizeSupabaseMock({
    dailyReportUpdateError: { code: '42501', message: 'permission denied for table daily_reports' },
    onDailyReportUpdate: () => {
      updateCalls += 1
    },
  })
  await assert.rejects(
    () => finalizeSiteDiarySave(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      reportPayload: { site_summary: 'persisted' },
    }),
    (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
  )
  assert.equal(updateCalls, 0)
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
  const prepareIdx = saveFn.indexOf('runSiteDiaryPdfExportToShareReadyArtifact')
  assert.ok(finalizeIdx > 0)
  assert.ok(savedCheck > finalizeIdx)
  assert.ok(labourCommit > savedCheck)
  assert.ok(plantCommit > savedCheck)
  assert.ok(photosCommit > savedCheck)
  assert.ok(prepareIdx > finalizeIdx)
  assert.doesNotMatch(saveFn, /prepareSiteDiaryPdf/)
  assert.match(saveFn, /baseline:\s*\{/)
  assert.match(saveFn, /user,/)
  assert.doesNotMatch(saveFn, /persist-prepared-photo\.js/)
  assert.match(page, /mergeAutosaveAckIntoReportRow/)
  assert.match(page, /persistSaveAreaGroup/)
})
