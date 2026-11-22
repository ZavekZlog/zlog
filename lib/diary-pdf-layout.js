/**
 * Locked Site Diary PDF photo-tile geometry.
 * Used by DiaryPdfDocument and regression tests — keep in sync.
 */

export const PDF_PAGE_W = 595.28
export const PDF_PAGE_H = 841.89

/**
 * Print-safe A4 frame. Every painted element — chrome included — stays inside
 * this margin, so no colour can ever reach a physical page edge.
 */
export const PDF_PAGE_PAD_X = 42
export const PDF_PAGE_MARGIN_TOP = 32
export const PDF_PAGE_MARGIN_BOTTOM = 30
export const PDF_PAGE_INNER_W = PDF_PAGE_W - PDF_PAGE_PAD_X * 2

/** Height of the coloured accent banner measured from the top print margin. */
export const PDF_HEADER_BLOCK_H = 48
/** Height of the footer block measured up from the bottom print margin. */
export const PDF_FOOTER_BLOCK_H = 22

export const PDF_HEADER_OFFSET = PDF_PAGE_MARGIN_TOP + PDF_HEADER_BLOCK_H
export const PDF_FOOTER_OFFSET = PDF_PAGE_MARGIN_BOTTOM + PDF_FOOTER_BLOCK_H

/**
 * Footer origin measured from the top of the page. Page chrome must be
 * anchored by `top`: react-pdf resolves a `bottom`-anchored fixed box against
 * an unmeasured page and emits it at an arbitrary offset.
 */
export const PDF_FOOTER_TOP = PDF_PAGE_H - PDF_FOOTER_OFFSET

export const PDF_CONTENT_TOP = PDF_HEADER_OFFSET + 18
export const PDF_CONTENT_BOTTOM = PDF_FOOTER_OFFSET + 14
export const PDF_CONTENT_H = PDF_PAGE_H - PDF_CONTENT_TOP - PDF_CONTENT_BOTTOM

/**
 * Vertical budget for the in-page area name banner on the first page of an area.
 * Must match AreaPhotoSectionBanner (no top margin).
 */
export const PDF_AREA_HEADING_RESERVE = 32

/**
 * Work Photographs uses the same section bar as every other section.
 * 14pt lead + 0.75pt rule + 10pt padding + 8.5pt type at 1.4 line height.
 */
export const PDF_WORK_PHOTO_HEADING_H = 14 + 0.75 + 10 + 8.5 * 1.4

/**
 * One slim area sub-heading, used wherever an area starts.
 * 0.75pt rule + 8pt padding + 8pt type at 1.2 line height + 1.65pt below.
 */
export const PDF_AREA_SUBHEADING_RULE = 0.75
export const PDF_AREA_SUBHEADING_PAD_Y = 4
export const PDF_AREA_SUBHEADING_FONT = 8
export const PDF_AREA_SUBHEADING_LINE = 1.2
export const PDF_AREA_SUBHEADING_GAP = 1.65
export const PDF_AREA_SUBHEADING_H =
  PDF_AREA_SUBHEADING_RULE +
  PDF_AREA_SUBHEADING_PAD_Y * 2 +
  PDF_AREA_SUBHEADING_FONT * PDF_AREA_SUBHEADING_LINE +
  PDF_AREA_SUBHEADING_GAP

/**
 * Clearance under the section bar, one area sub-heading, and two photo rows.
 * A 2pt remainder drops the second row; this is the same slack photo pages
 * already keep so an exact fit does not overflow.
 */
export const PDF_PHOTO_FLOW_SAFETY = 14

/**
 * Always leave slack below Header (+ optional area banner) + PhotoGrid.
 * Exact-fit grids overflow by a few points under real Images/chrome and
 * React-PDF emits a blank auto-continuation after the explicit <Page>.
 */
export const PDF_PHOTO_PAGE_SLACK = 14

