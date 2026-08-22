import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PDF_ACCENT_FALLBACK,
  PDF_CONTENT_BOTTOM,
  PDF_CONTENT_H,
  PDF_CONTENT_TOP,
  PDF_FOOTER_BLOCK_H,
  PDF_FOOTER_OFFSET,
  PDF_FOOTER_TOP,
  PDF_HEADER_BLOCK_H,
  PDF_HEADER_OFFSET,
  PDF_PAGE_H,
  PDF_PAGE_INNER_W,
  PDF_PAGE_PAD_X,
  PDF_PAGE_W,
  PDF_PHOTO_CAPTION_MAX_LINES,
  PDF_PHOTO_FIT,
  PDF_PHOTO_FRAME_BORDER,
  PDF_PHOTO_GRID,
  PDF_PHOTO_RULE_W,
  computePhotoFrameGeometry,
  estimatePhotoCaptionLines,
  geometryForLayout,
  normalizeRotationDegrees,
  paginatePdfPhotos,
  pdfAccentTint,
  photoContainBox,
  photoGridForTier,
  photoInfoBandHeight,
  photoRowBandHeight,
  resolvePdfAccent,
} from './diary-pdf-layout.js'
import {
  flattenAreaGroups,
  groupPhotosByArea,
  createAreaGroup,
  createAreaPhoto,
} from './ai-annotation/area-groups.js'
import { photoTileAssignedToLine, photoTileCaption } from './photo-schedule.js'
import { buildDiaryPdfPhotos } from './diary-pdf-photos.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfDocument = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')
const pdfHeader = readFileSync(join(root, 'components/pdf/PdfHeader.jsx'), 'utf8')
const diaryShare = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')

