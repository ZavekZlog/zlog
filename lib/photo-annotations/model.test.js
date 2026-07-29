import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyAnnotationDoc,
  normalizeAnnotationDoc,
  upsertShape,
  removeShape,
  hasAnnotations,
  makeAnnotationId,
} from './model.js'

describe('annotation model', () => {
  it('starts empty with no shapes', () => {
    const doc = createEmptyAnnotationDoc(800, 600)
    assert.equal(doc.shapes.length, 0)
    assert.equal(hasAnnotations(doc), false)
  })

  it('upserts arrow / ellipse / rect / freehand / text', () => {
    let doc = createEmptyAnnotationDoc(1000, 800)
    doc = upsertShape(doc, {
      id: 'a1',
      type: 'arrow',
      x1: 0.1,
      y1: 0.1,
      x2: 0.5,
      y2: 0.5,
    })
    doc = upsertShape(doc, {
      id: 'e1',
      type: 'ellipse',
      cx: 0.5,
      cy: 0.5,
      rx: 0.1,
      ry: 0.2,
    })
    doc = upsertShape(doc, {
      id: 'r1',
      type: 'rect',
      x: 0.2,
      y: 0.2,
      w: 0.3,
      h: 0.2,
    })
    doc = upsertShape(doc, {
      id: 'f1',
      type: 'freehand',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.25 },
        { x: 0.3, y: 0.15 },
      ],
    })
    doc = upsertShape(doc, {
      id: 't1',
      type: 'text',
      x: 0.1,
      y: 0.8,
      text: 'Crack',
    })
    assert.equal(doc.shapes.length, 5)
    assert.equal(hasAnnotations(doc), true)
  })

  it('removes by id without touching image dimensions', () => {
    let doc = createEmptyAnnotationDoc(640, 480)
    const id = makeAnnotationId('x')
    doc = upsertShape(doc, { id, type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    doc = removeShape(doc, id)
    assert.equal(doc.shapes.length, 0)
    assert.equal(doc.imageWidth, 640)
  })

  it('clamps coordinates to 0–1', () => {
    const doc = normalizeAnnotationDoc({
      imageWidth: 100,
      imageHeight: 100,
      shapes: [{ id: 'a', type: 'arrow', x1: -1, y1: 2, x2: 0.5, y2: 0.5 }],
    })
    assert.equal(doc.shapes[0].x1, 0)
    assert.equal(doc.shapes[0].y1, 1)
  })
})
