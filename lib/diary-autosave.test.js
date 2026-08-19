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
  pickDiaryAutosavePayload,
  resolveHydrateAutosaveSuppress,
  runDiaryAutosave,
  shouldRunDiaryAutosave,
  snapshotFromLiveRow,
  autosaveStatusAfterResult,
  autosaveStatusMessage,
  shouldShowDiaryAutosaveStatus,
  shouldShowManualSaveConfirmation,
  diaryPersistenceUiPhase,
} from './diary-autosave.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
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
  delays_issues: null,
  actions: null,
  equipment_hire: [],
  hs_incidents: [],
  rfis: [],
  variations: [],
  temporary_works_applicable: null,
  temporary_works: [],
}

describe('diary autosave payload', () => {
  it('only allowlists Phase 1 content columns and never emits is_draft or identity keys', () => {
    const payload = pickDiaryAutosavePayload({
      weather: 'Light rain',
      site_summary: 'Foundations',
      is_draft: false,
      project_id: 'proj-1',
      cover_photo_url: 'wipe-me',
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
    for (const key of DIARY_AUTOSAVE_ABSENT_ON_LIVE) {
      assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key)
    }
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
    assert.match(diaryPage, /paintAutosaveStatus\(autosaveStatusAfterResult\(result\)\)/)
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

  it('confirmed persistence maps to the visible Work saved state, not a blank status', async () => {
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
    assert.equal(autosaveStatusMessage('saved'), AUTOSAVE_STATUS_SAVED)
    assert.notEqual(autosaveStatusMessage(null), AUTOSAVE_STATUS_SAVED)
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
      true,
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
