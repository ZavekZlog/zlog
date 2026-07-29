/**
 * Server-side AI annotation engine (OpenAI vision).
 * Used by /api/ai-annotate — not imported from client components.
 *
 * Always pairs the image with Current Area when generating descriptions.
 */
import { getAnnotationContext } from '@/lib/ai-annotation/contexts'

const BASE_SYSTEM_PROMPT = `You write short construction-site photo annotations for professional reports.
Return ONLY valid JSON: {"description":"string"}

Rules:
- 1–2 sentences, factual, site-ready language.
- Mention only what is visible in the image.
- You will be given an area name for where the photo was taken. Use it naturally when helpful; do not invent a different place.
- Do not use repetitive openings such as "In Current Area…" or "In this area…".
- No markdown, no bullet lists, no preamble.
- Do not invent details that are not visible.`

export function extractJsonObject(text) {
  if (!text) return null
  const trimmed = String(text).trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function buildAnnotationSystemPrompt(contextId) {
  const ctx = getAnnotationContext(contextId)
  return `${BASE_SYSTEM_PROMPT}\n\nModule focus (${ctx.label}):\n${ctx.focus}`
}

/**
 * User message: image + Current Area are both required inputs for the model.
 * @param {string} contextId
 * @param {string} [area]
 */
export function buildAnnotationUserText(contextId, area = '') {
  const ctx = getAnnotationContext(contextId)
  const areaName = typeof area === 'string' ? area.trim() : ''
  if (areaName) {
    return [
      `Report module: ${ctx.label}.`,
      `Area name: ${areaName}.`,
      'Write a natural caption for this photograph.',
      'Use the area name only when it helps (e.g. weave it into the sentence).',
      'Do NOT start with formulaic prefixes like "In Current Area…" or "In this area…".',
      'Prefer wording such as "…within the first-floor corridor" or "…within Area 1A" when mentioning place.',
    ].join(' ')
  }
  return `Report module: ${ctx.label}. Describe only what is visible in the photograph.`
}

/**
 * @param {{ imageDataUrl: string, contextId?: string, area?: string, location?: string }} opts
 *   `location` is accepted as a legacy alias for `area`.
 * @returns {Promise<{ description: string, contextId: string, area: string }>}
 */
export async function runPhotoAnnotation({
  imageDataUrl,
  contextId = 'diary',
  area = '',
  location = '',
}) {
  const ctx = getAnnotationContext(contextId)
  const currentArea = (typeof area === 'string' && area.trim())
    || (typeof location === 'string' && location.trim())
    || ''

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    const err = new Error(
      'OPENAI_API_KEY is not configured. Add it to the server environment to enable AI annotations.',
    )
    err.status = 503
    throw err
  }

  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    const err = new Error('image data URL is required')
    err.status = 400
    throw err
  }

  const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildAnnotationSystemPrompt(ctx.id) },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildAnnotationUserText(ctx.id, currentArea) },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })

  const visionJson = await visionRes.json().catch(() => ({}))
  if (!visionRes.ok) {
    const err = new Error(visionJson?.error?.message || `OpenAI error (${visionRes.status})`)
    err.status = 502
    throw err
  }

  const raw = visionJson?.choices?.[0]?.message?.content
  const parsed = extractJsonObject(raw)
  const description = typeof parsed?.description === 'string' ? parsed.description.trim() : ''
  if (!description) {
    const err = new Error('AI returned an empty description')
    err.status = 502
    throw err
  }

  return { description, contextId: ctx.id, area: currentArea }
}
