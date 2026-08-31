import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeSiteDiarySessionSnapshot,
  getSiteDiarySessionSnapshot,
  clearSiteDiarySessionSnapshot,
  clearAllSiteDiarySessionSnapshotsForTests,
  compareShadowToHydrate,
} from './site-diary-session-context.js'

function fullSnapshot(overrides = {}) {
  return {
    userId: 'user-1',
    projectId: 'proj-1',
    reportId: 'rep-1',
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
    coverStoragePath: 'user-1/rep-1/covers/raw/1.jpg',
    ...overrides,
  }
}

describe('site-diary-session-context shadow store', () => {
  beforeEach(() => {
    clearAllSiteDiarySessionSnapshotsForTests()
  })

  it('exact matching snapshot → PASS', () => {
    const snap = fullSnapshot()
    mergeSiteDiarySessionSnapshot(snap)
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    const result = compareShadowToHydrate(stored, fullSnapshot())
    assert.equal(result.ok, true)
    assert.deepEqual(result.missingFields, [])
    assert.deepEqual(result.mismatchedFields, [])
  })

  it('trimmed/null-normalised semantic match → PASS', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot({
      projectName: '  Alpha Site  ',
      reportingCompany: null,
      authorRole: undefined,
    }))
    // undefined authorRole was skipped on merge — seed a complete row first
    clearAllSiteDiarySessionSnapshotsForTests()
    mergeSiteDiarySessionSnapshot(fullSnapshot({
      projectName: '  Alpha Site  ',
      reportingCompany: null,
      authorRole: '',
      brandColor: null,
    }))
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    const result = compareShadowToHydrate(stored, fullSnapshot({
      projectName: 'Alpha Site',
      reportingCompany: '',
      authorRole: null,
      brandColor: '',
    }))
    assert.equal(result.ok, true)
  })

  it('identity mismatch → FAIL', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot())
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    const result = compareShadowToHydrate(stored, fullSnapshot({ reportId: 'rep-OTHER' }))
    assert.equal(result.ok, false)
    assert.ok(result.mismatchedFields.includes('reportId'))
  })

  it('field mismatch → FAIL and names mismatched field', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot({ shift: 'Day' }))
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    const result = compareShadowToHydrate(stored, fullSnapshot({ shift: 'Night' }))
    assert.equal(result.ok, false)
    assert.ok(result.mismatchedFields.includes('shift'))
  })

  it('incomplete snapshot → FAIL and names missing field', () => {
    mergeSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
      projectName: 'Alpha Site',
    })
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    const result = compareShadowToHydrate(stored, fullSnapshot())
    assert.equal(result.ok, false)
    assert.ok(result.missingFields.includes('currentPhase'))
    assert.ok(result.missingFields.includes('reportingCompany'))
  })

  it('partial Workbench merge preserves existing setup-only fields', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot({
      currentPhase: 'Groundworks',
      reportingCompany: 'Build Co',
    }))
    mergeSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
      projectName: 'Alpha Site Updated',
      shift: 'Night',
      // intentionally omit currentPhase + reportingCompany
    })
    const stored = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-1',
    })
    assert.equal(stored.currentPhase, 'Groundworks')
    assert.equal(stored.reportingCompany, 'Build Co')
    assert.equal(stored.projectName, 'Alpha Site Updated')
    assert.equal(stored.shift, 'Night')
  })

  it('snapshot for report A cannot satisfy report B', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot({ reportId: 'rep-A' }))
    const forB = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-B',
    })
    assert.equal(forB, null)
    const storedA = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-A',
    })
    const result = compareShadowToHydrate(storedA, fullSnapshot({ reportId: 'rep-B' }))
    assert.equal(result.ok, false)
    assert.ok(result.mismatchedFields.includes('reportId'))
  })

  it('clear removes only intended session entry', () => {
    mergeSiteDiarySessionSnapshot(fullSnapshot({ reportId: 'rep-A' }))
    mergeSiteDiarySessionSnapshot(fullSnapshot({ reportId: 'rep-B', projectName: 'Other' }))
    clearSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-A',
    })
    assert.equal(
      getSiteDiarySessionSnapshot({
        userId: 'user-1',
        projectId: 'proj-1',
        reportId: 'rep-A',
      }),
      null,
    )
    const b = getSiteDiarySessionSnapshot({
      userId: 'user-1',
      projectId: 'proj-1',
      reportId: 'rep-B',
    })
    assert.ok(b)
    assert.equal(b.projectName, 'Other')
  })
})
