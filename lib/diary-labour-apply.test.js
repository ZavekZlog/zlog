/**
 * Edit-diary Apply → durable report_labour (count/hours), not autosave.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { labourFormToPersistRows } from './diary-save-dirty.js'
import {
  LABOUR_APPLY_SAVE_FAIL_MESSAGE,
  labourApplySavedNotice,
  persistAppliedLabourRows,
} from './diary-labour-apply.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const viewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')
const autosave = readFileSync(join(root, 'lib/diary-autosave.js'), 'utf8')
const applyHelper = readFileSync(join(root, 'lib/diary-labour-apply.js'), 'utf8')

function mockLabourSupabase({ deleteError = null, insertError = null, inserted = [] } = {}) {
  let deletes = 0
  return {
    stats: () => ({ deletes, inserted: inserted.slice() }),
    from(table) {
      assert.equal(table, 'report_labour')
      return {
        delete() {
          return {
            eq(col, id) {
              assert.equal(col, 'report_id')
              assert.equal(id, 'rep-edit-1')
              deletes += 1
              return Promise.resolve({ error: deleteError })
            },
          }
        },
        insert(rows) {
          inserted.push(...(rows || []))
          return Promise.resolve({ error: insertError })
        },
      }
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
  it('writes canonical count/hours rows via replaceLabour (delete then insert)', async () => {
    const formRows = [
      { trade: 'Groundworks', company: 'Acme', headcount: '15', hours: '122.25', notes: '' },
    ]
    const expected = labourFormToPersistRows(formRows, 'rep-edit-1')
    assert.equal(expected[0].count, 15)
    assert.equal(expected[0].hours, 122.25)
    assert.equal(expected[0].report_id, 'rep-edit-1')
    assert.equal(expected[0].sequence, 0)

    const supabase = mockLabourSupabase()
    const payload = await persistAppliedLabourRows(supabase, 'rep-edit-1', formRows)
    assert.deepEqual(payload, expected)
    assert.equal(supabase.stats().deletes, 1)
    assert.equal(supabase.stats().inserted.length, 1)
    assert.equal(supabase.stats().inserted[0].count, 15)
    assert.equal(supabase.stats().inserted[0].hours, 122.25)
    assert.equal(supabase.stats().inserted[0].trade, 'Groundworks')
  })

  it('does not insert when delete fails', async () => {
    const supabase = mockLabourSupabase({ deleteError: { message: 'delete failed' } })
    await assert.rejects(
      () => persistAppliedLabourRows(supabase, 'rep-edit-1', [
        { trade: 'Groundworks', company: 'Acme', headcount: '15', hours: '122.25', notes: '' },
      ]),
    )
    assert.equal(supabase.stats().inserted.length, 0)
  })

  it('replaces rather than appending — a second persist is still one delete plus one insert set', async () => {
    const formRows = [
      { trade: 'Groundworks', company: 'Acme', headcount: '15', hours: '122.25', notes: '' },
    ]
    const supabase = mockLabourSupabase()
    await persistAppliedLabourRows(supabase, 'rep-edit-1', formRows)
    await persistAppliedLabourRows(supabase, 'rep-edit-1', formRows)
    assert.equal(supabase.stats().deletes, 2)
    assert.equal(supabase.stats().inserted.length, 2)
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
    assert.match(diaryPage, /persistAppliedLabourRows\(supabase, editingReportId, result\.rows\)/)
    assert.match(diaryPage, /LABOUR_APPLY_SAVE_FAIL_MESSAGE/)
    assert.equal(typeof LABOUR_APPLY_SAVE_FAIL_MESSAGE, 'string')
    assert.match(LABOUR_APPLY_SAVE_FAIL_MESSAGE, /not saved|couldn’t save/i)
  })
})
