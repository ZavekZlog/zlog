/**
 * Site Diary work/progress PDF photo pipeline — shared browser-display flatten.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const photosSrc = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')
const shareSrc = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const orientSrc = readFileSync(join(root, 'lib/image-orientation.js'), 'utf8')

describe('PDF work photos — shared browser-display flatten', () => {
  it('buildDiaryPdfPhotos uses orientedImageToDataUrlForPdf before UI rotation', () => {
    assert.match(photosSrc, /orientedImageToDataUrlForPdf/)
    assert.match(photosSrc, /flattenPhotoSrcForPdf/)
    assert.match(photosSrc, /applyRotationToImageSrc/)
    const flattenIdx = photosSrc.indexOf('flattenPhotoSrcForPdf')
    const rotationIdx = photosSrc.indexOf('applyRotationToImageSrc(src, rotationDegrees)')
    assert.ok(flattenIdx > 0 && rotationIdx > flattenIdx, 'EXIF flatten must run before UI rotation')
    assert.doesNotMatch(photosSrc, /drawOriented/)
    assert.doesNotMatch(photosSrc, /rotate-90/)
    assert.doesNotMatch(photosSrc, /zlog-pdf-trace/)
  })

  it('cover and work photos share the same flatten helper', () => {
    assert.match(orientSrc, /export const PDF_PHOTO_PIPELINE_ID = 'browser-display-inline-v3'/)
    assert.match(shareSrc, /orientedImageToDataUrlForPdf/)
    assert.match(shareSrc, /export async function uprightCoverSrcForPdf/)
    assert.match(photosSrc, /from '\.\/image-orientation\.js'/)
  })

  it('skips browser flatten in Node tests (document undefined guard)', () => {
    assert.match(photosSrc, /typeof document !== 'undefined'/)
  })
})
