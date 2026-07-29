import { NextResponse } from 'next/server'
import { ANNOTATION_CONTEXT_IDS, getAnnotationContext } from '@/lib/ai-annotation/contexts'
import { runPhotoAnnotation } from '@/lib/ai-annotation/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request) {
  try {
    const body = await request.json()
    const image = body?.image
    const area = typeof body?.area === 'string'
      ? body.area.trim()
      : (typeof body?.location === 'string' ? body.location.trim() : '')

    let contextId = body?.contextId
    if (!contextId || !ANNOTATION_CONTEXT_IDS.includes(contextId)) {
      const kind = typeof body?.reportKind === 'string' ? body.reportKind.toLowerCase() : ''
      if (kind.includes('snag')) contextId = 'snag'
      else if (kind.includes('survey')) contextId = 'survey'
      else if (kind.includes('progress')) contextId = 'progress'
      else if (kind.includes('health') || kind.includes('h&s') || kind.includes('safety')) {
        contextId = 'healthSafety'
      } else {
        contextId = 'diary'
      }
    }

    getAnnotationContext(contextId)

    const result = await runPhotoAnnotation({
      imageDataUrl: image,
      contextId,
      area,
    })

    return NextResponse.json(result)
  } catch (err) {
    const status = err?.status && Number.isFinite(err.status) ? err.status : 500
    return NextResponse.json(
      { error: err?.message || 'Failed to annotate photo' },
      { status },
    )
  }
}
