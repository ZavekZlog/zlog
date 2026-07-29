/**
 * @deprecated Use '@/lib/ai-annotation' (annotatePhoto / annotatePhotoFile).
 * Thin aliases for older imports.
 */
import { annotatePhoto, fileToAnnotationDataUrl } from '@/lib/ai-annotation/client'

export { fileToAnnotationDataUrl as fileToDescribeDataUrl }

/** @deprecated Prefer annotatePhoto({ contextId }) from '@/lib/ai-annotation' */
export async function describePhotoImage(opts = {}) {
  const { dataUrl, location = '', reportKind, contextId } = opts
  let id = contextId
  if (!id && reportKind) {
    const kind = String(reportKind).toLowerCase()
    if (kind.includes('snag')) id = 'snag'
    else if (kind.includes('survey')) id = 'survey'
    else if (kind.includes('progress')) id = 'progress'
    else if (kind.includes('health') || kind.includes('safety')) id = 'healthSafety'
    else id = 'diary'
  }
  return annotatePhoto({ dataUrl, location, contextId: id || 'diary' })
}