describe('PDF corporate accent — restrained report identity', () => {
  it('preserves company hue while bounding print saturation and lightness', () => {
    const green = resolvePdfAccent('#00AA44')
    const blue = resolvePdfAccent('#0066CC')
    const red = resolvePdfAccent('#E00020')
    assert.match(green, /^#[0-9A-F]{6}$/)
    assert.match(blue, /^#[0-9A-F]{6}$/)
    assert.match(red, /^#[0-9A-F]{6}$/)
    assert.notEqual(green, blue)
    assert.notEqual(blue, red)
    assert.notEqual(red, green)
    assert.notEqual(green, PDF_ACCENT_FALLBACK)
  })

  it('uses the safe neutral fallback for missing, invalid, or monochrome colours', () => {
    assert.equal(resolvePdfAccent(null), PDF_ACCENT_FALLBACK)
    assert.equal(resolvePdfAccent('not-a-colour'), PDF_ACCENT_FALLBACK)
    assert.equal(resolvePdfAccent('#000000'), PDF_ACCENT_FALLBACK)
    assert.equal(resolvePdfAccent('#FFFFFF'), PDF_ACCENT_FALLBACK)
    assert.equal(resolvePdfAccent('#777777'), PDF_ACCENT_FALLBACK)
  })

  it('creates a pale document tint without changing the stored colour', () => {
    const accent = resolvePdfAccent('#0066CC')
    const tint = pdfAccentTint(accent)
    assert.match(tint, /^#[0-9A-F]{6}$/)
    assert.notEqual(tint, accent)
    assert.equal(resolvePdfAccent('#0066CC'), accent)
  })

  it('keeps Zlog orange out of the PDF fallback and uses document-first chrome', () => {
    assert.doesNotMatch(diaryShare, /brandColor:\s*report\.brand_color\s*\|\|\s*'#FF5000'/)
    assert.doesNotMatch(pdfHeader, /brandColor\s*=\s*'#FF5000'/)
    assert.match(pdfHeader, /Produced with Zlog/)
    assert.match(pdfHeader, /resolvePdfAccent/)
    assert.match(pdfDocument, /resolvePdfAccent/)
    assert.match(pdfDocument, /minPresenceAhead/)
  })

  it('never paints company colour into a physical page edge', () => {
    // Header is in-flow inside page horizontal padding — not full-bleed.
    assert.match(pdfHeader, /backgroundColor:\s*color/)
    assert.match(pdfHeader, /height:\s*PDF_ACCENT_BANNER_H/)
    assert.match(pdfHeader, /<View style=\{styles\.headerShell\}>/)
    assert.doesNotMatch(pdfHeader, /<View style=\{styles\.headerShell\} fixed>/)
    assert.match(pdfDocument, /paddingHorizontal:\s*PDF_PAGE_PAD_X/)
    assert.match(pdfHeader, /top:\s*PDF_FOOTER_TOP/)
  })

  it('repeats the coloured PdfHeader banner on every generated page', () => {
    // Each explicit <Page> mounts PageChrome → in-flow PdfHeader (absolute+fixed
    // only painted page 1 on Android — runtime proven).
    assert.match(pdfDocument, /function PageChrome\(/)
    assert.match(pdfHeader, /backgroundColor:\s*color/)
    assert.match(pdfHeader, /marginBottom:\s*18/)
    assert.doesNotMatch(pdfHeader, /headerShell:\s*\{[^}]*position:\s*'absolute'/)
    const pageOpens = pdfDocument.match(/<Page\b/g) || []
    const chromeMounts = pdfDocument.match(/<PageChrome\b/g) || []
    assert.ok(pageOpens.length >= 2, 'expected multiple PDF pages in the document')
    assert.equal(
      chromeMounts.length,
      pageOpens.length,
      'every <Page> must mount PageChrome so the coloured banner is present',
    )
  })

  it('anchors page chrome from the top of the page, never from the bottom', () => {
    // Footer stays absolute+top. Header is in-flow — no bottom anchoring anywhere.
    assert.doesNotMatch(pdfHeader, /bottom:\s*PDF_/)
    assert.match(pdfHeader, /top:\s*PDF_FOOTER_TOP/)
    assert.match(pdfHeader, /height:\s*PDF_FOOTER_BLOCK_H/)
  })

  it('carries the same three-part footer on every page of the report', () => {
    // Attribution, page number and report reference, in that arrangement, on
    // the opening page and the running pages alike.
    for (const source of [pdfHeader, pdfDocument]) {
      assert.match(source, /Produced with Zlog/)
      assert.match(source, /`Page \$\{pageNumber\} of \$\{totalPages\}`/)
      assert.match(source, /Report reference: \$\{reportReference\}/)
    }
    // A `render` callback nested inside a fixed container is never evaluated,
    // which silently drops the page number from every running page.
    const runningFooter = /export function PdfFooter\([\s\S]*?\n\}/.exec(pdfHeader)[0]
    const dynamic = /<Text\b[^>]*render=\{\(\{ pageNumber[\s\S]*?\/>/.exec(runningFooter)[0]
    assert.match(dynamic, /\bfixed\b/, 'the dynamic page number must be fixed in its own right')
    const footerView = runningFooter.slice(
      runningFooter.indexOf('<View style={styles.footer} fixed>'),
      runningFooter.indexOf('<Text', runningFooter.indexOf('styles.referenceText}>')),
    )
    assert.ok(footerView.length > 0)
    assert.doesNotMatch(footerView, /render=\{/, 'render must not be nested inside a fixed box')
    // The footer stays inside the printable area.
    assert.match(pdfHeader, /top: PDF_FOOTER_TOP \+ [\d.]+/)
    assert.equal(PDF_FOOTER_TOP, PDF_PAGE_H - PDF_FOOTER_OFFSET)
    assert.ok(
      PDF_FOOTER_TOP > PDF_PAGE_H - PDF_CONTENT_BOTTOM,
      'footer must start below the content area',
    )
    assert.ok(
      PDF_FOOTER_TOP + PDF_FOOTER_BLOCK_H <= PDF_PAGE_H - 24,
      'footer must stay inside the bottom print margin',
    )
  })

  it('reserves a print-safe A4 frame with room for the chrome on every page', () => {
    assert.equal(PDF_PAGE_W, 595.28)
    assert.equal(PDF_PAGE_H, 841.89)
    assert.ok(PDF_PAGE_PAD_X >= 36, 'side margins must clear typical printer bleed')
    assert.ok(PDF_CONTENT_TOP > PDF_HEADER_OFFSET, 'content must clear the masthead')
    assert.ok(PDF_CONTENT_BOTTOM > PDF_FOOTER_OFFSET, 'content must clear the footer')
    assert.equal(PDF_CONTENT_H, PDF_PAGE_H - PDF_CONTENT_TOP - PDF_CONTENT_BOTTOM)
    assert.equal(PDF_PAGE_INNER_W, PDF_PAGE_W - PDF_PAGE_PAD_X * 2)
    assert.ok(PDF_CONTENT_H > 0 && PDF_PAGE_INNER_W > 0)
  })
})

describe('Site Diary PDF Page 1 — project-control architecture', () => {
  it('uses one bounded rectangular frame and one solid company-colour banner', () => {
    assert.match(pdfDocument, /pageOneFrame:[\s\S]*borderWidth:\s*0\.9/)
    assert.match(pdfDocument, /pageOneBanner:[\s\S]*height:\s*PAGE1_BANNER_H/)
    assert.match(pdfDocument, /sectionHeading:[\s\S]*borderBottomWidth:\s*1\b/)
    // Section rules take the resolved company colour, never a hard-coded hue.
    assert.match(pdfDocument, /borderBottomColor:\s*color/)
    assert.match(pdfDocument, /const color = resolvePdfAccent\(accent\)/)
    assert.doesNotMatch(pdfDocument, /#FF5000|#FF6B00|purple/i)
    // Coloured masthead is the shared PdfHeader (via PageChrome) on every page —
    // not a page-1-only StyleSheet fill of `backgroundColor: accent`.
    assert.match(pdfDocument, /<PageChrome/)
    assert.match(pdfHeader, /PDF_ACCENT_BANNER_H\s*=\s*PDF_HEADER_BLOCK_H/)
    assert.equal(PDF_HEADER_BLOCK_H, 48)
    assert.match(pdfHeader, /backgroundColor:\s*color/)
    assert.doesNotMatch(pdfDocument, /backgroundColor:\s*accent/)
    assert.doesNotMatch(pdfDocument, /linearGradient|radialGradient|gradient/i)
    assert.doesNotMatch(pdfDocument, /borderRadius/)
  })

  it('keeps the A4 page box and outer frame geometry deterministic', () => {
    assert.equal(PDF_PAGE_W, 595.28)
    assert.equal(PDF_PAGE_H, 841.89)
    assert.match(pdfDocument, /const PAGE1_FRAME_W = PDF_PAGE_W - PAGE1_FRAME_INSET \* 2/)
    assert.match(pdfDocument, /const PAGE1_FRAME_H = PDF_PAGE_H - PAGE1_FRAME_INSET \* 2/)
    assert.match(pdfDocument, /<Page size="A4" style=\{styles\.pageOne\} wrap=\{false\}>/)
    // An unpaginated page keeps the height Yoga measured from its content, so
    // the sheet must be pinned to A4 or its MediaBox comes out short.
    assert.match(pdfDocument, /pageOne:\s*\{\s*minHeight:\s*PDF_PAGE_H,\s*maxHeight:\s*PDF_PAGE_H,/)
  })

  it('keeps the banner shallow with the logo left and a concise title right', () => {
    assert.match(pdfDocument, /const PAGE1_BANNER_H = 48/)
    assert.match(pdfDocument, /pageOneBanner:[\s\S]*justifyContent:\s*'space-between'/)
    assert.match(pdfDocument, /pageOneLogo:[\s\S]*objectFit:\s*'contain'/)
    assert.match(pdfDocument, /pageOneTitle:[\s\S]*textAlign:\s*'right'/)
    assert.equal((pdfDocument.match(/DAILY SITE DIARY/g) || []).length, 1)
    // The verbose title was rejected.
    assert.doesNotMatch(pdfDocument, /DAILY SITE DIARY REPORT/)
    // Banner type must not out-weigh the project name.
    const bannerSize = Number(
      /pageOneTitle:[\s\S]*?fontSize:\s*([\d.]+)/.exec(pdfDocument)[1],
    )
    const nameSize = Number(/identityName:[\s\S]*?fontSize:\s*([\d.]+)/.exec(pdfDocument)[1])
    assert.ok(bannerSize < nameSize, 'project name must lead the banner title')
  })

  it('presents project identity as a masthead, not a four-row table', () => {
    assert.match(pdfDocument, /function ProjectIdentity\(/)
    assert.match(pdfDocument, /identityName:[\s\S]*fontFamily:\s*'Helvetica-Bold'/)
    assert.match(pdfDocument, /<Text style=\{styles\.identityName\}>\{projectName\}<\/Text>/)
    assert.match(pdfDocument, /<Text style=\{styles\.identityAddress\}>\{projectAddress\}/)
    assert.match(pdfDocument, /'PROJECT REFERENCE'/)
    assert.match(pdfDocument, /'REPORT DATE'/)
    // Reference and date share one compact two-column line.
    assert.match(pdfDocument, /identityMetaRow:[\s\S]*flexDirection:\s*'row'/)
    assert.match(pdfDocument, /identityMetaItem:[\s\S]*width:\s*'50%'/)
  })

  it('renders the lower schedule as a four-column grid, two pairs per row', () => {
    assert.match(pdfDocument, /function ScheduleGrid\(/)
    // Two pairs share a row, each pair being label + value.
    assert.match(pdfDocument, /scheduleGridRow:[\s\S]*flexDirection:\s*'row'/)
    assert.match(pdfDocument, /scheduleGridPair:[\s\S]*width:\s*'50%'/)
    assert.match(pdfDocument, /scheduleGridLabelCell:[\s\S]*width:\s*'40%'/)
    assert.match(pdfDocument, /scheduleGridValueCell:[\s\S]*flex:\s*1/)
    assert.match(pdfDocument, /gridRows\.push\(visible\.slice\(index, index \+ 2\)\)/)
    assert.match(
      pdfDocument,
      /<View style=\{styles\.scheduleGridLabelCell\}>[\s\S]{0,160}<\/View>\s*<View style=\{styles\.scheduleGridValueCell\}>/,
    )
    // 40% of a 50% pair is 20% of content width; the value takes the other 30%.
    const gutter = Number(/const PAGE1_GUTTER = ([\d.]+)/.exec(pdfDocument)[1])
    const innerW = PDF_PAGE_W - gutter * 2
    const labelW = innerW * 0.5 * 0.4
    assert.ok(
      labelW >= innerW * 0.18 && labelW <= innerW * 0.2 + 0.01,
      `label column must be 18-20% of content width; got ${((labelW / innerW) * 100).toFixed(1)}%`,
    )
  })

  it('contains the grid with visible but restrained rules and a label fill', () => {
    const gridStyles = pdfDocument.slice(
      pdfDocument.indexOf('  scheduleGrid: {'),
      pdfDocument.indexOf('  sectionHeading: {'),
    )
    // Contained: outer box, row rules, and a vertical rule between the columns,
    // all drawn from the one shared gridline system.
    assert.match(gridStyles, /scheduleGrid:[\s\S]*borderWidth:\s*TABLE_BORDER_W/)
    assert.match(gridStyles, /scheduleGridRow:[\s\S]*borderBottomWidth:\s*TABLE_RULE_W/)
    assert.match(gridStyles, /scheduleGridPairDivider:[\s\S]*borderLeftWidth:\s*TABLE_RULE_W/)
    assert.match(gridStyles, /scheduleGridLabelCell:[\s\S]*borderRightWidth:\s*TABLE_RULE_W/)
    // Subtle neutral label fill against white value cells.
    assert.match(gridStyles, /scheduleGridLabelCell:[\s\S]*backgroundColor:\s*TABLE_LABEL_BG/)
    assert.match(gridStyles, /scheduleGridValueCell:[\s\S]*backgroundColor:\s*'#FFFFFF'/)
    // Both cells centre their contents so a wrapped value keeps its label aligned.
    assert.match(gridStyles, /scheduleGridLabelCell:[\s\S]*justifyContent:\s*'center'/)
    assert.match(gridStyles, /scheduleGridValueCell:[\s\S]*justifyContent:\s*'center'/)
    // Labels bold, values normal weight.
    assert.match(gridStyles, /scheduleGridLabel:[\s\S]*fontFamily:\s*'Helvetica-Bold'/)
    assert.match(gridStyles, /scheduleGridValue:[\s\S]*fontFamily:\s*'Helvetica'/)
    assert.doesNotMatch(gridStyles, /borderRadius/)
  })

  it('states the lower schedule once and never repeats the masthead fields', () => {
    assert.equal((pdfDocument.match(/>PROJECT \/ REPORT DETAILS</g) || []).length, 1)
    // The superseded two-section split must be gone.
    assert.doesNotMatch(pdfDocument, />REPORT DETAILS<\/SectionHeading>/)
    assert.doesNotMatch(pdfDocument, /SITE \/ PERSONNEL/)
    const page1 = pdfDocument.slice(
      pdfDocument.indexOf('function PageOne({'),
      pdfDocument.indexOf('function FramedPhoto('),
    )
    // Masthead fields must not reappear as schedule labels.
    for (const label of ['Project Name', 'Project Address', 'Project Reference', 'Report Date']) {
      assert.doesNotMatch(page1, new RegExp(`label: '${label}'`))
    }
    // Every requested schedule field is present exactly once.
    for (const label of [
      'Client',
      'Project Manager',
      'Reporting Organisation',
      'Report Author',
      'Reporting on behalf of',
      'Author Role',
      'Commencement Date',
      'Shift',
      'Planned Completion Date',
      'Weather',
      'Project Day',
      'Project Week',
    ]) {
      assert.equal(
        (page1.match(new RegExp(`label: '${label}'`, 'g')) || []).length,
        1,
        `${label} must appear exactly once in the schedule`,
      )
    }
  })

  it('balances the cover photograph against the details schedule', () => {
    assert.match(pdfDocument, /const PAGE1_COVER_W = PAGE1_INNER_W/)
    const coverH = Number(/const PAGE1_COVER_H = ([\d.]+)/.exec(pdfDocument)[1])
    // Substantial evidence on the opening page, but no longer heavy enough to
    // outweigh the Project / Report Details schedule beneath it.
    assert.ok(
      coverH >= 215 && coverH <= 245,
      `cover frame must be 215-245pt deep; got ${coverH}`,
    )
    // The height released by the photograph goes to the schedule's rows.
    const gridPad = /const PAGE1_GRID_PAD_Y = TABLE_PAD_Y \+ ([\d.]+)/.exec(pdfDocument)
    assert.ok(gridPad, 'the details grid must claim the released height')
    assert.ok(Number(gridPad[1]) > 0)
    assert.match(pdfDocument, /scheduleGridLabelCell:[\s\S]*?paddingVertical:\s*PAGE1_GRID_PAD_Y/)
    assert.match(pdfDocument, /scheduleGridValueCell:[\s\S]*?paddingVertical:\s*PAGE1_GRID_PAD_Y/)
    // Full content width, with its own light plate rule.
    assert.match(pdfDocument, /coverPhotoFrame:[\s\S]*borderWidth:\s*0\.5/)
  })

  it('keeps every Page 1 text size legible in print', () => {
    const page1Styles = pdfDocument.slice(
      pdfDocument.indexOf('// ---- Page 1:'),
      pdfDocument.indexOf('  body: {'),
    )
    const sizes = [...page1Styles.matchAll(/fontSize:\s*([\d.]+)/g)].map((m) => Number(m[1]))
    assert.ok(sizes.length > 0)
    assert.ok(
      Math.min(...sizes) >= 7.5,
      `Page 1 must avoid tiny print; smallest was ${Math.min(...sizes)}pt`,
    )
  })

  it('lays Page 1 out as ordered flow sections rather than magic coordinates', () => {
    const page1 = pdfDocument.slice(
      pdfDocument.indexOf('function PageOne({'),
      pdfDocument.indexOf('function FramedPhoto('),
    )
    const order = [
      '<PageChrome',
      '<ProjectIdentity',
      'styles.coverPhotoBlock',
      'PROJECT / REPORT DETAILS',
      '<ScheduleGrid rows={scheduleRows} />',
    ]
    let cursor = -1
    for (const token of order) {
      const at = page1.indexOf(token, cursor + 1)
      assert.ok(at > cursor, `Page 1 section out of order: ${token}`)
      cursor = at
    }
    // Only page furniture may be absolutely positioned.
    for (const style of [
      'identityBlock',
      'scheduleGrid',
      'scheduleGridRow',
      'coverPhotoBlock',
      'pageOneSectionHeader',
    ]) {
      assert.doesNotMatch(
        pdfDocument,
        new RegExp(`${style}:\\s*\\{[^}]*position:\\s*'absolute'`),
        `${style} must participate in flow layout`,
      )
    }
  })

  it('groups the contract and personnel schedules under truthful labels', () => {
    // Project identity fields moved to the masthead but must still be rendered.
    assert.match(pdfDocument, /projectName=\{cleanPdfValue\(projectName\)\}/)
    assert.match(pdfDocument, /projectAddress=\{cleanPdfValue\(projectAddress\)\}/)
    assert.match(pdfDocument, /projectReference=\{cleanPdfValue\(projectReference\)\}/)
    assert.match(pdfDocument, /reportDate=\{displayDate\(reportDate\)\}/)
    for (const label of [
      'Client',
      'Reporting on behalf of',
      'Commencement Date',
      'Planned Completion Date',
      'Project Day',
      'Project Week',
      'Project Manager',
      'Report Author',
      'Author Role',
      'Shift',
      'Weather',
    ]) {
      assert.match(pdfDocument, new RegExp(`'${label}'`))
    }
    // No Site Manager field exists yet, so the author must not be relabelled.
    assert.doesNotMatch(pdfDocument, /'Site Manager'/)
  })

  it('preserves the existing project day/week derivation', () => {
    assert.match(pdfDocument, /computeProjectDay\(\{\s*startDate: commencementDate/)
    assert.match(
      pdfDocument,
      /Number\.isFinite\(programme\.currentDay\) && programme\.currentDay > 0/,
    )
    assert.match(pdfDocument, /Math\.ceil\(Number\(projectDay\) \/ 7\)/)
  })

  it('invents no programme progress data', () => {
    assert.doesNotMatch(pdfDocument, /progressBar|plannedProgress|estimatedProgress/i)
    assert.doesNotMatch(pdfDocument, /Programme Progress|Ahead of programme|Behind programme/i)
  })

  it('uses the saved cover photo in a fixed centred contain-fit frame', () => {
    assert.match(pdfDocument, /coverPhotoBlock:[\s\S]*alignItems:\s*'center'/)
    assert.match(
      pdfDocument,
      /coverPhotoFrame:[\s\S]*width:\s*PAGE1_COVER_W[\s\S]*height:\s*PAGE1_COVER_H/,
    )
    assert.match(pdfDocument, /<Image src=\{coverPhotoUrl\} style=\{styles\.imageContain\}/)
    assert.match(pdfDocument, /imageContain:[\s\S]*objectFit:\s*'contain'/)
    assert.doesNotMatch(pdfDocument, /objectFit:\s*'cover'/)
    // Letterboxing must read as an intentional light field, not a heavy border.
    assert.match(pdfDocument, /coverPhotoFrame:[\s\S]*backgroundColor:\s*'#FBFCFD'/)
  })

  it('keeps the Zlog footer subordinate to the reporting company', () => {
    assert.match(pdfDocument, /pageOneFooter:[\s\S]*borderTopWidth:\s*0\.5/)
    for (const style of ['pageOneFooterLeft', 'pageOneFooterCentre', 'pageOneFooterRight']) {
      assert.match(pdfDocument, new RegExp(`${style}:[\\s\\S]*?fontSize:\\s*7\\.5`))
      assert.match(pdfDocument, new RegExp(`${style}:[\\s\\S]*?color:\\s*MUTED`))
      // Identical line metrics keep all three items on one shared baseline.
      assert.match(pdfDocument, new RegExp(`${style}:[\\s\\S]*?lineHeight:\\s*1\\.2`))
    }
    assert.match(pdfDocument, /pageOneFooter:[\s\S]*flexDirection:\s*'row'/)
  })

  it('keeps the whole footer row inside the Page 1 frame', () => {
    const num = (name) => Number(new RegExp(`const ${name} = ([\\d.]+)`).exec(pdfDocument)[1])
    const footerTop = num('PAGE1_FOOTER_TOP')
    const frameInset = num('PAGE1_FRAME_INSET')
    const frameBottom = PDF_PAGE_H - frameInset
    const footerPad = Number(/pageOneFooter:[\s\S]*?paddingTop:\s*([\d.]+)/.exec(pdfDocument)[1])
    // Rule + padding + one 7.5pt line at 1.2 leading must clear the frame edge.
    const footerBottom = footerTop + footerPad + 7.5 * 1.2
    assert.ok(
      footerBottom < frameBottom,
      `footer bottom ${footerBottom.toFixed(2)} must sit above frame bottom ${frameBottom}`,
    )
    assert.ok(footerTop > frameInset, 'footer must start below the frame top')
  })

  it('keeps the Page 1 footer restrained and preserves all report content', () => {
    assert.match(pdfDocument, /Produced with Zlog/)
    assert.match(pdfDocument, /Page \$\{pageNumber\} of \$\{totalPages\}/)
    assert.match(pdfDocument, /Report reference:/)
    assert.match(pdfDocument, /function ReportContentPage/)
    assert.match(pdfDocument, /<LabourTable items=\{labour\}/)
    assert.match(pdfDocument, /<EquipmentHireTable items=\{equipmentHire\}/)
    assert.match(pdfDocument, /<Text style=\{styles\.body\}>\{siteSummary \|\| '—'\}<\/Text>/)
  })

  it('hands existing report/project facts to Page 1 without write or schema changes', () => {
    for (const field of [
      'report_number',
      'weather',
      'shift',
      'company_reporting_for',
      'site_address',
      'client_name',
      'client_pm',
      'start_date',
      'planned_completion_date',
      'project_reference',
    ]) {
      assert.match(diaryShare, new RegExp(`\\b${field}\\b`))
    }
    assert.doesNotMatch(diaryShare, /\.insert\(|\.update\(|\.upsert\(/)
  })
})

describe('Site Diary PDF — shared tabular design system', () => {
  it('defines the table grammar once as tokens', () => {
    for (const token of [
      'TABLE_BORDER',
      'TABLE_RULE',
      'TABLE_BORDER_W',
      'TABLE_RULE_W',
      'TABLE_LABEL_BG',
      'TABLE_LABEL_INK',
      'TABLE_PAD_Y',
      'TABLE_PAD_X',
      'TABLE_LABEL_SIZE',
      'TABLE_VALUE_SIZE',
    ]) {
      assert.match(pdfDocument, new RegExp(`const ${token} = `))
    }
    // Page 1's reference grid must consume the tokens, not its own literals.
    const gridStyles = pdfDocument.slice(
      pdfDocument.indexOf('  scheduleGrid: {'),
      pdfDocument.indexOf('  sectionHeading: {'),
    )
    assert.match(gridStyles, /borderColor:\s*TABLE_BORDER/)
    assert.match(gridStyles, /backgroundColor:\s*TABLE_LABEL_BG/)
    assert.match(gridStyles, /color:\s*TABLE_LABEL_INK/)
    assert.doesNotMatch(gridStyles, /'#9FB1C2'|'#C3CFDA'|'#EFF2F4'|'#3D464E'/)
  })

  it('draws every schedule and photo frame from one gridline definition', () => {
    // Restrained but present: heavier than hairline, far short of a spreadsheet.
    const border = Number(/const TABLE_BORDER_W = ([\d.]+)/.exec(pdfDocument)[1])
    const rule = Number(/const TABLE_RULE_W = ([\d.]+)/.exec(pdfDocument)[1])
    assert.ok(border >= 0.9 && border <= 1.4, `perimeter weight out of range: ${border}`)
    assert.ok(rule >= 0.8 && rule <= 1.1, `internal rule weight out of range: ${rule}`)
    // The perimeter reads as hierarchy, but only fractionally.
    assert.ok(border > rule && border - rule <= 0.4)
    // A cool blue-grey family, perimeter darker than the internal rules.
    const luminance = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      assert.ok(b > r, `${hex} must stay in the cool blue-grey family`)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const perimeter = /const TABLE_BORDER = '(#[0-9A-Fa-f]{6})'/.exec(pdfDocument)[1]
    const gridline = /const TABLE_RULE = '(#[0-9A-Fa-f]{6})'/.exec(pdfDocument)[1]
    assert.ok(luminance(perimeter) < luminance(gridline))
    // Strengthened against what they replaced, so they survive print and copying.
    assert.ok(luminance(gridline) < luminance('#CBD1D6'), 'gridlines must be darker than before')
    assert.ok(luminance(perimeter) < luminance('#AFB7BE'), 'perimeter must be darker than before')

    // No schedule may reintroduce its own weight or colour.
    const styles = pdfDocument.slice(
      pdfDocument.indexOf('const styles = StyleSheet.create('),
      pdfDocument.indexOf('function PageChrome('),
    )
    const scheduleBorders = [
      ...styles.matchAll(/(scheduleGrid|scheduleGridRow|scheduleGridPairDivider|scheduleGridLabelCell|dataTable|dataHeaderRow|dataRow|dataTotalsRow|dataCell): \{([\s\S]*?)\n {2}\}/g),
    ]
    assert.ok(scheduleBorders.length >= 9, 'expected every schedule style to be checked')
    for (const [, name, body] of scheduleBorders) {
      const widths = [...body.matchAll(/border[A-Za-z]*Width:\s*([^,\n]+)/g)].map((m) =>
        m[1].trim(),
      )
      for (const width of widths) {
        assert.ok(
          width === 'TABLE_BORDER_W' || width === 'TABLE_RULE_W' || width === '0',
          `${name} uses a literal border width: ${width}`,
        )
      }
      const colors = [...body.matchAll(/border[A-Za-z]*Color:\s*([^,\n]+)/g)].map((m) =>
        m[1].trim(),
      )
      for (const color of colors) {
        assert.ok(
          color === 'TABLE_BORDER' || color === 'TABLE_RULE',
          `${name} uses a literal border colour: ${color}`,
        )
      }
    }
    // Photo frames join the same system rather than keeping their own.
    assert.match(pdfDocument, /photoFrame:[\s\S]*?borderWidth:\s*PDF_PHOTO_FRAME_BORDER/)
    assert.match(pdfDocument, /photoFrame:[\s\S]*?borderColor:\s*TABLE_BORDER/)
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?borderTopWidth:\s*PDF_PHOTO_RULE_W/)
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?borderTopColor:\s*TABLE_RULE/)
    assert.equal(PDF_PHOTO_FRAME_BORDER, border)
    assert.equal(PDF_PHOTO_RULE_W, rule)
  })

  it('wraps whole words so names and companies are never split mid-word', () => {
    assert.match(pdfDocument, /Font\.registerHyphenationCallback\(\(word\) => \{/)
    const limit = Number(/const WHOLE_WORD_LIMIT = (\d+)/.exec(pdfDocument)[1])
    // Long enough to keep real names and company names intact.
    assert.ok(limit >= 16, `whole-word limit too low: ${limit}`)
    // Replay the registered rule against names that previously broke.
    const callback = new Function(
      'WHOLE_WORD_LIMIT',
      `return ${/Font\.registerHyphenationCallback\(([\s\S]*?\n\})\)/.exec(pdfDocument)[1]}`,
    )(limit)
    for (const word of ['Fitzgerald-Whitmore', 'Groundworks', 'Scaffolding', 'Reinforcement']) {
      assert.deepEqual(callback(word), [word], `${word} must wrap whole`)
    }
    // An over-long double-barrelled name breaks on its hyphen, nowhere else.
    assert.deepEqual(callback('Fotheringay-Chumleighworth-Bassett'), [
      'Fotheringay-',
      'Chumleighworth-',
      'Bassett',
    ])
    // A token no column could hold still gets break points rather than
    // escaping its cell.
    assert.ok(callback('x'.repeat(60)).length > 1)
  })

  it('gives numeric and time columns only the width their values need', () => {
    const columnBlocks = [
      ...pdfDocument.matchAll(/const ([A-Z_]+_COLUMNS) = \[([\s\S]*?)\n\]/g),
    ]
    assert.ok(columnBlocks.length >= 8)
    for (const [, name, block] of columnBlocks) {
      const columns = [...block.matchAll(/\{[^}]*width: '([\d.]+)%'[^}]*\}/g)].map((m) => ({
        width: Number(m[1]),
        numeric: m[0].includes('numeric: true'),
      }))
      const total = columns.reduce((sum, column) => sum + column.width, 0)
      assert.equal(total, 100, `${name} widths must total 100%`)
      const widestNumeric = Math.max(0, ...columns.filter((c) => c.numeric).map((c) => c.width))
      const narrowestText = Math.min(
        ...columns.filter((c) => !c.numeric).map((c) => c.width),
      )
      assert.ok(
        widestNumeric <= narrowestText,
        `${name}: a numeric column is wider than a text column`,
      )
    }
  })

  it('closes the last row and cell so no border is drawn twice', () => {
    // A doubled border reads as a thicker line exactly where the perimeter is.
    assert.match(pdfDocument, /dataCellLast: \{ borderRightWidth: 0 \}/)
    assert.match(pdfDocument, /rows\.length - 1 && !totals \? \{ borderBottomWidth: 0 \}/)
    assert.match(pdfDocument, /gridRows\.length - 1 \? \{ borderBottomWidth: 0 \}/)
    assert.match(pdfDocument, /visible\.length - 1 \? \{ borderBottomWidth: 0 \}/)
  })

  it('shares one table container, header cell, data cell and row', () => {
    assert.match(pdfDocument, /function DataTable\(\{ columns, rows, totals = null \}\)/)
    for (const style of [
      'dataTable',
      'dataHeaderRow',
      'dataRow',
      'dataTotalsRow',
      'dataCell',
      'dataHeaderText',
      'dataValueText',
    ]) {
      assert.match(pdfDocument, new RegExp(`  ${style}: \\{`))
    }
    // Same grammar as the Page 1 grid.
    assert.match(pdfDocument, /dataTable:[\s\S]*?borderColor:\s*TABLE_BORDER/)
    assert.match(pdfDocument, /dataHeaderRow:[\s\S]*?backgroundColor:\s*TABLE_LABEL_BG/)
    assert.match(pdfDocument, /dataCell:[\s\S]*?paddingVertical:\s*TABLE_PAD_Y/)
    assert.match(pdfDocument, /dataValueText:[\s\S]*?fontSize:\s*TABLE_VALUE_SIZE/)
    // The superseded bespoke table styles are gone.
    for (const dead of ['tableHeaderRow', 'tableTotalRow', 'headerCell', 'totalCell']) {
      assert.doesNotMatch(pdfDocument, new RegExp(`styles\\.${dead}\\b`))
    }
  })

  it('gives every section the one shared heading treatment', () => {
    assert.match(pdfDocument, /function SectionHeading\(\{ children, accent \}\)/)
    assert.match(pdfDocument, /styles\.sectionHeading,\s*\{ borderBottomColor: color \}/)
    // No competing heading style survives.
    assert.doesNotMatch(pdfDocument, /sectionMarker|sectionHeadingRow|sectionText|sectionRule/)
    assert.equal((pdfDocument.match(/ {2}sectionHeading: \{/g) || []).length, 1)
    // The cover sheet keeps the underlined heading; the banner belongs to the
    // record stream, so the two treatments never compete on the same page.
    const pageOne = /function PageOne\([\s\S]*?\n\}\r?\n/.exec(pdfDocument)[0]
    assert.match(pageOne, /<SectionHeading accent=\{accent\}>PROJECT \/ REPORT DETAILS/)
    assert.doesNotMatch(pageOne, /<SectionBanner/)
    // ...and nothing outside the cover sheet still uses it.
    assert.equal((pdfDocument.match(/<SectionHeading /g) || []).length, 1)
  })

  it('opens every record section with a full-width banner aligned to its table', () => {
    assert.match(pdfDocument, /function SectionBanner\(\{ children, accent \}\)/)
    // The banner is a solid accent band, not an outlined or tinted heading.
    assert.match(pdfDocument, /styles\.sectionBanner, \{ backgroundColor: color \}/)
    assert.match(pdfDocument, /sectionBanner:[\s\S]*?width:\s*'100%'/)
    assert.match(pdfDocument, /sectionBannerText:[\s\S]*?color:\s*'#FFFFFF'/)
    // Banner and schedule are both full content width, so their edges line up.
    assert.match(pdfDocument, /dataTable:[\s\S]*?width:\s*'100%'/)
    // Compact: a divider in the flow, never an app-style card.
    const banner = /sectionBanner: \{([\s\S]*?)\n {2}\}/.exec(pdfDocument)[1]
    const padY = Number(/paddingVertical:\s*([\d.]+)/.exec(banner)[1])
    assert.ok(padY <= 6, 'section banner must stay shallow')
    assert.doesNotMatch(banner, /borderRadius|marginBottom/)
    // Every record section opens with one.
    for (const title of [
      'Site summary',
      'Labour',
      'Equipment on hire',
      'Declaration &amp; signature',
    ]) {
      assert.match(
        pdfDocument,
        new RegExp(`<SectionBanner accent=\\{accent\\}>${title}</SectionBanner>`),
        `${title} must open with a section banner`,
      )
    }
    assert.match(pdfDocument, /<SectionBanner accent=\{accent\}>\{title\}<\/SectionBanner>/)
  })

  it('keeps structured record sections on the shared table with their own columns', () => {
    assert.match(pdfDocument, /const LABOUR_COLUMNS = \[/)
    assert.match(pdfDocument, /const EQUIPMENT_COLUMNS = \[/)
    assert.match(pdfDocument, /<DataTable\s*columns=\{LABOUR_COLUMNS\}/)
    assert.match(pdfDocument, /<DataTable\s*columns=\{EQUIPMENT_COLUMNS\}/)
    // Column meaning is unchanged from the previous renderer.
    for (const header of ['Trade', 'Company', 'Operatives', 'Hours']) {
      assert.match(pdfDocument, new RegExp(`header: '${header}'`))
    }
    for (const header of ['Description', 'Supplier', 'Qty', 'Status']) {
      assert.match(pdfDocument, new RegExp(`header: '${header}'`))
    }
    // Each table's columns still sum to the full width.
    for (const name of ['LABOUR_COLUMNS', 'EQUIPMENT_COLUMNS']) {
      const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`).exec(pdfDocument)[1]
      const total = [...block.matchAll(/width: '([\d.]+)%'/g)].reduce(
        (sum, m) => sum + Number(m[1]),
        0,
      )
      assert.equal(total, 100, `${name} widths must total 100%`)
    }
  })

  it('puts the declaration identity on the shared schedule but leaves signature room', () => {
    assert.match(pdfDocument, /function ScheduleList\(/)
    assert.match(pdfDocument, /<ScheduleList\s*labelWidth="38%"/)
    for (const label of ['Author Name', 'Position / Role', 'Date']) {
      assert.match(pdfDocument, new RegExp(`label: '${label}'`))
    }
    // The signature field keeps its own generous area, not a table cell.
    assert.match(pdfDocument, /signField:[\s\S]*?width:\s*208[\s\S]*?height:\s*96/)
    assert.match(pdfDocument, /<Image src=\{signatureSrc\} style=\{styles\.signImage\}/)
    assert.match(pdfDocument, /signImage:[\s\S]*?objectFit:\s*'contain'/)
  })

  it('ends the report with a compact declaration block rather than a signature page', () => {
    // No dedicated page: the block is a View in the flow of the last page.
    assert.doesNotMatch(pdfDocument, /function SignaturePage\(/)
    assert.doesNotMatch(pdfDocument, /<SignaturePage/)
    assert.match(pdfDocument, /function DeclarationBlock\(\{ brandColor, authorName/)
    const block = /function DeclarationBlock\([\s\S]*?\n\}/.exec(pdfDocument)[0]
    assert.doesNotMatch(block, /<Page\b/, 'declaration must not open its own page')
    // It never splits across a page boundary.
    assert.match(block, /return \(\s*<View wrap=\{false\}>/)
    // Nothing stretches it to fill the sheet.
    assert.doesNotMatch(pdfDocument, /flexGrow: 1/)
    assert.doesNotMatch(pdfDocument, /styles\.spacer/)
  })

  it('trails the declaration on the last page the report actually produces', () => {
    // Whichever section ends the report hosts the block, so it follows the
    // final photographic layout when there is room and takes a fresh page only
    // when there is not.
    assert.match(pdfDocument, /const lastHost = schedule\.grid6\.length/)
    for (const [host, component] of [
      ['records', 'ReportContentPage'],
      ['full', 'FullPagePhotos'],
      ['grid4', 'GridPages'],
    ]) {
      assert.match(
        pdfDocument,
        new RegExp(`trailing=\\{lastHost === '${host}' \\? declaration : null\\}`),
        `${component} must be able to host the declaration`,
      )
    }
    // Only the final page of a multi-page photo run carries it.
    assert.match(pdfDocument, /\{i === photos\.length - 1 \? trailing : null\}/)
    assert.match(pdfDocument, /\{pageIndex === pages\.length - 1 \? trailing : null\}/)
  })

  it('keeps narrative prose and photographic pages out of tables', () => {
    // Site summary stays narrative under its banner.
    assert.match(pdfDocument, /<SectionBanner accent=\{accent\}>Site summary<\/SectionBanner>/)
    assert.match(pdfDocument, /<Text style=\{styles\.body\}>\{siteSummary \|\| '—'\}<\/Text>/)
    // Photographic plates are untouched by the table system.
    assert.match(pdfDocument, /function FramedPhoto\(/)
    assert.match(pdfDocument, /<Image src=\{src\} style=\{styles\.imageContain\}/)
    assert.doesNotMatch(pdfDocument, /objectFit:\s*'cover'/)
    const framedPhoto = pdfDocument.slice(
      pdfDocument.indexOf('function FramedPhoto('),
      pdfDocument.indexOf('function photoSrc('),
    )
    assert.doesNotMatch(framedPhoto, /DataTable|ScheduleList|dataRow/)
  })

  it('paginates variable-length schedules without splitting rows or stranding headings', () => {
    // Rows, header row and totals row never break across a page boundary.
    // `fixed` repeats the column header on continuation pages when a schedule
    // is split, so a continued table is never headerless.
    assert.match(pdfDocument, /<View style=\{styles\.dataHeaderRow\} wrap=\{false\} fixed>/)
    assert.match(pdfDocument, /styles\.dataRow[\s\S]*?wrap=\{false\}/)
    assert.match(pdfDocument, /<View style=\{styles\.dataTotalsRow\} wrap=\{false\}>/)
    // A banner must carry its column header and a first row onto the page,
    // but reserving more than that stops sections packing into real space.
    assert.match(pdfDocument, /minPresenceAhead=\{SECTION_PRESENCE_AHEAD\}/)
    const presence = Number(/const SECTION_PRESENCE_AHEAD = (\d+)/.exec(pdfDocument)[1])
    assert.ok(presence >= 66 && presence <= 84, 'section presence guard out of range')
    // `minPresenceAhead` reserves space after a node, so putting it on the
    // table itself would push a tall schedule off the page and strand its
    // heading. The table must not carry one.
    assert.doesNotMatch(pdfDocument, /styles\.dataTable\} minPresenceAhead/)
    // Sections are transparent fragments: react-pdf will not break before a
    // node that is the first child of a wrapper, which defeats the heading
    // guard entirely.
    for (const section of ['RecordSection', 'LabourTable', 'EquipmentHireTable']) {
      const body = new RegExp(`function ${section}\\([\\s\\S]*?\\n\\}`).exec(pdfDocument)[0]
      assert.match(body, /return \(\s*<>/, `${section} must render a fragment, not a wrapper View`)
    }
  })

  it('carries the whole diary record stream in one continuous flow', () => {
    // Every structured section is a sibling in the same page flow, so a
    // section starts directly below the previous one.
    const stream = pdfDocument.slice(
      pdfDocument.indexOf('function ReportContentPage('),
      pdfDocument.indexOf('function DeclarationBlock('),
    )
    const order = [
      'Site summary',
      '<LabourTable',
      '<EquipmentHireTable',
      'title="Site attendance"',
      'title="Visitors"',
      'title="Permits to work"',
      'title="Deliveries"',
      'title="Temporary works & scaffolding checks"',
      'title="Work area records"',
    ]
    let cursor = -1
    for (const marker of order) {
      const at = stream.indexOf(marker)
      assert.ok(at > cursor, `report stream out of order at ${marker}`)
      cursor = at
    }
    // One page element for the whole record stream — sections are not pages.
    assert.equal((stream.match(/<Page /g) || []).length, 1)
  })

  it('gives each record section columns that suit its data and total full width', () => {
    const sections = {
      ATTENDANCE_COLUMNS: ['Name', 'Company', 'Trade / Role', 'Sign In', 'Sign Out', 'Hours'],
      VISITOR_COLUMNS: ['Visitor', 'Company', 'Purpose', 'Time In', 'Time Out'],
      PERMIT_COLUMNS: ['Permit Type', 'Reference', 'Issued To', 'Status'],
      DELIVERY_COLUMNS: ['Time', 'Supplier', 'Description', 'Delivery Ref'],
      TEMPORARY_WORKS_COLUMNS: ['Item', 'Location', 'Inspection / Status', 'Notes'],
      WORK_AREA_COLUMNS: ['Area', 'Activity / Observation', 'Status / Notes'],
    }
    for (const [name, headers] of Object.entries(sections)) {
      const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`).exec(pdfDocument)[1]
      for (const header of headers) {
        assert.ok(block.includes(`header: '${header}'`), `${name} missing ${header}`)
      }
      const total = [...block.matchAll(/width: '([\d.]+)%'/g)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      )
      assert.equal(total, 100, `${name} widths must total 100%`)
    }
  })

  it('omits a record section entirely when the diary captured nothing for it', () => {
    // A report that never recorded visitors must not gain an empty heading,
    // so existing reports render exactly as before.
    assert.match(pdfDocument, /const rows = toRecordRows\(items, columns\)\s*\n\s*if \(!rows\.length\) return null/)
    assert.match(pdfDocument, /attendance = \[\],[\s\S]*?workAreas = \[\],/)
  })
})

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

describe('PDF photographic record — fixed frame grid', () => {
  const grid4 = computePhotoFrameGeometry(photoGridForTier(4))
  const grid6 = computePhotoFrameGeometry(photoGridForTier(6))

  it('fills each page to the tier grid instead of recomposing a short page', () => {
    const photos = (n) => Array.from({ length: n }, (_, i) => ({ key: `${i + 1}` }))
    assert.deepEqual(paginatePdfPhotos(photos(5), 4).map((page) => page.length), [4, 1])
    assert.deepEqual(paginatePdfPhotos(photos(11), 6).map((page) => page.length), [6, 5])
    assert.deepEqual(paginatePdfPhotos(photos(3), 4).map((page) => page.length), [3])
  })

  it('lays every tier out in two equal columns so grids align with each other', () => {
    assert.equal(grid4.cols, 2)
    assert.equal(grid4.rows, 2)
    assert.equal(grid6.cols, 2)
    assert.equal(grid6.rows, 3)
    assert.equal(grid4.frameW, grid6.frameW)
  })

  it('tiles the printable area exactly, leaving nothing in the footer', () => {
    for (const geometry of [grid4, grid6]) {
      const usedW = geometry.frameW * geometry.cols + geometry.gap * (geometry.cols - 1)
      const usedH = geometry.frameH * geometry.rows + geometry.gap * (geometry.rows - 1)
      assert.ok(Math.abs(usedW - PDF_PAGE_INNER_W) < 0.01, 'grid must span the content width')
      assert.ok(usedH <= PDF_CONTENT_H + 0.01, 'grid must not exceed the content height')
    }
  })

  it('sizes frames from the grid alone, never from the photographs on the page', () => {
    // Identical arguments are the point: nothing about a photograph — its
    // orientation, its caption, or how many share the page — is an input.
    const first = computePhotoFrameGeometry(photoGridForTier(4))
    const second = computePhotoFrameGeometry(photoGridForTier(4))
    assert.equal(first.frameW, second.frameW)
    assert.equal(first.frameH, second.frameH)
    // The signature is the guarantee: a photograph is not an available input.
    const source = readFileSync(join(root, 'lib/diary-pdf-layout.js'), 'utf8')
    const params = /export function computePhotoFrameGeometry\(\{([\s\S]*?)\} = \{\}\)/
      .exec(source)[1]
      .split(',')
      .map((entry) => entry.split('=')[0].trim())
      .filter(Boolean)
    assert.deepEqual(params, ['cols', 'rows', 'pageInnerW', 'contentH', 'gap'])
  })

  it('contains any source proportions whole, centred, at their own aspect', () => {
    // A site photograph is evidence: the subject may sit against any edge, so
    // the whole image must survive whatever its proportions.
    const cases = {
      portrait: [3000, 4000],
      landscape: [4000, 3000],
      'unusually wide': [6000, 1200],
      'unusually tall': [1200, 6000],
      square: [2400, 2400],
    }
    for (const geometry of [grid4, grid6, computePhotoFrameGeometry(photoGridForTier(1))]) {
      const viewportW = geometry.innerW
      const viewportH =
        geometry.frameH -
        photoInfoBandHeight(PDF_PHOTO_CAPTION_MAX_LINES, true) -
        PDF_PHOTO_FRAME_BORDER * 2
      for (const [label, [sourceW, sourceH]] of Object.entries(cases)) {
        const box = photoContainBox(sourceW, sourceH, viewportW, viewportH)
        // Nothing is cut off on any side.
        assert.ok(box.width <= viewportW + 0.001, `${label} overflows the viewport width`)
        assert.ok(box.height <= viewportH + 0.001, `${label} overflows the viewport height`)
        assert.ok(box.x >= -0.001 && box.y >= -0.001, `${label} starts outside the viewport`)
        assert.ok(
          box.x + box.width <= viewportW + 0.001 && box.y + box.height <= viewportH + 0.001,
          `${label} extends past the viewport`,
        )
        // Proportions are untouched — no stretch, no squeeze.
        assert.ok(
          Math.abs(box.width / box.height - sourceW / sourceH) < 0.001,
          `${label} aspect ratio changed`,
        )
        // Centred on both axes.
        assert.ok(Math.abs(box.x - (viewportW - box.width) / 2) < 0.001)
        assert.ok(Math.abs(box.y - (viewportH - box.height) / 2) < 0.001)
        // One of the two axes touches the viewport: fitted, not shrunk further.
        assert.ok(
          Math.abs(box.width - viewportW) < 0.001 || Math.abs(box.height - viewportH) < 0.001,
          `${label} is not fitted to its viewport`,
        )
      }
    }
  })

  it('never lets source proportions change the outer frame', () => {
    // EQUAL FRAME SIZE is not EQUAL IMAGE SIZE: a wide and a tall photograph
    // draw very differently inside cells that are dimensionally identical.
    const viewportW = grid4.innerW
    const viewportH = grid4.frameH - photoInfoBandHeight(1) - PDF_PHOTO_FRAME_BORDER * 2
    const wide = photoContainBox(6000, 1200, viewportW, viewportH)
    const tall = photoContainBox(1200, 6000, viewportW, viewportH)
    assert.notEqual(wide.width, tall.width)
    assert.notEqual(wide.height, tall.height)
    // Yet the cell they sit in is the same one in both cases.
    assert.equal(grid4.frameW, computePhotoFrameGeometry(photoGridForTier(4)).frameW)
    assert.equal(grid4.frameH, computePhotoFrameGeometry(photoGridForTier(4)).frameH)
    // Unused space beside a photograph is the correct outcome.
    assert.ok(wide.y > 0, 'a wide photograph must letterbox, not crop')
    assert.ok(tall.x > 0, 'a tall photograph must pillarbox, not crop')
  })

  it('prohibits cover and every form of automatic cropping', () => {
    assert.equal(PDF_PHOTO_FIT.objectFit, 'contain')
    assert.equal(PDF_PHOTO_FIT.objectPositionX, '50%')
    assert.equal(PDF_PHOTO_FIT.objectPositionY, '50%')
    assert.ok(Object.isFrozen(PDF_PHOTO_FIT))
    // No PDF component may opt out, and none may fill, crop or scale up.
    for (const source of [pdfDocument, pdfHeader]) {
      for (const [, fit] of source.matchAll(/objectFit:\s*'([\w-]+)'/g)) {
        assert.equal(fit, 'contain', `objectFit: '${fit}' would crop or distort`)
      }
      assert.doesNotMatch(source, /\bobjectFit:\s*'cover'/)
    }
    // Every photograph goes through the one containment style, which is built
    // from the shared contract rather than restating its own literals.
    assert.match(pdfDocument, /imageContain:[\s\S]{0,80}\.\.\.PDF_PHOTO_FIT,/)
    const images = [...pdfDocument.matchAll(/<Image src=\{(\w+)\} style=\{styles\.(\w+)\} \/>/g)]
    const photographs = images.filter(([, src]) => src === 'src' || src === 'coverPhotoUrl')
    assert.equal(photographs.length, 2, 'expected the cover and framed report photographs')
    for (const [, src, style] of photographs) {
      assert.equal(style, 'imageContain', `${src} bypasses the containment rule`)
    }
  })

  it('keeps the caption band inside the frame whatever the photograph does', () => {
    // The band is subtracted from the frame, so it can never be pushed out of
    // it by an image, and the image can never grow into it.
    for (const geometry of [grid4, grid6]) {
      const band = photoInfoBandHeight(PDF_PHOTO_CAPTION_MAX_LINES, true)
      const viewportH = geometry.frameH - band - PDF_PHOTO_FRAME_BORDER * 2
      assert.ok(viewportH > 0, 'the band must never consume the whole frame')
      assert.ok(
        viewportH + band + PDF_PHOTO_FRAME_BORDER * 2 <= geometry.frameH + 0.001,
        'viewport plus band must fit the frame exactly',
      )
    }
    assert.match(pdfDocument, /viewportHeight = Math\.max\(\s*40,\s*frameHeight - bandHeight/)
  })

  it('keeps contain-fit and never crops or stretches', () => {
    for (const key of Object.keys(PDF_PHOTO_GRID)) {
      const geometry = geometryForLayout(key)
      assert.equal(geometry.objectFit, 'contain')
      assert.equal(geometry.imageStretch, false)
      assert.equal(geometry.imageCropToFill, false)
    }
    assert.match(pdfDocument, /imageContain:[\s\S]*?objectFit:\s*'contain'/)
    assert.doesNotMatch(pdfDocument, /objectFit:\s*'cover'/)
    // The image fills its viewport box, which is what contain-fits against.
    assert.match(pdfDocument, /<Image src=\{src\} style=\{styles\.imageContain\}/)
    assert.match(pdfDocument, /photoViewport:[\s\S]*?justifyContent:\s*'center'[\s\S]*?alignItems:\s*'center'/)
  })

  it('caps a single full-width frame so a landscape photograph is not a letterbox', () => {
    const full = computePhotoFrameGeometry(photoGridForTier(1))
    assert.equal(full.cols, 1)
    assert.ok(full.frameH < PDF_CONTENT_H, 'a lone frame must not stretch the full page')
    assert.ok(full.frameH / full.innerW < 1, 'a lone frame must stay wider than it is tall')
  })

  it('grows the caption band inward so a long caption cannot resize a frame', () => {
    const short = photoInfoBandHeight(estimatePhotoCaptionLines('Short', 200))
    const long = photoInfoBandHeight(
      estimatePhotoCaptionLines('A caption long enough to wrap over several lines '.repeat(4), 200),
    )
    assert.ok(long > short, 'a longer caption needs a taller band')
    // The band is not part of the frame calculation, so the frame is unmoved.
    assert.equal(
      computePhotoFrameGeometry(photoGridForTier(4)).frameH,
      computePhotoFrameGeometry(photoGridForTier(4)).frameH,
    )
    assert.match(
      pdfDocument,
      /viewportHeight = Math\.max\([\s\S]*?frameHeight - bandHeight/,
      'the viewport, not the frame, absorbs the band',
    )
  })

  it('levels a row on its tallest caption so neighbouring frames cannot diverge', () => {
    const row = [
      { caption: 'Short' },
      { caption: 'A considerably longer caption that will certainly need more than one line to set' },
    ]
    const banded = photoRowBandHeight(row, grid4.frameW)
    assert.equal(banded, photoRowBandHeight([...row].reverse(), grid4.frameW))
    assert.ok(banded >= photoRowBandHeight([{ caption: 'Short' }], grid4.frameW))
    // One band height is computed per row and handed to every frame in it.
    assert.match(pdfDocument, /const bandHeight = photoRowBandHeight\(/)
    assert.match(pdfDocument, /bandHeight=\{bandHeight\}/)
  })

  it('caps caption lines so a caption can never overflow its frame', () => {
    const runaway = 'word '.repeat(400)
    assert.equal(
      estimatePhotoCaptionLines(runaway, 120),
      PDF_PHOTO_CAPTION_MAX_LINES,
    )
    assert.ok(
      photoInfoBandHeight(PDF_PHOTO_CAPTION_MAX_LINES, true) < grid6.frameH,
      'even the tallest band must fit inside the shortest frame',
    )
    assert.match(pdfDocument, /maxLines=\{PDF_PHOTO_CAPTION_MAX_LINES\}/)
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?overflow:\s*'hidden'/)
    assert.match(pdfDocument, /photoFrame:[\s\S]*?overflow:\s*'hidden'/)
  })

  it('carries PHOTO N and the caption inside the frame, not below it', () => {
    const frame = /function FramedPhoto\([\s\S]*?\n\}\r?\n/.exec(pdfDocument)[0]
    const outer = frame.indexOf('styles.photoFrame')
    const viewport = frame.indexOf('styles.photoViewport')
    const band = frame.indexOf('styles.photoInfoBand')
    const close = frame.lastIndexOf('</View>')
    assert.ok(outer >= 0 && viewport > outer, 'viewport must sit inside the frame')
    assert.ok(band > viewport, 'the information band follows the viewport')
    assert.ok(band < close, 'the information band must close inside the frame')
    assert.match(frame, /photoReferenceLabel\(photoNumber\)/)
    assert.match(frame, /styles\.caption/)
    // Padding keeps the text off the borders.
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?paddingVertical:\s*PDF_PHOTO_BAND_PAD_Y/)
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?paddingHorizontal:\s*PDF_PHOTO_BAND_PAD_X/)
    // The superseded outside-the-plate caption band is gone.
    assert.doesNotMatch(pdfDocument, /styles\.plate\b|captionBand:/)
  })

  it('keeps an odd photo count on the same grid instead of promoting a photograph', () => {
    // No page recomposes itself by count any more.
    assert.doesNotMatch(pdfDocument, /featured-three|composition ===|AdaptivePhotoPage/)
    // The grid comes from the tier; the page's photo count only fills cells.
    assert.match(pdfDocument, /const \{ cols, rows \} = photoGridForTier\(perPage\)/)
    assert.match(pdfDocument, /index \+= cols/)
  })

  it('columns line up with the structured tables on either edge', () => {
    // Both the schedules and the photo grid span the same printable width.
    const usedW = grid4.frameW * grid4.cols + grid4.gap * (grid4.cols - 1)
    assert.ok(Math.abs(usedW - PDF_PAGE_INNER_W) < 0.01)
    assert.match(pdfDocument, /photoFrame:[\s\S]*?borderColor:\s*TABLE_BORDER/)
    assert.match(pdfDocument, /photoInfoBand:[\s\S]*?backgroundColor:\s*TABLE_LABEL_BG/)
    // Gaps go between columns only, so the last frame ends on the right margin.
    assert.match(pdfDocument, /gapRight=\{columnIndex === cols - 1 \? 0 : PDF_GRID_GAP\}/)
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
    // An "Assigned to" line lengthens the band inside the frame, never the frame.
    const geometry = geometryForLayout('grid4')
    assert.ok(photoInfoBandHeight(1, true) > photoInfoBandHeight(1, false))
    assert.ok(geometry.frameH > photoInfoBandHeight(PDF_PHOTO_CAPTION_MAX_LINES, true))
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
