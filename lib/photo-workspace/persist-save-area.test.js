/**
 * Phase E — durable Save Area persistence.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHADOW_PREPARE_STATUS } from './shadow-ingest.js'
import { ZLOG_PHOTO_PIPELINE_ID } from './image-pipeline.js'
import {
  photoRowNeedsPreparedUpload,
  applyPreparedPersistToAreaPhoto,
  persistSaveAreaPhotoRow,
  persistSaveAreaGroup,
  SAVE_AREA_PERSIST_FAIL_MESSAGE,
} from './persist-save-area.js'
import {
  preparedReportStoragePath,
  preparedThumbnailStoragePath,
} from './persist-prepared-photo.js'
import { flattenAreaGroups } from '../ai-annotation/area-groups.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const locationWalk = readFileSync(
  join(root, 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)

function readyShadow(photoId = 'photo-1') {
  return {
    id: photoId,
    file: new Blob(['raw-phone'], { type: 'image/jpeg' }),
    preview: 'blob:preview',
    acceptedDescription: 'Caption A',
    rotationDegrees: 90,
    shadowPrepare: {
      status: SHADOW_PREPARE_STATUS.READY,
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
      report: {
        blob: new Blob(['REPORT-JPEG'], { type: 'image/jpeg' }),
        width: 1800,
        height: 1200,
        byteSize: 11,
        mimeType: 'image/jpeg',
      },
      thumbnail: {
        blob: new Blob(['THUMB-JPEG'], { type: 'image/jpeg' }),
        width: 512,
        height: 341,
        byteSize: 10,
        mimeType: 'image/jpeg',
      },
    },
  }
}

function mockSupabaseForSaveArea() {
  const uploaded = []
  const rows = []
  const bucket = {
    remove(paths) {
      return Promise.resolve({ data: paths, error: null })
    },
    upload(path, blob) {
      uploaded.push({ path, blob })
      return Promise.resolve({ data: { path }, error: null })
    },
  }

  function photoTable() {
    const filters = {}
    let pendingUpdate = null
    return {
      select() { return this },
      eq(col, val) {
        filters[col] = val
        if (pendingUpdate) {
          const idx = rows.findIndex((r) => r.id === val)
          if (idx >= 0) rows[idx] = { ...rows[idx], ...pendingUpdate }
          pendingUpdate = null
          return Promise.resolve({ error: null })
        }
        return this
      },
      maybeSingle() {
        const found = rows.find((r) => (
          (filters.report_id == null || r.report_id === filters.report_id)
          && (filters.url == null || r.url === filters.url)
        ))
        return Promise.resolve({ data: found || null, error: null })
      },
      insert(records) {
        rows.push(...records.map((r) => ({ ...r, id: `row-${rows.length + 1}` })))
        return Promise.resolve({ error: null })
      },
      update(fields) {
        pendingUpdate = fields
        return this
      },
    }
  }

  return {
    uploaded,
    rows,
    storage: { from: () => bucket },
    from(table) {
      assert.equal(table, 'report_photos')
      return photoTable()
    },
  }
}

describe('Phase E Save Area persistence helpers', () => {
  it('detects when a photo still needs prepared upload', () => {
    const photo = readyShadow('abc-123')
    assert.equal(photoRowNeedsPreparedUpload(photo, 'user-1', 'rep-1'), true)
    const path = preparedReportStoragePath('user-1', 'rep-1', 'abc-123')
    assert.equal(
      photoRowNeedsPreparedUpload({
        id: 'abc-123',
        imageUrl: path,
        file: null,
      }, 'user-1', 'rep-1'),
      false,
    )
  })

  it('uses Phase C deterministic report/thumb paths', () => {
    assert.equal(
      preparedReportStoragePath('user-1', 'rep-1', 'photo-1'),
      'user-1/rep-1/photos/photo-1/report.jpg',
    )
    assert.equal(
      preparedThumbnailStoragePath('user-1', 'rep-1', 'photo-1'),
      'user-1/rep-1/photos/photo-1/thumb.jpg',
    )
  })

  it('does not persist signed URLs on the area photo', () => {
    const out = applyPreparedPersistToAreaPhoto(readyShadow(), {
      reportPath: 'user-1/rep-1/photos/photo-1/report.jpg',
      thumbnailPath: 'user-1/rep-1/photos/photo-1/thumb.jpg',
      pipelineId: ZLOG_PHOTO_PIPELINE_ID,
    })
    assert.equal(out.imageUrl, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(out.file, null)
    assert.doesNotMatch(String(out.imageUrl), /^https?:/)
  })
})

describe('Phase E persistSaveAreaPhotoRow', () => {
  it('persists caption, area name, and layout metadata', async () => {
    const supabase = mockSupabaseForSaveArea()
    const group = {
      id: 'area-1',
      areaName: 'Ground Floor',
      layout: 'full',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const out = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Ground Floor',
      category: null,
    })
    assert.equal(out.ok, true)
    assert.equal(supabase.rows.length, 1)
    assert.equal(supabase.rows[0].caption, 'Caption A')
    assert.equal(supabase.rows[0].location, 'Ground Floor')
    assert.equal(supabase.rows[0].layout, 'full')
    assert.equal(supabase.rows[0].rotation_degrees, 90)
    assert.equal(supabase.rows[0].url, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(supabase.rows[0].thumbnail_path, 'user-1/rep-1/photos/photo-1/thumb.jpg')
    assert.equal(supabase.rows[0].processing_version, ZLOG_PHOTO_PIPELINE_ID)
  })

  it('retry does not duplicate the DB row or storage assets', async () => {
    const supabase = mockSupabaseForSaveArea()
    const group = {
      id: 'area-1',
      areaName: 'Roof',
      layout: 'grid4',
      photos: [readyShadow('photo-1')],
    }
    const [row] = flattenAreaGroups([group])
    const first = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: row,
      areaName: 'Roof',
      category: null,
    })
    assert.equal(first.ok, true)
    const second = await persistSaveAreaPhotoRow(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      photo: {
        ...row,
        file: null,
        storagePath: first.uploaded.reportPath,
        imageUrl: first.uploaded.reportPath,
        thumbnailPath: first.uploaded.thumbnailPath,
      },
      areaName: 'Roof',
      category: null,
    })
    assert.equal(second.ok, true)
    assert.equal(second.upsert.action, 'updated')
    assert.equal(supabase.rows.length, 1)
    assert.equal(supabase.uploaded.filter((u) => u.path.endsWith('/report.jpg')).length, 1)
  })
})

describe('Phase E persistSaveAreaGroup', () => {
  it('durably persists a new prepared photo area and returns updated walk', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Basement',
      layout: 'grid6',
      description: '',
      photos: [readyShadow('photo-1')],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, true)
    assert.equal(out.locationWalk[0].photos[0].imageUrl, 'user-1/rep-1/photos/photo-1/report.jpg')
    assert.equal(out.locationWalk[0].photos[0].acceptedDescription, 'Caption A')
    assert.equal(out.locationWalk[0].layout, 'grid6')
    assert.equal(supabase.rows.length, 1)
  })

  it('returns failure without mutating when prepare/upload fails', async () => {
    const supabase = mockSupabaseForSaveArea()
    const walk = [{
      id: 'area-1',
      areaName: 'Basement',
      layout: 'grid4',
      photos: [{ id: 'photo-1', acceptedDescription: 'Cap' }],
    }]
    const out = await persistSaveAreaGroup(supabase, {
      userId: 'user-1',
      reportId: 'rep-1',
      savedGroup: walk[0],
      locationWalk: walk,
    })
    assert.equal(out.ok, false)
    assert.equal(supabase.rows.length, 0)
  })
})

describe('Phase E wiring contracts', () => {
  it('diary wires Save Area to durable persist helper', () => {
    assert.match(diaryPage, /persistSaveAreaGroup/)
    assert.match(diaryPage, /onAreaSaved=\{handleAreaSaved\}/)
    assert.match(diaryPage, /SAVE_AREA_PERSIST_FAIL_MESSAGE/)
  })

  it('Save Area waits for durable persist before success UI', () => {
    assert.match(locationWalk, /persistCommittedArea/)
    assert.match(locationWalk, /persistingArea/)
    assert.match(locationWalk, /finalizeAreaSave/)
  })

  it('Share path still uses prepared upload helpers for any remaining file photos', () => {
    assert.match(diaryPage, /ensurePreparedPhotoAssets/)
    assert.match(diaryPage, /uploadPreparedPhotoAssets/)
    assert.match(diaryPage, /photo\.file/)
  })

  it('failure copy is field-friendly', () => {
    assert.match(SAVE_AREA_PERSIST_FAIL_MESSAGE, /Save Area again/)
  })
})

describe('Phase E zero-photo diary reopen regression', () => {
  it('keeps capturing and persistingArea as separate useState hooks', () => {
    assert.match(locationWalk, /const \[capturing, setCapturing\] = useState\(false\)/)
    assert.match(locationWalk, /const \[persistingArea, setPersistingArea\] = useState\(false\)/)
    const captureDecl = locationWalk.indexOf('const [capturing, setCapturing] = useState(false)')
    const persistDecl = locationWalk.indexOf('const [persistingArea, setPersistingArea] = useState(false)')
    const captureRender = locationWalk.indexOf('{capturing ? (')
    assert.ok(captureDecl > 0 && captureRender > captureDecl)
    assert.ok(persistDecl > 0)
  })

  it('capture handlers still use setCapturing (not replaced by persistingArea)', () => {
    assert.match(locationWalk, /setCapturing\(true\)/)
    assert.match(locationWalk, /setCapturing\(false\)/)
    const handleFiles = locationWalk.slice(
      locationWalk.indexOf('const handleFiles'),
      locationWalk.indexOf('const applyCommittedArea'),
    )
    assert.match(handleFiles, /setCapturing\(true\)/)
    assert.match(handleFiles, /setCapturing\(false\)/)
    assert.doesNotMatch(handleFiles, /setPersistingArea/)
  })

  it('zero-photo hydrate clears locationWalk without calling Save Area persistence', () => {
    assert.deepEqual(flattenAreaGroups([]), [])
    assert.match(diaryPage, /setLocationWalk\(\[\]\)/)
    // persistSaveAreaGroup is only used inside handleAreaSaved — not diary load/hydrate.
    const loadStart = diaryPage.indexOf('loadGenerationRef')
    const handleAreaAt = diaryPage.indexOf('const handleAreaSaved')
    const firstPersistCall = diaryPage.indexOf('persistSaveAreaGroup(')
    assert.ok(handleAreaAt > 0 && firstPersistCall > handleAreaAt)
    assert.ok(loadStart > 0)
    assert.doesNotMatch(
      diaryPage.slice(0, handleAreaAt),
      /persistSaveAreaGroup\(/,
    )
  })

  it('markSessionExpired is declared before handleAreaSaved (no TDZ)', () => {
    const markAt = diaryPage.indexOf('const markSessionExpired = () =>')
    const handleAt = diaryPage.indexOf('const handleAreaSaved = useCallback')
    assert.ok(markAt > 0 && handleAt > markAt)
  })
})

describe('Phase E Save Area busy feedback + double-tap guard', () => {
  it('uses a synchronous persistingAreaRef lock separate from capturing/persistingArea state', () => {
    assert.match(locationWalk, /const persistingAreaRef = useRef\(false\)/)
    assert.match(locationWalk, /const \[capturing, setCapturing\] = useState\(false\)/)
    assert.match(locationWalk, /const \[persistingArea, setPersistingArea\] = useState\(false\)/)
  })

  it('second Save Area invocation exits immediately while the ref lock is held', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /if \(persistingAreaRef\.current\) return/)
    const lockAt = saveArea.indexOf('if (persistingAreaRef.current) return')
    const setTrueAt = saveArea.indexOf('persistingAreaRef.current = true')
    assert.ok(lockAt >= 0 && setTrueAt > lockAt)
  })

  it('first valid tap sets visible persisting state and Saving area… label', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /persistingAreaRef\.current = true/)
    assert.match(saveArea, /setPersistingArea\(true\)/)
    assert.match(locationWalk, /persistingArea \? 'Saving area…' : copy\.saveGroup/)
    assert.match(locationWalk, /disabled=\{capturing \|\| persistingArea\}/)
  })

  it('yields one paint frame before commit/persist heavy work', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(locationWalk, /yieldForSaveAreaPaint/)
    assert.match(locationWalk, /requestAnimationFrame/)
    const yieldAt = saveArea.indexOf('await yieldForSaveAreaPaint()')
    const commitAt = saveArea.indexOf('commitUnsavedPhotoAreaToWalk')
    const finalizeAt = saveArea.indexOf('finalizeAreaSave')
    assert.ok(yieldAt > 0 && commitAt > yieldAt && finalizeAt > commitAt)
  })

  it('releases busy state and ref lock after success or failure', () => {
    assert.match(locationWalk, /const releasePersistingBusy = useCallback/)
    assert.match(locationWalk, /persistingAreaRef\.current = false/)
    assert.match(locationWalk, /setPersistingArea\(false\)/)
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /finally \{\s*releasePersistingBusy\(\)/)
  })

  it('does not claim Area saved until finalizeAreaSave / applyCommittedArea', () => {
    const saveArea = locationWalk.slice(
      locationWalk.indexOf('const saveArea = async () =>'),
      locationWalk.indexOf('const commitUnsavedAreaForShare'),
    )
    assert.match(saveArea, /await finalizeAreaSave\(result\)/)
    assert.doesNotMatch(saveArea, /setPhase\('after_save'\)/)
    assert.match(locationWalk, /setPhase\('after_save'\)/)
    const applyAt = locationWalk.indexOf('const applyCommittedArea')
    const afterSaveAt = locationWalk.indexOf("setPhase('after_save')", applyAt)
    assert.ok(applyAt > 0 && afterSaveAt > applyAt)
  })
})
