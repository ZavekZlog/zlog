import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAnalyzeBrandLogoPayload,
  analyzeBrandLogoWithVision,
} from './analyze-brand-logo.js'

describe('analyze-brand-logo', () => {
  it('parses high-confidence CBRE payload', () => {
    const parsed = parseAnalyzeBrandLogoPayload({
      company_name: 'CBRE',
      confidence: 'high',
    })
    assert.deepEqual(parsed, { company_name: 'CBRE', confidence: 'high' })
  })

  it('rejects malformed confidence', () => {
    assert.equal(parseAnalyzeBrandLogoPayload({ company_name: 'CBRE', confidence: 'sure' }), null)
  })

  it('accepts null company_name with low confidence', () => {
    assert.deepEqual(
      parseAnalyzeBrandLogoPayload({ company_name: null, confidence: 'low' }),
      { company_name: null, confidence: 'low' },
    )
  })

  it('medium confidence is parsed but not for automatic prefill in UI', () => {
    const parsed = parseAnalyzeBrandLogoPayload({
      company_name: 'Maybe Co',
      confidence: 'medium',
    })
    assert.equal(parsed.confidence, 'medium')
    assert.equal(parsed.company_name, 'Maybe Co')
  })

  it('vision helper rejects invalid model JSON safely', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not json at all' } }],
      }),
    })
    const outcome = await analyzeBrandLogoWithVision({
      apiKey: 'test-key',
      imageDataUrl: 'data:image/png;base64,abc',
      fetchImpl,
    })
    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 502)
  })

  it('vision helper returns parsed result on valid JSON content', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ company_name: 'CBRE', confidence: 'high' }),
          },
        }],
      }),
    })
    const outcome = await analyzeBrandLogoWithVision({
      apiKey: 'test-key',
      imageDataUrl: 'data:image/png;base64,abc',
      fetchImpl,
    })
    assert.equal(outcome.ok, true)
    assert.deepEqual(outcome.result, { company_name: 'CBRE', confidence: 'high' })
  })
})
