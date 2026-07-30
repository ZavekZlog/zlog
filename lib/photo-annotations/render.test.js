import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyAnnotationDoc, upsertShape } from './model.js'
import { hitTestShape } from './render.js'

describe('annotation hit testing', () => {
  it('selects top-most shape and misses empty space', () => {
    let doc = createEmptyAnnotationDoc(400, 400)
    doc = upsertShape(doc, {
      id: 'r1',
      type: 'rect',
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.3,
    })
    doc = upsertShape(doc, {
      id: 'r2',
      type: 'rect',
      x: 0.2,
      y: 0.2,
      w: 0.3,
      h: 0.3,
    })
    const hit = hitTestShape(doc, 0.25, 0.25, 400, 400)
    assert.equal(hit?.id, 'r2')
    assert.equal(hitTestShape(doc, 0.9, 0.9, 400, 400), null)
  })

  it('hits thin arrows near the stroke for touch', () => {
    let doc = createEmptyAnnotationDoc(400, 400)
    doc = upsertShape(doc, {
      id: 'a1',
      type: 'arrow',
      x1: 0.1,
      y1: 0.5,
      x2: 0.9,
      y2: 0.5,
    })
    const hit = hitTestShape(doc, 0.5, 0.52, 400, 400)
    assert.equal(hit?.id, 'a1')
  })
})
