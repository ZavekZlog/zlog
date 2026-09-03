/**
 * PHOTO-001 — all user-photo surfaces: no crop, no distortion.
 * Content: complete photograph, original aspect ratio.
 * Presentation: fixed frames may letterbox; they must not discard content.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANNOTATION_PENDING_PREVIEW_FRAME,
  ANNOTATION_PENDING_PREVIEW_IMG_STYLE,
  ANNOTATION_PHOTO_CARD_THUMB_FRAME,
  ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE,
  ANNOTATION_SAVED_LIST_THUMB_FRAME,
  ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE,
  PHOTO_001_CROP_SCAN_SURFACES,
  PHOTO_001_DECORATIVE_CROP_ALLOWLIST,
  PHOTO_001_FUTURE_SURFACE_SCAN_ROOTS,
  PHOTO_001_OWNING_SURFACES,
  annotationEditorUserPhotoStyle,
  isContainEquivalentPhotoStyle,
  isFixedFrameContainPhotoStyle,
  isPendingPreviewContainPhotoStyle,
  photo001ScanAllowlistPaths,
  photoStyleCrops,
  sourceAssignsCropFit,
  usedFixedFrameContainBox,
  usedFixedFrameCoverBox,
  usedPendingPreviewContainBox,
} from './photo-001-no-crop.js'
import { SETUP_COVER_PREVIEW_IMG_STYLE } from '../diary-setup-cover-preview.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function readRepo(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function posixRel(from, to) {
  return relative(from, to).replace(/\\/g, '/')
}

function listFutureSurfaceScanFiles() {
  const out = []
  function walk(absDir) {
    for (const name of readdirSync(absDir)) {
      if (name === 'node_modules' || name === '.next') continue
      const abs = join(absDir, name)
      const st = statSync(abs)
      if (st.isDirectory()) {
        walk(abs)
        continue
      }
      if (!/\.(js|jsx|ts|tsx)$/.test(name)) continue
      if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(name)) continue
      out.push(posixRel(root, abs))
    }
  }
  for (const relRoot of PHOTO_001_FUTURE_SURFACE_SCAN_ROOTS) {
    walk(join(root, relRoot))
  }
  return out.sort()
}

function unallowlistedCropOrFillHits() {
  const allow = new Set(photo001ScanAllowlistPaths())
  const hits = []
  for (const rel of listFutureSurfaceScanFiles()) {
    if (allow.has(rel)) continue
    if (sourceAssignsCropFit(readRepo(rel))) hits.push(rel)
  }
  return hits
}

const registry = JSON.parse(readRepo('docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json'))
const photoContract = readRepo('docs/contracts/PHOTO_WORKSPACE_CONTRACT.md')
const pendingSrc = readRepo('components/ai-annotation/AnnotationPendingReview.jsx')
const cardSrc = readRepo('components/ai-annotation/AnnotationPhotoCard.jsx')
const savedSrc = readRepo('components/ai-annotation/AnnotationSavedList.jsx')
const editorSrc = readRepo('components/photo-annotations/PhotoAnnotationEditor.jsx')
const landingSrc = readRepo('app/page.tsx')

const PORTRAIT = { w: 3000, h: 4000 }
const LANDSCAPE = { w: 4000, h: 2000 }
const SQUARE = { w: 1000, h: 1000 }
const AVAILABLE_WIDTH = 360

describe('PHOTO-001 registry and contract', () => {
  it('registers owning surfaces and content/presentation split', () => {
    const row = registry.behaviours.find((b) => b.id === 'PHOTO-001')
    assert.ok(row)
    assert.match(row.description, /complete image and original aspect ratio/i)
    assert.match(row.description, /Cropping is prohibited/)
    assert.ok(row.tests.includes('lib/photo-workspace/photo-001-no-crop.test.js'))
    assert.deepEqual(row.owningSurfaces, PHOTO_001_OWNING_SURFACES)
    assert.match(photoContract, /PHOTO-001/)
    assert.match(photoContract, /\*\*Content:\*\*/)
    assert.match(photoContract, /\*\*Presentation:\*\*/)
    assert.match(photoContract, /letterbox/)
    assert.match(photoContract, /88/)
    assert.match(photoContract, /72/)
    assert.match(photoContract, /AnnotationPendingReview/)
    assert.match(photoContract, /AnnotationPhotoCard/)
    assert.match(photoContract, /AnnotationSavedList/)
  })
})

