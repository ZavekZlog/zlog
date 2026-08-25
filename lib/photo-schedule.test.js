/**
 * PDF work-photo area grouping — live diary object shape (locationWalk → flat → schedule).
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
  perPageToLayout,
} from './ai-annotation/area-groups.js'
import {
  assignReportPhotoNumbers,
  buildPhotoAreaPdfPages,
  buildPhotoAreaSchedule,
  buildPhotoSchedule,
  photographicRecordAreaTitle,
  photoAreaName,
  photoReferenceLabel,
  photoTileAssignedTo,
  photoTileAssignedToLine,
  photoTileCaption,
} from './photo-schedule.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfDocument = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')
const pdfPhotos = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')
const shareLib = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')

/**
 * Same shape Share persist writes / prepare reads: flattenAreaGroups rows
 * after auto-commit of a final draft area (Area C).
 */
function liveDiaryPreparedPhotos() {
  const areaA = createAreaGroup('Area A', 4)
  areaA.photos = [
    createAreaPhoto({
      file: null,
      preview: 'https://signed/a1',
      imageUrl: 'user/rep/a1.jpg',
      description: 'A1',
      rotationDegrees: 0,
    }),
    createAreaPhoto({
      file: null,
      preview: 'https://signed/a2',
      imageUrl: 'user/rep/a2.jpg',
      description: 'A2',
      rotationDegrees: 90,
    }),
    createAreaPhoto({
      file: null,
      preview: 'https://signed/a3',
      imageUrl: 'user/rep/a3.jpg',
      description: 'A3',
    }),
  ]

  const areaB = createAreaGroup('Area B', 6)
  areaB.photos = [
    createAreaPhoto({
      file: null,
      preview: 'https://signed/b1',
      imageUrl: 'user/rep/b1.jpg',
      description: 'B1',
    }),
    createAreaPhoto({
      file: null,
      preview: 'https://signed/b2',
      imageUrl: 'user/rep/b2.jpg',
      description: 'B2',
    }),
  ]

  // Auto-committed at Save & Share (was draftPhotos; now in locationWalk).
  const areaC = createAreaGroup('Area C', 4)
  areaC.photos = [
    createAreaPhoto({
      file: { name: 'c1.jpg' },
      preview: 'blob:c1',
      description: 'C1',
    }),
    createAreaPhoto({
      file: { name: 'c2.jpg' },
      preview: 'blob:c2',
      description: 'C2',
    }),
    createAreaPhoto({
      file: { name: 'c3.jpg' },
      preview: 'blob:c3',
      description: 'C3',
    }),
  ]

  const walk = [areaA, areaB, areaC]
  const flat = flattenAreaGroups(walk)

  // Persist/prepare shape: report_photos row → buildDiaryPdfPhotos output fields.
  return flat.map((row) => ({
    key: row.storagePath || row.key,
    src: row.preview || `https://signed/${row.storagePath || row.key}`,
    preview: row.preview,
    url: row.storagePath || null,
    caption: row.caption,
    location: row.location,
    area: row.area,
    layout: row.layout,
    sequence_number: row.sequence_number,
    rotationDegrees: row.rotationDegrees,
    assignedTo: row.assignedTo || '',
  }))
}

describe('photoReferenceLabel', () => {
  it('formats Photo N', () => {
    assert.equal(photoReferenceLabel(1), 'Photo 1')
  })
})

