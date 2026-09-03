/**
 * Phase E — durable Save Area persistence for Site Diary photo areas.
 * Phase F2A — independent new photos persist with bounded concurrency (max 2).
 *
 * Reuses Phase C prepared report + thumbnail upload and report_photos metadata.
 * Idempotent per stable photo id + deterministic storage path.
 */

import { flattenAreaGroups, encodeAreaNotesCategory } from '../ai-annotation/area-groups.js'
import { mapWithConcurrency } from '../diary-pdf-photos.js'
import { hasAnnotations } from '../photo-annotations/model.js'
import { SHADOW_PREPARE_STATUS } from './shadow-ingest.js'
import {
  LIVE_REPORT_PHOTOS,
  isMissingPreparedAssetColumnError,
  omitPreparedAssetColumns,
  pickLiveColumns,
} from '../live-diary-schema.js'
import {
  ensurePreparedPhotoAssets,
  uploadPreparedPhotoAssets,
  buildPreparedPhotoRecordFields,
  preparedReportStoragePath,
  persistedWorkPhotoRotationDegrees,
} from './persist-prepared-photo.js'

export const SAVE_AREA_PERSIST_LOG = '[zlog:save-area-persist]'

/** Mobile-safe bound — same ceiling as PDF / shadow ingest. Never unbounded. */
export const SAVE_AREA_PERSIST_CONCURRENCY = 2

export const SAVE_AREA_PERSIST_FAIL_MESSAGE =
  'We couldn’t save this photo area yet. Check your connection and tap Save Area again.'

const UPDATE_COLUMNS = LIVE_REPORT_PHOTOS.columns.filter(
  (c) => c !== 'id' && c !== 'owner_id' && c !== 'report_id' && c !== 'url' && c !== 'created_at',
)

/**
 * @param {object} photo
 * @param {string} userId
 * @param {string} reportId
 */
export function photoRowNeedsPreparedUpload(photo, userId, reportId) {
  if (persistedWorkPhotoRotationDegrees(photo) !== 0) return true
  if (photo?.file instanceof Blob) return true
  const path = String(photo?.storagePath || photo?.imageUrl || '').trim()
  if (!path) return true
  const expected = preparedReportStoragePath(userId, reportId, photo.key || photo.id)
  return Boolean(expected) && path !== expected
}

/**
 * Merge durable storage metadata back onto an in-memory area photo.
 * @param {object} photo
 * @param {{
 *   reportPath: string,
 *   thumbnailPath?: string|null,
 *   reportWidth?: number|null,
 *   reportHeight?: number|null,
 *   thumbnailWidth?: number|null,
 *   thumbnailHeight?: number|null,
 *   reportByteSize?: number|null,
 *   thumbnailByteSize?: number|null,
 *   pipelineId?: string|null,
 * }} uploaded
 */
export function applyPreparedPersistToAreaPhoto(photo, uploaded) {
  return {
    ...photo,
    file: null,
    imageUrl: uploaded.reportPath,
    storagePath: uploaded.reportPath,
    thumbnailPath: uploaded.thumbnailPath || null,
    reportWidth: uploaded.reportWidth ?? null,
    reportHeight: uploaded.reportHeight ?? null,
    thumbnailWidth: uploaded.thumbnailWidth ?? null,
    thumbnailHeight: uploaded.thumbnailHeight ?? null,
    reportByteSize: uploaded.reportByteSize ?? null,
    thumbnailByteSize: uploaded.thumbnailByteSize ?? null,
    processingVersion: uploaded.pipelineId || photo.processingVersion || null,
    rotationDegrees: 0,
    saveState: 'linked_to_group',
  }
}

function buildRecordFields({
  uploaded,
  photo,
  reportId,
  userId,
  sequence,
  areaName,
  category,
}) {
  const annotationPayload = hasAnnotations(photo.annotations) ? photo.annotations : null
  return {
    report_id: reportId,
    owner_id: userId,
    url: uploaded.reportPath,
    ...buildPreparedPhotoRecordFields(uploaded),
    caption: String(photo.caption || photo.description || photo.acceptedDescription || '').trim() || null,
    sequence,
    layout: photo.layout || 'grid4',
    location: areaName || null,
    category: category || null,
    rotation_degrees: 0,
    assigned_to: String(photo.assignedTo || photo.assigned_to || '').trim() || null,
    // annotations / overlay_path may be absent on live — pickLiveColumns strips unknown keys.
    annotations: annotationPayload,
    overlay_path: photo.overlayPath || null,
  }
}