/**
 * Content height passed to PhotoGrid on one explicit photo page.
 * @param {{ isAreaStart?: boolean }} [opts]
 */
export function photoPageGridContentHeight({ isAreaStart = false } = {}) {
  let height = PDF_CONTENT_H - PDF_PHOTO_PAGE_SLACK
  if (isAreaStart) height -= PDF_AREA_HEADING_RESERVE
  return Math.max(120, height)
}

/** Neutral fallback for unbranded, monochrome, invalid, or unreadable company colours. */
export const PDF_ACCENT_FALLBACK = '#4B5563'

/**
 * On site, red means hazard below the banner. The banner itself keeps the
 * sampled brand colour, including red. Table top rules use dove grey.
 */
export const PDF_DOVE_GREY = '#E4E2DE'

/**
 * Convert a stored company colour into a restrained, print-safe PDF accent.
 * Hue remains company-owned; saturation/lightness are bounded for legibility.
 * Near-monochrome colours deliberately use the neutral fallback.
 */
export function resolvePdfAccent(value, fallback = PDF_ACCENT_FALLBACK) {
  const rgb = parseHexColor(value)
  if (!rgb) return fallback

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  if (hsl.s < 0.16) return fallback

  return hslToHex({
    h: hsl.h,
    s: Math.min(0.72, Math.max(0.25, hsl.s)),
    l: Math.min(0.52, Math.max(0.28, hsl.l)),
  })
}

/**
 * A stored brand colour is red when its hue sits in the red band and it is
 * saturated enough to read as red rather than brown, pink, or grey.
 * Orange is outside this band.
 */
export function isPdfBrandRed(value) {
  const rgb = parseHexColor(value)
  if (!rgb) return false
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  if (hsl.s < 0.28 || hsl.l < 0.12 || hsl.l > 0.72) return false
  const degrees = hsl.h * 360
  return degrees <= 15 || degrees >= 345
}

/** Header banner. The reporting company's colour, exactly as sampled, including red. */
export function resolvePdfBannerColor(value) {
  if (isPdfBrandRed(value)) {
    const rgb = parseHexColor(value)
    return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : PDF_ACCENT_FALLBACK
  }
  return resolvePdfAccent(value)
}

/**
 * Top rule of a section table. Reporting-company colour, or the existing dove
 * grey when that colour is red-dominant. Never charcoal, and never red.
 */
export function resolvePdfTableRuleColor(value) {
  if (isPdfBrandRed(value)) return PDF_DOVE_GREY
  return resolvePdfAccent(value)
}

/** Very light accent tint for document bands and table headers. */
export function pdfAccentTint(accent, amount = 0.9) {
  const rgb = parseHexColor(resolvePdfAccent(accent)) || parseHexColor(PDF_ACCENT_FALLBACK)
  const mix = Math.min(0.96, Math.max(0.75, Number(amount) || 0.9))
  return rgbToHex(
    Math.round(rgb.r + (255 - rgb.r) * mix),
    Math.round(rgb.g + (255 - rgb.g) * mix),
    Math.round(rgb.b + (255 - rgb.b) * mix),
  )
}

export const PDF_GRID_GAP = 10

/** Gap between portrait photo frames. Narrow, so the grid fills the page. */
export const PDF_PHOTO_GUTTER = 4

/**
 * A photographic record is a fixed report cell, not an image that sizes itself.
 * Every tier lays out in two equal columns and differs only in row count, so
 * frames align with each other and with the structured tables. A page holding
 * fewer photographs than its grid uses the same cells and leaves the remainder
 * empty — an odd count never promotes one photograph to a larger frame.
 */
export const PDF_PHOTO_GRID = {
  full: { cols: 1, rows: 1 },
  grid4: { cols: 2, rows: 2 },
  grid6: { cols: 2, rows: 3 },
}

/** Frame perimeter and internal rule, matched to the structured-table grid. */
export const PDF_PHOTO_FRAME_BORDER = 1.1
export const PDF_PHOTO_RULE_W = 0.9

