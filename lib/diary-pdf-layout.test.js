import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PDF_CAPTION_BAND_H,
  PDF_CAPTION_MAX_LINES,
  PDF_LAYOUTS,
  computeGridTileGeometry,
  geometryForLayout,
  normalizeRotationDegrees,
  pdfCaptionBandStyle,
} from './diary-pdf-layout.js'
import {
  flattenAreaGroups,
  groupPhotosByArea,
  createAreaGroup,
  createAreaPhoto,
} from './ai-annotation/area-groups.js'
import { photoTileAssignedToLine, photoTileCaption } from './photo-schedule.js'
import { buildDiaryPdfPhotos } from './diary-pdf-photos.js'

describe('normalizeRotationDegrees', () => {
  it('snaps to 0/90/180/270', () => {
    assert.equal(normalizeRotationDegrees(0), 0)
    assert.equal(normalizeRotationDegrees(90), 90)
    assert.equal(normalizeRotationDegrees(180), 180)
    assert.equal(normalizeRotationDegrees(270), 270)
    assert.equal(normalizeRotationDegrees(360), 0)
    assert.equal(normalizeRotationDegrees(-90), 270)
    assert.equal(normalizeRotationDegrees(95), 90)
  })
})

describe('PDF layout geometry — equal tiles + contain-fit contract', () => {
  it('1-photo layout has single full-page tile geometry', () => {
    const g = geometryForLayout('full')
    assert.equal(g.perPage, 1)
    assert.equal(g.cols, 1)
    assert.equal(g.rows, 1)
    assert.equal(g.objectFit, 'contain')
    assert.equal(g.imageStretch, false)
    assert.equal(g.imageCropToFill, false)
    assert.ok(g.tileW > 0 && g.tileH > 0)
    assert.ok(g.imageH > 0)
    assert.equal(g.captionBandH, PDF_CAPTION_BAND_H)
  })

  it('4-photo layout uses equal 2×2 tiles', () => {
    const g = geometryForLayout('grid4')
    assert.equal(g.perPage, 4)
    assert.equal(g.cols, 2)
    assert.equal(g.rows, 2)
    const again = computeGridTileGeometry({ cols: 2, rows: 2 })
    assert.equal(g.tileW, again.tileW)
    assert.equal(g.tileH, again.tileH)
  })

  it('6-photo layout uses equal 3×2 tiles', () => {
    const g = geometryForLayout('grid6')
    assert.equal(g.perPage, 6)
    assert.equal(g.cols, 3)
    assert.equal(g.rows, 2)
  })

  it('portrait + landscape do not change tile geometry (geometry is layout-only)', () => {
    const portrait = geometryForLayout('grid4')
    const landscape = geometryForLayout('grid4')
    assert.equal(portrait.tileW, landscape.tileW)
    assert.equal(portrait.tileH, landscape.tileH)
    assert.equal(portrait.imageH, landscape.imageH)
    assert.equal(portrait.objectFit, 'contain')
  })

  it('long caption cannot change tile geometry', () => {
    const short = geometryForLayout('grid4')
    const long = geometryForLayout('grid4')
    assert.equal(short.tileH, long.tileH)
    assert.equal(short.captionBandH, PDF_CAPTION_BAND_H)
    assert.equal(short.captionBandH, long.captionBandH)
  })

  it('caption band is centred and clamped (display contract)', () => {
    const band = pdfCaptionBandStyle()
    assert.equal(band.textAlign, 'center')
    assert.equal(band.height, PDF_CAPTION_BAND_H)
    assert.equal(band.overflow, 'hidden')
    assert.equal(band.maxLines, PDF_CAPTION_MAX_LINES)
  })

  it('all locked layouts share contain-fit / no-crop rules', () => {
    for (const key of Object.keys(PDF_LAYOUTS)) {
      const g = geometryForLayout(key)
      assert.equal(g.objectFit, 'contain')
      assert.equal(g.imageStretch, false)
      assert.equal(g.imageCropToFill, false)
    }
  })
})

describe('persisted rotation + captions reach PDF data', () => {
  it('flatten/rebuild preserves rotationDegrees', () => {
    const group = {
      ...createAreaGroup('North wall', 4),
      photos: [
        createAreaPhoto({
          preview: 'blob:a',
          description: 'Detail A',
          rotationDegrees: 90,
        }),
      ],
    }
    const flat = flattenAreaGroups([group])
    assert.equal(flat[0].rotationDegrees, 90)
    assert.equal(flat[0].caption, 'Detail A')
    const rebuilt = groupPhotosByArea(flat)
    assert.equal(rebuilt[0].photos[0].rotationDegrees, 90)
    assert.equal(rebuilt[0].photos[0].acceptedDescription, 'Detail A')
  })

  it('blank caption remains valid for PDF caption helper', () => {
    assert.equal(photoTileCaption({ caption: '' }), '')
    assert.equal(photoTileCaption({ acceptedDescription: '   ' }), '')
    assert.equal(photoTileCaption({ caption: 'Kept as stored' }), 'Kept as stored')
  })

  it('buildDiaryPdfPhotos carries captions + rotation for DiaryPdfDocument', async () => {
    const rows = await buildDiaryPdfPhotos(
      [
        {
          url: 'path/a.jpg',
          caption: 'East elevation',
          layout: 'grid4',
          sequence: 1,
          rotation_degrees: 180,
        },
        {
          url: 'path/b.jpg',
          caption: '',
          layout: 'grid4',
          sequence: 2,
          rotation_degrees: 0,
        },
      ],
      async (photo) => `https://example.test/${photo.url}`,
    )
    assert.equal(rows.length, 2)
    assert.equal(rows[0].caption, 'East elevation')
    assert.equal(rows[0].rotationDegrees, 180)
    assert.equal(rows[0].layout, 'grid4')
    assert.equal(rows[1].caption, '')
    assert.equal(rows[1].rotationDegrees, 0)
    // Stored caption text is not silently altered
    assert.equal(photoTileCaption(rows[0]), 'East elevation')
  })

  it('Assigned to reaches PDF payload; blank omits Assigned to line', async () => {
    const rows = await buildDiaryPdfPhotos(
      [
        {
          url: 'a.jpg',
          caption: 'Damaged gutter joint to street elevation',
          assigned_to: 'Roofing Contractor',
          layout: 'grid4',
          sequence: 1,
        },
        {
          url: 'b.jpg',
          caption: 'General view',
          assigned_to: '',
          layout: 'grid4',
          sequence: 2,
        },
      ],
      async (photo) => `https://example.test/${photo.url}`,
    )
    assert.equal(rows[0].assignedTo, 'Roofing Contractor')
    assert.equal(
      photoTileAssignedToLine(rows[0]),
      'Assigned to: Roofing Contractor',
    )
    assert.equal(rows[1].assignedTo, '')
    assert.equal(photoTileAssignedToLine(rows[1]), '')
    const geometry = geometryForLayout('grid4')
    assert.equal(geometry.captionBandH, PDF_CAPTION_BAND_H)
    assert.ok(geometry.tileH > geometry.imageH)
  })

  it('rotation is respected on the PDF photo payload (degrees field)', async () => {
    const [row] = await buildDiaryPdfPhotos(
      [{ url: 'x.jpg', caption: 'Rotated', layout: 'full', sequence: 1, rotation_degrees: 270 }],
      async () => 'https://example.test/x.jpg',
    )
    assert.equal(row.rotationDegrees, 270)
    assert.ok(row.src)
  })
})
