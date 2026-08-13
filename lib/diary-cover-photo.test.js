/**
 * Cover photo hydrate / save persistence for existing Site Diary edit.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coverPhotoStateFromSaved,
  resolveCoverPhotoPreviewUrl,
  resolveCoverPhotoUrlForSave,
} from './diary-cover-photo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryDraft = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')
const setupContinue = readFileSync(join(root, 'lib/diary-setup-continue.js'), 'utf8')

describe('existing diary loads saved Cover Photo', () => {
  it('hydrate keeps storagePath even when preview is missing', () => {
    const state = coverPhotoStateFromSaved('user/rep/cover.jpg', null)
    assert.equal(state.storagePath, 'user/rep/cover.jpg')
    assert.equal(state.file, null)
    assert.equal(state.preview, null)
  })

  it('hydrate attaches preview when available', () => {
    const state = coverPhotoStateFromSaved('user/rep/cover.jpg', 'https://signed.example/cover.jpg')
    assert.equal(state.preview, 'https://signed.example/cover.jpg')
    assert.equal(state.storagePath, 'user/rep/cover.jpg')
  })

  it('empty path clears cover', () => {
    assert.equal(coverPhotoStateFromSaved(null), null)
    assert.equal(coverPhotoStateFromSaved(''), null)
  })
})

describe('edit other fields without touching Cover Photo — save preserves path', () => {
  it('save uses storagePath from cover state', () => {
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: { file: null, preview: 'https://x', storagePath: 'path/cover.jpg' },
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: false,
      }),
      'path/cover.jpg',
    )
  })

  it('save falls back to loaded path if UI state was lost', () => {
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: null,
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: false,
      }),
      'path/cover.jpg',
    )
  })

  it('explicit remove clears cover on save', () => {
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: null,
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: true,
      }),
      null,
    )
  })
})

describe('preview URL resolution', () => {
  it('passes through absolute URLs without signing', async () => {
    const url = await resolveCoverPhotoPreviewUrl({}, 'https://cdn.example/cover.jpg')
    assert.equal(url, 'https://cdn.example/cover.jpg')
  })

  it('requests a signed URL for storage paths', async () => {
    const supabase = {
      storage: {
        from() {
          return {
            async createSignedUrl(path) {
              assert.equal(path, 'user/cover.jpg')
              return { data: { signedUrl: 'https://signed/user/cover.jpg' }, error: null }
            },
          }
        },
      },
    }
    const url = await resolveCoverPhotoPreviewUrl(supabase, 'user/cover.jpg')
    assert.equal(url, 'https://signed/user/cover.jpg')
  })
})

describe('diary page wiring — load / save / reopen contract', () => {
  it('loads cover via applyCover and never drops path when preview fails', () => {
    assert.match(diaryPage, /applyCover\(existing\.cover_photo_url\)/)
    assert.match(diaryPage, /coverPhotoStateFromSaved/)
    assert.match(diaryPage, /Always keep storagePath/)
    assert.match(diaryPage, /loadedCoverPathRef/)
    assert.match(diaryPage, /coverRemovedRef/)
  })

  it('save uses resolveCoverPhotoUrlForSave so untouched cover persists', () => {
    assert.match(diaryPage, /resolveCoverPhotoUrlForSave/)
    assert.match(diaryPage, /cover_photo_url: coverPhotoUrl/)
  })

  it('remove / replace explicitly clear or replace cover', () => {
    assert.match(diaryPage, /coverRemovedRef\.current = true/)
    assert.match(diaryPage, /Remove cover photo/)
  })
})

describe('edit setup/details screen — Cover Photo + Save and Continue', () => {
  it('edit setup hydrates cover_photo_url and shows attached Cover photo UI', () => {
    assert.match(setupPage, /cover_photo_url/)
    assert.match(setupPage, /coverPhotoStateFromSaved/)
    assert.match(setupPage, /resolveCoverPhotoPreviewUrl/)
    assert.match(setupPage, /loadedCoverPathRef/)
    assert.match(setupPage, /coverRemovedRef/)
    assert.match(setupPage, /title="Cover photo"/)
    assert.match(setupPage, /Cover photo is attached to this diary/)
    assert.match(setupPage, /editingReportId \? \(/)
  })

  it('Save and Continue preserves cover via resolveCoverPhotoUrlForSave + updateDraft', () => {
    assert.match(setupPage, /Save and Continue/)
    assert.match(setupPage, /Continue to Site Diary/)
    assert.match(setupPage, /resolveCoverPhotoUrlForSave/)
    assert.match(setupPage, /coverPhotoUrl/)
    assert.match(setupContinue, /coverPhotoUrl/)
    assert.match(diaryDraft, /patch\.cover_photo_url = fields\.coverPhotoUrl/)
  })

  it('edit journey: unrelated field edit must not force cover null without remove', () => {
    // Untouched cover with loaded path must resolve to the same path (anti-wipe).
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: { file: null, preview: 'https://signed/cover.jpg', storagePath: 'u/r/cover.jpg' },
        loadedCoverPath: 'u/r/cover.jpg',
        coverRemoved: false,
      }),
      'u/r/cover.jpg',
    )
    // Setup page must only send coverPhotoUrl when editingReportId is set.
    assert.match(setupPage, /\.\.\.\(editingReportId \? \{ coverPhotoUrl \} : \{\}\)/)
  })
})