/**
 * Photographic containment contract — evidential, not decorative.
 *
 * A site photograph records a condition, and the thing it was taken to record
 * may sit against any edge or corner of the original. Cropping to fill a cell
 * can therefore delete the evidence, so the whole image must always survive
 * into the report: scaled down to fit, centred, aspect ratio intact. Unused
 * space beside a photograph is the correct outcome, never a reason to crop.
 *
 * `cover` and any automatic, centre, focal-point or smart crop are prohibited
 * here. A deliberate crop is a user action for the photo editor, never a
 * decision taken while generating a PDF.
 */
export const PDF_PHOTO_FIT = Object.freeze({
  objectFit: 'contain',
  objectPositionX: '50%',
  objectPositionY: '50%',
})

/**
 * The box a photograph occupies once contained, for any source proportions.
 * Documents the geometry the renderer's contain-fit must produce: never wider
 * or taller than the viewport, aspect ratio unchanged, centred on both axes.
 */
export function photoContainBox(sourceW, sourceH, viewportW, viewportH) {
  const sw = Number(sourceW) || 0
  const sh = Number(sourceH) || 0
  if (sw <= 0 || sh <= 0) return { width: 0, height: 0, x: 0, y: 0, scale: 0 }
  const scale = Math.min(viewportW / sw, viewportH / sh)
  const width = sw * scale
  const height = sh * scale
  return {
    width,
    height,
    x: (viewportW - width) / 2,
    y: (viewportH - height) / 2,
    scale,
  }
}

/**
 * Outline size for one photograph. The box keeps the photograph's own
 * proportions, fits inside the grid cell, and has no leftover inside it.
 * A missing pixel size keeps the cell, so nothing is cropped by a guess.
 */
export function snugPhotoBox(sourceW, sourceH, maxW, maxH) {
  const mw = Number(maxW) || 0
  const mh = Number(maxH) || 0
  if (mw <= 0 || mh <= 0) return { width: 0, height: 0 }
  const fitted = photoContainBox(sourceW, sourceH, mw, mh)
  if (!(fitted.scale > 0)) return { width: mw, height: mh }
  return { width: fitted.width, height: fitted.height }
}

/** Information band carried inside every frame: PHOTO N above its caption. */
export const PDF_PHOTO_BAND_PAD_X = 6
export const PDF_PHOTO_BAND_PAD_Y = 4.5
export const PDF_PHOTO_REF_LINE_H = 9
export const PDF_PHOTO_CAPTION_SIZE = 8
export const PDF_PHOTO_CAPTION_LINE_H = 10
export const PDF_PHOTO_ASSIGNED_LINE_H = 9
export const PDF_PHOTO_CAPTION_MIN_LINES = 1
export const PDF_PHOTO_CAPTION_MAX_LINES = 3

/**
 * Caption slot beneath every photo frame at the reference image height.
 * A missing caption does not change the frame: the slot stays this tall,
 * scaled with the image.
 */
export const PDF_PHOTO_CAPTION_SLOT_H =
  PDF_PHOTO_BAND_PAD_Y * 2 +
  PDF_PHOTO_REF_LINE_H +
  PDF_PHOTO_CAPTION_LINE_H +
  PDF_PHOTO_ASSIGNED_LINE_H

/** Reference 3:4 image height the caption slot was proportioned against. */
export const PDF_PHOTO_REFERENCE_IMAGE_H = 294.8

/** Caption bar height divided by the 3:4 image height. It scales with the frame. */
export const PDF_PHOTO_CAPTION_RATIO = PDF_PHOTO_CAPTION_SLOT_H / PDF_PHOTO_REFERENCE_IMAGE_H

/** Issued image area is portrait 3:4. Width divided by height. */
export const PDF_PHOTO_IMAGE_RATIO = 3 / 4

/**
 * TODO: Jim will supply the landing page URL.
 * Do not replace this placeholder with a guessed address.
 */
