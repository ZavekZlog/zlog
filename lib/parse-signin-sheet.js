import {
  filterSignInsByReportDate,
  labourRowsFromRegister,
  aggregateLabourFromSignIns,
  toDateKey,
  hoursFromSignInOut,
  operativeReviewFromSignIns,
} from '@/lib/labour-from-register'

/**
 * Normalize OCR / vision model output into sign-in style records.
 * Hours are NEVER taken from the model — only calculated from time_in / time_out.
 */
export function normalizeOcrSignInRows(rawRows = []) {
  const list = Array.isArray(rawRows) ? rawRows : []
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const signed_in_at = row.signed_in_at || row.time_in || row.signin_at || null
      const signed_out_at = row.signed_out_at || row.time_out || row.signout_at || null
      const calculated = hoursFromSignInOut(signed_in_at, signed_out_at)
      // Keep sparse rows — missing fields must not drop the operative
      const hasAny =
        row.work_date != null ||
        row.date != null ||
        row.day != null ||
        row.person_name ||
        row.name ||
        row.operative ||
        row.trade ||
        row.role ||
        row.company ||
        row.subcontractor ||
        signed_in_at ||
        signed_out_at
      if (!hasAny) return null
      return {
        work_date: toDateKey(row.work_date ?? row.date ?? row.day) || null,
        person_name: String(row.person_name ?? row.name ?? row.operative ?? '').trim() || null,
        trade: String(row.trade ?? row.role ?? row.discipline ?? '').trim() || null,
        company: String(row.company ?? row.subcontractor ?? row.employer ?? '').trim() || null,
        // Ignore any AI hours field entirely
        hours: calculated,
        signed_in_at: signed_in_at ? String(signed_in_at).trim() : null,
        signed_out_at: signed_out_at ? String(signed_out_at).trim() : null,
      }
    })
    .filter(Boolean)
}

/**
 * Full OCR → review + aggregated labour.
 * Every visible operative is kept in `operatives` (no silent discard).
 * Date filter only affects default `included` + aggregated labour preview.
 */
export function labourFromOcrSheet(rawRows, reportDate, { groupBy = 'trade_company', makeKey, visibleAttendeeCount } = {}) {
  const normalized = normalizeOcrSignInRows(rawRows)
  const operatives = operativeReviewFromSignIns(normalized, reportDate)
  const matched = filterSignInsByReportDate(normalized, reportDate)
  const missingDate = operatives.filter((o) => o.dateStatus === 'missing')
  // Aggregation for convenience preview: matched date + missing-date (user can change in review)
  const forAggregate = normalized.filter((_, i) => {
    const status = operatives[i]?.dateStatus
    return status === 'match' || status === 'missing'
  })
  const aggregated = aggregateLabourFromSignIns(forAggregate, { groupBy })
  const rows = labourRowsFromRegister(forAggregate, null, { groupBy, makeKey })

  const warnings = []
  const ignoredCount = operatives.filter((o) => o.dateStatus === 'other').length
  if (ignoredCount > 0) {
    warnings.push(
      `${ignoredCount} row${ignoredCount === 1 ? '' : 's'} dated differently from ${toDateKey(reportDate) || 'report date'} — review before importing.`,
    )
  }
  if (missingDate.length > 0) {
    warnings.push(
      `${missingDate.length} row${missingDate.length === 1 ? '' : 's'} had no readable date — included for review against ${toDateKey(reportDate) || 'report date'}.`,
    )
  }
  const claimed =
    visibleAttendeeCount != null && Number.isFinite(Number(visibleAttendeeCount))
      ? Number(visibleAttendeeCount)
      : null
  if (claimed != null && claimed !== normalized.length) {
    warnings.push(
      `Sheet appears to show ${claimed} attendee${claimed === 1 ? '' : 's'} but OCR returned ${normalized.length}. Check for missing or duplicated rows.`,
    )
  }

  return {
    extractedCount: normalized.length,
    matchedCount: matched.length,
    ignoredCount,
    missingDateCount: missingDate.length,
    visibleAttendeeCount: claimed,
    rowCountMismatch: claimed != null && claimed !== normalized.length,
    warnings,
    operatives,
    aggregated,
    rows: rows.length > 0 ? rows : [],
  }
}

/** Resize + JPEG-compress an image File for vision upload (max edge 1600px), EXIF-upright. */
export async function fileToVisionDataUrl(file, maxEdge = 1600, quality = 0.82) {
  const { orientedImageToDataUrl } = await import('@/lib/image-orientation')
  const result = await orientedImageToDataUrl(file, maxEdge, quality)
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Dev-only orientation diagnostics — no image bytes / PII
    console.info('[sign-in OCR] image orientation', {
      orientation: result.orientation,
      usedBrowserOrientation: result.usedBrowserOrientation,
      width: result.width,
      height: result.height,
    })
  }
  return result.dataUrl
}

export async function parseSignInSheetImage({ dataUrl, reportDate, groupBy = 'trade_company' }) {
  const res = await fetch('/api/parse-signin-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, reportDate, groupBy }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || `Scan failed (${res.status})`)
  }
  return payload
}
