/**
 * Durable sign-in sheet source evidence (site-photos + daily_reports.sign_in_sheet_url).
 * Prepared upright JPEG is the canonical stored object (no crop; aspect preserved).
 */

export const SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE =
  'We could not save the sign-in sheet photo. Check your connection and try again. Your previous saved image is still on this diary if you had one.'

export const SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE =
  'We could not remove the sign-in sheet photo. Check your connection and try again.'

export const SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE =
  'Could not load the saved sign-in sheet image. Check your connection, reopen the diary, or tap Retry scan.'

/**
 * @param {string|null|undefined} dataUrl
 * @returns {Blob|null}
 */
export function dataUrlToJpegBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const [header, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/jpeg'
  if (typeof atob !== 'function') return null
  const binary = atob(body || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * @param {string} userId
 * @param {string} reportId
 * @param {number|string} generation
 */
export function signInSheetStoragePath(userId, reportId, generation) {
  const uid = String(userId || '').trim()
  const rid = String(reportId || '').trim()
  const gen = String(generation || '').trim()
  if (!uid || !rid || !gen) return null
  return `${uid}/${rid}/sign-in-sheet/${gen}.jpg`
}

/**
 * @param {object|null|undefined} report
 * @returns {string|null}
 */
export function signInSheetPathFromReport(report) {
  const raw = report?.sign_in_sheet_url
  if (raw == null || raw === '') return null
  const path = String(raw).trim()
  return path || null
}

/**
 * @param {string|null|undefined} path
 */
export function hasPersistedSignInSheetPath(path) {
  return Boolean(path && String(path).trim())
}

/**
 * @param {{ storagePath?: string|null, removed?: boolean }} args
 */
export function signInSheetSetupFieldsFromSync({ storagePath, removed = false } = {}) {
  if (removed) {
    return { signInSheetUrl: null }
  }
  const path = String(storagePath || '').trim()
  if (!path) {
    return { signInSheetUrl: null }
  }
  return { signInSheetUrl: path }
}

/**
 * @param {string|null|undefined} path
 */
export function isSafeSignInSheetCleanupPath(path) {
  const raw = String(path || '').trim()
  if (!raw) return false
  return /\/sign-in-sheet\/\d+\.jpg$/i.test(raw)
}

/**
 * @param {object} supabase
 * @param {string|null|undefined} storagePath
 */
export async function bestEffortRemoveSignInSheetObject(supabase, storagePath) {
  const path = String(storagePath || '').trim()
  if (!supabase || !path || !isSafeSignInSheetCleanupPath(path)) return
  try {
    await supabase.storage.from('site-photos').remove([path])
  } catch {
    /* ignore */
  }
}

/**
 * Upload prepared upright JPEG (does not PATCH daily_reports).
 */
export async function uploadPreparedSignInSheetEvidence(supabase, {
  userId,
  reportId,
  dataUrl,
  generation = Date.now(),
} = {}) {
  if (!supabase || !userId || !reportId || !dataUrl) {
    return { storagePath: null, preparedBlob: null, error: { message: 'missing-sign-in-sheet-upload-args' } }
  }
  const blob = dataUrlToJpegBlob(dataUrl)
  if (!blob || blob.size === 0) {
    return { storagePath: null, preparedBlob: null, error: { message: 'invalid-sign-in-sheet-data-url' } }
  }
  const storagePath = signInSheetStoragePath(userId, reportId, generation)
  if (!storagePath) {
    return { storagePath: null, preparedBlob: null, error: { message: 'invalid-sign-in-sheet-path' } }
  }
  const { error } = await supabase.storage.from('site-photos').upload(storagePath, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) return { storagePath: null, preparedBlob: blob, error }
  return { storagePath, preparedBlob: blob, error: null }
}

/**
 * Upload → PATCH sign_in_sheet_url → best-effort delete superseded object.
 * On DB failure after upload: best-effort delete new orphan; old path unchanged.
 */
export async function replacePersistedSignInSheetEvidence(
  supabase,
  updateDiarySetupFields,
  {
    userId,
    reportId,
    projectId,
    dataUrl,
    previousStoragePath = null,
    generation = Date.now(),
  } = {},
) {
  const uploaded = await uploadPreparedSignInSheetEvidence(supabase, {
    userId,
    reportId,
    dataUrl,
    generation,
  })
  if (uploaded.error || !uploaded.storagePath) {
    return {
      ok: false,
      stage: 'upload',
      storagePath: null,
      preparedBlob: uploaded.preparedBlob,
      error: uploaded.error || { message: 'sign-in-sheet-upload-failed' },
    }
  }

  const newPath = uploaded.storagePath
  try {
    await updateDiarySetupFields(supabase, {
      reportId,
      projectId,
      fields: signInSheetSetupFieldsFromSync({ storagePath: newPath }),
    })
  } catch (error) {
    await bestEffortRemoveSignInSheetObject(supabase, newPath)
    return {
      ok: false,
      stage: 'db',
      storagePath: null,
      preparedBlob: uploaded.preparedBlob,
      error,
    }
  }

  const prev = String(previousStoragePath || '').trim()
  if (prev && prev !== newPath) {
    await bestEffortRemoveSignInSheetObject(supabase, prev)
  }

  return {
    ok: true,
    stage: 'complete',
    storagePath: newPath,
    preparedBlob: uploaded.preparedBlob,
    error: null,
  }
}

/** @deprecated Use replacePersistedSignInSheetEvidence */
export const persistSignInSheetEvidence = replacePersistedSignInSheetEvidence

/**
 * PATCH sign_in_sheet_url null, then best-effort storage delete.
 */
export async function clearPersistedSignInSheetEvidence(
  supabase,
  updateDiarySetupFields,
  { reportId, projectId, storagePath } = {},
) {
  const path = String(storagePath || '').trim()
  try {
    await updateDiarySetupFields(supabase, {
      reportId,
      projectId,
      fields: signInSheetSetupFieldsFromSync({ removed: true }),
    })
  } catch (error) {
    return { ok: false, error }
  }
  if (path) await bestEffortRemoveSignInSheetObject(supabase, path)
  return { ok: true, error: null }
}

/** @deprecated Use clearPersistedSignInSheetEvidence */
export const removePersistedSignInSheetEvidence = clearPersistedSignInSheetEvidence

/**
 * @param {Blob} blob
 */
export function preparedSignInSheetFileFromBlob(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) return null
  const type = blob.type || 'image/jpeg'
  return new File([blob], 'sign-in-sheet-prepared.jpg', { type })
}
