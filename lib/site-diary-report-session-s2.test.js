/**
 * Structural S2 — Saved Viewer publishes verified read snapshot into session.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')

/** Mirror provider stale guard (unit-tested without importing .jsx). */
function isStaleReadSnapshotPublication(incomingGeneration, acceptedGeneration) {
  if (typeof incomingGeneration !== 'number' || Number.isNaN(incomingGeneration)) {
    return false
  }
  return incomingGeneration < acceptedGeneration
}

/**
 * Mirrors publishReadSnapshot + registerViewerPublicationLifecycle ordering in
 * lib/site-diary-report-session.jsx (structural S2 lifecycle tests).
 */
function createPublicationSessionSimulator() {
  let projectId = null
  let reportId = null
  let acceptedGeneration = 0
  let authoritativeReportId = null

  const registerViewerPublicationLifecycle = () => {
    acceptedGeneration = 0
  }

  const clearSession = () => {
    projectId = null
    reportId = null
    acceptedGeneration = 0
    authoritativeReportId = null
  }

  const publishReadSnapshot = ({
    projectId: pid,
    reportId: rid,
    generation,
    readSnapshots,
  }) => {
    if (!pid || !rid) return false

    if (
      typeof generation === 'number'
      && isStaleReadSnapshotPublication(generation, acceptedGeneration)
    ) {
      return false
    }
    if (typeof generation === 'number' && generation > acceptedGeneration) {
      acceptedGeneration = generation
    }

    const identityChanged = pid !== projectId || rid !== reportId
    projectId = pid
    reportId = rid
    if (identityChanged) {
      authoritativeReportId = readSnapshots?.report?.reportId ?? rid
    } else {
      authoritativeReportId =
        readSnapshots?.report?.reportId ?? authoritativeReportId
    }
    return true
  }

  const getState = () => ({
    projectId,
    reportId,
    acceptedGeneration,
    authoritativeReportId,
  })

  return {
    registerViewerPublicationLifecycle,
    clearSession,
    publishReadSnapshot,
    getState,
  }
}

function snap(reportId, projectId = 'proj') {
  return {
    readSnapshots: {
      report: { reportId, projectId },
      project: { projectId },
      labour: [],
      plant: [],
      photoMetadata: [],
      coverStoragePath: null,
      signatureStoragePath: null,
      branding: null,
    },
  }
}
const providerPath = join(root, 'lib/site-diary-report-session.jsx')
const viewPagePath = join(
  root,
  'app/dashboard/project/[id]/diary/view/page.jsx',
)
const diaryPagePath = join(
  root,
  'app/dashboard/project/[id]/diary/page.jsx',
)

const providerSrc = readFileSync(providerPath, 'utf8')
const viewPageSrc = readFileSync(viewPagePath, 'utf8')
const diaryPageSrc = readFileSync(diaryPagePath, 'utf8')

describe('Site Diary structural S2 — provider API', () => {
  it('exposes publishReadSnapshot with generation guard', () => {
    assert.match(providerSrc, /publishReadSnapshot/)
    assert.match(providerSrc, /isStaleReadSnapshotPublication/)
    assert.match(providerSrc, /acceptedPublicationGenerationRef/)
    assert.match(providerSrc, /readSnapshotsFromSavedDiaryView/)
    assert.doesNotMatch(providerSrc, /createClient/)
    assert.doesNotMatch(providerSrc, /supabase/)
  })
})

