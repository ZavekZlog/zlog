/**
 * Unit 2 — Viewer preload and the shell dynamic loader share one Workbench import.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWorkbenchModuleLoader } from './diary-workbench-module.js'

const root = join(import.meta.dirname, '..')
const loaderSrc = readFileSync(join(root, 'lib/diary-workbench-module.js'), 'utf8')
const viewerSrc = readFileSync(
  join(root, 'components/site-diary/SavedDiaryViewerSurface.jsx'),
  'utf8',
)
const shellSrc = readFileSync(
  join(root, 'components/site-diary/SiteDiaryReportShell.jsx'),
  'utf8',
)

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('shared Workbench module promise', () => {
  it('shares one pending import and reuses the resolved module', async () => {
    const gate = deferred()
    let starts = 0
    const load = createWorkbenchModuleLoader(() => {
      starts += 1
      return gate.promise
    })
    const first = load()
    const second = load()
    assert.equal(first, second)
    assert.equal(starts, 1)
    const loaded = { default: function Workbench() {} }
    gate.resolve(loaded)
    assert.equal(await first, loaded)
    assert.equal(await load(), loaded)
    assert.equal(starts, 1)
  })

  it('clears a rejected import so the next request can retry', async () => {
    const modules = [{ default: function Retry() {} }]
    const calls = []
    const load = createWorkbenchModuleLoader(() => {
      const next = calls.length === 0
        ? Promise.reject(new Error('import failed'))
        : Promise.resolve(modules[0])
      calls.push(next)
      return next
    })
    await assert.rejects(load(), /import failed/)
    assert.equal(calls.length, 1)
    const retried = load()
    assert.notEqual(retried, calls[0])
    assert.equal(await retried, modules[0])
    assert.equal(calls.length, 2)
    assert.equal(await load(), modules[0])
    assert.equal(calls.length, 2)
  })
})

describe('Workbench import authority', () => {
  it('keeps one import expression in the loader', () => {
    const imports = loaderSrc.match(
      /import\(['"]@\/components\/site-diary\/SiteDiaryWorkbenchSurface['"]\)/g,
    )
    assert.deepEqual(imports, [
      "import('@/components/site-diary/SiteDiaryWorkbenchSurface')",
    ])
    assert.match(loaderSrc, /export function loadSiteDiaryWorkbenchSurface/)
  })

  it('keeps Viewer preload background and non-blocking', () => {
    assert.match(viewerSrc, /void loadSiteDiaryWorkbenchSurface\(\)\.catch\(\(\) => \{\}\)/)
    assert.doesNotMatch(viewerSrc, /await loadSiteDiaryWorkbenchSurface/)
    assert.doesNotMatch(viewerSrc, /edit-navigation-workbench-import-/)
    assert.doesNotMatch(
      viewerSrc,
      /import\(['"][^'"]*SiteDiaryWorkbenchSurface['"]\)/,
    )
  })

  it('keeps the shell dynamic loader on the shared promise', () => {
    const workbenchDynamic = shellSrc.slice(
      shellSrc.indexOf('SiteDiaryWorkbenchSurface = dynamic'),
      shellSrc.indexOf('export function isSavedDiaryViewerDiaryPath'),
    )
    const importStart = workbenchDynamic.indexOf('edit-navigation-workbench-import-start')
    const sharedCall = workbenchDynamic.indexOf('loadSiteDiaryWorkbenchSurface()')
    const importResolved = workbenchDynamic.indexOf('edit-navigation-workbench-import-resolved')
    assert.ok(importStart >= 0 && importStart < sharedCall && sharedCall < importResolved)
    assert.match(workbenchDynamic, /return pending/)
    assert.match(workbenchDynamic, /ssr:\s*false/)
    assert.match(workbenchDynamic, /loading:\s*WorkbenchOpeningShell/)
    assert.match(shellSrc, /Opening diary for editing…/)
    assert.match(shellSrc, /edit-navigation-route-committed/)
    assert.doesNotMatch(
      shellSrc,
      /import\(['"][^'"]*SiteDiaryWorkbenchSurface['"]\)/,
    )
    assert.match(shellSrc, /function isSavedDiaryViewerDiaryPath/)
    assert.match(shellSrc, /function isSiteDiaryWorkbenchDiaryPath/)
  })
})
