import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAreaGroup,
  createAreaPhoto,
  flattenAreaGroups,
  groupPhotosByArea,
  layoutToPerPage,
  perPageToLayout,
  moveItem,
  photosMissingDescription,
  firstIncompletePhoto,
} from './area-groups.js'

describe('layout mapping', () => {
  it('maps 1/4/6 ↔ full/grid4/grid6', () => {
    assert.equal(perPageToLayout(1), 'full')
    assert.equal(perPageToLayout(4), 'grid4')
    assert.equal(perPageToLayout(6), 'grid6')
    assert.equal(layoutToPerPage('full'), 1)
    assert.equal(layoutToPerPage('grid4'), 4)
    assert.equal(layoutToPerPage('grid6'), 6)
  })
})

describe('flatten / group round-trip', () => {
  it('preserves two areas, photos, captions, layouts, annotations, order', () => {
    const a = createAreaGroup('Ground Floor', 4)
    a.photos = [
      createAreaPhoto({ description: 'Reception', preview: 'p1' }),
      createAreaPhoto({
        description: 'Lobby',
        preview: 'p2',
        annotations: { version: 1, shapes: [{ id: 's1', type: 'arrow', x1: 0, y1: 0, x2: 1, y2: 1 }] },
      }),
    ]
    const b = createAreaGroup('Roof', 1)
    b.photos = [createAreaPhoto({ description: 'Plant', preview: 'p3' })]

    const flat = flattenAreaGroups([a, b])
    assert.equal(flat.length, 3)
    assert.equal(flat[0].sequence, 1)
    assert.equal(flat[2].sequence, 3)
    assert.equal(flat[0].location, 'Ground Floor')
    assert.equal(flat[0].layout, 'grid4')
    assert.equal(flat[2].layout, 'full')
    assert.equal(flat[1].annotations?.shapes?.length, 1)

    const rebuilt = groupPhotosByArea(flat)
    assert.equal(rebuilt.length, 2)
    assert.equal(rebuilt[0].areaName, 'Ground Floor')
    assert.equal(rebuilt[0].photos.length, 2)
    assert.equal(rebuilt[0].photos[0].acceptedDescription, 'Reception')
    assert.equal(rebuilt[0].photos[1].annotations?.shapes?.length, 1)
    assert.equal(rebuilt[1].areaName, 'Roof')
    assert.equal(rebuilt[1].layout, 'full')
  })

  it('preserves rotationDegrees through flatten / rebuild', () => {
    const a = createAreaGroup('Stair core', 6)
    a.photos = [
      createAreaPhoto({ description: 'Landing', preview: 'p1', rotationDegrees: 90 }),
      createAreaPhoto({ description: '', preview: 'p2', rotationDegrees: 270 }),
    ]
    const flat = flattenAreaGroups([a])
    assert.equal(flat[0].rotationDegrees, 90)
    assert.equal(flat[1].rotationDegrees, 270)
    const rebuilt = groupPhotosByArea(flat)
    assert.equal(rebuilt[0].photos[0].rotationDegrees, 90)
    assert.equal(rebuilt[0].photos[1].rotationDegrees, 270)
    assert.equal(rebuilt[0].photos[1].acceptedDescription, '')
  })

  it('preserves optional assignedTo through flatten / rebuild (blank allowed)', () => {
    const a = createAreaGroup('Elevation', 4)
    a.photos = [
      createAreaPhoto({
        description: 'Damaged gutter',
        preview: 'p1',
        assignedTo: 'Roofing Contractor',
      }),
      createAreaPhoto({ description: 'General view', preview: 'p2', assignedTo: '' }),
    ]
    const flat = flattenAreaGroups([a])
    assert.equal(flat[0].assignedTo, 'Roofing Contractor')
    assert.equal(flat[1].assignedTo, '')
    const rebuilt = groupPhotosByArea(flat)
    assert.equal(rebuilt[0].photos[0].assignedTo, 'Roofing Contractor')
    assert.equal(rebuilt[0].photos[1].assignedTo, '')
  })

  it('reorders areas and photos', () => {
    const areas = [
      createAreaGroup('A', 4),
      createAreaGroup('B', 4),
      createAreaGroup('C', 4),
    ]
    const moved = moveItem(areas, 0, 2)
    assert.deepEqual(moved.map((g) => g.areaName), ['B', 'C', 'A'])
  })
})

describe('photosMissingDescription', () => {
  it('returns photos with blank descriptions only', () => {
    const a = createAreaGroup('Plant Room', 4)
    a.photos = [
      createAreaPhoto({ description: 'Cable tray installed', preview: 'p1' }),
      createAreaPhoto({ description: '  ', preview: 'p2' }),
      createAreaPhoto({ description: '', preview: 'p3' }),
    ]
    const missing = photosMissingDescription([a])
    assert.equal(missing.length, 2)
    assert.equal(missing[0].sequence, 2)
    assert.equal(missing[1].sequence, 3)
  })

  it('returns empty when every photo has a description', () => {
    const a = createAreaGroup('Roof', 1)
    a.photos = [createAreaPhoto({ description: 'Plant completed', preview: 'p1' })]
    assert.equal(photosMissingDescription([a]).length, 0)
  })
})

describe('firstIncompletePhoto', () => {
  it('points at the first photo missing a description', () => {
    const a = createAreaGroup('A', 4)
    a.id = 'area-a'
    a.photos = [
      createAreaPhoto({ description: 'Done', preview: 'p1' }),
      createAreaPhoto({ description: '', preview: 'p2' }),
    ]
    const b = createAreaGroup('B', 4)
    b.id = 'area-b'
    b.photos = [createAreaPhoto({ description: '', preview: 'p3' })]

    assert.deepEqual(firstIncompletePhoto([a, b]), {
      groupId: 'area-a',
      index: 1,
      sequence: 2,
    })
  })

  it('returns null when complete', () => {
    const a = createAreaGroup('A', 1)
    a.photos = [createAreaPhoto({ description: 'Complete', preview: 'p1' })]
    assert.equal(firstIncompletePhoto([a]), null)
  })
})
