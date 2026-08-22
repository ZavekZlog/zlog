'use client'

import { Document, Page, Text, View, Image, Link, Font, StyleSheet } from '@react-pdf/renderer'
import { PdfHeader, PdfFooter } from '@/components/pdf/PdfHeader'
import { computeProjectDay, formatProjectDateDisplay } from '@/lib/project-day'
import {
  buildPhotoSchedule,
  photoReferenceLabel,
  photoTileAssignedToLine,
  photoTileCaption,
} from '@/lib/photo-schedule'
import {
  PDF_CONTENT_BOTTOM,
  PDF_CONTENT_H,
  PDF_GRID_GAP,
  PDF_PAGE_H,
  PDF_CONTENT_TOP,
  PDF_PAGE_MARGIN_TOP,
  PDF_PAGE_PAD_X,
  PDF_PAGE_W,
  PDF_PHOTO_BAND_PAD_X,
  PDF_PHOTO_BAND_PAD_Y,
  PDF_PHOTO_CAPTION_MAX_LINES,
  PDF_PHOTO_CAPTION_SIZE,
  PDF_PHOTO_FIT,
  PDF_PHOTO_FRAME_BORDER,
  PDF_PHOTO_RULE_W,
  computePhotoFrameGeometry,
  paginatePdfPhotos,
  photoGridForTier,
  photoRowBandHeight,
  resolvePdfAccent,
} from '@/lib/diary-pdf-layout'

const CONTENT_H = PDF_CONTENT_H

const INK = '#1C2126'
const BODY = '#39424B'
const MUTED = '#6B7580'
const ZLOG_URL = 'https://zlog.app'

/**
 * react-pdf breaks a word wherever the line runs out, which splits personal
 * and company names mid-word inside narrow schedule columns. Wrap whole words
 * instead. Only a token longer than any column could hold is offered break
 * points, so a runaway string still cannot escape its cell.
 */
const WHOLE_WORD_LIMIT = 22
Font.registerHyphenationCallback((word) => {
  if (word.length <= WHOLE_WORD_LIMIT) return [word]
  // A double-barrelled name belongs on its hyphen, nowhere else.
  const atHyphens = word.split(/(?<=-)/)
  if (atHyphens.every((part) => part.length <= WHOLE_WORD_LIMIT)) return atHyphens
  const parts = []
  for (let index = 0; index < word.length; index += WHOLE_WORD_LIMIT) {
    parts.push(word.slice(index, index + WHOLE_WORD_LIMIT))
  }
  return parts
})

/**
 * Shared tabular design tokens. Page 1's PROJECT / REPORT DETAILS grid is the
 * reference design; every structured schedule in the report draws from these
 * same tokens so no table can drift away from it visually.
 */
const TABLE_BORDER = '#9FB1C2'
const TABLE_RULE = '#C3CFDA'
/**
 * One gridline system for every schedule and boxed group. The perimeter is
 * fractionally stronger than the internal rules — enough to read as hierarchy
 * in print and after photocopying, never enough to look like a spreadsheet.
 */
const TABLE_BORDER_W = 1.1
const TABLE_RULE_W = 0.9
const TABLE_LABEL_BG = '#EFF2F4'
const TABLE_LABEL_INK = '#3D464E'
const TABLE_PAD_Y = 5.5
const TABLE_PAD_X = 7
const TABLE_LABEL_SIZE = 7.8
const TABLE_VALUE_SIZE = 9

/**
 * Space a section must have after its banner before it may open on a page:
 * a column header plus one data row, even a wrapped three-line one. Set any
 * higher and sections stop packing onto the space genuinely available.
 */
const SECTION_PRESENCE_AHEAD = 72

/**
 * Page 1 geometry. Only the outer frame, the header banner and the footer are
 * absolutely positioned — those are fixed page furniture. Everything between
 * them is ordinary flow layout, so the information architecture does not
 * depend on per-element coordinates.
 */
const PAGE1_FRAME_INSET = 26
const PAGE1_FRAME_W = PDF_PAGE_W - PAGE1_FRAME_INSET * 2
const PAGE1_FRAME_H = PDF_PAGE_H - PAGE1_FRAME_INSET * 2
const PAGE1_BANNER_H = 48
const PAGE1_GUTTER = 42
const PAGE1_INNER_W = PDF_PAGE_W - PAGE1_GUTTER * 2
const PAGE1_BODY_TOP = PAGE1_FRAME_INSET + PAGE1_BANNER_H + 16
const PAGE1_FOOTER_TOP = 778
// The cover photograph is the centre of gravity: full content width, deep frame.
const PAGE1_COVER_W = PAGE1_INNER_W
const PAGE1_COVER_H = 232
/**
 * The Project / Report Details grid takes the height released by the cover
 * photograph, so page 1 stays balanced and the schedule — not the photograph —
 * carries the page.
 */
const PAGE1_GRID_PAD_Y = TABLE_PAD_Y + 1.5

/**
 * Column structures per section. The number and width of columns follow the
 * data; the visual treatment is shared. Numeric and time columns are held to
 * what their values need, so the width goes to the columns carrying names,
 * companies and descriptions — the text that otherwise wraps badly.
 */
const LABOUR_COLUMNS = [
  { key: 'trade', header: 'Trade', width: '34%' },
  { key: 'company', header: 'Company', width: '38%' },
  { key: 'operatives', header: 'Operatives', width: '14%', numeric: true },
  { key: 'hours', header: 'Hours', width: '14%', numeric: true },
]