async function findPhotoRowByUrl(supabase, reportId, url) {
  const { data, error } = await supabase
    .from(LIVE_REPORT_PHOTOS.table)
    .select('id, url')
    .eq('report_id', reportId)
    .eq('url', url)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function upsertPreparedPhotoRow(supabase, record) {
  const existing = await findPhotoRowByUrl(supabase, record.report_id, record.url)
  const columnList = LIVE_REPORT_PHOTOS.columns.filter((c) => c !== 'id')
  let row = pickLiveColumns(record, columnList)

  if (existing?.id) {
    const fields = pickLiveColumns(record, UPDATE_COLUMNS)
    let { error } = await supabase
      .from(LIVE_REPORT_PHOTOS.table)
      .update(fields)
      .eq('id', existing.id)
    if (error && isMissingPreparedAssetColumnError(error)) {
      const retry = await supabase
        .from(LIVE_REPORT_PHOTOS.table)
        .update(omitPreparedAssetColumns(fields))
        .eq('id', existing.id)
      error = retry.error
    }
    if (error) throw error
    return { action: 'updated', id: existing.id }
  }

  let { error: insertError } = await supabase.from(LIVE_REPORT_PHOTOS.table).insert([row])
  if (insertError && isMissingPreparedAssetColumnError(insertError)) {
    row = omitPreparedAssetColumns(row)
    const retry = await supabase.from(LIVE_REPORT_PHOTOS.table).insert([row])
    insertError = retry.error
  }
  if (insertError) throw insertError
  return { action: 'inserted' }
}

/**
 * Persist one flattened photo row for Save Area.
 * @param {object} supabase
 * @param {{
 *   userId: string,
 *   reportId: string,
 *   photo: object,
 *   areaName: string,
 *   category: string|null,
 *   prepareFn?: Function,
 * }} args
 */
export async function persistSaveAreaPhotoRow(supabase, args = {}) {
  const {
    userId,
    reportId,
    photo,
    areaName,
    category = null,
    prepareFn,
  } = args

  const photoId = photo.key || photo.id
  const expectedPath = preparedReportStoragePath(userId, reportId, photoId)
  if (!expectedPath) {
    return { ok: false, reason: 'invalid-photo-id' }
  }

  let uploaded
  let preparedAssets = null
  if (photoRowNeedsPreparedUpload(photo, userId, reportId)) {
    const prepared = await ensurePreparedPhotoAssets(photo, { prepareFn })
    if (!prepared.ok) {
      return {
        ok: false,
        reason: prepared.reason || 'prepare-failed',
        error: prepared.error || null,
      }
    }
    preparedAssets = prepared
    try {
      uploaded = await uploadPreparedPhotoAssets(supabase, {
        userId,
        reportId,
        photoId,
        reportBlob: prepared.report.blob,
        thumbnailBlob: prepared.thumbnail?.blob || null,
        reportMeta: prepared.report,
        thumbnailMeta: prepared.thumbnail || {},
        pipelineId: prepared.pipelineId,
      })
    } catch (err) {
      return { ok: false, reason: 'upload-failed', error: err }
    }
  } else {
    uploaded = {
      reportPath: String(photo.storagePath || photo.imageUrl || expectedPath).trim(),
      thumbnailPath: photo.thumbnailPath || photo.thumbnail_path || null,
      pipelineId: photo.processingVersion || photo.processing_version || null,
      reportWidth: photo.reportWidth ?? photo.report_width ?? null,
      reportHeight: photo.reportHeight ?? photo.report_height ?? null,
      thumbnailWidth: photo.thumbnailWidth ?? photo.thumbnail_width ?? null,
      thumbnailHeight: photo.thumbnailHeight ?? photo.thumbnail_height ?? null,
      reportByteSize: photo.reportByteSize ?? photo.report_byte_size ?? null,
      thumbnailByteSize: photo.thumbnailByteSize ?? photo.thumbnail_byte_size ?? null,
      thumbFailed: false,
    }
  }

  const record = buildRecordFields({
    uploaded,
    photo,
    reportId,
    userId,
    sequence: photo.sequence_number || photo.sequence,
    areaName,
    category,
  })

  try {
    const upsert = await upsertPreparedPhotoRow(supabase, record)
    return {
      ok: true,
      uploaded,
      upsert,
      areaPhoto: applyPreparedPersistToAreaPhoto(
        {
          id: photoId,
          acceptedDescription: photo.caption || photo.description || '',
          assignedTo: photo.assignedTo || '',
          annotations: photo.annotations || null,
          overlayPath: photo.overlayPath || null,
          rotationDegrees: 0,
          preview: photo.preview || null,
          shadowPrepare: preparedAssets?.ok
            ? {
              status: SHADOW_PREPARE_STATUS.READY,
              pipelineId: preparedAssets.pipelineId,
              report: preparedAssets.report,
              thumbnail: preparedAssets.thumbnail,
            }
            : photo.shadowPrepare,
        },
        uploaded,
      ),
    }
  } catch (err) {
    return { ok: false, reason: 'db-failed', error: err }
  }
}

/**
 * Durable Save Area for one committed area group.
 *
 * @param {object} supabase
 * @param {{
 *   userId: string,
 *   reportId: string,
 *   savedGroup: object,
 *   locationWalk: object[],
 *   prepareFn?: Function,
 * }} args
 * @returns {Promise<{ ok: boolean, locationWalk?: object[], reason?: string, error?: unknown }>}
 */
export async function persistSaveAreaGroup(supabase, args = {}) {
  const {
    userId,
    reportId,
    savedGroup,
    locationWalk = [],
    prepareFn,
  } = args

  if (!userId || !reportId || !savedGroup?.id) {
    return { ok: false, reason: 'missing-context' }
  }

  const groupId = savedGroup.id
  const sequenced = flattenAreaGroups(locationWalk)
  const rows = sequenced.filter((row) => row.areaId === groupId)
  if (rows.length === 0) {
    return { ok: false, reason: 'no-photos' }
  }

  const areaName = savedGroup.areaName || rows[0].location || ''
  const category = encodeAreaNotesCategory(savedGroup.description)
  const concurrency = Math.min(SAVE_AREA_PERSIST_CONCURRENCY, Math.max(1, rows.length))

  // Bounded concurrency across photos; each photo keeps prepare → upload → DB order.
  // Results stay indexed by input order — never completion order.
  const outcomes = await mapWithConcurrency(rows, concurrency, async (row, i) => {
    const result = await persistSaveAreaPhotoRow(supabase, {
      userId,
      reportId,
      photo: row,
      areaName,
      category,
      prepareFn,
    })
    if (!result.ok) {
      return { ok: false, row, result, index: i }
    }
    return { ok: true, row, result, index: i }
  })

  const failed = outcomes.find((outcome) => !outcome.ok)
  if (failed) {
    // Partial success: other photos may already have durable storage/DB rows.
    // Do not claim full Save Area success; leave walk unchanged so retry is safe.
    // Successful assets stay in place (deterministic paths / upsert-by-url).
    return {
      ok: false,
      reason: failed.result?.reason || 'persist-failed',
      error: failed.result?.error || null,
    }
  }

  const photoUpdates = new Map()
  for (const outcome of outcomes) {
    photoUpdates.set(outcome.row.key, outcome.result.areaPhoto)
  }

  const nextWalk = (locationWalk || []).map((group) => {
    if (group.id !== groupId) return group
    return {
      ...group,
      areaName,
      description: savedGroup.description || group.description || '',
      layout: savedGroup.layout || group.layout,
      completionState: 'saved',
      photos: (group.photos || []).map((photo) => {
        const patch = photoUpdates.get(photo.id)
        return patch ? { ...photo, ...patch, preview: photo.preview || patch.preview } : photo
      }),
    }
  })

  return { ok: true, locationWalk: nextWalk }
}
