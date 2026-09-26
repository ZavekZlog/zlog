import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hsIncidentsFromDb } from './diary-daily-records.js'
import {
  AUTOSAVE_STATUS_CONFLICT,
  AUTOSAVE_STATUS_FAILED,
  AUTOSAVE_STATUS_FAILED_AUTH,
  AUTOSAVE_STATUS_FAILED_DB,
  AUTOSAVE_STATUS_FAILED_NETWORK,
  AUTOSAVE_STATUS_SAVED,
  AUTOSAVE_STATUS_SAVING,
  DIARY_AUTOSAVE_ABSENT_ON_LIVE,
  DIARY_AUTOSAVE_COLUMNS,
  DIARY_AUTOSAVE_DEBOUNCE_MS,
  DIARY_AUTOSAVE_FORBIDDEN_KEYS,
  autosavePayloadsEqual,
  buildDiaryAutosavePayload,
  classifyAutosaveFailure,
  createDiaryAutosaveOperationQueue,
  nextDiaryAutosaveLifecycleGeneration,
  pickDiaryAutosavePayload,
  resolveHydrateAutosaveSuppress,
  runDiaryAutosave,
  shouldRunDiaryAutosave,
  dismissAutosaveSuccessStatus,
  snapshotFromLiveRow,
  autosaveStatusAfterResult,
  autosaveStatusMessage,
  shouldShowDiaryAutosaveStatus,
  visibleDiaryAutosaveStatusCopy,
  shouldShowManualSaveConfirmation,
  diaryPersistenceUiPhase,
} from './diary-autosave.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')

function createAutosaveSupabase(initialRow, { updateError = null, readError = null } = {}) {
  const calls = { insert: 0, update: 0, select: 0, updatePayloads: [], selectLists: [] }
  let row = { ...initialRow }
  const missingTw = (cols) => /temporary_works/i.test(String(cols || ''))
  const twError = {
    code: 'PGRST204',
    message: "Could not find the 'temporary_works' column of 'daily_reports' in the schema cache",
  }

  return {
    calls,
    get row() {
      return row
    },
    setRow(next) {
      row = { ...next }
    },
    from(table) {
      assert.equal(table, 'daily_reports')
      const state = { mode: 'read', payload: null, select: '' }
      const api = {
        select(cols) {
          state.select = cols
          calls.selectLists.push(cols)
          return api
        },
        update(payload) {
          calls.update += 1
          calls.updatePayloads.push(payload)
          state.mode = 'write'
          state.payload = payload
          return api
        },
        insert() {
          calls.insert += 1
          throw new Error('autosave must never insert')
        },
        eq() {
          return api
        },
        async maybeSingle() {
          if (missingTw(state.select) || (state.payload && (
            Object.prototype.hasOwnProperty.call(state.payload, 'temporary_works')
            || Object.prototype.hasOwnProperty.call(state.payload, 'temporary_works_applicable')
          ))) {
            return { data: null, error: twError }
          }
          if (state.mode === 'write') {
            if (updateError) return { data: null, error: updateError }
            row = { ...row, ...state.payload }
            return { data: { ...row }, error: null }
          }
          calls.select += 1
          if (readError) return { data: null, error: readError }
          return { data: { ...row }, error: null }
        },
      }
      return api
    },
  }
}