const EQUIPMENT_COLUMNS = [
  { key: 'description', header: 'Description', width: '38%' },
  { key: 'supplier', header: 'Supplier', width: '32%' },
  { key: 'quantity', header: 'Qty', width: '8%', numeric: true },
  { key: 'status', header: 'Status', width: '22%' },
]

const ATTENDANCE_COLUMNS = [
  { key: 'name', header: 'Name', width: '24%' },
  { key: 'company', header: 'Company', width: '24%' },
  { key: 'role', header: 'Trade / Role', width: '22%' },
  { key: 'signIn', header: 'Sign In', width: '10%', numeric: true },
  { key: 'signOut', header: 'Sign Out', width: '10%', numeric: true },
  { key: 'hours', header: 'Hours', width: '10%', numeric: true },
]

const VISITOR_COLUMNS = [
  { key: 'visitor', header: 'Visitor', width: '26%' },
  { key: 'company', header: 'Company', width: '26%' },
  { key: 'purpose', header: 'Purpose', width: '30%' },
  { key: 'timeIn', header: 'Time In', width: '9%', numeric: true },
  { key: 'timeOut', header: 'Time Out', width: '9%', numeric: true },
]

const PERMIT_COLUMNS = [
  { key: 'permitType', header: 'Permit Type', width: '30%' },
  { key: 'reference', header: 'Reference', width: '20%' },
  { key: 'issuedTo', header: 'Issued To', width: '32%' },
  { key: 'status', header: 'Status', width: '18%' },
]

const DELIVERY_COLUMNS = [
  { key: 'time', header: 'Time', width: '9%', numeric: true },
  { key: 'supplier', header: 'Supplier', width: '29%' },
  { key: 'description', header: 'Description', width: '42%' },
  { key: 'reference', header: 'Delivery Ref', width: '20%' },
]

const TEMPORARY_WORKS_COLUMNS = [
  { key: 'item', header: 'Item', width: '26%' },
  { key: 'location', header: 'Location', width: '22%' },
  { key: 'status', header: 'Inspection / Status', width: '22%' },
  { key: 'notes', header: 'Notes', width: '30%' },
]

const WORK_AREA_COLUMNS = [
  { key: 'area', header: 'Area', width: '24%' },
  { key: 'activity', header: 'Activity / Observation', width: '46%' },
  { key: 'notes', header: 'Status / Notes', width: '30%' },
]