export const ZLOG_LANDING_URL = 'TODO'

/** A real landing address, or null while the constant is still the placeholder. */
export function zlogFooterHref(url = ZLOG_LANDING_URL) {
  const value = String(url ?? '').trim()
  if (!value || value === 'TODO') return null
  return value
}

export function normalizePhotosPerPage(count) {
  const n = Math.trunc(Number(count))
  if (n === 1 || n === 2 || n === 4 || n === 6) return n
  return 4
}

export function photoGridArrangements(count) {
  const n = normalizePhotosPerPage(count)
  const arrangements = []
  for (let cols = 1; cols <= n; cols += 1) {
    if (n % cols === 0) arrangements.push({ cols, rows: n / cols })
  }
  return arrangements
}

/**
 * Caption type and padding at a frame's own caption height.
 * The reference slot is 37pt; a larger or smaller frame scales every part.
 */
export function scaledCaptionMetrics(captionH) {
  const height = Number(captionH) > 0 ? Number(captionH) : PDF_PHOTO_CAPTION_SLOT_H
  const s = height / PDF_PHOTO_CAPTION_SLOT_H
  return {
    height,
    padY: PDF_PHOTO_BAND_PAD_Y * s,
    padX: PDF_PHOTO_BAND_PAD_X * s,
    refSize: 7 * s,
    captionSize: PDF_PHOTO_CAPTION_SIZE * s,
    assignedSize: 7.5 * s,
    refLine: PDF_PHOTO_REF_LINE_H * s,
    captionLine: PDF_PHOTO_CAPTION_LINE_H * s,
    assignedLine: PDF_PHOTO_ASSIGNED_LINE_H * s,
  }
}

/**
 * One photograph fills the page width, so cap its height: an uncapped frame
 * turns a landscape photograph into a thin band inside a very tall viewport.
 */
export const PDF_PHOTO_FULL_ASPECT = 0.8

/**
 * Paginate a layout tier at its full grid capacity. A short final page keeps
 * the same cells rather than being recomposed, so frame geometry is identical
 * on every page of the report.
 */
export function paginatePdfPhotos(photos = [], nominalPerPage = 4) {
  const list = Array.isArray(photos) ? photos : []
  const capacity = normalizePhotosPerPage(nominalPerPage)
  const pages = []

  for (let cursor = 0; cursor < list.length; cursor += capacity) {
    pages.push(list.slice(cursor, cursor + capacity))
  }

  return pages
}

/** Column/row spec a layout tier always uses, whatever a page actually holds. */
export function photoGridForTier(perPage, contentH = PDF_CONTENT_H) {
  const geom = computePhotoFrameGeometry({
    count: normalizePhotosPerPage(perPage),
    contentH,
  })
  return { cols: geom.cols, rows: geom.rows }
}

/**
 * Height of the in-frame information band. Kept out of the outer frame's
 * dimensions: a taller caption eats into the image viewport instead of
 * growing the cell, so frames stay identical across the whole report.
 */
export function photoInfoBandHeight(captionLines = 1, hasAssigned = false) {
  const lines = Math.min(
    PDF_PHOTO_CAPTION_MAX_LINES,
    Math.max(PDF_PHOTO_CAPTION_MIN_LINES, Math.trunc(Number(captionLines) || 0)),
  )
  return (
    PDF_PHOTO_RULE_W +
    PDF_PHOTO_BAND_PAD_Y * 2 +
    PDF_PHOTO_REF_LINE_H +
    lines * PDF_PHOTO_CAPTION_LINE_H +
    (hasAssigned ? PDF_PHOTO_ASSIGNED_LINE_H : 0)
  )
}

/** Text width available to a caption inside a frame of the given outer width. */
export function photoCaptionUsableWidth(frameW) {
  return Math.max(
    24,
    Number(frameW || 0) - PDF_PHOTO_FRAME_BORDER * 2 - PDF_PHOTO_BAND_PAD_X * 2,
  )
}