const emptyLive = {
  id: 'rep-beeches',
  project_id: 'proj-beeches',
  weather: null,
  site_summary: '',
  visitors: null,
  visitors_register_provenance: null,
  delays_issues: null,
  actions: null,
  equipment_hire: [],
  hs_incidents: [],
  rfis: [],
  variations: [],
  cover_photo_url: null,
  temporary_works_applicable: null,
  temporary_works: [],
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('cross-report autosave ownership', () => {
  it('keeps late A completion and A closure out of active report B state and queue', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    const ownerA = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const ownerB = { reportId: 'report-b', projectId: 'project-b', generation: 2 }
    const payloadA = { weather: 'A weather' }
    const payloadB = { weather: 'B weather' }
    const writeA = deferred()
    const writeB = deferred()
    const writes = []
    const client = {
      acked: 'B initial ack',
      persisted: 'B initial persisted',
      status: 'B initial status',
      form: 'B current form',
    }

    const execute = (owner, payload) => {
      writes.push({ owner: { ...owner }, payload: { ...payload } })
      if (owner.reportId === ownerA.reportId && payload.weather === payloadA.weather) {
        return writeA.promise
      }
      if (owner.reportId === ownerB.reportId) return writeB.promise
      return Promise.resolve({ acked: 'illegal A write of B payload' })
    }
    const commit = (result) => {
      client.acked = result.acked
      client.persisted = result.persisted
      client.status = result.status
      client.form = result.form
    }

    queue.setActive(ownerA)
    const pendingA = queue.enqueue({ owner: ownerA, payload: payloadA, execute, commit })

    queue.setActive(ownerB)
    const pendingB = queue.enqueue({ owner: ownerB, payload: payloadB, execute, commit })

    writeA.resolve({
      acked: 'A ack',
      persisted: 'A persisted',
      status: 'A saved',
      form: 'A form',
    })
    await pendingA

    assert.deepEqual(client, {
      acked: 'B initial ack',
      persisted: 'B initial persisted',
      status: 'B initial status',
      form: 'B current form',
    })
    assert.equal(
      writes.some(({ owner, payload }) => (
        owner.reportId === ownerA.reportId && payload.weather === payloadB.weather
      )),
      false,
      'report A closure must not write report B payload',
    )

    writeB.resolve({
      acked: 'B ack',
      persisted: 'B persisted',
      status: null,
      form: 'B current form',
    })
    await pendingB
    assert.deepEqual(client, {
      acked: 'B ack',
      persisted: 'B persisted',
      status: null,
      form: 'B current form',
    })
  })

  it('serializes different generations that target the same physical report', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    const ownerA1 = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const ownerA2 = { reportId: 'report-a', projectId: 'project-a', generation: 2 }
    const firstWrite = deferred()
    const secondWrite = deferred()
    const secondStarted = deferred()
    const writes = []
    const commits = []

    const execute = (_owner, payload) => {
      writes.push(payload.weather)
      if (payload.weather === 'A1') return firstWrite.promise
      secondStarted.resolve()
      return secondWrite.promise
    }

    queue.setActive(ownerA1)
    const pendingA1 = queue.enqueue({
      owner: ownerA1,
      payload: { weather: 'A1' },
      execute,
      commit: () => {},
    })

    queue.setActive(ownerA2)
    const pendingA2 = queue.enqueue({
      owner: ownerA2,
      payload: { weather: 'A2' },
      execute,
      commit: (result) => commits.push(result.acked),
    })

    assert.deepEqual(writes, ['A1'], 'A2 must not start while A1 is unresolved')
    assert.equal(pendingA2, pendingA1, 'same physical report must share one drain')
    assert.equal(queue.waitFor(ownerA2), pendingA1, 'flush must join the physical report drain')

    firstWrite.resolve({ acked: 'A1 ack' })
    await secondStarted.promise
    assert.deepEqual(writes, ['A1', 'A2'])

    secondWrite.resolve({ acked: 'A2 ack' })
    await pendingA2
    assert.deepEqual(commits, ['A2 ack'], 'only the current lifecycle may commit client state')
  })

  it('never reactivates an old lifecycle token after A to B to A', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    const ownerA1 = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const ownerB = { reportId: 'report-b', projectId: 'project-b', generation: 2 }
    const writeA1 = deferred()
    const commits = []

    queue.setActive(ownerA1)
    const pendingA1 = queue.enqueue({
      owner: ownerA1,
      payload: { weather: 'A1' },
      execute: () => writeA1.promise,
      commit: (result) => commits.push(result.acked),
    })

    queue.setActive(ownerB)
    queue.setActive(ownerA1)

    writeA1.resolve({ acked: 'old A1 ack' })
    await pendingA1

    assert.deepEqual(commits, [], 'an invalidated lifecycle must never regain commit authority')
  })

  it('issues lifecycle tokens that are unique across Workbench instances', () => {
    const oldWorkbenchToken = nextDiaryAutosaveLifecycleGeneration()
    const newWorkbenchToken = nextDiaryAutosaveLifecycleGeneration()
    assert.ok(newWorkbenchToken > oldWorkbenchToken)
  })

  it('serializes the same physical report across separate queue instances', async () => {
    const oldWorkbenchQueue = createDiaryAutosaveOperationQueue()
    const newWorkbenchQueue = createDiaryAutosaveOperationQueue()
    const oldOwner = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const newOwner = { reportId: 'report-a', projectId: 'project-a', generation: 2 }
    const firstWrite = deferred()
    const secondWrite = deferred()
    const secondStarted = deferred()
    const writes = []

    const execute = (_owner, payload) => {
      writes.push(payload.weather)
      if (payload.weather === 'A1') return firstWrite.promise
      secondStarted.resolve()
      return secondWrite.promise
    }

    oldWorkbenchQueue.setActive(oldOwner)
    const pendingA1 = oldWorkbenchQueue.enqueue({
      owner: oldOwner,
      payload: { weather: 'A1' },
      execute,
      commit: () => {},
    })
    oldWorkbenchQueue.clearActive(oldOwner)

    newWorkbenchQueue.setActive(newOwner)
    const pendingA2 = newWorkbenchQueue.enqueue({
      owner: newOwner,
      payload: { weather: 'A2' },
      execute,
      commit: () => {},
    })

    assert.deepEqual(writes, ['A1'], 'new Workbench A2 must wait for old Workbench A1')
    assert.equal(pendingA2, pendingA1, 'both Workbench instances must join one physical drain')

    firstWrite.resolve({ acked: 'A1 ack' })
    await secondStarted.promise
    assert.deepEqual(writes, ['A1', 'A2'])

    secondWrite.resolve({ acked: 'A2 ack' })
    await pendingA2
  })

  it('exposes an old Workbench physical lane to new-instance waitFor', async () => {
    const oldWorkbenchQueue = createDiaryAutosaveOperationQueue()
    const newWorkbenchQueue = createDiaryAutosaveOperationQueue()
    const oldOwner = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const newOwner = { reportId: 'report-a', projectId: 'project-a', generation: 2 }
    const firstWrite = deferred()

    oldWorkbenchQueue.setActive(oldOwner)
    const pendingA1 = oldWorkbenchQueue.enqueue({
      owner: oldOwner,
      payload: { weather: 'A1' },
      execute: () => firstWrite.promise,
      commit: () => {},
    })
    oldWorkbenchQueue.clearActive(oldOwner)
    newWorkbenchQueue.setActive(newOwner)

    const newInstanceWait = newWorkbenchQueue.waitFor(newOwner)
    let waitSettled = false
    newInstanceWait.finally(() => {
      waitSettled = true
    })
    await Promise.resolve()

    assert.equal(waitSettled, false, 'new Workbench waitFor must see old unresolved A1')
    assert.equal(newInstanceWait, pendingA1, 'new Workbench must join the old physical drain')

    firstWrite.resolve({ acked: 'A1 ack' })
    await newInstanceWait
    assert.equal(waitSettled, true)
  })

  it('preserves same-report single-flight queue and waits for the queued write', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    const owner = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const firstWrite = deferred()
    const latestWrite = deferred()
    const latestStarted = deferred()
    const writes = []
    const commits = []

    const execute = (_owner, payload) => {
      writes.push(payload.weather)
      if (payload.weather === 'A1') return firstWrite.promise
      latestStarted.resolve()
      return latestWrite.promise
    }

    queue.setActive(owner)
    const pendingFirst = queue.enqueue({
      owner,
      payload: { weather: 'A1' },
      execute,
      commit: (result) => commits.push(result.acked),
    })
    const pendingSecond = queue.enqueue({
      owner,
      payload: { weather: 'A2' },
      execute,
      commit: (result) => commits.push(result.acked),
    })
    const pendingThird = queue.enqueue({
      owner,
      payload: { weather: 'A3' },
      execute,
      commit: (result) => commits.push(result.acked),
    })

    assert.equal(pendingSecond, pendingFirst, 'same report must share one in-flight drain')
    assert.equal(pendingThird, pendingFirst, 'latest queued edit must share the same drain')
    firstWrite.resolve({ acked: 'A1 ack' })
    await latestStarted.promise
    assert.deepEqual(writes, ['A1', 'A3'])

    let flushSettled = false
    pendingFirst.finally(() => {
      flushSettled = true
    })
    await Promise.resolve()
    assert.equal(flushSettled, false, 'flush promise must wait for queued same-report write')

    latestWrite.resolve({ acked: 'A3 ack' })
    await pendingFirst
    assert.equal(flushSettled, true)
    assert.deepEqual(commits, ['A1 ack', 'A3 ack'])
  })
})