const DECLARATION =
  'I hereby certify that the contents of this site report are true and accurate to the best of my knowledge and belief, and that the information recorded herein fairly represents the works, conditions, and observations for the date stated.'

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN_TOP,
    paddingHorizontal: PDF_PAGE_PAD_X,
    paddingBottom: PDF_CONTENT_BOTTOM,
    fontSize: 9.5,
    color: BODY,
    fontFamily: 'Helvetica',
    lineHeight: 1.45,
  },

  // ---- Page 1: deterministic project-control cover sheet ------------------
  // Page padding reserves the banner and footer bands; the body between them
  // is a plain flow column.
  //
  // The cover sheet is unpaginated (`wrap={false}`). react-pdf only forces a
  // page box to the A4 style height while splitting it, so an unpaginated page
  // keeps whatever height Yoga measured from its content — a short MediaBox.
  // Pinning min and max height to the A4 page height makes the physical sheet
  // identical to every other page. Content still starts at the top of the flow
  // column, so nothing stretches or moves.
  pageOne: {
    minHeight: PDF_PAGE_H,
    maxHeight: PDF_PAGE_H,
    paddingTop: PAGE1_FRAME_INSET,
    paddingLeft: PAGE1_GUTTER,
    paddingRight: PAGE1_GUTTER,
    paddingBottom: PDF_PAGE_H - PAGE1_FOOTER_TOP + 12,
    fontSize: 9,
    color: BODY,
    fontFamily: 'Helvetica',
    lineHeight: 1.3,
  },
  pageOneFrame: {
    position: 'absolute',
    top: PAGE1_FRAME_INSET,
    left: PAGE1_FRAME_INSET,
    width: PAGE1_FRAME_W,
    height: PAGE1_FRAME_H,
    borderWidth: 0.9,
    borderStyle: 'solid',
    borderColor: '#7C858D',
  },
  // Shallow banner: company identity, then a restrained report title. The
  // banner must not out-weigh the project name or the cover photograph.
  pageOneBanner: {
    position: 'absolute',
    top: PAGE1_FRAME_INSET,
    left: PAGE1_FRAME_INSET,
    width: PAGE1_FRAME_W,
    height: PAGE1_BANNER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  pageOneLogo: {
    width: 68,
    height: 32,
    objectFit: 'contain',
  },
  pageOneTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.6,
    textAlign: 'right',
  },

  // ---- Project identity: document masthead, not a table -------------------
  identityBlock: {
    width: '100%',
  },
  identityName: {
    color: INK,
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.2,
  },
  identityAddress: {
    marginTop: 3,
    color: BODY,
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  identityMetaRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopStyle: 'solid',
    borderTopColor: '#D6DBDF',
  },
  identityMetaItem: {
    width: '50%',
    paddingRight: 12,
  },
  identityMetaLabel: {
    color: MUTED,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.7,
  },
  identityMetaValue: {
    marginTop: 2,
    color: INK,
    fontSize: 9.5,
    lineHeight: 1.3,
  },

  coverPhotoBlock: {
    width: '100%',
    marginTop: 14,
    alignItems: 'center',
  },
  coverPhotoFrame: {
    width: PAGE1_COVER_W,
    height: PAGE1_COVER_H,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: '#D2D7DC',
    backgroundColor: '#FBFCFD',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // ---- Lower schedule: four-column label/value grid, two pairs per row ----
  // 20% / 30% / 20% / 30% of the content width, so A4 width is used properly.
  scheduleGrid: {
    width: '100%',
    borderWidth: TABLE_BORDER_W,
    borderStyle: 'solid',
    borderColor: TABLE_BORDER,
  },
  scheduleGridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: TABLE_RULE_W,
    borderBottomStyle: 'solid',
    borderBottomColor: TABLE_RULE,
  },
  scheduleGridPair: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  scheduleGridPairDivider: {
    borderLeftWidth: TABLE_RULE_W,
    borderLeftStyle: 'solid',
    borderLeftColor: TABLE_RULE,
  },
  scheduleGridLabelCell: {
    width: '40%',
    justifyContent: 'center',
    paddingVertical: PAGE1_GRID_PAD_Y,
    paddingHorizontal: 6,
    backgroundColor: TABLE_LABEL_BG,
    borderRightWidth: TABLE_RULE_W,
    borderRightStyle: 'solid',
    borderRightColor: TABLE_RULE,
  },
  scheduleGridLabel: {
    color: TABLE_LABEL_INK,
    fontSize: TABLE_LABEL_SIZE,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.35,
    lineHeight: 1.2,
  },
  scheduleGridValueCell: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: PAGE1_GRID_PAD_Y,
    paddingHorizontal: TABLE_PAD_X,
    backgroundColor: '#FFFFFF',
  },
  scheduleGridValue: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica',
    lineHeight: 1.3,
  },

  // Single shared section-heading treatment for the whole report (Page 1 is
  // the reference): compact bold uppercase over a company-colour rule.
  sectionHeading: {
    marginTop: 15,
    marginBottom: 5,
    paddingBottom: 3.5,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    color: INK,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },

  // Single footer row, shared baseline, well inside the page frame.
  pageOneFooter: {
    position: 'absolute',
    top: PAGE1_FOOTER_TOP,
    left: PAGE1_GUTTER,
    width: PAGE1_INNER_W,
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopStyle: 'solid',
    borderTopColor: '#D0D5DA',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pageOneFooterLeft: {
    width: '33.33%',
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: 'left',
    textDecoration: 'none',
  },
  pageOneFooterCentre: {
    width: '33.33%',
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: 'center',
  },
  pageOneFooterRight: {
    width: '33.33%',
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: 'right',
  },

  // ---- Section banner: full-width divider for the diary record -----------
  // Spans the same width as the schedules beneath it so the left and right
  // edges line up exactly. Kept shallow: a divider, not a card.
  sectionBanner: {
    width: '100%',
    marginTop: 14,
    paddingVertical: 4.5,
    paddingHorizontal: TABLE_PAD_X,
    justifyContent: 'center',
  },
  sectionBannerText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },

  body: { marginTop: 6, fontSize: 9.5, lineHeight: 1.5, color: BODY },

  // ---- Photographic plates ------------------------------------------------
  // ---- Photographic record: fixed cells in the same family as the tables ---
  // Sized by the rows it holds, not pinned to the page: a short final sheet
  // leaves its remaining height available to whatever follows.
  photoStage: { width: '100%' },
  photoGrid: { width: '100%' },
  photoGridRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  // The outer frame is sized by the grid; nothing inside may change it.
  photoFrame: {
    borderWidth: PDF_PHOTO_FRAME_BORDER,
    borderStyle: 'solid',
    borderColor: TABLE_BORDER,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  photoViewport: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // The single containment rule for every photograph in the report. See
  // PDF_PHOTO_FIT: the whole image survives, scaled down and centred.
  imageContain: {
    width: '100%',
    height: '100%',
    ...PDF_PHOTO_FIT,
  },
  photoInfoBand: {
    borderTopWidth: PDF_PHOTO_RULE_W,
    borderTopStyle: 'solid',
    borderTopColor: TABLE_RULE,
    backgroundColor: TABLE_LABEL_BG,
    paddingVertical: PDF_PHOTO_BAND_PAD_Y,
    paddingHorizontal: PDF_PHOTO_BAND_PAD_X,
    overflow: 'hidden',
  },
  photoRef: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    lineHeight: 1.2,
    textAlign: 'left',
  },
  caption: {
    fontSize: PDF_PHOTO_CAPTION_SIZE,
    fontFamily: 'Helvetica',
    color: BODY,
    lineHeight: 1.25,
    textAlign: 'left',
  },
  assignedTo: {
    fontSize: 7.5,
    fontFamily: 'Helvetica',
    color: MUTED,
    lineHeight: 1.2,
    textAlign: 'left',
  },

  // ---- Shared structured-record table (same family as the Page 1 grid) ----
  dataTable: {
    width: '100%',
    borderWidth: TABLE_BORDER_W,
    borderStyle: 'solid',
    borderColor: TABLE_BORDER,
  },
  // Header and totals are separated by the perimeter colour at the internal
  // weight: read as structure without becoming a heavy rule mid-table.
  dataHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: TABLE_LABEL_BG,
    borderBottomWidth: TABLE_RULE_W,
    borderBottomStyle: 'solid',
    borderBottomColor: TABLE_BORDER,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: TABLE_RULE_W,
    borderBottomStyle: 'solid',
    borderBottomColor: TABLE_RULE,
  },
  dataTotalsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: TABLE_LABEL_BG,
    borderTopWidth: TABLE_RULE_W,
    borderTopStyle: 'solid',
    borderTopColor: TABLE_BORDER,
  },
  dataCell: {
    justifyContent: 'center',
    paddingVertical: TABLE_PAD_Y,
    paddingHorizontal: TABLE_PAD_X,
    borderRightWidth: TABLE_RULE_W,
    borderRightStyle: 'solid',
    borderRightColor: TABLE_RULE,
  },
  dataCellLast: { borderRightWidth: 0 },
  dataLabelCell: { backgroundColor: TABLE_LABEL_BG },
  dataHeaderText: {
    color: TABLE_LABEL_INK,
    fontSize: TABLE_LABEL_SIZE,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.35,
    lineHeight: 1.2,
  },
  dataValueText: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica',
    lineHeight: 1.3,
  },
  dataTotalText: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.3,
  },
  numeric: { textAlign: 'right' },
  emptyState: {
    fontSize: 9,
    color: MUTED,
    fontFamily: 'Helvetica-Oblique',
  },

  // ---- Declaration & signature -------------------------------------------
  signDeclaration: {
    fontSize: 10,
    lineHeight: 1.6,
    color: BODY,
    fontFamily: 'Helvetica',
  },
  signRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  signMeta: {
    flex: 1,
    paddingRight: 24,
  },
  signFieldLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  signField: {
    width: 208,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 0.7,
    borderBottomStyle: 'solid',
    borderBottomColor: INK,
  },
  signImage: {
    width: 188,
    height: 84,
    objectFit: 'contain',
  },
  signPlaceholder: {
    fontSize: 8.5,
    color: MUTED,
    fontFamily: 'Helvetica-Oblique',
  },
  signFootnote: {
    marginTop: 10,
    fontSize: 7.5,
    color: MUTED,
    fontFamily: 'Helvetica',
  },
})

