/**
 * Saved Photo Evidence — Edit opens the canonical area editor.
 * Mirrors live hydrate: progressive groupPhotosByArea must keep area/photo ids.
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
  groupPhotosByArea,
  openSavedAreaForEdit,
  perPageToLayout,
  stableAreaGroupId,
  stablePhotoId,
} from './area-groups.js'
import { commitUnsavedPhotoAreaToWalk } from '../photo-workspace/commit-unsaved-area.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const locationWalkSrc = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

/** Live hydrate row shape (report_photos → mapPhotoRowWithoutPreview). */
function hydrateRowsFromDb(dbRows) {
  return dbRows.map((p, index) => ({
    key: p.id || p.url,
    file: null,
    preview: p.preview || null,
    storagePath: p.url,
    caption: p.caption || '',
    sequence_number: p.sequence ?? index + 1,
    layout: p.layout || 'grid4',
    location: p.location || '',
    category: p.category || null,
    rotationDegrees: p.rotation_degrees ?? 0,
    assignedTo: p.assigned_to || '',
  }))
}

function savedWalkFixture() {
  const db = [
    {
      id: 'db-photo-a1',
      url: 'user/rep/a1.jpg',
      caption: 'North wall',
      sequence: 1,
      layout: 'grid6',
      location: 'Area A',
      preview: 'https://signed/a1',
    },
    {
      id: 'db-photo-a2',
      url: 'user/rep/a2.jpg',
      caption: 'South wall',
      sequence: 2,
      layout: 'grid6',
      location: 'Area A',
      preview: 'https://signed/a2',
    },
    {
      id: 'db-photo-a3',
      url: 'user/rep/a3.jpg',
      caption: 'Detail',
      sequence: 3,
      layout: 'grid6',
      location: 'Area A',
      preview: 'https://signed/a3',
    },
    {
      id: 'db-photo-b1',
      url: 'user/rep/b1.jpg',
      caption: 'Roof',
      sequence: 4,
      layout: 'grid4',
      location: 'Area B',
      preview: 'https://signed/b1',
    },
  ]
  return groupPhotosByArea(hydrateRowsFromDb(db))
}

describe('openSavedAreaForEdit', () => {
  it('tapping Edit opens the correct saved area', () => {
    const walk = savedWalkFixture()
    const areaA = walk.find((g) => g.areaName === 'Area A')
    const opened = openSavedAreaForEdit(walk, areaA.id)
    assert.ok(opened)
    assert.equal(opened.groupId, areaA.id)
    assert.equal(opened.nameDraft, 'Area A')
    assert.equal(opened.perPageDraft, 6)
    assert.equal(opened.group.photos.length, 3)
    assert.equal(opened.group.photos[0].acceptedDescription, 'North wall')
  })

  it('returns null when the area id is unknown (no silent blank editor)', () => {
    const walk = savedWalkFixture()
    assert.equal(openSavedAreaForEdit(walk, 'area:missing'), null)
  })
})

