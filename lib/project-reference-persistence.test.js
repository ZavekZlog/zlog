/**
 * HARD FAIL anti-regression — Project Reference sticky persistence (project-level).
 *
 * Journeys:
 *   A. Existing project has ref X → create diary → save → reopen → X remains
 *   B. Edit unrelated diary field → save → reopen → Project Reference X remains
 *   C. Change X → Y → save → next diary for same project prefills Y
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  hydrateStickyFromRow,
  planProjectReferencePersistence,
  resolveProjectReference,
  stickyWritePayload,
} from './project-sticky-fields.js'
import {
  mergeProjectIntoSetupState,
  planProjectDatePersistence,
  NEW_PROJECT_SENTINEL,
} from './diary-setup-project-dates.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'
import { persistSetupProject, runDiarySetupContinue } from './diary-setup-continue.js'
import { buildLiveDailyReportUpdatePayload } from './live-diary-schema.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260814120000_project_reference.sql'),
  'utf8',
)

const PROJECT_WITH_X = {
  id: 'proj-1',
  name: 'North Site',
  start_date: '2026-01-01',
  planned_completion_date: '2026-12-31',
  site_address: '1 Site Rd',
  client_pm: 'Pat',
  working_days_per_week: 5,
  current_phase: 'Structure',
  project_reference: 'X',
}

function formBase(over = {}) {
  return {
    projectName: 'North Site',
    author: 'Alex',
    reportingOnBehalfOf: 'Acme',
    reportDate: '2026-08-14',
    startDate: '2026-01-01',
    plannedCompletionDate: '2026-12-31',
    projectAddress: '1 Site Rd',
    projectManager: 'Pat',
    workingDaysPerWeek: '5',
    currentPhase: 'Structure',
    projectReference: 'X',
    brandLogoUrl: null,
    brandingId: null,
    brandColor: null,
    ...over,
  }
}

describe('Project Reference — persistence source (project column)', () => {
  it('migration adds projects.project_reference', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS project_reference/)
    assert.match(migration, /public\.projects/)
  })

  it('setup hydrate prefers project column over legacy report extras', () => {
    assert.match(setupPage, /loadEditDiarySetupSources/)
    assert.match(setupPage, /loaded\.hydration\.projectReference/)
  })

  it('diary hydrate prefers project column over legacy report extras', () => {
    assert.match(diaryPage, /hydrateEditModeCoverAndReference/)
    assert.match(diaryPage, /editHydration\.projectReference/)
    assert.doesNotMatch(
      diaryPage,
      /setProjectReference\(extras\?\.projectReference\s*\|\|\s*''\)/,
    )
  })

  it('resolveProjectReference: project wins over extras; no hard-coded value', () => {
    assert.equal(
      resolveProjectReference({
        projectRow: { project_reference: 'X' },
        reportExtras: { projectReference: 'STALE' },
      }),
      'X',
    )
    assert.equal(
      resolveProjectReference({
        projectRow: { project_reference: null },
        reportExtras: { projectReference: 'LEGACY' },
      }),
      'LEGACY',
    )
    assert.equal(resolveProjectReference({ projectRow: null, reportExtras: null }), '')
  })

  it('omitted / undefined form value does not plan a wipe of existing reference', () => {
    const omit = planProjectReferencePersistence({
      formValue: undefined,
      existingProjectReference: 'X',
      fieldPresent: false,
    })
    assert.equal(omit.include, false)

    const payload = stickyWritePayload({
      projectAddress: '1 Site Rd',
      projectManager: 'Pat',
      workingDaysPerWeek: '5',
      currentPhase: 'Structure',
      // projectReference intentionally omitted
    })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'project_reference'), false)
  })
})

describe('Journey A — create diary keeps Project Reference X', () => {
  it('new diary for existing project prefills X from project metadata', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      reportDate: '2026-08-14',
      existingProject: PROJECT_WITH_X,
    })
    assert.equal(state.projectReference, 'X')
    assert.equal(hydrateStickyFromRow(PROJECT_WITH_X).projectReference, 'X')
  })

  it('continue save writes project_reference X onto projects and survives reopen hydrate', async () => {
    const projectWrites = []
    const extrasWrites = []

    const result = await runDiarySetupContinue({
      form: formBase({ projectReference: 'X' }),
      existingProjects: [PROJECT_WITH_X],
      selectedProjectId: 'proj-1',
      getUser: async () => ({ id: 'user-1' }),
      persistProject: async (plan) => {
        projectWrites.push(plan)
        return persistSetupProject({
          supabase: {
            from() {
              return {
                update(row) {
                  projectWrites.push({ mode: 'update', row })
                  return { eq() { return { error: null } } }
                },
                insert() {
                  return {
                    select() {
                      return {
                        single: async () => ({ data: { id: 'proj-new' }, error: null }),
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
      createDraft: async () => 'rep-1',
      writeExtras: (reportId, extras) => extrasWrites.push({ reportId, extras }),
      clearFormDraft: () => {},
      navigate: async () => {},
    })

    assert.equal(result.ok, true)
    assert.equal(result.project_reference, 'X')
    // Reuse when unchanged is fine; if update, must include X.
    const update = projectWrites.find((w) => w?.mode === 'update' || w?.row)
    if (update?.row) {
      assert.equal(update.row.project_reference, 'X')
    } else {
      // Unchanged sticky → reuse; project already has X.
      assert.equal(projectWrites[0].mode, 'reuse')
      assert.equal(PROJECT_WITH_X.project_reference, 'X')
    }

    const reopened = resolveProjectReference({
      projectRow: { project_reference: result.project_reference ?? 'X' },
      reportExtras: extrasWrites[0]?.extras || null,
    })
    assert.equal(reopened, 'X')
  })
})

describe('Journey B — unrelated diary edit must not clear Project Reference', () => {
  it('daily_reports update payload never includes project_reference', () => {
    const payload = buildLiveDailyReportUpdatePayload({
      report_date: '2026-08-14',
      site_summary: 'Updated summary only',
      weather: 'Fine',
      shift: 'Day',
      visitors: '',
      delays_issues: '',
      actions_required: '',
      company_reporting_for: '',
      creator_name: 'Alex',
      creator_role: 'SM',
      project_reference: 'SHOULD-NOT-APPLY',
    })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'project_reference'), false)
    assert.doesNotMatch(JSON.stringify(payload), /project_reference/)
  })

  it('finalizeSiteDiarySave path never touches projects.project_reference', () => {
    const saveSrc = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')
    assert.doesNotMatch(saveSrc, /project_reference/)
    assert.doesNotMatch(diaryPage, /\.from\('projects'\)[\s\S]{0,200}project_reference/)
  })

  it('editing unrelated sticky fields without projectReference key cannot wipe X', () => {
    const payload = stickyWritePayload({
      projectAddress: '2 New Rd',
      projectManager: 'Pat',
      workingDaysPerWeek: '5',
      currentPhase: 'Structure',
    })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'project_reference'), false)

    const plan = planProjectReferencePersistence({
      formValue: undefined,
      existingProjectReference: 'X',
      fieldPresent: false,
    })
    assert.equal(plan.include, false)
  })
})

describe('Journey C — explicit change X → Y prefills next diary', () => {
  it('setup continue persists Y onto projects when user changes reference', async () => {
    const updates = []
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-1',
      newProjectValue: NEW_PROJECT_SENTINEL,
      existingProjects: [PROJECT_WITH_X],
      projectName: 'North Site',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-12-31',
      projectAddress: '1 Site Rd',
      projectManager: 'Pat',
      workingDaysPerWeek: '5',
      currentPhase: 'Structure',
      projectReference: 'Y',
    })
    assert.equal(plan.mode, 'update')
    assert.equal(plan.fields.project_reference, 'Y')

    await persistSetupProject({
      supabase: {
        from() {
          return {
            update(row) {
              updates.push(row)
              return {
                eq() {
                  return { error: null }
                },
              }
            },
          }
        },
      },
      plan,
    })
    assert.equal(updates[0].project_reference, 'Y')

    const nextDiary = initialiseNewDiarySetupState({
      authorName: 'Alex',
      reportDate: '2026-08-15',
      existingProject: { ...PROJECT_WITH_X, project_reference: 'Y' },
    })
    assert.equal(nextDiary.projectReference, 'Y')
    assert.equal(
      mergeProjectIntoSetupState({}, { ...PROJECT_WITH_X, project_reference: 'Y' }).projectReference,
      'Y',
    )
  })
})