describe('PHOTO-001 content — contain vs cover in a fixed frame', () => {
  const frames = [
    { name: '88x88 card thumb', ...ANNOTATION_PHOTO_CARD_THUMB_FRAME },
    { name: '72x72 saved thumb', ...ANNOTATION_SAVED_LIST_THUMB_FRAME },
  ]
  const sources = [
    { name: 'portrait', ...PORTRAIT },
    { name: 'landscape', ...LANDSCAPE },
    { name: 'square', ...SQUARE },
  ]

  for (const frame of frames) {
    for (const source of sources) {
      it(`${source.name} in ${frame.name} contains without crop or distortion`, () => {
        const contain = usedFixedFrameContainBox(source.w, source.h, frame.width, frame.height)
        const cover = usedFixedFrameCoverBox(source.w, source.h, frame.width, frame.height)
        assert.equal(contain.crops, false)
        assert.equal(contain.distorts, false)
        assert.ok(Math.abs(contain.usedAspect - contain.sourceAspect) < 1e-9)
        assert.ok(contain.usedWidth <= frame.width + 1e-9)
        assert.ok(contain.usedHeight <= frame.height + 1e-9)
        if (source.name === 'square') {
          assert.ok(Math.abs(contain.usedWidth - frame.width) < 1e-9)
          assert.ok(Math.abs(contain.usedHeight - frame.height) < 1e-9)
          assert.equal(cover.crops, false)
        } else {
          assert.equal(cover.crops, true)
          assert.ok(
            Math.abs(cover.usedAspect - cover.sourceAspect) > 1e-6,
            'cover frame aspect is not the photograph aspect',
          )
        }
      })
    }
  }
})

describe('PHOTO-001 full preview — pending capture frame', () => {
  const sources = [
    { name: 'portrait', ...PORTRAIT },
    { name: 'landscape', ...LANDSCAPE },
    { name: 'square', ...SQUARE },
  ]

  for (const source of sources) {
    it(`${source.name} preview contains in ${AVAILABLE_WIDTH}x${ANNOTATION_PENDING_PREVIEW_FRAME.height}`, () => {
      const box = usedPendingPreviewContainBox(source.w, source.h, AVAILABLE_WIDTH)
      const cover = usedFixedFrameCoverBox(
        source.w,
        source.h,
        AVAILABLE_WIDTH,
        ANNOTATION_PENDING_PREVIEW_FRAME.height,
      )
      assert.equal(box.crops, false)
      assert.equal(box.distorts, false)
      assert.ok(Math.abs(box.usedAspect - box.sourceAspect) < 1e-9)
      assert.ok(box.usedWidth <= AVAILABLE_WIDTH + 1e-9)
      assert.ok(box.usedHeight <= ANNOTATION_PENDING_PREVIEW_FRAME.height + 1e-9)
      assert.equal(cover.crops, true)
    })
  }
})

describe('PHOTO-001 annotation presentation styles', () => {
  it('pending preview is contain-equivalent, not cover', () => {
    assert.equal(isPendingPreviewContainPhotoStyle(ANNOTATION_PENDING_PREVIEW_IMG_STYLE), true)
    assert.equal(isContainEquivalentPhotoStyle(ANNOTATION_PENDING_PREVIEW_IMG_STYLE), true)
    assert.equal(photoStyleCrops(ANNOTATION_PENDING_PREVIEW_IMG_STYLE), false)
    assert.equal(ANNOTATION_PENDING_PREVIEW_IMG_STYLE.objectFit, 'contain')
    assert.equal(photoStyleCrops({ objectFit: 'cover' }), true)
  })

  it('88x88 and 72x72 thumbs are contain-equivalent inside the existing frames', () => {
    assert.equal(
      isFixedFrameContainPhotoStyle(
        ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE,
        ANNOTATION_PHOTO_CARD_THUMB_FRAME,
      ),
      true,
    )
    assert.equal(
      isFixedFrameContainPhotoStyle(
        ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE,
        ANNOTATION_SAVED_LIST_THUMB_FRAME,
      ),
      true,
    )
    assert.equal(ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE.width, 88)
    assert.equal(ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE.height, 88)
    assert.equal(ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE.width, 72)
    assert.equal(ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE.height, 72)
  })

  it('annotation components wire the shared PHOTO-001 helper, not independent inline fits', () => {
    assert.match(pendingSrc, /from '@\/lib\/photo-workspace\/photo-001-no-crop'/)
    assert.match(cardSrc, /from '@\/lib\/photo-workspace\/photo-001-no-crop'/)
    assert.match(savedSrc, /from '@\/lib\/photo-workspace\/photo-001-no-crop'/)
    assert.match(pendingSrc, /ANNOTATION_PENDING_PREVIEW_IMG_STYLE/)
    assert.match(cardSrc, /ANNOTATION_PHOTO_CARD_THUMB_IMG_STYLE/)
    assert.match(savedSrc, /ANNOTATION_SAVED_LIST_THUMB_IMG_STYLE/)
    assert.doesNotMatch(pendingSrc, /objectFit:\s*'cover'|objectFit:\s*'fill'/)
    assert.doesNotMatch(cardSrc, /objectFit:\s*'cover'|objectFit:\s*'fill'/)
    assert.doesNotMatch(savedSrc, /objectFit:\s*'cover'|objectFit:\s*'fill'/)
    assert.equal(sourceAssignsCropFit(pendingSrc), false)
    assert.equal(sourceAssignsCropFit(cardSrc), false)
    assert.equal(sourceAssignsCropFit(savedSrc), false)
  })
})

