'use client'

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import {
  PdfHeader,
  PdfFooter,
  PDF_HEADER_OFFSET,
  PDF_FOOTER_OFFSET,
} from '@/components/pdf/PdfHeader'

const PAGE_PAD_X = 28
const PAGE_INNER_W = 595.28 - PAGE_PAD_X * 2 // A4 width minus horizontal padding
const CONTENT_TOP = PDF_HEADER_OFFSET + 12
const CONTENT_BOTTOM = PDF_FOOTER_OFFSET + 8
const CONTENT_H = 841.89 - CONTENT_TOP - CONTENT_BOTTOM

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
  // Shared photo frame
  frame: {
    borderWidth: 1.25,
    borderColor: '#2a2a2a',
    borderStyle: 'solid',
    backgroundColor: '#f7f7f7',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
  },
  caption: {
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: '#222',
    marginTop: 6,
    lineHeight: 1.35,
  },
  // Full-page tile
  fullFrame: {
    width: PAGE_INNER_W,
    height: CONTENT_H - 8,
  },
  fullImage: {
    width: '100%',
    flex: 1,
    objectFit: 'cover',
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

function FramedPhoto({ src, caption, frameStyle, imageStyle, photoNumber, brandColor }) {
  if (!src) return null
  const color = brandColor || '#FF5000'
  return (
    <View style={[styles.frame, frameStyle]}>
      <View style={[styles.imageWrap, imageStyle?.flex === 1 ? { flex: 1 } : null]}>
        <Image src={src} style={imageStyle} />
        {photoNumber != null ? (
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>#{photoNumber}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>{caption?.trim() ? caption.trim() : ' '}</Text>
    </View>
  )
}

function FullPagePhotos({ photos, brandColor, logoUrl, companyName, numberOffset = 0 }) {
  return photos.map((photo, i) => (
    <Page key={`full-${photo.key || i}`} size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="Site Diary — Detail photo"
      />
      <FramedPhoto
        src={photo.src || photo.preview || photo.url}
        caption={photo.caption}
        frameStyle={styles.fullFrame}
        imageStyle={styles.fullImage}
        photoNumber={numberOffset + i + 1}
        brandColor={brandColor}
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
  numberOffset = 0,
}) {
  const gap = 10
  const tileW = (PAGE_INNER_W - gap * (cols - 1)) / cols
  const captionBlock = 28
  const framePad = 12
  const availableH = CONTENT_H - gap * (rows - 1)
  const tileH = availableH / rows
  const imageH = Math.max(40, tileH - captionBlock - framePad)

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
          <View key={`row-${ri}`} style={styles.gridRow}>
            {row.map((photo, ci) => {
              const flatIndex = pageIndex * perPage + ri * cols + ci
              return (
                <FramedPhoto
                  key={photo.key || `${pageIndex}-${ri}-${ci}`}
                  src={photo.src || photo.preview || photo.url}
                  caption={photo.caption}
                  frameStyle={{ width: tileW, height: tileH }}
                  imageStyle={{ width: '100%', height: imageH, objectFit: 'cover' }}
                  photoNumber={numberOffset + flatIndex + 1}
                  brandColor={brandColor}
                />
              )
            })}
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
 * photos: [{ key?, src|preview|url, caption, layout: 'full'|'grid4'|'grid6' }]
 * equipmentHire: [{ description, supplier, quantity, status }]
 */
export function DiaryPdfDocument({
  projectName = '',
  reportDate = '',
  siteSummary = '',
  brandColor,
  logoUrl,
  companyName,
  photos = [],
  equipmentHire = [],
  authorName = '',
  authorRole = '',
  signatureSrc = null,
}) {
  const full = photos.filter((p) => (p.layout || 'grid4') === 'full')
  const grid4 = photos.filter((p) => (p.layout || 'grid4') === 'grid4')
  const grid6 = photos.filter((p) => p.layout === 'grid6')

  const fullOffset = 0
  const grid4Offset = full.length
  const grid6Offset = full.length + grid4.length

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
        {companyName ? <Text style={styles.meta}>Prepared for: {companyName}</Text> : null}
        <Text style={styles.section}>Site summary</Text>
        <Text style={styles.body}>{siteSummary || '—'}</Text>
        <EquipmentHireTable items={equipmentHire} brandColor={brandColor} />
      </Page>

      <FullPagePhotos
        photos={full}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        numberOffset={fullOffset}
      />

      <GridPages
        photos={grid4}
        perPage={4}
        cols={2}
        rows={2}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Site Diary — Progress photos"
        numberOffset={grid4Offset}
      />

      <GridPages
        photos={grid6}
        perPage={6}
        cols={3}
        rows={2}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Site Diary — Site checks"
        numberOffset={grid6Offset}
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
