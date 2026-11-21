/**
 * PDF asset storage signing — no React / PDF renderer imports (testable in Node).
 */

import {
  attendanceEvidenceFileName,
  attendanceEvidenceIsImage,
} from './diary-sign-in-sheet-evidence.js'
import {
  PHOTO_DISPLAY_SIGN_BATCH_SIZE,
  chunkPaths,
  dedupeStoragePaths,
  isBrowserDisplaySrc,
} from './photo-workspace/thumbnail-display.js'

/** Same expiry as existing single-path PDF signing. */
export const PDF_STORAGE_SIGNED_URL_EXPIRES_IN = 60 * 60

/**
 * True when the source is already usable without Supabase storage signing.
 * Matches signedUrlForPath: absolute http(s), data:, and blob: URLs.
 * @param {unknown} path
 */
export function isDirectlyUsablePdfSource(path) {
  if (path == null || path === '') return false
  const raw = String(path)
  return /^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')
}

/**
 * Storage path that currently requires createSignedUrl / createSignedUrls.
 * Empty, null, and already-usable sources are not signable paths.
 * @param {unknown} path
 */
export function pdfSourceNeedsStorageSign(path) {
  if (!path) return false
  const raw = String(path)
  if (!raw) return false
  return !isDirectlyUsablePdfSource(raw)
}

export async function signedUrlForPath(supabase, path) {
  if (!path) return null
  const raw = String(path)
  if (isDirectlyUsablePdfSource(raw)) return raw
  const { data, error } = await supabase.storage.from('site-photos').createSignedUrl(
    raw,
    PDF_STORAGE_SIGNED_URL_EXPIRES_IN,
  )
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Map createSignedUrls rows by returned storage path only.
 * Never assign by array index — a missing/mismatched path is a miss, not a neighbour's URL.
 * @param {Array<{ path?: string|null, signedUrl?: string|null, signedURL?: string|null, error?: unknown }>|null|undefined} rows
 * @param {string[]} requestedPaths
 * @returns {Map<string, string>}
 */
export function mapBatchSignedUrlsByPath(rows, requestedPaths = []) {
  const requested = new Set()
  for (const rawPath of Array.isArray(requestedPaths) ? requestedPaths : []) {
    const raw = String(rawPath || '')
    if (raw) requested.add(raw)
    const trimmed = raw.trim()
    if (trimmed) requested.add(trimmed)
  }
  const out = new Map()
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    const path = String(row?.path || '').trim()
    if (!path || !requested.has(path)) continue
    if (row?.error) continue
    const url = row?.signedUrl || row?.signedURL || null
    if (!isBrowserDisplaySrc(url) && !isDirectlyUsablePdfSource(url)) continue
    out.set(path, String(url).trim())
  }
  return out
}

/**
 * Batch-sign PDF work-photo storage paths. Does not fetch images.
 * Uses the existing saved-view chunk size (100) so 19 paths are one request.
 *
 * @param {object} supabase
 * @param {string[]} paths
 * @param {{ expiresIn?: number, batchSize?: number }} [opts]
 * @returns {Promise<{ urlByPath: Map<string, string>, batchRequestCount: number, signablePathCount: number }>}
 */
export async function batchSignedUrlsForStoragePaths(supabase, paths, opts = {}) {
  const expiresIn = Number(opts.expiresIn) > 0
    ? Number(opts.expiresIn)
    : PDF_STORAGE_SIGNED_URL_EXPIRES_IN
  const batchSize = Number(opts.batchSize) > 0
    ? Number(opts.batchSize)
    : PHOTO_DISPLAY_SIGN_BATCH_SIZE

  const signable = dedupeStoragePaths(
    (Array.isArray(paths) ? paths : []).filter((p) => pdfSourceNeedsStorageSign(p)),
  )
  const urlByPath = new Map()
  if (!signable.length) {
    return { urlByPath, batchRequestCount: 0, signablePathCount: 0 }
  }

  const bucket = supabase?.storage?.from?.('site-photos')
  if (!bucket || typeof bucket.createSignedUrls !== 'function') {
    return { urlByPath, batchRequestCount: 0, signablePathCount: signable.length }
  }

  let batchRequestCount = 0
  for (const chunk of chunkPaths(signable, batchSize)) {
    batchRequestCount += 1
    let rows = null
    let error = null
    try {
      const result = await bucket.createSignedUrls(chunk, expiresIn)
      error = result?.error || null
      rows = result?.data
    } catch {
      rows = null
      error = true
    }
    if (error || !Array.isArray(rows)) continue
    const mapped = mapBatchSignedUrlsByPath(rows, chunk)
    for (const [path, url] of mapped) {
      urlByPath.set(path, url)
    }
  }

  return { urlByPath, batchRequestCount, signablePathCount: signable.length }
}

