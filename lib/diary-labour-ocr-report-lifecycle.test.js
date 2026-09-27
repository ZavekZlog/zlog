/**
 * Defect #8E — an Attendance/Labour scan may update interactive scan state
 * only while it still belongs to the report that started it.
 *
 * Drives the real useSiteDiaryLabour hook. OCR parsing and the evidence write
 * are held at the hook's await boundaries so the same mounted hook can change
 * report before those results return.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement, useLayoutEffect, useState } from 'react'
import { SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE } from './diary-sign-in-sheet-evidence.js'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const repoRoot = join(import.meta.dirname, '..')
const PROJECT_ID = 'project-1'
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'
const PATH_A = 'user-1/report-a/sign-in-sheet/1000.jpg'
const PATH_B = 'user-1/report-b/sign-in-sheet/2000.jpg'
const DATA_URL_A = `data:image/jpeg;base64,${Buffer.from('report-a-sheet').toString('base64')}`

const B_LABOUR_ROWS = Object.freeze([
  { id: 'b-row', trade: 'Electrical', count: 4, hours: 8 },
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

function taggedBlob(tag) {
  const blob = new Blob([tag], { type: 'image/jpeg' })
  Object.defineProperty(blob, 'zlogTag', { value: tag })
  return blob
}

function scanFile() {
  return new File([new Uint8Array([1, 2, 3, 4])], 'register.jpg', { type: 'image/jpeg' })
}

function parseSuccess() {
  return {
    operatives: [{
      id: 'op-a',
      person_name: 'Sam',
      trade: 'Electrician',
      company: 'Acme',
      time_in: '08:00',
      time_out: '16:00',
      dateStatus: 'match',
      included: true,
    }],
    warnings: ['from-report-a'],
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
      return { data: { ok: true }, error: null }
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
      if (globalThis.__zlogEvidenceGate) await globalThis.__zlogEvidenceGate.promise
      if (globalThis.__zlogEvidenceFail) {
        return { ok: false, storagePath: null, preparedBlob: null, error: { message: 'evidence-fail' } }
      }
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
      if (globalThis.__zlogParseGate) return globalThis.__zlogParseGate.promise
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
      globalThis.__zlogRemembered.push(path)
    }
    export async function loadSignInSheetPreparedEvidence(path) {
      globalThis.__zlogLoads.push(path)
      if (cache.has(path)) return { blob: cache.get(path), cacheHit: true, networkFetchCount: 0 }
      const provided = globalThis.__zlogLoadEvidence ? globalThis.__zlogLoadEvidence(path) : null
      return { blob: provided, cacheHit: false, networkFetchCount: provided ? 1 : 0 }
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
  if (value && value.current && value.current.tag != null) return value.current
  return value
}

function findHarness(node) {
  if (!node) return null
  const type = node.type || node.elementType
  if (type === Harness || type?.name === 'Harness') return node
  return findHarness(node.child) || findHarness(node.sibling)
}

function hookHoldsPath(path) {
  const fiber = findHarness(reactFiber(host))
  let hook = fiber?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (state === path) return true
    if (state && typeof state === 'object') {
      if (state.current === path) return true
      if (Array.isArray(state) && state.includes(path)) return true
      if (Array.isArray(state[1]) && state[1].includes(path)) return true
    }
    hook = hook.next
  }
  return false
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

async function mount(reportId) {
  globalThis.__zlogReportId = reportId
  globalThis.__zlogLabourRows = reportId === REPORT_B ? [...B_LABOUR_ROWS] : [{ id: 'a-row', trade: 'Joinery', count: 1, hours: 1 }]
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

function assertNoAScanOnB() {
  const scan = api()
  assert.notEqual(scan.scanSheetPreview, DATA_URL_A)
  assert.equal(scan.scanOperatives.length, 0)
  assert.equal(scan.scanTradeHoursReview.length, 0)
  assert.equal(scan.scanTradeHoursReviewReady, false)
  assert.deepEqual(scan.scanWarnings, [])
  assert.deepEqual(scan.scanMeta, { matched: 0, ignored: 0, extracted: 0 })
  assert.equal(scan.scanOcrProvider, null)
  assert.equal(scan.scanError, '')
  assert.equal(scan.scanLoading, false)
  assert.equal(scan.labourMode, 'manual')
  assert.equal(hookHoldsPath(PATH_A), false)
  assert.equal(scan.hasSignInSheetEvidenceOnForm, false)
}

describe('Defect #8E — Labour OCR report lifecycle', { concurrency: false }, () => {
  before(async () => {
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8e-labour')
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
        name: 'zlog-8e-stubs',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@\/lib\/sign-in-ocr-provider$/ }, () => ({
            path: 'ocr',
            namespace: 'zlog-8e',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-evidence$/ }, () => ({
            path: 'evidence',
            namespace: 'zlog-8e',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-sign-in-sheet-session-cache$/ }, () => ({
            path: 'cache',
            namespace: 'zlog-8e',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-draft$/ }, () => ({
            path: 'draft',
            namespace: 'zlog-8e',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: join(repoRoot, `${args.path.slice(2)}.js`),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8e' }, (args) => {
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
    globalThis.__zlogEvidenceCalls = []
    globalThis.__zlogEvidenceGate = null
    globalThis.__zlogEvidenceFail = false
    globalThis.__zlogParseCalls = []
    globalThis.__zlogParseGate = null
    globalThis.__zlogParseResult = parseSuccess()
    globalThis.__zlogDataUrl = DATA_URL_A
    globalThis.__zlogRpcCalls = []
    globalThis.__zlogRemembered = []
    globalThis.__zlogLoads = []
    globalThis.__zlogLoadEvidence = null
    globalThis.__zlogGetUser = async () => ({ data: { user: { id: 'user-1' } }, error: null })
    globalThis.__zlogSupabase = createSupabase()
    globalThis.__zlogLastPersistedLabourRef = { current: null }
    globalThis.__zlogApi = null
  })

  it('pending OCR from report A does not publish into report B', async () => {
    const parseGate = deferred()
    globalThis.__zlogParseGate = parseGate
    await mount(REPORT_A)
    await startScan()
    assert.equal(globalThis.__zlogEvidenceCalls.length, 1)
    assert.equal(globalThis.__zlogParseCalls.length, 1)

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    await act(async () => {
      parseGate.resolve(parseSuccess())
      await sleep(30)
    })

    assertNoAScanOnB()
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
    await act(async () => {
      api().applyScanOperativesToLabour(applyEvent())
    })
    assert.equal(
      globalThis.__zlogRpcCalls.some((call) => call.args?.p_report_id === REPORT_B),
      false,
    )
  })

  it('a completed unapplied review on A is gone when the same hook shows B', async () => {
    await mount(REPORT_A)
    await startScan()
    const finished = api()
    assert.equal(finished.scanTradeHoursReviewReady, true)
    assert.equal(finished.scanSheetPreview, DATA_URL_A)
    assert.equal(finished.scanOperatives.length, 1)
    assert.equal(finished.labourMode, 'scan')

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    assertNoAScanOnB()
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])

    globalThis.__zlogLoadEvidence = (path) => (path === PATH_B ? taggedBlob('b-sheet') : null)
    await act(async () => {
      await api().hydrateSignInFromReport({ sign_in_sheet_url: PATH_B }, () => false)
    })

    const hydrated = api()
    assert.equal(globalThis.__zlogLoads.includes(PATH_B), true)
    assert.equal(hydrated.scanSheetPreview, 'blob:b-sheet')
    assert.equal(hydrated.hasSignInSheetEvidenceOnForm, true)
    assert.equal(hookHoldsPath(PATH_B), true)
    assert.equal(hookHoldsPath(PATH_A), false)
    assert.equal(hydrated.scanTradeHoursReviewReady, false)
    assert.equal(hydrated.scanOperatives.length, 0)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
  })

  it('a same-report scan still reviews and Apply still saves report A', async () => {
    await mount(REPORT_A)
    await startScan()
    const scan = api()
    assert.equal(scan.scanSheetPreview, DATA_URL_A)
    assert.equal(scan.scanTradeHoursReviewReady, true)
    assert.equal(scan.scanOperatives.length, 1)
    assert.equal(scan.labourMode, 'scan')
    assert.equal(scan.scanOcrProvider, 'claude')

    await act(async () => {
      globalThis.__zlogRerender()
    })
    assert.equal(api().scanTradeHoursReviewReady, true)
    assert.equal(api().scanSheetPreview, DATA_URL_A)
    assert.equal(api().labourMode, 'scan')

    await act(async () => {
      api().applyScanOperativesToLabour(applyEvent())
      await sleep(20)
    })
    assert.equal(globalThis.__zlogRpcCalls.length, 1)
    assert.equal(globalThis.__zlogRpcCalls[0].args.p_report_id, REPORT_A)
    assert.equal(globalThis.__zlogRpcCalls[0].args.p_project_id, PROJECT_ID)
    assert.ok(globalThis.__zlogLabourRows.length > 0)
    assert.notEqual(globalThis.__zlogLabourRows[0].id, 'a-row')
  })

  it('an obsolete A failure does not write error or loading into B', async () => {
    const parseGate = deferred()
    globalThis.__zlogParseGate = parseGate
    await mount(REPORT_A)
    await startScan()
    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    globalThis.__zlogLoadEvidence = (path) => (path === PATH_B ? taggedBlob('b-sheet') : null)
    await act(async () => {
      await api().hydrateSignInFromReport({ sign_in_sheet_url: PATH_B }, () => false)
    })
    const beforeFailure = api().scanSheetPreview

    await act(async () => {
      parseGate.reject(new Error('ocr-failed'))
      await sleep(30)
    })

    const scan = api()
    assert.equal(scan.scanError, '')
    assert.equal(scan.scanLoading, false)
    assert.deepEqual(scan.scanWarnings, [])
    assert.equal(scan.scanSheetPreview, beforeFailure)
    assert.equal(scan.scanSheetPreview, 'blob:b-sheet')
    assert.equal(scan.scanTradeHoursReviewReady, false)
    assert.equal(scan.scanOperatives.length, 0)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
    assert.equal(hookHoldsPath(PATH_A), false)
  })

  it('getUser success after A is obsolete does not start the durable evidence write', async () => {
    const userGate = deferred()
    globalThis.__zlogGetUser = () => userGate.promise
    await mount(REPORT_A)
    await startScan()
    assert.equal(globalThis.__zlogEvidenceCalls.length, 0)

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    await act(async () => {
      userGate.resolve({ data: { user: { id: 'user-1' } }, error: null })
      await sleep(30)
    })

    assert.equal(globalThis.__zlogEvidenceCalls.length, 0)
    assertNoAScanOnB()
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
  })

  it('an evidence write already entered for A finishes for A and does not publish into B', async () => {
    const evidenceGate = deferred()
    const parseGate = deferred()
    globalThis.__zlogEvidenceGate = evidenceGate
    globalThis.__zlogParseGate = parseGate
    await mount(REPORT_A)
    await startScan()
    assert.equal(globalThis.__zlogEvidenceCalls.length, 1)
    assert.equal(globalThis.__zlogEvidenceCalls[0].reportId, REPORT_A)
    assert.equal(globalThis.__zlogEvidenceCalls[0].projectId, PROJECT_ID)
    assert.equal(globalThis.__zlogParseCalls.length, 0)

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    await act(async () => {
      evidenceGate.resolve()
      await sleep(30)
    })

    assert.equal(globalThis.__zlogEvidenceCalls.length, 1)
    assert.equal(globalThis.__zlogEvidenceCalls[0].reportId, REPORT_A)
    assert.equal(globalThis.__zlogParseCalls.length, 0)
    assertNoAScanOnB()
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
  })

  it('A to the start screen then B drops A scan state and hydrates B', async () => {
    const aLabourRows = [{ id: 'a-row', trade: 'Joinery', count: 1, hours: 1 }]
    await mount(REPORT_A)
    await startScan()
    const finished = api()
    assert.equal(finished.scanSheetPreview, DATA_URL_A)
    assert.equal(finished.scanOperatives.length, 1)
    assert.equal(finished.scanTradeHoursReviewReady, true)
    assert.equal(finished.scanWarnings.length, 1)
    assert.equal(finished.scanOcrProvider, 'claude')
    assert.equal(finished.scanMeta.extracted, 1)
    assert.equal(finished.labourMode, 'scan')
    assert.equal(finished.manualLabourEditing, false)

    await switchReport(null, aLabourRows)
    assertNoAScanOnB()
    assert.equal(api().manualLabourEditing, false)
    assert.equal(api().scanApplySaved, false)
    assert.equal(api().scanApplyError, '')
    assert.deepEqual(globalThis.__zlogLabourRows, aLabourRows)

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    assertNoAScanOnB()
    assert.equal(api().manualLabourEditing, false)
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])

    globalThis.__zlogLoadEvidence = (path) => (path === PATH_B ? taggedBlob('b-sheet') : null)
    await act(async () => {
      await api().hydrateSignInFromReport({ sign_in_sheet_url: PATH_B }, () => false)
    })

    const hydrated = api()
    assert.equal(globalThis.__zlogLoads.includes(PATH_B), true)
    assert.equal(hydrated.scanSheetPreview, 'blob:b-sheet')
    assert.equal(hydrated.hasSignInSheetEvidenceOnForm, true)
    assert.equal(hookHoldsPath(PATH_B), true)
    assert.equal(hookHoldsPath(PATH_A), false)
    assert.equal(hydrated.scanTradeHoursReviewReady, false)
    assert.equal(hydrated.scanOperatives.length, 0)
    assert.equal(hydrated.labourMode, 'manual')
    assert.equal(hydrated.manualLabourEditing, false)
    assert.equal(hydrated.scanError, '')
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
  })

  it('obsolete getUser failure does not start persistence or publish A error into B', async () => {
    const userGate = deferred()
    globalThis.__zlogGetUser = () => userGate.promise
    await mount(REPORT_A)
    await startScan()
    assert.equal(globalThis.__zlogEvidenceCalls.length, 0)

    await switchReport(REPORT_B, [...B_LABOUR_ROWS])
    const beforeFailure = {
      preview: api().scanSheetPreview,
      operatives: api().scanOperatives.length,
      review: api().scanTradeHoursReview.length,
      ready: api().scanTradeHoursReviewReady,
      loading: api().scanLoading,
    }

    await act(async () => {
      userGate.resolve({ data: { user: null }, error: { message: 'session-missing' } })
      await sleep(30)
    })

    const scan = api()
    assert.equal(globalThis.__zlogEvidenceCalls.length, 0)
    assert.equal(scan.scanError, '')
    assert.equal(scan.scanError.includes(SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE), false)
    assert.equal(scan.scanSheetPreview, beforeFailure.preview)
    assert.equal(scan.scanOperatives.length, beforeFailure.operatives)
    assert.equal(scan.scanTradeHoursReview.length, beforeFailure.review)
    assert.equal(scan.scanTradeHoursReviewReady, beforeFailure.ready)
    assert.equal(scan.scanLoading, beforeFailure.loading)
    assert.equal(scan.scanLoading, false)
    assertNoAScanOnB()
    assert.deepEqual(globalThis.__zlogLabourRows, [...B_LABOUR_ROWS])
  })
})
