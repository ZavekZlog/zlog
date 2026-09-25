/**
 * Edit-diary Apply → durable report_labour (count/hours), not autosave.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DiarySaveError, FINALIZE_SITE_DIARY_SAVE_RPC } from './diary-save.js'
import { labourFormToPersistRows } from './diary-save-dirty.js'
import {
  LABOUR_APPLY_SAVE_FAIL_MESSAGE,
  labourApplySavedNotice,
  persistAppliedLabourRows,
} from './diary-labour-apply.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const labourHook = readFileSync(join(root, 'components/diary/useSiteDiaryLabour.js'), 'utf8')
const viewPage = readFileSync(join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx'), 'utf8')
const autosave = readFileSync(join(root, 'lib/diary-autosave.js'), 'utf8')
const applyHelper = readFileSync(join(root, 'lib/diary-labour-apply.js'), 'utf8')
const diarySaveSrc = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')

function okRpcResult(reportId, projectId, labourCount = 0) {
  return {
    ok: true,
    report_id: reportId,
    project_id: projectId,
    report: { id: reportId, project_id: projectId },
    labour_count: labourCount,
    cleanupJobs: [{ id: 'stale-job', path: 'user-1/rep-1/photos/old/report.jpg' }],
  }
}

function mockLabourRpcSupabase({
  reportId = 'rep-edit-1',
  projectId = 'proj-edit-1',
  rpcError = null,
  rpcData = null,
} = {}) {
  const rpcCalls = []
  return {
    rpcCalls,
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      if (name !== FINALIZE_SITE_DIARY_SAVE_RPC) {
        throw new Error(`unexpected rpc: ${name}`)
      }
      if (rpcError) return { data: null, error: rpcError }
      return {
        data: rpcData ?? okRpcResult(reportId, projectId, Array.isArray(args?.p_labour) ? args.p_labour.length : 0),
        error: null,
      }
    },
    storage: {
      from() {
        throw new Error('storage must not run for labour-only save')
      },
    },
  }
}

describe('labourApplySavedNotice', () => {
  it('states durable save with operative and hour totals', () => {
    assert.equal(
      labourApplySavedNotice({ operatives: 15, hours: 122.25 }),
      '15 operatives · 122.25 hrs saved.',
    )
    assert.equal(
      labourApplySavedNotice({ operatives: 1, hours: 8 }),
      '1 operative · 8 hrs saved.',
    )
  })
})

describe('persistAppliedLabourRows', () => {
  it('calls finalize_site_diary_save with labour-only null domains', async () => {
    const formRows = [
      { trade: 'Groundworks', company: 'Acme', headcount: '15', hours: '122.25', notes: '' },
    ]
    const expected = labourFormToPersistRows(formRows, 'rep-edit-1')
    const supabase = mockLabourRpcSupabase()
    const payload = await persistAppliedLabourRows(
      supabase,
      'rep-edit-1',
      'proj-edit-1',
      formRows,
    )
    assert.deepEqual(payload, expected)
    assert.equal(supabase.rpcCalls.length, 1)
    assert.deepEqual(supabase.rpcCalls[0].args, {
      p_report_id: 'rep-edit-1',
      p_project_id: 'proj-edit-1',
      p_report_patch: null,
      p_labour: expected,
      p_plant: null,
      p_photos: null,
    })
  })

  it('passes empty labour array to clear rows atomically', async () => {
    const supabase = mockLabourRpcSupabase({ labourCount: 0 })
    const payload = await persistAppliedLabourRows(supabase, 'rep-edit-1', 'proj-edit-1', [])
    assert.deepEqual(payload, [])
    assert.deepEqual(supabase.rpcCalls[0].args.p_labour, [])
  })

  it('propagates RPC errors', async () => {
    const supabase = mockLabourRpcSupabase({
      rpcError: { message: 'Labour payload must be a JSON array', code: 'P0001' },
    })
    await assert.rejects(
      () => persistAppliedLabourRows(supabase, 'rep-edit-1', 'proj-edit-1', [
        { trade: 'Groundworks', company: 'Acme', headcount: '1', hours: '8', notes: '' },
      ]),
      (err) => err instanceof DiarySaveError && err.code === 'FINALIZE_RPC_FAILED',
    )
  })

  it('rejects identity mismatch from RPC', async () => {
    const supabase = mockLabourRpcSupabase({
      rpcData: okRpcResult('wrong-report', 'proj-edit-1', 1),
    })
    await assert.rejects(
      () => persistAppliedLabourRows(supabase, 'rep-edit-1', 'proj-edit-1', [
        { trade: 'Groundworks', company: 'Acme', headcount: '1', hours: '8', notes: '' },
      ]),
      (err) => err instanceof DiarySaveError && err.code === 'ID_MISMATCH',
    )
  })

  it('does not use client report_labour delete/insert', () => {
    assert.doesNotMatch(applyHelper, /replaceLabour/)
    assert.doesNotMatch(applyHelper, /\.from\(\s*['"]report_labour['"]\)/)
    assert.match(applyHelper, /finalizeLabourOnly/)
  })
})

describe('edit → Apply → review contract wiring', () => {
  it('does not add labour to the autosave allowlist', () => {
    assert.match(autosave, /export const DIARY_AUTOSAVE_COLUMNS = \[/)
    const allow = autosave.slice(
      autosave.indexOf('export const DIARY_AUTOSAVE_COLUMNS = ['),
      autosave.indexOf(']', autosave.indexOf('export const DIARY_AUTOSAVE_COLUMNS = [')),
    )
    assert.doesNotMatch(allow, /labour/)
    assert.doesNotMatch(applyHelper, /DIARY_AUTOSAVE_COLUMNS/)
    assert.doesNotMatch(applyHelper, /finalizeSiteDiarySave/)
  })

  it('review still reads report_labour count/hours for Labour on Site', () => {
    assert.match(viewPage, /title="Labour on Site"/)
    assert.match(viewPage, /No labour was recorded/)
    const savedView = readFileSync(join(root, 'lib/diary-saved-view.js'), 'utf8')
    assert.match(savedView, /from\('report_labour'\)/)
    assert.match(savedView, /select\('trade, company, count, hours, notes'\)/)
    assert.match(savedView, /headcount: r\?\.count/)
  })

  it('edit Apply uses persistAppliedLabourRows when editingReportId exists', () => {
    assert.match(
      labourHook,
      /persistAppliedLabourRows\(supabase, editingReportId, projectId, result\.rows\)/,
    )
    assert.match(
      labourHook,
      /persistAppliedLabourRows\(supabase, editingReportId, projectId, _labourRows\)/,
    )
    assert.match(labourHook, /LABOUR_APPLY_SAVE_FAIL_MESSAGE/)
    assert.equal(typeof LABOUR_APPLY_SAVE_FAIL_MESSAGE, 'string')
    assert.match(LABOUR_APPLY_SAVE_FAIL_MESSAGE, /not saved|couldn’t save/i)
  })

  it('finalizeLabourOnly does not invoke storage cleanup', () => {
    const body = diarySaveSrc.slice(
      diarySaveSrc.indexOf('export async function finalizeLabourOnly'),
      diarySaveSrc.indexOf('export async function finalizeSiteDiarySave'),
    )
    assert.doesNotMatch(body, /processFinalizeStorageCleanup/)
  })
})