describe('diary autosave payload', () => {
  it('only allowlists Phase 1 content columns and never emits is_draft or identity keys', () => {
    const payload = pickDiaryAutosavePayload({
      weather: 'Light rain',
      site_summary: 'Foundations',
      is_draft: false,
      project_id: 'proj-1',
      cover_photo_url: 'user/rep/cover.jpg',
      creator_name: 'Should not write',
      branding_id: 'brand-1',
      report_date: '2026-08-18',
      shift: 'Day',
    })
    assert.deepEqual(Object.keys(payload).sort(), [...DIARY_AUTOSAVE_COLUMNS].sort())
    for (const key of DIARY_AUTOSAVE_FORBIDDEN_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key)
    }
    assert.equal(payload.weather, 'Light rain')
    assert.equal(payload.cover_photo_url, 'user/rep/cover.jpg')
    assert.equal(DIARY_AUTOSAVE_COLUMNS.includes('cover_photo_url'), true)
    assert.equal(DIARY_AUTOSAVE_FORBIDDEN_KEYS.includes('cover_photo_url'), false)
    for (const key of DIARY_AUTOSAVE_ABSENT_ON_LIVE) {
      assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key)
    }
  })

  it('includes visitors_register_provenance and defaults null live row to []', () => {
    const fromForm = buildDiaryAutosavePayload({
      visitorsRegisterProvenance: [{
        version: 1,
        evidencePath: 'uid/rep/sign-in-sheet/1.jpg',
        sourceRow: 16,
        trade: 'Architect',
        timeIn: '13:30',
        timeOut: '16:00',
      }],
    })
    assert.equal(fromForm.visitors_register_provenance.length, 1)
    const fromDb = snapshotFromLiveRow({ ...emptyLive, visitors_register_provenance: null })
    assert.deepEqual(fromDb.visitors_register_provenance, [])
  })

  it('persists cover_photo_url through autosave UPDATE (reload snapshot matches)', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({
      weather: 'Fine',
      coverPhotoUrl: 'user/rep-beeches/cover.jpg',
    })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, true, result.reason)
    assert.equal(result.wrote, true)
    assert.equal(supabase.row.cover_photo_url, 'user/rep-beeches/cover.jpg')
    assert.equal(result.acked.cover_photo_url, 'user/rep-beeches/cover.jpg')
    const reloaded = snapshotFromLiveRow(supabase.row)
    assert.equal(reloaded.cover_photo_url, 'user/rep-beeches/cover.jpg')
    assert.equal(autosavePayloadsEqual(payload, reloaded), true)
  })

  it('never selects or patches Temporary Works columns that are absent on live', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({
      weather: 'Overcast, 12°C',
      temporaryWorksApplicable: true,
      temporaryWorks: [{ type: 'Scaffold', location: 'North', status: 'Installed' }],
    })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, true, result.reason)
    assert.equal(result.wrote, true)
    assert.equal(supabase.row.weather, 'Overcast, 12°C')
    for (const cols of supabase.calls.selectLists) {
      assert.doesNotMatch(String(cols), /temporary_works/)
    }
    const written = supabase.calls.updatePayloads[0]
    for (const key of DIARY_AUTOSAVE_ABSENT_ON_LIVE) {
      assert.equal(Object.prototype.hasOwnProperty.call(written, key), false, key)
    }
  })

  it('uses stable H&S ids so debounce comparison does not churn', () => {
    const rows = [{
      key: 'hs-key-1',
      id: null,
      description: 'Near miss at gate',
      actionTaken: 'Briefed gang',
      assignedTo: 'SM',
      status: 'Open',
    }]
    const first = buildDiaryAutosavePayload({ hsIncidents: rows })
    const second = buildDiaryAutosavePayload({ hsIncidents: rows })
    assert.equal(first.hs_incidents[0].id, 'hs-key-1')
    assert.equal(autosavePayloadsEqual(first, second), true)
  })
})

