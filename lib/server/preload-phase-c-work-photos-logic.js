import { isPreparedWorkPhotoForPdfPassThrough } from '../photo-workspace/persist-prepared-photo.js'

/** Server-only Phase C Storage download pool (not client PDF network limiter). */
export const SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY = 8

function photoStoragePath(photo) {
  const raw = photo?.url ?? photo?.storagePath ?? null
  return raw ? String(raw).trim() : null
}

function isStoragePath(path) {
  if (!path) return false
  return !/^https?:|^data:|^blob:/i.test(path)
}

/**
 * Bounded parallel map; results preserve input order by index.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 */
export async function mapWithBoundedConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : []
  const limit = Math.max(1, Math.min(concurrency, list.length || 1))
  const results = new Array(list.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(list[index], index)
    }
  }

  const runners = []
  for (let i = 0; i < limit; i += 1) {
    runners.push(runWorker())
  }
  await Promise.all(runners)
  return results
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {Array<Record<string, unknown>>} photoRows
 * @param {{
 *   downloadFn: (admin: import('@supabase/supabase-js').SupabaseClient, path: string) => Promise<Blob|null>,
 *   concurrency?: number,
 * }} options
 */
export async function preloadPhaseCWorkPhotoSourcesWithDownload(admin, photoRows = [], options) {
  const concurrency = Number(options.concurrency) > 0
    ? Number(options.concurrency)
    : SERVER_PDF_PHOTO_DOWNLOAD_CONCURRENCY
  const downloadFn = options.downloadFn

  const rows = Array.isArray(photoRows) ? photoRows : []
  const jobs = []
  for (let index = 0; index < rows.length; index += 1) {
    const photo = rows[index]
    const path = photoStoragePath(photo)
    if (!path || !isStoragePath(path)) continue
    if (!isPreparedWorkPhotoForPdfPassThrough(photo)) continue
    jobs.push({ index, path, photo })
  }

  const localPrepared = new Map()
  if (!jobs.length) {
    return {
      localPrepared,
      photoCount: rows.length,
      serverDownloadConcurrency: concurrency,
      downloadJobCount: 0,
    }
  }

  const outcomes = await mapWithBoundedConcurrency(jobs, concurrency, async (job) => {
    const blob = await downloadFn(admin, job.path)
    return { ...job, blob }
  })

  for (const outcome of outcomes) {
    const { path, blob } = outcome
    if (!(blob instanceof Blob) || blob.size < 1) continue
    if (localPrepared.has(path)) continue
    localPrepared.set(path, blob)
  }

  return {
    localPrepared,
    photoCount: rows.length,
    serverDownloadConcurrency: concurrency,
    downloadJobCount: jobs.length,
  }
}
