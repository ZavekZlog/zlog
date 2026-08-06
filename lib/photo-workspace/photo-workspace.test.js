import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEvidenceGroup,
  createEvidencePhoto,
  evidenceGroupsToLocationWalk,
  getPhotoWorkspaceAdapter,
  getPhotoWorkspaceContext,
  getPhotoWorkspaceLabels,
  hasUnsavedPhotoWorkspaceDraft,
  locationWalkToEvidenceGroups,
  markGroupSavedInMemory,
  PHOTO_SAVE_STATES,
  PHOTO_UPLOAD_STATES,
  PHOTO_WORKSPACE_CONTEXTS,
} from './index.js'

describe('photo workspace contexts', () => {
  it('defines all five report types with construction labels', () => {
    for (const id of ['diary', 'survey', 'progress', 'snag', 'healthSafety']) {
      const ctx = getPhotoWorkspaceContext(id)
      assert.equal(ctx.id, id)
      assert.ok(ctx.addGroup)
      assert.ok(ctx.saveGroup)
      assert.ok(ctx.continueReport)
      assert.doesNotMatch(ctx.addGroup, /UPDATE|INSERT|report id/i)
    }
    assert.equal(Object.keys(PHOTO_WORKSPACE_CONTEXTS).length, 5)
  })

  it('diary labels use Photo Evidence and Work Area language', () => {
    const labels = getPhotoWorkspaceLabels('diary')
    assert.equal(labels.sectionTitle, 'Photo Evidence')
    assert.equal(labels.groupDescriptionLabel, 'Notes for this area')
    assert.equal(labels.addGroup, 'Add Work Area')
    assert.equal(labels.saveGroup, 'Save Area')
    assert.equal(labels.continueReport, 'No More Areas — Continue')
    assert.match(labels.areaSavedTitle, /Area saved/)
  })

  it('all report types share Photo Evidence section title', () => {
    for (const id of Object.keys(PHOTO_WORKSPACE_CONTEXTS)) {
      assert.equal(getPhotoWorkspaceContext(id).sectionTitle, 'Photo Evidence')
    }
  })
})

describe('evidence model bridge', () => {
  it('round-trips locationWalk ↔ evidence groups without losing photos', () => {
    const walk = [
      {
        id: 'area-1',
        areaName: 'Ground Floor',
        description: 'Skimming complete',
        createdAt: '2026-08-06T00:00:00.000Z',
        layout: 'grid4',
        photos: [
          {
            id: 'photo-1',
            file: null,
            preview: null,
            imageUrl: 'user/rep/1.jpg',
            acceptedDescription: 'North wall',
            annotations: null,
            overlayPreview: null,
            overlayPath: null,
            overlayDirty: false,
          },
        ],
      },
    ]

    const groups = locationWalkToEvidenceGroups(walk, {
      reportId: 'rep-1',
      reportType: 'diary',
    })
    assert.equal(groups.length, 1)
    assert.equal(groups[0].title, 'Ground Floor')
    assert.equal(groups[0].description, 'Skimming complete')
    assert.equal(groups[0].photos[0].caption, 'North wall')
    assert.equal(groups[0].photos[0].uploadState, PHOTO_UPLOAD_STATES.UPLOADED)

    const back = evidenceGroupsToLocationWalk(groups)
    assert.equal(back[0].areaName, 'Ground Floor')
    assert.equal(back[0].photos[0].imageUrl, 'user/rep/1.jpg')
    assert.equal(back[0].photos[0].acceptedDescription, 'North wall')
  })

  it('marks group photos linked after Save Area without claiming upload', () => {
    const group = createEvidenceGroup({
      title: 'Lobby',
      photos: [
        createEvidencePhoto({
          file: { name: 'a.jpg' },
          preview: 'blob:x',
          uploadState: PHOTO_UPLOAD_STATES.LOCAL_ONLY,
          saveState: PHOTO_SAVE_STATES.UNSAVED,
        }),
      ],
    })
    const saved = markGroupSavedInMemory(group)
    assert.equal(saved.completionState, 'saved')
    assert.equal(saved.photos[0].saveState, PHOTO_SAVE_STATES.LINKED_TO_GROUP)
    assert.equal(saved.photos[0].uploadState, PHOTO_UPLOAD_STATES.LOCAL_ONLY)
  })

  it('detects unsaved create-flow drafts', () => {
    assert.equal(hasUnsavedPhotoWorkspaceDraft({ phase: 'review' }), false)
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({ phase: 'create', draftPhotos: [{ id: '1' }] }),
      true,
    )
    assert.equal(
      hasUnsavedPhotoWorkspaceDraft({ phase: 'create', nameDraft: 'Lobby' }),
      true,
    )
  })
})

describe('adapters', () => {
  it('returns diary adapter by default and stubs for other types', () => {
    assert.equal(getPhotoWorkspaceAdapter('diary').reportType, 'diary')
    assert.equal(getPhotoWorkspaceAdapter('survey').reportType, 'survey')
    assert.equal(getPhotoWorkspaceAdapter('unknown').reportType, 'diary')
    assert.match(getPhotoWorkspaceAdapter('diary').persistenceNote, /Save Area/)
    assert.match(getPhotoWorkspaceAdapter('diary').persistenceNote, /Save Site Diary/)
  })
})
