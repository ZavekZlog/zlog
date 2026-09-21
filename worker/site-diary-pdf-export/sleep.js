/**
 * @param {number} ms
 * @param {{ shuttingDown?: boolean }} [shutdown]
 */
export function sleep(ms, shutdown = {}) {
  const delay = Math.max(0, Number(ms) || 0)
  return new Promise((resolve) => {
    if (shutdown.shuttingDown) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, delay)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  })
}