/**
 * Sign logo, cover storage path, and signature for PDF embed.
 * Independent storage sign requests run concurrently; cover upright bake stays sequential.
 *
 * @param {object} supabase
 * @param {{ brand_logo_url?: string|null, cover_photo_url?: string|null, signature_url?: string|null }} report
 * @param {(signedCoverUrl: string|null) => Promise<string|null>} uprightCoverFn
 * @param {{ skipCoverSign?: boolean }} [options]
 */
export async function signPdfReportAssets(supabase, report, uprightCoverFn, options = {}) {
  const skipCoverSign = options?.skipCoverSign === true
  const [logoUrl, coverSignedUrl, signatureSrc, attendanceRegisterSignedUrl] = await Promise.all([
    signedUrlForPath(supabase, report.brand_logo_url),
    skipCoverSign ? Promise.resolve(null) : signedUrlForPath(supabase, report.cover_photo_url),
    signedUrlForPath(supabase, report.signature_url),
    signedUrlForPath(supabase, report.sign_in_sheet_url),
  ])
  const coverPhotoUrl = await uprightCoverFn(coverSignedUrl)
  return { logoUrl, coverPhotoUrl, signatureSrc, attendanceRegisterSignedUrl }
}

function sniffAttendanceImageKind(bytes, contentType, fileName) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array()
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg'
  if (u8.length >= 4 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png'
  if (u8.length >= 3 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif'
  if (
    u8.length >= 12
    && u8[0] === 0x52
    && u8[1] === 0x49
    && u8[2] === 0x46
    && u8[3] === 0x46
  ) return 'webp'
  const type = String(contentType || '').toLowerCase()
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpeg'
  if (/\.png$/i.test(fileName)) return 'png'
  if (/\.gif$/i.test(fileName)) return 'gif'
  if (/\.webp$/i.test(fileName)) return 'webp'
  if (attendanceEvidenceIsImage(fileName)) return 'jpeg'
  return null
}

function bytesToDataUrl(kind, bytes) {
  const mime = kind === 'png' ? 'image/png' : 'image/jpeg'
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let b64
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(u8).toString('base64')
  } else {
    const parts = []
    const chunk = 0x8000
    for (let i = 0; i < u8.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + chunk)))
    }
    b64 = btoa(parts.join(''))
  }
  return `data:${mime};base64,${b64}`
}

/**
 * One attendance file for the issued PDF.
 * JPEG and PNG are embedded as the original bytes — no resize, no recompress.
 * WebP and GIF are handed to rasterizeBlob at their own pixel size.
 * PDF and spreadsheet exports are the file name only. Nothing attached returns [].
 *
 * @param {string|null|undefined} storagePath
 * @param {string|null|undefined} signedUrl
 * @param {(bytes: Uint8Array) => Promise<string|null>|string|null} [rasterizeBlob]
 * @returns {Promise<Array<{ fileName: string, imageSrc: string|null }>>}
 */
export async function attendanceRegisterSheetsForPdf(storagePath, signedUrl, rasterizeBlob) {
  const path = String(storagePath || '').trim()
  if (!path) return []
  const fileName = attendanceEvidenceFileName(path)
  if (!attendanceEvidenceIsImage(path)) {
    return [{ fileName, imageSrc: null }]
  }
  if (!signedUrl) return [{ fileName, imageSrc: null }]
  let bytes
  try {
    const res = await fetch(signedUrl)
    if (!res.ok) return [{ fileName, imageSrc: null }]
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch {
    return [{ fileName, imageSrc: null }]
  }
  if (!bytes.length) return [{ fileName, imageSrc: null }]
  const kind = sniffAttendanceImageKind(bytes, '', path)
  if (kind === 'jpeg' || kind === 'png') {
    return [{ fileName, imageSrc: bytesToDataUrl(kind, bytes) }]
  }
  if ((kind === 'webp' || kind === 'gif') && typeof rasterizeBlob === 'function') {
    try {
      const imageSrc = await rasterizeBlob(bytes)
      if (imageSrc) return [{ fileName, imageSrc }]
    } catch {
      /* The file is still named on the page. */
    }
  }
  return [{ fileName, imageSrc: null }]
}
