/**
 * SDSC Project Details fast path + dirty-field reconcile — architecture lock.
 * Fail if unrelated work removes first-paint-from-session or overwrites dirty fields.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SITE_DIARY_SHADOW_FIELD_KEYS,
  mergeSiteDiarySessionSnapshot,
  getSiteDiarySessionSnapshot,
  clearAllSiteDiarySessionSnapshotsForTests,
} from './site-diary-session-context.js'
import { readSetupBehaviourSource, readSetupPageSource } from './diary-setup-ui-source.js'

const setupPage = readSetupBehaviourSource()
const setupHostPage = readSetupPageSource()

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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function createCurrentFastSetupLifecycle(fastState, canonicalRequest) {
  let current = { ...fastState }
  let touchedFields = new Set()
  let currentLifecycleKey = 'setup|proj-1|rep-A'
  const reconciliationLifecycleKey = currentLifecycleKey
  let reconciledLifecycleKey = null
  const persisted = []
  const published = []
  const navigated = []
  const reconciliation = canonicalRequest.promise.then((authoritative) => {
    if (currentLifecycleKey !== reconciliationLifecycleKey) return current
    current = Object.fromEntries(
      Object.entries(authoritative).map(([key, canonicalValue]) => [
        key,
        touchedFields.has(key) ? current[key] : canonicalValue,
      ]),
    )
    reconciledLifecycleKey = reconciliationLifecycleKey
    return current
  })

  return {
    displayReady: true,
    edit(patch) {
      for (const key of Object.keys(patch)) touchedFields.add(key)
      current = { ...current, ...patch }
    },
    continueNow() {
      if (reconciledLifecycleKey !== currentLifecycleKey) return
      persisted.push({ ...current })
      published.push({ ...current })
      navigated.push('/dashboard/project/proj-1/diary?report=rep-A')
    },
    retarget(lifecycleKey) {
      currentLifecycleKey = lifecycleKey
      touchedFields = new Set()
    },
    reconciliation,
    get current() {
      return current
    },
    persisted,
    published,
    navigated,
  }
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

describe('Defect #4 — setup commit readiness', () => {
  it('does not persist, publish, or navigate before canonical reconciliation settles', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Fast manager' },
      canonical,
    )

    assert.equal(lifecycle.displayReady, true)
    lifecycle.continueNow()

    assert.deepEqual(lifecycle.persisted, [])
    assert.deepEqual(lifecycle.published, [])
    assert.deepEqual(lifecycle.navigated, [])

    canonical.resolve({ projectManager: 'Authoritative manager' })
    await lifecycle.reconciliation
  })

  it('preserves a user edit when canonical reconciliation completes', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Fast manager' },
      canonical,
    )

    lifecycle.edit({ projectManager: 'User manager' })
    canonical.resolve({ projectManager: 'Authoritative manager' })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.equal(lifecycle.persisted[0].projectManager, 'User manager')
  })

  it('reconciles untouched fields while preserving a different user-edited field', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      {
        projectManager: 'Fast manager',
        currentPhase: 'Fast phase',
      },
      canonical,
    )

    lifecycle.edit({ currentPhase: 'User phase' })
    canonical.resolve({
      projectManager: 'Canonical manager',
      currentPhase: 'Canonical phase',
    })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.deepEqual(lifecycle.persisted[0], {
      projectManager: 'Canonical manager',
      currentPhase: 'User phase',
    })
  })

  it('preserves explicit ownership after a field returns to its fast value', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Fast manager' },
      canonical,
    )

    lifecycle.edit({ projectManager: 'Temporary manager' })
    lifecycle.edit({ projectManager: 'Fast manager' })
    canonical.resolve({ projectManager: 'Canonical manager' })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.equal(lifecycle.persisted[0].projectManager, 'Fast manager')
  })

  it('reconciles an untouched fast field to its canonical value', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Fast manager' },
      canonical,
    )

    canonical.resolve({ projectManager: 'Canonical manager' })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.equal(lifecycle.persisted[0].projectManager, 'Canonical manager')
  })

  it('preserves normal Continue after equivalent reconciliation completes', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Same manager' },
      canonical,
    )

    canonical.resolve({ projectManager: 'Same manager' })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.equal(lifecycle.persisted.length, 1)
    assert.equal(lifecycle.published.length, 1)
    assert.equal(lifecycle.navigated.length, 1)
  })

  it('does not commit after authoritative reconciliation fails', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Fast manager' },
      canonical,
    )

    canonical.reject(new Error('Network unavailable'))
    await assert.rejects(lifecycle.reconciliation, /Network unavailable/)
    lifecycle.continueNow()

    assert.deepEqual(lifecycle.persisted, [])
    assert.deepEqual(lifecycle.published, [])
    assert.deepEqual(lifecycle.navigated, [])
  })

  it('does not let an old project lifecycle unblock the current target', async () => {
    const canonical = deferred()
    const lifecycle = createCurrentFastSetupLifecycle(
      { projectManager: 'Project A manager' },
      canonical,
    )

    lifecycle.retarget('setup|proj-2|rep-B')
    canonical.resolve({ projectManager: 'Authoritative project A manager' })
    await lifecycle.reconciliation
    lifecycle.continueNow()

    assert.deepEqual(lifecycle.persisted, [])
  })

  it('wires lifecycle-bound commit readiness into the real controller and CTA', () => {
    assert.match(setupPage, /const \[reconciledLifecycleKey, setReconciledLifecycleKey\] = useState\(null\)/)
    assert.match(setupPage, /isSetupCommitReadyForLifecycle\(\s*reconciledLifecycleKey,\s*setupLifecycleKey/)
    assert.match(setupPage, /if \(saving \|\| !commitReady\) return/)
    assert.match(setupPage, /setReconciledLifecycleKey\(setupLifecycleKey\)/)
    assert.match(setupHostPage, /disabled=\{saving \|\| !commitReady\}/)
  })
})

describe('SDSC field-level reconcile after fast path', () => {
  it('keeps lifecycle-local ordinary-field, logo and cover ownership', () => {
    assert.match(setupPage, /const ordinaryFieldOwnershipRef = useRef\(\{\s*lifecycleKey: setupLifecycleKey,\s*touched: new Set\(\)/)
    assert.match(setupPage, /const userChangedLogoRef = useRef\(false\)/)
    assert.match(setupPage, /const userChangedCoverRef = useRef\(false\)/)
    assert.doesNotMatch(setupHostPage, /detailsTouchedRef/)
    assert.match(setupPage, /ordinaryFieldOwnershipRef\.current\.touched\.add\(fieldKey\)/)
    assert.match(setupPage, /userChangedLogoRef\.current = true/)
    assert.match(setupPage, /userChangedCoverRef\.current = true/)
  })

  it('reconciles each untouched ordinary field and preserves only its user-owned peers', () => {
    const load = existingDiaryLoadSource()
    assert.doesNotMatch(load, /skipFormReconcile/)
    assert.match(load, /const shouldApplyCanonicalField = \(fieldKey\)/)
    assert.match(load, /!ordinaryFieldOwnershipRef\.current\.touched\.has\(fieldKey\)/)
    assert.match(load, /if \(shouldApplyCanonicalField\('projectManager'\)\) setProjectManager\(sticky\.projectManager\)/)
    assert.match(load, /if \(shouldApplyCanonicalField\('currentPhase'\)\)/)
    assert.match(setupPage, /const handleStickyFieldsChange/)
  })

  it('marks exact user-owned fields synchronously before their state setters', () => {
    const stickyHandler = setupPage.slice(
      setupPage.indexOf('const handleStickyFieldsChange'),
      setupPage.indexOf('const uploadLogoIfNeeded'),
    )
    const datesHandler = setupPage.slice(
      setupPage.indexOf('const handleProjectDatesChange'),
      setupPage.indexOf('const handleStickyFieldsChange'),
    )
    assert.ok(
      stickyHandler.indexOf("markOrdinaryFieldTouched('projectManager')")
        < stickyHandler.indexOf('setProjectManager(next.projectManager)'),
    )
    assert.ok(
      datesHandler.indexOf("markOrdinaryFieldTouched('projectStartDate')")
        < datesHandler.indexOf('setProjectStartDate(startDate)'),
    )
    assert.match(setupPage, /updateOrdinaryFieldFromUser\('currentPhase', setCurrentPhase, value\)/)
    assert.match(setupPage, /updateOrdinaryFieldFromUser\(\s*'reportingCompany',\s*setReportingCompany/)
    assert.match(setupPage, /updateOrdinaryFieldFromUser\('author', setAuthor, value\)/)
  })

  it('resets ordinary-field ownership at the exact setup lifecycle boundary', () => {
    assert.match(setupPage, /ordinaryFieldOwnershipRef\.current\.lifecycleKey !== setupLifecycleKey/)
    const load = existingDiaryLoadSource()
    assert.match(load, /ordinaryFieldOwnershipRef\.current = \{\s*lifecycleKey: setupLifecycleKey,\s*touched: new Set\(\)/)
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
    assert.match(load, /shouldApplyCanonicalField\('projectManager'\)/)
    assert.match(load, /shouldApplyCanonicalField\('reportingCompany'\)/)
    assert.match(load, /if \(!usedFastPath\) setLoading\(false\)/)
    assert.doesNotMatch(load, /if \(usedFastPath\) return/)
  })
})
