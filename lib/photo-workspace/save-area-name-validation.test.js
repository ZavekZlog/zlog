/**
 * Save Area missing-name UX recovery — field focus + stale Share error clearing.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  commitUnsavedPhotoAreaToWalk,
  FIELD_WORK_AREA_NAME_ERROR,
  isMissingWorkAreaNamePageError,
  SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE,
  SHARE_UNSAVED_AREA_NAME_MESSAGE,
} from './commit-unsaved-area.js'
import { createAreaPhoto } from '../ai-annotation/area-groups.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const locationWalkSrc = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const photoWorkspaceSrc = readFileSync(
  join(root, 'components/photo-workspace/PhotoWorkspace.jsx'),
  'utf8',
)
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)

function draftPhoto() {
  return createAreaPhoto({
    file: { name: 'a.jpg' },
    preview: 'blob:a',
    description: '',
    rotationDegrees: 0,
  })
}

function saveAreaBlock() {
  return locationWalkSrc.slice(
    locationWalkSrc.indexOf('const saveArea = async () =>'),
    locationWalkSrc.indexOf('const commitUnsavedAreaForShare'),
  )
}

describe('missing work area name page error helper', () => {
  it('matches Share missing-name message only', () => {
    assert.equal(isMissingWorkAreaNamePageError(SHARE_UNSAVED_AREA_NAME_MESSAGE), true)
    assert.equal(isMissingWorkAreaNamePageError(FIELD_WORK_AREA_NAME_ERROR), true)
    assert.equal(isMissingWorkAreaNamePageError('We couldn’t upload the cover photo.'), false)
    assert.equal(
      isMissingWorkAreaNamePageError(
        SHARE_UNSAVED_AREA_INCOMPLETE_MESSAGE,
      ),
      false,
    )
    assert.equal(isMissingWorkAreaNamePageError(''), false)
  })
})

describe('Save Area blank-name UX (source contracts)', () => {
  it('sets nameError and returns before persistingAreaRef lock', () => {
    const block = saveAreaBlock()
    assert.match(block, /if \(!validateSave\(\)\)/)
    assert.match(block, /return/)
    const validateAt = block.indexOf('if (!validateSave())')
    const lockAt = block.indexOf('persistingAreaRef.current = true')
    assert.ok(validateAt >= 0 && lockAt > validateAt)
    assert.match(locationWalkSrc, /setNameError\(copy\.enterNameError\)/)
  })

  it('scrolls and focuses Area name when blank-name save fails', () => {
    assert.match(locationWalkSrc, /nameInputRef/)
    assert.match(locationWalkSrc, /focusAreaNameField/)
    assert.match(locationWalkSrc, /scrollIntoView/)
    const block = saveAreaBlock()
    assert.match(block, /focusAreaNameField/)
  })

  it('clears stale Share missing-name error when user enters a valid name', () => {
    assert.match(locationWalkSrc, /onAreaNameValidationResolved/)
    assert.match(photoWorkspaceSrc, /onAreaNameValidationResolved/)
    assert.match(diaryPage, /handleAreaNameValidationResolved/)
    assert.match(diaryPage, /isMissingWorkAreaNamePageError/)
    assert.match(diaryPage, /onAreaNameValidationResolved=\{handleAreaNameValidationResolved\}/)
  })

  it('does not clear unrelated page errors when resolving area name', () => {
    assert.match(diaryPage, /isMissingWorkAreaNamePageError/)
    assert.doesNotMatch(
      diaryPage.slice(
        diaryPage.indexOf('handleAreaNameValidationResolved'),
        diaryPage.indexOf('handleAreaNameValidationResolved') + 600,
      ),
      /setError\(''\)/,
    )
  })

  it('exposes accessible invalid/describedby on Area name input', () => {
    assert.match(locationWalkSrc, /aria-invalid/)
    assert.match(locationWalkSrc, /aria-describedby/)
  })
})

describe('Save Area blank-name UX (commit behaviour)', () => {
  it('blocks commit when name is blank', () => {
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: [draftPhoto()],
      nameDraft: '',
      perPageDraft: 4,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'missing-name')
  })

  it('commits when name is corrected', () => {
    const result = commitUnsavedPhotoAreaToWalk({
      phase: 'create',
      locationWalk: [],
      draftPhotos: [draftPhoto()],
      nameDraft: 'Roof',
      perPageDraft: 4,
    })
    assert.equal(result.ok, true)
    assert.equal(result.committed, true)
    assert.equal(result.locationWalk[0].areaName, 'Roof')
  })
})
