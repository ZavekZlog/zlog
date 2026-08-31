/**
 * Site Diary Session Context — Phase 1 SHADOW ONLY.
 *
 * In-memory browser-session store. Never authoritative.
 * Must not drive UI, navigation, loading, or network.
 */

/** @typedef {Record<string, unknown>} SiteDiaryShadowSnapshot */

const SNAPSHOT_FIELD_KEYS = [
  'userId',
  'projectId',
  'reportId',
  'projectName',
  'projectStartDate',
  'projectPlannedCompletionDate',
  'projectAddress',
  'projectManager',
  'workingDaysPerWeek',
  'projectReference',
  'reportDate',
  'shift',
  'currentPhase',
  'author',
  'authorRole',
  'reportingOnBehalfOf',
  'reportingCompany',
  'brandingId',
  'brandColor',
  'logoStoragePath',
  'coverStoragePath',
]

/** Fields required for a complete comparison surface (identity + audited overlap). */
const REQUIRED_COMPARE_KEYS = SNAPSHOT_FIELD_KEYS.slice()

/** @type {Map<string, SiteDiaryShadowSnapshot>} */
const browserSessionStore = new Map()

/**
 * @param {{ userId?: unknown, projectId?: unknown, reportId?: unknown }} id
 * @returns {string|null}
 */
export function siteDiarySessionIdentityKey(id = {}) {
  const userId = normId(id.userId)
  const projectId = normId(id.projectId)
  const reportId = normId(id.reportId)
  if (!userId || !projectId || !reportId) return null
  return `${userId}::${projectId}::${reportId}`
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normId(value) {
  return String(value ?? '').trim()
}

/**
 * Empty string, null, and undefined compare as equivalent for optional text.
 * @param {unknown} value
 * @returns {string}
 */
function normText(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normNullableId(value) {
  if (value == null || value === '') return ''
  return String(value).trim()
}

/**
 * @param {SiteDiaryShadowSnapshot} snapshot
 * @returns {SiteDiaryShadowSnapshot}
 */
function cloneSnapshot(snapshot) {
  /** @type {SiteDiaryShadowSnapshot} */
  const out = {}
  for (const key of SNAPSHOT_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      out[key] = snapshot[key]
    }
  }
  return out
}

/**
 * Merge only keys genuinely present on `partial` (own enumerable).
 * Undefined values are treated as absent and do not erase retained fields.
 *
 * @param {SiteDiaryShadowSnapshot} partial
 * @returns {SiteDiaryShadowSnapshot|null}
 */
export function mergeSiteDiarySessionSnapshot(partial) {
  if (!partial || typeof partial !== 'object') return null
  const key = siteDiarySessionIdentityKey(partial)
  if (!key) return null

  const prev = browserSessionStore.get(key) || {}
  /** @type {SiteDiaryShadowSnapshot} */
  const next = cloneSnapshot(prev)

  for (const field of SNAPSHOT_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(partial, field)) continue
    const value = partial[field]
    if (value === undefined) continue
    next[field] = value
  }

  next.userId = normId(partial.userId) || normId(prev.userId)
  next.projectId = normId(partial.projectId) || normId(prev.projectId)
  next.reportId = normId(partial.reportId) || normId(prev.reportId)

  browserSessionStore.set(key, next)
  return cloneSnapshot(next)
}

/**
 * Replace/seed snapshot for identity (still merge-semantics for undefined keys).
 * Prefer mergeSiteDiarySessionSnapshot; alias kept for call-site clarity.
 *
 * @param {SiteDiaryShadowSnapshot} snapshot
 * @returns {SiteDiaryShadowSnapshot|null}
 */
export function setSiteDiarySessionSnapshot(snapshot) {
  return mergeSiteDiarySessionSnapshot(snapshot)
}

/**
 * @param {{ userId?: unknown, projectId?: unknown, reportId?: unknown }} id
 * @returns {SiteDiaryShadowSnapshot|null}
 */
export function getSiteDiarySessionSnapshot(id = {}) {
  const key = siteDiarySessionIdentityKey(id)
  if (!key) return null
  const found = browserSessionStore.get(key)
  return found ? cloneSnapshot(found) : null
}

/**
 * Removes only the entry for the given identity.
 *
 * @param {{ userId?: unknown, projectId?: unknown, reportId?: unknown }} id
 * @returns {boolean} true if an entry was removed
 */
export function clearSiteDiarySessionSnapshot(id = {}) {
  const key = siteDiarySessionIdentityKey(id)
  if (!key) return false
  return browserSessionStore.delete(key)
}

/**
 * Test helper — empty the in-memory store.
 */
