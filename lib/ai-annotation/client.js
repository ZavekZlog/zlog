/**
 * Client API for the AI annotation engine.
 * Always send Current Area with the image when annotating.
 */
import { fileToAnnotationDataUrl } from '@/lib/ai-annotation/image'
import { getAnnotationContext } from '@/lib/ai-annotation/contexts'

/**
 * @param {{ dataUrl: string, contextId?: string, area?: string, location?: string }} opts
 * @returns {Promise<{ description: string, contextId: string, area: string }>}
 */
export async function annotatePhoto({
  dataUrl,
  contextId = 'diary',
  area = '',
  location = '',
}) {
  const ctx = getAnnotationContext(contextId)
  const currentArea = (area && String(area).trim()) || (location && String(location).trim()) || ''
  const res = await fetch('/api/ai-annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: dataUrl,
      contextId: ctx.id,
      area: currentArea,
      // legacy field for older proxies
      location: currentArea,
    }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || `Annotation failed (${res.status})`)
  }
  return payload
}

/**
 * File → compressed data URL → AI description, with Current Area.
 * @param {{ file: Blob, contextId?: string, area?: string, location?: string }} opts
 */
export async function annotatePhotoFile({
  file,
  contextId = 'diary',
  area = '',
  location = '',
}) {
  const dataUrl = await fileToAnnotationDataUrl(file)
  return annotatePhoto({ dataUrl, contextId, area, location })
}

export { fileToAnnotationDataUrl }
