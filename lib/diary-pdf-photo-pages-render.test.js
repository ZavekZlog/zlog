/**
 * Render-level regression: scheduled photo pages === physical React-PDF pages.
 * Proves blanks are not introduced after buildPhotoAreaSchedule.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { pdf, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import {
  createAreaGroup,
  createAreaPhoto,
  flattenAreaGroups,
} from './ai-annotation/area-groups.js'
import {
  buildPhotoAreaPdfPages,
  buildPhotoAreaSchedule,
} from './photo-schedule.js'
import {
  PDF_CONTENT_BOTTOM,
  PDF_GRID_GAP,
  PDF_HEADER_BLOCK_H,
  PDF_PAGE_MARGIN_TOP,
  PDF_PAGE_PAD_X,
  PDF_PHOTO_FRAME_BORDER,
  PDF_PHOTO_FIT,
  computePhotoFrameGeometry,
  photoGridForTier,
  photoPageGridContentHeight,
  photoRowBandHeight,
  resolvePdfAccent,
} from './diary-pdf-layout.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfDocumentSrc = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')

const PIX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN_TOP,
    paddingHorizontal: PDF_PAGE_PAD_X,
    paddingBottom: PDF_CONTENT_BOTTOM,
    fontFamily: 'Helvetica',
  },
  headerShell: { height: PDF_HEADER_BLOCK_H, marginBottom: 18, backgroundColor: '#445566' },
  headerText: { color: '#fff', fontSize: 11, fontFamily: 'Helvetica-Bold', letterSpacing: 1.4 },
  areaBanner: {
    width: '100%',
    marginTop: 0,
    marginBottom: 8,
    paddingVertical: 4.5,
    paddingHorizontal: 7,
  },
  areaBannerText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  photoGridRow: { flexDirection: 'row', alignItems: 'flex-start' },
  photoFrame: {
    borderWidth: PDF_PHOTO_FRAME_BORDER,
    borderStyle: 'solid',
    borderColor: '#9FB1C2',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  photoViewport: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  imageContain: { width: '100%', height: '100%', ...PDF_PHOTO_FIT },
  band: {
    backgroundColor: '#EFF2F4',
    paddingVertical: 3,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  declBanner: {
    width: '100%',
    marginTop: 0,
    paddingVertical: 4.5,
    paddingHorizontal: 7,
  },
  declText: { color: '#fff', fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
})

function countPdfPages(buffer) {
  const text = Buffer.from(buffer).toString('latin1')
  return (text.match(/\/Type\s*\/Page(?!s)/g) || []).length
}

function PhotoGrid({ photos, cols, rows, contentH }) {
  const { frameW, frameH } = computePhotoFrameGeometry({ cols, rows, contentH })
  const chunks = []
  for (let i = 0; i < photos.length; i += cols) chunks.push(photos.slice(i, i + cols))
  return createElement(
    View,
    null,
    ...chunks.map((row, ri) => {
      const bandHeight = photoRowBandHeight(
        row.map((p) => ({
          caption: p.caption || 'Caption for photo with enough words to wrap lines',
          assignedToLine: '',
        })),
        frameW,
      )
      const viewportHeight = Math.max(40, frameH - bandHeight - PDF_PHOTO_FRAME_BORDER * 2)
      return createElement(
        View,
        {
          key: `r${ri}`,
          style: [
            styles.photoGridRow,
            { marginBottom: ri === chunks.length - 1 ? 0 : PDF_GRID_GAP },
          ],
        },
        ...row.map((photo, ci) =>
          createElement(
            View,
            {
              key: photo.key || `p${ci}`,
              style: [
                styles.photoFrame,
                {
                  width: frameW,
                  height: frameH,
                  marginRight: ci === cols - 1 ? 0 : PDF_GRID_GAP,
                },
              ],
            },
            createElement(
              View,
              { style: [styles.photoViewport, { height: viewportHeight }] },
              createElement(Image, { src: photo.src || PIX, style: styles.imageContain }),
            ),
            createElement(
              View,
              { style: [styles.band, { height: bandHeight }] },
              createElement(Text, { style: { fontSize: 7.5 } }, `Photo ${photo.reportPhotoNumber}`),
              createElement(
                Text,
                { style: { fontSize: 7.5 } },
                photo.caption || 'Caption for photo with enough words to wrap lines',
              ),
            ),
          ),
        ),
      )
    }),
  )
}

/**
 * Mirrors AreaPhotographicSection + DeclarationPage constraints locked in
 * DiaryPdfDocument (slack contentH, no wrap={false} on area banner, declaration
 * on its own page after photos).
 */
