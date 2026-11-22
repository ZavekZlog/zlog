import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AREA_TAG_INSET,
  AREA_TAG_SIZE,
  FRAME_ROTATION_DEGREES,
  PORTRAIT_FRAME_RATIO,
  ROTATION_BADGE_INSET,
  ROTATION_BADGE_SIZE,
  frameMarkScale,
  frameMarksForImage,
  photoFrameTag,
  photoNeedsFrameRotation,
  scaledFrameMark,
  SPEC_FRAME_W,
} from './pdf-photo-frame-rotation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfDocument = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')

describe('issued PDF photo rotation', () => {
  it('rotates a landscape that is not already a 3:4 portrait', () => {
    assert.equal(photoNeedsFrameRotation(1600, 1200), true)
    assert.equal(photoNeedsFrameRotation(1200, 1600), false)
    assert.equal(photoNeedsFrameRotation(402, 1008), false)
    assert.equal(photoNeedsFrameRotation(1000, 1000), false)
    assert.equal(photoNeedsFrameRotation(0, 100), false)
    const near = 1000 * (PORTRAIT_FRAME_RATIO + 0.02)
    assert.equal(photoNeedsFrameRotation(near, 1000), false)
  })

  it('turns anticlockwise by one quarter', () => {
    assert.equal(FRAME_ROTATION_DEGREES, 270)
  })

  it('scales the badge and tag from the reference frame onto the Zlog frame', () => {
    const scale = frameMarkScale()
    assert.ok(scale > 1)
    assert.equal(ROTATION_BADGE_SIZE, scaledFrameMark(21))
    assert.equal(ROTATION_BADGE_INSET, scaledFrameMark(6))
    assert.equal(AREA_TAG_SIZE, scaledFrameMark(7.5))
    assert.equal(AREA_TAG_INSET, scaledFrameMark(6))
    assert.ok(Math.abs(ROTATION_BADGE_SIZE / 21 - scale) < 0.001)
    assert.ok(ROTATION_BADGE_SIZE < 30)
  })

  it('keeps an unset tag empty and keeps a set tag', () => {
    assert.equal(photoFrameTag(null), null)
    assert.equal(photoFrameTag({}), null)
    assert.equal(photoFrameTag({ tag: '  ' }), null)
    assert.equal(photoFrameTag({ tag: 'CEILING' }), 'CEILING')
    assert.equal(photoFrameTag({ options: { tag: 'FLOOR' } }), 'FLOOR')
    assert.equal(photoFrameTag({ options: { tag: null }, tag: 'WALL' }), null)
  })

  it('draws the badge and tag inside the frame and leaves the caption alone', () => {
    const frame = /function FramedPhoto\([\s\S]*?\nfunction photoSrc/.exec(pdfDocument)[0]
    assert.match(frame, /\{rot \? <RotationBadge marks=\{marks\} \/> : null\}/)
    assert.match(frame, /\{tagText \? <AreaTag text=\{tagText\} marks=\{marks\} \/> : null\}/)
    assert.match(frame, /<Image src=\{src\} style=\{styles\.imageContain\} \/>/)
    assert.match(frame, /styles\.photoCaptionSlot/)
    assert.match(frame, /photoReferenceLabel\(photoNumber\)/)
    assert.doesNotMatch(frame, /rotated/i)
    assert.match(pdfDocument, /top: marks\.inset/)
    assert.match(pdfDocument, /right: marks\.inset/)
    assert.match(pdfDocument, /left: marks\.inset/)
    assert.match(pdfDocument, /bottom: marks\.inset/)
  })

  it('scales the badge with the image width', () => {
    const wide = frameMarksForImage(SPEC_FRAME_W)
    const narrow = frameMarksForImage(SPEC_FRAME_W / 2)
    assert.equal(wide.badge, 21)
    assert.ok(Math.abs(narrow.badge - 10.5) < 0.01)
    assert.ok(narrow.inset < wide.inset)
  })
})