function PageChrome({ brandColor, logoUrl, companyName, reportTitle, reportReference = '' }) {
  return (
    <>
      <PdfHeader
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle={reportTitle}
      />
      <PdfFooter reportReference={reportReference} />
    </>
  )
}

function cleanPdfValue(value) {
  return value == null ? '' : String(value).trim()
}

/**
 * Four-column information schedule: two label/value pairs per row. Rows without
 * a value are dropped rather than rendered empty, so nothing on Page 1 is
 * fabricated and the grid never shows a hole.
 */
function ScheduleGrid({ rows }) {
  const visible = rows.filter((item) => item.value)
  if (!visible.length) return null

  const gridRows = []
  for (let index = 0; index < visible.length; index += 2) {
    gridRows.push(visible.slice(index, index + 2))
  }

  return (
    <View style={styles.scheduleGrid}>
      {gridRows.map((pair, rowIndex) => (
        <View
          key={pair[0].label}
          style={[
            styles.scheduleGridRow,
            rowIndex === gridRows.length - 1 ? { borderBottomWidth: 0 } : null,
          ]}
        >
          {pair.map((item, pairIndex) => (
            <View
              key={item.label}
              style={[
                styles.scheduleGridPair,
                pairIndex === 1 ? styles.scheduleGridPairDivider : null,
              ]}
            >
              <View style={styles.scheduleGridLabelCell}>
                <Text style={styles.scheduleGridLabel}>{item.label}</Text>
              </View>
              <View style={styles.scheduleGridValueCell}>
                <Text style={styles.scheduleGridValue}>{item.value}</Text>
              </View>
            </View>
          ))}
          {pair.length === 1 ? <View style={styles.scheduleGridPair} /> : null}
        </View>
      ))}
    </View>
  )
}

/**
 * Project identity masthead: the project name carries first-level prominence,
 * with reference and report date as a compact secondary line.
 */