describe('diary autosave write contract', () => {
  it('updates the existing row and never inserts', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({
      weather: 'Overcast, 12°C',
      hsIncidents: [{
        key: 'hs-1',
        description: 'Near miss at gate',
        actionTaken: '',
        assignedTo: '',
        status: 'Open',
      }],
    })
    const acked = snapshotFromLiveRow(emptyLive)
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: acked,
    })
    assert.equal(result.ok, true)
    assert.equal(result.wrote, true)
    assert.equal(supabase.calls.insert, 0)
    assert.equal(supabase.calls.update, 1)
    assert.equal(supabase.row.weather, 'Overcast, 12°C')
    assert.equal(supabase.row.hs_incidents[0].description, 'Near miss at gate')
    const written = supabase.calls.updatePayloads[0]
    for (const key of DIARY_AUTOSAVE_FORBIDDEN_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(written, key), false, key)
    }
  })

  it('does not write when the report id is missing', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const result = await runDiaryAutosave(supabase, {
      reportId: null,
      projectId: 'proj-beeches',
      payload: buildDiaryAutosavePayload({ weather: 'Rain' }),
    })
    assert.equal(result.ok, false)
    assert.equal(supabase.calls.update, 0)
    assert.equal(supabase.calls.insert, 0)
  })

  it('refuses to overwrite newer server data with stale client state', async () => {
    const supabase = createAutosaveSupabase({
      ...emptyLive,
      weather: 'Server already has sun',
    })
    const staleClient = buildDiaryAutosavePayload({ weather: 'Client still has rain' })
    const acked = snapshotFromLiveRow(emptyLive)
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload: staleClient,
      ackedSnapshot: acked,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'stale')
    assert.equal(result.wrote, false)
    assert.equal(supabase.calls.update, 0)
    assert.equal(supabase.row.weather, 'Server already has sun')
    assert.equal(result.acked.weather, 'Server already has sun')
  })

  it('does not claim success when the update fails', async () => {
    const supabase = createAutosaveSupabase(emptyLive, {
      updateError: { message: 'Failed to fetch' },
    })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload: buildDiaryAutosavePayload({ weather: 'Rain' }),
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'update-failed')
    assert.equal(supabase.row.weather, null)
    const failure = classifyAutosaveFailure({ reason: result.reason, error: result.error })
    assert.equal(failure.kind, 'network')
    assert.equal(failure.message, AUTOSAVE_STATUS_FAILED_NETWORK)
  })

  it('verifies H&S autosave after Postgres strips null optional keys', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({
      hsIncidents: [{
        key: 'hs-1',
        description: 'Near miss at gate',
        actionTaken: '',
        assignedTo: '',
        status: 'Open',
      }],
    })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, true, result.reason)
    assert.equal(result.wrote, true)
    assert.equal(supabase.row.hs_incidents[0].description, 'Near miss at gate')
  })

  it('snapshotFromLiveRow matches buildDiaryAutosavePayload for the same DB row', () => {
    const dbRow = {
      ...emptyLive,
      weather: 'Overcast',
      hs_incidents: [{ id: 'hs-1', description: 'Near miss', status: 'Open' }],
    }
    const fromDb = snapshotFromLiveRow(dbRow)
    const fromForm = buildDiaryAutosavePayload({
      weather: 'Overcast',
      hsIncidents: [{
        id: 'hs-1',
        description: 'Near miss',
        actionTaken: '',
        assignedTo: '',
        status: 'Open',
      }],
    })
    assert.equal(autosavePayloadsEqual(fromDb, fromForm), true)
  })

  it('does not treat an older snapshot that still carries absent-on-live keys as stale', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({ weather: 'Rain later' })
    const leftoverAcked = {
      ...snapshotFromLiveRow(emptyLive),
      temporary_works_applicable: null,
      temporary_works: [],
    }
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: leftoverAcked,
    })
    assert.equal(result.ok, true, result.reason)
    assert.equal(result.reason, 'updated')
    assert.equal(supabase.row.weather, 'Rain later')
  })

  it('skips a no-op when the live row already matches', async () => {
    const live = {
      ...emptyLive,
      weather: 'Overcast, 12°C',
    }
    const supabase = createAutosaveSupabase(live)
    const payload = snapshotFromLiveRow(live)
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: payload,
    })
    assert.equal(result.ok, true)
    assert.equal(result.wrote, false)
    assert.equal(supabase.calls.update, 0)
  })
})

