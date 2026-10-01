/**
 * Reduced Unit 1A — project row and daily_reports row handoff only.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotFromLiveRow } from './diary-autosave.js'
import {
  beginCoreRowHandoff,
  bindCoreRowHandoffSession,
  publishCoreRowHandoff,
  readEligibleCoreRowHandoff,
} from './diary-edit-core-row-handoff.js'

const root = dirname(fileURLToPath(import.meta.url))
const workbench = readFileSync(join(root, '../components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')
const savedView = readFileSync(join(root, './diary-saved-view.js'), 'utf8')

const USER = 'user-1'
const PROJECT = 'proj-1'
const REPORT = 'rep-1'
const SESSION = 'session-1'

function reportRow(overrides = {}) {
  return {
    id: REPORT,
    project_id: PROJECT,
    site_summary: 'Poured slab',
    weather: 'Fine',
    ...overrides,
  }
}

function publishBound(overrides = {}) {
  beginCoreRowHandoff(4)
  const published = publishCoreRowHandoff({
    userId: USER,
    projectId: PROJECT,
    reportId: REPORT,
    viewerGeneration: 4,
    project: { id: PROJECT, name: 'Thailand' },
    report: reportRow(),
    ...overrides,
  })
  const bound = bindCoreRowHandoffSession({
    hydrationSessionId: SESSION,
    projectId: overrides.projectId || PROJECT,
    reportId: overrides.reportId || REPORT,
    viewerGeneration: overrides.viewerGeneration ?? 4,
  })
  return published && bound
}

describe('Unit 1A core row handoff', () => {
  beforeEach(() => {
    beginCoreRowHandoff(null)
  })

  it('same-user/project/report handoff skips the project fetch and the daily_reports fetch', () => {
    assert.equal(publishBound(), true)
    const rows = readEligibleCoreRowHandoff({
      userId: USER,
      projectId: PROJECT,
      reportId: REPORT,
      hydrationSessionId: SESSION,
    })
    assert.equal(rows.project.name, 'Thailand')
    assert.equal(rows.report.site_summary, 'Poured slab')
    assert.equal(rows.labour, undefined)
    assert.equal(rows.photos, undefined)

    const projectStart = workbench.indexOf("markDiaryHydrationTiming('project-hydrate-start'")
    const projectFetch = workbench.indexOf('await fetchProjectRowForEditHydrate', projectStart)
    const projectGate = workbench.slice(projectStart, projectFetch)
    assert.match(projectGate, /if \(coreRowHandoff\)/)
    assert.match(projectGate, /proj = coreRowHandoff\.project/)

    const reportStart = workbench.indexOf("markDiaryHydrationTiming('report-row-fetch-start'")
    const reportFetch = workbench.indexOf('await withTimeout(', reportStart)
    const reportGate = workbench.slice(reportStart, reportFetch)
    assert.match(reportGate, /existing = coreRowHandoff\.report/)
  })

  it('labour, plant, and photo fetches stay on the blocking path', () => {
    const reportFetch = workbench.indexOf('await withTimeout(')
    const labour = workbench.indexOf("supabase.from('report_labour')")
    const plant = workbench.indexOf("supabase.from('report_plant')")
    const photos = workbench.indexOf("supabase.from('report_photos')")
    const editPaint = workbench.indexOf('} else if (progressiveEdit) {')
    assert.ok(labour > reportFetch && plant > labour && photos > plant && editPaint > photos)
    const childBlock = workbench.slice(labour, editPaint)
    assert.doesNotMatch(childBlock, /coreRowHandoff/)
    assert.match(workbench, /await applySignature\(existing\.signature_url\)/)
  })

  it('wrong user, project, report, or generation is not eligible', () => {
    assert.equal(publishBound(), true)
    assert.equal(readEligibleCoreRowHandoff({
      userId: 'other',
      projectId: PROJECT,
      reportId: REPORT,
      hydrationSessionId: SESSION,
    }), null)
    assert.equal(readEligibleCoreRowHandoff({
      userId: USER,
      projectId: 'other',
      reportId: REPORT,
      hydrationSessionId: SESSION,
    }), null)
    assert.equal(readEligibleCoreRowHandoff({
      userId: USER,
      projectId: PROJECT,
      reportId: 'other',
      hydrationSessionId: SESSION,
    }), null)
    beginCoreRowHandoff(4)
    publishCoreRowHandoff({
      userId: USER,
      projectId: PROJECT,
      reportId: REPORT,
      viewerGeneration: 4,
      project: { id: PROJECT, name: 'Thailand' },
      report: reportRow(),
    })
    assert.equal(bindCoreRowHandoffSession({
      hydrationSessionId: SESSION,
      projectId: PROJECT,
      reportId: REPORT,
      viewerGeneration: 9,
    }), false)
    assert.equal(readEligibleCoreRowHandoff({
      userId: USER,
      projectId: PROJECT,
      reportId: REPORT,
      hydrationSessionId: SESSION,
    }), null)
  })

  it('Save baseline is the retained raw daily_reports row', () => {
    assert.equal(publishBound(), true)
    const rows = readEligibleCoreRowHandoff({
      userId: USER,
      projectId: PROJECT,
      reportId: REPORT,
      hydrationSessionId: SESSION,
    })
    assert.equal(snapshotFromLiveRow(rows.report).site_summary, 'Poured slab')
    const assigned = workbench.indexOf('existing = coreRowHandoff.report')
    const baseline = workbench.indexOf('lastPersistedReportRef.current = existing')
    const snap = workbench.indexOf('ackedSnapshotRef.current = snapshotFromLiveRow(existing)')
    assert.ok(assigned > 0 && snap > assigned && baseline > assigned)
  })

  it('viewer retains the raw rows without changing photo fetch or the view return', () => {
    assert.match(savedView, /publishCoreRowHandoff\(/)
    assert.match(savedView, /project,\s*report,/)
    assert.doesNotMatch(savedView, /includeAnnotations/)
    assert.match(savedView, /return full\.data \|\| \[\]/)
    assert.doesNotMatch(workbench, /getSiteDiarySessionSnapshot\(/)
  })
})
