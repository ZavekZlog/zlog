/**
 * Defect #8K — Project Details cover ownership.
 * RED harness only. Drives the real Workbench editor, Hide, Remove, Save,
 * reseed, and Workbench load reset. Does not change product code.
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
import { flushSync } from 'react-dom'

const repoRoot = join(import.meta.dirname, '..')
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'
const SEEDED_BLOB = 'blob:cover-a'
const HTTPS_COVER = 'https://signed.example/cover'

const createdUrls = []
const revokeLog = []
let cacheDir = ''
let workbenchModule = null
let host = null
let root = null
let originalCreateObjectURL = null
let originalRevokeObjectURL = null
let originalFile = null

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
  return revokeLog.filter((entry) => entry.url === url).length
}

function revokeCountDuring(url, phase) {
  return revokeLog.filter((entry) => entry.url === url && entry.phase === phase).length
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
        if (name === 'src' || name === 'alt' || name.startsWith('data-')) this[name] = String(value)
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
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
  originalFile = globalThis.File
  const seen = new Map()
  globalThis.__zlogResetBlobNames = () => seen.clear()
  globalThis.URL.createObjectURL = (blob) => {
    const tag = blob?.zlogTag || 'untagged'
    const index = (seen.get(tag) || 0) + 1
    seen.set(tag, index)
    const url = index === 1 ? `blob:${tag}` : `blob:${tag}-${index}`
    createdUrls.push(url)
    return url
  }
  globalThis.URL.revokeObjectURL = (url) => {
    revokeLog.push({
      url: String(url),
      phase: globalThis.__zlogPhase || 'setup',
    })
  }
  globalThis.File = class ZlogFile extends originalFile {
    constructor(parts, name, options) {
      super(parts, name, options)
      const tagged = Array.isArray(parts) && parts.find((part) => part?.zlogTag)
      if (tagged) Object.defineProperty(this, 'zlogTag', { value: tagged.zlogTag })
    }
  }
}

function resetSignals() {
  createdUrls.length = 0
  revokeLog.length = 0
  globalThis.__zlogResetBlobNames?.()
  globalThis.__zlogReportId = REPORT_A
  globalThis.__zlogEditQuery = '1'
  globalThis.__zlogPhase = 'setup'
  globalThis.__zlogCoverPaths = new Map()
  globalThis.__zlogPendingRows = new Map()
  globalThis.__zlogPendingCalls = []
  globalThis.__zlogWorkbenchCover = null
  trackedCoverRef = null
  globalThis.__zlogSetReport = null
  globalThis.__zlogSetEditQuery = null
  renderErrors.length = 0
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
  markPendingCoverRemoved,
  newCoverPendingGeneration,
} from './diary-cover-pending.js'

export {
  fileFromPendingCover,
  markPendingCoverRemoved,
  newCoverPendingGeneration,
}

export async function getPendingCover(reportId) {
  globalThis.__zlogPendingCalls.push(reportId)
  return globalThis.__zlogPendingRows?.get?.(reportId) || null
}

export async function putPendingCover() {
  return { ok: true, generation: 'gen-editor-handoff' }
}

export async function syncPendingCoverUpload() {
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
import Editor from '@/components/site-diary/SiteDiaryWorkbenchProjectDetailsEditor'
export default function dynamic() {
  return function SiteDiaryWorkbenchProjectDetailsEditor(props) {
    globalThis.__zlogWorkbenchCover = props.coverPhoto || null
    return createElement(Editor, props)
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
function projectRow() {
  return {
    id: 'project-1',
    name: 'Harbour Tower',
    project_reference: 'HT-1',
    start_date: '2026-01-01',
    planned_completion_date: '2026-12-31',
    site_address: '1 Dock Road',
    client_pm: 'Pat Manager',
    working_days_per_week: 5,
  }
}

function reportRow(id) {
  return {
    id: id || 'report-a',
    project_id: 'project-1',
    is_draft: false,
    report_date: '2026-09-27',
    cover_photo_url: globalThis.__zlogCoverPaths?.get?.(id) || null,
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
    company_reporting_for: 'Harbour Co',
    creator_name: 'Alex Site',
    creator_role: 'Site Manager',
    current_phase: 'Structure',
  }
}

function singleResult(table, filters, op) {
  if (op.type === 'insert' && table === 'projects') {
    return { data: { id: 'project-1' }, error: null }
  }
  if (op.type === 'insert' && table === 'company_brandings') {
    return {
      data: { id: 'brand-1', company_name: 'Harbour Co', logo_url: null, brand_color: '#FF5000' },
      error: null,
    }
  }
  if (op.type === 'update' || op.type === 'insert') {
    return { data: { id: filters.id || 'report-a', project_id: 'project-1' }, error: null }
  }
  if (table === 'projects') return { data: projectRow(), error: null }
  if (table === 'daily_reports' && filters.id) return { data: reportRow(filters.id), error: null }
  return { data: null, error: null }
}

function chain(table) {
  const filters = {}
  const op = { type: 'select' }
  const builder = {
    select() { return builder },
    insert() { op.type = 'insert'; return builder },
    update() { op.type = 'update'; return builder },
    delete() { op.type = 'delete'; return builder },
    upsert() { op.type = 'insert'; return builder },
    eq(column, value) { filters[column] = value; return builder },
    neq() { return builder },
    in() { return builder },
    order() { return builder },
    limit() { return builder },
    match() { return builder },
    maybeSingle() { return Promise.resolve(singleResult(table, filters, op)) },
    single() { return Promise.resolve(singleResult(table, filters, op)) },
    then(onOk, onErr) {
      return Promise.resolve({ data: [], error: null }).then(onOk, onErr)
    },
  }
  return builder
}

export function createClient() {
  return {
    auth: {
      getUser() {
        return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })
      },
      getSession() {
        return Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null })
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
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
  useLayoutEffect(() => {
    globalThis.__zlogSetReport = (nextId) => {
      globalThis.__zlogReportId = nextId
      setReportId(nextId)
    }
    globalThis.__zlogSetEditQuery = (nextEdit) => {
      globalThis.__zlogEditQuery = nextEdit
      setEditQuery(nextEdit)
    }
  }, [])
  const Workbench = workbenchModule.default
  return createElement(
    'div',
    { 'data-report': reportId, 'data-edit': editQuery },
    createElement(Workbench),
  )
}

function reactFiber(node) {
  if (!node) return null
  const key = Object.keys(node).find((item) => (
    item.startsWith('__reactContainer$') || item.startsWith('__reactFiber$')
  ))
  if (!key) return null
  const value = node[key]
  const fiberRoot = value?.stateNode
  if (fiberRoot?.current?.tag != null && fiberRoot.pendingLanes != null) return fiberRoot.current
  if (value?.current?.tag != null) return value.current
  return value
}

function walkFibers(fiber, visit) {
  const stack = [fiber]
  const seen = new Set()
  while (stack.length) {
    const current = stack.pop()
    if (!current || seen.has(current)) continue
    seen.add(current)
    visit(current)
    if (current.child) stack.push(current.child)
    if (current.sibling) stack.push(current.sibling)
  }
}

function fiberName(fiber) {
  const type = fiber?.type
  if (!type) return ''
  if (typeof type === 'string') return type
  return type.displayName || type.render?.name || type.name || ''
}

function findNamed(name) {
  let found = null
  walkFibers(reactFiber(host), (fiber) => {
    if (!found && fiberName(fiber).startsWith(name)) found = fiber
  })
  return found
}

function childText(children) {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childText).join('')
  if (typeof children === 'object' && children.props) return childText(children.props.children)
  return ''
}

function fiberLabel(fiber) {
  const props = fiber?.memoizedProps
  if (typeof props === 'string' || typeof props === 'number') return String(props)
  return childText(props?.children)
}

function findClick(label) {
  let found = null
  walkFibers(reactFiber(host), (fiber) => {
    const text = fiberLabel(fiber).replace(/\s+/g, ' ').trim()
    if (text !== label) return
    let current = fiber
    while (current) {
      const onClick = current.memoizedProps?.onClick
      if (typeof onClick === 'function') {
        found = onClick
        return
      }
      current = current.return
    }
  })
  return found
}

function clickableLabels() {
  const labels = []
  walkFibers(reactFiber(host), (fiber) => {
    if (typeof fiber.memoizedProps?.onClick !== 'function') return
    const label = fiberLabel(fiber).replace(/\s+/g, ' ').trim()
    if (label && !labels.includes(label)) labels.push(label)
  })
  return labels
}

function refObjects(fiber) {
  const refs = []
  let hook = fiber?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (state && typeof state === 'object' && Object.prototype.hasOwnProperty.call(state, 'current')) {
      refs.push(state)
    }
    hook = hook.next
  }
  return refs
}

function isCoverRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && 'preview' in value
    && 'file' in value
    && 'storagePath' in value
    && !('id' in value)
    && !('key' in value),
  )
}

let trackedCoverRef = null
const renderErrors = []

function workbenchCoverRef() {
  const fiber = findNamed('SiteDiaryWorkbenchSurface')
  return refObjects(fiber).find((ref) => (
    isCoverRecord(ref.current)
    && typeof ref.current.preview === 'string'
    && ref.current.preview
  )) || null
}

function workbenchCover() {
  if (trackedCoverRef) return trackedCoverRef.current || null
  return workbenchCoverRef()?.current || null
}

function editorCover() {
  return findNamed('SiteDiaryProjectDetailsSection')?.memoizedProps?.coverPhoto || null
}

function visibleAlert() {
  let text = ''
  walkFibers(reactFiber(host), (fiber) => {
    if (fiber.memoizedProps?.role === 'alert') text = fiberLabel(fiber).replace(/\s+/g, ' ').trim()
  })
  return text
}

function diagnostic(label) {
  return [
    label,
    `editor=${editorCover()?.preview || 'none'}`,
    `workbench=${trackedCoverRef ? (trackedCoverRef.current?.preview || 'none') : (workbenchCover()?.preview || 'none')}`,
    `alert=${visibleAlert() || 'none'}`,
    `controls=${clickableLabels().slice(0, 12).join(' | ')}`,
    `created=${createdUrls.join(',')}`,
    `revoked=${revokeLog.map((entry) => `${entry.phase}:${entry.url}`).join(',')}`,
  ].join('; ')
}

async function waitFor(predicate, label) {
  const started = Date.now()
  while (Date.now() - started < 8000) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  throw new Error(`timeout: ${diagnostic(label)}`)
}

async function mountWorkbench() {
  root = createRoot(host, {
    onUncaughtError(error) {
      renderErrors.push(`uncaught:${error?.stack || error}`)
    },
    onCaughtError(error) {
      renderErrors.push(`caught:${error?.stack || error}`)
    },
    onRecoverableError(error) {
      renderErrors.push(`recoverable:${error?.stack || error}`)
    },
  })
  await act(async () => {
    root.render(createElement(Host))
  })
}

async function openEditor(expectedPreview) {
  let stableFor = 0
  const started = Date.now()
  while (Date.now() - started < 8000) {
    const ready = editorCover()?.preview === expectedPreview
      && typeof findNamed('SiteDiaryProjectDetailsSection')?.memoizedProps?.onCoverDrop === 'function'
      && typeof findClick('Hide Project & Report Details') === 'function'
      && typeof findClick('Save Project & Report Details') === 'function'
    if (ready) {
      trackedCoverRef = workbenchCoverRef() || trackedCoverRef
      stableFor += 20
      if (stableFor >= 400) return
    } else {
      stableFor = 0
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  throw new Error(`timeout: ${diagnostic(`editor did not stay seeded with ${expectedPreview}`)}`)
}

async function clickLabel(label) {
  const onClick = findClick(label)
  if (typeof onClick !== 'function') {
    throw new Error(`missing control: ${diagnostic(label)}`)
  }
  await act(async () => {
    const result = onClick({ preventDefault() {}, stopPropagation() {} })
    if (result && typeof result.then === 'function') await result
  })
}

async function chooseCover(tag) {
  const onCoverDrop = findNamed('SiteDiaryProjectDetailsSection')?.memoizedProps?.onCoverDrop
  if (typeof onCoverDrop !== 'function') {
    throw new Error(`missing cover drop handler: ${diagnostic(tag)}`)
  }
  const blob = new Blob([tag], { type: 'image/jpeg' })
  Object.defineProperty(blob, 'zlogTag', { value: tag })
  const file = new File([blob], `${tag}.jpg`, { type: 'image/jpeg' })
  await act(async () => {
    flushSync(() => {
      onCoverDrop([file])
    })
  })
  let stableFor = 0
  const started = Date.now()
  while (Date.now() - started < 8000) {
    if (editorCover()?.preview === `blob:${tag}`) {
      stableFor += 20
      if (stableFor >= 200) return
    } else {
      stableFor = 0
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  const renderedErrors = renderErrors.join(' || ')
  throw new Error(`timeout: ${diagnostic(`editor did not keep ${tag}${renderedErrors ? `; errors=${renderedErrors}` : ''}`)}`)
}

async function hideEditor() {
  await clickLabel('Hide Project & Report Details')
  await waitFor(
    () => !findNamed('SiteDiaryProjectDetailsSection'),
    'Hide did not unmount the editor',
  )
}

async function saveProjectDetails() {
  await clickLabel('Save Project & Report Details')
  await waitFor(
    () => !findNamed('SiteDiaryProjectDetailsSection'),
    'Save did not collapse the editor',
  )
}

function seedFileCover(reportId = REPORT_A) {
  globalThis.__zlogPendingRows.set(reportId, pendingRow(reportId, 'cover-a', `gen-${reportId}`))
}

function seedHttpsCover(reportId = REPORT_A) {
  globalThis.__zlogCoverPaths.set(reportId, `user-1/${reportId}/covers/saved.jpg`)
}

describe('Defect #8K — Project Details cover ownership', { concurrency: false }, () => {
  before(async () => {
    installDom()
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8k-cover')
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
        name: 'zlog-8k-stubs',
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
            namespace: 'zlog-8k',
          }))
          buildApi.onResolve({ filter: /^signature_pad$/ }, () => ({
            path: 'signature_pad',
            namespace: 'zlog-8k',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({
            path: 'supabase-client',
            namespace: 'zlog-8k',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-cover-pending$/ }, () => ({
            path: 'cover-pending',
            namespace: 'zlog-8k',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveAtSpecifier(args.path),
          }))
          buildApi.onResolve({ filter: /\.css$/ }, (args) => ({
            path: args.path,
            namespace: 'zlog-8k-css',
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8k' }, (args) => ({
            contents: stubs[args.path](),
            loader: 'js',
            resolveDir: join(repoRoot, 'lib'),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8k-css' }, () => ({
            contents: '',
            loader: 'js',
          }))
        },
      }],
    })
    workbenchModule = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
  })

  after(async () => {
    if (root) await act(async () => root.unmount())
    if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL
    if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL
    if (originalFile) globalThis.File = originalFile
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    if (root) {
      await act(async () => root.unmount())
      root = null
    }
    resetSignals()
  })

  it('revokes unsynced editor cover B once on Hide and leaves Workbench A untouched', async () => {
    seedHttpsCover()
    await mountWorkbench()
    await openEditor(HTTPS_COVER)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'hide'
    await hideEditor()

    assert.equal(revokeCount('blob:editor-b'), 1, diagnostic('B must be revoked once on Hide'))
    assert.equal(revokeCount(HTTPS_COVER), 0, diagnostic('Workbench A must stay unrevoked'))
    assert.equal(workbenchCover()?.preview || globalThis.__zlogWorkbenchCover?.preview, HTTPS_COVER)
  })

  it('does not revoke seeded Workbench blob A when the editor hides unchanged', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    globalThis.__zlogPhase = 'hide'
    await hideEditor()

    assert.equal(revokeCount(SEEDED_BLOB), 0, diagnostic('unchanged seeded A'))
    assert.equal(workbenchCover()?.preview, SEEDED_BLOB)
    assert.equal(workbenchCover()?.file?.name, 'cover-a.jpg')
  })

  it('does not revoke seeded A when B is chosen, and revokes B once on Hide', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'hide'
    await hideEditor()

    assert.deepEqual({
      aOnSelect: revokeCountDuring(SEEDED_BLOB, 'select'),
      aTotal: revokeCount(SEEDED_BLOB),
      bOnHide: revokeCountDuring('blob:editor-b', 'hide'),
      bTotal: revokeCount('blob:editor-b'),
    }, {
      aOnSelect: 0,
      aTotal: 0,
      bOnHide: 1,
      bTotal: 1,
    }, diagnostic('seeded A then unsynced B'))
  })

  it('revokes old A once at the successful handoff, keeps B, then lets Workbench load reset revoke B once', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'handoff'
    await saveProjectDetails()
    const held = workbenchCover()
    const beforeReset = {
      aOnSelect: revokeCountDuring(SEEDED_BLOB, 'select'),
      aOnHandoff: revokeCountDuring(SEEDED_BLOB, 'handoff'),
      bBeforeReset: revokeCount('blob:editor-b'),
      preview: held?.preview || null,
      file: held?.file?.name || null,
    }
    globalThis.__zlogPhase = 'load-reset'
    await act(async () => {
      globalThis.__zlogSetEditQuery('true')
    })
    await waitFor(
      () => revokeCountDuring('blob:editor-b', 'load-reset') >= 1
        || (workbenchCover()?.preview && workbenchCover().preview !== 'blob:editor-b'),
      'Workbench load reset did not replace B',
    )

    assert.deepEqual({
      ...beforeReset,
      bOnReset: revokeCountDuring('blob:editor-b', 'load-reset'),
      bTotal: revokeCount('blob:editor-b'),
    }, {
      aOnSelect: 0,
      aOnHandoff: 1,
      bBeforeReset: 0,
      preview: 'blob:editor-b',
      file: 'editor-b.jpg',
      bOnReset: 1,
      bTotal: 1,
    }, diagnostic('successful A to B handoff'))
  })

  it('does not revoke seeded A when Remove is hidden without Save', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    globalThis.__zlogPhase = 'remove'
    await clickLabel('Remove cover photo')
    globalThis.__zlogPhase = 'hide'
    await hideEditor()

    assert.equal(revokeCount(SEEDED_BLOB), 0, diagnostic('Remove then Hide'))
    assert.equal(workbenchCover()?.preview, SEEDED_BLOB)
    assert.equal(workbenchCover()?.file?.name, 'cover-a.jpg')
  })

  it('revokes seeded A once at the successful remove handoff, not when Remove is clicked', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    globalThis.__zlogPhase = 'remove'
    await clickLabel('Remove cover photo')
    globalThis.__zlogPhase = 'handoff'
    await saveProjectDetails()

    assert.deepEqual({
      aOnRemove: revokeCountDuring(SEEDED_BLOB, 'remove'),
      aOnHandoff: revokeCountDuring(SEEDED_BLOB, 'handoff'),
      aTotal: revokeCount(SEEDED_BLOB),
      preview: workbenchCover()?.preview || null,
    }, {
      aOnRemove: 0,
      aOnHandoff: 1,
      aTotal: 1,
      preview: null,
    }, diagnostic('Remove then Save'))
  })

  it('revokes editor-owned B once when Remove happens before Save', async () => {
    seedHttpsCover()
    await mountWorkbench()
    await openEditor(HTTPS_COVER)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'remove'
    await clickLabel('Remove cover photo')

    assert.equal(revokeCount('blob:editor-b'), 1, diagnostic('Remove editor B'))
    assert.equal(revokeCountDuring('blob:editor-b', 'remove'), 1)
    assert.equal(editorCover(), null)
    assert.equal(findNamed('SiteDiaryProjectDetailsSection') ? true : false, true)
  })

  it('revokes editor-owned B once when it is replaced by C, and keeps C', async () => {
    seedHttpsCover()
    await mountWorkbench()
    await openEditor(HTTPS_COVER)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'replace'
    await chooseCover('editor-c')

    assert.equal(revokeCount('blob:editor-b'), 1, diagnostic('replace B with C'))
    assert.equal(revokeCountDuring('blob:editor-b', 'replace'), 1)
    assert.equal(revokeCount('blob:editor-c'), 0)
    assert.equal(editorCover()?.preview, 'blob:editor-c')
    assert.equal(findNamed('SiteDiaryProjectDetailsSection') ? true : false, true)
  })

  it('revokes unsynced B once when the real report reseed replaces editor cover', async () => {
    seedHttpsCover(REPORT_A)
    seedHttpsCover(REPORT_B)
    await mountWorkbench()
    await openEditor(HTTPS_COVER)
    globalThis.__zlogPhase = 'select'
    await chooseCover('editor-b')
    globalThis.__zlogPhase = 'reseed'
    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(
      () => editorCover()?.preview !== 'blob:editor-b',
      'report reseed did not replace the editor cover',
    )

    assert.equal(revokeCount('blob:editor-b'), 1, diagnostic('reseed must revoke unsynced B'))
    assert.equal(revokeCount(HTTPS_COVER), 0, diagnostic('editor must not revoke the seeded preview'))
    assert.notEqual(editorCover()?.preview, 'blob:editor-b')
  })

  it('does not revoke seeded A when Save copies the same preview onto a new object', async () => {
    seedFileCover()
    await mountWorkbench()
    await openEditor(SEEDED_BLOB)
    const roleInput = (() => {
      let found = null
      walkFibers(reactFiber(host), (fiber) => {
        const props = fiber.memoizedProps
        if (fiber.type === 'input' && props?.placeholder === 'e.g. Site Manager' && typeof props.onChange === 'function') {
          found = props.onChange
        }
      })
      return found
    })()
    if (typeof roleInput !== 'function') {
      throw new Error(`missing author role field: ${diagnostic('author role')}`)
    }
    globalThis.__zlogPhase = 'edit-role'
    await act(async () => {
      roleInput({ target: { value: 'Foreman' }, currentTarget: { value: 'Foreman' } })
    })
    globalThis.__zlogPhase = 'handoff'
    await saveProjectDetails()
    const held = workbenchCover()

    assert.equal(revokeCount(SEEDED_BLOB), 0, diagnostic('unchanged preview must survive Save'))
    assert.equal(held?.preview, SEEDED_BLOB)
    assert.notEqual(held, editorCover())
  })
})