describe('Beeches Section 2 interruption restore', () => {
  it('rehydrates Weather and H&S from the existing daily_reports row after an interrupted session', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const typed = buildDiaryAutosavePayload({
      weather: 'Overcast, 12°C, light rain PM',
      hsIncidents: [{
        key: 'hs-beeches',
        description: 'Near miss — reversing dumper',
        actionTaken: 'Banksman briefed',
        assignedTo: 'Site Manager',
        status: 'Open',
      }],
    })
    const saved = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload: typed,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(saved.ok, true)

    // Browser killed — a later reopen SELECTs the same report id.
    const reopen = createAutosaveSupabase(supabase.row)
    const { data: existing } = await reopen
      .from('daily_reports')
      .select('weather, hs_incidents')
      .eq('id', 'rep-beeches')
      .maybeSingle()

    assert.equal(existing.weather, 'Overcast, 12°C, light rain PM')
    const hsRows = hsIncidentsFromDb(existing.hs_incidents)
    assert.equal(hsRows[0].description, 'Near miss — reversing dumper')
    assert.equal(hsRows[0].actionTaken, 'Banksman briefed')
    assert.match(diaryPage, /setWeather\(existing\.weather \|\| ''\)/)
    assert.match(diaryPage, /setHsIncidents\(hsIncidentsFromDb\(existing\.hs_incidents\)\)/)
  })

  it('does not autosave until hydrate has applied the saved row', () => {
    const payload = buildDiaryAutosavePayload({ weather: 'Rain' })
    assert.equal(shouldRunDiaryAutosave({
      hydrateComplete: false,
      writable: true,
      reportId: 'rep-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    }), false)
    assert.equal(shouldRunDiaryAutosave({
      hydrateComplete: true,
      writable: true,
      reportId: 'rep-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    }), true)
    assert.equal(shouldRunDiaryAutosave({
      hydrateComplete: true,
      writable: false,
      reportId: 'rep-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    }), false)
  })
})

describe('workbench autosave wiring', () => {
  it('debounces 1.5s, flushes before Save / Share, and keeps Start a New Diary unchanged', () => {
    assert.equal(DIARY_AUTOSAVE_DEBOUNCE_MS, 1500)
    assert.match(diaryPage, /DIARY_AUTOSAVE_DEBOUNCE_MS/)
    assert.match(diaryPage, /runDiaryAutosave/)
    assert.match(diaryPage, /hydrateComplete/)
    assert.match(diaryPage, /flushPendingAutosave/)
    assert.match(diaryPage, /await flushPendingAutosave/)
    assert.match(diaryPage, /finalizeSiteDiarySave/)
    assert.match(diaryPage, /shouldShowDiaryAutosaveStatus/)
    assert.match(diaryPage, /persistUiErrorRef/)
    assert.match(diaryPage, /setAutosaveStatus\(null\)/)
    assert.match(diaryPage, /classifyAutosaveFailure/)
    assert.match(diaryPage, /paintAutosaveStatus\('saving'\)/)
    assert.match(diaryPage, /paintAutosaveStatus\(null\)/)
    assert.doesNotMatch(diaryPage, /paintAutosaveStatus\(autosaveStatusAfterResult/)
    assert.match(diaryPage, /persistUiErrorRef\.current/)
    assert.match(diaryPage, /resolveHydrateAutosaveSuppress/)
    const autosaveSrc = readFileSync(join(root, 'lib/diary-autosave.js'), 'utf8')
    assert.doesNotMatch(autosaveSrc, /\.insert\(/)
    assert.doesNotMatch(autosaveSrc, /is_draft:/)
    assert.match(hubPage, /title="Start a New Diary"/)
    assert.match(hubPage, /Start a fresh diary with your saved details ready/)
  })

  it('exports honest status copy that never implies a finished diary', () => {
    assert.equal(AUTOSAVE_STATUS_SAVING, 'Saving your work…')
    assert.equal(AUTOSAVE_STATUS_SAVED, 'Work saved')
    assert.equal(AUTOSAVE_STATUS_FAILED_NETWORK, 'Work not saved. Check your connection.')
    assert.equal(AUTOSAVE_STATUS_FAILED_DB, 'Work not saved. Try again in a moment.')
    assert.equal(AUTOSAVE_STATUS_FAILED_AUTH, 'Your sign-in has timed out. Sign in again to keep editing.')
    assert.equal(AUTOSAVE_STATUS_CONFLICT, 'Updated from your last saved copy.')
    assert.equal(AUTOSAVE_STATUS_FAILED, AUTOSAVE_STATUS_FAILED_NETWORK)
    assert.doesNotMatch(AUTOSAVE_STATUS_SAVED, /Share|Complete|finished/i)
    assert.match(
      classifyAutosaveFailure({ reason: 'update-failed', error: { code: 'PGRST204', message: 'column missing' } }).message,
      /Try again in a moment/,
    )
  })

  it('autosave success does not display a global Work saved claim', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({ weather: 'Overcast, 12°C' })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, true)
    assert.equal(result.wrote, true)
    assert.equal(supabase.row.weather, 'Overcast, 12°C')
    assert.equal(autosaveStatusAfterResult(result), 'saved')
    const paintedStatus = null
    const display = visibleDiaryAutosaveStatusCopy({
      error: '',
      saving: false,
      justSaved: false,
      autosaveStatus: paintedStatus,
    })
    assert.equal(display, null)
    assert.doesNotMatch(String(display || ''), /Work saved/)
    assert.equal(autosaveStatusMessage('saved'), null)
    assert.doesNotMatch(String(autosaveStatusMessage('saved') || ''), /Work saved/)
  })

  it('lifts hydrate suppress when the form is dirty so debounce can persist', () => {
    const acked = snapshotFromLiveRow(emptyLive)
    const dirty = buildDiaryAutosavePayload({ weather: 'Rain on site' })
    const leftoverAcked = { ...acked, temporary_works: [], temporary_works_applicable: null }
    assert.equal(autosavePayloadsEqual(acked, leftoverAcked), true)
    assert.equal(shouldRunDiaryAutosave({
      hydrateComplete: true,
      writable: true,
      reportId: 'rep-beeches',
      payload: dirty,
      ackedSnapshot: leftoverAcked,
    }), true)
    const blocked = resolveHydrateAutosaveSuppress(true, acked, leftoverAcked)
    assert.deepEqual(blocked, { suppress: false, block: true })
    const persist = resolveHydrateAutosaveSuppress(true, dirty, leftoverAcked)
    assert.deepEqual(persist, { suppress: false, block: false })
    assert.equal(shouldRunDiaryAutosave({
      hydrateComplete: true,
      writable: true,
      reportId: 'rep-beeches',
      payload: dirty,
      ackedSnapshot: leftoverAcked,
    }) && persist.block === false, true)
  })
})

describe('persist UI mutual exclusion', () => {
  it('error hides autosave Work saved and saving takes precedence', () => {
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: 'We couldn’t save your Site Diary. Check your connection and try again.',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      false,
    )
    assert.equal(
      diaryPersistenceUiPhase({
        error: 'We couldn’t save your Site Diary. Check your connection and try again.',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      'error',
    )
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      false,
    )
    assert.equal(
      diaryPersistenceUiPhase({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      'idle',
    )
    assert.equal(
      diaryPersistenceUiPhase({
        error: '',
        saving: true,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      'saving',
    )
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: 'We couldn’t upload the cover photo. Check your connection and try Save / Share again.',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      false,
    )
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
        finalSaveInProgress: true,
      }),
      false,
    )
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: '',
        saving: false,
        justSaved: true,
        autosaveStatus: 'saved',
      }),
      false,
    )
    assert.equal(
      shouldShowManualSaveConfirmation({
        error: '',
        saving: false,
        justSaved: true,
      }),
      true,
    )
    assert.equal(
      shouldShowManualSaveConfirmation({
        error: '',
        saving: true,
        justSaved: false,
      }),
      false,
    )
    assert.equal(
      shouldShowManualSaveConfirmation({
        error: 'We couldn’t save your Site Diary. Check your connection and try again.',
        saving: false,
        justSaved: false,
      }),
      false,
    )
  })
})

describe('Phase 3A — truthful save-status UI', () => {
  const idleDisplay = {
    error: '',
    saving: false,
    justSaved: false,
  }

  it('A — autosave pending still shows Saving your work…', () => {
    assert.equal(autosaveStatusMessage('saving'), AUTOSAVE_STATUS_SAVING)
    assert.equal(
      visibleDiaryAutosaveStatusCopy({ ...idleDisplay, autosaveStatus: 'saving' }),
      AUTOSAVE_STATUS_SAVING,
    )
  })

  it('B — autosaveStatusMessage(saved) has no visible copy', () => {
    assert.equal(autosaveStatusMessage('saved'), null)
    assert.doesNotMatch(String(autosaveStatusMessage('saved') || ''), /Work saved/)
    assert.equal(AUTOSAVE_STATUS_SAVED, 'Work saved')
  })

  it('C — successful Weather autosave display contains no Work saved', async () => {
    const supabase = createAutosaveSupabase(emptyLive)
    const payload = buildDiaryAutosavePayload({ weather: 'Overcast, 12°C' })
    const result = await runDiaryAutosave(supabase, {
      reportId: 'rep-beeches',
      projectId: 'proj-beeches',
      payload,
      ackedSnapshot: snapshotFromLiveRow(emptyLive),
    })
    assert.equal(result.ok, true)
    assert.equal(supabase.row.weather, 'Overcast, 12°C')
    const successDisplay = visibleDiaryAutosaveStatusCopy({
      ...idleDisplay,
      autosaveStatus: null,
    })
    assert.equal(successDisplay, null)
    assert.doesNotMatch(String(successDisplay || ''), /Work saved/)
    assert.doesNotMatch(String(autosaveStatusMessage(autosaveStatusAfterResult(result)) || ''), /Work saved/)
  })

  it('D — stale autosaveStatus saved cannot paint Work saved on the bottom strip', () => {
    const staleDisplay = visibleDiaryAutosaveStatusCopy({
      ...idleDisplay,
      autosaveStatus: 'saved',
    })
    assert.equal(staleDisplay, null)
    assert.doesNotMatch(String(staleDisplay || ''), /Work saved/)
    const legacyGateWouldShow = true
    const bottomCopy = legacyGateWouldShow ? autosaveStatusMessage('saved') : null
    assert.equal(bottomCopy, null)
    assert.doesNotMatch(String(bottomCopy || ''), /Work saved/)
    assert.match(diaryPage, /autosaveStatusCopy/)
    assert.match(diaryPage, /autosaveStatusMessage\(autosaveStatus\) && autosaveStatusCopy/)
  })

  it('E — failure states still render their existing messages', () => {
    assert.equal(
      visibleDiaryAutosaveStatusCopy({ ...idleDisplay, autosaveStatus: 'network' }),
      AUTOSAVE_STATUS_FAILED_NETWORK,
    )
    assert.equal(
      visibleDiaryAutosaveStatusCopy({ ...idleDisplay, autosaveStatus: 'auth' }),
      AUTOSAVE_STATUS_FAILED_AUTH,
    )
    assert.equal(
      visibleDiaryAutosaveStatusCopy({ ...idleDisplay, autosaveStatus: 'db' }),
      AUTOSAVE_STATUS_FAILED_DB,
    )
    assert.equal(
      visibleDiaryAutosaveStatusCopy({ ...idleDisplay, autosaveStatus: 'conflict' }),
      AUTOSAVE_STATUS_CONFLICT,
    )
    assert.equal(autosaveStatusMessage('network'), AUTOSAVE_STATUS_FAILED_NETWORK)
    assert.equal(autosaveStatusMessage('auth'), AUTOSAVE_STATUS_FAILED_AUTH)
    assert.equal(autosaveStatusMessage('db'), AUTOSAVE_STATUS_FAILED_DB)
    assert.equal(autosaveStatusMessage('conflict'), AUTOSAVE_STATUS_CONFLICT)
  })

  it('F — Area saved / Report ready / Shared ✓ behaviour is unchanged', () => {
    assert.match(diaryPage, /✓ Report ready/)
    assert.match(diaryPage, /Report Ready — Share Now/)
    assert.match(diaryPage, /shareCompletionKind === 'downloaded' \? 'PDF downloaded ✓' : 'Shared ✓'/)
    assert.doesNotMatch(diaryPage, /zlog-manual-save-confirmation[\s\S]{0,400}Saved ✓/)
  })

  it('1 — autosave pending still shows Saving your work…', () => {
    assert.equal(autosaveStatusMessage('saving'), AUTOSAVE_STATUS_SAVING)
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saving',
      }),
      true,
    )
    assert.match(diaryPage, /paintAutosaveStatus\('saving'\)/)
  })

  it('2 — autosave success does not render Work saved on the workbench', () => {
    assert.equal(
      visibleDiaryAutosaveStatusCopy({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'saved',
      }),
      null,
    )
    assert.equal(autosaveStatusMessage('saved'), null)
    assert.match(diaryPage, /paintAutosaveStatus\(null\)/)
  })

  it('3 — autosave failure still shows not-saved / session / conflict copy', () => {
    assert.equal(
      shouldShowDiaryAutosaveStatus({
        error: '',
        saving: false,
        justSaved: false,
        autosaveStatus: 'network',
      }),
      true,
    )
    assert.equal(autosaveStatusMessage('network'), AUTOSAVE_STATUS_FAILED_NETWORK)
    assert.equal(autosaveStatusMessage('auth'), AUTOSAVE_STATUS_FAILED_AUTH)
    assert.equal(autosaveStatusMessage('db'), AUTOSAVE_STATUS_FAILED_DB)
    assert.equal(autosaveStatusMessage('conflict'), AUTOSAVE_STATUS_CONFLICT)
    assert.match(diaryPage, /paintAutosaveStatus\(failure\.kind\)/)
  })

  it('4 — non-autosave dirty edits dismiss a stale generic success claim', () => {
    assert.equal(dismissAutosaveSuccessStatus('saved'), null)
    assert.equal(dismissAutosaveSuccessStatus('saving'), 'saving')
    assert.equal(dismissAutosaveSuccessStatus('network'), 'network')
    assert.match(diaryPage, /dismissAutosaveSuccessClaim/)
    assert.match(diaryPage, /const updateLabour = \(key, field, value\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
    assert.match(diaryPage, /const updatePlant = \(key, field, value\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
    assert.match(diaryPage, /onApplicableChange=\{\(value\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
    assert.match(diaryPage, /const replaceSignature = \(\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
    assert.match(diaryPage, /onChange=\{\(next\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
    assert.match(diaryPage, /const handleLocationWalkChange = useCallback\(\(next\) => \{[\s\S]*?dismissAutosaveSuccessClaim\(\)/)
  })

  it('8 — Report ready UI is unchanged', () => {
    assert.match(diaryPage, /✓ Report ready/)
    assert.match(diaryPage, /SAVE_CTA_SHARE_READY_LABEL/)
    assert.match(diaryPage, /SAVE_CTA_IDLE_LABEL/)
    assert.match(diaryPage, /SAVE_CTA_SAVING_LABEL/)
  })

  it('9 — one-tap share still reuses a ready File without preparing', () => {
    const handleSave = diaryPage.slice(
      diaryPage.indexOf('const handleSave = async'),
      diaryPage.indexOf('if (loading && !loadDiagnostic)'),
    )
    const unfinishedAt = handleSave.indexOf('hasUnsavedAreaForShare')
    const reuseStart = handleSave.indexOf('isWorkbenchSharePrepared(shareReadyPdfRef.current) && !saving')
    const prepareIdx = handleSave.indexOf('const obtainPreparedPdfForSave = async () =>')
    assert.ok(reuseStart > 0 && prepareIdx > reuseStart)
    assert.ok(unfinishedAt > 0 && unfinishedAt < reuseStart)
    const reuseBlock = handleSave.slice(
      reuseStart,
      handleSave.indexOf('if (!tryAcquireSaveOperationLock(saveLockRef))'),
    )
    assert.match(reuseBlock, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    assert.doesNotMatch(reuseBlock, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(reuseBlock, /shareReadyPdfRef\.current = null/)
  })

  it('10 — post-share wording matches share or download completion, not a fresh save', () => {
    assert.match(diaryPage, /finishAfterSuccessfulShare\('shared'\)/)
    assert.match(diaryPage, /finishAfterSuccessfulShare\('downloaded'\)/)
    assert.match(diaryPage, /shareCompletionKind === 'downloaded' \? 'PDF downloaded ✓' : 'Shared ✓'/)
    assert.doesNotMatch(diaryPage, /zlog-manual-save-confirmation[\s\S]{0,400}Saved ✓/)
  })

  it('11 — autosave column allowlist and Share persistence calls are unchanged', () => {
    assert.deepEqual(DIARY_AUTOSAVE_COLUMNS, [
      'weather',
      'site_summary',
      'visitors',
      'visitors_register_provenance',
      'delays_issues',
      'actions',
      'equipment_hire',
      'hs_incidents',
      'rfis',
      'variations',
      'cover_photo_url',
    ])
    assert.match(diaryPage, /finalizeSiteDiarySave/)
    assert.match(diaryPage, /persistSaveAreaGroup/)
    assert.match(diaryPage, /replaceLabour|labourFormToPersistRows/)
  })
})
