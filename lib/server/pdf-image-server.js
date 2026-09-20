import 'server-only'
import { coverBlobToPdfDataUrl } from '@/lib/diary-cover-photo.js'
import { normalizeRotationDegrees } from '@/lib/diary-pdf-layout.js'

/** Matches client PDF work-photo JPEG quality (0.92 → 92). */
const PDF_JPEG_QUALITY = 92

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
 */
export async function uprightJpegBlobToPdfDataUrl(blob, maxEdge = 2400) {
  if (!(blob instanceof Blob) || blob.size < 1) {
    throw new Error('Image for the PDF was empty.')
  }
  const sharp = await loadSharp()
  if (!sharp) {
    return coverBlobToPdfDataUrl(blob)
  }
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
  const out = await pipeline.jpeg({ quality: PDF_JPEG_QUALITY }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}

export async function uprightSignedUrlToPdfDataUrl(url, maxEdge = 2400) {
  if (!url) return null
  const raw = String(url)
  if (raw.startsWith('data:')) return raw
  const blob = await fetchHttpBlob(raw)
  return uprightJpegBlobToPdfDataUrl(blob, maxEdge)
}

export async function applyRotationToPdfDataUrl(dataUrl, rotationDegrees) {
  const degrees = normalizeRotationDegrees(rotationDegrees)
  if (!degrees) return dataUrl
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return dataUrl
  const sharp = await loadSharp()
  if (!sharp) return dataUrl
  const base64 = String(dataUrl).split(',')[1]
  if (!base64) return dataUrl
  const buf = Buffer.from(base64, 'base64')
  const out = await sharp(buf).rotate(degrees).jpeg({ quality: PDF_JPEG_QUALITY }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}
