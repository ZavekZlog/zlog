/**
 * Existing saved-diary Project Name is identity — read-only, no switch/insert.
 * Continue writes a complete SDSC snapshot before navigation.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planProjectDatePersistence } from './diary-setup-project-dates.js'
import {
  SITE_DIARY_SHADOW_FIELD_KEYS,
  mergeSiteDiarySessionSnapshot,
  getSiteDiarySessionSnapshot,
  clearAllSiteDiarySessionSnapshotsForTests,
  compareShadowToHydrate,
} from './site-diary-session-context.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const continueSrc = readFileSync(join(root, 'lib/diary-setup-continue.js'), 'utf8')
const workbenchPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

function isCompleteSdscSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key) || snapshot[key] === undefined) {
      return false
    }
  }
  return true
}

function continueSdscSnapshot(overrides = {}) {
  return {
    userId: 'user-1',
    projectId: 'proj-existing',
    reportId: 'rep-1',
    projectName: 'Beeches Site',
    projectStartDate: '2026-01-01',
    projectPlannedCompletionDate: '2026-12-31',
    projectAddress: '1 Site Road',
    projectManager: 'Pat Manager',
    workingDaysPerWeek: '5',
    projectReference: 'PR-100',
    reportDate: '2026-09-01',
    shift: 'Day',
    currentPhase: 'Groundworks',
    author: 'Alex Author',
    authorRole: 'Site Manager',
    reportingOnBehalfOf: 'Client Co',
    reportingCompany: 'Build Co',
    brandingId: 'brand-1',
    brandColor: '#FF5000',
    logoStoragePath: 'user-1/branding/logo.png',
    coverStoragePath: 'user-1/rep-1/cover.jpg',
    ...overrides,
  }
}

describe('existing diary Project Name is read-only identity', () => {
  it('Project Name is read-only when editingReportId is present', () => {
    assert.match(setupPage, /readOnly=\{Boolean\(editingReportId\)\}/)
    assert.match(setupPage, /aria-readonly=\{editingReportId \? 'true' : undefined\}/)
    assert.match(
      setupPage,
      /onChange=\{editingReportId \? undefined : handleProjectNameChange\}/,
    )
  })

  it('Project Name typing handler cannot switch selectedProjectId on existing diary', () => {
    const handler = setupPage.slice(
      setupPage.indexOf('const handleProjectNameChange'),
      setupPage.indexOf('const handleLogoFiles'),
    )
    assert.match(handler, /if \(editingReportId\) return/)
    const selectExisting = setupPage.slice(
      setupPage.indexOf('const handleSelectExisting'),
      setupPage.indexOf('const handleProjectNameChange'),
    )
    assert.match(selectExisting, /if \(editingReportId\) return/)
    assert.ok(handler.indexOf('handleSelectExisting') === -1
      || handler.indexOf('if (editingReportId) return') < handler.indexOf('handleSelectExisting'))
  })

  it('existing-diary Continue locks selectedProjectId to the URL project', () => {
    assert.match(setupPage, /continueSelectedProjectId/)
    assert.match(
      setupPage,
      /editingReportId && editingProjectId[\s\S]*\? editingProjectId[\s\S]*: selectedProjectId/,
    )
    assert.match(
      setupPage,
      /selectedProjectId: continueSelectedProjectId/,
    )
    assert.match(
      setupPage,
      /projectName: editingReportId \? undefined : projectNameInputRef/,
    )
  })

  it('new diary Project Name remains editable with existing/new project selection', () => {
    assert.match(setupPage, /onChange=\{editingReportId \? undefined : handleProjectNameChange\}/)
    assert.match(setupPage, /handleProjectNameChange/)
    assert.match(setupPage, /findExistingProjectByName/)
    assert.match(setupPage, /clearToNewProjectSelection/)
    assert.match(setupPage, /diary-setup-project-names/)
    assert.match(
      setupPage,
      /!editingReportId && existingProjects\.length > 0 \? 'diary-setup-project-names'/,
    )
    assert.match(
      setupPage,
      /placeholder=\{editingReportId \? undefined : 'Select an existing project or type a new name'\}/,
    )
  })
})

describe('existing diary Continue preserves project identity', () => {
  it('locked selectedProjectId does not INSERT when Project Name text is unique', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-existing',
      existingProjects: [{
        id: 'proj-existing',
        name: 'Beeches Site',
        start_date: '2026-01-01',
        planned_completion_date: '2026-12-31',
        site_address: '1 Site Road',
        client_pm: 'Pat',
        working_days_per_week: '5',
      }],
      projectName: 'A Completely Unique New Name',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-12-31',
      projectAddress: '1 Site Road',
      projectManager: 'Pat',
      workingDaysPerWeek: '5',
      projectReference: 'PR-100',
    })
    assert.notEqual(plan.mode, 'insert')
    assert.equal(plan.projectId, 'proj-existing')
  })

  it('locked selectedProjectId does not switch to another project by name text', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: 'proj-existing',
      existingProjects: [
        {
          id: 'proj-existing',
          name: 'Beeches Site',
          start_date: '2026-01-01',
          planned_completion_date: '2026-12-31',
        },
        {
          id: 'proj-other',
          name: 'North Yard',
          start_date: '2025-01-01',
          planned_completion_date: '2025-12-31',
        },
      ],
      projectName: 'North Yard',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-12-31',
    })
    assert.equal(plan.projectId, 'proj-existing')
    assert.notEqual(plan.projectId, 'proj-other')
    assert.notEqual(plan.mode, 'insert')
  })

  it('new diary without a selected id can still insert a uniquely named project', () => {
    const plan = planProjectDatePersistence({
      selectedProjectId: '__new__',
      existingProjects: [{ id: 'proj-existing', name: 'Beeches Site' }],
      projectName: 'Brand New Site',
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-12-31',
    })
    assert.equal(plan.mode, 'insert')
    assert.equal(plan.projectId, null)
  })
})

describe('existing-diary Continue complete SDSC snapshot before router.push', () => {
  beforeEach(() => {
    clearAllSiteDiarySessionSnapshotsForTests()
  })

  it('merges a complete snapshot after persist/cover and before router.push', () => {
    const helperStart = setupPage.indexOf('function buildExistingDiaryContinueSdscSnapshot')
    const helperEnd = setupPage.indexOf('function SiteDiarySetupPage')
    assert.ok(helperStart > 0 && helperEnd > helperStart)
    const helper = setupPage.slice(helperStart, helperEnd)
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.match(helper, new RegExp(`${key}:`))
    }
    assert.match(helper, /currentPhase:/)
    assert.match(helper, /reportingCompany:/)

    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    const mergeAt = continueFn.indexOf('mergeSiteDiarySessionSnapshot(buildExistingDiaryContinueSdscSnapshot')
    const pushAt = continueFn.indexOf('router.push(result.navigatedTo)')
    const persistAt = continueFn.indexOf('runDiarySetupContinue')
    const coverAt = continueFn.indexOf('putPendingCover')
    assert.ok(persistAt > 0 && coverAt > persistAt)
    assert.ok(mergeAt > coverAt)
    assert.ok(pushAt > mergeAt)
    assert.match(continueFn, /if \(editingReportId\)/)
    assert.match(continueFn, /userId: user\.id/)
    assert.match(continueFn, /projectId: result\.projectId/)
    assert.match(continueFn, /reportId: result\.reportId/)
    assert.doesNotMatch(continueFn, /await mergeSiteDiarySessionSnapshot/)
  })

  it('resulting snapshot qualifies for existing completeness / fast-path rules', () => {
    const snap = continueSdscSnapshot({
      currentPhase: 'Superstructure',
      reportingCompany: 'Turner Construction',
      projectName: 'Beeches Site',
    })
    assert.equal(isCompleteSdscSnapshot(snap), true)
    mergeSiteDiarySessionSnapshot(snap)
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-existing',
      reportId: 'rep-1',
    })
    assert.equal(isCompleteSdscSnapshot(stored), true)
    assert.equal(stored.currentPhase, 'Superstructure')
    assert.equal(stored.reportingCompany, 'Turner Construction')
    for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(stored, key), true)
      assert.notEqual(stored[key], undefined)
    }
    const compared = compareShadowToHydrate(stored, snap)
    assert.equal(compared.ok, true)
    assert.deepEqual(compared.missingFields, [])
  })

  it('does not change Continue persistence order or Workbench Phase 1', () => {
    const continueFn = setupPage.slice(
      setupPage.indexOf('const handleContinue = async'),
      setupPage.indexOf('  if (loading)'),
    )
    const getUserAt = continueFn.indexOf('supabase.auth.getUser()')
    const companyAt = continueFn.indexOf('persistReportingCompanyIdentity')
    const persistAt = continueFn.indexOf('runDiarySetupContinue')
    const coverAt = continueFn.indexOf('putPendingCover')
    const mergeAt = continueFn.indexOf('mergeSiteDiarySessionSnapshot')
    const pushAt = continueFn.indexOf('router.push(result.navigatedTo)')
    const authorAt = continueFn.indexOf('persistSignedInAuthorProfile')
    assert.ok(getUserAt > 0 && companyAt > getUserAt)
    assert.ok(persistAt > companyAt && coverAt > persistAt)
    assert.ok(mergeAt > coverAt && pushAt > mergeAt && authorAt > pushAt)
    assert.match(continueSrc, /export async function runDiarySetupContinue/)
    assert.match(workbenchPage, /progressiveEdit/)
  })
})
