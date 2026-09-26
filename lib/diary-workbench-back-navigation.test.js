import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runDiaryWorkbenchBackNavigation } from './diary-workbench-back-navigation.js'
import { createDiaryAutosaveOperationQueue } from './diary-autosave.js'

const root = join(import.meta.dirname, '..')
const workbenchSource = readFileSync(
  join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('Defect #5 — Workbench Back persistence boundary', () => {
  it('issues dirty work before allowing Back navigation', async () => {
    const write = deferred()
    const events = []
    let dirty = true

    const pendingBack = runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      beginNavigation: () => events.push('begin'),
      endNavigation: () => events.push('end'),
      flushPendingAutosave: async () => {
        events.push('flush')
        await write.promise
        dirty = false
      },
      isPayloadDirty: () => dirty,
      navigate: () => events.push('navigate'),
    })

    await Promise.resolve()
    assert.deepEqual(events, ['begin', 'flush'])

    write.resolve()
    const result = await pendingBack

    assert.equal(result.status, 'navigated-after-persistence')
    assert.deepEqual(events, ['begin', 'flush', 'navigate'])
  })

  it('waits for an already-active S2 write and navigates after it makes the payload clean', async () => {
    const write = deferred()
    let dirty = true
    let navigated = false
    const pendingBack = runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      flushPendingAutosave: async () => {
        await write.promise
        dirty = false
      },
      isPayloadDirty: () => dirty,
      navigate: () => {
        navigated = true
      },
    })

    await Promise.resolve()
    assert.equal(navigated, false)
    write.resolve()
    const result = await pendingBack

    assert.equal(result.status, 'navigated-after-persistence')
    assert.equal(navigated, true)
  })

  it('blocks Back while explicit final persistence is active', async () => {
    let navigated = false
    const result = await runDiaryWorkbenchBackNavigation({
      explicitPersistenceActive: true,
      navigate: () => {
        navigated = true
      },
    })

    assert.equal(result.status, 'blocked-explicit-persistence')
    assert.equal(navigated, false)
  })

  it('does not navigate when explicit persistence starts during a Back flush', async () => {
    let explicitPersistenceActive = false
    let navigated = false
    const result = await runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      flushPendingAutosave: async () => {
        explicitPersistenceActive = true
      },
      isExplicitPersistenceActive: () => explicitPersistenceActive,
      isPayloadDirty: () => false,
      navigate: () => {
        navigated = true
      },
    })

    assert.equal(result.status, 'blocked-explicit-persistence')
    assert.equal(navigated, false)
  })

  it('does not navigate when required persistence fails or remains dirty', async () => {
    let navigated = false
    const result = await runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      flushPendingAutosave: async () => {},
      isPayloadDirty: () => true,
      navigate: () => {
        navigated = true
      },
    })

    assert.equal(result.status, 'blocked-persistence-incomplete')
    assert.equal(navigated, false)
  })

  it('preserves immediate Back when no persistence is required', async () => {
    let navigated = false
    const result = await runDiaryWorkbenchBackNavigation({
      payloadDirty: false,
      navigate: () => {
        navigated = true
      },
    })

    assert.equal(result.status, 'navigated-clean')
    assert.equal(navigated, true)
  })

  it('rejects a second dirty Back while the first owns the flush and navigation sequence', async () => {
    const write = deferred()
    let navigationInFlight = false
    let dirty = true
    let flushCalls = 0
    let navigations = 0
    const invokeBack = () => runDiaryWorkbenchBackNavigation({
      navigationInFlight,
      payloadDirty: dirty,
      beginNavigation: () => {
        navigationInFlight = true
      },
      endNavigation: () => {
        navigationInFlight = false
      },
      flushPendingAutosave: async () => {
        flushCalls += 1
        await write.promise
        dirty = false
      },
      isPayloadDirty: () => dirty,
      navigate: () => {
        navigations += 1
      },
    })

    const first = invokeBack()
    const second = await invokeBack()
    assert.equal(second.status, 'blocked-navigation-in-flight')
    assert.equal(flushCalls, 1)

    write.resolve()
    assert.equal((await first).status, 'navigated-after-persistence')
    assert.equal(navigations, 1)
  })

  it('wires the local Workbench Back handler without changing shared Back', () => {
    assert.match(workbenchSource, /const handleWorkbenchBack = async \(event\)/)
    assert.match(workbenchSource, /runDiaryWorkbenchBackNavigation\(\{/)
    assert.match(workbenchSource, /onBack=\{handleWorkbenchBack\}/)
    assert.doesNotMatch(workbenchSource, /lastIssuedAutosaveMutationRevisionRef/)
  })

  it('waits for queued S2 behind S1 before navigating', async () => {
    const queue = createDiaryAutosaveOperationQueue()
    const owner = { reportId: 'report-a', projectId: 'project-a', generation: 1 }
    const s1Write = deferred()
    const events = []
    let dirty = true

    queue.setActive(owner)
    const lane = queue.enqueue({
      owner,
      payload: { weather: 'S1' },
      execute: async () => {
        events.push('S1-start')
        await s1Write.promise
        events.push('S1-finish')
        return { ok: true }
      },
      commit: () => {},
    })
    queue.enqueue({
      owner,
      payload: { weather: 'S2' },
      execute: async () => {
        events.push('S2-write')
        dirty = false
        return { ok: true }
      },
      commit: () => {},
    })

    const pendingBack = runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      flushPendingAutosave: async () => {
        events.push('flush')
        queue.enqueue({
          owner,
          payload: { weather: 'S2' },
          execute: async () => {
            events.push('S2-write')
            dirty = false
            return { ok: true }
          },
          commit: () => {},
        })
        await queue.waitFor(owner)
      },
      isPayloadDirty: () => dirty,
      navigate: () => {
        events.push('navigate')
        queue.clearActive(owner)
      },
    })

    await Promise.resolve()
    s1Write.resolve()
    await lane
    await pendingBack

    assert.deepEqual(events, ['S1-start', 'flush', 'S1-finish', 'S2-write', 'navigate'])
    assert.equal(dirty, false)
  })

  it('does not navigate when an executing S2 settles stale without writing', async () => {
    const staleResult = deferred()
    let dirty = true
    let navigations = 0

    const pendingBack = runDiaryWorkbenchBackNavigation({
      payloadDirty: true,
      flushPendingAutosave: async () => {
        await staleResult.promise
      },
      isPayloadDirty: () => dirty,
      navigate: () => {
        navigations += 1
      },
    })

    staleResult.resolve({ ok: false, reason: 'stale', wrote: false })
    const result = await pendingBack

    assert.equal(result.status, 'blocked-persistence-incomplete')
    assert.equal(dirty, true)
    assert.equal(navigations, 0)
  })

  it('releases the Back guard after persistence failure so the user can retry', async () => {
    let navigationInFlight = false
    let attempts = 0
    let dirty = true
    let navigations = 0
    const invokeBack = () => runDiaryWorkbenchBackNavigation({
      navigationInFlight,
      payloadDirty: dirty,
      beginNavigation: () => {
        navigationInFlight = true
      },
      endNavigation: () => {
        navigationInFlight = false
      },
      flushPendingAutosave: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('offline')
        dirty = false
      },
      isPayloadDirty: () => dirty,
      navigate: () => {
        navigations += 1
      },
    })

    assert.equal((await invokeBack()).status, 'blocked-persistence-failed')
    assert.equal(navigationInFlight, false)
    assert.equal((await invokeBack()).status, 'navigated-after-persistence')
    assert.equal(attempts, 2)
    assert.equal(navigations, 1)
  })

  it('allows only one router navigation from two rapid clean Back activations', async () => {
    let navigationInFlight = false
    let navigations = 0
    const invokeBack = () => runDiaryWorkbenchBackNavigation({
      navigationInFlight,
      payloadDirty: false,
      beginNavigation: () => {
        navigationInFlight = true
      },
      endNavigation: () => {
        navigationInFlight = false
      },
      navigate: () => {
        navigations += 1
      },
    })

    const first = invokeBack()
    const second = invokeBack()
    const [firstResult, secondResult] = await Promise.all([first, second])

    assert.equal(firstResult.status, 'navigated-clean')
    assert.equal(secondResult.status, 'blocked-navigation-in-flight')
    assert.equal(navigations, 1)
  })
})
