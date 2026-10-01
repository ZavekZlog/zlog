/**
 * Unit 1A — final Save freshness guard for a warm core-row handoff.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRpcReportPatch } from './diary-save.js'
import { LIVE_DAILY_REPORTS } from './live-diary-schema.js'
import {
  decideWarmHandoffFinalSave,
  mergeAutosaveAckIntoReportRow,
  readDailyReportRowForWarmFinalSave,
  warmHandoffReportBaselineIsCurrent,
} from './diary-save-dirty.js'

const root = dirname(fileURLToPath(import.meta.url))
const workbench = readFileSync(join(root, '../components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')

const PROJECT = 'proj-1'
const REPORT = 'rep-1'

const FULL_ROW = {
  id: REPORT,
  owner_id: 'user-1',
  project_id: PROJECT,
  created_at: '2026-10-01T00:00:00.000Z',
  report_number: '12',
  report_date: '2026-10-01',
  weather: 'Fine',
  shift: 'Day',
  site_summary: 'Poured slab',
  visitors: 'Alex',
  visitors_register_provenance: [],
  delays_issues: null,
  actions: null,
  company_reporting_for: 'Acme',
  creator_name: 'Sam',
  creator_role: 'Supervisor',
  cover_photo_url: 'user/rep/cover.jpg',
  cover_processing_version: 'v1',
  signature_url: 'user/rep/sig.png',
  branding_id: '11111111-1111-1111-1111-111111111111',
  brand_color: '#FF5000',
  brand_logo_url: 'user/logo.png',
  equipment_hire: [],
  hs_incidents: [],
  rfis: [],
  variations: [],
  temporary_works_applicable: false,
  temporary_works: [],
  permits: [],
}

const WRITABLE_KEYS = LIVE_DAILY_REPORTS.columns.filter(
  (key) => !['id', 'owner_id', 'project_id', 'created_at'].includes(key),
)

function payloadFromRow(row) {
  const payload = {}
  for (const key of WRITABLE_KEYS) payload[key] = row[key]
  return payload
}

function changedValue(key, value) {
  if (typeof value === 'boolean') return !value
  if (Array.isArray(value)) return [{ changed: key }]
  if (value == null) return `${key}-set`
  return `${value}-x`
}

function currentCheck(liveRow, baselineRow, patch = buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT)) {
  return warmHandoffReportBaselineIsCurrent({
    liveRow,
    baselineRow,
    reportPatch: patch,
    projectId: PROJECT,
    reportId: REPORT,
  })
}

function saveSlice() {
  const flushAt = workbench.indexOf('const pendingAutosaveResult = await flushPendingAutosave()')
  const finalizeAt = workbench.indexOf('const saved = await finalizeSiteDiarySave')
  assert.ok(flushAt > 0 && finalizeAt > flushAt)
  return workbench.slice(flushAt, finalizeAt)
}

describe('warm final-save freshness guard', () => {
  it('unchanged live row lets final Save proceed', () => {
    const patch = buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT)
    const decision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: true, reason: 'already-saved' },
      liveRead: { row: { ...FULL_ROW } },
      baselineRow: { ...FULL_ROW },
      reportPatch: patch,
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(decision.proceed, true)
    assert.equal(decision.reason, 'current')
    const slice = saveSlice()
    assert.match(slice, /if \(!freshDecision\.proceed\)/)
    assert.ok(workbench.indexOf('const saved = await finalizeSiteDiarySave') > workbench.indexOf('if (!freshDecision.proceed)'))
  })

  it('a changed live report field blocks the final Save RPC', () => {
    const live = { ...FULL_ROW, weather: 'Rain' }
    const decision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: true },
      liveRead: { row: live },
      baselineRow: { ...FULL_ROW },
      reportPatch: buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT),
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(decision.proceed, false)
    assert.equal(decision.reason, 'changed')
    assert.equal(decision.rpc, undefined)
    const slice = saveSlice()
    const blockStart = slice.indexOf('if (!freshDecision.proceed)')
    const block = slice.slice(blockStart)
    assert.match(block, /failSave\(/)
    assert.match(block, /return/)
    assert.doesNotMatch(block, /finalizeSiteDiarySave/)
  })

  it('keeps the user edit intact when the live row conflicts', () => {
    const form = { site_summary: 'User edit still on screen' }
    const baseline = { ...FULL_ROW }
    const live = { ...FULL_ROW, shift: 'Night' }
    const decision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: true },
      liveRead: { row: live },
      baselineRow: baseline,
      reportPatch: buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT),
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(decision.proceed, false)
    assert.equal(form.site_summary, 'User edit still on screen')
    assert.equal(baseline.shift, 'Day')
    assert.equal(decision.form, undefined)
    assert.equal(decision.baselineRow, undefined)
    const block = saveSlice().slice(saveSlice().indexOf('if (!freshDecision.proceed)'))
    assert.doesNotMatch(block, /setSiteSummary/)
    assert.doesNotMatch(block, /setWeather/)
    assert.doesNotMatch(block, /applyAutosaveSnapshot/)
    assert.doesNotMatch(block, /lastPersistedReportRef\.current =/)
  })

  it('a freshness-read failure blocks the final Save RPC', async () => {
    const thrown = await readDailyReportRowForWarmFinalSave({
      from() {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle: async () => { throw new Error('offline') },
        }
      },
    }, { reportId: REPORT, projectId: PROJECT })
    assert.equal(thrown.ok, false)
    assert.equal(thrown.reason, 'read-failed')
    const decision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: true },
      liveRead: thrown,
      baselineRow: { ...FULL_ROW },
      reportPatch: buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT),
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(decision.proceed, false)
    assert.equal(decision.reason, 'read-failed')
    assert.match(saveSlice(), /freshDecision\.reason === 'read-failed'/)
    assert.doesNotMatch(
      saveSlice().slice(saveSlice().indexOf('if (!freshDecision.proceed)')),
      /finalizeSiteDiarySave/,
    )
  })

  it('cold Edit does not take the extra freshness read', () => {
    const slice = saveSlice()
    assert.match(slice, /if \(saveUsedWarmCoreRowHandoff\)/)
    assert.equal(slice.split('readDailyReportRowForWarmFinalSave').length - 1, 1)
    const gate = slice.slice(slice.indexOf('if (saveUsedWarmCoreRowHandoff)'))
    assert.match(gate, /readDailyReportRowForWarmFinalSave/)
    assert.doesNotMatch(slice, /from\('daily_reports'\)/)
    const assigned = workbench.indexOf('existing = coreRowHandoff.report')
    const branch = workbench.slice(assigned, assigned + 280)
    assert.match(branch, /warmCoreRowHandoffRef\.current = true/)
    const coldFetch = workbench.indexOf(".from('daily_reports')", assigned)
    const between = workbench.slice(assigned, coldFetch)
    assert.match(between, /\} else \{/)
    assert.doesNotMatch(between.slice(between.indexOf('} else {')), /warmCoreRowHandoffRef\.current = true/)
    const loadReset = workbench.indexOf('warmCoreRowHandoffRef.current = false')
    assert.ok(loadReset > 0 && loadReset < assigned)
  })

  it('same report id with the wrong project cannot pass', async () => {
    const eqs = []
    const read = await readDailyReportRowForWarmFinalSave({
      from() {
        return {
          select() { return this },
          eq(column, value) {
            eqs.push([column, value])
            return this
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }
      },
    }, { reportId: REPORT, projectId: 'other-project' })
    assert.deepEqual(eqs, [['id', REPORT], ['project_id', 'other-project']])
    assert.equal(read.ok, false)
    const decision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: true },
      liveRead: { row: { ...FULL_ROW, project_id: 'other-project' } },
      baselineRow: { ...FULL_ROW },
      reportPatch: buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT),
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(decision.proceed, false)
    assert.equal(currentCheck({ ...FULL_ROW, project_id: 'other-project' }, { ...FULL_ROW }), false)
  })

  it('compares the autosave-updated acknowledged baseline', () => {
    const original = { ...FULL_ROW, weather: 'Fine' }
    const live = { ...FULL_ROW, weather: 'Rain' }
    const acknowledged = mergeAutosaveAckIntoReportRow(original, { weather: 'Rain' })
    const patch = buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT)
    assert.equal(currentCheck(live, acknowledged, patch), true)
    assert.equal(currentCheck(live, original, patch), false)
    const shifted = { ...live, shift: 'Night' }
    assert.equal(currentCheck(shifted, acknowledged, patch), false)
    const staleDecision = decideWarmHandoffFinalSave({
      autosaveResult: { ok: false, reason: 'stale', wrote: false },
      liveRead: { row: live },
      baselineRow: acknowledged,
      reportPatch: patch,
      projectId: PROJECT,
      reportId: REPORT,
    })
    assert.equal(staleDecision.proceed, false)
    assert.equal(staleDecision.reason, 'stale')
  })

  it('covers every report field the final patch can persist', () => {
    const patch = buildRpcReportPatch(payloadFromRow(FULL_ROW), PROJECT)
    assert.deepEqual(Object.keys(patch).sort(), [...WRITABLE_KEYS].sort())
    for (const key of [
      'shift',
      'company_reporting_for',
      'creator_name',
      'creator_role',
      'signature_url',
      'branding_id',
      'brand_color',
      'brand_logo_url',
      'temporary_works_applicable',
      'temporary_works',
      'cover_photo_url',
      'weather',
      'site_summary',
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(patch, key), true, key)
    }
    for (const key of WRITABLE_KEYS) {
      const live = { ...FULL_ROW, [key]: changedValue(key, FULL_ROW[key]) }
      assert.equal(currentCheck(live, { ...FULL_ROW }, patch), false, key)
    }
    const metadata = { ...FULL_ROW, owner_id: 'other-user', created_at: '1999-01-01' }
    assert.equal(currentCheck(metadata, { ...FULL_ROW }, patch), true)
  })

  it('Save baseline remains the raw report row', () => {
    const assigned = workbench.indexOf('existing = coreRowHandoff.report')
    const snap = workbench.indexOf('ackedSnapshotRef.current = snapshotFromLiveRow(existing)')
    const baseline = workbench.indexOf('lastPersistedReportRef.current = existing')
    assert.ok(assigned > 0 && snap > assigned && baseline > assigned)
    assert.doesNotMatch(saveSlice(), /lastPersistedReportRef\.current =/)
  })
})