function renderPhotoEvidenceDocument(schedule) {
  const pages = buildPhotoAreaPdfPages(schedule)
  const accent = resolvePdfAccent('#334455')
  const photoPages = pages.map((page) => {
    const { cols, rows } = photoGridForTier(page.perPage)
    const contentH = photoPageGridContentHeight({ isAreaStart: page.isAreaStart })
    return createElement(
      Page,
      { key: `${page.areaName}-${page.photos[0]?.reportPhotoNumber}`, size: 'A4', style: styles.page },
      createElement(
        View,
        { style: styles.headerShell },
        createElement(Text, { style: styles.headerText }, page.areaName),
      ),
      page.isAreaStart
        ? createElement(
            View,
            { style: [styles.areaBanner, { backgroundColor: accent }] },
            createElement(Text, { style: styles.areaBannerText }, page.areaName.toUpperCase()),
          )
        : null,
      createElement(PhotoGrid, {
        photos: page.photos,
        cols,
        rows,
        contentH,
      }),
    )
  })

  const declarationPage = createElement(
    Page,
    { key: 'declaration', size: 'A4', style: styles.page },
    createElement(
      View,
      { style: styles.headerShell },
      createElement(Text, { style: styles.headerText }, 'Declaration & signature'),
    ),
    createElement(
      View,
      { style: [styles.declBanner, { backgroundColor: accent }] },
      createElement(Text, { style: styles.declText }, 'DECLARATION & SIGNATURE'),
    ),
    createElement(
      Text,
      { style: { fontSize: 9, marginTop: 8, lineHeight: 1.45 } },
      'I hereby certify that the contents of this site report are true and accurate.',
    ),
  )

  return createElement(Document, null, ...photoPages, declarationPage)
}

function liveMultiAreaPrepared() {
  const areaA = createAreaGroup('Area A', 4)
  areaA.photos = [1, 2, 3, 4, 5].map((n) =>
    createAreaPhoto({
      file: null,
      preview: PIX,
      imageUrl: `user/rep/a${n}.jpg`,
      description: `Area A photo ${n} with a longer caption for band height`,
    }),
  )
  const areaB = createAreaGroup('Area B', 6)
  areaB.photos = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    createAreaPhoto({
      file: null,
      preview: PIX,
      imageUrl: `user/rep/b${n}.jpg`,
      description: `Area B photo ${n}`,
    }),
  )
  const areaC = createAreaGroup('Area C', 4)
  areaC.photos = [
    createAreaPhoto({
      file: null,
      preview: PIX,
      imageUrl: 'user/rep/c1.jpg',
      description: 'Final single photo',
    }),
  ]

  return flattenAreaGroups([areaA, areaB, areaC]).map((row) => ({
    key: row.storagePath || row.key,
    src: PIX,
    preview: PIX,
    url: row.storagePath,
    caption: row.caption,
    location: row.location,
    area: row.area,
    layout: row.layout,
    sequence_number: row.sequence_number,
    rotationDegrees: row.rotationDegrees || 0,
    assignedTo: '',
  }))
}

describe('DiaryPdfDocument photo-page render constraints (source)', () => {
  it('uses slack content height and never nests declaration in a photo page', () => {
    assert.match(pdfDocumentSrc, /photoPageGridContentHeight\(\{ isAreaStart: isFirst \}\)/)
    assert.match(pdfDocumentSrc, /function DeclarationPage\(/)
    assert.match(pdfDocumentSrc, /\{lastHost === 'photos' \? \(\s*<DeclarationPage/)
    const areaBanner = pdfDocumentSrc.slice(
      pdfDocumentSrc.indexOf('function AreaPhotoSectionBanner'),
      pdfDocumentSrc.indexOf('function AreaPhotographicSection'),
    )
    assert.doesNotMatch(areaBanner, /wrap=\{false\}/)
    assert.doesNotMatch(areaBanner, /minPresenceAhead/)
  })
})

describe('React-PDF photo pages — scheduled count equals physical count', () => {
  it('renders multi-area mixed 4/6 pages with zero blank pages before declaration', async () => {
    const schedule = buildPhotoAreaSchedule(liveMultiAreaPrepared())
    const scheduled = buildPhotoAreaPdfPages(schedule)

    assert.equal(scheduled.length, 5)
    assert.ok(scheduled.every((p) => p.photos.length > 0))
    assert.deepEqual(
      scheduled.map((p) => [p.areaName, p.photos.length, p.perPage, p.isAreaStart]),
      [
        ['Area A', 4, 4, true],
        ['Area A', 1, 4, false],
        ['Area B', 6, 6, true],
        ['Area B', 1, 6, false],
        ['Area C', 1, 4, true],
      ],
    )

    const doc = renderPhotoEvidenceDocument(schedule)
    const blob = await pdf(doc).toBlob()
    const physical = countPdfPages(await blob.arrayBuffer())

    // 5 scheduled photo pages + 1 declaration page with real content — no blanks.
    assert.equal(physical, scheduled.length + 1)
    assert.equal(physical - scheduled.length, 1, 'only declaration may follow; zero blank pages')
  })

  it('photoPageGridContentHeight always leaves slack under full content height', () => {
    const start = photoPageGridContentHeight({ isAreaStart: true })
    const cont = photoPageGridContentHeight({ isAreaStart: false })
    assert.ok(cont < 677.89)
    assert.ok(start < cont)
    assert.equal(cont - start, 32)
  })
})
