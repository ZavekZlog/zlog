import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundleFile = join(here, 'dist', 'worker-pdf-pipeline.mjs')

/**
 * Load the production PDF worker bundle built by build:worker-site-diary-pdf.
 * @returns {Promise<import('./execute-claimed-site-diary-pdf-export.js').executeClaimedSiteDiaryPdfExport>}
 */
export async function loadProductionPdfExecutor() {
  const mod = await import(pathToFileURL(bundleFile).href)
  const fn = mod?.executeClaimedSiteDiaryPdfExport
  if (typeof fn !== 'function') {
    throw new Error(
      'Production PDF bundle is missing executeClaimedSiteDiaryPdfExport. Run npm run build:worker-site-diary-pdf.',
    )
  }
  return fn
}

export const PRODUCTION_PDF_BUNDLE_RELATIVE_PATH = 'dist/worker-pdf-pipeline.mjs'
