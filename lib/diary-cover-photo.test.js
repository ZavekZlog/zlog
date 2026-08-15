/**
 * Cover photo hydrate / save persistence — unit + persistence-layer integration.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyCoverPhotoPatch,
  coverPhotoStateFromSaved,
  coverPhotoStoragePath,
  planCoverPhotoPersistence,
  resolveCoverPhotoPreviewUrl,
  resolveCoverPhotoUrlForSave,
} from './diary-cover-photo.js'
import { finalizeSiteDiarySave } from './diary-save.js'
import { buildLiveDailyReportUpdatePayload } from './live-diary-schema.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryShare = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')

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

describe('planCoverPhotoPersistence — never wipe untouched cover', () => {
  it('existing storagePath produces an explicit keep patch', () => {
    assert.deepEqual(
      planCoverPhotoPersistence({
        coverPhoto: { file: null, preview: 'https://x', storagePath: 'path/cover.jpg' },
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: false,
      }),
      {
        needsUpload: false,
        file: null,
        patch: { cover_photo_url: 'path/cover.jpg' },
      },
    )
  })

  it('falls back to loaded path if UI state was lost — still keeps patch', () => {
    assert.deepEqual(
      planCoverPhotoPersistence({
        coverPhoto: null,
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: false,
      }),
      {
        needsUpload: false,
        file: null,
        patch: { cover_photo_url: 'path/cover.jpg' },
      },
    )
  })

  it('empty UI without remove OMITS cover from the update (patch null)', () => {
    const plan = planCoverPhotoPersistence({
      coverPhoto: null,
      loadedCoverPath: null,
      coverRemoved: false,
    })
    assert.equal(plan.patch, null)
    assert.equal(plan.needsUpload, false)
  })

  it('explicit remove clears cover on save', () => {
    assert.deepEqual(
      planCoverPhotoPersistence({
        coverPhoto: null,
        loadedCoverPath: 'path/cover.jpg',
        coverRemoved: true,
      }),
      {
        needsUpload: false,
        file: null,
        patch: { cover_photo_url: null },
      },
    )
  })

  it('new file requires upload and does not invent a null wipe patch', () => {
    const file = { name: 'c.jpg', type: 'image/jpeg' }
    const plan = planCoverPhotoPersistence({
      coverPhoto: { file, preview: 'blob:1', storagePath: null },
      loadedCoverPath: null,
      coverRemoved: false,
    })
    assert.equal(plan.needsUpload, true)
    assert.equal(plan.file, file)
    assert.equal(plan.patch, null)
  })

  it('uploadedPath becomes the keep/set patch', () => {
    assert.deepEqual(
      planCoverPhotoPersistence({
        coverPhoto: { file: { name: 'c.jpg' }, preview: 'blob:1', storagePath: null },
        uploadedPath: 'u/r/cover.jpg',
      }),
      {
        needsUpload: false,
        file: null,
        patch: { cover_photo_url: 'u/r/cover.jpg' },
      },
    )
  })

  it('applyCoverPhotoPatch omits cover when plan.patch is null', () => {
    const payload = applyCoverPhotoPatch(
      { site_summary: 'Hello', cover_photo_url: null },
      { patch: null },
    )
    assert.equal(payload.site_summary, 'Hello')
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'cover_photo_url'), false)
  })

  it('buildLiveDailyReportUpdatePayload drops undefined cover but keeps explicit null remove', () => {
    const omit = buildLiveDailyReportUpdatePayload({ site_summary: 'A' })
    assert.equal(Object.prototype.hasOwnProperty.call(omit.payload, 'cover_photo_url'), false)

    const clear = buildLiveDailyReportUpdatePayload({
      site_summary: 'A',
      cover_photo_url: null,
    })
    assert.equal(Object.prototype.hasOwnProperty.call(clear.payload, 'cover_photo_url'), true)
    assert.equal(clear.payload.cover_photo_url, null)

    const keep = buildLiveDailyReportUpdatePayload({
      site_summary: 'A',
      cover_photo_url: 'u/r/cover.jpg',
    })
    assert.equal(keep.payload.cover_photo_url, 'u/r/cover.jpg')
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

describe('canonical diary workbench / PDF wiring', () => {
  it('loads cover via applyCover and plans persistence (no always-null write)', () => {
    assert.match(diaryPage, /applyCover\(editHydration\.coverStoragePath\)/)
    assert.match(diaryPage, /hydrateEditModeCoverAndReference/)
    assert.match(diaryPage, /coverPhotoStateFromSaved/)
    assert.match(diaryPage, /planCoverPhotoPersistence/)
    assert.match(diaryPage, /applyCoverPhotoPatch/)
    assert.match(diaryPage, /coverPhotoStoragePath/)
    assert.doesNotMatch(diaryPage, /cover_photo_url: coverPhotoUrl/)
  })

  it('setup has no duplicate cover-photo control or persistence path', () => {
    assert.doesNotMatch(setupPage, /Cover photo|coverPhoto|cover_photo_url/)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 1)
  })

  it('PDF prepare selects cover_photo_url', () => {
    assert.match(diaryShare, /cover_photo_url/)
    assert.match(diaryShare, /coverPhotoUrl/)
  })

  it('legacy resolveCoverPhotoUrlForSave still preserves path', () => {
    assert.equal(
      resolveCoverPhotoUrlForSave({
        coverPhoto: coverPhotoStateFromSaved('u/r/cover.jpg', 'https://signed/cover'),
        loadedCoverPath: 'u/r/cover.jpg',
        coverRemoved: false,
      }),
      'u/r/cover.jpg',
    )
  })

  it('storage path is report-scoped', () => {
    assert.equal(coverPhotoStoragePath('user-1', 'rep-9', 'png'), 'user-1/rep-9/cover.png')
  })
})

/**
 * In-memory daily_reports store — proves persist → reload → unrelated update
 * does not wipe cover_photo_url at the persistence layer.
 */
