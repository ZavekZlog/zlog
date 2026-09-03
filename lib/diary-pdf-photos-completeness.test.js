/**
 * PDF photo completeness safety gate — silent omission must be impossible.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDiaryPdfPhotosComplete,
  buildDiaryPdfPhotos,
  DiaryPdfPhotosIncompleteError,
  DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE,
  diaryPdfPhotoIdentity,
  isUsableDiaryPdfPhotoSrc,
} from './diary-pdf-photos.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photosSrc = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')

describe('PDF photo completeness safety gate', () => {
  it('source: never silently filters unresolved photos; throws incomplete error', () => {
    assert.match(photosSrc, /assertDiaryPdfPhotosComplete/)
    assert.match(photosSrc, /DiaryPdfPhotosIncompleteError/)
    assert.match(photosSrc, /DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE/)
    assert.doesNotMatch(photosSrc, /\.filter\(\s*\(\s*Boolean\s*\)\s*\)/)
    assert.doesNotMatch(photosSrc, /filter\(\(p\)\s*=>\s*p\)/)
    assert.match(shareSrc, /pdf-photos-incomplete/)
    assert.match(shareSrc, /emitShareDiag\('pdf-photos-incomplete'/)
  })

  it('isUsableDiaryPdfPhotoSrc rejects null/empty/unsupported', () => {
    assert.equal(isUsableDiaryPdfPhotoSrc(null), false)
    assert.equal(isUsableDiaryPdfPhotoSrc(''), false)
    assert.equal(isUsableDiaryPdfPhotoSrc('   '), false)
    assert.equal(isUsableDiaryPdfPhotoSrc('not-a-url'), false)
    assert.equal(isUsableDiaryPdfPhotoSrc('https://example.test/a.jpg'), true)
    assert.equal(isUsableDiaryPdfPhotoSrc('data:image/jpeg;base64,abc'), true)
  })

  it('all expected photos present → PDF preparation may complete', async () => {
    const expected = [
      { url: 'path/a.jpg', caption: 'A', layout: 'grid4', sequence: 1 },
      { url: 'path/b.jpg', caption: 'B', layout: 'grid4', sequence: 2 },
      { url: 'path/c.jpg', caption: 'C', layout: 'grid4', sequence: 3 },
    ]
    const rows = await buildDiaryPdfPhotos(expected, async (photo) => `https://example.test/${photo.url}`)
    assert.equal(rows.length, 3)
    assert.equal(rows[0].url, 'path/a.jpg')
    assert.equal(rows[1].url, 'path/b.jpg')
    assert.equal(rows[2].url, 'path/c.jpg')
    const gate = assertDiaryPdfPhotosComplete({ expected, prepared: rows })
    assert.equal(gate.ok, true)
    assert.equal(gate.failures.length, 0)
  })

  it('one expected photo skipped (null resolveSrc) → Report Ready blocked', async () => {
    const expected = [
      { url: 'path/a.jpg', sequence: 1 },
      { url: 'path/b.jpg', sequence: 2 },
      { url: 'path/c.jpg', sequence: 3 },
    ]
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(expected, async (photo) =>
          photo.url === 'path/b.jpg' ? null : `https://example.test/${photo.url}`,
        ),
      (err) => {
        assert.ok(err instanceof DiaryPdfPhotosIncompleteError)
        assert.equal(err.message, DIARY_PDF_PHOTOS_INCOMPLETE_MESSAGE)
        assert.equal(err.gate.ok, false)
        const fail = err.gate.failures.find((f) => f.photoId === 'path/b.jpg' || f.index === 1)
        assert.ok(fail, 'failure must identify skipped photo')
        assert.match(String(fail.reason), /unusable-photo-source|photo-skipped/)
        return true
      },
    )
  })

  it('null/unusable photo source → Report Ready blocked', async () => {
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(
          [{ url: 'missing.jpg', sequence: 1 }],
          async () => null,
        ),
      (err) => {
        assert.ok(err instanceof DiaryPdfPhotosIncompleteError)
        assert.equal(err.gate.ok, false)
        assert.ok(err.gate.failures.some((f) => f.reason === 'unusable-photo-source'))
        return true
      },
    )
  })

  it('duplicate prepared photo cannot compensate for a missing expected photo', () => {
    const expected = [
      { url: 'path/a.jpg' },
      { url: 'path/b.jpg' },
      { url: 'path/c.jpg' },
    ]
    // Prepared has duplicate of A and omits B — count could look close but identities differ.
    const prepared = [
      { url: 'path/a.jpg', src: 'https://example.test/a.jpg', key: 'path/a.jpg' },
      { url: 'path/a.jpg', src: 'https://example.test/a.jpg', key: 'path/a.jpg' },
      { url: 'path/c.jpg', src: 'https://example.test/c.jpg', key: 'path/c.jpg' },
    ]
    const gate = assertDiaryPdfPhotosComplete({ expected, prepared })
    assert.equal(gate.ok, false)
    assert.ok(
      gate.failures.some(
        (f) =>
          f.reason === 'identity-mismatch'
          || f.reason === 'identity-set-mismatch'
          || f.photoId === 'path/b.jpg',
      ),
      `expected identity failure, got ${JSON.stringify(gate.failures)}`,
    )
    // Count-only would see 3 prepared vs 3 expected — identity gate must still fail.
    assert.equal(prepared.length, expected.length)
  })

  it('ordering remains unchanged when all photos are valid', async () => {
    const expected = [
      { url: 'z.jpg', caption: 'Third', sequence: 1 },
      { url: 'a.jpg', caption: 'First', sequence: 2 },
      { url: 'm.jpg', caption: 'Second', sequence: 3 },
    ]
    const rows = await buildDiaryPdfPhotos(expected, async (photo) => `https://example.test/${photo.url}`)
    assert.deepEqual(
      rows.map((r) => diaryPdfPhotoIdentity(r)),
      ['z.jpg', 'a.jpg', 'm.jpg'],
    )
    assert.deepEqual(
      rows.map((r) => r.caption),
      ['Third', 'First', 'Second'],
    )
  })

  it('batch-signed photos still fail closed when one source is missing', async () => {
    const expected = [
      { url: 'path/a.jpg', sequence: 1 },
      { url: 'path/b.jpg', sequence: 2 },
      { url: 'path/c.jpg', sequence: 3 },
    ]
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(
          expected,
          async (photo) => (photo.url === 'path/b.jpg' ? null : `https://fallback/${photo.url}`),
          {
            batchSignStoragePaths: async (paths) => ({
              urlByPath: new Map(
                paths
                  .filter((path) => path !== 'path/b.jpg')
                  .map((path) => [path, `https://signed.example/${path}`]),
              ),
              batchRequestCount: 1,
            }),
          },
        ),
      (err) => {
        assert.ok(err instanceof DiaryPdfPhotosIncompleteError)
        assert.ok(err.gate.failures.some((f) => f.photoId === 'path/b.jpg' || f.index === 1))
        return true
      },
    )
  })

  it('local Blob for one photo cannot satisfy a missing neighbour', async () => {
    const expected = [
      { url: 'path/a.jpg', sequence: 1, caption: 'A' },
      { url: 'path/b.jpg', sequence: 2, caption: 'B' },
    ]
    await assert.rejects(
      () =>
        buildDiaryPdfPhotos(
          expected,
          async () => null,
          {
            localPreparedPhotoSources: new Map([
              ['path/a.jpg', new Blob(['A'], { type: 'image/jpeg' })],
            ]),
          },
        ),
      (err) => {
        assert.ok(err instanceof DiaryPdfPhotosIncompleteError)
        assert.ok(err.gate.failures.some((f) => f.photoId === 'path/b.jpg' || f.index === 1))
        return true
      },
    )
  })
})
