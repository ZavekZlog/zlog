import {
  filterSignInsByReportDate,
  labourRowsFromRegister,
  aggregateLabourFromSignIns,
  toDateKey,
} from '@/lib/labour-from-register'

/**
 * Normalize OCR / vision model output into sign-in style records.
 * Accepts loose shapes from the model.
 */
export function normalizeOcrSignInRows(rawRows = []) {
  const list = Array.isArray(rawRows) ? rawRows : []
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const hoursRaw = row.hours ?? row.total_hours ?? row.hrs
      const hours = hoursRaw != null && hoursRaw !== '' ? Number(hoursRaw) : null
      return {
        work_date: toDateKey(row.work_date ?? row.date ?? row.day ?? row.signed_in_at) || null,
        person_name: String(row.person_name ?? row.name ?? row.operative ?? '').trim() || null,
        trade: String(row.trade ?? row.role ?? row.discipline ?? '').trim() || null,
        company: String(row.company ?? row.subcontractor ?? row.employer ?? '').trim() || null,
        hours: Number.isFinite(hours) ? hours : null,
        signed_in_at: row.signed_in_at || row.time_in || null,
        signed_out_at: row.signed_out_at || row.time_out || null,
      }
    })
    .filter(Boolean)
}

/**
 * Strict date filter + aggregation for OCR rows against reportDate.
 */
export function labourFromOcrSheet(rawRows, reportDate, { groupBy = 'trade_company', makeKey } = {}) {
  const normalized = normalizeOcrSignInRows(rawRows)
  const matched = filterSignInsByReportDate(normalized, reportDate)
  const aggregated = aggregateLabourFromSignIns(matched, { groupBy })
  const rows = labourRowsFromRegister(matched, reportDate, { groupBy, makeKey })
  return {
    matchedCount: matched.length,
    ignoredCount: Math.max(0, normalized.length - matched.length),
    aggregated,
    rows: rows.length > 0 ? rows : [],
  }
}

/** Resize + JPEG-compress an image File for vision upload (max edge 1600px). */
export async function fileToVisionDataUrl(file, maxEdge = 1600, quality = 0.82) {
  if (!file) throw new Error('No image provided')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return dataUrl
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
