import 'server-only'
import {
  preloadPhaseCWorkPhotoSourcesWithDownload,
  SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY,
  mapWithBoundedConcurrency,
} from './preload-phase-c-work-photos-logic.js'

export { SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY, mapWithBoundedConcurrency }

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {Array<Record<string, unknown>>} photoRows
 * @param {{ downloadFn?: Function, concurrency?: number }} [options]
 */
export async function preloadPhaseCWorkPhotoSources(admin, photoRows = [], options = {}) {
  const downloadFn = options.downloadFn || (async (adminClient, path) => {
    const { downloadSitePhotoBlob } = await import('./pdf-image-server.js')
    return downloadSitePhotoBlob(adminClient, path)
  })
  return preloadPhaseCWorkPhotoSourcesWithDownload(admin, photoRows, {
    downloadFn,
    concurrency: options.concurrency,
  })
}