function createMemoryDiarySupabase(seedRow) {
  const row = { ...seedRow }

  return {
    row,
    auth: {
      async getUser() {
        return { data: { user: { id: row.owner_id } }, error: null }
      },
    },
    from(table) {
      if (table === 'daily_reports') {
        return {
          select() {
            return {
              eq(_col, id) {
                assert.equal(id, row.id)
                return {
                  async maybeSingle() {
                    return { data: { ...row }, error: null, status: 200, statusText: 'OK' }
                  },
                  async single() {
                    return { data: { ...row }, error: null, status: 200, statusText: 'OK' }
                  },
                }
              },
            }
          },
          update(payload) {
            Object.assign(row, payload)
            return {
              eq(col, id) {
                assert.equal(col, 'id')
                assert.equal(id, row.id)
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: { ...row },
                          error: null,
                          status: 200,
                          statusText: 'OK',
                          count: 1,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }
      // labour / plant / photos child chains (empty ok for cover tests)
      return {
        delete() {
          return {
            eq() {
              return Promise.resolve({ error: null })
            },
            in() {
              return Promise.resolve({ error: null })
            },
          }
        },
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
        insert() {
          return Promise.resolve({ error: null })
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        },
      }
    },
  }
}

describe('HARD persistence integration — cover_photo_url survives save + unrelated update', () => {
  it('create with cover → reload → same reference; unrelated update → cover unchanged', async () => {
    const reportId = 'rep-cover-1'
    const projectId = 'proj-cover-1'
    const coverPath = 'user-1/rep-cover-1/cover.jpg'
    const supabase = createMemoryDiarySupabase({
      id: reportId,
      owner_id: 'user-1',
      project_id: projectId,
      site_summary: '',
      shift: 'Day',
      actions: null,
      cover_photo_url: null,
      equipment_hire: [],
      hs_incidents: [],
      rfis: [],
      variations: [],
      report_date: '2026-08-14',
      created_at: '2026-08-14T00:00:00Z',
    })

    // C — first save with cover photo reference
    const planSet = planCoverPhotoPersistence({
      coverPhoto: { file: { name: 'cover.jpg' }, preview: 'blob:1', storagePath: null },
      uploadedPath: coverPath,
    })
    const firstPayload = applyCoverPhotoPatch(
      {
        site_summary: 'First save with cover',
        shift: 'Day',
        report_date: '2026-08-14',
        equipment_hire: [],
        hs_incidents: [],
        rfis: [],
        variations: [],
      },
      planSet,
    )
    assert.equal(firstPayload.cover_photo_url, coverPath)

    await finalizeSiteDiarySave(supabase, {
      reportId,
      projectId,
      reportPayload: firstPayload,
      labourPayload: [],
      plantPayload: [],
      keptStoragePaths: [],
      photoRecords: [],
      updateExistingPhotos: [],
    })

    assert.equal(supabase.row.cover_photo_url, coverPath, 'cover must be stored after first save')

    // Reload from persistence layer
    const reloaded = coverPhotoStateFromSaved(supabase.row.cover_photo_url, null)
    assert.equal(reloaded.storagePath, coverPath)

    // D — unrelated field update WITHOUT sending a new cover (omit key)
    const planKeep = planCoverPhotoPersistence({
      coverPhoto: reloaded,
      loadedCoverPath: coverPath,
      coverRemoved: false,
    })
    const secondPayload = applyCoverPhotoPatch(
      {
        site_summary: 'Edited summary only',
        shift: 'Day',
        report_date: '2026-08-14',
        equipment_hire: [],
        hs_incidents: [],
        rfis: [],
        variations: [],
      },
      planKeep,
    )
    assert.equal(secondPayload.cover_photo_url, coverPath)

    await finalizeSiteDiarySave(supabase, {
      reportId,
      projectId,
      reportPayload: secondPayload,
      labourPayload: [],
      plantPayload: [],
      keptStoragePaths: [],
      photoRecords: [],
      updateExistingPhotos: [],
    })

    assert.equal(
      supabase.row.cover_photo_url,
      coverPath,
      'cover must survive unrelated-field update',
    )

    // Empty UI / lost state must NOT wipe when patch is omitted
    const wipeAttempt = applyCoverPhotoPatch(
      {
        site_summary: 'Lost cover state',
        shift: 'Day',
        report_date: '2026-08-14',
        equipment_hire: [],
        hs_incidents: [],
        rfis: [],
        variations: [],
        cover_photo_url: null,
      },
      { patch: null },
    )
    assert.equal(Object.prototype.hasOwnProperty.call(wipeAttempt, 'cover_photo_url'), false)

    await finalizeSiteDiarySave(supabase, {
      reportId,
      projectId,
      reportPayload: wipeAttempt,
      labourPayload: [],
      plantPayload: [],
      keptStoragePaths: [],
      photoRecords: [],
      updateExistingPhotos: [],
    })

    assert.equal(
      supabase.row.cover_photo_url,
      coverPath,
      'omitted cover_photo_url must not null the stored reference',
    )
  })

  it('explicit remove is the only path that nulls cover_photo_url', async () => {
    const reportId = 'rep-cover-2'
    const projectId = 'proj-cover-2'
    const supabase = createMemoryDiarySupabase({
      id: reportId,
      owner_id: 'user-1',
      project_id: projectId,
      site_summary: 'Has cover',
      shift: 'Day',
      actions: null,
      cover_photo_url: 'user-1/rep-cover-2/cover.jpg',
      equipment_hire: [],
      hs_incidents: [],
      rfis: [],
      variations: [],
      report_date: '2026-08-14',
      created_at: '2026-08-14T00:00:00Z',
    })

    const removePlan = planCoverPhotoPersistence({
      coverPhoto: null,
      loadedCoverPath: 'user-1/rep-cover-2/cover.jpg',
      coverRemoved: true,
    })
    const payload = applyCoverPhotoPatch(
      {
        site_summary: 'Cover removed',
        shift: 'Day',
        report_date: '2026-08-14',
        equipment_hire: [],
        hs_incidents: [],
        rfis: [],
        variations: [],
      },
      removePlan,
    )
    assert.equal(payload.cover_photo_url, null)

    await finalizeSiteDiarySave(supabase, {
      reportId,
      projectId,
      reportPayload: payload,
      labourPayload: [],
      plantPayload: [],
      keptStoragePaths: [],
      photoRecords: [],
      updateExistingPhotos: [],
    })

    assert.equal(supabase.row.cover_photo_url, null)
  })
})
