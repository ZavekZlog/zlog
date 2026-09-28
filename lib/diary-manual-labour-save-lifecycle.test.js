/**
 * Defect #8L — Manual labour Save changes completion publication.
 *
 * The durable write keeps the report id captured when Save changes starts.
 * Baseline, edit-session, and error publication follow the report lifecycle
 * revision. The single-flight saving flag always clears.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement, useLayoutEffect, useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { finalizeSiteDiarySave } from './diary-save.js'
import { labourFormToPersistRows } from './diary-save-dirty.js'
import { createEmptyLabourRow, mapLabourRowsFromDb } from './site-diary-labour-form.js'

const repoRoot = join(import.meta.dirname, '..')
const PROJECT_ID = 'project-1'
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'

const Y_DB_ROWS = Object.freeze([
  { trade: 'Electrical', count: 4, hours: 8, notes: 'Tower' },
])
const A_FORM_ROWS = Object.freeze([
  {
    key: 'a-row',
    trade: 'Carpenter',
    company: 'Harbour Co',
    headcount: '2',
    hours: '7.5',
    notes: 'Level 3',
  },
])
const A2_DB_ROWS = Object.freeze([
  { trade: 'Plumbing', count: 2, hours: 3, notes: 'Riser' },
])

let cacheDir = ''
let labourModule = null
let host = null
let root = null

function deferred() {
  let resolve
  let reject
  const promise = new Promise((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function blankRow() {
  return createEmptyLabourRow('blank')
}

function installDom() {
  function createNode(tag) {
    const node = {
      nodeType: tag === '#text' ? 3 : 1,
      nodeName: tag === '#text' ? '#text' : String(tag).toUpperCase(),
      tagName: tag === '#text' ? undefined : String(tag).toUpperCase(),
      style: {},
      childNodes: [],
      children: [],
      attributes: {},
      parentNode: null,
      ownerDocument: null,
      textContent: '',
    }
    return Object.assign(node, {
      appendChild(child) {
        child.parentNode = this
        this.childNodes.push(child)
        if (child.nodeType === 1) this.children.push(child)
        return child
      },
      removeChild(child) {
        this.childNodes = this.childNodes.filter((item) => item !== child)
        this.children = this.children.filter((item) => item !== child)
        child.parentNode = null
        return child
      },
      insertBefore(child) {
        return this.appendChild(child)
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value)
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
          ? this.attributes[name]
          : null
      },
      removeAttribute(name) {
        delete this.attributes[name]
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
      },
      addEventListener() {},
      removeEventListener() {},
      focus() {},
      blur() {},
      contains() {
        return false
      },
      getRootNode() {
        return this.ownerDocument || this
      },
    })
  }

  const document = {
    nodeType: 9,
    nodeName: '#document',
    childNodes: [],
    documentElement: null,
    body: null,
    head: null,
    defaultView: globalThis,
    createElement: (tag) => {
      const node = createNode(tag)
      node.ownerDocument = document
      return node
    },
    createElementNS: (_ns, tag) => document.createElement(tag),
    createTextNode: (text) => {
      const node = createNode('#text')
      node.ownerDocument = document
      node.textContent = String(text ?? '')
      node.nodeValue = node.textContent
      return node
    },
    createComment: (text) => document.createTextNode(text),
    addEventListener() {},
    removeEventListener() {},
  }
  const html = document.createElement('html')
  const body = document.createElement('body')
  const head = document.createElement('head')
  html.appendChild(head)
  html.appendChild(body)
  document.documentElement = html
  document.body = body
  document.head = head
  document.childNodes = [html]
  document.activeElement = body
  globalThis.document = document
  globalThis.window = globalThis
  globalThis.HTMLElement = function HTMLElement() {}
  globalThis.Element = function Element() {}
  globalThis.Node = function Node() {}
  globalThis.HTMLIFrameElement = function HTMLIFrameElement() {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return document.createElement('div')
}

function createSupabase() {
  return {
    rpc: async (name, args) => {
      globalThis.__zlogRpcCalls.push({ name, args })
      if (globalThis.__zlogPersistGate && globalThis.__zlogRpcCalls.length === 1) {
        await globalThis.__zlogPersistGate.promise
      }
      if (globalThis.__zlogPersistFail && args?.p_report_id === globalThis.__zlogFailReportId) {
        return { data: null, error: { message: 'labour-fail', code: 'fail' } }
      }
      return {
        data: {
          ok: true,
          report_id: args.p_report_id,
          project_id: args.p_project_id,
          report: {
            id: args.p_report_id,
            project_id: args.p_project_id,
            site_summary: 'saved',
          },
          labour_count: Array.isArray(args.p_labour) ? args.p_labour.length : 0,
        },
        error: null,
      }
    },
  }
}

function Harness() {
  const [, setTick] = useState(0)
  const setLabourRows = (next) => {
    globalThis.__zlogLabourRows = typeof next === 'function'
      ? next(globalThis.__zlogLabourRows)
      : next
    setTick((n) => n + 1)
  }
  const api = labourModule.useSiteDiaryLabour({
    reportDate: '2026-09-28',
    editingReportId: globalThis.__zlogReportId,
    projectId: PROJECT_ID,
    supabase: globalThis.__zlogSupabase,
    labourRows: globalThis.__zlogLabourRows,
    setLabourRows,
    lastPersistedLabourRef: globalThis.__zlogLastPersistedLabourRef,
    dismissAutosaveSuccessClaim: () => {
      globalThis.__zlogDismissCount += 1
    },
    invalidatePreparedSharePdf: () => {
      globalThis.__zlogInvalidateCount += 1
    },
    makeUuid: () => 'labour-key',
    signedUrlForPath: async () => 'https://example.test/signed',
  })
  useLayoutEffect(() => {
    globalThis.__zlogRerender = () => setTick((n) => n + 1)
    globalThis.__zlogApi = api
  })
  return null
}

function rootFiber(node) {
  const key = Object.keys(node).find((item) => item.startsWith('__reactContainer$'))
  const container = key ? node[key] : null
  if (container?.stateNode?.current) return container.stateNode.current
  if (container?.current) return container.current
  return container
}

function findHarness(fiber) {
  if (!fiber) return null
  const type = fiber.type || fiber.elementType
  if (type === Harness || type?.name === 'Harness') return fiber
  return findHarness(fiber.child) || findHarness(fiber.sibling)
}

function manualSnapshotRef() {
  let hook = findHarness(rootFiber(host))?.memoizedState
  let found = null
  while (hook) {
    const state = hook.memoizedState
    const rows = state?.current
    if (
      state
      && typeof state === 'object'
      && Array.isArray(rows)
      && rows.some((row) => row && Object.prototype.hasOwnProperty.call(row, 'headcount'))
    ) {
      found = state
    }
    hook = hook.next
  }
  return found
}

function api() {
  return globalThis.__zlogApi
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function mount(reportId, labourRows) {
  globalThis.__zlogReportId = reportId
  globalThis.__zlogLabourRows = clone(labourRows)
  host = installDom()
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(createElement(Harness))
  })
}

async function openReport(reportId, dbRows) {
  const form = mapLabourRowsFromDb(dbRows, () => `${reportId}-row`)
  const baseline = labourFormToPersistRows(form, reportId)
  await act(async () => {
    globalThis.__zlogReportId = reportId
    globalThis.__zlogLabourRows = form
    globalThis.__zlogLastPersistedLabourRef.current = baseline
    globalThis.__zlogRerender()
  })
  return { form, baseline }
}

async function replaceForm(rows) {
  await act(async () => {
    globalThis.__zlogLabourRows = clone(rows)
    globalThis.__zlogRerender()
  })
}

async function resumeEdit() {
  await act(async () => {
    api().resumeManualLabourEdit()
  })
}

async function startPendingSave() {
  globalThis.__zlogPersistFail = false
  globalThis.__zlogFailReportId = null
  globalThis.__zlogPersistGate = deferred()
  await act(async () => {
    api().saveManualLabourChanges()
    await sleep(30)
  })
}

async function settlePersist({ fail = false, reportId = null } = {}) {
  globalThis.__zlogPersistFail = fail
  globalThis.__zlogFailReportId = reportId
  await act(async () => {
    globalThis.__zlogPersistGate.resolve()
    await sleep(30)
  })
}

async function decideFinalLabourSave(reportId) {
  return finalizeSiteDiarySave(globalThis.__zlogSupabase, {
    reportId,
    projectId: PROJECT_ID,
    reportPayload: {
      site_summary: 'Updated on this diary',
    },
    labourPayload: labourFormToPersistRows(globalThis.__zlogLabourRows, reportId),
    plantPayload: [],
    keptStoragePaths: [],
    photoRecords: [],
    updateExistingPhotos: [],
    baseline: {
      reportRow: {
        id: reportId,
        project_id: PROJECT_ID,
        site_summary: 'Previous summary',
      },
      labour: globalThis.__zlogLastPersistedLabourRef.current,
      plant: [],
      photos: [],
    },
  })
}

function rpcFor(reportId) {
  return globalThis.__zlogRpcCalls.filter((call) => call.args?.p_report_id === reportId)
}

describe('Defect #8L — Manual labour save completion lifecycle', { concurrency: false }, () => {
  before(async () => {
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8l-labour')
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    const outfile = join(cacheDir, 'labour-hook.mjs')
    await build({
      stdin: {
        contents: `export { useSiteDiaryLabour } from './components/diary/useSiteDiaryLabour.js'\n`,
        resolveDir: repoRoot,
        sourcefile: 'labour-entry.js',
        loader: 'js',
      },
      bundle: true,
      outfile,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      plugins: [{
        name: 'zlog-8l-stubs',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@\/lib\/sign-in-ocr-provider$/ }, () => ({
            path: 'ocr',
            namespace: 'zlog-8l',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-evidence$/ }, () => ({
            path: 'evidence',
            namespace: 'zlog-8l',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-session-cache$/ }, () => ({
            path: 'cache',
            namespace: 'zlog-8l',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-draft$/ }, () => ({
            path: 'draft',
            namespace: 'zlog-8l',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: join(repoRoot, `${args.path.slice(2)}.js`),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8l' }, (args) => {
            const sources = {
              ocr: `
                export function resolveSignInOcrProvider() { return 'claude' }
                export function isSignInOcrApplyEnabled() { return true }
                export async function prepareSignInSheetImageForProvider() { return { dataUrl: '', imageMeta: {} } }
                export async function parseSignInSheet() { return { operatives: [] } }
              `,
              evidence: `
                export const SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE = 'save-fail'
                export const SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE = 'remove-fail'
                export const SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE = 'preview-fail'
                export function dataUrlToJpegBlob() { return null }
                export function preparedSignInSheetFileFromBlob() { return null }
                export function signInSheetPathFromReport() { return null }
                export async function clearPersistedSignInSheetEvidence() { return { ok: true } }
                export async function replacePersistedSignInSheetEvidence() { return { ok: true, storagePath: null } }
              `,
              cache: `
                export function evictSignInSheetSessionEvidence() {}
                export function rememberSignInSheetSessionEvidence() {}
                export async function loadSignInSheetPreparedEvidence() {
                  return { blob: null, cacheHit: false, networkFetchCount: 0 }
                }
              `,
              draft: 'export async function updateDiarySetupFields() { return { ok: true } }\n',
            }
            return { contents: sources[args.path], loader: 'js', resolveDir: join(repoRoot, 'lib') }
          })
        },
      }],
    })
    labourModule = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
  })

  after(async () => {
    if (root) await act(async () => root.unmount())
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    if (root) {
      await act(async () => root.unmount())
      root = null
    }
    globalThis.__zlogPersistGate = null
    globalThis.__zlogPersistFail = false
    globalThis.__zlogFailReportId = null
    globalThis.__zlogRpcCalls = []
    globalThis.__zlogDismissCount = 0
    globalThis.__zlogInvalidateCount = 0
    globalThis.__zlogSupabase = createSupabase()
    globalThis.__zlogLastPersistedLabourRef = { current: null }
    globalThis.__zlogApi = null
  })

  it('stale empty A success skips B final labour clear', async () => {
    await mount(REPORT_A, [blankRow()])
    await act(async () => {
      api().startManualLabour()
    })
    await startPendingSave()

    const aWrite = rpcFor(REPORT_A)
    assert.equal(aWrite.length, 1)
    assert.deepEqual(aWrite[0].args.p_labour, [])
    assert.equal(aWrite[0].args.p_report_id, REPORT_A)
    assert.equal(api().manualLabourSaving, true)

    const hydrated = await openReport(REPORT_B, Y_DB_ROWS)
    assert.equal(hydrated.baseline.length, 1)
    assert.equal(hydrated.baseline[0].report_id, REPORT_B)
    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, hydrated.baseline)

    await replaceForm([blankRow()])
    assert.deepEqual(labourFormToPersistRows(globalThis.__zlogLabourRows, REPORT_B), [])
    await resumeEdit()
    const bSnapshot = clone(manualSnapshotRef()?.current)
    assert.equal(api().manualLabourEditing, true)
    assert.ok(Array.isArray(bSnapshot))

    await settlePersist()

    assert.equal(api().manualLabourSaving, false)
    const decision = await decideFinalLabourSave(REPORT_B)
    const bWrite = rpcFor(REPORT_B)
    assert.equal(bWrite.length, 1)
    assert.equal(decision.skipped.labour, false)
    assert.deepEqual(
      bWrite[0].args.p_labour,
      [],
      'B final save must send the empty labour replacement',
    )
    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, hydrated.baseline)
    assert.equal(api().manualLabourEditing, true)
    assert.deepEqual(manualSnapshotRef()?.current, bSnapshot)
    assert.equal(api().manualLabourSaveError, '')
  })

  it('stale A failure does not paint the save error on B', async () => {
    await mount(REPORT_A, [blankRow()])
    await act(async () => {
      api().startManualLabour()
    })
    await startPendingSave()
    const hydrated = await openReport(REPORT_B, Y_DB_ROWS)
    await resumeEdit()
    const bSnapshot = clone(manualSnapshotRef()?.current)
    assert.equal(api().manualLabourSaveError, '')

    await settlePersist({ fail: true, reportId: REPORT_A })

    assert.equal(api().manualLabourSaveError, '')
    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, hydrated.baseline)
    assert.equal(api().manualLabourEditing, true)
    assert.deepEqual(manualSnapshotRef()?.current, bSnapshot)
    assert.equal(api().manualLabourSaving, false)
    assert.equal(rpcFor(REPORT_A)[0].args.p_report_id, REPORT_A)
  })

  it('stale A1 success does not alter the later A2 lifecycle', async () => {
    await mount(REPORT_A, A_FORM_ROWS)
    await act(async () => {
      api().startManualLabour()
    })
    await startPendingSave()
    assert.equal(rpcFor(REPORT_A)[0].args.p_report_id, REPORT_A)

    await openReport(null, [])
    const hydrated = await openReport(REPORT_A, A2_DB_ROWS)
    await resumeEdit()
    const a2Snapshot = clone(manualSnapshotRef()?.current)
    assert.equal(api().manualLabourEditing, true)
    assert.equal(hydrated.baseline[0].report_id, REPORT_A)
    assert.equal(hydrated.baseline[0].trade, 'Plumbing')

    await settlePersist()

    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, hydrated.baseline)
    assert.equal(api().manualLabourEditing, true)
    assert.deepEqual(manualSnapshotRef()?.current, a2Snapshot)
    assert.equal(api().manualLabourSaveError, '')
    assert.equal(api().manualLabourSaving, false)
  })

  it('stale A1 failure does not alter the later A2 lifecycle', async () => {
    await mount(REPORT_A, A_FORM_ROWS)
    await act(async () => {
      api().startManualLabour()
    })
    await startPendingSave()
    await openReport(null, [])
    const hydrated = await openReport(REPORT_A, A2_DB_ROWS)
    await resumeEdit()
    const a2Snapshot = clone(manualSnapshotRef()?.current)

    await settlePersist({ fail: true, reportId: REPORT_A })

    assert.equal(api().manualLabourSaveError, '')
    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, hydrated.baseline)
    assert.equal(api().manualLabourEditing, true)
    assert.deepEqual(manualSnapshotRef()?.current, a2Snapshot)
    assert.equal(api().manualLabourSaving, false)
  })

  it('a current manual save publishes its baseline and clears the saving flag', async () => {
    await mount(REPORT_A, A_FORM_ROWS)
    await act(async () => {
      api().startManualLabour()
    })
    globalThis.__zlogLastPersistedLabourRef.current = labourFormToPersistRows(
      mapLabourRowsFromDb(Y_DB_ROWS, () => 'old'),
      REPORT_A,
    )
    await startPendingSave()
    assert.equal(api().manualLabourSaving, true)
    const expected = labourFormToPersistRows(A_FORM_ROWS, REPORT_A)
    await settlePersist()

    assert.deepEqual(globalThis.__zlogLastPersistedLabourRef.current, expected)
    assert.equal(api().manualLabourEditing, false)
    assert.equal(manualSnapshotRef(), null)
    assert.equal(api().manualLabourSaveError, '')
    assert.equal(api().manualLabourSaving, false)
    assert.equal(rpcFor(REPORT_A)[0].args.p_report_id, REPORT_A)
    assert.deepEqual(rpcFor(REPORT_A)[0].args.p_labour, expected)
  })
})
