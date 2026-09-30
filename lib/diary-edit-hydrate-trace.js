/**
 * TEMPORARY — S10 Viewer → Edit hydration trace.
 * Counts in-flight work so one Edit start can see leftovers from the previous
 * Workbench load or viewer photo-sign/PDF. Does not abort, retry, or reorder work.
 * Remove after the 12s stall is identified.
 */

let workbenchHydrateRequests = 0
let viewerMediaRequests = 0

function acquire(counter) {
  if (counter === 'workbench') workbenchHydrateRequests += 1
  else viewerMediaRequests += 1
  let released = false
  return () => {
    if (released) return
    released = true
    if (counter === 'workbench') {
      workbenchHydrateRequests = Math.max(0, workbenchHydrateRequests - 1)
    } else {
      viewerMediaRequests = Math.max(0, viewerMediaRequests - 1)
    }
  }
}

/** @returns {() => void} */
export function beginWorkbenchHydrateRequest() {
  return acquire('workbench')
}

/** @returns {() => void} */
export function beginViewerMediaRequest() {
  return acquire('viewer')
}

export function readEditHydrateInFlight() {
  return {
    staleWorkbenchRequests: workbenchHydrateRequests,
    viewerMediaInFlight: viewerMediaRequests,
  }
}
