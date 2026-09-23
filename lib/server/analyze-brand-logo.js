const SYSTEM_PROMPT = `You identify the principal company or brand wordmark shown in a logo or branding image.
Return ONLY valid JSON with this exact shape:
{"company_name":string|null,"confidence":"high"|"medium"|"low"}

Rules:
- company_name = the main brand/company wordmark text only (e.g. "CBRE"), not a tagline or product name unless it is clearly the company name.
- Ignore browser UI, search results, status bars, and surrounding screenshot clutter.
- Do not invent or guess a company name.
- If uncertain, set company_name to null and confidence to "low" or "medium".
- Use confidence "high" only when the principal wordmark is clear and unambiguous.
- No description, caption, or marketing copy — only the JSON object.`

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

/**
 * @param {unknown} raw
 * @returns {{ company_name: string|null, confidence: 'high'|'medium'|'low' }|null}
 */
export function parseAnalyzeBrandLogoPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  const confidence = raw.confidence
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    return null
  }
  let companyName = null
  if (raw.company_name != null && raw.company_name !== '') {
    const s = String(raw.company_name).trim()
    if (s.length > 0 && s.length <= 120) companyName = s
  }
  return { company_name: companyName, confidence }
}

/**
 * @param {{
 *   apiKey: string,
 *   imageDataUrl: string,
 *   model?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function analyzeBrandLogoWithVision({
  apiKey,
  imageDataUrl,
  model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    return { ok: false, status: 503, error: 'OPENAI_API_KEY is not configured.' }
  }
  if (!imageDataUrl || !String(imageDataUrl).startsWith('data:image/')) {
    return { ok: false, status: 400, error: 'image data URL is required' }
  }

  const visionRes = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the principal company/brand wordmark in this image? Return JSON only.',
            },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  })

  const visionJson = await visionRes.json().catch(() => ({}))
  if (!visionRes.ok) {
    const msg = visionJson?.error?.message || `Vision API error (${visionRes.status})`
    return { ok: false, status: 502, error: msg }
  }

  const content = visionJson?.choices?.[0]?.message?.content
  const parsed = parseAnalyzeBrandLogoPayload(extractJsonObject(content))
  if (!parsed) {
    return { ok: false, status: 502, error: 'Invalid model response' }
  }

  return { ok: true, status: 200, result: parsed }
}
