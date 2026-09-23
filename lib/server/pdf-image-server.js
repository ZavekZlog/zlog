import 'server-only'
import { coverBlobToPdfDataUrl } from '@/lib/diary-cover-photo.js'
import { normalizeRotationDegrees } from '@/lib/diary-pdf-layout.js'

/** Default sharp JPEG quality for callers that do not pass an explicit embed quality. */
const DEFAULT_PDF_JPEG_QUALITY = 92

function normalizeJpegQuality(jpegQuality = DEFAULT_PDF_JPEG_QUALITY) {
  const n = Number(jpegQuality)
  if (!Number.isFinite(n)) return DEFAULT_PDF_JPEG_QUALITY
  if (n > 0 && n <= 1) return Math.round(n * 100)
  return Math.min(100, Math.max(1, Math.round(n)))
}

async function loadSharp() {
  try {
    const mod = await import('sharp')
    return mod.default || mod
  } catch {
    return null
  }
}

/**
 * Fetch storage object bytes via service role (post-authorization only).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} storagePath
 */
export async function downloadSitePhotoBlob(admin, storagePath) {
  const path = String(storagePath || '').trim()
  if (!path) return null
  const { data, error } = await admin.storage.from('site-photos').download(path)
  if (error || !data || data.size < 1) return null
  return data
}

export async function fetchHttpBlob(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  const res = await fetch(raw)
  if (!res.ok) {
    throw new Error(`Could not download image (HTTP ${res.status}).`)
  }
  const blob = await res.blob()
  if (!blob?.size) {
    throw new Error('Downloaded image was empty.')
  }
  return blob
}

/**
 * Legacy / non-prepared JPEG flatten for server PDF (EXIF upright + max edge).
 * Falls back to raw base64 embed when sharp is unavailable (dev-only proof).
 *
 * @param {Blob} blob
 * @param {number} [maxEdge]
 * @param {number} [jpegQuality] 1–100, or 0–1 fraction; default 92
 */
export async function uprightJpegBlobToPdfDataUrl(blob, maxEdge = 2400, jpegQuality = DEFAULT_PDF_JPEG_QUALITY) {
  if (!(blob instanceof Blob) || blob.size < 1) {
    throw new Error('Image for the PDF was empty.')
  }
  const sharp = await loadSharp()
  if (!sharp) {
    return coverBlobToPdfDataUrl(blob)
  }
  const quality = normalizeJpegQuality(jpegQuality)
  const buf = Buffer.from(await blob.arrayBuffer())
  let pipeline = sharp(buf).rotate()
  const meta = await pipeline.metadata()
  const w = Math.max(1, meta.width || 1)
  const h = Math.max(1, meta.height || 1)
  const longest = Math.max(w, h)
  if (longest > maxEdge) {
    pipeline = pipeline.resize({
      width: w >= h ? maxEdge : undefined,
      height: h > w ? maxEdge : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  const out = await pipeline.jpeg({ quality }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}

export async function uprightSignedUrlToPdfDataUrl(url, maxEdge = 2400, jpegQuality = DEFAULT_PDF_JPEG_QUALITY) {
  if (!url) return null
  const raw = String(url)
  if (raw.startsWith('data:')) return raw
  const blob = await fetchHttpBlob(raw)
  return uprightJpegBlobToPdfDataUrl(blob, maxEdge, jpegQuality)
}

export async function applyRotationToPdfDataUrl(dataUrl, rotationDegrees, jpegQuality = DEFAULT_PDF_JPEG_QUALITY) {
  const degrees = normalizeRotationDegrees(rotationDegrees)
  if (!degrees) return dataUrl
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return dataUrl
  const sharp = await loadSharp()
  if (!sharp) return dataUrl
  const quality = normalizeJpegQuality(jpegQuality)
  const base64 = String(dataUrl).split(',')[1]
  if (!base64) return dataUrl
  const buf = Buffer.from(base64, 'base64')
  const out = await sharp(buf).rotate(degrees).jpeg({ quality }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}