describe('live diary → PDF area render model', () => {
  it('three areas remain three distinct named PDF groups', () => {
    const prepared = liveDiaryPreparedPhotos()
    const schedule = buildPhotoAreaSchedule(prepared)
    assert.equal(schedule.areas.length, 3)
    assert.deepEqual(
      schedule.areas.map((a) => a.areaName),
      ['Area A', 'Area B', 'Area C'],
    )
  })

  it("each area's photos remain under the correct title — no migration", () => {
    const prepared = liveDiaryPreparedPhotos()
    const schedule = buildPhotoAreaSchedule(prepared)
    assert.deepEqual(
      schedule.areas[0].photos.map((p) => p.caption),
      ['A1', 'A2', 'A3'],
    )
    assert.deepEqual(
      schedule.areas[1].photos.map((p) => p.caption),
      ['B1', 'B2'],
    )
    assert.deepEqual(
      schedule.areas[2].photos.map((p) => p.caption),
      ['C1', 'C2', 'C3'],
    )
    for (const area of schedule.areas) {
      for (const photo of area.photos) {
        assert.equal(photo.location, area.areaName)
        assert.equal(photoAreaName(photo), area.areaName)
      }
    }
  })

  it('mixed 4-per-page and 6-per-page stay attached to the correct area', () => {
    const prepared = liveDiaryPreparedPhotos()
    const schedule = buildPhotoAreaSchedule(prepared)
    assert.equal(schedule.areas[0].layout, 'grid4')
    assert.equal(schedule.areas[1].layout, 'grid6')
    assert.equal(schedule.areas[2].layout, 'grid4')
    assert.equal(perPageToLayout(4), 'grid4')
    assert.equal(perPageToLayout(6), 'grid6')
  })

  it('auto-committed final area receives its correct title and photos', () => {
    const prepared = liveDiaryPreparedPhotos()
    const schedule = buildPhotoAreaSchedule(prepared)
    const last = schedule.areas[2]
    assert.equal(last.areaName, 'Area C')
    assert.equal(photographicRecordAreaTitle(last.areaName), 'Area C')
    assert.equal(last.photos.length, 3)
  })

  it('no photo is duplicated or omitted; numbers stay continuous across areas', () => {
    const prepared = liveDiaryPreparedPhotos()
    const schedule = buildPhotoAreaSchedule(prepared)
    const captions = schedule.all.map((p) => p.caption)
    assert.deepEqual(captions, ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3'])
    assert.equal(new Set(captions).size, 8)
    assert.deepEqual(
      schedule.all.map((p) => p.reportPhotoNumber),
      [1, 2, 3, 4, 5, 6, 7, 8],
    )
  })

  it('round-trips the same grouping as Location Walk hydrate (groupPhotosByArea)', () => {
    const prepared = liveDiaryPreparedPhotos()
    const fromWalk = groupPhotosByArea(
      prepared.map((p) => ({
        key: p.key,
        storagePath: p.url,
        location: p.location,
        layout: p.layout,
        caption: p.caption,
        sequence: p.sequence_number,
      })),
    )
    const schedule = buildPhotoAreaSchedule(prepared)
    assert.deepEqual(
      fromWalk.map((g) => g.areaName),
      schedule.areas.map((a) => a.areaName),
    )
    assert.deepEqual(
      fromWalk.map((g) => g.photos.length),
      schedule.areas.map((a) => a.photos.length),
    )
  })
})

describe('assignReportPhotoNumbers', () => {
  it('numbers continuously in walk/sequence order', () => {
    const numbered = assignReportPhotoNumbers([
      { key: 'a', layout: 'grid4', sequence_number: 1, location: 'Roof' },
      { key: 'b', layout: 'grid6', sequence_number: 2, location: 'Plant' },
    ])
    assert.deepEqual(
      numbered.map((p) => [p.key, p.reportPhotoNumber]),
      [
        ['a', 1],
        ['b', 2],
      ],
    )
  })
})

describe('buildPhotoSchedule', () => {
  it('keeps continuous numbers inside layout buckets', () => {
    const schedule = buildPhotoSchedule([
      { key: 'f', layout: 'full', sequence_number: 1 },
      { key: 'g', layout: 'grid4', sequence_number: 2 },
    ])
    assert.equal(schedule.full[0].reportPhotoNumber, 1)
    assert.equal(schedule.grid4[0].reportPhotoNumber, 2)
  })
})

describe('photoTileCaption / assignedTo', () => {
  it('caption and assigned-to helpers', () => {
    assert.equal(photoTileCaption({ caption: 'East' }), 'East')
    assert.equal(photoTileAssignedTo({ assignedTo: 'Team' }), 'Team')
    assert.equal(photoTileAssignedToLine({ assignedTo: '' }), '')
  })
})

describe('PDF wiring — visible area sections', () => {
  it('DiaryPdfDocument renders AreaPhotographicSection with area banner per area', () => {
    assert.match(pdfDocument, /buildPhotoAreaSchedule/)
    assert.match(pdfDocument, /function AreaPhotographicSection/)
    assert.match(pdfDocument, /function AreaPhotoSectionBanner/)
    assert.match(pdfDocument, /AreaPhotoSectionBanner accent=\{brandColor\}>\{heading\}/)
    assert.match(pdfDocument, /schedule\.areas\.map/)
    assert.doesNotMatch(pdfDocument, /Photographic record — progress/)
    assert.doesNotMatch(pdfDocument, /Photographic record — site checks/)
  })

  it('photo-area banner must not use record-stream minPresenceAhead (blank-page cause)', () => {
    const areaBanner = pdfDocument.slice(
      pdfDocument.indexOf('function AreaPhotoSectionBanner'),
      pdfDocument.indexOf('function AreaPhotographicSection'),
    )
    assert.doesNotMatch(areaBanner, /minPresenceAhead/)
    assert.doesNotMatch(areaBanner, /wrap=\{false\}/)
    assert.match(areaBanner, /styles\.areaPhotoSectionBanner/)
    assert.match(pdfDocument, /photoPageGridContentHeight\(\{ isAreaStart: isFirst \}\)/)
    // Record-stream SectionBanner keeps the presence guard by default.
    assert.match(pdfDocument, /minPresenceAhead=\{presenceAhead \? SECTION_PRESENCE_AHEAD : undefined\}/)
  })

  it('prepare path keeps location on prepared photos for area grouping', () => {
    assert.match(pdfPhotos, /location: areaName/)
    assert.match(shareLib, /buildDiaryPdfPhotos\(photoRows/)
  })
})

/**
 * Real-path pagination: Area A spans >1 page at 4/page; Area B at 6/page;
 * Area C ends with a single photo. Declaration hosts on the final photo page only.
 */
function multiPageAreaPreparedPhotos() {
  const mk = (location, layout, caption, path) => ({
    key: path,
    src: `https://signed/${path}`,
    preview: `https://signed/${path}`,
    url: path,
    caption,
    location,
    area: location,
    layout,
    sequence_number: 0,
    rotationDegrees: 0,
    assignedTo: '',
  })

  // Area A: 5 photos @ 4/page → 2 pages (4 + 1)
  const areaA = [1, 2, 3, 4, 5].map((n) =>
    mk('Area A', 'grid4', `A${n}`, `user/rep/a${n}.jpg`),
  )
  // Area B: 7 photos @ 6/page → 2 pages (6 + 1)
  const areaB = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    mk('Area B', 'grid6', `B${n}`, `user/rep/b${n}.jpg`),
  )
  // Area C: 1 photo @ 4/page → 1 page
  const areaC = [mk('Area C', 'grid4', 'C1', 'user/rep/c1.jpg')]

  return [...areaA, ...areaB, ...areaC].map((row, index) => ({
    ...row,
    sequence_number: index + 1,
  }))
}

describe('PDF photo-area pagination — no blank pages', () => {
  it('keeps named boundaries, counts/order, and zero empty photo pages', () => {
    const schedule = buildPhotoAreaSchedule(multiPageAreaPreparedPhotos())
    assert.deepEqual(
      schedule.areas.map((a) => [a.areaName, a.layout, a.photos.length]),
      [
        ['Area A', 'grid4', 5],
        ['Area B', 'grid6', 7],
        ['Area C', 'grid4', 1],
      ],
    )

    const pages = buildPhotoAreaPdfPages(schedule)
    assert.equal(pages.length, 5, '2 + 2 + 1 photo pages, no blanks')
    assert.ok(pages.every((p) => p.photos.length > 0), 'zero empty photo pages')

    assert.deepEqual(
      pages.map((p) => [p.areaName, p.photos.length, p.isAreaStart, p.hostsDeclaration]),
      [
        ['Area A', 4, true, false],
        ['Area A', 1, false, false],
        ['Area B', 6, true, false],
        ['Area B', 1, false, false],
        ['Area C', 1, true, true],
      ],
    )

    assert.deepEqual(
      pages.flatMap((p) => p.photos.map((photo) => photo.caption)),
      ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1'],
    )

    // No extra page between area continuation pages: consecutive same-area
    // pages are adjacent in the schedule (index i then i+1).
    for (let i = 0; i < pages.length - 1; i += 1) {
      if (pages[i].areaName === pages[i + 1].areaName) {
        assert.equal(pages[i].isAreaEnd, false)
        assert.equal(pages[i + 1].isAreaStart, false)
      } else {
        assert.equal(pages[i].isAreaEnd, true)
        assert.equal(pages[i + 1].isAreaStart, true)
      }
    }

    // Declaration hosts on the final photo content page only — no blank gap page.
    assert.equal(pages.filter((p) => p.hostsDeclaration).length, 1)
    assert.equal(pages[pages.length - 1].hostsDeclaration, true)
    assert.equal(pages[pages.length - 1].areaName, 'Area C')
  })

  it('never schedules a page with no photos at an area boundary', () => {
    const schedule = buildPhotoAreaSchedule(multiPageAreaPreparedPhotos())
    const pages = buildPhotoAreaPdfPages(schedule)
    for (const page of pages) {
      assert.ok(page.photos.length >= 1)
      assert.ok(page.areaName)
      assert.ok([1, 4, 6].includes(page.perPage))
    }
    // Empty area must not invent a blank page.
    const emptySchedule = {
      areas: [
        { areaName: 'Empty', layout: 'grid4', photos: [] },
        { areaName: 'Has One', layout: 'grid4', photos: schedule.areas[2].photos },
      ],
    }
    const afterEmpty = buildPhotoAreaPdfPages(emptySchedule)
    assert.equal(afterEmpty.length, 1)
    assert.equal(afterEmpty[0].areaName, 'Has One')
    assert.equal(afterEmpty[0].hostsDeclaration, true)
  })
})
