/**
 * updateDiarySetupFields — true partial patch semantics (F2B cover must not wipe setup fields).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { updateDiarySetupFields } from './diary-draft.js'

function capturePatchSupabase({ reports = new Map() } = {}) {
  let lastPatch = null
  const supabase = {
    from(table) {
      assert.equal(table, 'daily_reports')
      return {
        update(patch) {
          lastPatch = patch
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
                  if (row) Object.assign(row, patch)
                  return { data: { id: reportId, project_id: row?.project_id }, error: null }
                },
              }
            },
          }
          return builder
        },
      }
    },
    getLastPatch() {
      return lastPatch
    },
  }
  return supabase
}

describe('updateDiarySetupFields partial patch', () => {
  const seededReport = () => ({
    id: 'rep-1',
    project_id: 'proj-1',
    report_date: '2026-08-20',
    company_reporting_for: 'Cwalker',
    creator_name: 'Alex SiteMgr',
    creator_role: 'Site Manager',
    shift: 'Day',
    current_phase: 'Groundworks',
    cover_photo_url: null,
  })

  it('1–3. cover-only update patches cover_photo_url only — preserves ROB, author, date, shift', async () => {
    const reports = new Map([['rep-1', seededReport()]])
    const supabase = capturePatchSupabase({ reports })

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: { coverPhotoUrl: 'user/cover.jpg' },
    })

    const patch = supabase.getLastPatch()
    assert.deepEqual(patch, { cover_photo_url: 'user/cover.jpg' })
    assert.equal(reports.get('rep-1').company_reporting_for, 'Cwalker')
    assert.equal(reports.get('rep-1').creator_name, 'Alex SiteMgr')
    assert.equal(reports.get('rep-1').creator_role, 'Site Manager')
    assert.equal(reports.get('rep-1').report_date, '2026-08-20')
    assert.equal(reports.get('rep-1').shift, 'Day')
    assert.equal(reports.get('rep-1').current_phase, 'Groundworks')
    assert.equal(reports.get('rep-1').cover_photo_url, 'user/cover.jpg')
  })

  it('cover-only with null cover clears cover only', async () => {
    const reports = new Map([
      ['rep-1', { ...seededReport(), cover_photo_url: 'old/cover.jpg' }],
    ])
    const supabase = capturePatchSupabase({ reports })

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: { coverPhotoUrl: null },
    })

    assert.deepEqual(supabase.getLastPatch(), { cover_photo_url: null })
    assert.equal(reports.get('rep-1').company_reporting_for, 'Cwalker')
  })

  it('4. full Project Details update still patches all supplied setup fields', async () => {
    const reports = new Map([['rep-1', seededReport()]])
    const supabase = capturePatchSupabase({ reports })

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: {
        reportDate: '2026-08-28',
        creatorName: 'Jordan Lee',
        creatorRole: 'Foreman',
        companyReportingFor: 'Updated Client',
        shift: 'Night',
        currentPhase: 'Fit-out',
        brandLogoUrl: 'user/logo.png',
        brandingId: 'brand-9',
        brandColor: '#FF5000',
        projectId: 'proj-2',
      },
    })

    const patch = supabase.getLastPatch()
    assert.equal(patch.report_date, '2026-08-28')
    assert.equal(patch.company_reporting_for, 'Updated Client')
    assert.equal(patch.creator_name, 'Jordan Lee')
    assert.equal(patch.creator_role, 'Foreman')
    assert.equal(patch.shift, 'Night')
    assert.equal(patch.current_phase, 'Fit-out')
    assert.equal(patch.brand_logo_url, 'user/logo.png')
    assert.equal(patch.branding_id, 'brand-9')
    assert.equal(patch.brand_color, '#FF5000')
    assert.equal(patch.project_id, 'proj-2')
    assert.equal(reports.get('rep-1').company_reporting_for, 'Updated Client')
  })

  it('5. explicitly supplied empty companyReportingFor clears ROB (present key semantics)', async () => {
    const reports = new Map([['rep-1', seededReport()]])
    const supabase = capturePatchSupabase({ reports })

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: {
        reportDate: '2026-08-28',
        creatorName: 'Alex SiteMgr',
        companyReportingFor: '',
      },
    })

    const patch = supabase.getLastPatch()
    assert.equal(patch.company_reporting_for, null)
    assert.equal(reports.get('rep-1').company_reporting_for, null)
    assert.equal(patch.creator_name, 'Alex SiteMgr')
  })

  it('absent reportDate does not inject today into partial patch', async () => {
    const supabase = capturePatchSupabase({ reports: new Map([['rep-1', seededReport()]]) })

    await updateDiarySetupFields(supabase, {
      reportId: 'rep-1',
      projectId: 'proj-1',
      fields: { coverPhotoUrl: 'only-cover.jpg' },
    })

    assert.equal(Object.prototype.hasOwnProperty.call(supabase.getLastPatch(), 'report_date'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(supabase.getLastPatch(), 'creator_name'), false)
  })
})
