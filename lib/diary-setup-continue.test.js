import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaryFormHref,
  persistSetupProject,
  runDiarySetupContinue,
  validateDiarySetupContinue,
} from './diary-setup-continue.js'
import { NEW_PROJECT_SENTINEL } from './diary-setup-project-dates.js'

function validForm(over = {}) {
  return {
    projectName: 'North Site',
    author: 'Alex',
    reportingOnBehalfOf: 'Acme',
    reportDate: '2026-08-06',
    startDate: '2026-08-01',
    plannedCompletionDate: '2026-09-19',
    projectReference: '',
    brandLogoUrl: null,
    brandingId: null,
    brandColor: null,
    ...over,
  }
}

describe('diary setup continue CTA', () => {
  it('complete valid setup creates one draft and navigates with project_id + dates', async () => {
    const inserts = []
    const navigations = []
    const drafts = []

    const supabase = {
      from(table) {
        assert.equal(table, 'projects')
        return {
          insert(row) {
            inserts.push(row)
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'proj-new' }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const result = await runDiarySetupContinue({
      form: validForm(),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: (plan) => persistSetupProject({ supabase, plan }),
      createDraft: async (fields) => {
        drafts.push(fields)
        return 'rep-1'
      },
      updateDraft: async () => {
        throw new Error('updateDraft should not run for new setup')
      },
      writeExtras: () => {},
      clearFormDraft: () => {},
      navigate: async (href) => {
        navigations.push(href)
      },
    })

    assert.equal(result.ok, true)
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].projectId, 'proj-new')
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].start_date, '2026-08-01')
    assert.equal(inserts[0].planned_completion_date, '2026-09-19')
    assert.equal(result.navigatedTo, '/dashboard/project/proj-new/diary?report=rep-1')
    assert.deepEqual(navigations, [result.navigatedTo])
    assert.equal(result.projectId, 'proj-new')
    assert.equal(result.reportId, 'rep-1')
  })

  it('retains project_id and programme dates on the continue result', async () => {
    const result = await runDiarySetupContinue({
      form: validForm(),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-9',
      createDraft: async () => 'rep-9',
      updateDraft: async () => {},
      navigate: async () => {},
    })
    assert.equal(result.projectId, 'proj-9')
    assert.equal(result.start_date, '2026-08-01')
    assert.equal(result.planned_completion_date, '2026-09-19')
    assert.equal(diaryFormHref(result.projectId, result.reportId), result.navigatedTo)
  })

  it('does not require Summary to continue', () => {
    const v = validateDiarySetupContinue(validForm({ summary: undefined, siteSummary: undefined }))
    assert.equal(v.ok, true)
  })

  it('invalid dates show an explicit message rather than silent failure', () => {
    const v = validateDiarySetupContinue(validForm({
      startDate: '2026-09-19',
      plannedCompletionDate: '2026-08-01',
    }))
    assert.equal(v.ok, false)
    assert.equal(v.field, 'dates')
    assert.match(v.message, /Planned Completion Date cannot be earlier/i)
  })

  it('double-tapping does not create duplicate diaries', async () => {
    let creates = 0
    const first = runDiarySetupContinue({
      alreadySaving: false,
      form: validForm(),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-1',
      createDraft: async () => {
        creates += 1
        await new Promise((r) => setTimeout(r, 20))
        return 'rep-1'
      },
      updateDraft: async () => {},
      navigate: async () => {},
    })
    const second = await runDiarySetupContinue({
      alreadySaving: true,
      form: validForm(),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-1',
      createDraft: async () => {
        creates += 1
        return 'rep-2'
      },
      updateDraft: async () => {},
      navigate: async () => {},
    })
    const firstResult = await first
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'busy')
    assert.equal(firstResult.ok, true)
    assert.equal(creates, 1)
  })

  it('persist update does not require selecting date columns back (RLS-safe)', async () => {
    let updated = null
    const supabase = {
      from() {
        return {
          update(row) {
            updated = row
            return {
              eq() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }
    // supabase-js chains .update().eq() as thenable-like; our helper awaits the chain.
    // Adapt to match persistSetupProject's await on the builder:
    const supabase2 = {
      from() {
        return {
          update(row) {
            updated = row
            const builder = {
              eq() {
                return builder
              },
              then(resolve) {
                resolve({ error: null })
              },
            }
            return builder
          },
        }
      },
    }
    const id = await persistSetupProject({
      supabase: supabase2,
      plan: {
        mode: 'update',
        projectId: 'proj-old',
        name: 'Site A',
        dates: { start_date: '2026-08-01', planned_completion_date: '2026-09-19' },
      },
    })
    assert.equal(id, 'proj-old')
    assert.deepEqual(updated, {
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
    })
  })
})
