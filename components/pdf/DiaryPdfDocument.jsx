import { Document, Page, Text, View, Image, Font, StyleSheet, Svg, Path, Polygon } from '@react-pdf/renderer'
import { PdfHeader, PdfFooter } from '@/components/pdf/PdfHeader'
import { computeProjectDay, formatProjectDateDisplay } from '@/lib/project-day'
import {
  buildPhotoAreaSchedule,
  photographicRecordAreaTitle,
  photoReferenceLabel,
  photoTileAssignedToLine,
  photoTileCaption,
} from '@/lib/photo-schedule'
import {
  PDF_CONTENT_BOTTOM,
  PDF_CONTENT_H,
  PDF_PHOTO_GUTTER,
  PDF_PAGE_H,
  PDF_CONTENT_TOP,
  PDF_HEADER_OFFSET,
  PDF_PAGE_MARGIN_TOP,
  PDF_PAGE_INNER_W,
  PDF_PAGE_PAD_X,
  PDF_PAGE_W,
  PDF_PHOTO_BAND_PAD_X,
  PDF_PHOTO_BAND_PAD_Y,
  PDF_PHOTO_CAPTION_SIZE,
  PDF_PHOTO_CAPTION_SLOT_H,
  PDF_PHOTO_FIT,
  PDF_PHOTO_FRAME_BORDER,
  PDF_PHOTO_RULE_W,
  PDF_AREA_SUBHEADING_FONT,
  PDF_AREA_SUBHEADING_GAP,
  PDF_AREA_SUBHEADING_LINE,
  PDF_AREA_SUBHEADING_PAD_Y,
  computePhotoFrameGeometry,
  jpegPixelSize,
  photoFlowGridBudget,
  snugPhotoBox,
  supportingDocumentCaption,
  photoGridForTier,
  scaledCaptionMetrics,
  resolvePdfBannerColor,
  resolvePdfTableRuleColor,
} from '@/lib/diary-pdf-layout'
import { frameMarksForImage } from '@/lib/pdf-photo-frame-rotation'

const CONTENT_H = PDF_CONTENT_H

const INK = '#1C2126'
const BODY = '#39424B'
const MUTED = '#6B7580'

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
const TABLE_PAD_Y = 4
const TABLE_PAD_X = 8
const TABLE_LABEL_SIZE = 7.8
const TABLE_VALUE_SIZE = 9.5
const PDF_DOVE_GREY = '#E4E2DE'
const TABLE_TOP_RULE_W = 0.75

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
const PAGE1_FRAME_INSET = PDF_PAGE_PAD_X
const PAGE1_FRAME_W = PDF_PAGE_W - PAGE1_FRAME_INSET * 2
/**
 * Closed page rectangle. The stroke sits just outside the flowing content so
 * a table or box rule cannot land on it. The banner and the cover identity
 * band bleed back to the inner edge of that stroke.
 */
const PDF_FRAME_INSET = 36
const PDF_FRAME_BORDER = 0.9
const PDF_FRAME_BLEED = 5.1
const PDF_FRAME_BOTTOM = 22
const PAGE1_BANNER_H = 48
const PAGE1_GUTTER = 42
const PAGE1_INNER_W = PDF_PAGE_W - PAGE1_GUTTER * 2
const PAGE1_BODY_TOP = PAGE1_FRAME_INSET + PAGE1_BANNER_H + 16
const PAGE1_FOOTER_TOP = 778
// The cover photograph is the centre of gravity: full content width, deep frame.
const PAGE1_COVER_W = PAGE1_INNER_W
const PAGE1_COVER_H = 384
/**
 * The Project / Report Details grid takes the height released by the cover
 * photograph, so page 1 stays balanced and the schedule — not the photograph —
 * carries the page.
 */