export function estimatePhotoCaptionLines(
  text,
  usableWidth,
  fontSize = PDF_PHOTO_CAPTION_SIZE,
) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value) return PDF_PHOTO_CAPTION_MIN_LINES
  // Helvetica averages about half its point size per character in mixed case.
  const charsPerLine = Math.max(8, Math.floor(usableWidth / (fontSize * 0.5)))
  return Math.min(
    PDF_PHOTO_CAPTION_MAX_LINES,
    Math.max(PDF_PHOTO_CAPTION_MIN_LINES, Math.ceil(value.length / charsPerLine)),
  )
}

/**
 * Every frame in a row shares the tallest band its captions need, so the
 * images in that row stay level and no caption is clipped.
 */
export function photoRowBandHeight(rowPhotos = [], frameW = PDF_PAGE_INNER_W) {
  const usable = photoCaptionUsableWidth(frameW)
  const list = Array.isArray(rowPhotos) ? rowPhotos : []
  return list.reduce(
    (tallest, photo) =>
      Math.max(
        tallest,
        photoInfoBandHeight(
          estimatePhotoCaptionLines(photo?.caption, usable),
          Boolean(photo?.assignedToLine),
        ),
      ),
    photoInfoBandHeight(PDF_PHOTO_CAPTION_MIN_LINES, false),
  )
}

/**
 * Pixel size of a JPEG data URL, read from the SOF marker. Returns null when
 * the source is not a JPEG data URL. Used only to decide whether a photograph
 * is landscape before it is turned into its portrait frame.
 */
export function jpegPixelSize(dataUrl) {
  const raw = typeof dataUrl === 'string' ? dataUrl : ''
  if (!/^data:image\/jpe?g/i.test(raw)) return null
  const comma = raw.indexOf(',')
  if (comma < 0) return null
  let bytes
  try {
    const b64 = raw.slice(comma + 1)
    if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(b64, 'base64')
    } else {
      const bin = atob(b64)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    }
  } catch {
    return null
  }
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === 0xd8) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
    if (length < 2 || offset + 2 + length > bytes.length) return null
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb)
    if (isSof) {
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8]
      if (width > 0 && height > 0) return { width, height }
      return null
    }
    offset += 2 + length
  }
  return null
}

/**
 * Normalize manual rotation to 0 | 90 | 180 | 270.
 * @param {unknown} value
 * @returns {0|90|180|270}
 */
export function normalizeRotationDegrees(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const snapped = Math.round((((n % 360) + 360) % 360) / 90) * 90
  return /** @type {0|90|180|270} */ (snapped === 360 ? 0 : snapped)
}

function fitPhotoArrangement({
  cols,
  rows,
  pageInnerW,
  contentH,
  pageContentH,
  gap,
}) {
  const border = PDF_PHOTO_FRAME_BORDER
  const widthBudget = (pageInnerW - gap * (cols - 1)) / cols - border * 2
  const heightBudget = (contentH - gap * (rows - 1)) / rows - border * 2
  if (!(widthBudget > 0) || !(heightBudget > 0)) return null
  const imageH = Math.min(
    widthBudget / PDF_PHOTO_IMAGE_RATIO,
    heightBudget / (1 + PDF_PHOTO_CAPTION_RATIO),
  )
  const imageW = imageH * PDF_PHOTO_IMAGE_RATIO
  const captionH = imageH * PDF_PHOTO_CAPTION_RATIO
  const frameW = imageW + border * 2
  const frameH = imageH + captionH + border * 2
  const gridW = frameW * cols + gap * (cols - 1)
  const gridH = frameH * rows + gap * (rows - 1)
  void pageContentH
  return {
    count: cols * rows,
    cols,
    rows,
    imageW,
    imageH,
    captionH,
    frameW,
    frameH,
    innerW: imageW,
    gridW,
    gridH,
    offsetX: Math.max(0, (pageInnerW - gridW) / 2),
    offsetY: 0,
    gap,
    imageRatio: imageW / imageH,
    objectFit: 'contain',
    imageStretch: false,
    imageCropToFill: false,
  }
}

