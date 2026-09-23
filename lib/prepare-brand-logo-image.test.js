import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assessUniformLogoBackground,
  colorDistanceRgb,
  removeUniformLogoBackground,
  sampleCornerPatchColors,
} from './prepare-brand-logo-image.js'

const root = join(import.meta.dirname, '..')

function fillRect(data, width, x, y, w, h, r, g, b, a = 255) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const i = (py * width + px) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
}

function makeCanvas(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = 255
  }
  paint(data, w, h)
  return { data, width: w, height: h }
}

describe('prepare-brand-logo-image — uniform backdrop removal', () => {
  it('removes dark-green uniform background and preserves white wordmark pixels', () => {
    const w = 80
    const h = 40
    const { data, width, height } = makeCanvas(w, h, (buf, width) => {
      fillRect(buf, width, 0, 0, w, h, 0, 110, 62)
      fillRect(buf, width, 18, 12, 8, 14, 255, 255, 255)
      fillRect(buf, width, 28, 12, 8, 14, 255, 255, 255)
      fillRect(buf, width, 38, 12, 10, 14, 255, 255, 255)
      fillRect(buf, width, 50, 12, 8, 14, 255, 255, 255)
    })
    const corners = sampleCornerPatchColors(data, width, height)
    assert.ok(assessUniformLogoBackground(corners).confident)
    const out = removeUniformLogoBackground(data, width, height)
    assert.equal(out.transformed, true)
    const center = (20 * width + 22) * 4
    assert.ok(out.data[center + 3] > 200, 'white letter stays opaque')
    const edge = (2 * width + 2) * 4
    assert.equal(out.data[edge + 3], 0, 'green backdrop becomes transparent')
  })

  it('removes light uniform background and preserves coloured foreground', () => {
    const w = 60
    const h = 30
    const { data, width, height } = makeCanvas(w, h, (buf, width) => {
      fillRect(buf, width, 0, 0, w, h, 245, 245, 248)
      fillRect(buf, width, 20, 8, 20, 14, 200, 40, 40)
    })
    const out = removeUniformLogoBackground(data, width, height)
    assert.equal(out.transformed, true)
    const fg = (10 * width + 30) * 4
    assert.ok(out.data[fg + 3] > 200)
    const bg = (1 * width + 1) * 4
    assert.equal(out.data[bg + 3], 0)
  })

  it('declines transformation on busy non-uniform edges', () => {
    const w = 50
    const h = 50
    const { data, width, height } = makeCanvas(w, h, (buf, width) => {
      fillRect(buf, width, 0, 0, 25, 25, 10, 120, 10)
      fillRect(buf, width, 25, 0, 25, 25, 200, 200, 10)
      fillRect(buf, width, 0, 25, 25, 25, 10, 10, 200)
      fillRect(buf, width, 25, 25, 25, 25, 200, 10, 200)
    })
    const out = removeUniformLogoBackground(data, width, height)
    assert.equal(out.transformed, false)
    assert.equal(out.data[0], data[0])
  })

  it('preserves aspect ratio dimensions (no resize in removal helper)', () => {
    const { data, width, height } = makeCanvas(64, 32, (buf, width) => {
      fillRect(buf, width, 0, 0, 64, 32, 0, 100, 50)
    })
    const out = removeUniformLogoBackground(data, width, height)
    assert.equal(out.width, 64)
    assert.equal(out.height, 32)
  })

  it('colorDistanceRgb is symmetric', () => {
    const d = colorDistanceRgb(0, 0, 0, 3, 4, 0)
    assert.ok(d > 0)
    assert.equal(d, colorDistanceRgb(3, 4, 0, 0, 0, 0))
  })
})

describe('branding UI — preview frames and prefill guardrails', () => {
  const brandingSelector = readFileSync(
    join(root, 'components/branding/BrandingSelector.jsx'),
    'utf8',
  )
  const settingsBranding = readFileSync(
    join(root, 'app/dashboard/settings/branding/page.jsx'),
    'utf8',
  )
  const diarySetup = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')

  it('BrandingSelector uses vision analysis and manual override guards', () => {
    assert.match(brandingSelector, /fetchBrandCompanyNameAnalysis/)
    assert.match(brandingSelector, /analyzed\.confidence === 'high'/)
    assert.match(brandingSelector, /nameManuallyEdited/)
    assert.doesNotMatch(brandingSelector, /inferCompanyNameFromBrand/)
    assert.doesNotMatch(brandingSelector, /BRAND_LETTER_TEMPLATES/)
  })

  it('Settings branding mirrors prefill guards for new profiles', () => {
    assert.match(settingsBranding, /fetchBrandCompanyNameAnalysis/)
    assert.match(settingsBranding, /!editingId && !nameManuallyEdited/)
    assert.match(settingsBranding, /nameManuallyEdited/)
  })

  it('preview frames keep approved outer dimensions without inner gutter', () => {
    assert.match(brandingSelector, /width: 56,\s*\n\s*height: 56/)
    assert.match(brandingSelector, /width: '100%',\s*\n\s*height: '100%',\s*\n\s*objectFit: 'contain'/)
    assert.match(settingsBranding, /width: 56,\s*\n\s*height: 56/)
    assert.match(settingsBranding, /width: 48,\s*\n\s*height: 48/)
    assert.match(diarySetup, /height: 92/)
    assert.doesNotMatch(diarySetup, /padding: 8,\s*\n\s*borderRadius: 12/)
  })

  it('PdfHeader has no white logo plate', () => {
    const pdfHeader = readFileSync(join(root, 'components/pdf/PdfHeader.jsx'), 'utf8')
    assert.doesNotMatch(pdfHeader, /logoPlate/)
    assert.match(pdfHeader, /width: 68,\s*\n\s*height: 32/)
  })
})