export function clearAllSiteDiarySessionSnapshotsForTests() {
  browserSessionStore.clear()
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function valuesEqual(a, b) {
  // Treat null/undefined/'' as equivalent for text-like fields.
  if (a == null && b == null) return true
  if (typeof a === 'number' || typeof b === 'number') {
    return normText(a) === normText(b)
  }
  return normText(a) === normText(b) || normNullableId(a) === normNullableId(b)
}

/**
 * Compare shadow snapshot to authoritative legacy hydrate values.
 * Never throws for normal mismatch; returns a structured result.
 *
 * @param {SiteDiaryShadowSnapshot|null|undefined} shadow
 * @param {SiteDiaryShadowSnapshot|null|undefined} legacy
 * @returns {{
 *   ok: boolean,
 *   missingFields: string[],
 *   mismatchedFields: string[],
 * }}
 */
export function compareShadowToHydrate(shadow, legacy) {
  /** @type {string[]} */
  const missingFields = []
  /** @type {string[]} */
  const mismatchedFields = []

  if (!shadow || typeof shadow !== 'object') {
    return {
      ok: false,
      missingFields: REQUIRED_COMPARE_KEYS.slice(),
      mismatchedFields: [],
    }
  }
  if (!legacy || typeof legacy !== 'object') {
    return {
      ok: false,
      missingFields: [],
      mismatchedFields: ['legacy'],
    }
  }

  const shadowUser = normId(shadow.userId)
  const shadowProject = normId(shadow.projectId)
  const shadowReport = normId(shadow.reportId)
  const legacyUser = normId(legacy.userId)
  const legacyProject = normId(legacy.projectId)
  const legacyReport = normId(legacy.reportId)

  if (!shadowUser || !shadowProject || !shadowReport) {
    if (!shadowUser) missingFields.push('userId')
    if (!shadowProject) missingFields.push('projectId')
    if (!shadowReport) missingFields.push('reportId')
  }

  if (
    shadowUser !== legacyUser ||
    shadowProject !== legacyProject ||
    shadowReport !== legacyReport
  ) {
    if (shadowUser !== legacyUser) mismatchedFields.push('userId')
    if (shadowProject !== legacyProject) mismatchedFields.push('projectId')
    if (shadowReport !== legacyReport) mismatchedFields.push('reportId')
    return { ok: false, missingFields, mismatchedFields }
  }

  for (const field of REQUIRED_COMPARE_KEYS) {
    if (field === 'userId' || field === 'projectId' || field === 'reportId') {
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(shadow, field) || shadow[field] === undefined) {
      missingFields.push(field)
      continue
    }
    if (!valuesEqual(shadow[field], legacy[field])) {
      mismatchedFields.push(field)
    }
  }

  return {
    ok: missingFields.length === 0 && mismatchedFields.length === 0,
    missingFields,
    mismatchedFields,
  }
}

/**
 * Development-only console signal. Never prints field values.
 *
 * @param {{
 *   ok: boolean,
 *   missingFields?: string[],
 *   mismatchedFields?: string[],
 *   userId?: unknown,
 *   projectId?: unknown,
 *   reportId?: unknown,
 * }} result
 */
export function logSdscShadowCompare(result) {
  if (process.env.NODE_ENV === 'production') return
  const status = result?.ok ? 'PASS' : 'FAIL'
  const parts = [
    '[SDSC_SHADOW_COMPARE]',
    status,
    `userId=${normId(result?.userId) ? 'yes' : 'no'}`,
    `projectId=${normId(result?.projectId) || 'none'}`,
    `reportId=${normId(result?.reportId) || 'none'}`,
  ]
  if (result?.mismatchedFields?.length) {
    parts.push(`mismatched=${result.mismatchedFields.join(',')}`)
  }
  if (result?.missingFields?.length) {
    parts.push(`missing=${result.missingFields.join(',')}`)
  }
  console.log(parts.join(' '))
}

/**
 * Failure-isolated shadow compare + refresh from authoritative legacy values.
 * Synchronous; never throws into callers.
 *
 * @param {SiteDiaryShadowSnapshot} authoritative
 */
export function runSiteDiaryShadowSetupProof(authoritative) {
  try {
    if (!authoritative || typeof authoritative !== 'object') return
    const id = {
      userId: authoritative.userId,
      projectId: authoritative.projectId,
      reportId: authoritative.reportId,
    }
    const existing = getSiteDiarySessionSnapshot(id)
    if (existing) {
      const compared = compareShadowToHydrate(existing, authoritative)
      logSdscShadowCompare({
        ...compared,
        userId: authoritative.userId,
        projectId: authoritative.projectId,
        reportId: authoritative.reportId,
      })
    }
    mergeSiteDiarySessionSnapshot(authoritative)
  } catch {
    /* shadow isolation — legacy UI unaffected */
  }
}

/**
 * Failure-isolated workbench partial merge. Synchronous; never throws.
 *
 * @param {SiteDiaryShadowSnapshot} partial
 */
export function runSiteDiaryShadowWorkbenchMerge(partial) {
  try {
    mergeSiteDiarySessionSnapshot(partial)
  } catch {
    /* shadow isolation — legacy UI unaffected */
  }
}

export const SITE_DIARY_SHADOW_FIELD_KEYS = SNAPSHOT_FIELD_KEYS.slice()