function ProjectIdentity({ projectName, projectAddress, projectReference, reportDate }) {
  const meta = [
    { label: 'PROJECT REFERENCE', value: projectReference },
    { label: 'REPORT DATE', value: reportDate },
  ].filter((item) => item.value)

  return (
    <View style={styles.identityBlock}>
      {projectName ? <Text style={styles.identityName}>{projectName}</Text> : null}
      {projectAddress ? (
        <Text style={styles.identityAddress}>{projectAddress}</Text>
      ) : null}
      {meta.length ? (
        <View style={styles.identityMetaRow}>
          {meta.map((item) => (
            <View key={item.label} style={styles.identityMetaItem}>
              <Text style={styles.identityMetaLabel}>{item.label}</Text>
              <Text style={styles.identityMetaValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

/**
 * The one section-heading treatment used across the whole report. `first`
 * removes the leading margin where the heading opens a page. `minPresenceAhead`
 * stops a heading being stranded at the foot of a page, away from its content.
 */
function SectionHeading({ children, accent }) {
  const color = resolvePdfAccent(accent)
  return (
    <View minPresenceAhead={SECTION_PRESENCE_AHEAD}>
      <Text style={[styles.sectionHeading, { borderBottomColor: color }]}>
        {typeof children === 'string' ? children.toUpperCase() : children}
      </Text>
    </View>
  )
}

/**
 * Shared structured-record table. Columns vary by section; the visual language
 * does not. Rows never split across a page boundary.
 *
 * columns: [{ key, header, width, numeric? }]
 */
function DataTable({ columns, rows, totals = null }) {
  const lastIndex = columns.length - 1

  const renderCells = (record, textStyle) =>
    columns.map((column, index) => (
      <View
        key={column.key}
        style={[
          styles.dataCell,
          { width: column.width },
          index === lastIndex ? styles.dataCellLast : null,
        ]}
      >
        <Text style={[textStyle, column.numeric ? styles.numeric : null]}>
          {record[column.key] ?? ''}
        </Text>
      </View>
    ))

  // No `minPresenceAhead` here: it reserves space *after* the node, which for
  // a tall table pushes the whole schedule onto the next page and strands its
  // heading. Keeping a heading with its table is the heading's job.
  return (
    <View style={styles.dataTable}>
      {/*
        `fixed` repeats the column header when — and only when — this table is
        split across a page boundary. react-pdf duplicates fixed children into
        both halves inside splitNodes, so a table that fits on one page still
        renders its header once.
      */}
      <View style={styles.dataHeaderRow} wrap={false} fixed>
        {columns.map((column, index) => (
          <View
            key={column.key}
            style={[
              styles.dataCell,
              { width: column.width },
              index === lastIndex ? styles.dataCellLast : null,
            ]}
          >
            <Text style={[styles.dataHeaderText, column.numeric ? styles.numeric : null]}>
              {column.header}
            </Text>
          </View>
        ))}
      </View>

      {rows.map((record, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[
            styles.dataRow,
            rowIndex === rows.length - 1 && !totals ? { borderBottomWidth: 0 } : null,
          ]}
          wrap={false}
        >
          {renderCells(record, styles.dataValueText)}
        </View>
      ))}

      {totals ? (
        <View style={styles.dataTotalsRow} wrap={false}>
          {renderCells(totals, styles.dataTotalText)}
        </View>
      ) : null}
    </View>
  )
}

/**
 * Label/value schedule in the shared table family, one pair per row. Used where
 * a full column table would be the wrong shape for the data.
 */
function ScheduleList({ rows, labelWidth = '30%' }) {
  const visible = rows.filter((item) => item.value)
  if (!visible.length) return null

  return (
    <View style={styles.dataTable}>
      {visible.map((item, index) => (
        <View
          key={item.label}
          style={[
            styles.dataRow,
            index === visible.length - 1 ? { borderBottomWidth: 0 } : null,
          ]}
          wrap={false}
        >
          <View style={[styles.dataCell, styles.dataLabelCell, { width: labelWidth }]}>
            <Text style={styles.dataHeaderText}>{item.label}</Text>
          </View>
          <View style={[styles.dataCell, styles.dataCellLast, { flex: 1 }]}>
            <Text style={styles.dataValueText}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function PageOneFooter({ reportReference = '' }) {
  return (
    <View style={styles.pageOneFooter}>
      <Link src={ZLOG_URL} style={styles.pageOneFooterLeft}>
        Produced with Zlog
      </Link>
      <Text
        style={styles.pageOneFooterCentre}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
      <Text style={styles.pageOneFooterRight}>
        {reportReference ? `Report reference: ${reportReference}` : ' '}
      </Text>
    </View>
  )
}

function PageOne({
  projectName,
  projectAddress,
  projectReference,
  clientName,
  companyName,
  reportingOnBehalfOf,
  reportReference,
  reportDate,
  projectManager,
  commencementDate,
  plannedCompletionDate,
  shift,
  weather,
  authorName,
  authorRole,
  coverPhotoUrl,
  brandColor,
  logoUrl,
}) {
  const accent = resolvePdfAccent(brandColor)
  const programme = computeProjectDay({
    startDate: commencementDate,
    plannedCompletionDate,
    asOfDate: reportDate,
  })
  const projectDay =
    Number.isFinite(programme.currentDay) && programme.currentDay > 0
      ? String(programme.currentDay)
      : ''
  const projectWeek = projectDay ? String(Math.ceil(Number(projectDay) / 7)) : ''
  const displayDate = (value) =>
    cleanPdfValue(value) ? formatProjectDateDisplay(value) : ''

  // Ordered so the grid pairs up as Client/Project Manager, Reporting
  // Organisation/Report Author, and so on. Project name, address, reference and
  // report date live in the masthead above and are not repeated here.
  // No Site Manager field exists in the report payload; the author is recorded
  // as the author, not inferred to be the Site Manager.
  const scheduleRows = [
    { label: 'Client', value: cleanPdfValue(clientName) },
    { label: 'Project Manager', value: cleanPdfValue(projectManager) },
    { label: 'Reporting Organisation', value: cleanPdfValue(companyName) },
    { label: 'Report Author', value: cleanPdfValue(authorName) },
    { label: 'Reporting on behalf of', value: cleanPdfValue(reportingOnBehalfOf) },
    { label: 'Author Role', value: cleanPdfValue(authorRole) },
    { label: 'Commencement Date', value: displayDate(commencementDate) },
    { label: 'Shift', value: cleanPdfValue(shift) },
    { label: 'Planned Completion Date', value: displayDate(plannedCompletionDate) },
    { label: 'Weather', value: cleanPdfValue(weather) },
    { label: 'Project Day', value: projectDay },
    { label: 'Project Week', value: projectWeek },
  ]

  const hasScheduleRows = scheduleRows.some((item) => item.value)

  return (
    <Page size="A4" style={styles.pageOne} wrap={false}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="DAILY SITE DIARY"
        reportReference={cleanPdfValue(reportReference)}
      />
      <View style={styles.pageOneFrame} />

      <ProjectIdentity
        projectName={cleanPdfValue(projectName)}
        projectAddress={cleanPdfValue(projectAddress)}
        projectReference={cleanPdfValue(projectReference)}
        reportDate={displayDate(reportDate)}
      />

      {coverPhotoUrl ? (
        <View style={styles.coverPhotoBlock}>
          <View style={styles.coverPhotoFrame}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={coverPhotoUrl} style={styles.imageContain} />
          </View>
        </View>
      ) : null}

      {hasScheduleRows ? (
        <SectionHeading accent={accent}>PROJECT / REPORT DETAILS</SectionHeading>
      ) : null}
      <ScheduleGrid rows={scheduleRows} />
    </Page>
  )
}

/**
 * One photographic record as a fixed report cell:
 * - the outer frame is sized by the grid, never by the photograph
 * - the image viewport contains the photograph (no crop / stretch / distortion)
 * - "PHOTO N" and the caption sit in a band inside the frame, not below it
 * A taller caption takes room from the viewport, so the frame never grows.
 * Rotation must be baked into `src` by the export pipeline when non-zero.
 */
function FramedPhoto({
  src,
  caption,
  assignedToLine,
  frameWidth,
  frameHeight,
  bandHeight,
  gapRight = 0,
  photoNumber,
  accent,
}) {
  if (!src) return null
  const refLabel = photoReferenceLabel(photoNumber)
  const captionText = typeof caption === 'string' ? caption.trim() : ''
  const assignedLine = typeof assignedToLine === 'string' ? assignedToLine.trim() : ''
  const viewportHeight = Math.max(
    40,
    frameHeight - bandHeight - PDF_PHOTO_FRAME_BORDER * 2,
  )

  return (
    <View
      style={[
        styles.photoFrame,
        { width: frameWidth, height: frameHeight, marginRight: gapRight },
      ]}
    >
      <View style={[styles.photoViewport, { height: viewportHeight }]}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        <Image src={src} style={styles.imageContain} />
      </View>
      <View style={[styles.photoInfoBand, { height: bandHeight }]}>
        <Text style={[styles.photoRef, { color: resolvePdfAccent(accent) }]}>{refLabel}</Text>
        <Text style={styles.caption} maxLines={PDF_PHOTO_CAPTION_MAX_LINES}>
          {captionText || '—'}
        </Text>
        {assignedLine ? (
          <Text style={styles.assignedTo} maxLines={1}>
            {assignedLine}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function photoSrc(photo) {
  return photo.src || photo.preview || photo.url
}

/**
 * Lays photographs into the fixed cells of a tier's grid. Rows are chunked by
 * column count, so a short page keeps the same cells and simply leaves the
 * trailing ones empty.
 */
function PhotoGrid({ photos, cols, rows, brandColor }) {
  const { frameW, frameH } = computePhotoFrameGeometry({ cols, rows })
  const chunks = []
  for (let index = 0; index < photos.length; index += cols) {
    chunks.push(photos.slice(index, index + cols))
  }

  return (
    <View style={styles.photoGrid}>
      {chunks.map((row, rowIndex) => {
        const bandHeight = photoRowBandHeight(
          row.map((photo) => ({
            caption: photoTileCaption(photo),
            assignedToLine: photoTileAssignedToLine(photo),
          })),
          frameW,
        )
        return (
          <View
            key={`photo-row-${rowIndex}`}
            style={[
              styles.photoGridRow,
              { marginBottom: rowIndex === chunks.length - 1 ? 0 : PDF_GRID_GAP },
            ]}
          >
            {row.map((photo, columnIndex) => (
              <FramedPhoto
                key={photo.key || `photo-${rowIndex}-${columnIndex}`}
                src={photoSrc(photo)}
                caption={photoTileCaption(photo)}
                assignedToLine={photoTileAssignedToLine(photo)}
                frameWidth={frameW}
                frameHeight={frameH}
                bandHeight={bandHeight}
                gapRight={columnIndex === cols - 1 ? 0 : PDF_GRID_GAP}
                photoNumber={photo.reportPhotoNumber}
                accent={brandColor}
              />
            ))}
          </View>
        )
      })}
    </View>
  )
}

function FullPagePhotos({
  photos,
  brandColor,
  logoUrl,
  companyName,
  reportReference = '',
  trailing = null,
}) {
  const { cols, rows } = photoGridForTier(1)

  return photos.map((photo, i) => (
    <Page key={`full-${photo.key || photo.reportPhotoNumber || i}`} size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="Photographic record"
        reportReference={reportReference}
      />
      <View style={styles.photoStage}>
        <PhotoGrid photos={[photo]} cols={cols} rows={rows} brandColor={brandColor} />
      </View>
      {i === photos.length - 1 ? trailing : null}
    </Page>
  ))
}

function GridPages({
  photos,
  perPage,
  brandColor,
  logoUrl,
  companyName,
  title,
  reportReference = '',
  trailing = null,
}) {
  const pages = paginatePdfPhotos(photos, perPage)
  // The grid is a property of the tier, not of how many photographs a page
  // happens to hold, so every page of the report uses identical cells.
  const { cols, rows } = photoGridForTier(perPage)

  return pages.map((pagePhotos, pageIndex) => (
    <Page key={`grid-${perPage}-${pageIndex}`} size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle={title}
        reportReference={reportReference}
      />
      <View style={styles.photoStage}>
        <PhotoGrid photos={pagePhotos} cols={cols} rows={rows} brandColor={brandColor} />
      </View>
      {pageIndex === pages.length - 1 ? trailing : null}
    </Page>
  ))
}

function LabourTable({ items = [], brandColor = null }) {
  const accent = resolvePdfAccent(brandColor)
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
    <>
      <SectionBanner accent={accent}>Labour</SectionBanner>
      {rows.length === 0 ? (
        <Text style={styles.emptyState}>No labour recorded.</Text>
      ) : (
        <DataTable
          columns={LABOUR_COLUMNS}
          rows={rows.map((item) => ({
            trade: item.trade || '—',
            company: item.company || '—',
            operatives:
              item.headcount != null && item.headcount !== ''
                ? String(item.headcount)
                : item.count != null && item.count !== ''
                  ? String(item.count)
                  : '—',
            hours: item.hours != null && item.hours !== '' ? String(item.hours) : '—',
          }))}
          totals={{
            trade: 'Total',
            company: '',
            operatives: String(operatives),
            hours: String(Math.round(hours * 100) / 100),
          }}
        />
      )}
    </>
  )
}

function EquipmentHireTable({ items = [], brandColor = null }) {
  const accent = resolvePdfAccent(brandColor)
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
    <>
      <SectionBanner accent={accent}>Equipment on hire</SectionBanner>
      {rows.length === 0 ? (
        <Text style={styles.emptyState}>No equipment on hire recorded.</Text>
      ) : (
        <DataTable
          columns={EQUIPMENT_COLUMNS}
          rows={rows.map((item) => ({
            description: item.description || '—',
            supplier: item.supplier || '—',
            quantity:
              item.quantity != null && item.quantity !== '' ? String(item.quantity) : '—',
            status: item.status || '—',
          }))}
        />
      )}
    </>
  )
}

/**
 * Full-width divider that opens every section of the ordinary diary record.
 * The banner, the column header beneath it and the first data row are kept
 * together so a section never opens at the very foot of a page.
 */
function SectionBanner({ children, accent }) {
  const color = resolvePdfAccent(accent)
  return (
    <View
      style={[styles.sectionBanner, { backgroundColor: color }]}
      minPresenceAhead={SECTION_PRESENCE_AHEAD}
      wrap={false}
    >
      <Text style={styles.sectionBannerText}>
        {typeof children === 'string' ? children.toUpperCase() : children}
      </Text>
    </View>
  )
}

/**
 * Turns raw section items into display rows, dropping records where every
 * column is blank. Values are never invented: an empty cell reads as an em
 * dash so the grid stays aligned.
 */
function toRecordRows(items, columns) {
  if (!Array.isArray(items)) return []
  const rows = []
  for (const item of items) {
    const row = {}
    let hasValue = false
    for (const column of columns) {
      const value = cleanPdfValue(item?.[column.key])
      if (value) hasValue = true
      row[column.key] = value || '—'
    }
    if (hasValue) rows.push(row)
  }
  return rows
}

/**
 * One structured schedule in the continuous report stream. A section with no
 * records renders nothing at all, so a report that never captured it does not
 * gain an empty heading.
 */
function RecordSection({ title, columns, items, accent }) {
  const rows = toRecordRows(items, columns)
  if (!rows.length) return null
  // A fragment, not a wrapper View: react-pdf refuses to break before a node
  // that is the first child of its container, so a wrapped heading can never
  // honour `minPresenceAhead` and ends up stranded at the foot of a page.
  return (
    <>
      <SectionBanner accent={accent}>{title}</SectionBanner>
      <DataTable columns={columns} rows={rows} />
    </>
  )
}

/**
 * Existing report content retained intact after the dedicated Page 1 cover
 * sheet. Its visual system is unchanged by the Page 1-only batch.
 */
function ReportContentPage({
  brandColor,
  logoUrl,
  companyName,
  siteSummary,
  labour,
  equipmentHire,
  attendance,
  visitors,
  permits,
  deliveries,
  temporaryWorks,
  workAreas,
  reportReference = '',
  trailing = null,
}) {
  const accent = resolvePdfAccent(brandColor)

  // One continuous content stream. Every section is a sibling in the same
  // flow, so a section starts immediately below the previous one and only
  // moves to a new page when it genuinely cannot start here.
  return (
    <Page size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportTitle="Site Diary — Site records"
        reportReference={reportReference}
      />
      <SectionBanner accent={accent}>Site summary</SectionBanner>
      <Text style={styles.body}>{siteSummary || '—'}</Text>
      <LabourTable items={labour} brandColor={accent} />
      <EquipmentHireTable items={equipmentHire} brandColor={accent} />
      <RecordSection
        title="Site attendance"
        columns={ATTENDANCE_COLUMNS}
        items={attendance}
        accent={accent}
      />
      <RecordSection
        title="Visitors"
        columns={VISITOR_COLUMNS}
        items={visitors}
        accent={accent}
      />
      <RecordSection
        title="Permits to work"
        columns={PERMIT_COLUMNS}
        items={permits}
        accent={accent}
      />
      <RecordSection
        title="Deliveries"
        columns={DELIVERY_COLUMNS}
        items={deliveries}
        accent={accent}
      />
      <RecordSection
        title="Temporary works & scaffolding checks"
        columns={TEMPORARY_WORKS_COLUMNS}
        items={temporaryWorks}
        accent={accent}
      />
      <RecordSection
        title="Work area records"
        columns={WORK_AREA_COLUMNS}
        items={workAreas}
        accent={accent}
      />
      {trailing}
    </Page>
  )
}

/**
 * Compact end-of-report certification block, not a ceremonial full page. It is
 * the last element in the flow of whichever page ends the report, so it sits
 * directly beneath that content when it fits and moves whole to the next page
 * when it does not. `wrap={false}` keeps it from ever splitting.
 */
function DeclarationBlock({ brandColor, authorName, authorRole, reportDate, signatureSrc }) {
  const accent = resolvePdfAccent(brandColor)

  return (
    <View wrap={false}>
      <SectionBanner accent={accent}>Declaration &amp; signature</SectionBanner>
      <Text style={[styles.signDeclaration, styles.body]}>{DECLARATION}</Text>
      <View style={styles.signRow} wrap={false}>
        <View style={styles.signMeta}>
          <ScheduleList
            labelWidth="38%"
            rows={[
              { label: 'Author Name', value: authorName?.trim() || '—' },
              { label: 'Position / Role', value: authorRole?.trim() || '—' },
              { label: 'Date', value: reportDate || '—' },
            ]}
          />
        </View>
        <View>
          <Text style={styles.signFieldLabel}>Signature</Text>
          <View style={styles.signField}>
            {signatureSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
              <Image src={signatureSrc} style={styles.signImage} />
            ) : (
              <Text style={styles.signPlaceholder}>No signature captured</Text>
            )}
          </View>
        </View>
      </View>
      <Text style={styles.signFootnote}>
        This declaration forms part of the Site Diary for the date stated above.
      </Text>
    </View>
  )
}

/**
 * Diary PDF with a report summary page, photographic record pages by layout
 * tier (full 1/page, grid4, grid6), then the declaration/signature page.
 *
 * Photo schedule rules:
 * - contain-fit only inside fixed plates (no crop / stretch)
 * - continuous Photo 1..N across the whole report (recalculated at generation)
 * - caption band is fixed height; long captions clamp rather than move the plate
 *
 * photos: [{ key?, src|preview|url, caption, layout: 'full'|'grid4'|'grid6', sequence_number? }]
 * labour: [{ trade, company, headcount|count, hours }]
 * equipmentHire: [{ description, supplier, quantity, status }]
 */
export function DiaryPdfDocument({
  projectName = '',
  projectAddress = '',
  projectReference = '',
  clientName = '',
  reportingOnBehalfOf = '',
  reportReference = '',
  reportDate = '',
  projectManager = '',
  commencementDate = '',
  plannedCompletionDate = '',
  shift = '',
  weather = '',
  siteSummary = '',
  brandColor,
  logoUrl,
  companyName,
  coverPhotoUrl = null,
  photos = [],
  labour = [],
  equipmentHire = [],
  attendance = [],
  visitors = [],
  permits = [],
  deliveries = [],
  temporaryWorks = [],
  workAreas = [],
  authorName = '',
  authorRole = '',
  signatureSrc = null,
}) {
  const schedule = buildPhotoSchedule(photos)

  // The declaration trails the last page the report actually produces, so it
  // follows the final photographic layout when there is room and only takes a
  // fresh page when there is not.
  const declaration = (
    <DeclarationBlock
      brandColor={brandColor}
      authorName={authorName}
      authorRole={authorRole}
      reportDate={reportDate}
      signatureSrc={signatureSrc}
    />
  )
  const lastHost = schedule.grid6.length
    ? 'grid6'
    : schedule.grid4.length
      ? 'grid4'
      : schedule.full.length
        ? 'full'
        : 'records'

  return (
    <Document>
      <PageOne
        projectName={projectName}
        projectAddress={projectAddress}
        projectReference={projectReference}
        clientName={clientName}
        companyName={companyName}
        reportingOnBehalfOf={reportingOnBehalfOf}
        reportReference={reportReference}
        reportDate={reportDate}
        projectManager={projectManager}
        commencementDate={commencementDate}
        plannedCompletionDate={plannedCompletionDate}
        shift={shift}
        weather={weather}
        authorName={authorName}
        authorRole={authorRole}
        coverPhotoUrl={coverPhotoUrl}
        brandColor={brandColor}
        logoUrl={logoUrl}
      />

      <ReportContentPage
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        siteSummary={siteSummary}
        labour={labour}
        equipmentHire={equipmentHire}
        attendance={attendance}
        visitors={visitors}
        permits={permits}
        deliveries={deliveries}
        temporaryWorks={temporaryWorks}
        workAreas={workAreas}
        reportReference={reportReference}
        trailing={lastHost === 'records' ? declaration : null}
      />

      <FullPagePhotos
        photos={schedule.full}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportReference={reportReference}
        trailing={lastHost === 'full' ? declaration : null}
      />

      <GridPages
        photos={schedule.grid4}
        perPage={4}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Photographic record — progress"
        reportReference={reportReference}
        trailing={lastHost === 'grid4' ? declaration : null}
      />

      <GridPages
        photos={schedule.grid6}
        perPage={6}
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        title="Photographic record — site checks"
        reportReference={reportReference}
        trailing={lastHost === 'grid6' ? declaration : null}
      />
    </Document>
  )
}
