/**
 * Cover PDF source diagnostic counters (prepared-cover fast path).
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  startShareTimingRun,
  patchShareTimingCounts,
  formatShareTimingLines,
  getShareTimingSnapshot,
} from './diary-share-timing-diag.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coverPhotoSrc = readFileSync(join(root, 'lib/diary-cover-photo.js'), 'utf8')

describe('cover PDF source diagnostic counters', () => {
  beforeEach(() => {
    startShareTimingRun({ reportId: 'cover-diag-1', fromPdfCache: false })
  })

  it('formats local pass-through counters', () => {
    patchShareTimingCounts({
      coverPreparedSource: 'local',
      coverNetworkFetchCount: 0,
      coverOrientationBakeCount: 0,
      coverPassThroughCount: 1,
    })
    const lines = formatShareTimingLines(getShareTimingSnapshot())
    assert.ok(lines.some((line) => line === 'coverPreparedSource local'))
    assert.ok(lines.some((line) => line === 'coverNetworkFetchCount 0'))
    assert.ok(lines.some((line) => line === 'coverOrientationBakeCount 0'))
    assert.ok(lines.some((line) => line === 'coverPassThroughCount 1'))
  })

  it('formats reopened prepared cover as network fetch with zero bake', () => {
    patchShareTimingCounts({
      coverPreparedSource: 'network',
      coverNetworkFetchCount: 1,
      coverOrientationBakeCount: 0,
      coverPassThroughCount: 1,
    })
    const lines = formatShareTimingLines(getShareTimingSnapshot())
    assert.ok(lines.some((line) => line === 'coverPreparedSource network'))
    assert.ok(lines.some((line) => line === 'coverNetworkFetchCount 1'))
    assert.ok(lines.some((line) => line === 'coverOrientationBakeCount 0'))
    assert.ok(lines.some((line) => line === 'coverPassThroughCount 1'))
  })

  it('formats legacy bake as orientation bake with no pass-through', () => {
    patchShareTimingCounts({
      coverPreparedSource: 'legacy',
      coverNetworkFetchCount: 0,
      coverOrientationBakeCount: 1,
      coverPassThroughCount: 0,
    })
    const lines = formatShareTimingLines(getShareTimingSnapshot())
    assert.ok(lines.some((line) => line === 'coverPreparedSource legacy'))
    assert.ok(lines.some((line) => line === 'coverNetworkFetchCount 0'))
    assert.ok(lines.some((line) => line === 'coverOrientationBakeCount 1'))
    assert.ok(lines.some((line) => line === 'coverPassThroughCount 0'))
  })

  it('cover persist/PDF path writes the four cover diagnostic counters', () => {
    assert.match(coverPhotoSrc, /coverPreparedSource: 'local'/)
    assert.match(coverPhotoSrc, /coverPreparedSource: 'network'/)
    assert.match(coverPhotoSrc, /coverPreparedSource: 'legacy'/)
    assert.match(coverPhotoSrc, /coverNetworkFetchCount/)
    assert.match(coverPhotoSrc, /coverOrientationBakeCount/)
    assert.match(coverPhotoSrc, /coverPassThroughCount/)
    assert.doesNotMatch(coverPhotoSrc, /conc=6/)
  })
})
