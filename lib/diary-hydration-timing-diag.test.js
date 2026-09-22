import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  beginDiaryHydrationTiming,
  countPipelinePhotos,
  DIARY_HYDRATION_STAGE,
  diaryHydrationSigningSummary,
  endDiaryHydrationTiming,
  getActiveDiaryHydrationTimingSession,
} from './diary-hydration-timing-diag.js'

const root = join(import.meta.dirname, '..')

describe('diary hydration timing diagnostics', () => {
  it('exposes H0–H12 stage ids for S10 load tracing', () => {
    assert.equal(DIARY_HYDRATION_STAGE.H0, 'H0-load-start')
    assert.equal(DIARY_HYDRATION_STAGE.H12, 'H12-hydration-interactive-complete')
  })

  it('tracks one active session and signing pass counts', () => {
    endDiaryHydrationTiming('test-reset')
    const session = beginDiaryHydrationTiming({
      surface: 'test',
      reportId: 'r1',
      projectId: 'p1',
    })
    assert.equal(getActiveDiaryHydrationTimingSession()?.id, session.id)
    session.notePhotoSigningStart({ photoRows: 2 })
    session.notePhotoSigningComplete(diaryHydrationSigningSummary({
      collected: { totalPhotoRows: 2, thumbPathCount: 2, legacyPathCount: 0, paths: ['a', 'b'] },
      stats: { batchApiCalls: 1, singleApiCalls: 0 },
      durationMs: 12,
    }))
    session.noteWorkPhotoExpected(2)
    session.noteWorkPhotoImageLoaded({ visibleIndex: 0 })
    session.noteWorkPhotoImageLoaded({ visibleIndex: 1 })
    endDiaryHydrationTiming('test-done')
    assert.equal(getActiveDiaryHydrationTimingSession(), null)
  })

  it('counts pipeline-v1 vs legacy photo rows', () => {
    const counts = countPipelinePhotos([
      { thumbnail_path: 'x/thumb.jpg', url: 'x/report.jpg' },
      { url: 'legacy.jpg' },
    ])
    assert.equal(counts.totalPhotoRows, 2)
    assert.equal(counts.pipelineV1Count, 1)
    assert.equal(counts.legacyCount, 1)
  })

  it('workbench load wires hydration timing without touching Save & Share', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    assert.match(page, /beginDiaryHydrationTiming/)
    assert.match(page, /DIARY_HYDRATION_STAGE\.H1/)
    assert.match(page, /commitPhotoSourcesToUi/)
    const shareBlock = page.slice(page.indexOf('const sharePreparedFile'))
    assert.doesNotMatch(shareBlock, /beginDiaryHydrationTiming/)
    assert.match(page, /runSiteDiaryPdfExportToShareReadyArtifact/)
    assert.match(page, /runBackgroundPdfPrepare/)
  })

  it('signSavedPhotoGridRows emits H3/H4 when a hydration session is active', () => {
    const src = readFileSync(
      join(root, 'lib/photo-workspace/thumbnail-display.js'),
      'utf8',
    )
    assert.match(src, /notePhotoSigningStart/)
    assert.match(src, /notePhotoSigningComplete/)
    assert.match(src, /diaryHydrationSigningSummary/)
  })
})
