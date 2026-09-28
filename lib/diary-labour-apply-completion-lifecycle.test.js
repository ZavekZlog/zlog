/**
 * Defect #8I — Labour Apply completion publication.
 *
 * The durable write keeps the report id captured when Apply starts.
 * The labour baseline follows the report lifecycle visit.
 * Saved / notice / error follow the scan generation.
 * The in-flight lock always clears.
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
import { LABOUR_APPLY_SAVE_FAIL_MESSAGE } from './diary-labour-apply.js'

const repoRoot = join(import.meta.dirname, '..')
const PROJECT_ID = 'project-1'
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'
const PATH_A = 'user-1/report-a/sign-in-sheet/1000.jpg'
const PATH_B = 'user-1/report-b/sign-in-sheet/2000.jpg'
const DATA_URL_A = `data:image/jpeg;base64,${Buffer.from('report-a-sheet').toString('base64')}`
const DATA_URL_S2 = `data:image/jpeg;base64,${Buffer.from('report-a-sheet-s2').toString('base64')}`

const B_LABOUR_ROWS = Object.freeze([
  { id: 'b-row', trade: 'Electrical', count: 4, hours: 8 },
])
const A2_LABOUR_ROWS = Object.freeze([
  { id: 'a2-row', trade: 'Plumbing', count: 2, hours: 3 },
])

let cacheDir = ''
let labourModule = null
let host = null
let root = null
let originalCreateObjectURL = null
let originalRevokeObjectURL = null

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
  const memory = new Map()
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  }
  globalThis.sessionStorage = storage
  globalThis.localStorage = storage
  globalThis.location = { origin: 'http://127.0.0.1:3000', href: 'http://127.0.0.1:3000/' }
  return document.createElement('div')
}

function installUrlSpies() {
  originalCreateObjectURL = globalThis.URL.createObjectURL
  originalRevokeObjectURL = globalThis.URL.revokeObjectURL
  globalThis.URL.createObjectURL = (blob) => `blob:${blob?.zlogTag || 'sheet'}`
  globalThis.URL.revokeObjectURL = () => {}
}

function scanFile(name = 'register.jpg') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/jpeg' })
}

function parseSuccess(personName = 'Sam') {
  return {
    operatives: [{
      id: personName === 'Sam' ? 'op-a' : 'op-s2',
      person_name: personName,
      trade: personName === 'Sam' ? 'Electrician' : 'Plumbing',
      company: 'Acme',
      time_in: '08:00',
      time_out: '16:00',
      dateStatus: 'match',
      included: true,
    }],
    warnings: [personName === 'Sam' ? 'from-scan-s1' : 'from-scan-s2'],
    provider: 'claude',
    applyEnabled: true,
    matchedCount: 1,
    ignoredCount: 0,
    extractedCount: 1,
  }
}

function createSupabase() {
  return {
    auth: {
      getUser: () => globalThis.__zlogGetUser(),
    },
    rpc: async (name, args) => {
      globalThis.__zlogRpcCalls.push({ name, args })
      if (globalThis.__zlogPersistGate) await globalThis.__zlogPersistGate.promise
      if (globalThis.__zlogPersistFail) {
        return { data: null, error: { message: 'labour-fail', code: 'fail' } }
      }
      return {
        data: {
          ok: true,
          report_id: args.p_report_id,
          project_id: args.p_project_id,
          report: { id: args.p_report_id, project_id: args.p_project_id },
          labour_count: Array.isArray(args.p_labour) ? args.p_labour.length : 0,
        },
        error: null,
      }
    },
  }
}

function evidenceStubSource() {
  return `
    export {
      SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE,
      SIGN_IN_SHEET_EVIDENCE_REMOVE_FAIL_MESSAGE,
      SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE,
      dataUrlToJpegBlob,
      preparedSignInSheetFileFromBlob,
      signInSheetPathFromReport,
      clearPersistedSignInSheetEvidence,
    } from './diary-sign-in-sheet-evidence.js'

    export async function replacePersistedSignInSheetEvidence(_supabase, _update, options) {
      const call = {
        reportId: options?.reportId || null,
        projectId: options?.projectId || null,
      }
      globalThis.__zlogEvidenceCalls.push(call)
      return {
        ok: true,
        stage: 'complete',
        storagePath: call.reportId === ${JSON.stringify(REPORT_B)} ? ${JSON.stringify(PATH_B)} : ${JSON.stringify(PATH_A)},
        preparedBlob: null,
        error: null,
      }
    }
  `
}

function ocrStubSource() {
  return `
    export function resolveSignInOcrProvider() { return 'claude' }
    export function isSignInOcrApplyEnabled(_provider, applyEnabled) {
      return applyEnabled !== false
    }
    export async function prepareSignInSheetImageForProvider() {
      return {
        provider: 'claude',
        dataUrl: globalThis.__zlogDataUrl,
        imageMeta: { pipeline: 'test' },
      }
    }
    export async function parseSignInSheet(args) {
      globalThis.__zlogParseCalls.push(args)
      return globalThis.__zlogParseResult
    }
  `
}

function cacheStubSource() {
  return `
    const cache = new Map()
    export function evictSignInSheetSessionEvidence(path) {
      cache.delete(path)
    }
    export function rememberSignInSheetSessionEvidence(path, blob) {
      cache.set(path, blob)
    }
    export async function loadSignInSheetPreparedEvidence() {
      return { blob: null, cacheHit: false, networkFetchCount: 0 }
    }
  `
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
    reportDate: '2026-09-06',
    editingReportId: globalThis.__zlogReportId,
    projectId: PROJECT_ID,
    supabase: globalThis.__zlogSupabase,
    labourRows: globalThis.__zlogLabourRows,
    setLabourRows,
    lastPersistedLabourRef: globalThis.__zlogLastPersistedLabourRef,
    dismissAutosaveSuccessClaim: () => {},
    invalidatePreparedSharePdf: () => {},
    makeUuid: () => 'labour-key',
    signedUrlForPath: async () => 'https://example.test/signed',
  })
  useLayoutEffect(() => {
    globalThis.__zlogRerender = () => setTick((n) => n + 1)
    globalThis.__zlogApi = api
  })
  return null
}

function reactFiber(node) {
  if (!node) return null
  const key = Object.keys(node).find((item) => item.startsWith('__reactContainer$') || item.startsWith('__reactFiber$'))
  if (!key) return null
  const value = node[key]
  return value?.current?.child || value?.child || null
}

function findHarness(node) {
  if (!node) return null
  const type = node.type || node.elementType
  if (type === Harness || type?.name === 'Harness') return node
  return findHarness(node.child) || findHarness(node.sibling)
}

function numberRefValues() {
  const fiber = findHarness(reactFiber(host))
  const values = []
  let hook = fiber?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (state && typeof state === 'object' && typeof state.current === 'number') {
      values.push(state.current)
    }
    hook = hook.next
  }
  return values
}

function api() {
  return globalThis.__zlogApi
}

function applyEvent() {
  return {
    preventDefault() {},
    stopPropagation() {},
    nativeEvent: { stopImmediatePropagation() {} },
  }
}

function cloneRows(rows) {
  return JSON.parse(JSON.stringify(rows))
}

async function mount(reportId) {
  globalThis.__zlogReportId = reportId
  globalThis.__zlogLabourRows = [{ id: 'a-row', trade: 'Joinery', count: 1, hours: 1 }]
  globalThis.__zlogParseResult = parseSuccess('Sam')
  globalThis.__zlogDataUrl = DATA_URL_A
  host = installDom()
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(createElement(Harness))
  })
}

async function switchReport(reportId, labourRows) {
  await act(async () => {
    globalThis.__zlogReportId = reportId
    globalThis.__zlogLabourRows = labourRows
    globalThis.__zlogRerender()
  })
}

async function startScan() {
  await act(async () => {
    void api().handleSignInSheetFiles([scanFile()])
    await sleep(30)
  })
}

async function startApply() {
  globalThis.__zlogPersistFail = false
  globalThis.__zlogPersistGate = deferred()
  await act(async () => {
    api().applyScanOperativesToLabour(applyEvent())
    await sleep(30)
  })
}

async function settlePersist({ fail = false } = {}) {
  globalThis.__zlogPersistFail = fail
  await act(async () => {
    globalThis.__zlogPersistGate.resolve()
    await sleep(30)
  })
}

function assertWriteTargetA() {
  assert.equal(globalThis.__zlogRpcCalls.length, 1)
  assert.equal(globalThis.__zlogRpcCalls[0].args.p_report_id, REPORT_A)
  assert.equal(globalThis.__zlogRpcCalls[0].args.p_project_id, PROJECT_ID)
}

function assertInFlightCleared() {
  assert.equal(api().scanApplySaving, false)
}

describe('Defect #8I — Labour Apply completion lifecycle', { concurrency: false }, () => {
  before(async () => {
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8i-labour')
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
        name: 'zlog-8i-stubs',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@\/lib\/sign-in-ocr-provider$/ }, () => ({
            path: 'ocr',
            namespace: 'zlog-8i',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-evidence$/ }, () => ({
            path: 'evidence',
            namespace: 'zlog-8i',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-session-cache$/ }, () => ({
            path: 'cache',
            namespace: 'zlog-8i',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-draft$/ }, () => ({
            path: 'draft',
            namespace: 'zlog-8i',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: join(repoRoot, `${args.path.slice(2)}.js`),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8i' }, (args) => {
            const sources = {
              ocr: ocrStubSource(),
              evidence: evidenceStubSource(),
              cache: cacheStubSource(),
              draft: 'export async function updateDiarySetupFields() { return { ok: true } }\n',
            }
            return {
              contents: sources[args.path],
              loader: 'js',
              resolveDir: join(repoRoot, 'lib'),
            }
          })
        },
      }],
    })
    labourModule = await import(pathToFileURL(outfile).href)
  })

  after(async () => {
    if (root) await act(async () => root.unmount())
    if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL
    if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    if (root) {
      await act(async () => root.unmount())
      root = null
    }
    globalThis.__zlogPersistGate = null
    globalThis.__zlogPersistFail = false
    globalThis.__zlogParseCalls = []
    globalThis.__zlogParseResult = parseSuccess('Sam')
    globalThis.__zlogDataUrl = DATA_URL_A
    globalThis.__zlogRpcCalls = []
    globalThis.__zlogEvidenceCalls = []
    globalThis.__zlogGetUser = async () => ({ data: { user: { id: 'user-1' } }, error: null })
    globalThis.__zlogSupabase = createSupabase()
    globalThis.__zlogLastPersistedLabourRef = { current: { tag: 'before-apply' } }
    globalThis.__zlogApi = null
  })

  it('does not publish report A Apply success into report B', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    assertWriteTargetA()
    const bBaseline = { tag: 'b-baseline' }
    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    globalThis.__zlogLastPersistedLabourRef.current = bBaseline
    await settlePersist()

    assertWriteTargetA()
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')
    assert.equal(api().scanApplyError, '')
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current, bBaseline)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
    assertInFlightCleared()
  })

  it('publishes Apply success when the same report and scan remain current', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    const appliedRows = cloneRows(globalThis.__zlogLabourRows)
    assert.notEqual(appliedRows[0]?.id, 'a-row')
    await settlePersist()

    assertWriteTargetA()
    assert.equal(api().scanApplySaved, true)
    assert.match(api().scanApplyNotice, /saved/)
    assert.equal(api().scanApplyError, '')
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current[0].report_id, REPORT_A)
    assert.deepEqual(globalThis.__zlogLabourRows, appliedRows)
    assertInFlightCleared()
  })

  it('does not publish report A Apply failure into report B', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    const before = {
      notice: api().scanApplyNotice,
      saved: api().scanApplySaved,
      error: api().scanApplyError,
      review: api().scanTradeHoursReview.length,
    }
    await settlePersist({ fail: true })

    assertWriteTargetA()
    assert.equal(api().scanApplyError, '')
    assert.notEqual(api().scanApplyError, LABOUR_APPLY_SAVE_FAIL_MESSAGE)
    assert.equal(api().scanApplyNotice, before.notice)
    assert.equal(api().scanApplySaved, before.saved)
    assert.equal(api().scanTradeHoursReview.length, before.review)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current.tag, 'before-apply')
    assertInFlightCleared()
  })

  it('does not publish report A Apply completion after A then null then B', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    await switchReport(null, [{ id: 'start-row', trade: 'Joinery', count: 1, hours: 1 }])
    const bBaseline = { tag: 'b-baseline' }
    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    globalThis.__zlogLastPersistedLabourRef.current = bBaseline
    await settlePersist()

    assertWriteTargetA()
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')
    assert.equal(api().scanApplyError, '')
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current, bBaseline)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
    assertInFlightCleared()
  })

  it('does not publish the first A visit when the same report id is opened again', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    await switchReport(null, [{ id: 'start-row', trade: 'Joinery', count: 1, hours: 1 }])
    const a2Baseline = { tag: 'a2-baseline' }
    await switchReport(REPORT_A, [...A2_LABOUR_ROWS])
    globalThis.__zlogLastPersistedLabourRef.current = a2Baseline
    await settlePersist()

    assertWriteTargetA()
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current, a2Baseline)
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')
    assert.equal(api().scanApplyError, '')
    assert.deepEqual(globalThis.__zlogLabourRows, [...A2_LABOUR_ROWS])
    assertInFlightCleared()
  })

  it('updates the report baseline when a newer same-report scan owns the review', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    const appliedRows = cloneRows(globalThis.__zlogLabourRows)
    const requestIdsBefore = numberRefValues()
    globalThis.__zlogParseResult = parseSuccess('Pat')
    globalThis.__zlogDataUrl = DATA_URL_S2
    await act(async () => {
      void api().handleSignInSheetFiles([scanFile('register-s2.jpg')])
      await sleep(40)
    })
    const requestIdsAfter = numberRefValues()
    assert.ok(Math.max(...requestIdsAfter) > Math.max(...requestIdsBefore))
    assert.equal(api().scanOperatives[0].person_name, 'Pat')
    assert.equal(api().scanTradeHoursReviewReady, true)
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')

    await settlePersist()

    assertWriteTargetA()
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current[0].report_id, REPORT_A)
    assert.notEqual(globalThis.__zlogLastPersistedLabourRef.current.tag, 'before-apply')
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')
    assert.equal(api().scanApplyError, '')
    assert.equal(api().scanOperatives[0].person_name, 'Pat')
    assert.equal(api().scanTradeHoursReviewReady, true)
    assert.deepEqual(globalThis.__zlogLabourRows, appliedRows)
    assertInFlightCleared()
  })

  it('does not publish an old Apply failure over a newer same-report scan', async () => {
    await mount(REPORT_A)
    await startScan()
    await startApply()
    globalThis.__zlogParseResult = parseSuccess('Pat')
    globalThis.__zlogDataUrl = DATA_URL_S2
    await act(async () => {
      void api().handleSignInSheetFiles([scanFile('register-s2.jpg')])
      await sleep(40)
    })
    assert.equal(api().scanOperatives[0].person_name, 'Pat')
    await settlePersist({ fail: true })

    assertWriteTargetA()
    assert.equal(globalThis.__zlogLastPersistedLabourRef.current.tag, 'before-apply')
    assert.equal(api().scanApplyError, '')
    assert.notEqual(api().scanApplyError, LABOUR_APPLY_SAVE_FAIL_MESSAGE)
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyNotice, '')
    assert.equal(api().scanOperatives[0].person_name, 'Pat')
    assert.equal(api().scanTradeHoursReviewReady, true)
    assertInFlightCleared()
  })
})
