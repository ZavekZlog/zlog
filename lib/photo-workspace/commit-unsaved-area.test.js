/**
 * Save & Share must auto-commit the current unsaved photo area (Save Area logic).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAreaGroup,
  createAreaPhoto,
  flattenAreaGroups,
} from '../ai-annotation/area-groups.js'
import {
  commitUnsavedPhotoAreaToWalk,
  inspectUnsavedPhotoAreaForShare,
  SHARE_UNSAVED_AREA_NAME_MESSAGE,
  SHARE_UNSAVED_AREA_PHOTOS_MESSAGE,
} from './commit-unsaved-area.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const locationWalkSrc = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)

function draftPhoto(label) {
  return createAreaPhoto({
    file: { name: `${label}.jpg` },
    preview: `blob:${label}`,
    description: label,
    rotationDegrees: 0,
  })
}

describe('Save & Share — auto-commit unsaved current photo area', () => {
  it('wires Share to commitUnsavedAreaForShare before flatten/persist', () => {
    assert.match(diaryPage, /commitUnsavedAreaForShare/)
    assert.match(diaryPage, /walkForPersist/)
    const flushAt = diaryPage.indexOf('commitUnsavedAreaForShare')
    const sequencedAt = diaryPage.indexOf('flattenAreaGroups(walkForPersist)')
    assert.ok(flushAt > 0 && sequencedAt > flushAt, 'flush must run before photo persist flatten')
    assert.match(locationWalkSrc, /commitUnsavedPhotoAreaToWalk/)
    assert.match(locationWalkSrc, /commitUnsavedAreaForShare/)
    assert.match(locationWalkSrc, /const saveArea = \(\) =>/)
  })

  it('unsaved current area + Save & Share commit → area/photos included', () => {
    const draft = [draftPhoto('East'), draftPhoto('West')]
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: draft,
      nameDraft: 'Roof',
      descriptionDraft: 'Felt complete',
      perPageDraft: 4,
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    assert.equal(result.locationWalk.length, 1)
    assert.equal(result.locationWalk[0].areaName, 'Roof')
    assert.equal(result.locationWalk[0].photos.length, 2)
    assert.equal(result.locationWalk[0].photos[0].acceptedDescription, 'East')
    assert.equal(result.locationWalk[0].layout, 'grid4')
    const flat = flattenAreaGroups(result.locationWalk)
    assert.equal(flat.length, 2)
    assert.equal(flat[0].location, 'Roof')
    assert.equal(flat[0].file?.name, 'East.jpg')
  })

  it('two saved areas + one current draft → all three survive', () => {
    const a = createAreaGroup('Ground Floor', 4)
    a.photos = [draftPhoto('G1')]
    const b = createAreaGroup('Plant Room', 6)
    b.photos = [draftPhoto('P1'), draftPhoto('P2')]
    const draft = [draftPhoto('R1')]
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [a, b],
      draftPhotos: draft,
      nameDraft: 'Roof',
      descriptionDraft: '',
      perPageDraft: 1,
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    assert.equal(result.locationWalk.length, 3)
    assert.deepEqual(
      result.locationWalk.map((g) => g.areaName),
      ['Ground Floor', 'Plant Room', 'Roof'],
    )
    assert.equal(flattenAreaGroups(result.locationWalk).length, 4)
  })

  it('already-saved area is not duplicated on commit', () => {
    const existing = createAreaGroup('Roof', 4)
    existing.id = 'area-roof-1'
    existing.photos = [draftPhoto('Keep')]
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [existing],
      draftPhotos: [],
      nameDraft: 'Roof Updated',
      descriptionDraft: 'Notes',
      perPageDraft: 6,
      editingGroupId: 'area-roof-1',
      editingGroupPhotos: [
        ...existing.photos,
        draftPhoto('Added'),
      ],
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    assert.equal(result.locationWalk.length, 1, 'must update in place, not append')
    assert.equal(result.locationWalk[0].id, 'area-roof-1')
    assert.equal(result.locationWalk[0].areaName, 'Roof Updated')
    assert.equal(result.locationWalk[0].photos.length, 2)
    assert.equal(result.locationWalk[0].layout, 'grid6')
  })

  it('invalid/incomplete current area blocks Share rather than discard', () => {
    const photosNoName = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: [draftPhoto('Orphan')],
      nameDraft: '',
      perPageDraft: 4,
    })
    assert.equal(photosNoName.ok, false)
    assert.equal(photosNoName.blocked, true)
    assert.equal(photosNoName.message, SHARE_UNSAVED_AREA_NAME_MESSAGE)
    assert.equal(photosNoName.locationWalk.length, 0)

    const nameNoPhotos = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: [],
      nameDraft: 'Roof',
      perPageDraft: 4,
    })
    assert.equal(nameNoPhotos.ok, false)
    assert.equal(nameNoPhotos.message, SHARE_UNSAVED_AREA_PHOTOS_MESSAGE)
  })

  it('idle create / after_save leaves walk unchanged (no silent draft outside PDF set)', () => {
    const saved = createAreaGroup('Only Saved', 4)
    saved.photos = [draftPhoto('S1')]
    const idle = inspectUnsavedPhotoAreaForShare({
      phase: 'create',
      locationWalk: [saved],
      draftPhotos: [],
      nameDraft: '',
    })
    assert.equal(idle.action, 'none')

    const afterSave = commitUnsavedPhotoAreaToWalk({
      phase: 'after_save',
      locationWalk: [saved],
      draftPhotos: [],
      nameDraft: 'Stale name still in field',
      perPageDraft: 4,
    })
    assert.equal(afterSave.ok, true)
    assert.equal(afterSave.committed, false)
    assert.equal(afterSave.locationWalk.length, 1)

    const committed = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [saved],
      draftPhotos: [draftPhoto('New')],
      nameDraft: 'Second',
      perPageDraft: 4,
    })
    const expected = flattenAreaGroups(committed.locationWalk)
    assert.equal(expected.length, 2)
    assert.ok(expected.every((p) => p.location === 'Only Saved' || p.location === 'Second'))
    // After commit, no draft remains outside the walk Share will flatten.
    assert.equal(committed.clearedDraft, true)
  })

  it('preserves caption, rotation, layout and photo order on auto-commit', () => {
    const first = createAreaPhoto({
      file: { name: 'a.jpg' },
      preview: 'blob:a',
      description: 'Caption A',
      rotationDegrees: 90,
    })
    const second = createAreaPhoto({
      file: { name: 'b.jpg' },
      preview: 'blob:b',
      description: 'Caption B',
      rotationDegrees: 180,
    })
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: [first, second],
      nameDraft: 'Stair',
      perPageDraft: 6,
    })
    const photos = result.locationWalk[0].photos
    assert.equal(photos[0].acceptedDescription, 'Caption A')
    assert.equal(photos[0].rotationDegrees, 90)
    assert.equal(photos[1].acceptedDescription, 'Caption B')
    assert.equal(photos[1].rotationDegrees, 180)
    assert.equal(result.locationWalk[0].layout, 'grid6')
    assert.equal(photos[0].id, first.id)
    assert.equal(photos[1].id, second.id)
  })
})
