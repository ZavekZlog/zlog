/**
 * SDSC Project Details fast path + dirty-field reconcile — architecture lock.
 * Fail if unrelated work removes first-paint-from-session or overwrites dirty fields.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SITE_DIARY_SHADOW_FIELD_KEYS,
  mergeSiteDiarySessionSnapshot,
  getSiteDiarySessionSnapshot,
  clearAllSiteDiarySessionSnapshotsForTests,
} from './site-diary-session-context.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')

function isCompleteSdscSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key) || snapshot[key] === undefined) {
      return false
    }
  }
  return true
}

function sdscSnapshotMatchesEditTarget(snapshot, { userId, projectId, reportId } = {}) {
  if (!snapshot) return false
  const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()
  return (
    same(snapshot.userId, userId)
    && same(snapshot.projectId, projectId)
    && same(snapshot.reportId, reportId)
  )
}

function fullSnapshot(overrides = {}) {
  return {
    userId: 'user-1',
    projectId: 'proj-1',
    reportId: 'rep-A',
    projectName: 'Alpha Site',
    projectStartDate: '2026-01-01',
    projectPlannedCompletionDate: '2026-12-31',
    projectAddress: '1 Site Road',
    projectManager: 'Pat Manager',
    workingDaysPerWeek: '5',
    projectReference: 'PR-100',
    reportDate: '2026-08-29',
    shift: 'Day',
    currentPhase: 'Groundworks',
    author: 'Alex Author',
    authorRole: 'Site Manager',
    reportingOnBehalfOf: 'Client Co',
    reportingCompany: 'Build Co',
    brandingId: 'brand-1',
    brandColor: '#FF5000',
    logoStoragePath: 'user-1/branding/logo.png',
    coverStoragePath: 'user-1/rep-A/cover.jpg',
    ...overrides,
  }
}

function trySdscFastPathSource() {
  const start = setupPage.indexOf('const trySdscFastPath = async')
  const end = setupPage.indexOf('const load = async')
  assert.ok(start > 0 && end > start)
  return setupPage.slice(start, end)
}

function existingDiaryLoadSource() {
  const start = setupPage.indexOf('const load = async')
  const end = setupPage.indexOf('// Brand-new diary setup')
  assert.ok(start > 0 && end > start)
  return setupPage.slice(start, end)
}

describe('SDSC fast first paint — complete matching snapshot', () => {
  it('gates fast path on a complete snapshot for the current report and project', () => {
    const tryFn = trySdscFastPathSource()
    assert.match(tryFn, /getSiteDiarySessionSnapshot\(\{/)
    assert.match(tryFn, /userId: sessionUserId/)
    assert.match(tryFn, /projectId: editingProjectId/)
    assert.match(tryFn, /reportId: editingReportId/)
    assert.match(tryFn, /isCompleteSdscSnapshot\(snapshot\)/)
    assert.match(tryFn, /sdscSnapshotMatchesEditTarget\(snapshot, \{/)
    assert.match(tryFn, /if \(!complete\) \{\s*return false/)
  })

  it('rejects an incomplete snapshot as a valid fast path', () => {
    assert.equal(isCompleteSdscSnapshot(fullSnapshot()), true)
    assert.equal(isCompleteSdscSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-A',
      projectName: 'Alpha Site',
    }), false)
    const tryFn = trySdscFastPathSource()
    const completeAt = tryFn.indexOf('isCompleteSdscSnapshot(snapshot)')
    const applyAt = tryFn.indexOf('applySdscSnapshotToForm(snapshot)')
    const rejectAt = tryFn.indexOf('if (!complete)')
    assert.ok(completeAt > 0 && rejectAt > completeAt && applyAt > rejectAt)
  })

  it('rejects a snapshot for report A when the edit target is report B', () => {
    clearAllSiteDiarySessionSnapshotsForTests()
    mergeSiteDiarySessionSnapshot(fullSnapshot({ reportId: 'rep-A' }))
    const storedA = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-A',
    })
    assert.equal(sdscSnapshotMatchesEditTarget(storedA, {
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-B',
    }), false)
    assert.equal(getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-B',
    }), null)
    assert.match(setupPage, /same\(snapshot\.reportId, reportId\)/)
    assert.match(trySdscFastPathSource(), /sdscSnapshotMatchesEditTarget\(snapshot/)
  })

  it('applies a complete matching snapshot onto Project Details before first paint', () => {
    const tryFn = trySdscFastPathSource()
    assert.match(tryFn, /applySdscSnapshotToForm\(snapshot\)/)
    assert.match(setupPage, /setProjectName\(snapshot\.projectName/)
    assert.match(setupPage, /setProjectManager\(snapshot\.projectManager/)
    assert.match(setupPage, /setReportingCompany\(snapshot\.reportingCompany/)
    const applyAt = tryFn.indexOf('applySdscSnapshotToForm(snapshot)')
    const loadingOff = tryFn.indexOf('setLoading(false)')
    assert.ok(applyAt > 0 && loadingOff > applyAt)
  })

  it('releases loading before legacy DB hydrate completes', () => {
    const tryFn = trySdscFastPathSource()
    const load = existingDiaryLoadSource()
    assert.doesNotMatch(tryFn, /loadEditDiarySetupSources/)
    assert.doesNotMatch(tryFn, /fetchProjectsForSetup/)
    assert.doesNotMatch(tryFn, /from\('daily_reports'\)/)
    const fastCall = load.indexOf('usedFastPath = await trySdscFastPath()')
    const dbHydrate = load.indexOf('loadEditDiarySetupSources')
    const projectsFetch = load.indexOf('fetchProjectsForSetup')
    assert.ok(fastCall > 0 && dbHydrate > fastCall && projectsFetch > fastCall)
    assert.match(load, /if \(!usedFastPath\) setLoading\(false\)/)
    const tryLoadingOff = tryFn.indexOf('setLoading(false)')
    assert.ok(tryLoadingOff > 0)
    assert.ok(tryFn.indexOf('return true') > tryLoadingOff)
  })

  it('reads the snapshot from local session context, not a diary network fetch', () => {
    const tryFn = trySdscFastPathSource()
    assert.match(tryFn, /supabase\.auth\.getSession\(\)/)
    assert.doesNotMatch(tryFn, /supabase\.auth\.getUser\(\)/)
    assert.match(tryFn, /getSiteDiarySessionSnapshot/)
    assert.doesNotMatch(tryFn, /loadEditDiarySetupSources/)
  })
})

describe('SDSC dirty-field reconcile after fast path', () => {
  it('keeps user-dirty form, logo and cover guards', () => {
    assert.match(setupPage, /const detailsTouchedRef = useRef\(false\)/)
    assert.match(setupPage, /const userChangedLogoRef = useRef\(false\)/)
    assert.match(setupPage, /const userChangedCoverRef = useRef\(false\)/)
    assert.match(setupPage, /if \(editingReportId\) detailsTouchedRef\.current = true/)
    assert.match(setupPage, /userChangedLogoRef\.current = true/)
    assert.match(setupPage, /userChangedCoverRef\.current = true/)
  })

  it('skips ordinary form overwrite when the user edited after fast paint', () => {
    const load = existingDiaryLoadSource()
    assert.match(load, /const skipFormReconcile = usedFastPath && detailsTouchedRef\.current/)
    assert.match(load, /if \(!skipFormReconcile\) \{/)
    const skipAt = load.indexOf('const skipFormReconcile = usedFastPath && detailsTouchedRef.current')
    const formBlock = load.indexOf('setProjectManager(sticky.projectManager)')
    assert.ok(skipAt > 0 && formBlock > skipAt)
    assert.match(setupPage, /const handleStickyFieldsChange/)
  })

  it('skips logo reconcile after a user-selected or removed logo', () => {
    const load = existingDiaryLoadSource()
    assert.match(load, /const skipLogoReconcile = usedFastPath && userChangedLogoRef\.current/)
    assert.match(load, /if \(!skipLogoReconcile\) \{/)
    const logoHandler = setupPage.slice(
      setupPage.indexOf('const handleLogoFiles'),
      setupPage.indexOf('const removeLogo'),
    )
    assert.match(logoHandler, /userChangedLogoRef\.current = true/)
    const removeLogo = setupPage.slice(
      setupPage.indexOf('const removeLogo'),
      setupPage.indexOf('const onCoverDrop'),
    )
    assert.match(removeLogo, /userChangedLogoRef\.current = true/)
    assert.match(load, /!userChangedLogoRef\.current\) setLogoPreview/)
  })

  it('skips cover reconcile after a user-selected or removed cover', () => {
    const load = existingDiaryLoadSource()
    assert.match(load, /const skipCoverReconcile = usedFastPath && userChangedCoverRef\.current/)
    assert.match(load, /if \(!skipCoverReconcile\) \{/)
    const coverDrop = setupPage.slice(
      setupPage.indexOf('const onCoverDrop'),
      setupPage.indexOf('const removeCoverPhoto'),
    )
    assert.match(coverDrop, /userChangedCoverRef\.current = true/)
    const removeCover = setupPage.slice(
      setupPage.indexOf('const removeCoverPhoto'),
      setupPage.indexOf('const handleProjectDatesChange'),
    )
    assert.match(removeCover, /userChangedCoverRef\.current = true/)
    assert.match(load, /!userChangedCoverRef\.current\) \{/)
  })

  it('untouched fields may still reconcile from the database after fast path', () => {
    const load = existingDiaryLoadSource()
    assert.match(load, /usedFastPath && detailsTouchedRef\.current/)
    assert.match(load, /if \(!skipFormReconcile\) \{/)
    assert.match(load, /if \(!usedFastPath\) setLoading\(false\)/)
    assert.doesNotMatch(load, /if \(usedFastPath\) return/)
  })
})
