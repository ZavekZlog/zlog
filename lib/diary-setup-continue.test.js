import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDiarySetupContinueForm,
  diaryFormHref,
  persistSetupProject,
  resolveSetupProjectName,
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
    assert.equal(inserts[0].site_address, null)
    assert.equal(inserts[0].client_pm, null)
    assert.equal(inserts[0].working_days_per_week, null)
    assert.equal(Object.prototype.hasOwnProperty.call(inserts[0], 'current_phase'), false)
    assert.equal(result.navigatedTo, '/dashboard/project/proj-new/diary?report=rep-1&compose=1')
    assert.doesNotMatch(result.navigatedTo, /edit=/)
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

  it("Continue to Today's Diary opens compose, not existing-diary edit mode", () => {
    const href = diaryFormHref('proj-1', 'rep-new')
    assert.equal(href, '/dashboard/project/proj-1/diary?report=rep-new&compose=1')
    assert.doesNotMatch(href, /edit=/)
    assert.match(href, /compose=1/)
  })

  it('does not require Summary to continue', () => {
    const v = validateDiarySetupContinue(validForm({ summary: undefined, siteSummary: undefined }))
    assert.equal(v.ok, true)
  })

  it('blank Project Name is rejected before any project write', () => {
    const v = validateDiarySetupContinue(validForm({ projectName: '   ' }))
    assert.equal(v.ok, false)
    assert.equal(v.field, 'required')
  })

  it('sticky existing project validates when selectedProjectId resolves the project name', () => {
    const resolved = resolveSetupProjectName('', 'proj-1', [{ id: 'proj-1', name: 'North Site' }])
    assert.equal(resolved, 'North Site')
    const v = validateDiarySetupContinue(
      buildDiarySetupContinueForm(
        {
          projectName: '',
          author: 'Alex',
          reportingOnBehalfOf: 'Acme',
          reportDate: '2026-08-06',
          startDate: '2026-08-01',
          plannedCompletionDate: '2026-09-19',
        },
        {
          selectedProjectId: 'proj-1',
          existingProjects: [{ id: 'proj-1', name: 'North Site' }],
        },
      ),
    )
    assert.equal(v.ok, true)
  })

  it('preloaded visible values validate when live input DOM precedes React state sync', () => {
    const v = validateDiarySetupContinue(
      buildDiarySetupContinueForm(
        {
          projectName: '',
          author: '',
          reportingOnBehalfOf: '',
          reportDate: '',
        },
        {
          selectedProjectId: 'proj-1',
          existingProjects: [{ id: 'proj-1', name: 'North Site' }],
          dom: {
            projectName: 'North Site',
            author: 'Alex',
            reportingOnBehalfOf: 'Main Contractor',
            reportDate: '2026-08-06',
          },
        },
      ),
    )
    assert.equal(v.ok, true)
  })

  it('truly empty required fields still fail after canonical resolution', () => {
    const v = validateDiarySetupContinue(
      buildDiarySetupContinueForm(
        {
          projectName: '',
          author: '',
          reportingOnBehalfOf: '',
          reportDate: '',
        },
        {
          selectedProjectId: '__new__',
          existingProjects: [{ id: 'proj-1', name: 'North Site' }],
          dom: {},
        },
      ),
    )
    assert.equal(v.ok, false)
    assert.equal(v.field, 'required')
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

  it('persists project fields on the project and Current Phase on the diary', async () => {
    const inserts = []
    const drafts = []
    const result = await runDiarySetupContinue({
      form: validForm({
        projectAddress: '14 High St',
        projectManager: 'Jordan Lee',
        workingDaysPerWeek: '5',
        currentPhase: 'Groundworks',
        authorRole: 'Site Manager',
      }),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: (plan) => {
        inserts.push(plan.fields)
        return persistSetupProject({
          supabase: {
            from() {
              return {
                insert(row) {
                  inserts.push(row)
                  return {
                    select() {
                      return {
                        async single() {
                          return { data: { id: 'proj-sticky' }, error: null }
                        },
                      }
                    },
                  }
                },
              }
            },
          },
          plan,
        })
      },
      createDraft: async (fields) => {
        drafts.push(fields)
        return 'rep-sticky'
      },
      updateDraft: async () => {},
      navigate: async () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(result.site_address, '14 High St')
    assert.equal(result.client_pm, 'Jordan Lee')
    assert.equal(result.working_days_per_week, 5)
    assert.equal(result.current_phase, 'Groundworks')
    assert.equal(Object.prototype.hasOwnProperty.call(inserts[0], 'current_phase'), false)
    assert.equal(drafts[0].currentPhase, 'Groundworks')
    assert.equal(result.start_date, '2026-08-01')
    assert.equal(drafts[0].creatorRole, 'Site Manager')
    assert.equal(Object.prototype.hasOwnProperty.call(inserts[inserts.length - 1] || {}, 'creator_role'), false)
  })

  it('blank Author Role does not block continue and is not written to projects', async () => {
    const drafts = []
    const projectWrites = []
    const result = await runDiarySetupContinue({
      form: validForm({ authorRole: '' }),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async (plan) => {
        projectWrites.push(plan.fields)
        return 'proj-1'
      },
      createDraft: async (fields) => {
        drafts.push(fields)
        return 'rep-1'
      },
      updateDraft: async () => {},
      navigate: async () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(drafts[0].creatorRole, '')
    assert.equal(Object.prototype.hasOwnProperty.call(projectWrites[0] || {}, 'creator_role'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(projectWrites[0] || {}, 'client_pm'), true)
  })

  it('edit existing setup omits coverPhotoUrl so the workbench remains canonical', async () => {
    const updates = []
    let creates = 0
    const result = await runDiarySetupContinue({
      form: validForm({
        author: 'Updated Author',
        currentPhase: 'Fit-out',
      }),
      selectedProjectId: 'proj-edit',
      existingProjects: [{ id: 'proj-edit', name: 'North Site' }],
      editingReportId: 'rep-edit',
      editingProjectId: 'proj-edit',
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-edit',
      createDraft: async () => {
        creates += 1
        throw new Error('createDraft should not run when editing')
      },
      updateDraft: async (args) => {
        updates.push(args)
      },
      writeExtras: () => {},
      clearFormDraft: () => {},
      navigate: async () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(result.reportId, 'rep-edit')
    assert.equal(result.navigatedTo, '/dashboard/project/proj-edit/diary?report=rep-edit&compose=1')
    assert.equal(creates, 0)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].reportId, 'rep-edit')
    assert.equal(Object.prototype.hasOwnProperty.call(updates[0].fields, 'coverPhotoUrl'), false)
    assert.equal(updates[0].fields.creatorName, 'Updated Author')
    assert.equal(updates[0].fields.currentPhase, 'Fit-out')
    for (const dailyContentField of [
      'weather',
      'siteSummary',
      'visitors',
      'permits',
      'deliveryNotes',
      'photoEvidence',
      'areaNotes',
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(updates[0].fields, dailyContentField),
        false,
        `${dailyContentField} must remain attached to the existing report`,
      )
    }
  })

  it('new setup continue does not invent coverPhotoUrl on createDraft', async () => {
    const drafts = []
    const result = await runDiarySetupContinue({
      form: validForm(),
      selectedProjectId: NEW_PROJECT_SENTINEL,
      existingProjects: [],
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async () => 'proj-new',
      createDraft: async (fields) => {
        drafts.push(fields)
        return 'rep-new'
      },
      updateDraft: async () => {
        throw new Error('updateDraft should not run for new setup')
      },
      navigate: async () => {},
    })
    assert.equal(result.ok, true)
    assert.equal(Object.prototype.hasOwnProperty.call(drafts[0], 'coverPhotoUrl'), false)
  })

  it('rejects invalid working days without requiring Summary', () => {
    const v = validateDiarySetupContinue(validForm({ workingDaysPerWeek: '9' }))
    assert.equal(v.ok, false)
    assert.equal(v.field, 'workingDays')
    const ok = validateDiarySetupContinue(validForm({ summary: undefined }))
    assert.equal(ok.ok, true)
  })

  it('persist update does not require selecting date columns back (RLS-safe)', async () => {
    let updated = null
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
        fields: {
          start_date: '2026-08-01',
          planned_completion_date: '2026-09-19',
          site_address: '14 High St',
          client_pm: 'Jordan Lee',
          working_days_per_week: 5,
        },
      },
    })
    assert.equal(id, 'proj-old')
    assert.deepEqual(updated, {
      start_date: '2026-08-01',
      planned_completion_date: '2026-09-19',
      site_address: '14 High St',
      client_pm: 'Jordan Lee',
      working_days_per_week: 5,
    })
  })
})
