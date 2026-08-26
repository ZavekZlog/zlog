/**
 * Phase B — shadow-mode ingest integration tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SHADOW_INGEST_CONCURRENCY,
  SHADOW_PREPARE_STATUS,
  isEligibleForShadowPrepare,
  withShadowPreparePending,
  buildShadowPrepareReady,
  buildShadowPrepareFailed,
  applyShadowPrepareToPhotos,
  collectShadowPrepareJobs,
  runShadowPrepareJobs,
  findPhotoShadowTarget,
  shouldAcceptShadowPrepareResult,
  resolveShadowPrepareIntoState,
} from './shadow-ingest.js'
import {
  ZLOG_REPORT_MAX_EDGE,
  ZLOG_THUMB_MAX_EDGE,
  ZLOG_PHOTO_MIME,
  computeContainDimensions,
} from './image-pipeline.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const walkSrc = readFileSync(join(root, 'components/ai-annotation/AiLocationWalk.jsx'), 'utf8')
const shadowSrc = readFileSync(join(root, 'lib/photo-workspace/shadow-ingest.js'), 'utf8')

function makeLocalPhoto(id, overrides = {}) {
  return {
    id,
    file: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    preview: `blob:local-${id}`,
    imageUrl: null,
    storagePath: null,
    ...overrides,
  }
}

function mockPrepared(overrides = {}) {
  return {
    pipelineId: 'zlog-photo-pipeline-v1',
    report: {
      blob: new Blob(['report']),
      width: 2400,
      height: 1800,
      byteSize: 6,
      mimeType: ZLOG_PHOTO_MIME,
    },
    thumbnail: {
      blob: new Blob(['thumb']),
      width: 512,
      height: 384,
      byteSize: 5,
      mimeType: ZLOG_PHOTO_MIME,
    },
    orientation: { sourceExif: 1, decodeMode: 'mock', usedBrowserOrientation: true },
    ...overrides,
  }
}

describe('shadow eligibility', () => {
  it('accepts newly selected local Files only', () => {
    assert.equal(isEligibleForShadowPrepare(makeLocalPhoto('a')), true)
  })

  it('rejects saved/persisted photos (imageUrl / storagePath)', () => {
    assert.equal(
      isEligibleForShadowPrepare(makeLocalPhoto('b', { imageUrl: 'user/r/1.jpg', file: null })),
      false,
    )
    assert.equal(
      isEligibleForShadowPrepare(makeLocalPhoto('c', { storagePath: 'user/r/1.jpg' })),
      false,
    )
  })

  it('rejects photos already pending/ready/failed', () => {
    assert.equal(
      isEligibleForShadowPrepare(makeLocalPhoto('d', {
        shadowPrepare: { status: SHADOW_PREPARE_STATUS.PENDING },
      })),
      false,
    )
    assert.equal(
      isEligibleForShadowPrepare(makeLocalPhoto('e', {
        shadowPrepare: { status: SHADOW_PREPARE_STATUS.READY },
      })),
      false,
    )
  })

  it('rejects ids already in the started set (rerender / Strict Mode dedupe)', () => {
    const started = new Set(['dup'])
    assert.equal(isEligibleForShadowPrepare(makeLocalPhoto('dup'), started), false)
  })
})

describe('shadow pending + apply preserve live fields', () => {
  it('withShadowPreparePending keeps file and preview', () => {
    const file = new Blob(['x'], { type: 'image/jpeg' })
    const photo = makeLocalPhoto('p1', { file, preview: 'blob:keep' })
    const pending = withShadowPreparePending(photo)
    assert.equal(pending.file, file)
    assert.equal(pending.preview, 'blob:keep')
    assert.equal(pending.shadowPrepare.status, SHADOW_PREPARE_STATUS.PENDING)
  })

  it('applyShadowPrepareToPhotos does not replace file/preview/imageUrl', () => {
    const file = new Blob(['y'], { type: 'image/jpeg' })
    const photos = [makeLocalPhoto('p1', { file, preview: 'blob:live', imageUrl: null })]
    const ready = buildShadowPrepareReady(mockPrepared(), 12)
    const next = applyShadowPrepareToPhotos(photos, 'p1', ready)
    assert.equal(next[0].file, file)
    assert.equal(next[0].preview, 'blob:live')
    assert.equal(next[0].imageUrl, null)
    assert.equal(next[0].shadowPrepare.status, SHADOW_PREPARE_STATUS.READY)
    assert.ok(next[0].shadowPrepare.report.blob instanceof Blob)
    assert.ok(next[0].shadowPrepare.thumbnail.width <= ZLOG_THUMB_MAX_EDGE)
  })
})

describe('collectShadowPrepareJobs — new files only + dedupe', () => {
  it('collects new local files and marks startedIds', () => {
    const started = new Set()
    const photos = [
      withShadowPreparePending(makeLocalPhoto('n1')),
      makeLocalPhoto('saved', { file: null, imageUrl: 'path/x.jpg' }),
    ]
    const jobs = collectShadowPrepareJobs(photos, started)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].id, 'n1')
    assert.ok(started.has('n1'))
  })

  it('does not collect the same id twice', () => {
    const started = new Set()
    const photos = [withShadowPreparePending(makeLocalPhoto('n1'))]
    assert.equal(collectShadowPrepareJobs(photos, started).length, 1)
    assert.equal(collectShadowPrepareJobs(photos, started).length, 0)
  })
})

describe('runShadowPrepareJobs — concurrency + failure isolation', () => {
  it('uses bounded concurrency of 2', () => {
    assert.equal(SHADOW_INGEST_CONCURRENCY, 2)
    assert.match(shadowSrc, /SHADOW_INGEST_CONCURRENCY = 2/)
    assert.match(shadowSrc, /mapWithConcurrency/)
  })

  it('attaches ready metadata without mutating the input File', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const results = []
    let active = 0
    let maxActive = 0
    await runShadowPrepareJobs(
      [{ id: 'a', file }, { id: 'b', file }, { id: 'c', file }],
      {
        concurrency: 2,
        prepareFn: async (src) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await new Promise((r) => setTimeout(r, 8))
          active -= 1
          assert.equal(src, file)
          return mockPrepared()
        },
        onResult: (id, shadow) => results.push({ id, shadow }),
      },
    )
    assert.equal(results.length, 3)
    assert.ok(maxActive <= 2)
    assert.ok(results.every((r) => r.shadow.status === SHADOW_PREPARE_STATUS.READY))
    assert.ok(results.every((r) => r.shadow.report.width === 2400))
    assert.ok(results.every((r) => r.shadow.thumbnail.width === 512))
  })

  it('isolates a single prepare failure without failing the batch', async () => {
    const file = new Blob(['x'], { type: 'image/jpeg' })
    const results = []
    let n = 0
    await runShadowPrepareJobs(
      [{ id: 'ok', file }, { id: 'bad', file }, { id: 'ok2', file }],
      {
        concurrency: 2,
        prepareFn: async () => {
          n += 1
          if (n === 2) throw Object.assign(new Error('boom'), { code: 'decode-failed' })
          return mockPrepared({
            report: {
              blob: new Blob(['r']), width: 100, height: 80, byteSize: 1, mimeType: ZLOG_PHOTO_MIME,
            },
            thumbnail: {
              blob: new Blob(['t']), width: 50, height: 40, byteSize: 1, mimeType: ZLOG_PHOTO_MIME,
            },
          })
        },
        onResult: (id, shadow) => results.push({ id, shadow }),
      },
    )
    assert.equal(results.length, 3)
    const failed = results.find((r) => r.id === 'bad')
    const okOnes = results.filter((r) => r.id !== 'bad')
    assert.equal(failed.shadow.status, SHADOW_PREPARE_STATUS.FAILED)
    assert.ok(okOnes.every((r) => r.shadow.status === SHADOW_PREPARE_STATUS.READY))
  })

  it('buildShadowPrepareFailed records controlled failure metadata', () => {
    const failed = buildShadowPrepareFailed(
      Object.assign(new Error('nope'), { code: 'decode-failed' }),
      9,
    )
    assert.equal(failed.status, SHADOW_PREPARE_STATUS.FAILED)
    assert.equal(failed.code, 'decode-failed')
    assert.equal(failed.durationMs, 9)
  })
})

describe('size contract helpers still enforce no-crop caps', () => {
  it('report long edge <= 2400 and thumb <= 512 with aspect preserved', () => {
    const report = computeContainDimensions(4000, 3000, ZLOG_REPORT_MAX_EDGE)
    const thumb = computeContainDimensions(4000, 3000, ZLOG_THUMB_MAX_EDGE)
    assert.equal(Math.max(report.width, report.height), 2400)
    assert.equal(Math.max(thumb.width, thumb.height), 512)
    assert.ok(Math.abs(report.width / report.height - 4000 / 3000) < 0.001)
    assert.ok(Math.abs(thumb.width / thumb.height - 4000 / 3000) < 0.001)
  })
})

describe('AiLocationWalk Phase B wiring (source contract)', () => {
  it('imports shadow-ingest helpers', () => {
    assert.match(walkSrc, /from '@\/lib\/photo-workspace\/shadow-ingest'/)
    assert.match(walkSrc, /collectShadowPrepareJobs/)
    assert.match(walkSrc, /runShadowPrepareJobs/)
    assert.match(walkSrc, /withShadowPreparePending/)
    assert.match(walkSrc, /findPhotoShadowTarget/)
    assert.match(walkSrc, /applyShadowPrepareResult/)
  })

  it('runs shadow prepare after live preview append — does not await before setCapturing(false)', () => {
    const handleIdx = walkSrc.indexOf('const handleFiles')
    const block = walkSrc.slice(handleIdx, handleIdx + 2200)
    assert.match(block, /withShadowPreparePending/)
    assert.match(block, /setCapturing\(false\)/)
    assert.match(block, /void runShadowPrepareJobs/)
    const capturingOff = block.indexOf('setCapturing(false)')
    const runIdx = block.indexOf('runShadowPrepareJobs')
    assert.ok(capturingOff >= 0 && runIdx > capturingOff)
  })

  it('resolves late results by photo id — not a stale draft container', () => {
    const handleIdx = walkSrc.indexOf('const handleFiles')
    const block = walkSrc.slice(handleIdx, handleIdx + 2200)
    assert.match(block, /applyShadowPrepareResult\(photoId, shadowPrepare\)/)
    assert.doesNotMatch(block, /patchPhoto\(targetId, photoId, \{ shadowPrepare \}\)/)
    assert.match(walkSrc, /Prefer committed locationWalk over draft/)
    assert.doesNotMatch(block, /preview:\s*shadowPrepare/)
    assert.doesNotMatch(block, /file:\s*shadowPrepare/)
    assert.doesNotMatch(block, /imageUrl:\s*shadowPrepare/)
  })

  it('does not upload derivatives or touch PDF/share paths in handleFiles', () => {
    const handleIdx = walkSrc.indexOf('const handleFiles')
    const block = walkSrc.slice(handleIdx, handleIdx + 2200)
    assert.doesNotMatch(block, /storage\.from/)
    assert.doesNotMatch(block, /prepareDiaryPdf|buildDiaryPdf|shareDiary/)
    assert.doesNotMatch(block, /\.upload\(/)
  })
})

describe('shadow result follows committed photo (hygiene)', () => {
  function readyAt(completedAt, width = 2400) {
    return buildShadowPrepareReady(mockPrepared({
      report: {
        blob: new Blob(['r']), width, height: 1800, byteSize: 1, mimeType: ZLOG_PHOTO_MIME,
      },
    }), 5, completedAt)
  }

  it('shadow completes while photo is still draft → attaches to draft', () => {
    const photo = withShadowPreparePending(makeLocalPhoto('p1'))
    const result = resolveShadowPrepareIntoState({
      photoId: 'p1',
      shadowPrepare: readyAt(100),
      draftPhotos: [photo],
      locationWalk: [],
    })
    assert.equal(result.found, true)
    assert.equal(result.target.container, 'draft')
    assert.equal(result.draftPhotos[0].shadowPrepare.status, SHADOW_PREPARE_STATUS.READY)
    assert.equal(result.draftPhotos[0].file, photo.file)
    assert.equal(result.draftPhotos[0].preview, photo.preview)
  })

  it('Save Area first, then shadow completes → attaches to committed photo', () => {
    const photo = withShadowPreparePending(makeLocalPhoto('p1'))
    const committed = {
      id: 'area-1',
      areaName: 'Lobby',
      photos: [photo],
    }
    const result = resolveShadowPrepareIntoState({
      photoId: 'p1',
      shadowPrepare: readyAt(200),
      draftPhotos: [],
      locationWalk: [committed],
    })
    assert.equal(result.found, true)
    assert.equal(result.target.container, 'group')
    assert.equal(result.target.groupId, 'area-1')
    assert.equal(result.locationWalk[0].photos[0].shadowPrepare.status, SHADOW_PREPARE_STATUS.READY)
    assert.equal(result.draftPhotos.length, 0)
    assert.equal(result.locationWalk[0].photos[0].preview, 'blob:local-p1')
  })

  it('prefers committed walk when photo exists there even if draft still holds a copy', () => {
    const photo = withShadowPreparePending(makeLocalPhoto('p1'))
    const result = resolveShadowPrepareIntoState({
      photoId: 'p1',
      shadowPrepare: readyAt(300),
      draftPhotos: [photo],
      locationWalk: [{ id: 'area-1', areaName: 'Lobby', photos: [{ ...photo }] }],
    })
    assert.equal(result.found, true)
    assert.equal(result.target.container, 'group')
    assert.equal(result.locationWalk[0].photos[0].shadowPrepare.status, SHADOW_PREPARE_STATUS.READY)
    assert.equal(result.draftPhotos[0].shadowPrepare.status, SHADOW_PREPARE_STATUS.PENDING)
  })

  it('late result for deleted photo is ignored — no recreate', () => {
    const result = resolveShadowPrepareIntoState({
      photoId: 'gone',
      shadowPrepare: readyAt(100),
      draftPhotos: [],
      locationWalk: [{ id: 'area-1', areaName: 'X', photos: [] }],
    })
    assert.equal(result.found, false)
    assert.equal(result.locationWalk[0].photos.length, 0)
    assert.equal(result.draftPhotos.length, 0)
  })

  it('late result does not recreate a deleted draft/group photo', () => {
    assert.equal(
      findPhotoShadowTarget('missing', { draftPhotos: [], locationWalk: [] }),
      null,
    )
  })

  it('multiple photos retain correct shadow result ownership', () => {
    const a = withShadowPreparePending(makeLocalPhoto('a'))
    const b = withShadowPreparePending(makeLocalPhoto('b'))
    const afterA = resolveShadowPrepareIntoState({
      photoId: 'a',
      shadowPrepare: readyAt(10, 2400),
      draftPhotos: [a, b],
      locationWalk: [],
    })
    const afterB = resolveShadowPrepareIntoState({
      photoId: 'b',
      shadowPrepare: readyAt(11, 1200),
      draftPhotos: afterA.draftPhotos,
      locationWalk: [],
    })
    assert.equal(afterB.draftPhotos[0].shadowPrepare.report.width, 2400)
    assert.equal(afterB.draftPhotos[1].shadowPrepare.report.width, 1200)
  })

  it('out-of-order completions do not swap metadata between photos or clobber newer', () => {
    const photo = withShadowPreparePending(makeLocalPhoto('p1'))
    const older = readyAt(100, 800)
    const newer = readyAt(200, 2400)
    const mid = applyShadowPrepareToPhotos([photo], 'p1', newer)
    const lateOlder = applyShadowPrepareToPhotos(mid, 'p1', older)
    assert.equal(lateOlder[0].shadowPrepare.report.width, 2400)
    assert.equal(shouldAcceptShadowPrepareResult(newer, older), false)
    assert.equal(shouldAcceptShadowPrepareResult(older, newer), true)
  })

  it('resolveShadowPrepareIntoState never calls upload/persistence APIs', () => {
    assert.doesNotMatch(shadowSrc, /storage\.from|\.upload\(|finalizeSiteDiarySave/)
  })
})

describe('findPhotoShadowTarget', () => {
  it('finds draft before needing a group', () => {
    const target = findPhotoShadowTarget('p1', {
      draftPhotos: [makeLocalPhoto('p1')],
      locationWalk: [],
    })
    assert.deepEqual(target, { container: 'draft', groupId: '__draft__' })
  })

  it('finds committed group by photo id', () => {
    const target = findPhotoShadowTarget('p1', {
      draftPhotos: [],
      locationWalk: [{ id: 'g1', photos: [makeLocalPhoto('p1')] }],
    })
    assert.deepEqual(target, { container: 'group', groupId: 'g1' })
  })
})
