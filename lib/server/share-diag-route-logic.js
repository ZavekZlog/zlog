/**
 * Share timing diagnostics — server-side gate and safe logging (Preview + local dev only).
 */

/** @typedef {Record<string, string | undefined>} ShareDiagEnv */

/**
 * Fields that may appear in Vercel Preview / dev logs. Everything else is discarded.
 * @type {ReadonlySet<string>}
 */
export const SHARE_DIAG_ALLOWED_LOG_FIELDS = new Set([
  'stage',
  'at',
  'elapsedMsSinceTap',
  'tapStartedAt',
  'elapsedMsToPdfReady',
  'blobSize',
  'fileSize',
  'blobType',
  'httpStatus',
  'ok',
  'code',
  'serverCode',
  'pollGetCallCount',
  'terminalStatus',
  'enqueueReturnedStatus',
  'fingerprintPrefix',
  'handoff',
  'fileReady',
  'nativeFileShare',
  'hasShareApi',
  'exportId',
  'reportId',
  'projectId',
  'reason',
  'parseError',
  'emptyBody',
])

/**
 * @param {ShareDiagEnv} [env]
 */
export function isShareDiagLoggingEnabled(env = process.env) {
  if (env.VERCEL_ENV === 'preview') {
    return true
  }
  if (env.NODE_ENV === 'production') {
    return false
  }
  return true
}

/**
 * @param {unknown} body
 */
export function sanitizeShareDiagPayloadForLog(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { stage: 'unknown', parseError: true }
  }

  const safe = { stage: 'unknown' }
  for (const key of SHARE_DIAG_ALLOWED_LOG_FIELDS) {
    if (key === 'stage') continue
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue
    const value = body[key]
    if (value === undefined) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value
    }
  }

  const stage = body.stage
  if (typeof stage === 'string' && stage.trim()) {
    safe.stage = stage.trim().slice(0, 160)
  }

  return safe
}

/**
 * @param {unknown} body
 * @param {(message?: unknown, ...optionalParams: unknown[]) => void} [logFn]
 */
export function logShareDiagSafely(body, logFn = console.log) {
  const safe = sanitizeShareDiagPayloadForLog(body)
  logFn(`[zlog:share-diag] ${safe.stage}`, JSON.stringify(safe))
}

/**
 * @param {string} raw
 */
export function parseShareDiagRequestBody(raw) {
  if (!raw || !String(raw).trim()) {
    return { emptyBody: true, stage: 'unknown' }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { stage: 'unknown', parseError: true }
    }
    return parsed
  } catch {
    return { stage: 'unknown', parseError: true }
  }
}
