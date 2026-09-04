/**
 * PDF asset storage signing — no React / PDF renderer imports (testable in Node).
 */

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
  const [logoUrl, coverSignedUrl, signatureSrc] = await Promise.all([
    signedUrlForPath(supabase, report.brand_logo_url),
    skipCoverSign ? Promise.resolve(null) : signedUrlForPath(supabase, report.cover_photo_url),
    signedUrlForPath(supabase, report.signature_url),
  ])
  const coverPhotoUrl = await uprightCoverFn(coverSignedUrl)
  return { logoUrl, coverPhotoUrl, signatureSrc }
}
