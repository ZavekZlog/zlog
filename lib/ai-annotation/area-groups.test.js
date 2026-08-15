import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectRecentAreaNames,
  createAreaGroup,
  createAreaPhoto,
  flattenAreaGroups,
  groupPhotosByArea,
  layoutToPerPage,
  perPageToLayout,
  moveItem,
  photosMissingDescription,
  firstIncompletePhoto,
  encodeAreaNotesCategory,
  decodeAreaNotesCategory,
} from './area-groups.js'
import { LIVE_REPORT_PHOTOS } from '../live-diary-schema.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const locationWalk = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const captureThumbnailGrid = readFileSync(
  join(root, 'components/photo-workspace/CaptureThumbnailGrid.jsx'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

describe('Photo Evidence belongs to one diary', () => {
  const photoWorkspace = readFileSync(
    join(root, 'components/photo-workspace/PhotoWorkspace.jsx'),
    'utf8',
  )

  // Diary A saved "Roof" with notes; Diary B is a genuinely new diary on the same project.
  const DIARY_A = 'report-a'
  const DIARY_B = 'report-b'
  const savedPhotoRows = [
    {
      report_id: DIARY_A,
      url: 'diary-a/roof-1.jpg',
      caption: 'Felt lapped',
      sequence: 1,
      layout: 'grid4',
      location: 'Roof',
      category: encodeAreaNotesCategory('Wind stopped work after lunch'),
    },
    {
      report_id: DIARY_A,
      url: 'diary-a/roof-2.jpg',
      caption: 'Flashing',
      sequence: 2,
      layout: 'grid4',
      location: 'Roof',
      category: encodeAreaNotesCategory('Wind stopped work after lunch'),
    },
  ]

  // Mirrors the diary page: photos are always fetched .eq('report_id', <this report>).
  const hydrateFor = (reportId) =>
    groupPhotosByArea(savedPhotoRows.filter((row) => row.report_id === reportId))

  it('a genuinely new diary hydrates no work areas, notes or photos', () => {
    assert.deepEqual(hydrateFor(DIARY_B), [])
  })

  it('reopening the saved diary restores its own area name, notes and photos', () => {
    const groups = hydrateFor(DIARY_A)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].areaName, 'Roof')
    assert.equal(groups[0].description, 'Wind stopped work after lunch')
    assert.equal(groups[0].photos.length, 2)
  })

  it('the diary page only ever reads photos for the open report', () => {
    assert.doesNotMatch(diaryPage, /from\('report_photos'\)[\s\S]{0,400}?\.eq\('project_id'/)
    assert.match(diaryPage, /setLocationWalk\(groupPhotosByArea\(withPreview\)\)/)
    assert.match(diaryPage, /setLocationWalk\(\[\]\)/)
  })

  it('the composer remounts per report so it cannot carry the previous diary forward', () => {
    // Diary A and Diary B share one route and differ only by query string, so without
    // a per-report key the mounted composer keeps its name, notes and unsaved photos.
    assert.match(photoWorkspace, /key=\{reportId \|\| 'new-report'\}/)
  })

  it('the composer itself starts blank', () => {
    assert.match(locationWalk, /const \[nameDraft, setNameDraft\] = useState\(''\)/)
    assert.match(locationWalk, /const \[descriptionDraft, setDescriptionDraft\] = useState\(''\)/)
    assert.match(locationWalk, /const \[draftPhotos, setDraftPhotos\] = useState\(\[\]\)/)
  })

  it('starting another area clears the previous name, notes and photos', () => {
    const begin = locationWalk.slice(
      locationWalk.indexOf('const beginCreate'),
      locationWalk.indexOf('const validateSave'),
    )
    assert.match(begin, /setNameDraft\(''\)/)
    assert.match(begin, /setDescriptionDraft\(''\)/)
    assert.match(begin, /setDraftPhotos\(\[\]\)/)
  })

  it('area shortcuts come from this diary only and never fill the field', () => {
    // Chips are buttons the user must tap; nothing assigns them to nameDraft on render.
    assert.match(locationWalk, /recentAreas\.map\(\(name\) =>/)
    assert.doesNotMatch(locationWalk, /useState\(recentAreas/)
    assert.doesNotMatch(locationWalk, /setNameDraft\(recentAreas/)
    assert.match(locationWalk, /collectRecentAreaNames\(locationWalk\),/)
  })

  it('no work area name is remembered across diaries', () => {
    const areaGroups = readFileSync(join(root, 'lib/ai-annotation/area-groups.js'), 'utf8')
    assert.doesNotMatch(areaGroups, /recent-areas/)
    assert.doesNotMatch(areaGroups, /sessionStorage/)
    assert.doesNotMatch(locationWalk, /readRecentAreas|rememberRecentArea|storedRecent/)
  })

  it('a new diary offers no area shortcuts at all', () => {
    assert.deepEqual(collectRecentAreaNames([]), [])
    // Reopening the saved diary still offers its own areas.
    assert.deepEqual(collectRecentAreaNames(hydrateFor(DIARY_A)), ['Roof'])
  })
})

describe('saved Photo Evidence review presentation', () => {
  it('renders saved area photos and captions without an Expand control', () => {
    const savedCard = locationWalk.slice(
      locationWalk.indexOf('function SavedAreaCard'),
      locationWalk.indexOf('export const AiLocationWalk'),
    )
    assert.match(savedCard, /<CaptureThumbnailGrid/)
    assert.match(savedCard, /\breadOnly\b/)
    assert.match(savedCard, /perPage=\{perPage\}/)
    assert.match(savedCard, /group\.description/)
    assert.doesNotMatch(savedCard, />Expand<|>Collapse<|onToggle|expanded/)
    assert.match(savedCard, /onClick=\{onEdit\}>Edit/)
  })

  it('uses the saved 1 / 4 / 6 setting to choose review density', () => {
    assert.match(
      captureThumbnailGrid,
      /Number\(perPage\) === 1 \? 1 : Number\(perPage\) === 6 \? 3 : 2/,
    )
    assert.match(captureThumbnailGrid, /gridTemplateColumns: readOnly/)
  })

  it('keeps each saved caption attached to the photo being rendered', () => {
    const photoLoop = captureThumbnailGrid.slice(
      captureThumbnailGrid.indexOf('list.map((photo, index)'),
      captureThumbnailGrid.indexOf('})}'),
    )
    assert.match(photoLoop, /const caption = photo\.acceptedDescription \|\| photo\.caption \|\| ''/)
    assert.match(photoLoop, /\{caption\}/)
    assert.match(photoLoop, /key=\{photo\.id\}/)
  })

  it('Edit loads that same saved area instead of creating a blank area', () => {
    const edit = locationWalk.slice(
      locationWalk.indexOf('const editGroup ='),
      locationWalk.indexOf('// Warn before leave/refresh'),
    )
    assert.match(edit, /locationWalk\.find\(\(g\) => g\.id === groupId\)/)
    assert.match(edit, /setEditingGroupId\(groupId\)/)
    assert.match(edit, /setNameDraft\(group\.areaName\)/)
    assert.match(edit, /setDescriptionDraft\(group\.description \|\| ''\)/)
    assert.match(edit, /setPerPageDraft\(layoutToPerPage\(group\.layout\)\)/)
  })

  it('an existing diary starts in review while a genuinely new diary starts blank', () => {
    assert.match(
      locationWalk,
      /useState\(\(\) => \(locationWalk\.length \? 'review' : 'create'\)\)/,
    )
    assert.match(locationWalk, /const \[nameDraft, setNameDraft\] = useState\(''\)/)
    assert.match(locationWalk, /const \[descriptionDraft, setDescriptionDraft\] = useState\(''\)/)
    assert.match(locationWalk, /const \[draftPhotos, setDraftPhotos\] = useState\(\[\]\)/)
  })
})

describe('Location Walk — no isolated dictation control', () => {
  it('the one-off Dictate area name button is gone', () => {
    assert.doesNotMatch(locationWalk, /Dictate area name/)
    assert.doesNotMatch(locationWalk, /Dictate work area name/)
    assert.doesNotMatch(locationWalk, /Listening for work area name/)
  })

  it('Location Walk no longer wires up speech dictation at all', () => {
    assert.doesNotMatch(locationWalk, /useSpeechDictation/)
    assert.doesNotMatch(locationWalk, /startDictation/)
    assert.doesNotMatch(locationWalk, /dictationSupported/)
  })

  it('Work Area Name stays a plain text input and Notes stays a plain textarea', () => {
    const nameLabel = locationWalk.indexOf('{copy.groupNameLabel}')
    const notesLabel = locationWalk.indexOf('{copy.groupDescriptionLabel}')
    assert.ok(nameLabel > 0 && notesLabel > nameLabel)
    assert.match(locationWalk, /value=\{nameDraft\}/)
    assert.match(locationWalk, /value=\{descriptionDraft\}/)
    assert.match(locationWalk, /onChange=\{\(e\) => setDescriptionDraft\(e\.target\.value\)\}/)
  })

  it('area shortcuts and Photos per page are untouched', () => {
    assert.match(locationWalk, /\{recentAreas\.length > 0 \?/)
    assert.match(locationWalk, /recentAreas\.map\(\(name\) =>/)
    assert.match(locationWalk, /<PhotosPerPagePicker/)
  })

  it('the photo-description microphone remains its own separate control', () => {
    const viewer = readFileSync(
      join(root, 'components/ai-annotation/AreaPhotoViewer.jsx'),
      'utf8',
    )
    assert.match(viewer, /Dictate photo description/)
  })
})

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

  it('preserves Area Notes through save-row flattening and reopen hydration', () => {
    const area = createAreaGroup('Level 2', 4)
    area.description = 'Ceiling framing complete; awaiting inspection.'
    area.photos = [
      createAreaPhoto({ description: 'East corridor', preview: 'p1' }),
      createAreaPhoto({ description: 'West corridor', preview: 'p2' }),
    ]

    const savedRows = flattenAreaGroups([area])
    assert.equal(
      savedRows[0].category,
      encodeAreaNotesCategory('Ceiling framing complete; awaiting inspection.'),
    )
    assert.equal(savedRows[1].category, savedRows[0].category)

    const reopened = groupPhotosByArea(savedRows)
    assert.equal(reopened[0].description, 'Ceiling framing complete; awaiting inspection.')

    reopened[0].photos[0].acceptedDescription = 'East corridor updated'
    const savedAgain = flattenAreaGroups(reopened)
    assert.equal(
      decodeAreaNotesCategory(savedAgain[0].category),
      'Ceiling framing complete; awaiting inspection.',
    )
  })

  it('ignores unrelated legacy photo categories when hydrating Area Notes', () => {
    const reopened = groupPhotosByArea([
      { location: 'Roof', category: 'progress-photo', caption: 'Plant', storagePath: 'p1' },
    ])
    assert.equal(reopened[0].description, '')
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

describe('Location Walk Area Notes persistence wiring', () => {
  it('reads and writes the live report_photos category column', () => {
    assert.ok(LIVE_REPORT_PHOTOS.columns.includes('category'))
    assert.match(diaryPage, /select\('url, caption, sequence, layout, location, category,/)
    assert.match(diaryPage, /category: p\.category \|\| null/)
    assert.match(diaryPage, /category: photo\.category \|\| null/)
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
