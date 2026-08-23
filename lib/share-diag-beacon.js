/**
 * TEMPORARY — Android Web Share diagnostic beacon (dev only).
 * POSTs JSON to /api/share-diag so values appear in the Next.js terminal.
 * Remove after user-activation hypothesis is confirmed.
 *
 * Always attempts the POST from the browser. The API route no-ops in production.
 * Do not gate on process.env.NODE_ENV here — client inlining can silence beacons.
 */

const ENDPOINT_PATH = '/api/share-diag'

/** @param {string} stage @param {Record<string, unknown>} payload */
export function emitShareDiag(stage, payload = {}) {
  if (typeof window === 'undefined') return

  const body = {
    stage,
    at: new Date().toISOString(),
    href: typeof window.location?.href === 'string' ? window.location.href : null,
    ...payload,
  }

  const url = `${window.location.origin}${ENDPOINT_PATH}`
  const json = JSON.stringify(body)

  try {
    // Prefer sendBeacon so the request survives long PDF work / navigation.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' })
      const queued = navigator.sendBeacon(url, blob)
      if (queued) return
    }
  } catch {
    // Fall through to fetch.
  }

  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {})
  } catch {
    // Diagnostic only — never block Share.
  }
}
