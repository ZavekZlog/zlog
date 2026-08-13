'use client'

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import {
  PdfHeader,
  PdfFooter,
  PDF_HEADER_OFFSET,
  PDF_FOOTER_OFFSET,
} from '@/components/pdf/PdfHeader'
import {
  buildPhotoSchedule,
  photoReferenceLabel,
  photoTileAssignedToLine,
  photoTileCaption,
} from '@/lib/photo-schedule'
import {
  PDF_ASSIGNED_MAX_LINES,
  PDF_CAPTION_BAND_H,
  PDF_CAPTION_MAX_LINES,
  PDF_CONTENT_H,
  PDF_FRAME_PAD,
  PDF_GRID_GAP,
  PDF_PAGE_INNER_W,
  computeGridTileGeometry,
  pdfCaptionBandStyle,
} from '@/lib/diary-pdf-layout'

const PAGE_PAD_X = 28
const PAGE_INNER_W = PDF_PAGE_INNER_W
const CONTENT_TOP = PDF_HEADER_OFFSET + 12
const CONTENT_BOTTOM = PDF_FOOTER_OFFSET + 8
const CONTENT_H = PDF_CONTENT_H

/** Neutral fill behind contain-fitted photographs */
const IMAGE_WELL = '#f2f2f2'
/** Fine perimeter around each photo tile */
const TILE_BORDER = '#2a2a2a'

const DECLARATION =
  'I hereby certify that the contents of this site report are true and accurate to the best of my knowledge and belief, and that the information recorded herein fairly represents the works, conditions, and observations for the date stated.'

const styles = StyleSheet.create({
  page: {
    paddingTop: CONTENT_TOP,
    paddingHorizontal: PAGE_PAD_X,
    paddingBottom: CONTENT_BOTTOM,
    fontSize: 10,
    color: '#1a1a1a',
    fontFamily: 'Helvetica',
  },
  h1: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  meta: { fontSize: 9, color: '#555', marginBottom: 4 },
  section: { marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: 700 },
  body: { fontSize: 10, lineHeight: 1.45, marginBottom: 4 },
  // Shared photo tile — fixed outer frame; image region never crops
  frame: {
    borderWidth: 0.75,
    borderColor: TILE_BORDER,
    borderStyle: 'solid',
    backgroundColor: '#ffffff',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
  },
  imageWell: {
    width: '100%',
    backgroundColor: IMAGE_WELL,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Contain-fit only: scale down into fixed region, never crop / stretch / enlarge frame
  imageContain: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  coverWrap: {
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 0.75,
    borderColor: TILE_BORDER,
    borderStyle: 'solid',
    backgroundColor: IMAGE_WELL,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  photoRef: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#333',
    marginTop: 2,
    lineHeight: 1.3,
    textAlign: 'center',
  },
  assignedTo: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#555',
    marginTop: 2,
    lineHeight: 1.25,
    textAlign: 'center',
  },
  captionBand: {
    height: PDF_CAPTION_BAND_H,
    overflow: 'hidden',
    marginTop: 4,
    justifyContent: 'flex-start',
  },
  // Full-page tile
  fullFrame: {
    width: PAGE_INNER_W,
    height: CONTENT_H - 8,
  },
  // Grid rows
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  hireSectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hireTable: {
    borderWidth: 1.5,
    borderStyle: 'solid',
    width: '100%',
  },
  hireHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomStyle: 'solid',
  },
  hireRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#333',
  },
  hireCell: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  hireHeaderCell: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colDesc: { width: '34%' },
  colSupplier: { width: '28%' },
  colQty: { width: '14%' },
  colStatus: { width: '24%' },
  hireEmpty: {
    fontSize: 9,
    color: '#666',
    fontFamily: 'Helvetica',
    marginTop: 4,
  },
  colTrade: { width: '32%' },
  colCompany: { width: '32%' },
  colOps: { width: '18%' },
  colHours: { width: '18%' },
  labourTotals: {
    marginTop: 6,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#444',
  },
  // Signature / declaration page
  signTitle: {
    marginBottom: 12,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  signDeclaration: {
    fontSize: 10,
    lineHeight: 1.5,
    color: '#222',
    marginBottom: 20,
    fontFamily: 'Helvetica',
  },
  signRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  signMeta: {
    flex: 1,
    paddingRight: 16,
  },
  signLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
    marginTop: 12,
  },
  signValue: {
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    borderBottomStyle: 'solid',
  },
  signFrame: {
    width: 220,
    borderWidth: 1.5,
    borderStyle: 'solid',
    backgroundColor: '#fafafa',
    padding: 10,
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signFrameLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  signImage: {
    width: 190,
    height: 90,
    objectFit: 'contain',
  },
  signPlaceholder: {
    fontSize: 9,
    color: '#999',
    fontFamily: 'Helvetica-Oblique',
  },
})

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function PageChrome({ brandColor, logoUrl, companyName, reportTitle }) {
  return (
    <>
      <PdfHeader
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle={reportTitle}
      />
      <PdfFooter brandColor={brandColor} />
    </>
  )
}