describe('PHOTO-001 repository crop-assignment guard', () => {
  it('registered user-photo JSX/layout surfaces do not assign cover/crop-to-fill', () => {
    for (const rel of PHOTO_001_CROP_SCAN_SURFACES) {
      const source = readRepo(rel)
      assert.equal(sourceAssignsCropFit(source), false, `${rel} assigns a crop fit`)
    }
  })

  it('setup cover export remains contain-equivalent', () => {
    assert.equal(isContainEquivalentPhotoStyle(SETUP_COVER_PREVIEW_IMG_STYLE), true)
    assert.equal(photoStyleCrops(SETUP_COVER_PREVIEW_IMG_STYLE), false)
  })

  it('annotation editor user photo is contain-fit; overlay box stays source-aspect', () => {
    assert.match(editorSrc, /annotationEditorUserPhotoStyle/)
    assert.match(editorSrc, /from '@\/lib\/photo-workspace\/photo-001-no-crop'/)
    assert.match(editorSrc, /fitContain/)
    assert.doesNotMatch(editorSrc, /objectFit:\s*'fill'/)
    assert.doesNotMatch(editorSrc, /objectFit:\s*'cover'/)
    const style = annotationEditorUserPhotoStyle({ x: 11, y: 0, w: 66, h: 88 })
    assert.equal(style.objectFit, 'contain')
    assert.equal(isContainEquivalentPhotoStyle(style), true)
    assert.equal(photoStyleCrops(style), false)
    assert.equal(style.left, 11)
    assert.equal(style.top, 0)
    assert.equal(style.width, 66)
    assert.equal(style.height, 88)
    const sources = [PORTRAIT, LANDSCAPE, SQUARE]
    const stages = [
      { w: 390, h: 640 },
      { w: 800, h: 400 },
      { w: 88, h: 88 },
    ]
    for (const source of sources) {
      for (const stage of stages) {
        const box = usedFixedFrameContainBox(source.w, source.h, stage.w, stage.h)
        assert.equal(box.crops, false)
        assert.equal(box.distorts, false)
        assert.ok(Math.abs(box.usedAspect - box.sourceAspect) < 1e-9)
      }
    }
  })

  it('landing decorative cover is allowlisted and is not a PHOTO-001 owning surface', () => {
    assert.match(landingSrc, /objectFit:\s*'cover'/)
    assert.equal(
      PHOTO_001_DECORATIVE_CROP_ALLOWLIST.some((entry) => entry.path === 'app/page.tsx'),
      true,
    )
    assert.ok(!PHOTO_001_OWNING_SURFACES.includes('app/page.tsx'))
    assert.ok(!PHOTO_001_OWNING_SURFACES.includes('app/landing-feature-strip.tsx'))
  })

  it('fails when a new unapproved crop/fill appears outside the decorative allowlist', () => {
    const hits = unallowlistedCropOrFillHits()
    assert.deepEqual(hits, [], `unapproved crop/fill in: ${hits.join(', ')}`)
    const allowlisted = PHOTO_001_DECORATIVE_CROP_ALLOWLIST.map((entry) => entry.path)
    for (const rel of allowlisted) {
      assert.equal(sourceAssignsCropFit(readRepo(rel)), true, `${rel} allowlist entry no longer crops`)
    }
  })
})
