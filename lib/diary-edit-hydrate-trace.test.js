import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  beginViewerMediaRequest,
  beginWorkbenchHydrateRequest,
  readEditHydrateInFlight,
} from './diary-edit-hydrate-trace.js'

describe('temporary edit hydrate in-flight trace', () => {
  it('counts workbench and viewer requests independently until released', () => {
    assert.deepEqual(readEditHydrateInFlight(), {
      staleWorkbenchRequests: 0,
      viewerMediaInFlight: 0,
    })
    const releaseWorkbench = beginWorkbenchHydrateRequest()
    const releaseViewer = beginViewerMediaRequest()
    assert.deepEqual(readEditHydrateInFlight(), {
      staleWorkbenchRequests: 1,
      viewerMediaInFlight: 1,
    })
    releaseWorkbench()
    releaseWorkbench()
    assert.deepEqual(readEditHydrateInFlight(), {
      staleWorkbenchRequests: 0,
      viewerMediaInFlight: 1,
    })
    releaseViewer()
    assert.deepEqual(readEditHydrateInFlight(), {
      staleWorkbenchRequests: 0,
      viewerMediaInFlight: 0,
    })
  })
})