/**
 * Largest 3:4 image area that fits `count` photographs on the content area.
 * The arrangement is chosen for photo size. Leftover page space is returned
 * as even outer margins, not as space inside a frame.
 */
export function computePhotoFrameGeometry({
  count = 4,
  cols = null,
  rows = null,
  pageInnerW = PDF_PAGE_INNER_W,
  contentH = PDF_CONTENT_H,
  pageContentH = null,
  gap = PDF_PHOTO_GUTTER,
} = {}) {
  const fixed = cols != null && rows != null
  const arrangements = fixed
    ? [{ cols: Math.max(1, Math.trunc(Number(cols)) || 1), rows: Math.max(1, Math.trunc(Number(rows)) || 1) }]
    : photoGridArrangements(count)
  let best = null
  for (const arrangement of arrangements) {
    const fit = fitPhotoArrangement({
      ...arrangement,
      pageInnerW,
      contentH,
      pageContentH,
      gap,
    })
    if (!fit) continue
    if (!best || fit.imageW * fit.imageH > best.imageW * best.imageH) best = fit
  }
  return best
}

/** Grid height left once the opening photo page has paid for both headings. */
export function photoFlowGridBudget(contentH = PDF_CONTENT_H) {
  return (
    contentH -
    PDF_WORK_PHOTO_HEADING_H -
    PDF_AREA_SUBHEADING_H -
    PDF_PHOTO_FLOW_SAFETY
  )
}

/**
 * Uniform frame for a photos-per-page setting. The same geometry is used on
 * every page of that setting, including pages that do not repeat both headings.
 */
export function photoFlowFrameGeometry(count = 4) {
  return computePhotoFrameGeometry({
    count: normalizePhotosPerPage(count),
    contentH: photoFlowGridBudget(),
  })
}

export function supportingDocumentCaption(name) {
  const title = String(name || '').trim()
  const suffix = ': hard copy in site file'
  if (!title || title === suffix) return suffix
  if (title.endsWith(suffix)) return title
  return `${title}${suffix}`
}

export function geometryForLayout(layoutKey) {
  const key = layoutKey === 'full' || layoutKey === 'grid6' ? layoutKey : 'grid4'
  const perPage = key === 'full' ? 1 : key === 'grid6' ? 6 : 4
  return {
    layout: key,
    perPage,
    ...computePhotoFrameGeometry({ count: perPage }),
  }
}

function parseHexColor(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : match[1]
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHsl(r, g, b) {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const delta = max - min
  const l = (max + min) / 2
  if (!delta) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === rr) h = ((gg - bb) / delta) % 6
  else if (max === gg) h = (bb - rr) / delta + 2
  else h = (rr - gg) / delta + 4
  h = ((h * 60 + 360) % 360) / 360
  return { h, s, l }
}

function hslToHex({ h, s, l }) {
  const hue = ((h % 1) + 1) % 1
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const section = hue * 6
  const x = chroma * (1 - Math.abs((section % 2) - 1))
  let rr = 0
  let gg = 0
  let bb = 0
  if (section < 1) [rr, gg, bb] = [chroma, x, 0]
  else if (section < 2) [rr, gg, bb] = [x, chroma, 0]
  else if (section < 3) [rr, gg, bb] = [0, chroma, x]
  else if (section < 4) [rr, gg, bb] = [0, x, chroma]
  else if (section < 5) [rr, gg, bb] = [x, 0, chroma]
  else [rr, gg, bb] = [chroma, 0, x]
  const m = l - chroma / 2
  return rgbToHex(
    Math.round((rr + m) * 255),
    Math.round((gg + m) * 255),
    Math.round((bb + m) * 255),
  )
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}
