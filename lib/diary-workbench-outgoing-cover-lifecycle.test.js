/**
 * Defect #8H — a Workbench report-load reset must revoke an outgoing local
 * cover blob before it drops the last Workbench reference.
 *
 * Drives the real SiteDiaryWorkbenchSurface load effect.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement, useLayoutEffect, useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const repoRoot = join(import.meta.dirname, '..')
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'

const createdUrls = []
const revokedUrls = []
let cacheDir = ''
let workbenchModule = null
let host = null
let root = null
let originalCreateObjectURL = null
let originalRevokeObjectURL = null

function pendingRow(reportId, tag, generation) {
  const blob = new Blob([tag], { type: 'image/jpeg' })
  Object.defineProperty(blob, 'zlogTag', { value: tag })
  return {
    reportId,
    blob,
    rawBlob: blob,
    removed: false,
    generation,
    fileName: `${tag}.jpg`,
    mimeType: 'image/jpeg',
  }
}

function revokeCount(url) {
  return revokedUrls.filter((item) => item === url).length
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
      dataset: {},
      options: tag === 'select' ? [] : undefined,
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false },
      },
      parentNode: null,
      ownerDocument: null,
      textContent: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
    }
    return Object.assign(node, {
      appendChild(child) {
        child.parentNode = this
        this.childNodes.push(child)
        if (child.nodeType === 1) this.children.push(child)
        if (this.nodeName === 'SELECT' && child.nodeName === 'OPTION') {
          child.value = child.value ?? child.attributes?.value ?? ''
          child.selected = false
          this.options.push(child)
        }
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
      replaceChild(child) {
        return this.appendChild(child)
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value)
        if (name === 'src' || name === 'alt' || name.startsWith('data-')) {
          this[name] = String(value)
        }
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
      click() {},
      contains() { return false },
      getBoundingClientRect() {
        return { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }
      },
      getContext() {
        return {
          scale() {},
          clearRect() {},
          fillRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          save() {},
          restore() {},
          drawImage() {},
          setTransform() {},
        }
      },
      querySelector() { return null },
      querySelectorAll() { return [] },
      getRootNode() { return this.ownerDocument || this },
      setPointerCapture() {},
      releasePointerCapture() {},
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
    querySelector() { return null },
    querySelectorAll() { return [] },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null },
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
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.dispatchEvent = () => true
  globalThis.scrollTo = () => {}
  globalThis.scrollBy = () => {}
  globalThis.getSelection = () => null
  globalThis.innerWidth = 390
  globalThis.innerHeight = 844
  globalThis.devicePixelRatio = 1
  globalThis.HTMLElement = function HTMLElement() {}
  globalThis.Element = function Element() {}
  globalThis.Node = function Node() {}
  globalThis.SVGElement = function SVGElement() {}
  globalThis.HTMLCanvasElement = function HTMLCanvasElement() {}
  globalThis.HTMLIFrameElement = function HTMLIFrameElement() {}
  globalThis.Image = function Image() {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
  globalThis.getComputedStyle = () => ({ getPropertyValue() { return '' } })
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return [] } }
  const memory = new Map()
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  }
  globalThis.sessionStorage = storage
  globalThis.localStorage = storage
  globalThis.location = { origin: 'http://127.0.0.1:3000', href: 'http://127.0.0.1:3000/' }
  host = document.createElement('div')
  body.appendChild(host)
  return host
}

function installUrlSpies() {
  originalCreateObjectURL = globalThis.URL.createObjectURL
  originalRevokeObjectURL = globalThis.URL.revokeObjectURL
  const seen = new Map()
  globalThis.__zlogResetBlobNames = () => seen.clear()
  globalThis.URL.createObjectURL = (blob) => {
    const tag = blob?.zlogTag || 'untagged'
    const index = (seen.get(tag) || 0) + 1
    seen.set(tag, index)
    const url = typeof globalThis.__zlogNameBlob === 'function'
      ? globalThis.__zlogNameBlob(tag, index)
      : (index === 1 ? `blob:${tag}` : `blob:${tag}-${index}`)
    createdUrls.push(url)
    return url
  }
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrls.push(String(url))
  }
}

function resetSignals() {
  createdUrls.length = 0
  revokedUrls.length = 0
  globalThis.__zlogResetBlobNames?.()
  globalThis.__zlogReportId = REPORT_A
  globalThis.__zlogEditQuery = '1'
  globalThis.__zlogNameBlob = null
  globalThis.__zlogSetReport = null
  globalThis.__zlogSetEditQuery = null
  globalThis.__zlogRerenderWorkbench = null
  globalThis.__zlogHoldPending = new Map()
  globalThis.__zlogPendingRows = new Map()
  globalThis.__zlogPendingCalls = []
  globalThis.__zlogObjectUrls = createdUrls
  globalThis.__zlogSyncCalls = []
  globalThis.__zlogDynamicCover = null
  globalThis.__zlogGetUserHold = null
}

function resolveAtSpecifier(specifier) {
  const base = join(repoRoot, specifier.slice(2))
  if (existsSync(base) && statSync(base).isFile()) return base
  if (existsSync(`${base}.js`)) return `${base}.js`
  if (existsSync(`${base}.jsx`)) return `${base}.jsx`
  if (existsSync(join(base, 'index.js'))) return join(base, 'index.js')
  if (existsSync(join(base, 'index.jsx'))) return join(base, 'index.jsx')
  return `${base}.js`
}

function coverPendingStubSource() {
  return `
import {
  fileFromPendingCover,
  putPendingCover,
  markPendingCoverRemoved,
  newCoverPendingGeneration,
} from './diary-cover-pending.js'

export {
  fileFromPendingCover,
  putPendingCover,
  markPendingCoverRemoved,
  newCoverPendingGeneration,
}

export async function getPendingCover(reportId) {
  globalThis.__zlogPendingCalls.push(reportId)
  const hold = globalThis.__zlogHoldPending?.get?.(reportId)
  if (hold) return hold.promise
  return globalThis.__zlogPendingRows?.get?.(reportId) || null
}

export async function syncPendingCoverUpload(_client, args) {
  globalThis.__zlogSyncCalls.push({
    reportId: args?.reportId || null,
    generation: args?.generation || null,
  })
  return { ok: false, reason: 'test-hold' }
}
`
}

function navigationStubSource() {
  return `
export function useParams() {
  return { id: 'project-1' }
}
export function useRouter() {
  return { push() {}, replace() {}, back() {}, prefetch() {} }
}
export function usePathname() {
  return '/dashboard/project/project-1/diary'
}
export function useSearchParams() {
  const params = new URLSearchParams()
  params.set('report', globalThis.__zlogReportId || 'report-a')
  params.set('edit', globalThis.__zlogEditQuery == null ? '1' : globalThis.__zlogEditQuery)
  params.set('details', 'open')
  return params
}
`
}

function dynamicStubSource() {
  return `
import { createElement } from 'react'
export default function dynamic() {
  return function ZlogCoverProbe(props) {
    const cover = props.coverPhoto || null
    globalThis.__zlogDynamicCover = cover
    return createElement('img', {
      alt: 'Cover',
      src: cover?.preview || '',
    })
  }
}
`
}

function linkStubSource() {
  return `
import { createElement } from 'react'
export default function Link(props) {
  return createElement('a', null, props.children)
}
`
}

function signaturePadStubSource() {
  return `
export default class SignaturePad {
  constructor() {}
  on() { return this }
  off() { return this }
  clear() {}
  isEmpty() { return true }
  addEventListener() {}
  removeEventListener() {}
}
`
}

function supabaseStubSource() {
  return `
function reportRow(id) {
  return {
    id: id || 'report-a',
    project_id: 'project-1',
    is_draft: false,
    report_date: '2026-09-27',
    cover_photo_url: null,
    cover_processing_version: null,
    site_summary: '',
    weather: '',
    shift: 'Day',
    shift_type: 'Day',
    visitors: '',
    delays_issues: '',
    actions: '',
    signature_url: null,
    brand_logo_url: null,
    branding_id: null,
    brand_color: null,
    company_reporting_for: '',
  }
}

function chain(table) {
  const filters = {}
  const builder = {
    select() { return builder },
    eq(column, value) {
      filters[column] = value
      return builder
    },
    order() { return builder },
    limit() { return builder },
    maybeSingle() {
      if (table === 'projects') {
        return Promise.resolve({
          data: { id: 'project-1', name: 'Harbour Tower', project_reference: 'HT-1' },
          error: null,
        })
      }
      if (table === 'daily_reports' && filters.id) {
        return Promise.resolve({ data: reportRow(filters.id), error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    then(onOk, onErr) {
      return Promise.resolve({ data: [], error: null }).then(onOk, onErr)
    },
  }
  return builder
}

export function createClient() {
  const auth = {
    getUser() {
      const hold = globalThis.__zlogGetUserHold
      if (hold) return hold.promise
      return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } }
    },
  }
  return {
    auth,
    from(table) { return chain(table) },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/cover' }, error: null }),
          createSignedUrls: async () => ({ data: [], error: null }),
          upload: async () => ({ data: { path: 'uploaded' }, error: null }),
          list: async () => ({ data: [], error: null }),
          remove: async () => ({ data: [], error: null }),
        }
      },
    },
    channel() {
      return { on() { return this }, subscribe() { return this }, unsubscribe() {} }
    },
    removeChannel() {},
  }
}
`
}

function Host() {
  const [reportId, setReportId] = useState(REPORT_A)
  const [editQuery, setEditQuery] = useState('1')
  const [tick, setTick] = useState(0)
  useLayoutEffect(() => {
    globalThis.__zlogSetReport = (nextId) => {
      globalThis.__zlogReportId = nextId
      setReportId(nextId)
    }
    globalThis.__zlogSetEditQuery = (nextEdit) => {
      globalThis.__zlogEditQuery = nextEdit
      setEditQuery(nextEdit)
    }
    globalThis.__zlogRerenderWorkbench = () => setTick((value) => value + 1)
  }, [])
  const Workbench = workbenchModule.default
  return createElement(
    'div',
    { 'data-report': reportId, 'data-edit': editQuery, 'data-tick': String(tick) },
    createElement(Workbench),
  )
}

async function waitFor(predicate, label) {
  const started = Date.now()
  while (Date.now() - started < 5000) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
    })
  }
  throw new Error(`timeout: ${label}; cover=${JSON.stringify({
    file: globalThis.__zlogDynamicCover?.file?.name || null,
    preview: globalThis.__zlogDynamicCover?.preview || null,
    created: createdUrls,
    revoked: revokedUrls,
  })}`)
}

async function mountWorkbench() {
  root = createRoot(host)
  await act(async () => {
    root.render(createElement(Host))
  })
}

async function publishCover(reportId, tag, generation) {
  globalThis.__zlogPendingRows.set(reportId, pendingRow(reportId, tag, generation))
}

describe('Defect #8H — Workbench outgoing local-cover blob lifecycle', { concurrency: false }, () => {
  before(async () => {
    installDom()
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8h-cover')
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    const outfile = join(cacheDir, 'workbench.mjs')
    await build({
      stdin: {
        contents: `export { default } from './components/site-diary/SiteDiaryWorkbenchSurface.jsx'\n`,
        resolveDir: repoRoot,
        sourcefile: 'workbench-entry.js',
        loader: 'js',
      },
      bundle: true,
      outfile,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      plugins: [{
        name: 'zlog-8h-stubs',
        setup(buildApi) {
          const stubs = {
            'next/navigation': navigationStubSource,
            'next/dynamic': dynamicStubSource,
            'next/link': linkStubSource,
            signature_pad: signaturePadStubSource,
            'supabase-client': supabaseStubSource,
            'cover-pending': coverPendingStubSource,
          }
          buildApi.onResolve({ filter: /^next\/(navigation|dynamic|link)$/ }, (args) => ({
            path: args.path,
            namespace: 'zlog-8h',
          }))
          buildApi.onResolve({ filter: /^signature_pad$/ }, () => ({
            path: 'signature_pad',
            namespace: 'zlog-8h',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({
            path: 'supabase-client',
            namespace: 'zlog-8h',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-cover-pending$/ }, () => ({
            path: 'cover-pending',
            namespace: 'zlog-8h',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveAtSpecifier(args.path),
          }))
          buildApi.onResolve({ filter: /\.css$/ }, (args) => ({
            path: args.path,
            namespace: 'zlog-8h-css',
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8h' }, (args) => ({
            contents: stubs[args.path](),
            loader: 'js',
            resolveDir: join(repoRoot, 'lib'),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8h-css' }, () => ({
            contents: '',
            loader: 'js',
          }))
        },
      }],
    })
    workbenchModule = await import(pathToFileURL(outfile).href)
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
    resetSignals()
  })

  it('revokes report A local cover when the same Workbench switches to report B', async () => {
    await publishCover(REPORT_A, 'cover-a', 'gen-a')
    await publishCover(REPORT_B, 'cover-b', 'gen-b')
    await mountWorkbench()
    await waitFor(
      () => globalThis.__zlogDynamicCover?.file?.name === 'cover-a.jpg'
        && globalThis.__zlogDynamicCover?.preview === 'blob:cover-a',
      'report A local cover did not publish',
    )

    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(
      () => globalThis.__zlogDynamicCover?.file?.name === 'cover-b.jpg'
        && globalThis.__zlogDynamicCover?.preview === 'blob:cover-b',
      'report B local cover did not become authoritative',
    )

    const cover = globalThis.__zlogDynamicCover
    assert.equal(cover?.file?.name, 'cover-b.jpg')
    assert.equal(cover?.preview, 'blob:cover-b')
    assert.equal(cover?.storagePath ?? null, null)
    assert.equal(
      globalThis.__zlogSyncCalls.some((call) => call.reportId === REPORT_B && call.generation === 'gen-b'),
      true,
    )
    assert.equal(revokeCount('blob:cover-b'), 0)
    assert.equal(
      revokeCount('blob:cover-a'),
      1,
      'outgoing report A cover blob must be revoked exactly once',
    )
  })

  it('does not revoke an active local cover on a same-report render', async () => {
    await publishCover(REPORT_A, 'cover-a', 'gen-a')
    await mountWorkbench()
    await waitFor(
      () => globalThis.__zlogDynamicCover?.preview === 'blob:cover-a'
        && globalThis.__zlogDynamicCover?.file?.name === 'cover-a.jpg',
      'report A local cover did not publish',
    )

    const before = {
      file: globalThis.__zlogDynamicCover.file.name,
      preview: globalThis.__zlogDynamicCover.preview,
      storagePath: globalThis.__zlogDynamicCover.storagePath ?? null,
    }
    await act(async () => {
      globalThis.__zlogRerenderWorkbench()
    })

    const cover = globalThis.__zlogDynamicCover
    assert.equal(cover?.file?.name, before.file)
    assert.equal(cover?.preview, before.preview)
    assert.equal(cover?.storagePath ?? null, before.storagePath)
    assert.equal(revokeCount('blob:cover-a'), 0)
  })

  it('revokes an active local cover once when the Workbench unmounts', async () => {
    await publishCover(REPORT_A, 'cover-a', 'gen-a')
    await mountWorkbench()
    await waitFor(
      () => globalThis.__zlogDynamicCover?.preview === 'blob:cover-a',
      'report A local cover did not publish',
    )
    assert.equal(revokeCount('blob:cover-a'), 0)

    await act(async () => {
      root.unmount()
    })
    root = null

    assert.equal(
      revokeCount('blob:cover-a'),
      1,
      'unmount must revoke the active local cover exactly once',
    )
  })

  it('revokes the old local cover when the same report load resets', async () => {
    globalThis.__zlogNameBlob = (tag, index) => {
      if (tag === 'cover-a' && index === 1) return 'blob:cover-a-old'
      if (tag === 'cover-a' && index === 2) return 'blob:cover-a-new'
      return `blob:${tag}-${index}`
    }
    await publishCover(REPORT_A, 'cover-a', 'gen-a')
    await mountWorkbench()
    await waitFor(
      () => globalThis.__zlogDynamicCover?.preview === 'blob:cover-a-old'
        && globalThis.__zlogDynamicCover?.file?.name === 'cover-a.jpg',
      'report A initial local cover did not publish',
    )

    await act(async () => {
      globalThis.__zlogSetEditQuery('true')
    })
    await waitFor(
      () => globalThis.__zlogDynamicCover?.preview === 'blob:cover-a-new'
        && globalThis.__zlogDynamicCover?.file?.name === 'cover-a.jpg',
      'same-report reload did not publish a replacement cover',
    )

    const cover = globalThis.__zlogDynamicCover
    assert.equal(host?.getAttribute?.('data-report') || globalThis.__zlogReportId, REPORT_A)
    assert.equal(cover?.preview, 'blob:cover-a-new')
    assert.equal(cover?.file?.name, 'cover-a.jpg')
    assert.equal(cover?.storagePath ?? null, null)
    assert.equal(revokeCount('blob:cover-a-new'), 0)
    assert.equal(
      revokeCount('blob:cover-a-old'),
      1,
      'same-report load reset must revoke the discarded cover exactly once',
    )
  })
})
