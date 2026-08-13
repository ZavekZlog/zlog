/**
 * Locked Site Diary PDF photo-tile geometry.
 * Used by DiaryPdfDocument and regression tests — keep in sync.
 */

export const PDF_PAGE_PAD_X = 28
export const PDF_PAGE_INNER_W = 595.28 - PDF_PAGE_PAD_X * 2
export const PDF_CONTENT_TOP = 72 + 12 // PDF_HEADER_OFFSET + 12
export const PDF_CONTENT_BOTTOM = 42 + 8 // PDF_FOOTER_OFFSET + 8
export const PDF_CONTENT_H = 841.89 - PDF_CONTENT_TOP - PDF_CONTENT_BOTTOM

/** Fixed meta band inside each tile (Photo N + caption + optional Assigned to). Never grows the outer tile. */
export const PDF_CAPTION_BAND_H = 54
export const PDF_FRAME_PAD = 12
export const PDF_GRID_GAP = 10

/** react-pdf Text clamp — display only; does not mutate stored captions. */
export const PDF_CAPTION_MAX_LINES = 2
export const PDF_ASSIGNED_MAX_LINES = 1

export const PDF_LAYOUTS = {
  full: { perPage: 1, cols: 1, rows: 1 },
  grid4: { perPage: 4, cols: 2, rows: 2 },
  grid6: { perPage: 6, cols: 3, rows: 2 },
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
 * Equal tile geometry for a layout page.
 * Portrait/landscape must not change these outer dimensions.
 */
export function computeGridTileGeometry({
  cols,
  rows,
  pageInnerW = PDF_PAGE_INNER_W,
  contentH = PDF_CONTENT_H,
  gap = PDF_GRID_GAP,
  captionBandH = PDF_CAPTION_BAND_H,
  framePad = PDF_FRAME_PAD,
} = {}) {
  const c = Math.max(1, Number(cols) || 1)
  const r = Math.max(1, Number(rows) || 1)
  const tileW = (pageInnerW - gap * (c - 1)) / c
  const availableH = contentH - gap * (r - 1)
  const tileH = availableH / r
  const imageH = Math.max(40, tileH - captionBandH - framePad)
  return {
    tileW,
    tileH,
    imageH,
    captionBandH,
    framePad,
    gap,
    objectFit: 'contain',
    imageStretch: false,
    imageCropToFill: false,
  }
}

export function geometryForLayout(layoutKey) {
  const key = layoutKey === 'full' || layoutKey === 'grid6' ? layoutKey : 'grid4'
  const spec = PDF_LAYOUTS[key]
  return {
    layout: key,
    ...spec,
    ...computeGridTileGeometry({ cols: spec.cols, rows: spec.rows }),
  }
}

/**
 * Caption band style contract for PDF tiles.
 * Centred; clamped visually; never expands the tile.
 */
export function pdfCaptionBandStyle() {
  return {
    height: PDF_CAPTION_BAND_H,
    overflow: 'hidden',
    textAlign: 'center',
    maxLines: PDF_CAPTION_MAX_LINES,
    assignedMaxLines: PDF_ASSIGNED_MAX_LINES,
  }
}
