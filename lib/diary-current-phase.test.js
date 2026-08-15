import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearedDiaryContentFields,
  createDiaryDraftFromSetup,
  createTodaysDiaryDraft,
  reusableDiaryFields,
  updateDiarySetupFields,
} from './diary-draft.js'
import {
  loadEditDiarySetupSources,
  projectHydrateSelectColumns,
} from './diary-edit-hydrate.js'
import { buildLiveDailyReportUpdatePayload } from './live-diary-schema.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * In-memory stand-in for the live tables used by the saved-diary hydrate path.
 * `daily_reports` rejects `is_draft` exactly as the live schema does, and
 * `projects` returns only the columns the caller selected.
 */
function fakeDiaryDatabase({ reports = new Map(), projects = new Map() } = {}) {
  let sequence = 0

  const matches = (row, filters) =>
    Object.entries(filters).every(([column, value]) => String(row[column]) === String(value))

  const dailyReportsTable = () => ({
    insert(row) {
      return {
        select: () => ({
          async single() {
            if (Object.prototype.hasOwnProperty.call(row, 'is_draft')) {
              return {
                data: null,
                error: {
                  message:
                    "Could not find the 'is_draft' column of 'daily_reports' in the schema cache",
                },
              }
            }
            sequence += 1
            const id = `rep-${sequence}`
            reports.set(id, { id, ...row })
            return { data: { id }, error: null }
          },
        }),
      }
    },
    select() {
      const filters = {}
      const builder = {
        eq(column, value) {
          filters[column] = value
          return builder
        },
        async maybeSingle() {
          for (const row of reports.values()) {
            if (matches(row, filters)) return { data: { ...row }, error: null }
          }
          return { data: null, error: null }
        },
      }
      return builder
    },
    update(patch) {
      const filters = {}
      const builder = {
        eq(column, value) {
          filters[column] = value
          return builder
        },
        select: () => ({
          async single() {
            for (const row of reports.values()) {
              if (matches(row, filters)) {
                Object.assign(row, patch)
                return { data: { id: row.id, project_id: row.project_id }, error: null }
              }
            }
            return { data: null, error: { message: 'report not found' } }
          },
        }),
      }
      return builder
    },
  })

  const projectsTable = () => {
    let selected = []
    const filters = {}
    const builder = {
      select(columns) {
        selected = String(columns || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
        return builder
      },
      eq(column, value) {
        filters[column] = value
        return builder
      },
      async maybeSingle() {
        const row = projects.get(filters.id)
        if (!row) return { data: null, error: null }
        const projected = {}
        for (const column of selected) {
          if (Object.prototype.hasOwnProperty.call(row, column)) projected[column] = row[column]
        }
        return { data: projected, error: null }
      },
    }
    return builder
  }

  return {
    reports,
    projects,
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from(table) {
      if (table === 'daily_reports') return dailyReportsTable()
      if (table === 'projects') return projectsTable()
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

describe('Current Phase — diary/report ownership', () => {
  it('migration stores Current Phase on daily_reports', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260814190000_daily_reports_current_phase.sql'),
      'utf8',
    )
    assert.match(sql, /ALTER TABLE public\.daily_reports/)
    assert.match(sql, /ADD COLUMN IF NOT EXISTS current_phase text/)
    assert.doesNotMatch(sql, /ALTER TABLE public\.projects/)
  })

  it('a new diary starts blank and never copies Current Phase from another diary', () => {
    assert.equal(clearedDiaryContentFields().current_phase, null)
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        reusableDiaryFields({ current_phase: 'Groundworks' }),
        'current_phase',
      ),
      false,
    )
  })

  it('setup create writes Current Phase to the daily report', async () => {
    let inserted = null
    const supabase = {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from(table) {
        assert.equal(table, 'daily_reports')
        return {
          insert(row) {
            inserted = row
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'rep-1' }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    const id = await createDiaryDraftFromSetup(supabase, {
      projectId: 'proj-1',
      reportDate: '2026-08-14',
      creatorName: 'Alex',
      companyReportingFor: 'Acme',
      currentPhase: ' Fit-out ',
    })
    assert.equal(id, 'rep-1')
    assert.equal(inserted.current_phase, 'Fit-out')
  })

  it('editing report details updates Current Phase on that report only', async () => {
    let updated = null
    const supabase = {
      from(table) {
        assert.equal(table, 'daily_reports')
        return {
          update(row) {
            updated = row
            const builder = {
              eq() {
                return builder
              },
              select() {
                return {
                  async single() {
                    return { data: { id: 'rep-1', project_id: 'proj-1' }, error: null }
                  },
                }
              },
            }
            return builder
          },
        }
      },
    }

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: {
        reportDate: '2026-08-14',
        creatorName: 'Alex',
        companyReportingFor: 'Acme',
        currentPhase: 'Handover',
      },
    })
    assert.equal(updated.current_phase, 'Handover')
  })

  it('a later diary Current Phase cannot alter an earlier diary', async () => {
    const reports = new Map([
      ['rep-early', { id: 'rep-early', project_id: 'proj-1', current_phase: 'Groundworks' }],
      ['rep-later', { id: 'rep-later', project_id: 'proj-1', current_phase: 'Fit-out' }],
    ])
    const supabase = {
      from(table) {
        assert.equal(table, 'daily_reports')
        return {
          update(patch) {
            let reportId = null
            const builder = {
              eq(column, value) {
                if (column === 'id') reportId = value
                return builder
              },
              select() {
                return {
                  async single() {
                    const row = reports.get(reportId)
                    Object.assign(row, patch)
                    return { data: row, error: null }
                  },
                }
              },
            }
            return builder
          },
        }
      },
    }

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-later',
      projectId: 'proj-1',
      fields: {
        reportDate: '2026-08-15',
        creatorName: 'Alex',
        companyReportingFor: 'Acme',
        currentPhase: 'Handover',
      },
    })

    assert.equal(reports.get('rep-early').current_phase, 'Groundworks')
    assert.equal(reports.get('rep-later').current_phase, 'Handover')
  })

  it('setup hydrates Current Phase from the report, not the project', () => {
    const setup = readFileSync(
      join(root, 'app/dashboard/diary/setup/page.jsx'),
      'utf8',
    )
    assert.match(setup, /setCurrentPhase\(String\(report\?\.current_phase/)
    assert.doesNotMatch(setup, /setCurrentPhase\(sticky\.currentPhase/)
  })
})

describe('Current Phase — saved diary reopens exactly as saved', () => {
  const projectWithLegacyPhase = () =>
    new Map([
      [
        'proj-1',
        {
          id: 'proj-1',
          name: 'Prince Street',
          site_address: '14 High St',
          client_pm: 'Jordan Lee',
          working_days_per_week: 5,
          // Legacy project-level value that must never reach the diary form.
          current_phase: 'Demolition',
          start_date: '2026-08-01',
          planned_completion_date: '2026-09-19',
        },
      ],
    ])

  it('Diary A saved with a phase reopens with that phase', async () => {
    const supabase = fakeDiaryDatabase({ projects: projectWithLegacyPhase() })

    const reportId = await createDiaryDraftFromSetup(supabase, {
      projectId: 'proj-1',
      reportDate: '2026-08-15',
      creatorName: 'Colin Walker',
      companyReportingFor: 'Outsource Pro',
      currentPhase: 'Roof',
    })

    const loaded = await loadEditDiarySetupSources(supabase, {
      reportId,
      projectId: 'proj-1',
    })

    assert.equal(loaded.ok, true)
    assert.equal(loaded.report.current_phase, 'Roof')
  })

  it('the reopened value comes from the diary even when the project holds a different phase', async () => {
    const supabase = fakeDiaryDatabase({ projects: projectWithLegacyPhase() })

    const reportId = await createDiaryDraftFromSetup(supabase, {
      projectId: 'proj-1',
      reportDate: '2026-08-15',
      creatorName: 'Colin Walker',
      companyReportingFor: 'Outsource Pro',
      currentPhase: 'Roof',
    })

    const loaded = await loadEditDiarySetupSources(supabase, {
      reportId,
      projectId: 'proj-1',
    })

    assert.equal(loaded.report.current_phase, 'Roof')
    // The project hydrate must not even fetch projects.current_phase.
    assert.equal(
      Object.prototype.hasOwnProperty.call(loaded.project, 'current_phase'),
      false,
    )
    assert.doesNotMatch(projectHydrateSelectColumns(), /current_phase/)
  })

  it('editing the phase on Project & Report Details reopens with the edited value', async () => {
    const supabase = fakeDiaryDatabase({ projects: projectWithLegacyPhase() })

    const reportId = await createDiaryDraftFromSetup(supabase, {
      projectId: 'proj-1',
      reportDate: '2026-08-15',
      creatorName: 'Colin Walker',
      companyReportingFor: 'Outsource Pro',
      currentPhase: 'Roof',
    })

    await updateDiarySetupFields(supabase, {
      reportId,
      projectId: 'proj-1',
      fields: {
        reportDate: '2026-08-15',
        creatorName: 'Colin Walker',
        companyReportingFor: 'Outsource Pro',
        currentPhase: 'Second fix',
      },
    })

    const reopened = await loadEditDiarySetupSources(supabase, {
      reportId,
      projectId: 'proj-1',
    })
    assert.equal(reopened.report.current_phase, 'Second fix')
  })

  it('saving the diary workbench cannot clear a saved Current Phase', () => {
    const { payload } = buildLiveDailyReportUpdatePayload({
      site_summary: 'on target',
      current_phase: 'Roof',
    })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'current_phase'), false)
  })

  it('the saved-diary loader reads the whole report row so Current Phase cannot be dropped', () => {
    const loader = readFileSync(join(root, 'lib/diary-edit-hydrate.js'), 'utf8')
    const reportQuery = loader.slice(loader.indexOf("from('daily_reports')"))
    assert.match(reportQuery.slice(0, 120), /\.select\('\*'\)/)
  })

  it('Diary B for the same project starts blank even though Diary A has a phase', async () => {
    const projects = projectWithLegacyPhase()
    const supabase = fakeDiaryDatabase({ projects })

    const diaryA = await createDiaryDraftFromSetup(supabase, {
      projectId: 'proj-1',
      reportDate: '2026-08-14',
      creatorName: 'Colin Walker',
      companyReportingFor: 'Outsource Pro',
      currentPhase: 'Roof',
    })

    const diaryB = await createTodaysDiaryDraft(supabase, 'proj-1', diaryA)

    const loadedB = await loadEditDiarySetupSources(supabase, {
      reportId: diaryB,
      projectId: 'proj-1',
    })
    assert.equal(loadedB.report.current_phase, null)

    // Diary A is untouched by starting Diary B.
    const loadedA = await loadEditDiarySetupSources(supabase, {
      reportId: diaryA,
      projectId: 'proj-1',
    })
    assert.equal(loadedA.report.current_phase, 'Roof')
  })

  it('a new diary on an existing project never prefills Current Phase from the project', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Colin Walker',
      reportDate: '2026-08-15',
      existingProject: projectWithLegacyPhase().get('proj-1'),
    })
    assert.equal(state.currentPhase, '')
    assert.equal(state.projectAddress, '14 High St')
  })
})
