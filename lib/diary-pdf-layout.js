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

/** Height of the masthead block measured from the top print margin. */
export const PDF_HEADER_BLOCK_H = 54
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

/** Neutral fallback for unbranded, monochrome, invalid, or unreadable company colours. */
export const PDF_ACCENT_FALLBACK = '#4B5563'

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
  const capacity = nominalPerPage === 6 ? 6 : nominalPerPage === 1 ? 1 : 4
  const pages = []

  for (let cursor = 0; cursor < list.length; cursor += capacity) {
    pages.push(list.slice(cursor, cursor + capacity))
  }

  return pages
}

/** Column/row spec a layout tier always uses, whatever a page actually holds. */
export function photoGridForTier(perPage) {
  const n = Math.trunc(Number(perPage) || 0)
  if (n === 1) return { ...PDF_PHOTO_GRID.full }
  if (n === 6) return { ...PDF_PHOTO_GRID.grid6 }
  return { ...PDF_PHOTO_GRID.grid4 }
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

/**
 * Outer frame geometry for a photographic page. These dimensions come from the
 * grid alone: the photographs a page happens to hold, and their orientation,
 * must never change them.
 */
export function computePhotoFrameGeometry({
  cols,
  rows,
  pageInnerW = PDF_PAGE_INNER_W,
  contentH = PDF_CONTENT_H,
  gap = PDF_GRID_GAP,
} = {}) {
  const c = Math.max(1, Number(cols) || 1)
  const r = Math.max(1, Number(rows) || 1)
  const frameW = (pageInnerW - gap * (c - 1)) / c
  const gridFrameH = (contentH - gap * (r - 1)) / r
  const innerW = frameW - PDF_PHOTO_FRAME_BORDER * 2
  const cappedFrameH =
    innerW * PDF_PHOTO_FULL_ASPECT +
    photoInfoBandHeight(PDF_PHOTO_CAPTION_MAX_LINES, true) +
    PDF_PHOTO_FRAME_BORDER * 2
  const frameH = c === 1 && r === 1 ? Math.min(gridFrameH, cappedFrameH) : gridFrameH

  return {
    cols: c,
    rows: r,
    frameW,
    frameH,
    innerW,
    gap,
    objectFit: 'contain',
    imageStretch: false,
    imageCropToFill: false,
  }
}

export function geometryForLayout(layoutKey) {
  const key = layoutKey === 'full' || layoutKey === 'grid6' ? layoutKey : 'grid4'
  const spec = PDF_PHOTO_GRID[key]
  const perPage = key === 'full' ? 1 : key === 'grid6' ? 6 : 4
  return {
    layout: key,
    perPage,
    ...spec,
    ...computePhotoFrameGeometry({ cols: spec.cols, rows: spec.rows }),
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
