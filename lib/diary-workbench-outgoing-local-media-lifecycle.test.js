/**
 * Defect #8J — Workbench signature and Location Walk local blob ownership.
 *
 * Drives the real SiteDiaryWorkbenchSurface load reset and the real
 * AiLocationWalk draft ledger. Product code is unchanged until RED is recorded.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement, Component, useLayoutEffect, useState } from 'react'
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
let originalFile = null

function revokeCount(url) {
  return revokedUrls.filter((item) => item === url).length
}

function taggedFile(tag) {
  const file = new File([tag], `${tag}.jpg`, { type: 'image/jpeg' })
  Object.defineProperty(file, 'zlogTag', { value: tag })
  return file
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
      value: '',
      options: tag === 'select' ? [] : undefined,
    }
    return Object.assign(node, {
      appendChild(child) {
        child.parentNode = this
        this.childNodes.push(child)
        if (child.nodeType === 1) this.children.push(child)
        if (this.nodeName === 'SELECT' && child.nodeName === 'OPTION') {
          child.value = child.value ?? child.attributes?.value ?? ''
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
        if (name === 'value' || name === 'src' || name === 'alt' || name.startsWith('data-')) {
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
      toBlob(callback) {
        const blob = new Blob(['signature'], { type: 'image/png' })
        Object.defineProperty(blob, 'zlogTag', {
          value: globalThis.__zlogSignatureTag || 'signature-a',
        })
        callback(blob)
      },
      querySelector() { return null },
      querySelectorAll() { return [] },
      getRootNode() { return this.ownerDocument || this },
      setPointerCapture() {},
      releasePointerCapture() {},
      hasPointerCapture() { return false },
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
  globalThis.Element.prototype.releasePointerCapture = function releasePointerCapture() {}
  globalThis.Element.prototype.hasPointerCapture = function hasPointerCapture() { return false }
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
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  host = document.createElement('div')
  body.appendChild(host)
  globalThis.__zlogHarnessErrors = []
  globalThis.__zlogLoadStarts = 0
  const originalConsoleLog = console.log
  console.log = (...args) => {
    if (args.some((item) => String(item).includes('load:start'))) {
      globalThis.__zlogLoadStarts += 1
    }
    originalConsoleLog.apply(console, args)
  }
  const originalConsoleError = console.error
  console.error = (...args) => {
    globalThis.__zlogHarnessErrors.push(args.map((item) => {
      if (item instanceof Error) return item.stack || item.message
      return String(item)
    }).join(' ').slice(0, 500))
    originalConsoleError.apply(console, args)
  }
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
    revokedUrls.push(String(url))
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
  revokedUrls.length = 0
  globalThis.__zlogResetBlobNames?.()
  globalThis.__zlogReportId = REPORT_A
  globalThis.__zlogEditQuery = '1'
  globalThis.__zlogSignatureUrl = null
  globalThis.__zlogSignatureTag = 'signature-a'
  globalThis.__zlogPadEmpty = true
  globalThis.__zlogLastPad = null
  globalThis.__zlogTransferWalk = []
  globalThis.__zlogKeepDraftFile = false
  globalThis.__zlogHarnessErrors = []
  globalThis.__zlogLoadStarts = 0
}

function childText(children) {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childText).join('')
  if (typeof children === 'object' && children.props) return childText(children.props.children)
  return ''
}

function reactFiber(node) {
  if (!node) return null
  const key = Object.keys(node).find((item) => (
    item.startsWith('__reactContainer$') || item.startsWith('__reactFiber$')
  ))
  if (!key) return null
  const value = node[key]
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
    const child = current.child || current.alternate?.child
    if (child) stack.push(child)
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

function findEditForArea(areaName) {
  let bestClick = null
  let bestSize = Infinity
  walkFibers(reactFiber(host), (fiber) => {
    const names = new Set()
    let editClick = null
    let size = 0
    walkFibers(fiber, (child) => {
      size += 1
      const text = fiberLabel(child).replace(/\s+/g, ' ').trim()
      const title = text.match(/^Work Area\s+\S\s+(\S+)$/)
      if (title) names.add(title[1])
      if (text !== 'Edit') return
      let current = child
      while (current) {
        if (typeof current.memoizedProps?.onClick === 'function') {
          editClick = current.memoizedProps.onClick
          break
        }
        if (current === fiber) break
        current = current.return
      }
    })
    if (names.size === 1 && names.has(areaName) && editClick && size < bestSize) {
      bestClick = editClick
      bestSize = size
    }
  })
  return bestClick
}

function findAriaClick(label) {
  let found = null
  walkFibers(reactFiber(host), (fiber) => {
    if (fiber.memoizedProps?.['aria-label'] !== label) return
    if (typeof fiber.memoizedProps?.onClick === 'function') found = fiber.memoizedProps.onClick
  })
  return found
}

function areaTitleVisible(areaName) {
  let found = false
  walkFibers(reactFiber(host), (fiber) => {
    const text = fiberLabel(fiber).replace(/\s+/g, ' ').trim()
    const title = text.match(/^Work Area\s+\S\s+(\S+)/)
    if (title && title[1] === areaName) found = true
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

function findNameInput() {
  let found = null
  walkFibers(reactFiber(host), (fiber) => {
    const props = fiber.memoizedProps
    if (fiber.type !== 'input' || props?.type === 'file') return
    const placeholder = String(props?.placeholder || '')
    if (placeholder.includes('Ground Floor') && typeof props.onChange === 'function') {
      found = props.onChange
    }
  })
  return found
}

function findFileInput() {
  const walk = findNamed('AiLocationWalk')
  let found = null
  walkFibers(walk, (fiber) => {
    const props = fiber.memoizedProps
    if (
      fiber.type === 'input'
      && props?.type === 'file'
      && props?.multiple
      && typeof props.onChange === 'function'
    ) {
      found = props.onChange
    }
  })
  return found
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

function isFlatPhoto(item) {
  return Boolean(item && typeof item === 'object' && 'preview' in item && 'file' in item && 'key' in item)
}

function isDraftPhoto(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && item.id
    && 'preview' in item
    && 'imageUrl' in item
    && !('key' in item),
  )
}

function photosRefFrom(fiber) {
  const refs = refObjects(fiber).filter((ref) => Array.isArray(ref.current))
  return refs.find((ref) => ref.current.some(isFlatPhoto))
    || refs.find((ref) => ref.current.every(isFlatPhoto))
    || null
}

function draftRefFrom(fiber) {
  const refs = refObjects(fiber).filter((ref) => Array.isArray(ref.current))
  return refs.find((ref) => ref.current.some(isDraftPhoto)) || refs[refs.length - 1] || null
}

function signatureRefsFrom(fiber) {
  return refObjects(fiber).filter((ref) => (
    ref.current == null
    || (
      ref.current
      && typeof ref.current === 'object'
      && 'preview' in ref.current
      && 'file' in ref.current
      && 'storagePath' in ref.current
      && !('key' in ref.current)
      && !('id' in ref.current)
    )
  ))
}

function dispatchPhase(fiber, nextPhase) {
  let hook = fiber?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (
      (state === 'create' || state === 'review' || state === 'after_save' || state === 'handed_off')
      && typeof hook.queue?.dispatch === 'function'
    ) {
      hook.queue.dispatch(nextPhase)
      return true
    }
    hook = hook.next
  }
  return false
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
  return params
}
`
}

function dynamicStubSource() {
  return `
import { createElement } from 'react'
export default function dynamic() {
  return function ZlogDynamicStub() {
    return createElement('div', null)
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
  constructor() {
    this.listeners = {}
    globalThis.__zlogLastPad = this
  }
  on() { return this }
  off() { return this }
  clear() {}
  isEmpty() { return globalThis.__zlogPadEmpty !== false }
  addEventListener(name, fn) {
    this.listeners[name] = this.listeners[name] || []
    this.listeners[name].push(fn)
  }
  removeEventListener(name, fn) {
    this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== fn)
  }
  emit(name) {
    for (const fn of this.listeners[name] || []) fn()
  }
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
    signature_url: globalThis.__zlogSignatureUrl || null,
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
  return {
    auth: {
      getUser() {
        return Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
    from(table) { return chain(table) },
    storage: {
      from() {
        return {
          createSignedUrl: async (_path) => ({ data: { signedUrl: 'https://signed.example/signature' }, error: null }),
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

function coverPendingStubSource() {
  return `
export async function getPendingCover() { return null }
export async function putPendingCover() { return { ok: false } }
export async function syncPendingCoverUpload() { return { ok: false } }
export function fileFromPendingCover() { return null }
export function markPendingCoverRemoved() {}
export function newCoverPendingGeneration() { return 'gen' }
`
}

function persistSaveAreaStubSource() {
  return `
export const SAVE_AREA_PERSIST_FAIL_MESSAGE = 'We could not save this photo area yet.'

export async function persistSaveAreaGroup(_client, args) {
  const photos = (args?.locationWalk || []).flatMap((group) => group?.photos || [])
  globalThis.__zlogPersistTrace = 'groups=' + ((args?.locationWalk || []).length) + ';photos=' + photos.length + ';name=' + ((args?.savedGroup?.areaName) || '')
  const locationWalk = (args?.locationWalk || []).map((group) => ({
    ...group,
    photos: (group?.photos || []).map((photo) => {
      const preview = String(photo?.preview || '')
      const dropFile = preview.includes('walk-a2') || !globalThis.__zlogKeepDraftFile
      return {
        ...photo,
        file: dropFile ? null : photo.file,
        preview: photo?.preview || null,
        imageUrl: photo?.imageUrl || photo?.storagePath || 'stored/photo',
        storagePath: photo?.storagePath || photo?.imageUrl || 'stored/photo',
      }
    }),
  }))
  return { ok: true, locationWalk }
}
`
}

function WorkbenchHost() {
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
    globalThis.__zlogRerender = () => setTick((value) => value + 1)
  }, [])
  const Workbench = workbenchModule.default
  return createElement(
    'div',
    { 'data-report': reportId, 'data-edit': editQuery, 'data-tick': String(tick) },
    createElement(Workbench),
  )
}

class TransferBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: '' }
  }

  static getDerivedStateFromError(error) {
    globalThis.__zlogHarnessErrors.push(String(error?.stack || error))
    return { error: String(error?.message || error) }
  }

  render() {
    if (this.state.error) return createElement('div', null, this.state.error)
    return this.props.children
  }
}

function TransferHost() {
  const [walk, setWalk] = useState([])
  const [open, setOpen] = useState(true)
  useLayoutEffect(() => {
    globalThis.__zlogTransferWalk = walk
    globalThis.__zlogTransferRendered = open ? 'open' : 'closed'
  }, [walk, open])
  if (!open) return createElement('div', { 'data-transfer-closed': '1' })
  return createElement(
    TransferBoundary,
    null,
    createElement(
      'div',
      { 'data-transfer-host': '1' },
      createElement(workbenchModule.AiLocationWalk, {
        value: walk,
        projectId: 'project-1',
        onChange(next) {
          setWalk(next)
          setOpen(false)
        },
        onAreaSaved: async (_saved, meta) => ({
          ok: true,
          locationWalk: (meta?.locationWalk || []).map((group) => ({
            ...group,
            photos: (group?.photos || []).map((photo) => ({
              ...photo,
              file: null,
              preview: photo?.preview || null,
              imageUrl: photo?.imageUrl || 'stored/draft-transfer',
            })),
          })),
        }),
      }),
    ),
  )
}

async function waitFor(predicate, label) {
  const started = Date.now()
  while (Date.now() - started < 8000) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  const rootFiber = reactFiber(host)
  const texts = []
  walkFibers(rootFiber, (fiber) => {
    const text = fiberLabel(fiber).replace(/\s+/g, ' ').trim()
    if (!text || text.length > 90) return
    if (!/area|photo|enter|saving|could|clear|signature|workbench/i.test(text)) return
    if (texts.length < 16 && !texts.includes(text)) texts.push(text)
  })
  const nameValues = []
  walkFibers(rootFiber, (fiber) => {
    if (fiber.type !== 'input' || fiber.memoizedProps?.type === 'file') return
    if (nameValues.length >= 6) return
    nameValues.push(`${fiber.memoizedProps?.placeholder || fiber.memoizedProps?.type || 'input'}=${fiber.memoizedProps?.value ?? ''}`)
  })
  const walk = findNamed('AiLocationWalk')
  const phase = (() => {
    let hook = walk?.memoizedState
    while (hook) {
      const state = hook.memoizedState
      if (state === 'create' || state === 'review' || state === 'after_save' || state === 'handed_off') return state
      hook = hook.next
    }
    return ''
  })()
  const draft = draftRefFrom(walk)
  throw new Error(`timeout: ${label}; phase=${phase}; drafts=${(draft?.current || []).map((photo) => photo.preview).join(',')}; rendered=${globalThis.__zlogTransferRendered || ''}; name=${nameValues.join('|')}; texts=${texts.join(' / ')}; errors=${(globalThis.__zlogHarnessErrors || []).slice(-1).join(' ')}`)
}

async function mountWorkbench() {
  root = createRoot(host, {
    onUncaughtError(error) {
      globalThis.__zlogHarnessErrors.push(String(error?.stack || error))
    },
    onCaughtError(error) {
      globalThis.__zlogHarnessErrors.push(String(error?.stack || error))
    },
  })
  await act(async () => {
    root.render(createElement(WorkbenchHost))
  })
  await waitFor(() => Boolean(findNamed('AiLocationWalk')), 'location walk did not mount')
}

async function mountTransferHost() {
  const island = document.createElement('div')
  island.transferMarker = 'island'
  document.body.appendChild(island)
  host = island
  root = createRoot(island, {
    onUncaughtError(error) {
      globalThis.__zlogHarnessErrors.push(String(error?.stack || error))
    },
  })
  let renderError = ''
  try {
    await act(async () => {
      root.render(createElement('div', { 'data-probe': '1' }, 'probe'))
    })
  } catch (error) {
    renderError = String(error?.stack || error)
  }
  const probeChild = fiberName(reactFiber(host)?.child)
  try {
    await act(async () => {
      root.render(createElement(TransferHost))
    })
  } catch (error) {
    renderError = String(error?.stack || error)
  }
  if (!findNamed('AiLocationWalk')) {
    throw new Error(`transfer render failed; probe=${probeChild}; rendered=${globalThis.__zlogTransferRendered || ''}; child=${fiberName(reactFiber(host)?.child)}; renderError=${renderError}; errors=${(globalThis.__zlogHarnessErrors || []).join(' | ')}`)
  }
}

async function drawSignature(tag) {
  globalThis.__zlogSignatureTag = tag
  globalThis.__zlogPadEmpty = false
  await waitFor(() => Boolean(globalThis.__zlogLastPad), 'signature pad did not mount')
  await act(async () => {
    globalThis.__zlogLastPad.emit('endStroke')
  })
  await act(async () => {})
  globalThis.__zlogPadEmpty = true
  await waitFor(() => signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
    .some((ref) => ref.current?.preview === `blob:${tag}`), `signature ${tag} did not publish`)
}

async function addDraftFile(tag) {
  const onChange = findFileInput()
  assert.ok(onChange, 'file input')
  const file = taggedFile(tag)
  await act(async () => {
    onChange({ target: { files: [file], value: 'x' } })
  })
  await waitFor(() => createdUrls.includes(`blob:${tag}`), `draft ${tag} was not created`)
  const draft = draftRefFrom(findNamed('AiLocationWalk'))
  assert.ok(
    draft?.current?.some((photo) => photo.preview === `blob:${tag}`),
    `draft ${tag} was not stored; previews=${(draft?.current || []).map((photo) => photo.preview).join(',')}`,
  )
}

async function nameArea(name) {
  const onChange = findNameInput()
  assert.ok(onChange, 'area name input')
  await act(async () => {
    onChange({ target: { value: name } })
  })
  await act(async () => {})
}

async function clickLabel(label) {
  const onClick = findClick(label)
  assert.ok(onClick, `missing control: ${label}; controls=${clickableLabels().join(' | ')}`)
  await act(async () => {
    const result = onClick({ preventDefault() {}, stopPropagation() {} })
    if (result && typeof result.then === 'function') {
      await result
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
  })
}

async function saveNamedArea(name) {
  await nameArea(name)
  const onClick = findClick('Save Area')
  assert.ok(onClick, `missing control: Save Area; controls=${clickableLabels().join(' | ')}`)
  const beforeDrafts = (draftRefFrom(findNamed('AiLocationWalk'))?.current || []).map((photo) => photo.preview).join(',')
  let nameValue = ''
  walkFibers(reactFiber(host), (fiber) => {
    if (fiber.type === 'input' && String(fiber.memoizedProps?.placeholder || '').includes('Ground Floor')) {
      nameValue = String(fiber.memoizedProps?.value ?? '')
    }
  })
  await act(async () => {
    const result = onClick({ preventDefault() {}, stopPropagation() {} })
    if (result && typeof result.then === 'function') {
      await result
    }
  })
  const walk = findNamed('AiLocationWalk')
  let phase = ''
  let hook = walk?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (state === 'create' || state === 'review' || state === 'after_save' || state === 'handed_off') {
      phase = state
      break
    }
    hook = hook.next
  }
  const strings = []
  hook = walk?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (typeof state === 'string' && state) strings.push(state.slice(0, 60))
    hook = hook.next
  }
  const objects = []
  hook = walk?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (state && typeof state === 'object' && !Array.isArray(state) && !('current' in state)) {
      const brief = state.areaName || state.name || state.message || state.id || ''
      if (brief) objects.push(String(brief).slice(0, 40))
    }
    hook = hook.next
  }
  const arrays = []
  hook = walk?.memoizedState
  while (hook) {
    const state = hook.memoizedState
    if (Array.isArray(state)) {
      arrays.push(state.map((item) => item?.preview || item?.areaName || item?.name || typeof item).join(',').slice(0, 80))
    }
    hook = hook.next
  }
  const published = (photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || [])
    .some((row) => String(row.preview || '').startsWith('blob:'))
  if (!findClick('Add Another Area') && !findClick('Edit') && !published) {
    throw new Error(`save did not finish; phase=${phase}; name=${nameValue}; drafts=${beforeDrafts}; strings=${strings.join('|')}; persist=${globalThis.__zlogPersistTrace || 'none'}`)
  }
}

describe('Defect #8J — Workbench signature and Location Walk blob ownership', { concurrency: 1 }, () => {
  before(async () => {
    installDom()
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8j-media')
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    const outfile = join(cacheDir, 'workbench.mjs')
    await build({
      stdin: {
        contents: [
          "export { default } from './components/site-diary/SiteDiaryWorkbenchSurface.jsx'",
          "export { AiLocationWalk } from './components/ai-annotation/AiLocationWalk.jsx'",
          '',
        ].join('\n'),
        resolveDir: repoRoot,
        sourcefile: 'workbench-media-entry.js',
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
        name: 'zlog-8j-stubs',
        setup(buildApi) {
          const stubs = {
            'next/navigation': navigationStubSource,
            'next/dynamic': dynamicStubSource,
            'next/link': linkStubSource,
            signature_pad: signaturePadStubSource,
            'supabase-client': supabaseStubSource,
            'cover-pending': coverPendingStubSource,
            'persist-save-area': persistSaveAreaStubSource,
          }
          buildApi.onResolve({ filter: /^next\/(navigation|dynamic|link)$/ }, (args) => ({
            path: args.path,
            namespace: 'zlog-8j',
          }))
          buildApi.onResolve({ filter: /^signature_pad$/ }, () => ({
            path: 'signature_pad',
            namespace: 'zlog-8j',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({
            path: 'supabase-client',
            namespace: 'zlog-8j',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/diary-cover-pending$/ }, () => ({
            path: 'cover-pending',
            namespace: 'zlog-8j',
          }))
          buildApi.onResolve({ filter: /^@\/lib\/photo-workspace\/persist-save-area$/ }, () => ({
            path: 'persist-save-area',
            namespace: 'zlog-8j',
          }))
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveAtSpecifier(args.path),
          }))
          buildApi.onResolve({ filter: /\.css$/ }, (args) => ({
            path: args.path,
            namespace: 'zlog-8j-css',
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8j' }, (args) => ({
            contents: stubs[args.path](),
            loader: 'js',
            resolveDir: join(repoRoot, 'lib'),
          }))
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8j-css' }, () => ({
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

  it('does not publish report A signature blob into report B', async () => {
    await mountWorkbench()
    await drawSignature('signature-a')
    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(() => globalThis.__zlogReportId === REPORT_B && Boolean(findNamed('AiLocationWalk')), 'report B form')
    const signatureRefs = signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
    assert.equal(revokeCount('blob:signature-a'), 1)
    assert.equal(signatureRefs.some((ref) => ref.current?.preview === 'blob:signature-a'), false)
    assert.equal(revokeCount('https://signed.example/signature'), 0)
  })

  it('revokes an active signature once when the Workbench unmounts', async () => {
    await mountWorkbench()
    await drawSignature('signature-a')
    await act(async () => root.unmount())
    root = null
    assert.equal(revokeCount('blob:signature-a'), 1)
  })

  it('revokes committed Location Walk blobs once when the Workbench switches reports', async () => {
    await mountWorkbench()
    await addDraftFile('walk-a2')
    await nameArea('Slab')
    globalThis.__zlogKeepDraftFile = true
    await addDraftFile('walk-a1')
    await saveNamedArea('Slab')
    globalThis.__zlogKeepDraftFile = false
    const photosRef = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))
    assert.ok(photosRef?.current?.some((row) => row.preview === 'blob:walk-a2' && row.file == null))
    assert.ok(photosRef?.current?.some((row) => row.preview === 'blob:walk-a1' && row.file))
    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(() => globalThis.__zlogReportId === REPORT_B && Boolean(findNamed('AiLocationWalk')), 'report B after walk reset')
    assert.equal(revokeCount('blob:walk-a1'), 1)
    assert.equal(revokeCount('blob:walk-a2'), 1)
    const after = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))
    assert.deepEqual(after?.current || [], [])
  })

  it('revokes a committed Location Walk blob once when the Workbench unmounts', async () => {
    await mountWorkbench()
    await addDraftFile('walk-a1')
    globalThis.__zlogKeepDraftFile = true
    await saveNamedArea('Slab')
    globalThis.__zlogKeepDraftFile = false
    await act(async () => root.unmount())
    root = null
    assert.equal(revokeCount('blob:walk-a1'), 1)
  })

  it('revokes outgoing local media when the same report load effect runs again', async () => {
    await mountWorkbench()
    await addDraftFile('walk-a1')
    globalThis.__zlogKeepDraftFile = true
    await saveNamedArea('Slab')
    globalThis.__zlogKeepDraftFile = false
    assert.ok(photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))
      ?.current?.some((row) => row.preview === 'blob:walk-a1'))
    await drawSignature('signature-a')
    assert.ok(signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
      .some((ref) => ref.current?.preview === 'blob:signature-a'))
    assert.ok(photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))
      ?.current?.some((row) => row.preview === 'blob:walk-a1'))
    assert.equal(globalThis.__zlogReportId, REPORT_A)
    const loadsBefore = globalThis.__zlogLoadStarts
    globalThis.__zlogSignatureUrl = 'user-1/report-a/signature.png'
    await act(async () => {
      globalThis.__zlogSetEditQuery('edit')
    })
    await waitFor(() => (
      globalThis.__zlogLoadStarts > loadsBefore
      && globalThis.__zlogReportId === REPORT_A
      && Boolean(findNamed('AiLocationWalk'))
      && signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
        .some((ref) => ref.current?.preview === 'https://signed.example/signature')
      && !(photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || [])
        .some((row) => row.preview === 'blob:walk-a1')
    ), 'same-report reload did not reset outgoing media')
    assert.deepEqual({
      signature: revokeCount('blob:signature-a'),
      walk: revokeCount('blob:walk-a1'),
      signed: revokeCount('https://signed.example/signature'),
    }, {
      signature: 1,
      walk: 1,
      signed: 0,
    })
  })

  it('clears replace backup so a later cancel cannot restore report A', async () => {
    await mountWorkbench()
    await drawSignature('signature-a')
    await waitFor(() => Boolean(findClick('Replace signature')), 'Replace signature did not render')
    await clickLabel('Replace signature')
    await waitFor(() => Boolean(findClick('Cancel replacement')), 'Replace signature did not enter replacement')
    const during = signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
      .filter((ref) => ref.current?.preview === 'blob:signature-a')
    assert.equal(during.length, 2)
    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(() => globalThis.__zlogReportId === REPORT_B && Boolean(findNamed('AiLocationWalk')), 'report B after replace')
    const heldAfterReset = signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
      .filter((ref) => ref.current?.preview === 'blob:signature-a').length
    const restore = findClick('Cancel replacement') || findClick('Clear')
    assert.ok(restore, 'replacement cancel/clear was not rendered after reset')
    await act(async () => {
      restore({ preventDefault() {}, stopPropagation() {} })
    })
    const restored = signatureRefsFrom(findNamed('SiteDiaryWorkbenchSurface'))
      .some((ref) => ref.current?.preview === 'blob:signature-a')
    assert.deepEqual({
      heldAfterReset,
      revoked: revokeCount('blob:signature-a'),
      restored,
    }, {
      heldAfterReset: 0,
      revoked: 1,
      restored: false,
    })
  })

  it('revokes an uncommitted draft blob when Location Walk unmounts', async () => {
    await mountWorkbench()
    await addDraftFile('draft-a')
    const draftRef = draftRefFrom(findNamed('AiLocationWalk'))
    assert.ok(draftRef?.current?.some((photo) => photo.preview === 'blob:draft-a'))
    await act(async () => {
      globalThis.__zlogSetReport(REPORT_B)
    })
    await waitFor(() => globalThis.__zlogReportId === REPORT_B && Boolean(findNamed('AiLocationWalk')), 'report B after draft unmount')
    assert.equal(revokeCount('blob:draft-a'), 1)
  })

  it('keeps a transferred draft blob with the Workbench when the child unmounts first', async () => {
    await mountTransferHost()
    await addDraftFile('draft-transfer')
    await nameArea('Deck')
    const draftRef = draftRefFrom(findNamed('AiLocationWalk'))
    assert.ok(draftRef)
    await clickLabel('Save Area')
    await waitFor(() => globalThis.__zlogTransferWalk?.some?.((group) => (
      group.photos?.some((photo) => photo.preview === 'blob:draft-transfer')
    )), 'transfer did not reach the parent walk')
    assert.equal(revokeCount('blob:draft-transfer'), 0)
    assert.equal(draftRef.current?.some?.((photo) => photo.preview === 'blob:draft-transfer') || false, false)
    await act(async () => root.unmount())
    root = null

    globalThis.__zlogResetBlobNames?.()
    await mountWorkbench()
    await addDraftFile('draft-transfer')
    globalThis.__zlogKeepDraftFile = true
    await saveNamedArea('Deck')
    globalThis.__zlogKeepDraftFile = false
    const owned = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))
    const transferred = owned?.current?.find((row) => String(row.preview || '').startsWith('blob:draft-transfer'))
    assert.ok(transferred?.preview)
    await act(async () => root.unmount())
    root = null
    assert.equal(revokeCount(transferred.preview), 1)
  })

  it('revokes uncommitted drafts on cancel, edit, and begin-create without a second unmount revoke', async () => {
    const outcomes = []
    async function discard(label, prepare) {
      await mountWorkbench()
      await prepare()
      const draftRef = draftRefFrom(findNamed('AiLocationWalk'))
      const url = draftRef?.current?.map((photo) => photo.preview).find((preview) => String(preview).startsWith('blob:discard-'))
      assert.ok(url, `discard draft was not created for ${label}`)
      assert.ok(draftRef?.current?.some((photo) => photo.preview === url))
      await clickLabel(label)
      const revoked = revokeCount(url)
      const stillOwned = Boolean(draftRef.current?.some?.((photo) => photo.preview === url))
      await act(async () => root.unmount())
      root = null
      outcomes.push({
        label,
        revoked,
        stillOwned,
        revokedAfterUnmount: revokeCount(url),
      })
    }

    await discard('Cancel', async () => {
      await addDraftFile('discard-cancel-saved')
      globalThis.__zlogKeepDraftFile = true
      await saveNamedArea('Yard')
      globalThis.__zlogKeepDraftFile = false
      await clickLabel('Add Another Area')
      await addDraftFile('discard-cancel')
    })

    await discard('Edit', async () => {
      await addDraftFile('discard-edit-saved')
      globalThis.__zlogKeepDraftFile = true
      await saveNamedArea('Wall')
      globalThis.__zlogKeepDraftFile = false
      await clickLabel('Add Another Area')
      await addDraftFile('discard-edit')
    })

    await discard('Add Another Area', async () => {
      await addDraftFile('discard-begin')
      const walk = findNamed('AiLocationWalk')
      await act(async () => {
        assert.equal(dispatchPhase(walk, 'handed_off'), true)
      })
      await waitFor(() => Boolean(findClick('Add Another Area')), 'Add Another Area did not render')
    })

    assert.deepEqual(outcomes, [
      { label: 'Cancel', revoked: 1, stillOwned: false, revokedAfterUnmount: 1 },
      { label: 'Edit', revoked: 1, stillOwned: false, revokedAfterUnmount: 1 },
      { label: 'Add Another Area', revoked: 1, stillOwned: false, revokedAfterUnmount: 1 },
    ])
  })

  it('revokes a committed local blob once when Delete Area removes its group', async () => {
    await mountWorkbench()
    await addDraftFile('delete-area-a')
    await saveNamedArea('Slab')
    await clickLabel('Add Another Area')
    await addDraftFile('survivor-b')
    await saveNamedArea('Wall')
    const before = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || []
    assert.ok(before.some((row) => row.preview === 'blob:delete-area-a'))
    assert.ok(before.some((row) => row.preview === 'blob:survivor-b'))
    const editSlab = findEditForArea('Slab')
    assert.ok(editSlab, `missing Edit for Slab; controls=${clickableLabels().join(' | ')}`)
    await act(async () => {
      editSlab({ preventDefault() {}, stopPropagation() {} })
    })
    await waitFor(() => Boolean(findClick('Delete area')), 'Delete area did not render')
    await clickLabel('Delete area')
    await waitFor(() => {
      const rows = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || []
      return !rows.some((row) => row.preview === 'blob:delete-area-a')
        && rows.some((row) => row.preview === 'blob:survivor-b')
    }, 'Delete area did not leave only the surviving area')
    assert.equal(areaTitleVisible('Slab'), false)
    assert.equal(areaTitleVisible('Wall'), true)
    assert.equal(revokeCount('blob:delete-area-a'), 1)
    assert.equal(revokeCount('blob:survivor-b'), 0)
    await act(async () => root.unmount())
    root = null
    assert.equal(revokeCount('blob:delete-area-a'), 1)
  })

  it('revokes a file-null committed blob once when that photo is removed', async () => {
    await mountWorkbench()
    await addDraftFile('remove-photo-a')
    await nameArea('Slab')
    await addDraftFile('remove-photo-keep')
    await saveNamedArea('Slab')
    const before = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || []
    const target = before.find((row) => row.preview === 'blob:remove-photo-a')
    const kept = before.find((row) => row.preview === 'blob:remove-photo-keep')
    assert.ok(target)
    assert.equal(target.file, null)
    assert.ok(kept)
    const photoNumber = before.findIndex((row) => row.preview === 'blob:remove-photo-a') + 1
    await clickLabel('Edit')
    await waitFor(() => Boolean(findAriaClick(`Delete Photo ${photoNumber}`)), 'Remove Photo did not render')
    const openConfirm = findAriaClick(`Delete Photo ${photoNumber}`)
    await act(async () => {
      openConfirm({ preventDefault() {}, stopPropagation() {} })
    })
    await waitFor(() => Boolean(findClick('Delete')), 'Remove Photo confirmation did not render')
    await clickLabel('Delete')
    await waitFor(() => {
      const rows = photosRefFrom(findNamed('SiteDiaryWorkbenchSurface'))?.current || []
      return !rows.some((row) => row.preview === 'blob:remove-photo-a')
        && rows.some((row) => row.preview === 'blob:remove-photo-keep')
    }, 'Remove Photo did not drop only the selected photo')
    assert.equal(revokeCount('blob:remove-photo-a'), 1)
    assert.equal(revokeCount('blob:remove-photo-keep'), 0)
    await act(async () => root.unmount())
    root = null
    assert.equal(revokeCount('blob:remove-photo-a'), 1)
  })
})
