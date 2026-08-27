/**
 * Use as Basis — Reporting On Behalf Of (company_reporting_for) reuse.
 *
 * A. Source non-empty → new draft has same value
 * B. Setup hydrate reads that value into reportingOnBehalfOf
 * C. Continue accepts reused value without retyping
 * D. Changing Reporting On Behalf Of on the new diary still persists
 * E. Source empty + no sticky → remains empty (no fabrication)
 * F. Report date stays today — never copied from source
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTodaysDiaryDraft,
  reusableDiaryFields,
  updateDiarySetupFields,
} from './diary-draft.js'
import { loadEditDiarySetupSources } from './diary-edit-hydrate.js'
import {
  buildDiarySetupContinueForm,
  validateDiarySetupContinue,
} from './diary-setup-continue.js'
import { todayIsoDate } from './report-setup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const draftSrc = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')

function fakeUseBasisDb({
  reports = new Map(),
  stickyOnBehalf = '',
  profileName = 'Alex SiteMgr',
} = {}) {
  let sequence = 0
  const ownerId = 'user-1'

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
            const stored = { id, owner_id: ownerId, ...row }
            reports.set(id, stored)
            return { data: { id }, error: null }
          },
        }),
      }
    },
    select(columns) {
      const filters = {}
      let limit = Infinity
      let orderDesc = false
      const builder = {
        eq(column, value) {
          filters[column] = value
          return builder
        },
        order() {
          orderDesc = true
          return builder
        },
        limit(n) {
          limit = n
          return builder
        },
        async maybeSingle() {
          for (const row of reports.values()) {
            const ok = Object.entries(filters).every(
              ([column, value]) => String(row[column]) === String(value),
            )
            if (ok) return { data: { ...row }, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve) {
          // list queries (fetchLatestReportingOnBehalfOf)
          let rows = [...reports.values()].filter((row) =>
            Object.entries(filters).every(
              ([column, value]) => String(row[column]) === String(value),
            ),
          )
          if (orderDesc) {
            rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
          }
          if (Number.isFinite(limit)) rows = rows.slice(0, limit)
          // When selecting only company_reporting_for for sticky, inject sticky seed
          if (String(columns || '').includes('company_reporting_for') && stickyOnBehalf) {
            const hasNonEmpty = rows.some(
              (r) => String(r.company_reporting_for || '').trim(),
            )
            if (!hasNonEmpty) {
              rows = [
                {
                  company_reporting_for: stickyOnBehalf,
                  created_at: '2026-01-01T00:00:00Z',
                },
                ...rows,
              ]
            }
          }
          resolve({ data: rows, error: null })
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
              const ok = Object.entries(filters).every(
                ([column, value]) => String(row[column]) === String(value),
              )
              if (ok) {
                Object.assign(row, patch)
                return { data: { id: row.id, project_id: row.project_id }, error: null }
              }
            }
            return { data: null, error: { message: 'not found' } }
          },
        }),
      }
      return builder
    },
  })

  return {
    reports,
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: ownerId,
            email: 'alex@example.com',
            user_metadata: { full_name: profileName },
          },
        },
        error: null,
      }),
    },
    from(table) {
      if (table === 'daily_reports') return dailyReportsTable()
      if (table === 'users' || table === 'company_brandings') {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              async maybeSingle() {
                                return { data: null, error: null }
                              },
                            }
                          },
                          async maybeSingle() {
                            return { data: null, error: null }
                          },
                        }
                      },
                      limit() {
                        return {
                          async maybeSingle() {
                            return { data: null, error: null }
                          },
                        }
                      },
                      async maybeSingle() {
                        return { data: null, error: null }
                      },
                    }
                  },
                  async maybeSingle() {
                    return { data: null, error: null }
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'projects') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: { id: 'proj-1', name: 'North Riverside Construction Site' },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

describe('Use as Basis — company_reporting_for reuse', () => {
  it('reusableDiaryFields copies company_reporting_for and never report_date', () => {
    const reused = reusableDiaryFields({
      company_reporting_for: 'Main Contractor Ltd',
      report_date: '2026-01-01',
      creator_name: 'Prior Author',
    })
    assert.equal(reused.company_reporting_for, 'Main Contractor Ltd')
    assert.equal(Object.prototype.hasOwnProperty.call(reused, 'report_date'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(reused, 'creator_name'), false)
  })

  it('A. source company_reporting_for → Use as Basis new draft keeps the same value', async () => {
    const reports = new Map()
    reports.set('rep-source', {
      id: 'rep-source',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: '2026-08-01',
      company_reporting_for: 'Turner Construction',
      creator_name: 'Prior',
      created_at: '2026-08-01T10:00:00Z',
    })
    const supabase = fakeUseBasisDb({ reports })
    const newId = await createTodaysDiaryDraft(supabase, 'proj-1', 'rep-source')
    const created = reports.get(newId)
    assert.equal(created.company_reporting_for, 'Turner Construction')
    assert.notEqual(newId, 'rep-source')
  })

  it('B. setup hydrate from that new draft → reportingOnBehalfOf is non-empty', async () => {
    const reports = new Map()
    reports.set('rep-source', {
      id: 'rep-source',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: '2026-08-01',
      company_reporting_for: 'Client Org',
      created_at: '2026-08-01T10:00:00Z',
    })
    const supabase = fakeUseBasisDb({ reports })
    const newId = await createTodaysDiaryDraft(supabase, 'proj-1', 'rep-source')
    const loaded = await loadEditDiarySetupSources(supabase, {
      reportId: newId,
      projectId: 'proj-1',
    })
    assert.equal(loaded.ok, true)
    const reportingOnBehalfOf = String(loaded.report?.company_reporting_for || '').trim()
    assert.equal(reportingOnBehalfOf, 'Client Org')
    assert.match(setupPage, /setReportingOnBehalfOf\(\s*report\?\.company_reporting_for/)
  })

  it('C. Continue accepts the reused value without retyping', () => {
    const form = buildDiarySetupContinueForm({
      projectName: 'North Site',
      author: 'Alex SiteMgr',
      reportingOnBehalfOf: 'Turner Construction',
      reportDate: todayIsoDate(),
    })
    const v = validateDiarySetupContinue(form)
    assert.equal(v.ok, true)
  })

  it('D. changing Reporting On Behalf Of on the new diary still persists', async () => {
    const reports = new Map()
    reports.set('rep-new', {
      id: 'rep-new',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: todayIsoDate(),
      company_reporting_for: 'Turner Construction',
    })
    const supabase = fakeUseBasisDb({ reports })
    await updateDiarySetupFields(supabase, {
      reportId: 'rep-new',
      projectId: 'proj-1',
      fields: {
        reportDate: todayIsoDate(),
        creatorName: 'Alex SiteMgr',
        companyReportingFor: 'Updated Client',
      },
    })
    assert.equal(reports.get('rep-new').company_reporting_for, 'Updated Client')
  })

  it('E. source genuinely empty + no sticky → remains empty (no fabrication)', async () => {
    const reports = new Map()
    reports.set('rep-empty-source', {
      id: 'rep-empty-source',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: '2026-08-01',
      company_reporting_for: null,
      created_at: '2026-08-01T10:00:00Z',
    })
    const supabase = fakeUseBasisDb({ reports, stickyOnBehalf: '' })
    const newId = await createTodaysDiaryDraft(supabase, 'proj-1', 'rep-empty-source')
    assert.equal(reports.get(newId).company_reporting_for, null)
  })

  it('E2. source empty + existing sticky → sticky fills new draft (blank-diary mechanism)', async () => {
    const reports = new Map()
    reports.set('rep-empty-source', {
      id: 'rep-empty-source',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: '2026-08-01',
      company_reporting_for: null,
      created_at: '2026-08-20T10:00:00Z',
    })
    const supabase = fakeUseBasisDb({
      reports,
      stickyOnBehalf: 'Sticky Main Contractor',
    })
    const newId = await createTodaysDiaryDraft(supabase, 'proj-1', 'rep-empty-source')
    assert.equal(reports.get(newId).company_reporting_for, 'Sticky Main Contractor')
  })

  it('F. report date is today — not copied from source', async () => {
    const reports = new Map()
    reports.set('rep-source', {
      id: 'rep-source',
      owner_id: 'user-1',
      project_id: 'proj-1',
      report_date: '2026-01-15',
      company_reporting_for: 'Acme',
      created_at: '2026-01-15T10:00:00Z',
    })
    const supabase = fakeUseBasisDb({ reports })
    const newId = await createTodaysDiaryDraft(supabase, 'proj-1', 'rep-source')
    assert.equal(reports.get(newId).report_date, todayIsoDate())
    assert.notEqual(reports.get(newId).report_date, '2026-01-15')
    assert.match(draftSrc, /report_date: todayIso\(\)/)
  })
})