describe('Site Diary structural S2 — snapshot mapper', () => {
  it('maps labour, plant, photo metadata, paths, and branding from viewer view model', () => {
    assert.match(providerSrc, /export function readSnapshotsFromSavedDiaryView/)
    assert.match(providerSrc, /labour: Array\.isArray\(view\.labour\)/)
    assert.match(providerSrc, /plant: Array\.isArray\(view\.plant\)/)
    assert.match(providerSrc, /photoMetadata: photoMetadataWithoutSignedUrls/)
    assert.match(providerSrc, /coverStoragePath: view\.coverPhotoPath/)
    assert.match(providerSrc, /signatureStoragePath: view\.signaturePath/)
    assert.match(providerSrc, /brandingId: seed\.brandingId/)
    assert.match(providerSrc, /photoMetadataWithoutSignedUrls/)
    assert.doesNotMatch(providerSrc, /coverPhotoUrl/)
    assert.doesNotMatch(providerSrc, /signatureUrl/)
    assert.doesNotMatch(providerSrc, /attendanceRegisterPreviewUrl/)
    assert.doesNotMatch(providerSrc, /preview:/)
    assert.doesNotMatch(providerSrc, /thumbnailPreview/)
  })

  it('does not store PDF blobs, object URLs, or autosave/PhotoWorkspace state', () => {
    assert.doesNotMatch(providerSrc, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(providerSrc, /PhotoWorkspace/)
    assert.doesNotMatch(providerSrc, /Blob/)
    assert.doesNotMatch(providerSrc, /object URL/i)
    assert.doesNotMatch(providerSrc, /autosave/)
  })
})

describe('Site Diary structural S2 — stale publication guard', () => {
  it('rejects late report A generation after report B advanced', () => {
    assert.equal(isStaleReadSnapshotPublication(1, 2), true)
    assert.equal(isStaleReadSnapshotPublication(2, 2), false)
    assert.equal(isStaleReadSnapshotPublication(3, 2), false)
  })
})

describe('Site Diary structural S2 — publication lifecycle (provider simulator)', () => {
  it('A gen1 accepted, then B gen2 accepted within one Viewer lifecycle', () => {
    const session = createPublicationSessionSimulator()
    assert.equal(
      session.publishReadSnapshot({
        projectId: 'p1',
        reportId: 'report-A',
        generation: 1,
        ...snap('report-A', 'p1'),
      }),
      true,
    )
    assert.equal(session.getState().authoritativeReportId, 'report-A')
    assert.equal(
      session.publishReadSnapshot({
        projectId: 'p1',
        reportId: 'report-B',
        generation: 2,
        ...snap('report-B', 'p1'),
      }),
      true,
    )
    assert.equal(session.getState().authoritativeReportId, 'report-B')
    assert.equal(session.getState().acceptedGeneration, 2)
  })

  it('late A gen1 rejected while B gen2 remains authoritative (same Viewer)', () => {
    const session = createPublicationSessionSimulator()
    session.publishReadSnapshot({
      projectId: 'p1',
      reportId: 'report-A',
      generation: 1,
      ...snap('report-A', 'p1'),
    })
    session.publishReadSnapshot({
      projectId: 'p1',
      reportId: 'report-B',
      generation: 2,
      ...snap('report-B', 'p1'),
    })
    assert.equal(
      session.publishReadSnapshot({
        projectId: 'p1',
        reportId: 'report-A',
        generation: 1,
        ...snap('report-A', 'p1'),
      }),
      false,
    )
    assert.equal(session.getState().authoritativeReportId, 'report-B')
    assert.equal(session.getState().acceptedGeneration, 2)
  })

  it('remounted Viewer report C gen1 accepted after prior provider gen2', () => {
    const session = createPublicationSessionSimulator()
    session.publishReadSnapshot({
      projectId: 'p1',
      reportId: 'report-A',
      generation: 1,
      ...snap('report-A', 'p1'),
    })
    session.publishReadSnapshot({
      projectId: 'p1',
      reportId: 'report-B',
      generation: 2,
      ...snap('report-B', 'p1'),
    })
    session.registerViewerPublicationLifecycle()
    assert.equal(
      session.publishReadSnapshot({
        projectId: 'p1',
        reportId: 'report-C',
        generation: 1,
        ...snap('report-C', 'p1'),
      }),
      true,
    )
    assert.equal(session.getState().authoritativeReportId, 'report-C')
    assert.equal(session.getState().acceptedGeneration, 1)
  })

  it('clearSession resets identity and accepted generation', () => {
    const session = createPublicationSessionSimulator()
    session.publishReadSnapshot({
      projectId: 'p1',
      reportId: 'report-A',
      generation: 1,
      ...snap('report-A', 'p1'),
    })
    session.clearSession()
    assert.equal(session.getState().projectId, null)
    assert.equal(session.getState().acceptedGeneration, 0)
    assert.equal(
      session.publishReadSnapshot({
        projectId: 'p1',
        reportId: 'report-C',
        generation: 1,
        ...snap('report-C', 'p1'),
      }),
      true,
    )
  })
})

describe('Site Diary structural S2 — cross-lifecycle publication safety', () => {
  it('publishReadSnapshot is only reachable via publishVerifiedViewerSnapshot', () => {
    const stripped = viewPageSrc.replace(/publishVerifiedViewerSnapshot/g, 'PUBLISH_HELPER')
    assert.equal((stripped.match(/publishReadSnapshot/g) || []).length, 0)
    assert.equal(
      (viewPageSrc.match(/publishVerifiedViewerSnapshot\(/g) || []).length,
      2,
    )
  })

  it('primary load awaits hydrate then checks cancelled before publishing', () => {
    const loadStart = viewPageSrc.indexOf('const load = async () =>')
    const loadEnd = viewPageSrc.indexOf(
      '}, [projectId, reportId, publishVerifiedViewerSnapshot])',
    )
    assert.ok(loadStart > 0 && loadEnd > loadStart)
    const block = viewPageSrc.slice(loadStart, loadEnd)
    const awaitIdx = block.indexOf('await loadSavedDiaryView')
    const publishIdx = block.indexOf(
      'publishVerifiedViewerSnapshot(result.view, loadGeneration)',
    )
    assert.ok(awaitIdx > 0 && publishIdx > awaitIdx)
    const cancelledReturnAfterAwait = block.indexOf('if (cancelled) return', awaitIdx)
    assert.ok(
      cancelledReturnAfterAwait > awaitIdx && cancelledReturnAfterAwait < publishIdx,
    )
    assert.match(block, /if \(!cancelled\) \{\r?\n\s*publishVerifiedViewerSnapshot/)
    assert.match(block, /return \(\) => \{[\s\S]*cancelled = true/)
  })

  it('secondary hydrate continuations never publish; applyPatch is cancellation-gated', () => {
    const loadStart = viewPageSrc.indexOf('const load = async () =>')
    const loadEnd = viewPageSrc.indexOf(
      '}, [projectId, reportId, publishVerifiedViewerSnapshot])',
    )
    const block = viewPageSrc.slice(loadStart, loadEnd)
    assert.match(block, /if \(!cancelled && patch\)/)
    assert.doesNotMatch(
      block,
      /secondary\.run\([\s\S]{0,1200}publishVerifiedViewerSnapshot/,
    )
    assert.doesNotMatch(
      block,
      /hydrate\.run\([\s\S]{0,800}publishVerifiedViewerSnapshot/,
    )
  })

  it('lifecycle reset effect is declared before load and secondary publish effects', () => {
    const lifecycleIdx = viewPageSrc.indexOf('registerViewerPublicationLifecycle()')
    const loadCancelledIdx = viewPageSrc.indexOf('let cancelled = false')
    const primaryPublishIdx = viewPageSrc.indexOf(
      'publishVerifiedViewerSnapshot(result.view, loadGeneration)',
    )
    const secondaryPublishIdx = viewPageSrc.indexOf(
      'publishVerifiedViewerSnapshot(view, viewerPublishGenerationRef.current)',
    )
    assert.ok(lifecycleIdx > 0)
    assert.ok(lifecycleIdx < loadCancelledIdx)
    assert.ok(loadCancelledIdx < primaryPublishIdx)
    assert.ok(primaryPublishIdx < secondaryPublishIdx)
    const lifecycleEffectIdx = viewPageSrc.lastIndexOf(
      'useEffect(() => {',
      lifecycleIdx,
    )
    const loadEffectIdx = viewPageSrc.lastIndexOf('useEffect(() => {', loadCancelledIdx)
    assert.ok(lifecycleEffectIdx > 0 && loadEffectIdx > lifecycleEffectIdx)
  })

  it('unmounted Viewer load closure cannot publish after cleanup (late completion model)', () => {
    let cancelled = false
    const publishes = []
    const publishVerifiedViewerSnapshot = () => {
      if (!cancelled) publishes.push('publish')
    }
    const completeLoadAfterAwait = () => {
      if (cancelled) return
      publishVerifiedViewerSnapshot()
    }
    completeLoadAfterAwait()
    assert.deepEqual(publishes, ['publish'])
    cancelled = true
    completeLoadAfterAwait()
    assert.deepEqual(publishes, ['publish'])
  })
})

describe('Site Diary structural S2 — viewer remount wiring', () => {
  it('registers viewer publication lifecycle on mount', () => {
    assert.match(providerSrc, /registerViewerPublicationLifecycle/)
    assert.match(viewPageSrc, /registerViewerPublicationLifecycle/)
    assert.match(
      viewPageSrc,
      /useEffect\(\(\) => \{\s*registerViewerPublicationLifecycle\(\)/,
    )
  })

  it('publishReadSnapshot applies generation guard before identity merge', () => {
    const fnStart = providerSrc.indexOf('const publishReadSnapshot = useCallback')
    assert.ok(fnStart > 0)
    const block = providerSrc.slice(fnStart, fnStart + 2200)
    const staleAt = block.indexOf('isStaleReadSnapshotPublication')
    const acceptedBumpAt = block.indexOf('acceptedPublicationGenerationRef.current = generation')
    const identityAt = block.indexOf('const identityChanged')
    assert.ok(staleAt > 0 && acceptedBumpAt > staleAt && identityAt > acceptedBumpAt)
  })
})

describe('Site Diary structural S2 — viewer publication wiring', () => {
  it('consumes session provider and publishes after verified hydrate', () => {
    assert.match(viewPageSrc, /useSiteDiaryReportSession/)
    assert.match(viewPageSrc, /publishReadSnapshot/)
    assert.match(viewPageSrc, /readSnapshotsFromSavedDiaryView/)
    assert.match(viewPageSrc, /viewerPublishGenerationRef/)
    assert.match(viewPageSrc, /publishVerifiedViewerSnapshot/)
    assert.match(viewPageSrc, /result\.ok/)
    assert.match(viewPageSrc, /publishVerifiedViewerSnapshot\(result\.view, loadGeneration\)/)
    assert.match(viewPageSrc, /view\?\.secondaryReady/)
    assert.doesNotMatch(viewPageSrc, /from\('daily_reports'\)/)
    assert.doesNotMatch(viewPageSrc, /from\('report_labour'\)/)
    assert.doesNotMatch(viewPageSrc, /from\('report_plant'\)/)
    assert.doesNotMatch(viewPageSrc, /from\('report_photos'\)/)
  })

  it('preserves Edit routing and acknowledgement', () => {
    assert.match(viewPageSrc, /editExistingDiaryHref/)
    assert.match(viewPageSrc, /router\.push\(editHref\)/)
    assert.match(viewPageSrc, /Opening diary for editing…/)
  })
})

describe('Site Diary structural S2 — workbench untouched', () => {
  it('workbench does not consume session snapshot yet', () => {
    assert.doesNotMatch(diaryPageSrc, /useSiteDiaryReportSession/)
    assert.doesNotMatch(diaryPageSrc, /publishReadSnapshot/)
    assert.doesNotMatch(diaryPageSrc, /readSnapshotsFromSavedDiaryView/)
  })
})