/**
 * Fixed-frame photo tile:
 * - contain-fit image (no crop / stretch / distort)
 * - sequential "Photo N" reference (no timestamp)
 * - centred caption in a fixed-height band (long captions clamp; tile size unchanged)
 * - fine perimeter
 * Rotation must be baked into `src` by the export pipeline when non-zero.
 */
function FramedPhoto({ src, caption, assignedToLine, frameStyle, imageRegionStyle, photoNumber }) {
  if (!src) return null
  const refLabel = photoReferenceLabel(photoNumber)
  const captionText = typeof caption === 'string' ? caption.trim() : ''
  const assignedLine = typeof assignedToLine === 'string' ? assignedToLine.trim() : ''
  const band = pdfCaptionBandStyle()
  return (
    <View style={[styles.frame, frameStyle]}>
      <View style={[styles.imageWell, imageRegionStyle]}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        <Image src={src} style={styles.imageContain} />
      </View>
      <View style={[styles.captionBand, { height: band.height, overflow: band.overflow }]}>
        <Text style={styles.photoRef}>{refLabel}</Text>
        <Text style={styles.caption} maxLines={band.maxLines || PDF_CAPTION_MAX_LINES}>
          {captionText || ' '}
        </Text>
        {assignedLine ? (
          <Text
            style={styles.assignedTo}
            maxLines={band.assignedMaxLines || PDF_ASSIGNED_MAX_LINES}
          >
            {assignedLine}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function FullPagePhotos({ photos, brandColor, logoUrl, companyName }) {
  const imageH = Math.max(80, CONTENT_H - 8 - PDF_CAPTION_BAND_H - PDF_FRAME_PAD)

  return photos.map((photo, i) => (
    <Page key={`full-${photo.key || photo.reportPhotoNumber || i}`} size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="Site Diary — Detail photo"
      />
      <FramedPhoto
        src={photo.src || photo.preview || photo.url}
        caption={photoTileCaption(photo)}
        assignedToLine={photoTileAssignedToLine(photo)}
        frameStyle={[styles.fullFrame, { height: CONTENT_H - 8 }]}
        imageRegionStyle={{ height: imageH, flexGrow: 0 }}
        photoNumber={photo.reportPhotoNumber}
      />
    </Page>
  ))
}

function GridPages({
  photos,
  perPage,
  cols,
  rows,
  brandColor,
  logoUrl,
  companyName,
  title,
}) {
  const geometry = computeGridTileGeometry({
    cols,
    rows,
    pageInnerW: PAGE_INNER_W,
    contentH: CONTENT_H,
    gap: PDF_GRID_GAP,
    captionBandH: PDF_CAPTION_BAND_H,
    framePad: PDF_FRAME_PAD,
  })
  const { tileW, tileH, imageH } = geometry

  const pages = chunk(photos, perPage)

  return pages.map((pagePhotos, pageIndex) => {
    const rowChunks = chunk(pagePhotos, cols)
    return (
      <Page key={`grid-${perPage}-${pageIndex}`} size="A4" style={styles.page}>
        <PageChrome
          brandColor={brandColor}
          logoUrl={logoUrl}
          companyName={companyName}
          reportTitle={title}
        />
        {rowChunks.map((row, ri) => (
          <View key={`row-${ri}`} style={[styles.gridRow, { marginBottom: PDF_GRID_GAP }]}>
            {row.map((photo, ci) => (
              <FramedPhoto
                key={photo.key || `${pageIndex}-${ri}-${ci}`}
                src={photo.src || photo.preview || photo.url}
                caption={photoTileCaption(photo)}
                assignedToLine={photoTileAssignedToLine(photo)}
                frameStyle={{ width: tileW, height: tileH }}
                imageRegionStyle={{ width: '100%', height: imageH }}
                photoNumber={photo.reportPhotoNumber}
              />
            ))}
            {row.length < cols
              ? Array.from({ length: cols - row.length }).map((_, pi) => (
                  <View key={`pad-${pi}`} style={{ width: tileW, height: tileH }} />
                ))
              : null}
          </View>
        ))}
      </Page>
    )
  })
}

function LabourTable({ items = [], brandColor = '#FF5000' }) {
  const borderColor = brandColor || '#FF5000'
  const rows = Array.isArray(items)
    ? items.filter(
        (i) =>
          i &&
          (String(i.trade || '').trim() ||
            String(i.company || '').trim() ||
            (i.headcount != null && i.headcount !== '') ||
            (i.count != null && i.count !== '') ||
            (i.hours != null && i.hours !== '')),
      )
    : []

  let operatives = 0
  let hours = 0
  for (const row of rows) {
    const hc = Number(row.headcount ?? row.count ?? 0)
    const h = Number(row.hours ?? 0)
    if (Number.isFinite(hc)) operatives += hc
    if (Number.isFinite(h)) hours += h
  }

  return (
    <View>
      <Text style={[styles.hireSectionTitle, { color: borderColor }]}>LABOUR</Text>
      {rows.length === 0 ? (
        <Text style={styles.hireEmpty}>No labour recorded.</Text>
      ) : (
        <>
          <View style={[styles.hireTable, { borderColor }]}>
            <View style={[styles.hireHeaderRow, { backgroundColor: borderColor, borderBottomColor: borderColor }]}>
              <Text style={[styles.hireHeaderCell, styles.colTrade]}>Trade</Text>
              <Text style={[styles.hireHeaderCell, styles.colCompany]}>Company</Text>
              <Text style={[styles.hireHeaderCell, styles.colOps]}>Operatives</Text>
              <Text style={[styles.hireHeaderCell, styles.colHours]}>Hours</Text>
            </View>
            {rows.map((item, index) => (
              <View
                key={`labour-${index}`}
                style={[
                  styles.hireRow,
                  index === rows.length - 1 ? { borderBottomWidth: 0 } : null,
                ]}
              >
                <Text style={[styles.hireCell, styles.colTrade]}>{item.trade || '—'}</Text>
                <Text style={[styles.hireCell, styles.colCompany]}>{item.company || '—'}</Text>
                <Text style={[styles.hireCell, styles.colOps]}>
                  {item.headcount != null && item.headcount !== ''
                    ? String(item.headcount)
                    : item.count != null && item.count !== ''
                      ? String(item.count)
                      : '—'}
                </Text>
                <Text style={[styles.hireCell, styles.colHours]}>
                  {item.hours != null && item.hours !== '' ? String(item.hours) : '—'}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.labourTotals}>
            Totals: {operatives} operative{operatives === 1 ? '' : 's'} · {Math.round(hours * 100) / 100} hours
          </Text>
        </>
      )}
    </View>
  )
}

function EquipmentHireTable({ items = [], brandColor = '#FF5000' }) {
  const borderColor = brandColor || '#FF5000'
  const rows = Array.isArray(items)
    ? items.filter(
        (i) =>
          i &&
          (String(i.description || '').trim() ||
            String(i.supplier || '').trim() ||
            (i.quantity != null && i.quantity !== '') ||
            (i.status && i.status !== 'Active')),
      )
    : []

  return (
    <View>
      <Text style={[styles.hireSectionTitle, { color: borderColor }]}>EQUIPMENT ON HIRE</Text>
      {rows.length === 0 ? (
        <Text style={styles.hireEmpty}>No equipment on hire recorded.</Text>
      ) : (
        <View style={[styles.hireTable, { borderColor }]}>
          <View style={[styles.hireHeaderRow, { backgroundColor: borderColor, borderBottomColor: borderColor }]}>
            <Text style={[styles.hireHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.hireHeaderCell, styles.colSupplier]}>Supplier</Text>
            <Text style={[styles.hireHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.hireHeaderCell, styles.colStatus]}>Status</Text>
          </View>
          {rows.map((item, index) => (
            <View
              key={`hire-${index}`}
              style={[
                styles.hireRow,
                index === rows.length - 1 ? { borderBottomWidth: 0 } : null,
              ]}
            >
              <Text style={[styles.hireCell, styles.colDesc]}>{item.description || '—'}</Text>
              <Text style={[styles.hireCell, styles.colSupplier]}>{item.supplier || '—'}</Text>
              <Text style={[styles.hireCell, styles.colQty]}>
                {item.quantity != null && item.quantity !== '' ? String(item.quantity) : '—'}
              </Text>
              <Text style={[styles.hireCell, styles.colStatus]}>{item.status || '—'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function SignaturePage({
  brandColor,
  logoUrl,
  companyName,
  authorName,
  authorRole,
  reportDate,
  signatureSrc,
}) {
  const color = brandColor || '#FF5000'

  return (
    <Page size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="Site Diary — Declaration & signature"
      />
      <Text style={[styles.signTitle, { color }]}>Declaration & signature</Text>
      <Text style={styles.signDeclaration}>{DECLARATION}</Text>
      <View style={styles.signRow}>
        <View style={styles.signMeta}>
          <Text style={styles.signLabel}>Author name</Text>
          <Text style={styles.signValue}>{authorName?.trim() || '—'}</Text>
          <Text style={styles.signLabel}>Position / role</Text>
          <Text style={styles.signValue}>{authorRole?.trim() || '—'}</Text>
          <Text style={styles.signLabel}>Date</Text>
          <Text style={styles.signValue}>{reportDate || '—'}</Text>
        </View>
        <View style={[styles.signFrame, { borderColor: color }]}>
          <Text style={styles.signFrameLabel}>Signature</Text>
          {signatureSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
            <Image src={signatureSrc} style={styles.signImage} />
          ) : (
            <Text style={styles.signPlaceholder}>No signature captured</Text>
          )}
        </View>
      </View>
    </Page>
  )
}

/**
 * Diary PDF with summary page + photo pages by layout tier:
 * full (1/page), grid4 (2×2), grid6 (3×2), then declaration/signature.
 *
 * Photo schedule rules:
 * - contain-fit only inside fixed frames (no crop / stretch)
 * - continuous Photo 1..N across the whole report (recalculated at generation)
 * - caption + fine perimeter; no timestamps on tiles
 *
 * photos: [{ key?, src|preview|url, caption, layout: 'full'|'grid4'|'grid6', sequence_number? }]
 * labour: [{ trade, company, headcount|count, hours }]
 * equipmentHire: [{ description, supplier, quantity, status }]
 */
export function DiaryPdfDocument({
  projectName = '',
  reportDate = '',
  siteSummary = '',
  brandColor,
  logoUrl,
  companyName,
  coverPhotoUrl = null,
  photos = [],
  labour = [],
  equipmentHire = [],
  authorName = '',
  authorRole = '',
  signatureSrc = null,
}) {
  const schedule = buildPhotoSchedule(photos)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PageChrome
          brandColor={brandColor}
          logoUrl={logoUrl}
          companyName={companyName}
          reportTitle="Site Diary Report"
        />
        <Text style={styles.h1}>{projectName || 'Site Diary'}</Text>
        <Text style={styles.meta}>Report date: {reportDate || '—'}</Text>
        {companyName ? <Text style={styles.meta}>Reporting company: {companyName}</Text> : null}
        {coverPhotoUrl ? (
          <View style={styles.coverWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={coverPhotoUrl} style={styles.coverImage} />
          </View>
        ) : null}
        <Text style={styles.section}>Site summary</Text>
        <Text style={styles.body}>{siteSummary || '—'}</Text>
        <LabourTable items={labour} brandColor={brandColor} />
        <EquipmentHireTable items={equipmentHire} brandColor={brandColor} />
      </Page>

      <FullPagePhotos
        photos={schedule.full}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
      />

      <GridPages
        photos={schedule.grid4}
        perPage={4}
        cols={2}
        rows={2}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Site Diary — Progress photos"
      />

      <GridPages
        photos={schedule.grid6}
        perPage={6}
        cols={3}
        rows={2}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Site Diary — Site checks"
      />

      <SignaturePage
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        authorName={authorName}
        authorRole={authorRole}
        reportDate={reportDate}
        signatureSrc={signatureSrc}
      />
    </Document>
  )
}
