import { NextResponse } from 'next/server'
import { analyzeBrandLogoWithVision } from '@/lib/server/analyze-brand-logo'

export const runtime = 'nodejs'
export const maxDuration = 45

export async function POST(request) {
  try {
    const body = await request.json()
    const image = body?.image
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'image data URL is required' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'OPENAI_API_KEY is not configured. Add it to the server environment to enable logo name detection.',
        },
        { status: 503 },
      )
    }

    const outcome = await analyzeBrandLogoWithVision({ apiKey, imageDataUrl: image })
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }

    return NextResponse.json(outcome.result)
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Brand logo analysis failed' },
      { status: 500 },
    )
  }
}
