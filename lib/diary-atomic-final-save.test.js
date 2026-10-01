/**
 * Unit 1A — atomic expected-baseline guard inside finalize_site_diary_save.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildRpcExpectedReport,
  buildRpcReportPatch,
  finalizeSiteDiarySave,
} from './diary-save.js'
import { WARM_HANDOFF_REPORT_CHANGED_MESSAGE } from './diary-save-dirty.js'

const root = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(root, '../supabase/migrations/20261001120000_finalize_site_diary_save_expected_report.sql'),
  'utf8',
)
const previous = readFileSync(
  join(root, '../supabase/migrations/20260916120000_finalize_site_diary_save.sql'),
  'utf8',
)
const workbench = readFileSync(join(root, '../components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')
const autosave = readFileSync(join(root, './diary-autosave.js'), 'utf8')

const REPORT = 'rep-1'
const PROJECT = 'proj-1'

function savedRpc(data) {
  const calls = []
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { data, error: null }
    },
  }
}

describe('atomic final-save conflict guard', () => {
  it('replaces the 6-argument signature with one 7-argument function and a null default', () => {
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.finalize_site_diary_save\(uuid, uuid, jsonb, jsonb, jsonb, jsonb\);/)
    assert.match(
      migration,
      /p_photos jsonb,\s*p_expected_report jsonb DEFAULT NULL/,
    )
    assert.match(migration, /SECURITY DEFINER/)
    assert.match(migration, /search_path = pg_catalog, public/)
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.finalize_site_diary_save\(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb\) TO authenticated/,
    )
    assert.doesNotMatch(
      migration,
      /CREATE OR REPLACE FUNCTION public\.finalize_site_diary_save\([\s\S]*?p_photos jsonb\s*\)/,
    )
    assert.match(previous, /GRANT EXECUTE ON FUNCTION public\.finalize_site_diary_save\(uuid, uuid, jsonb, jsonb, jsonb, jsonb\) TO authenticated/)
    assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.finalize_site_diary_save/g) || []).length, 1)
  })

  it('returns stale after the lock and before any report, labour, plant, or photo write', () => {
    const lockAt = migration.indexOf('FOR UPDATE OF dr')
    const ownerAt = migration.indexOf('p.owner_id = v_user_id')
    const staleAt = migration.indexOf("'reason', 'stale'")
    const reportWrite = migration.indexOf('UPDATE public.daily_reports dr')
    const labourWrite = migration.indexOf('DELETE FROM public.report_labour')
    const plantWrite = migration.indexOf('DELETE FROM public.report_plant')
    const photoWrite = migration.indexOf('INSERT INTO public.report_photos')
    assert.ok(ownerAt > 0 && lockAt > ownerAt)
    assert.ok(staleAt > lockAt)
    assert.ok(reportWrite > staleAt && labourWrite > staleAt && plantWrite > staleAt && photoWrite > staleAt)
    assert.match(migration, /IF p_expected_report IS NOT NULL AND p_report_patch IS NOT NULL THEN/)
    assert.match(migration, /IF v_report_stale THEN/)
    assert.match(migration, /p_report_patch \? 'shift'/)
    assert.match(migration, /p_report_patch \? 'signature_url'/)
    assert.match(migration, /p_report_patch \? 'creator_name'/)
    assert.match(migration, /p_report_patch \? 'branding_id'/)
    assert.match(migration, /p_report_patch \? 'temporary_works'/)
    assert.match(migration, /IS DISTINCT FROM/)
    assert.doesNotMatch(migration, /updated_at/)
  })

  it('builds the expected baseline from the same keys as the report patch', () => {
    const baseline = {
      id: REPORT,
      project_id: PROJECT,
      weather: 'Fine',
      shift: 'Day',
      site_summary: 'Poured slab',
      creator_name: 'Sam',
      creator_role: 'Supervisor',
      company_reporting_for: 'Acme',
      signature_url: 'user/rep/sig.png',
      branding_id: '11111111-1111-1111-1111-111111111111',
      brand_color: '#FF5000',
      brand_logo_url: 'user/logo.png',
      temporary_works_applicable: false,
      temporary_works: [],
      equipment_hire: null,
      cover_photo_url: 'user/rep/cover.jpg',
    }
    const patch = buildRpcReportPatch({
      ...baseline,
      weather: 'Hot',
      site_summary: 'User edit',
    }, PROJECT)
    const expected = buildRpcExpectedReport(baseline, patch)
    assert.deepEqual(Object.keys(expected).sort(), Object.keys(patch).sort())
    assert.equal(expected.weather, 'Fine')
    assert.equal(expected.site_summary, 'Poured slab')
    assert.equal(patch.weather, 'Hot')
    assert.equal(expected.shift, 'Day')
    assert.equal(expected.signature_url, 'user/rep/sig.png')
    assert.equal(expected.creator_name, 'Sam')
    assert.deepEqual(expected.equipment_hire, [])
    assert.equal(Object.prototype.hasOwnProperty.call(expected, 'id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(expected, 'created_at'), false)
  })

  it('warm Save sends the expected report and a matching RPC can succeed', async () => {
    const baseline = {
      id: REPORT,
      project_id: PROJECT,
      site_summary: 'Poured slab',
      weather: 'Fine',
    }
    const supabase = savedRpc({
      ok: true,
      report_id: REPORT,
      project_id: PROJECT,
      report: { id: REPORT, project_id: PROJECT, site_summary: 'User edit', weather: 'Fine' },
      cleanupJobs: [],
    })
    const saved = await finalizeSiteDiarySave(supabase, {
      reportId: REPORT,
      projectId: PROJECT,
      reportPayload: { site_summary: 'User edit', weather: 'Fine' },
      expectedReportRow: baseline,
    })
    assert.equal(saved.id, REPORT)
    assert.equal(saved.stale, undefined)
    assert.equal(supabase.calls.length, 1)
    assert.equal(supabase.calls[0].args.p_expected_report.site_summary, 'Poured slab')
    assert.equal(supabase.calls[0].args.p_expected_report.weather, 'Fine')
    assert.equal(supabase.calls[0].args.p_report_patch.site_summary, 'User edit')
  })

  it('a stale RPC result does not become a successful save', async () => {
    const form = { site_summary: 'User edit still here' }
    const baseline = { id: REPORT, project_id: PROJECT, site_summary: 'Poured slab', weather: 'Fine' }
    const supabase = savedRpc({
      ok: false,
      reason: 'stale',
      report_id: REPORT,
      project_id: PROJECT,
    })
    const saved = await finalizeSiteDiarySave(supabase, {
      reportId: REPORT,
      projectId: PROJECT,
      reportPayload: { site_summary: form.site_summary, weather: 'Fine' },
      expectedReportRow: baseline,
    })
    assert.equal(saved.stale, true)
    assert.equal(saved.id, null)
    assert.equal(saved.diagnostic.reason, 'stale')
    assert.equal(saved.diagnostic.appBelievesSucceeded, false)
    assert.equal(supabase.calls.length, 1)
    assert.equal(supabase.calls[0].name, 'finalize_site_diary_save')
    assert.equal(form.site_summary, 'User edit still here')
    assert.equal(baseline.weather, 'Fine')
  })

  it('cold Save omits the expected report', async () => {
    const supabase = savedRpc({
      ok: true,
      report_id: REPORT,
      project_id: PROJECT,
      report: { id: REPORT, project_id: PROJECT, site_summary: 'Cold edit' },
      cleanupJobs: [],
    })
    const saved = await finalizeSiteDiarySave(supabase, {
      reportId: REPORT,
      projectId: PROJECT,
      reportPayload: { site_summary: 'Cold edit' },
    })
    assert.equal(saved.id, REPORT)
    assert.equal(Object.prototype.hasOwnProperty.call(supabase.calls[0].args, 'p_expected_report'), false)
  })

  it('wires the warm baseline into Save and keeps the conflict on the existing message', () => {
    const call = workbench.slice(workbench.indexOf('const saved = await finalizeSiteDiarySave'))
    assert.match(call, /expectedReportRow: saveUsedWarmCoreRowHandoff \? lastPersistedReportRef\.current : null/)
    const staleAt = workbench.indexOf('if (saved?.stale)')
    const successAt = workbench.indexOf('diaryPersistSucceeded = true', staleAt)
    const staleBlock = workbench.slice(staleAt, staleAt + 180)
    assert.match(staleBlock, /failSave\(WARM_HANDOFF_REPORT_CHANGED_MESSAGE\)/)
    assert.match(staleBlock, /return/)
    assert.doesNotMatch(staleBlock, /lastPersistedReportRef\.current =/)
    assert.doesNotMatch(staleBlock, /setSiteSummary/)
    assert.ok(successAt > staleAt)
    assert.equal(
      WARM_HANDOFF_REPORT_CHANGED_MESSAGE,
      'This diary changed after you opened it. Open it again and review it before saving.',
    )
  })

  it('leaves the autosave read-then-update path unchanged', () => {
    assert.match(autosave, /\.update\(comparableNext\)/)
    assert.match(autosave, /\.eq\('id', reportId\)/)
    assert.doesNotMatch(autosave, /p_expected_report/)
  })
})
