/**
 * PDF asset storage signing — no React / PDF renderer imports (testable in Node).
 */

export async function signedUrlForPath(supabase, path) {
  if (!path) return null
  const raw = String(path)
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw
  }
  const { data, error } = await supabase.storage.from('site-photos').createSignedUrl(raw, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Sign logo, cover storage path, and signature for PDF embed.
 * Independent storage sign requests run concurrently; cover upright bake stays sequential.
 *
 * @param {object} supabase
 * @param {{ brand_logo_url?: string|null, cover_photo_url?: string|null, signature_url?: string|null }} report
 * @param {(signedCoverUrl: string|null) => Promise<string|null>} uprightCoverFn
 */
export async function signPdfReportAssets(supabase, report, uprightCoverFn) {
  const [logoUrl, coverSignedUrl, signatureSrc] = await Promise.all([
    signedUrlForPath(supabase, report.brand_logo_url),
    signedUrlForPath(supabase, report.cover_photo_url),
    signedUrlForPath(supabase, report.signature_url),
  ])
  const coverPhotoUrl = await uprightCoverFn(coverSignedUrl)
  return { logoUrl, coverPhotoUrl, signatureSrc }
}