describe('progressive hydrate keeps Edit identity', () => {
  it('area and photo ids survive withoutPreview → withPreview rebuild', () => {
    const db = [
      { id: 'p1', url: 'u/1.jpg', caption: 'One', sequence: 1, layout: 'grid4', location: 'Roof' },
      { id: 'p2', url: 'u/2.jpg', caption: 'Two', sequence: 2, layout: 'grid4', location: 'Roof' },
    ]
    const first = groupPhotosByArea(hydrateRowsFromDb(db))
    const second = groupPhotosByArea(
      hydrateRowsFromDb(db.map((row) => ({ ...row, preview: `https://signed/${row.id}` }))),
    )
    assert.equal(first[0].id, second[0].id)
    assert.equal(first[0].id, stableAreaGroupId('Roof'))
    assert.deepEqual(
      first[0].photos.map((p) => p.id),
      second[0].photos.map((p) => p.id),
    )
    assert.deepEqual(
      second[0].photos.map((p) => p.id),
      ['p1', 'p2'],
    )
    const opened = openSavedAreaForEdit(second, first[0].id)
    assert.ok(opened, 'Edit id from first paint must resolve after second hydrate')
    assert.equal(opened.group.photos.length, 2)
    assert.equal(opened.group.photos[0].file, null)
    assert.equal(opened.group.photos[0].imageUrl, 'u/1.jpg')
  })

  it('persisted photos hydrate as stored photos, not new local files', () => {
    const walk = savedWalkFixture()
    for (const photo of walk[0].photos) {
      assert.equal(photo.file, null)
      assert.ok(photo.imageUrl, 'storagePath/imageUrl must be present')
      assert.match(photo.imageUrl, /^user\/rep\//)
      assert.ok(photo.preview, 'signed preview for review')
    }
  })
})

describe('edit mutations on a saved area', () => {
  it('deleting one photo leaves all others intact with stable ids and storage paths', () => {
    const walk = savedWalkFixture()
    const areaA = walk.find((g) => g.areaName === 'Area A')
    const removeId = areaA.photos[1].id
    const keepIds = areaA.photos.filter((p) => p.id !== removeId).map((p) => p.id)
    const keepPaths = areaA.photos
      .filter((p) => p.id !== removeId)
      .map((p) => p.imageUrl)

    const nextWalk = walk.map((g) => (
      g.id !== areaA.id
        ? g
        : { ...g, photos: g.photos.filter((p) => p.id !== removeId) }
    ))
    const edited = nextWalk.find((g) => g.id === areaA.id)
    assert.equal(edited.photos.length, 2)
    assert.deepEqual(edited.photos.map((p) => p.id), keepIds)
    assert.deepEqual(edited.photos.map((p) => p.imageUrl), keepPaths)
    assert.ok(edited.photos.every((p) => p.file == null))
  })

  it('changing 6/page → 1/page persists on Save Area commit', () => {
    const walk = savedWalkFixture()
    const areaA = walk.find((g) => g.areaName === 'Area A')
    assert.equal(areaA.layout, 'grid6')

    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: walk,
      draftPhotos: [],
      nameDraft: areaA.areaName,
      descriptionDraft: areaA.description || '',
      perPageDraft: 1,
      editingGroupId: areaA.id,
      editingGroupPhotos: areaA.photos,
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    const saved = result.locationWalk.find((g) => g.id === areaA.id)
    assert.equal(saved.layout, 'full')
    assert.equal(saved.photos.length, 3)
    assert.deepEqual(
      saved.photos.map((p) => p.id),
      areaA.photos.map((p) => p.id),
    )
    assert.ok(saved.photos.every((p) => p.file == null && p.imageUrl))
  })

  it('saving and reopening retains the edited area correctly', () => {
    const walk = savedWalkFixture()
    const areaA = walk.find((g) => g.areaName === 'Area A')
    const afterDelete = walk.map((g) => (
      g.id !== areaA.id
        ? g
        : { ...g, photos: g.photos.filter((_, i) => i !== 1) }
    ))

    const committed = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: afterDelete,
      draftPhotos: [],
      nameDraft: 'Area A Renamed',
      descriptionDraft: 'Edited notes',
      perPageDraft: 1,
      editingGroupId: areaA.id,
      editingGroupPhotos: afterDelete.find((g) => g.id === areaA.id).photos,
    })
    assert.equal(committed.ok, true)

    const flat = flattenAreaGroups(committed.locationWalk)
    const reopened = groupPhotosByArea(
      flat.map((row) => ({
        key: row.key,
        id: row.key,
        file: null,
        preview: row.preview,
        storagePath: row.storagePath,
        caption: row.caption,
        sequence_number: row.sequence_number,
        layout: row.layout,
        location: row.location,
        category: row.category,
        areaId: row.areaId,
        rotationDegrees: row.rotationDegrees,
        assignedTo: row.assignedTo,
      })),
    )

    const again = reopened.find((g) => g.areaName === 'Area A Renamed')
    assert.ok(again)
    assert.equal(again.layout, 'full')
    assert.equal(again.description, 'Edited notes')
    assert.equal(again.photos.length, 2)
    assert.equal(again.photos[0].acceptedDescription, 'North wall')
    assert.equal(again.photos[1].acceptedDescription, 'Detail')
    assert.ok(again.photos.every((p) => p.file == null))

    const opened = openSavedAreaForEdit(reopened, again.id)
    assert.ok(opened)
    assert.equal(opened.perPageDraft, 1)
    assert.equal(opened.nameDraft, 'Area A Renamed')
  })
})

describe('Edit wiring in Location Walk / diary hydrate', () => {
  it('AiLocationWalk uses openSavedAreaForEdit and shows the saved-area editor', () => {
    assert.match(locationWalkSrc, /openSavedAreaForEdit/)
    assert.match(locationWalkSrc, /data-area-editor="saved"/)
    assert.match(
      locationWalkSrc,
      /\.filter\(\(group\) => !\(isEditing && group\.id === editingGroupId\)\)/,
    )
  })

  it('diary hydrate keeps durable photo keys (id or storage url)', () => {
    assert.match(diaryPage, /key: p\.id \|\| p\.url \|\| makeUuid\(\)/)
    assert.match(
      diaryPage,
      /report_photos'\)\.select\('id, url, caption/,
    )
  })

  it('stable helpers prefer durable identity over random ids', () => {
    assert.equal(stableAreaGroupId('Roof'), 'area:Roof')
    assert.equal(stableAreaGroupId('Roof', 'area-session-1'), 'area-session-1')
    assert.equal(stablePhotoId({ id: 'db-1', url: 'u/x.jpg' }), 'db-1')
    assert.equal(stablePhotoId({ url: 'u/x.jpg' }), 'u/x.jpg')
    assert.equal(stablePhotoId({ storagePath: 'u/y.jpg' }), 'u/y.jpg')
  })

  it('createAreaGroup still uses session ids; hydrate uses stable area ids', () => {
    const created = createAreaGroup('Temp', 4)
    assert.match(created.id, /^area-/)
    assert.notEqual(created.id, stableAreaGroupId('Temp'))
    const photo = createAreaPhoto({
      file: null,
      preview: 'https://signed/x',
      imageUrl: 'u/x.jpg',
      description: 'X',
    })
    assert.ok(photo.id)
    assert.equal(photo.file, null)
    assert.equal(photo.imageUrl, 'u/x.jpg')
    assert.equal(perPageToLayout(1), 'full')
  })
})
