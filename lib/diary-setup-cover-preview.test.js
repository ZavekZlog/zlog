/**
 * PHOTO-001 — setup Cover photo preview.
 * Content: complete image, no crop, no distortion.
 * Presentation: full available width, height from aspect ratio; no 200px letterbox.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETUP_COVER_PREVIEW_IMG_STYLE,
  isAspectAwareCoverPreviewStyle,
  isContainEquivalentPhotoStyle,
  photoStyleCrops,
  setupCoverPreviewImgProps,
  usedSetupCoverPreviewBox,
} from './diary-setup-cover-preview.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const savedDiaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
  'utf8',
)
const previewSrc = readFileSync(join(root, 'lib/diary-setup-cover-preview.js'), 'utf8')
const registry = JSON.parse(
  readFileSync(join(root, 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json'), 'utf8'),
)
const photoContract = readFileSync(
  join(root, 'docs/contracts/PHOTO_WORKSPACE_CONTRACT.md'),
  'utf8',
)

function styleBlockAfter(source, marker) {
  const at = source.indexOf(marker)
  assert.ok(at >= 0, `missing marker ${marker}`)
  const styleAt = source.indexOf('style={{', at)
  assert.ok(styleAt >= 0 && styleAt - at < 400, `no inline style near ${marker}`)
  const end = source.indexOf('}}', styleAt)
  assert.ok(end > styleAt)
  return source.slice(styleAt, end + 2)
}

function parseJsxStyleFit(block) {
  const fit = /objectFit:\s*'([^']+)'/.exec(block)?.[1]
    || /'object-fit'\s*:\s*'([^']+)'/.exec(block)?.[1]
    || /object-fit:\s*'([^']+)'/.exec(block)?.[1]
    || null
  const bg = /backgroundSize:\s*'([^']+)'/.exec(block)?.[1]
    || /background-size:\s*'([^']+)'/.exec(block)?.[1]
    || null
  return {
    objectFit: fit,
    backgroundSize: bg,
    crops: fit === 'cover' || bg === 'cover' || /object-fit:\s*cover/.test(block),
  }
}

describe('PHOTO-001 inventory', () => {
  it('registry and photo contract record content + presentation', () => {
    const row = registry.behaviours.find((b) => b.id === 'PHOTO-001')
    assert.ok(row)
    assert.match(row.description, /complete image and original aspect ratio/i)
    assert.match(row.description, /Cropping is prohibited/)
    assert.match(photoContract, /PHOTO-001/)
    assert.match(photoContract, /\*\*Content:\*\*/)
    assert.match(photoContract, /\*\*Presentation:\*\*/)
    assert.match(photoContract, /fixed landscape letterbox/)
  })
})

describe('setup cover preview — aspect-aware width, no letterbox stage', () => {
  it('image style is full-width, height auto, contain, not cover', () => {
    assert.equal(SETUP_COVER_PREVIEW_IMG_STYLE.width, '100%')
    assert.equal(SETUP_COVER_PREVIEW_IMG_STYLE.height, 'auto')
    assert.equal(SETUP_COVER_PREVIEW_IMG_STYLE.maxWidth, '100%')
    assert.equal(SETUP_COVER_PREVIEW_IMG_STYLE.objectFit, 'contain')
    assert.equal(SETUP_COVER_PREVIEW_IMG_STYLE.maxHeight, undefined)
    assert.equal(isAspectAwareCoverPreviewStyle(SETUP_COVER_PREVIEW_IMG_STYLE), true)
    assert.equal(isContainEquivalentPhotoStyle(SETUP_COVER_PREVIEW_IMG_STYLE), true)
    assert.equal(photoStyleCrops(SETUP_COVER_PREVIEW_IMG_STYLE), false)
    assert.equal(photoStyleCrops({ objectFit: 'cover' }), true)
    assert.equal(isContainEquivalentPhotoStyle({ objectFit: 'cover' }), false)
    assert.equal(isContainEquivalentPhotoStyle({ objectFit: 'fill' }), false)
    assert.equal(isAspectAwareCoverPreviewStyle({
      ...SETUP_COVER_PREVIEW_IMG_STYLE,
      maxHeight: 200,
    }), false)
    assert.equal(isAspectAwareCoverPreviewStyle({
      ...SETUP_COVER_PREVIEW_IMG_STYLE,
      height: 200,
    }), false)
  })

  it('setup Cover markup uses the aspect-aware image and no 200px stage', () => {
    assert.match(setupPage, /SETUP_COVER_PREVIEW_IMG_STYLE/)
    assert.doesNotMatch(setupPage, /SETUP_COVER_PREVIEW_STAGE_STYLE/)
    assert.doesNotMatch(previewSrc, /SETUP_COVER_PREVIEW_MAX_HEIGHT_PX/)
    assert.doesNotMatch(previewSrc, /SETUP_COVER_PREVIEW_STAGE_STYLE/)
    const coverSection = setupPage.slice(setupPage.indexOf('title="Cover photo"'))
    const imgChunk = coverSection.slice(0, coverSection.indexOf('Remove cover photo'))
    assert.match(imgChunk, /style=\{SETUP_COVER_PREVIEW_IMG_STYLE\}/)
    assert.doesNotMatch(imgChunk, /objectFit:\s*'cover'/)
    assert.doesNotMatch(imgChunk, /object-fit:\s*cover/)
    assert.doesNotMatch(imgChunk, /height:\s*200/)
    assert.doesNotMatch(imgChunk, /maxHeight:\s*200/)
    assert.doesNotMatch(setupPage, /objectFit:\s*'cover'/)
  })

  it('preview img props pass the aspect-aware style through', () => {
    const props = setupCoverPreviewImgProps('blob:cover')
    assert.equal(props.alt, 'Cover')
    assert.equal(props.src, 'blob:cover')
    assert.equal(props.style, SETUP_COVER_PREVIEW_IMG_STYLE)
    assert.equal(isAspectAwareCoverPreviewStyle(props.style), true)
  })
})

describe('portrait / landscape — full available width, proportional height', () => {
  const availableWidth = 360

  it('portrait 3000x4000 uses full width and derives taller height, no side bands', () => {
    const box = usedSetupCoverPreviewBox(3000, 4000, availableWidth)
    assert.equal(box.width, 360)
    assert.equal(box.height, 480)
    assert.ok(box.height > box.width, 'portrait remains portrait')
    assert.ok(Math.abs(box.usedAspectRatio - box.aspectRatio) < 1e-9)
    assert.equal(box.sideBandWidth, 0)
    assert.ok(Math.abs(box.height - box.width * (4000 / 3000)) < 1e-9)
  })

  it('landscape 4000x2000 uses full width and derives shallower height, no side bands', () => {
    const box = usedSetupCoverPreviewBox(4000, 2000, availableWidth)
    assert.equal(box.width, 360)
    assert.equal(box.height, 180)
    assert.ok(box.width > box.height, 'landscape remains landscape')
    assert.ok(Math.abs(box.usedAspectRatio - box.aspectRatio) < 1e-9)
    assert.equal(box.sideBandWidth, 0)
    assert.ok(Math.abs(box.height - box.width * (2000 / 4000)) < 1e-9)
  })
})

describe('saved-diary review cover remains contain', () => {
  it('Cover Photo img on saved view uses contain and not cover', () => {
    const block = styleBlockAfter(savedDiaryPage, 'alt="Site Diary cover photo"')
    const parsed = parseJsxStyleFit(block)
    assert.equal(parsed.objectFit, 'contain')
    assert.equal(parsed.crops, false)
    assert.doesNotMatch(block, /objectFit:\s*'cover'/)
  })
})