const PAGE1_GRID_PAD_Y = TABLE_PAD_Y

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
  { key: 'hours', header: 'Total hrs (all operatives)', width: '14%', numeric: true },
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
    paddingTop: PDF_CONTENT_TOP,
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
    paddingTop: PDF_HEADER_OFFSET,
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
    top: PDF_PAGE_MARGIN_TOP - PDF_FRAME_BORDER,
    left: PDF_FRAME_INSET,
    right: PDF_FRAME_INSET,
    bottom: PDF_FRAME_BOTTOM,
    borderWidth: 0.9,
    borderStyle: 'solid',
    borderColor: INK,
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
    textAlign: 'left',
  },

  // ---- Project identity: document masthead, not a table -------------------
  identityBlock: {
    width: PAGE1_INNER_W + PDF_FRAME_BLEED * 2,
    marginTop: 0,
    marginLeft: -PDF_FRAME_BLEED,
    marginRight: -PDF_FRAME_BLEED,
    backgroundColor: PDF_DOVE_GREY,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 0.6,
    borderBottomStyle: 'solid',
    borderBottomColor: '#C5C3BF',
    alignItems: 'center',
  },
  identityName: {
    width: '100%',
    color: MUTED,
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.2,
    textAlign: 'center',
  },
  identityAddress: {
    width: '100%',
    marginTop: 3,
    color: BODY,
    fontSize: 9.5,
    lineHeight: 1.35,
    textAlign: 'center',
  },

  coverPhotoBlock: {
    width: '100%',
    marginTop: 14,
    alignItems: 'center',
  },
  coverPhotoFrame: {
    width: PAGE1_COVER_W,
    height: PAGE1_COVER_H,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // ---- Lower schedule: four-column label/value grid, two pairs per row ----
  // 20% / 30% / 20% / 30% of the content width, so A4 width is used properly.
  scheduleGrid: {
    width: '100%',
  },
  scheduleGridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
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
    paddingHorizontal: TABLE_PAD_X,
    backgroundColor: PDF_DOVE_GREY,
    borderWidth: TABLE_RULE_W,
    borderStyle: 'solid',
    borderColor: TABLE_RULE,
  },
  scheduleGridLabel: {
    color: TABLE_LABEL_INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.35,
    lineHeight: 1.4,
  },
  scheduleGridValueCell: {
    width: '60%',
    justifyContent: 'center',
    paddingVertical: PAGE1_GRID_PAD_Y,
    paddingHorizontal: TABLE_PAD_X,
    backgroundColor: '#FFFFFF',
    borderWidth: TABLE_RULE_W,
    borderStyle: 'solid',
    borderColor: TABLE_RULE,
  },
  scheduleGridValue: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica',
    lineHeight: 1.4,
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
    justifyContent: 'space-between',
  },
  pageOneFooterLeft: {
    width: '82%',
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: 'left',
    textDecoration: 'none',
    paddingRight: 12,
  },
  pageOneFooterRight: {
    width: 78,
    color: MUTED,
    fontSize: 7.5,
    lineHeight: 1.2,
    textAlign: 'right',
  },

  // ---- Section banner: full-width divider for the diary record -----------
  // Spans the same width as the schedules beneath it so the left and right
  // edges line up exactly. Kept shallow: a divider, not a card.
  sectionBannerWrap: {
    width: '100%',
    marginTop: 14,
  },
  tableTopRule: {
    width: '100%',
    height: TABLE_TOP_RULE_W,
  },
  sectionBanner: {
    width: '100%',
    paddingVertical: 5,
    paddingHorizontal: TABLE_PAD_X,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PDF_DOVE_GREY,
  },
  // Photo-area pages are already a fresh sheet below chrome — no prior
  // section to separate from. Drop the record-stream top margin so the
  // banner + fixed photo grid stay inside one page (no blank overflow page).
  areaPhotoSectionBanner: {
    width: '100%',
    marginTop: 0,
    marginBottom: PDF_AREA_SUBHEADING_GAP,
    paddingVertical: PDF_AREA_SUBHEADING_PAD_Y,
    paddingHorizontal: TABLE_PAD_X,
    justifyContent: 'center',
    backgroundColor: PDF_DOVE_GREY,
  },
  areaSubheadingText: {
    color: INK,
    fontSize: PDF_AREA_SUBHEADING_FONT,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    lineHeight: PDF_AREA_SUBHEADING_LINE,
    textAlign: 'left',
  },
  sectionBannerText: {
    color: INK,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    lineHeight: 1.4,
    textAlign: 'left',
  },
  sectionBannerAside: {
    marginLeft: 8,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Oblique',
    color: MUTED,
    textAlign: 'right',
  },
  evidenceNote: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Oblique',
    color: MUTED,
  },

  body: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 9.5,
    lineHeight: 1.45,
    color: BODY,
  },

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
    position: 'relative',
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
  photoCaptionSlot: {
    height: PDF_PHOTO_CAPTION_SLOT_H,
    backgroundColor: '#FFFFFF',
    borderTopWidth: PDF_PHOTO_RULE_W,
    borderTopStyle: 'solid',
    borderTopColor: TABLE_BORDER,
    paddingVertical: PDF_PHOTO_BAND_PAD_Y,
    paddingHorizontal: PDF_PHOTO_BAND_PAD_X,
    overflow: 'hidden',
  },
  photoRef: {
    color: INK,
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
    color: MUTED,
    lineHeight: 1.25,
    textAlign: 'left',
    textOverflow: 'ellipsis',
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
    borderStyle: 'solid',
    borderColor: TABLE_RULE,
    flexShrink: 0,
  },
  // The row itself draws no rule. Each cell draws its own four sides, so a
  // horizontal line cannot stop halfway across a row.
  // flexShrink 0 keeps the measured row height. The default is 1, and an
  // overfull page would otherwise compress the row onto the text below it.
  dataHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  dataTotalsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  dataCell: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingVertical: TABLE_PAD_Y,
    paddingHorizontal: TABLE_PAD_X,
    borderWidth: TABLE_RULE_W,
    borderStyle: 'solid',
    borderColor: TABLE_RULE,
    flexShrink: 0,
  },
  dataCellLast: { borderRightWidth: TABLE_RULE_W },
  dataLabelCell: { backgroundColor: PDF_DOVE_GREY },
  dataHeaderText: {
    color: TABLE_LABEL_INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.35,
    lineHeight: 1.4,
  },
  dataValueText: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica',
    lineHeight: 1.4,
  },
  dataTotalText: {
    color: INK,
    fontSize: TABLE_VALUE_SIZE,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.4,
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
  signValueCell: {
    minHeight: 44,
    justifyContent: 'center',
  },
  signImage: {
    width: 160,
    height: 40,
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

function PageChrome({
  brandColor,
  logoUrl,
  projectReference = '',
  projectName = '',
  reportDate = '',
}) {
  return (
    <>
      <PdfHeader
        brandColor={brandColor}
        logoUrl={logoUrl}
        projectName={projectName}
        projectReference={projectReference}
        edgeBleed={PDF_FRAME_BLEED}
      />
      <PdfFooter projectReference={projectReference} reportDate={reportDate} />
      <View style={styles.pageOneFrame} fixed />
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
  const items = rows.filter((item) => item.value)
  if (!items.length) return null

  const gridRows = []
  for (let index = 0; index < items.length; ) {
    const item = items[index]
    if (item.span === 'full') {
      gridRows.push([item])
      index += 1
      continue
    }
    const next = items[index + 1]
    if (next && next.span !== 'full') {
      gridRows.push([item, next])
      index += 2
    } else {
      gridRows.push([item])
      index += 1
    }
  }

  return (
    <View style={styles.scheduleGrid}>
      {gridRows.map((pair, rowIndex) => {
        const full = pair[0].span === 'full'
        return (
          <View
            key={pair[0].label}
            style={[
              styles.scheduleGridRow,
              rowIndex === gridRows.length - 1 ? { borderBottomWidth: 0 } : null,
            ]}
            wrap={false}
          >
            {full ? (
              <View style={[styles.scheduleGridPair, { width: '100%' }]}>
                <View style={[styles.scheduleGridLabelCell, { width: '20%' }]}>
                  <Text style={styles.scheduleGridLabel}>{pair[0].label}</Text>
                </View>
                <View style={[styles.scheduleGridValueCell, { width: '80%' }]}>
                  <Text style={styles.scheduleGridValue}>{pair[0].value}</Text>
                </View>
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>
        )
      })}
    </View>
  )
}

/**
 * Cover identity: project name and address, centred, in one dove-grey band
 * flush under the banner. The name is neutral grey. The report date is a
 * cover-table row, not a third line in this band.
 */
function ProjectIdentity({ projectName, projectAddress }) {
  if (!projectName && !projectAddress) return null

  return (
    <View style={styles.identityBlock}>
      {projectName ? (
        <Text style={styles.identityName}>{projectName}</Text>
      ) : null}
      {projectAddress ? (
        <Text style={styles.identityAddress}>{projectAddress}</Text>
      ) : null}
    </View>
  )
}

/**
 * The one section-heading treatment used across the whole report. `first`
 * removes the leading margin where the heading opens a page. `minPresenceAhead`
 * stops a heading being stranded at the foot of a page, away from its content.
 */
function numberedSectionLabel(number, children) {
  if (typeof children !== 'string') return children
  const label = children.toUpperCase()
  return number ? `${number}. ${label}` : label
}

function SectionHeading({ children, accent, number = null }) {
  const color = resolvePdfTableRuleColor(accent)
  return (
    <View minPresenceAhead={SECTION_PRESENCE_AHEAD} style={styles.sectionBannerWrap}>
      <View style={[styles.tableTopRule, { backgroundColor: color }]} />
      <View style={styles.sectionBanner}>
        <Text style={styles.sectionBannerText}>
          {numberedSectionLabel(number, children)}
        </Text>
      </View>
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

  const renderCells = (record, role) =>
    columns.map((column, index) => {
      const textStyle =
        role === 'header'
          ? styles.dataHeaderText
          : role === 'total'
            ? styles.dataTotalText
            : styles.dataValueText
      return (
        <View
          key={column.key}
          style={[
            styles.dataCell,
            {
              width: column.width,
              backgroundColor: '#FFFFFF',
            },
            index === lastIndex ? styles.dataCellLast : null,
          ]}
        >
          <Text style={[textStyle, role !== 'header' && column.numeric ? styles.numeric : null]}>
            {record[column.key] ?? ''}
          </Text>
        </View>
      )
    })

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
        {renderCells(
          Object.fromEntries(columns.map((column) => [column.key, column.header])),
          'header',
        )}
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
          {renderCells(record, 'body')}
        </View>
      ))}

      {totals ? (
        <View style={styles.dataTotalsRow} wrap={false}>
          {renderCells(totals, 'total')}
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

function PageOneFooter({ projectReference = '', reportDate = '' }) {
  const reference = String(projectReference || '').trim()
  const title = 'Daily Site Diary'
  const date = String(reportDate || '').trim()
  const left = [reference, title, date].filter(Boolean).join(' · ') || ' '
  return (
    <View style={styles.pageOneFooter}>
      <Text style={styles.pageOneFooterLeft}>{left}</Text>
      <Text
        style={styles.pageOneFooterRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

function coverScheduleRows({
  clientName,
  projectManager,
  companyName,
  authorName,
  reportingOnBehalfOf,
  authorRole,
  commencementDate,
  plannedCompletionDate,
  shift,
  weather,
  reportDate,
}) {
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
  // Organisation/Report Author, and so on. Project name and address stay in
  // the band. The reference stays in the banner. The report date is its own
  // full-width row so those pairs are not reshuffled.
  // No Site Manager field exists in the report payload; the author is recorded
  // as the author, not inferred to be the Site Manager.
  return [
    { label: 'Report Date', value: displayDate(reportDate), span: 'full' },
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
    { label: 'Project Week', value: projectWeek, span: 'full' },
  ]
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
  detailsNumber = null,
}) {
  const accent = brandColor
  const displayDate = (value) =>
    cleanPdfValue(value) ? formatProjectDateDisplay(value) : ''
  const scheduleRows = coverScheduleRows({
    clientName,
    projectManager,
    companyName,
    authorName,
    reportingOnBehalfOf,
    authorRole,
    commencementDate,
    plannedCompletionDate,
    shift,
    weather,
    reportDate,
  })

  const hasScheduleRows = scheduleRows.some((item) => item.value)

  return (
    <Page size="A4" style={styles.pageOne} wrap={false}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        reportReference={cleanPdfValue(reportReference)}
        projectReference={cleanPdfValue(projectReference)}
        projectName={cleanPdfValue(projectName)}
        reportDate={displayDate(reportDate)}
      />

      <ProjectIdentity
        projectName={cleanPdfValue(projectName)}
        projectAddress={cleanPdfValue(projectAddress)}
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
        <SectionHeading accent={accent} number={detailsNumber}>PROJECT / REPORT DETAILS</SectionHeading>
      ) : null}
      <ScheduleGrid rows={scheduleRows} />
    </Page>
  )
}

/**
 * Dark square, white border, white circular arrow pointing clockwise.
 * Sits in the top-right of the frame. The arrow means: turn the page
 * clockwise to see the photograph as it was taken.
 */
function RotationBadge({ marks }) {
  const icon = marks.badge - marks.border * 2 - 3
  return (
    <View
      style={{
        position: 'absolute',
        top: marks.inset,
        right: marks.inset,
        width: marks.badge,
        height: marks.badge,
        backgroundColor: '#1C2126',
        borderWidth: marks.border,
        borderStyle: 'solid',
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={icon} height={icon} viewBox="0 0 24 24">
        <Path
          d="M8 16.5 A 7 7 0 1 1 12 5"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          fill="none"
        />
        <Polygon points="10.2,2.2 16.4,5 10.6,8" fill="#FFFFFF" />
      </Svg>
    </View>
  )
}

/** Optional area label, bottom-left inside the photograph, above the caption bar. */
function AreaTag({ text, marks }) {
  if (!text) return null
  return (
    <View
      style={{
        position: 'absolute',
        left: marks.inset,
        bottom: marks.inset,
        backgroundColor: '#1C2126',
        paddingHorizontal: 4 * marks.scale,
        paddingVertical: 2 * marks.scale,
        maxWidth: '68%',
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontFamily: 'Helvetica-Bold',
          fontSize: marks.tagSize,
          lineHeight: 1.1,
        }}
      >
        {text}
      </Text>
    </View>
  )
}

/**
 * One photographic record as a fixed report cell:
 * - the outer frame is sized by the grid, never by the photograph
 * - the image viewport contains the photograph (no crop / stretch / distortion)
 * - the caption slot sits beneath the image and scales with the frame
 * Stored orientation is baked into `src`. A landscape photograph that is not
 * already 3:4 is turned anticlockwise in that bake and marked with a badge.
 * The viewport is 3:4 and only contains the result, so nothing is cropped.
 */
function FramedPhoto({
  src,
  caption,
  assignedToLine,
  frameWidth,
  imageH,
  captionH,
  marks,
  gapRight = 0,
  photoNumber,
  rot = false,
  tag = null,
}) {
  if (!src) return null
  const refLabel = photoReferenceLabel(photoNumber)
  const captionText = typeof caption === 'string' ? caption.trim() : ''
  const assignedLine = typeof assignedToLine === 'string' ? assignedToLine.trim() : ''
  const tagText = typeof tag === 'string' ? tag.trim() : ''
  const captionMetrics = scaledCaptionMetrics(captionH)

  const maxImageW = frameWidth - PDF_PHOTO_FRAME_BORDER * 2
  const pixels = jpegPixelSize(src)
  const fitted = snugPhotoBox(pixels?.width, pixels?.height, maxImageW, imageH)
  const snugFrameW = fitted.width + PDF_PHOTO_FRAME_BORDER * 2

  return (
    <View style={{ width: frameWidth, marginRight: gapRight }} wrap={false}>
      <View style={[styles.photoFrame, { width: snugFrameW }]} wrap={false}>
        <View style={[styles.photoViewport, { width: fitted.width, height: fitted.height }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={src} style={styles.imageContain} />
          {rot ? <RotationBadge marks={marks} /> : null}
          {tagText ? <AreaTag text={tagText} marks={marks} /> : null}
        </View>
        <View
          style={[
            styles.photoCaptionSlot,
            {
              height: captionMetrics.height,
              paddingVertical: captionMetrics.padY,
              paddingHorizontal: captionMetrics.padX,
            },
          ]}
        >
          <Text style={[styles.photoRef, { fontSize: captionMetrics.refSize, letterSpacing: 0.9 * (captionMetrics.height / PDF_PHOTO_CAPTION_SLOT_H) }]}>
            {refLabel}
          </Text>
          <Text style={[styles.caption, { fontSize: captionMetrics.captionSize }]} maxLines={1}>
            {captionText}
          </Text>
          <Text style={[styles.assignedTo, { fontSize: captionMetrics.assignedSize }]} maxLines={1}>
            {assignedLine}
          </Text>
        </View>
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
function PhotoGrid({
  photos,
  count = 4,
  cols: requestedCols = null,
  rows = null,
  contentH = PDF_CONTENT_H,
  pageContentH = null,
}) {
  const geometry = computePhotoFrameGeometry({
    count,
    cols: requestedCols,
    rows,
    contentH,
    pageContentH,
  })
  const cols = geometry.cols
  const marks = frameMarksForImage(geometry.imageW)
  const chunks = []
  for (let index = 0; index < photos.length; index += cols) {
    chunks.push(photos.slice(index, index + cols))
  }
  return (
    <View
      style={[
        styles.photoGrid,
        {
          width: geometry.gridW,
          marginLeft: geometry.offsetX,
          marginTop: 0,
        },
      ]}
      wrap={false}
    >
      {chunks.map((row, rowIndex) => {
        return (
          <View
            key={`photo-row-${rowIndex}`}
            style={[
              styles.photoGridRow,
              rowIndex === chunks.length - 1 ? null : { marginBottom: PDF_PHOTO_GUTTER },
            ]}
            wrap={false}
          >
            {row.map((photo, columnIndex) => (
              <FramedPhoto
                key={photo.key || `photo-${rowIndex}-${columnIndex}`}
                src={photoSrc(photo)}
                caption={photoTileCaption(photo)}
                assignedToLine={photoTileAssignedToLine(photo)}
                frameWidth={geometry.frameW}
                imageH={geometry.imageH}
                captionH={geometry.captionH}
                marks={marks}
                gapRight={columnIndex === cols - 1 ? 0 : PDF_PHOTO_GUTTER}
                photoNumber={photo.reportPhotoNumber}
                rot={photo.options?.rot === true}
                tag={photo.options?.tag || null}
              />
            ))}
          </View>
        )
      })}
    </View>
  )
}

/**
 * In-page area name on a dedicated photographic page.
 *
 * Never use record-stream minPresenceAhead, and never wrap={false}: both can
 * leave an explicit photo page empty while React-PDF advances again.
 */
function AreaPhotoSectionBanner({ children, number = null, accent = null }) {
  const color = resolvePdfTableRuleColor(accent)
  return (
    <View>
      <View style={[styles.tableTopRule, { backgroundColor: color }]} />
      <View style={styles.areaPhotoSectionBanner}>
        <Text style={styles.areaSubheadingText}>
          {numberedSectionLabel(number, children)}
        </Text>
      </View>
    </View>
  )
}

function photosPerPageForLayout(layout) {
  if (layout === 'full') return 1
  if (layout === 'grid6') return 6
  if (layout === 'grid2') return 2
  return 4
}

/**
 * One work-photo area inside the shared flow. The area sub-heading is glued
 * to that area's first row. Later rows follow, and a short last row stays short.
 */
function AreaPhotographicSection({
  areaName,
  photos,
  layout = 'grid4',
  brandColor,
  sectionHeading = null,
}) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : []
  if (!list.length) return null
  const perPage = photosPerPageForLayout(layout)
  const { cols, rows } = photoGridForTier(perPage)
  const contentH = photoFlowGridBudget()
  const heading = photographicRecordAreaTitle(areaName)
  const blocks = []
  for (let index = 0; index < list.length; index += cols) {
    const row = list.slice(index, index + cols)
    const firstRow = index === 0
    const lastRow = index + cols >= list.length
    blocks.push(
      <View
        key={`${heading}-${index}`}
        wrap={false}
        style={lastRow ? null : { marginBottom: PDF_PHOTO_GUTTER }}
      >
        {firstRow ? sectionHeading : null}
        {firstRow ? (
          <AreaPhotoSectionBanner accent={brandColor}>{heading}</AreaPhotoSectionBanner>
        ) : null}
        <PhotoGrid
          photos={row}
          count={perPage}
          cols={cols}
          rows={rows}
          contentH={contentH}
        />
      </View>,
    )
  }
  return blocks
}

function WorkPhotographs({ areas = [], brandColor, sectionNumber = null }) {
  const list = areas.filter((area) => Array.isArray(area?.photos) && area.photos.length)
  if (!list.length) return null
  return list.map((area, areaIndex) => (
    <AreaPhotographicSection
      key={`area-${areaIndex}-${area.areaName}`}
      areaName={area.areaName}
      photos={area.photos}
      layout={area.layout || 'grid4'}
      brandColor={brandColor}
      sectionHeading={
        areaIndex === 0 ? (
          <SectionBanner accent={brandColor} presenceAhead={false} number={sectionNumber}>
            Work Photographs
          </SectionBanner>
        ) : null
      }
    />
  ))
}

function SupportingDocuments({
  documents = [],
  brandColor,
  sectionNumber = null,
  layout = 'grid4',
}) {
  const photos = (Array.isArray(documents) ? documents : [])
    .filter((doc) => doc && photoSrc(doc))
    .map((doc, index) => ({
      ...doc,
      reportPhotoNumber: index + 1,
      caption: supportingDocumentCaption(doc.name || doc.title || doc.caption),
      assignedTo: '',
    }))
  if (!photos.length) return null
  const perPage = photosPerPageForLayout(layout)
  const { cols, rows } = photoGridForTier(perPage)
  const contentH = photoFlowGridBudget()
  const blocks = []
  for (let index = 0; index < photos.length; index += cols) {
    const row = photos.slice(index, index + cols)
    const lastRow = index + cols >= photos.length
    blocks.push(
      <View
        key={`supporting-${index}`}
        wrap={false}
        style={lastRow ? null : { marginBottom: PDF_PHOTO_GUTTER }}
      >
        {index === 0 ? (
          <SectionBanner accent={brandColor} presenceAhead={false} number={sectionNumber}>
            Supporting Documents
          </SectionBanner>
        ) : null}
        <PhotoGrid
          photos={row}
          count={perPage}
          cols={cols}
          rows={rows}
          contentH={contentH}
        />
      </View>,
    )
  }
  return blocks
}

function FullPagePhotos({
  photos,
  brandColor,
  logoUrl,
  companyName,
  reportReference = '',
  title = 'Photographic record',
}) {
  return (
    <AreaPhotographicSection
      areaName={title}
      photos={photos}
      layout="full"
      brandColor={brandColor}
      logoUrl={logoUrl}
      companyName={companyName}
      reportReference={reportReference}
    />
  )
}

function GridPages({
  photos,
  perPage,
  brandColor,
  logoUrl,
  companyName,
  title,
  reportReference = '',
}) {
  const layout = Number(perPage) === 6 ? 'grid6' : Number(perPage) === 1 ? 'full' : 'grid4'
  return (
    <AreaPhotographicSection
      areaName={title}
      photos={photos}
      layout={layout}
      brandColor={brandColor}
      logoUrl={logoUrl}
      companyName={companyName}
      reportReference={reportReference}
    />
  )
}

function LabourTable({ items = [], brandColor = null, number = null, registerAttached = false }) {
  const accent = brandColor
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

  if (!rows.length) return null

  return (
    <>
      <SectionBanner
        accent={accent}
        number={number}
        aside={
          registerAttached
            ? 'Source: site attendance register, scanned'
            : 'Source: entered manually'
        }
      >
        Labour
      </SectionBanner>
      <DataTable
          accent={accent}
          columns={LABOUR_COLUMNS}
          rows={rows.map((item) => ({
            trade: String(item.trade || '').trim() || 'Not on register',
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
    </>
  )
}

function EquipmentHireTable({ items = [], brandColor = null, number = null }) {
  const accent = brandColor
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

  if (!rows.length) return null

  return (
    <>
      <SectionBanner accent={accent} number={number}>Equipment on hire</SectionBanner>
      <DataTable
          accent={accent}
          columns={EQUIPMENT_COLUMNS}
          rows={rows.map((item) => ({
            description: item.description || '—',
            supplier: item.supplier || '—',
            quantity:
              item.quantity != null && item.quantity !== '' ? String(item.quantity) : '—',
            status: item.status || '—',
          }))}
        />
    </>
  )
}

/**
 * Full-width divider that opens every section of the ordinary diary record.
 * The banner, the column header beneath it and the first data row are kept
 * together so a section never opens at the very foot of a page.
 *
 * `presenceAhead` is for the continuous record stream only. Dedicated pages
 * (photo areas, declaration after photos) must pass false — the guard reserves
 * space after the banner and forces an empty auto-continuation.
 */
function SectionBanner({ children, accent, presenceAhead = true, number = null, aside = null }) {
  const color = resolvePdfTableRuleColor(accent)
  return (
    <View
      style={styles.sectionBannerWrap}
      minPresenceAhead={presenceAhead ? SECTION_PRESENCE_AHEAD : undefined}
      wrap={presenceAhead ? false : undefined}
    >
      <View style={[styles.tableTopRule, { backgroundColor: color }]} />
      <View style={styles.sectionBanner}>
        <Text style={styles.sectionBannerText}>
          {numberedSectionLabel(number, children)}
        </Text>
        {aside ? <Text style={styles.sectionBannerAside}>{aside}</Text> : null}
      </View>
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
function RecordSection({ title, columns, items, accent, number = null }) {
  const rows = toRecordRows(items, columns)
  if (!rows.length) return null
  // A fragment, not a wrapper View: react-pdf refuses to break before a node
  // that is the first child of its container, so a wrapped heading can never
  // honour `minPresenceAhead` and ends up stranded at the foot of a page.
  return (
    <>
      <SectionBanner accent={accent} number={number}>{title}</SectionBanner>
      <DataTable columns={columns} rows={rows} accent={accent} />
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
  projectReference = '',
  projectName = '',
  reportDate = '',
  sectionNumbers = {},
  children = null,
}) {
  const accent = brandColor
  const displayDate = (value) =>
    cleanPdfValue(value) ? formatProjectDateDisplay(value) : ''

  // One continuous content stream. Every section is a sibling in the same
  // flow, so a section starts immediately below the previous one and only
  // moves to a new page when it genuinely cannot start here.
  return (
    <Page size="A4" style={styles.page}>
      <PageChrome
        brandColor={brandColor}
        logoUrl={logoUrl}
        companyName={companyName}
        reportReference={reportReference}
        projectReference={projectReference}
        projectName={projectName}
        reportDate={displayDate(reportDate)}
      />
      {String(siteSummary || '').trim() ? (
        <>
          <SectionBanner accent={accent} number={sectionNumbers.summary}>Site summary</SectionBanner>
          <Text style={styles.body}>{siteSummary}</Text>
        </>
      ) : null}
      <LabourTable items={labour}
        brandColor={accent}
        number={sectionNumbers.labour}
        registerAttached={sectionNumbers.register != null}
      />
      <EquipmentHireTable items={equipmentHire} brandColor={accent} number={sectionNumbers.equipment} />
      <RecordSection
        title="Site attendance"
        columns={ATTENDANCE_COLUMNS}
        items={attendance}
        accent={accent}
        number={sectionNumbers.attendance}
      />
      <RecordSection
        title="Visitors"
        columns={VISITOR_COLUMNS}
        items={visitors}
        accent={accent}
        number={sectionNumbers.visitors}
      />
      <RecordSection
        title="Permits to work"
        columns={PERMIT_COLUMNS}
        items={permits}
        accent={accent}
        number={sectionNumbers.permits}
      />
      <RecordSection
        title="Deliveries"
        columns={DELIVERY_COLUMNS}
        items={deliveries}
        accent={accent}
        number={sectionNumbers.deliveries}
      />
      <RecordSection
        title="Temporary works & scaffolding checks"
        columns={TEMPORARY_WORKS_COLUMNS}
        items={temporaryWorks}
        accent={accent}
        number={sectionNumbers.temporaryWorks}
      />
      <RecordSection
        title="Work area records"
        columns={WORK_AREA_COLUMNS}
        items={workAreas}
        accent={accent}
        number={sectionNumbers.workAreas}
      />
      {children}
    </Page>
  )
}

/**
 * Compact end-of-report certification block, not a ceremonial full page.
 *
 * When nested in the record stream, `presenceAhead` keeps the banner with its
 * body. When hosted on a dedicated page after photo areas, pass
 * presenceAhead={false} so React-PDF does not insert a blank page first.
 */
function DeclarationBlock({
  brandColor,
  authorName,
  authorRole,
  reportDate,
  signatureSrc,
  presenceAhead = true,
  number = null,
}) {
  const accent = brandColor

  const rows = [
    { label: 'Author Name', value: authorName?.trim() || '—' },
    { label: 'Position / Role', value: authorRole?.trim() || '—' },
    { label: 'Date', value: reportDate || '—' },
  ]

  return (
    <View wrap={false}>
      <SectionBanner accent={accent} presenceAhead={presenceAhead} number={number}>
        Declaration &amp; signature
      </SectionBanner>
      <Text style={[styles.signDeclaration, styles.body]}>{DECLARATION}</Text>
      <View style={styles.dataTable}>
        {rows.map((item) => (
          <View key={item.label} style={styles.dataRow} wrap={false}>
            <View style={[styles.dataCell, styles.dataLabelCell, { width: '32%' }]}>
              <Text style={styles.dataHeaderText}>{item.label}</Text>
            </View>
            <View style={[styles.dataCell, styles.dataCellLast, { flex: 1 }]}>
              <Text style={styles.dataValueText}>{item.value}</Text>
            </View>
          </View>
        ))}
        <View style={[styles.dataRow, { borderBottomWidth: 0 }]} wrap={false}>
          <View style={[styles.dataCell, styles.dataLabelCell, { width: '32%' }]}>
            <Text style={styles.dataHeaderText}>Signature</Text>
          </View>
          <View style={[styles.dataCell, styles.dataCellLast, styles.signValueCell]}>
            {signatureSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
              <Image src={signatureSrc} style={styles.signImage} />
            ) : (
              <Text style={styles.dataValueText}>No signature captured</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

function attendanceRegisterPageGroups(sheets) {
  const list = (Array.isArray(sheets) ? sheets : []).filter(
    (sheet) => sheet && (sheet.imageSrc || sheet.fileName),
  )
  const groups = []
  for (let index = 0; index < list.length; index += 1) {
    groups.push(list.slice(index, index + 1))
  }
  return groups
}

// Heading and legal line, as Yoga measures them. The note sets no lineHeight,
// so its box is the page line (9.5 × 1.45), and the margins sit outside the
// boxes. The image gets whatever height is left in the content box. The group
// then equals one printable page and cannot compress the sections above it.
const ATTENDANCE_BANNER_H = 14 + TABLE_TOP_RULE_W + 10 + 8.5 * 1.4
const ATTENDANCE_NOTE_H = 4 + 6 + 9.5 * 1.45

function attendanceRegisterFrameHeight(withHeading) {
  const reserved = withHeading ? ATTENDANCE_BANNER_H + ATTENDANCE_NOTE_H : 0
  // Stay a hair under the content box. The same subtraction in floating
  // point lands just past the page, and that is enough to overflow it.
  return PDF_CONTENT_H - reserved - 0.5
}

/**
 * Attendance evidence after the site records and before the work photographs.
 * Each sheet is one page. The image keeps its own aspect ratio and is scaled
 * to the printable area — width or height, whichever binds first. The first
 * page shares that area with the heading and the legal line. The file itself
 * is unchanged; only this frame sets the display size.
 */
function AttendanceRegisterPages({
  sheets,
  brandColor,
  sectionNumber = null,
}) {
  const groups = attendanceRegisterPageGroups(sheets)
  if (!groups.length) return null
  return (
    <>
      {groups.map((group, pageIndex) => {
        const withHeading = pageIndex === 0
        const frameHeight = attendanceRegisterFrameHeight(withHeading)
        return (
          <View key={`attendance-group-${pageIndex}`} wrap={false}>
            {withHeading ? (
              <>
                <SectionBanner
                  accent={brandColor}
                  number={sectionNumber}
                  presenceAhead={false}
                >
                  Attendance Register
                </SectionBanner>
                <Text style={styles.evidenceNote}>Legal document - reproduced untouched.</Text>
              </>
            ) : null}
            {group.map((sheet, sheetIndex) => (
              <View
                key={`attendance-sheet-${pageIndex}-${sheetIndex}`}
                style={{
                  width: PDF_PAGE_INNER_W,
                  height: frameHeight,
                  justifyContent: 'flex-start',
                  marginBottom: 0,
                }}
              >
                {sheet.imageSrc ? (
                  // The box is the printable remainder. Contain-fit scales the
                  // original to whichever of width or height binds first.
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
                  <Image
                    src={sheet.imageSrc}
                    style={{
                      width: PDF_PAGE_INNER_W,
                      height: frameHeight,
                      ...PDF_PHOTO_FIT,
                    }}
                  />
                ) : (
                  <Text style={styles.body}>Attached record: {sheet.fileName}</Text>
                )}
              </View>
            ))}
          </View>
        )
      })}
    </>
  )
}

/**
 * Diary PDF with a report summary page, photographic record pages by work area
 * (area title + that area’s photos-per-page layout), then the declaration.
 *
 * Photo schedule rules:
 * - contain-fit only inside fixed plates (no crop / stretch)
 * - continuous Photo 1..N across the whole report (recalculated at generation)
 * - area titles from persisted photo.location (Location Walk / report_photos)
 * - each area begins with a visible section heading, then only that area's photos
 * - caption band is fixed height; long captions clamp rather than move the plate
 *
 * photos: [{ key?, src|preview|url, caption, location?, layout: 'full'|'grid4'|'grid6', sequence_number? }]
 * labour: [{ trade, company, headcount|count, hours }]
 * equipmentHire: [{ description, supplier, quantity, status }]
 */
function hasLabourRows(items) {
  return Array.isArray(items) && items.some(
    (i) =>
      i &&
      (String(i.trade || '').trim() ||
        String(i.company || '').trim() ||
        (i.headcount != null && i.headcount !== '') ||
        (i.count != null && i.count !== '') ||
        (i.hours != null && i.hours !== '')),
  )
}

function hasEquipmentRows(items) {
  return Array.isArray(items) && items.some(
    (i) =>
      i &&
      (String(i.description || '').trim() ||
        String(i.supplier || '').trim() ||
        (i.quantity != null && i.quantity !== '') ||
        (i.status && i.status !== 'Active')),
  )
}

function diarySectionNumbers({
  coverDetails,
  siteSummary,
  labour,
  equipmentHire,
  attendance,
  visitors,
  permits,
  deliveries,
  temporaryWorks,
  workAreas,
  attendanceRegisterSheets,
  areas,
  supportingDocuments = [],
}) {
  const numbers = { photos: [] }
  let next = 0
  const take = () => {
    next += 1
    return next
  }
  numbers.details = coverDetails ? take() : null
  numbers.summary = String(siteSummary || '').trim() ? take() : null
  numbers.labour = hasLabourRows(labour) ? take() : null
  numbers.equipment = hasEquipmentRows(equipmentHire) ? take() : null
  numbers.attendance = toRecordRows(attendance, ATTENDANCE_COLUMNS).length ? take() : null
  numbers.visitors = toRecordRows(visitors, VISITOR_COLUMNS).length ? take() : null
  numbers.permits = toRecordRows(permits, PERMIT_COLUMNS).length ? take() : null
  numbers.deliveries = toRecordRows(deliveries, DELIVERY_COLUMNS).length ? take() : null
  numbers.temporaryWorks = toRecordRows(temporaryWorks, TEMPORARY_WORKS_COLUMNS).length ? take() : null
  numbers.workAreas = toRecordRows(workAreas, WORK_AREA_COLUMNS).length ? take() : null
  const hasPhotos = areas.length > 0
  const hasSupporting = supportingDocuments.some((doc) => doc && (doc.src || doc.preview || doc.url))
  if (!hasPhotos && !hasSupporting) numbers.declaration = take()
  numbers.register = attendanceRegisterPageGroups(attendanceRegisterSheets).length ? take() : null
  if (hasPhotos) numbers.photos = take()
  if (hasSupporting) numbers.supporting = take()
  if (hasPhotos || hasSupporting) numbers.declaration = take()
  return numbers
}

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
  attendanceRegisterSheets = [],
  supportingDocuments = [],
}) {
  const schedule = buildPhotoAreaSchedule(photos)
  const sectionNumbers = diarySectionNumbers({
    coverDetails: coverScheduleRows({
      clientName,
      projectManager,
      companyName,
      authorName,
      reportingOnBehalfOf,
      authorRole,
      commencementDate,
      plannedCompletionDate,
      shift,
      weather,
      reportDate,
    }).some((item) => item.value),
    siteSummary,
    labour,
    equipmentHire,
    attendance,
    visitors,
    permits,
    deliveries,
    temporaryWorks,
    workAreas,
    attendanceRegisterSheets,
    areas: schedule.areas,
    supportingDocuments,
  })

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
        detailsNumber={sectionNumbers.details}
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
        projectReference={projectReference}
        projectName={projectName}
        reportDate={reportDate}
        sectionNumbers={sectionNumbers}
      >
        <AttendanceRegisterPages
          sheets={attendanceRegisterSheets}
          brandColor={brandColor}
          sectionNumber={sectionNumbers.register}
        />

        <WorkPhotographs
          areas={schedule.areas}
          brandColor={brandColor}
          sectionNumber={sectionNumbers.photos}
        />
        <SupportingDocuments
          documents={supportingDocuments}
          brandColor={brandColor}
          sectionNumber={sectionNumbers.supporting}
          layout={schedule.areas[0]?.layout || 'grid4'}
        />

        <DeclarationBlock
          brandColor={brandColor}
          authorName={authorName}
          authorRole={authorRole}
          reportDate={reportDate}
          signatureSrc={signatureSrc}
          number={sectionNumbers.declaration}
        />
      </ReportContentPage>
    </Document>
  )
}
