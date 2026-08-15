/**
 * Golden Journey C — Use a Previous Diary (contract layer).
 * Authenticated browser pick→clone requires future E2E; this locks immutability rules.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { basisCreatesNewDiaryId } from '../diary-view-mode.js'
import { diaryFormHref, runDiarySetupContinue } from '../diary-setup-continue.js'
import { authorNameFromUser } from '../report-setup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')

describe('Golden Journey C — Previous Diary (contract)', () => {
  it('reuse of an earlier diary states the source stays unchanged', () => {
    // Reuse is no longer a hub card, but the underlying flow must stay intact.
    assert.match(hubPage, /Use this diary for today\?/)
    assert.match(hubPage, /Your original diary will remain saved and unchanged/)
    assert.match(hubPage, /confirmUsePreviousForToday|requestUsePreviousForToday/)
    assert.doesNotMatch(hubPage, /window\.confirm/)
  })

  it('Use for Today lands on Project & Report Details before the workbench', () => {
    const useForToday = hubPage.slice(
      hubPage.indexOf('const confirmUsePreviousForToday'),
      hubPage.indexOf('const startNewReport'),
    )
    assert.match(useForToday, /createTodaysDiaryDraft/)
    assert.match(useForToday, /projectAndReportDetailsHref\(row\.project_id, id\)/)
    // The workbench must not be reachable directly from this transition.
    assert.doesNotMatch(useForToday, /diaryFormHref|compose=1|edit=1/)
  })

  it('the details screen reviews the same diary, then continues into it', async () => {
    // Populated review screen, not a second create.
    assert.match(setupPage, /Project & Report Details/)
    assert.match(setupPage, /Continue to Today(’|')s Diary/)

    const creates = []
    const updates = []
    const result = await runDiarySetupContinue({
      form: {
        projectName: 'Riverside',
        author: 'Crew Lead',
        authorRole: 'Site Manager',
        reportingOnBehalfOf: 'Main Contractor',
        reportDate: '2026-08-15',
        shift: 'Day',
      },
      selectedProjectId: 'proj-1',
      existingProjects: [{ id: 'proj-1', name: 'Riverside' }],
      editingReportId: 'rep-today',
      editingProjectId: 'proj-1',
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-1',
      createDraft: async () => {
        creates.push('created')
        return 'rep-duplicate'
      },
      updateDraft: async (args) => {
        updates.push(args.reportId)
      },
      navigate: async () => {},
    })

    assert.equal(result.ok, true)
    assert.deepEqual(creates, [], 'reviewing details must not create a second diary')
    assert.deepEqual(updates, ['rep-today'])
    assert.equal(result.reportId, 'rep-today')
    assert.equal(result.navigatedTo, diaryFormHref('proj-1', 'rep-today'))
  })

  it('basis/previous flow creates a new diary id (source not overwritten)', () => {
    assert.equal(basisCreatesNewDiaryId('source-diary-abc', 'new-diary-xyz'), true)
    assert.equal(basisCreatesNewDiaryId('same-id', 'same-id'), false)
  })

  it('author still follows profile-author rules (never email local-part)', () => {
    const name = authorNameFromUser(
      { email: 'crew.lead@example.com', user_metadata: { full_name: 'Crew Lead' } },
      { full_name: 'Crew Lead' },
    )
    assert.equal(name, 'Crew Lead')
    assert.notEqual(
      authorNameFromUser({ email: 'crew.lead@example.com', user_metadata: {} }, null),
      'crew.lead',
    )
  })
})
