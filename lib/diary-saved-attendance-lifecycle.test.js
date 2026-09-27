/**
 * Defect #8D — a Saved Diary Viewer Attendance retry may commit only while
 * the hydrator that started it is still authoritative.
 *
 * Drives the real Saved Diary Viewer. The retry's Attendance hydration can be
 * held so the same mounted viewer can switch reports before that retry resolves.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement, useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const repoRoot = join(import.meta.dirname, '..')
const PROJECT_ID = 'project-1'
const REPORT_A = 'report-a'
const REPORT_B = 'report-b'
const PATH_A = 'user-1/report-a/sign-in-sheet/1000.jpg'
const PATH_B = 'user-1/report-b/sign-in-sheet/2000.jpg'

const revokedUrls = []
let originalCreateObjectURL = null
let originalRevokeObjectURL = null
let viewerModule = null
let cacheDir = ''

function deferred() {
  let resolve
  let reject
  const promise = new Promise((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

function taggedBlob(tag) {
  const blob = new Blob([tag], { type: 'image/jpeg' })
  Object.defineProperty(blob, 'zlogTag', { value: tag })
  return blob
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
  globalThis.URL.createObjectURL = (blob) => `blob:${blob?.zlogTag || 'untagged'}`
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrls.push(String(url))
  }
}

function reportRow(id, path) {
  return {
    id,
    project_id: PROJECT_ID,
    report_date: '2026-09-01',
    current_phase: id === REPORT_B ? 'Finishes' : 'Structure',
    shift: 'Day',
    weather: 'Dry',
    site_summary: id === REPORT_B ? 'Report B summary' : 'Report A summary',
    sign_in_sheet_url: path,
  }
}

function projectRow() {
  return {
    id: PROJECT_ID,
    name: 'Prince Street',
    site_address: '14 High St',
    client_pm: 'Jordan Lee',
    working_days_per_week: 5,
    start_date: '2026-08-01',
    planned_completion_date: '2026-09-19',
    project_reference: 'JOB-1042',
  }
}

function query(run) {
  const filters = []
  const builder = {
    select() { return builder },
    eq(column, value) {
      filters.push([column, value])
      return builder
    },
    order() { return builder },
    limit() { return builder },
    maybeSingle() { return run(true, filters) },
    single() { return run(true, filters) },
    then(onOk, onErr) {
      return run(false, filters).then(onOk, onErr)
    },
  }
  return builder
}

function filterValue(filters, column) {
  return filters.find(([name]) => name === column)?.[1]
}

function createSupabase() {
  const reports = {
    [REPORT_A]: reportRow(REPORT_A, PATH_A),
    [REPORT_B]: reportRow(REPORT_B, PATH_B),
  }
  const user = { id: 'user-1', email: 'site.manager@zlog.app' }
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
    },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: null, error: { message: 'unused' } }),
          createSignedUrls: async () => ({ data: [], error: null }),
        }
      },
    },
    from(table) {
      return query(async (single, filters) => {
        const id = filterValue(filters, 'id')
        if (table === 'daily_reports' && single) {
          return { data: reports[id] || null, error: null }
        }
        if (table === 'projects' && single) {
          return { data: id === PROJECT_ID ? projectRow() : null, error: null }
        }
        if (single) return { data: null, error: null }
        return { data: [], error: null }
      })
    },
  }
}

function mockSource(id) {
  const sources = {
    'next/navigation': `
      export function useParams() {
        return { id: globalThis.__zlogViewerRoute.projectId }
      }
      export function useSearchParams() {
        return {
          get(key) {
            return key === 'report' ? globalThis.__zlogViewerRoute.reportId : null
          },
        }
      }
      export function useRouter() {
        return { replace() {}, push() {}, prefetch() {} }
      }
    `,
    'next/link': `
      import { createElement } from 'react'
      export default function Link({ children }) { return createElement('a', null, children) }
    `,
    'lucide-react': `
      export const CopyPlus = () => null
      export const Pencil = () => null
      export const Share2 = () => null
      export const Trash2 = () => null
    `,
    'supabase-client': `
      export function createClient() { return globalThis.__zlogViewerSupabase }
    `,
    'premium-ui': `
      import { createElement } from 'react'
      export function PremiumShell({ children }) { return createElement('div', null, children) }
      export function GlassSection({ children }) { return createElement('section', null, children) }
      export function PrimaryCTA({ children }) { return createElement('button', { type: 'button' }, children) }
      export function DestructiveButton({ children }) { return createElement('button', { type: 'button' }, children) }
      export function SecondaryButton({ children, onClick, type = 'button' }) {
        if (children === 'Retry') globalThis.__zlogAttendanceRetry = onClick
        return createElement('button', { type, onClick }, children)
      }
    `,
    'deletion-dialog': `
      export function ReportDeletionDialog() { return null }
    `,
    'report-session': `
      const publishReadSnapshot = () => {}
      const registerViewerPublicationLifecycle = () => {}
      export function useSiteDiaryReportSession() {
        return { publishReadSnapshot, registerViewerPublicationLifecycle }
      }
      export function readSnapshotsFromSavedDiaryView() { return null }
    `,
    'session-context': `
      export function mergeSiteDiarySessionSnapshot() {}
    `,
    'diary-routing': `
      export function editExistingDiaryHref() { return '/dashboard/diary/edit' }
      export function projectAndReportDetailsHref() { return '/dashboard/diary/setup' }
    `,
    'diary-draft': `
      export function createTodaysDiaryDraft() { return Promise.resolve('draft') }
    `,
    'report-deletion': `
      export function deleteSiteDiaries() { return Promise.resolve() }
      export function savedReportListHref() { return '/dashboard/diary' }
    `,
    'diary-share': `
      export function canSharePdfFile() { return false }
      export function downloadSiteDiaryPdf() { return Promise.resolve(null) }
      export function prepareSiteDiaryPdf() { return Promise.resolve(null) }
      export function shareSiteDiaryPdfNative() { return Promise.resolve(null) }
      export function snapshotUserActivation() { return null }
    `,
    'share-diag': `
      export function emitShareDiag() {}
    `,
    'share-probe': `
      export function runShareCapabilityProbe() {}
    `,
    'pdf-cache': `
      export function fingerprintFromSavedDiaryView() { return 'fingerprint' }
      export function loadShareReadyPdf() { return Promise.resolve(null) }
    `,
    'attendance-cache': `
      export function evictSignInSheetSessionEvidence() {}
      export function loadSignInSheetPreparedEvidence(path) {
        return globalThis.__zlogLoadAttendanceEvidence(path)
      }
    `,
    'workbench-stub': `
      export default function SiteDiaryWorkbenchSurface() { return null }
    `,
  }
  return sources[id]
}

function resolveMock(specifier) {
  if (specifier === 'next/navigation' || specifier === 'next/link' || specifier === 'lucide-react') {
    return specifier
  }
  if (specifier === '@/lib/supabase/client') return 'supabase-client'
  if (specifier === '@/lib/premium-ui') return 'premium-ui'
  if (specifier === '@/components/report-management/ReportDeletionDialog') return 'deletion-dialog'
  if (specifier === '@/lib/site-diary-report-session') return 'report-session'
  if (specifier === '@/lib/site-diary-session-context') return 'session-context'
  if (specifier === '@/lib/diary-routing') return 'diary-routing'
  if (specifier === '@/lib/diary-draft') return 'diary-draft'
  if (specifier === '@/lib/report-deletion') return 'report-deletion'
  if (specifier === '@/lib/diary-share') return 'diary-share'
  if (specifier === '@/lib/share-diag-beacon') return 'share-diag'
  if (specifier === '@/lib/share-capability-probe') return 'share-probe'
  if (specifier === '@/lib/diary-pdf-cache') return 'pdf-cache'
  if (
    specifier === '@/lib/diary-sign-in-sheet-session-cache'
    || specifier.endsWith('/diary-sign-in-sheet-session-cache.js')
    || specifier.endsWith('/diary-sign-in-sheet-session-cache')
  ) {
    return 'attendance-cache'
  }
  if (specifier.includes('SiteDiaryWorkbenchSurface')) return 'workbench-stub'
  return null
}

function reactBinding(node) {
  if (!node || typeof node !== 'object') return null
  const key = Object.keys(node).find((name) =>
    name.startsWith('__reactContainer$') || name.startsWith('__reactFiber$'))
  return key ? { key, value: node[key] } : null
}

function reactFiber(node) {
  const binding = reactBinding(node)
  const value = binding?.value
  if (value?.current?.tag != null) return value.current
  return value || null
}

function findNamedFibers(rootFiber, name) {
  const matches = []
  const stack = [rootFiber]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    if (current.type?.name === name) matches.push(current)
    if (current.child) stack.push(current.child)
    if (current.sibling) stack.push(current.sibling)
  }
  return matches
}

function viewFromFiber(fiber) {
  let hook = fiber?.memoizedState
  while (hook) {
    const value = hook.memoizedState
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'attendanceRegisterPath')) {
      return value
    }
    hook = hook.next
  }
  return null
}

function renderedAttendance(container) {
  const fiber = findNamedFibers(reactFiber(container), 'SavedDiaryViewer')[0]
  return [fiber, fiber?.alternate]
    .map((node) => viewFromFiber(node))
    .filter((view) => view)
    .map((view) => ({
      path: view.attendanceRegisterPath || null,
      preview: view.attendanceRegisterPreviewUrl || null,
      status: view.attendanceRegisterPreviewStatus || null,
      error: view.attendanceRegisterLoadError || '',
    }))
}

function readSavedView(container) {
  const matches = findNamedFibers(reactFiber(container), 'SavedDiaryViewer')
  return viewFromFiber(matches[0])
}

function readViewerError(container) {
  const fiber = findNamedFibers(reactFiber(container), 'SavedDiaryViewer')[0]
  if (!fiber?.memoizedState?.next) return null
  return fiber.memoizedState.next.memoizedState
}

async function settle(predicate, label) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw new Error(`${label}; attendance=${JSON.stringify(globalThis.__zlogLastAttendance || null)}`)
}

function attendanceOf(container) {
  const view = readSavedView(container)
  const attendance = {
    reportId: view?.reportId || null,
    path: view?.attendanceRegisterPath || null,
    preview: view?.attendanceRegisterPreviewUrl || null,
    status: view?.attendanceRegisterPreviewStatus || null,
    error: view?.attendanceRegisterLoadError || '',
    pageError: readViewerError(container) || '',
    loading: null,
  }
  const rootFiber = reactFiber(container)
  const fiber = findNamedFibers(rootFiber, 'SavedDiaryViewer')[0]
  attendance.loading = fiber?.memoizedState?.memoizedState ?? null
  attendance.hasFiber = Boolean(fiber)
  globalThis.__zlogLastAttendance = attendance
  return attendance
}

describe('Defect #8D — Saved Viewer Attendance retry lifecycle', { concurrency: false }, () => {
  before(async () => {
    installDom()
    installUrlSpies()
    cacheDir = join(repoRoot, 'node_modules/.cache/zlog-8d-attendance')
    await rm(cacheDir, { recursive: true, force: true })
    await mkdir(cacheDir, { recursive: true })
    const outfile = join(cacheDir, 'viewer.mjs')
    await build({
      entryPoints: [join(repoRoot, 'components/site-diary/SavedDiaryViewerSurface.jsx')],
      bundle: true,
      outfile,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      plugins: [{
        name: 'saved-viewer-attendance-test-mocks',
        setup(buildApi) {
          buildApi.onResolve({ filter: /.*/ }, (args) => {
            const mockId = resolveMock(args.path)
            if (!mockId) return null
            return { path: mockId, namespace: 'zlog-8d-mock' }
          })
          buildApi.onLoad({ filter: /.*/, namespace: 'zlog-8d-mock' }, (args) => ({
            contents: mockSource(args.path),
            loader: 'js',
          }))
        },
      }],
    })
    viewerModule = await import(pathToFileURL(outfile).href)
  })

  after(async () => {
    if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL
    else delete globalThis.URL.createObjectURL
    if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL
    else delete globalThis.URL.revokeObjectURL
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    revokedUrls.length = 0
    globalThis.__zlogAttendanceRetry = null
    globalThis.__zlogReleaseAttendance = null
    globalThis.__zlogRejectAttendance = null
    globalThis.__zlogViewerRoute = { projectId: PROJECT_ID, reportId: REPORT_A }
    globalThis.__zlogViewerSupabase = createSupabase()
    globalThis.__zlogAttendanceCalls = []
    globalThis.__zlogAttendancePlan = null
    globalThis.__zlogLoadAttendanceEvidence = (path) => {
      globalThis.__zlogAttendanceCalls.push(path)
      const index = globalThis.__zlogAttendanceCalls.filter((item) => item === path).length
      return globalThis.__zlogAttendancePlan(path, index)
    }
  })

  function planInitialFailureThenHoldRetry(path, index) {
    if (path === PATH_A && index === 1) {
      return Promise.reject(new Error('Attendance Register could not be loaded'))
    }
    if (path === PATH_A && index === 2) {
      const held = deferred()
      globalThis.__zlogReleaseAttendance = (blob) => held.resolve({ blob })
      globalThis.__zlogRejectAttendance = (error) => {
        held.reject(error || new Error('Attendance Register could not be loaded'))
      }
      return held.promise
    }
    if (path === PATH_B && index === 1) {
      return Promise.resolve({ blob: taggedBlob('current-b') })
    }
    return Promise.reject(new Error(`unexpected Attendance load ${path} #${index}`))
  }

  async function mountViewer() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    function Harness() {
      const [, setTick] = useState(0)
      globalThis.__zlogRerenderSavedViewer = () => setTick((value) => value + 1)
      return createElement(viewerModule.default)
    }
    await act(async () => {
      root.render(createElement(Harness))
    })
    return {
      host,
      root,
      async unmount() {
        await act(async () => {
          root.unmount()
        })
        host.parentNode?.removeChild(host)
      },
    }
  }

  it('does not let report A retry overwrite report B Attendance', async () => {
    globalThis.__zlogAttendancePlan = planInitialFailureThenHoldRetry
    const mounted = await mountViewer()
    try {
      await settle(
        () => attendanceOf(mounted.host).status === 'failed'
          && typeof globalThis.__zlogAttendanceRetry === 'function',
        'report A Attendance retry did not become available',
      )

      await act(async () => {
        globalThis.__zlogAttendanceRetry()
      })

      await act(async () => {
        globalThis.__zlogViewerRoute.reportId = REPORT_B
        globalThis.__zlogRerenderSavedViewer()
      })

      await settle(() => {
        const attendance = attendanceOf(mounted.host)
        return attendance.reportId === REPORT_B
          && attendance.path === PATH_B
          && attendance.preview === 'blob:current-b'
          && attendance.status === 'ready'
      }, 'report B did not become the authoritative Attendance view')

      const beforeResolve = attendanceOf(mounted.host)
      await act(async () => {
        globalThis.__zlogReleaseAttendance(taggedBlob('stale-a'))
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      const afterResolve = attendanceOf(mounted.host)

      for (const snapshot of renderedAttendance(mounted.host)) {
        assert.notEqual(snapshot.path, PATH_A)
        assert.notEqual(snapshot.preview, 'blob:stale-a')
      }
      assert.deepEqual(
        {
          path: afterResolve.path,
          preview: afterResolve.preview,
          status: afterResolve.status,
          error: afterResolve.error,
          pageError: afterResolve.pageError,
        },
        {
          path: beforeResolve.path,
          preview: beforeResolve.preview,
          status: beforeResolve.status,
          error: beforeResolve.error,
          pageError: beforeResolve.pageError,
        },
      )
      assert.equal(revokedUrls.includes('blob:stale-a'), true)
      assert.equal(revokedUrls.includes('blob:current-b'), false)
    } finally {
      await mounted.unmount()
    }
  })

  it('applies a retry that still belongs to the current report', async () => {
    globalThis.__zlogAttendancePlan = planInitialFailureThenHoldRetry
    const mounted = await mountViewer()
    try {
      await settle(
        () => attendanceOf(mounted.host).status === 'failed'
          && attendanceOf(mounted.host).path === PATH_A
          && typeof globalThis.__zlogAttendanceRetry === 'function',
        'current report Attendance retry did not become available',
      )

      await act(async () => {
        globalThis.__zlogAttendanceRetry()
      })
      await act(async () => {
        globalThis.__zlogReleaseAttendance(taggedBlob('valid-a'))
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      const attendance = attendanceOf(mounted.host)
      assert.equal(attendance.reportId, REPORT_A)
      assert.equal(attendance.path, PATH_A)
      assert.equal(attendance.preview, 'blob:valid-a')
      assert.equal(attendance.status, 'ready')
      assert.equal(attendance.error, '')
      assert.equal(revokedUrls.includes('blob:valid-a'), false)
    } finally {
      await mounted.unmount()
    }
  })

  it('does not let a failed report A retry overwrite report B Attendance', async () => {
    globalThis.__zlogAttendancePlan = planInitialFailureThenHoldRetry
    const mounted = await mountViewer()
    try {
      await settle(
        () => attendanceOf(mounted.host).status === 'failed'
          && typeof globalThis.__zlogAttendanceRetry === 'function',
        'report A Attendance retry did not become available',
      )

      await act(async () => {
        globalThis.__zlogAttendanceRetry()
      })

      await act(async () => {
        globalThis.__zlogViewerRoute.reportId = REPORT_B
        globalThis.__zlogRerenderSavedViewer()
      })

      await settle(() => {
        const attendance = attendanceOf(mounted.host)
        return attendance.reportId === REPORT_B
          && attendance.path === PATH_B
          && attendance.preview === 'blob:current-b'
          && attendance.status === 'ready'
          && attendance.error === ''
      }, 'report B did not become the authoritative Attendance view')

      const beforeReject = attendanceOf(mounted.host)
      const beforeRendered = renderedAttendance(mounted.host)
      await act(async () => {
        globalThis.__zlogRejectAttendance(new Error('stale attendance failure'))
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      const afterReject = attendanceOf(mounted.host)

      assert.deepEqual(
        {
          path: afterReject.path,
          preview: afterReject.preview,
          status: afterReject.status,
          error: afterReject.error,
          pageError: afterReject.pageError,
        },
        {
          path: beforeReject.path,
          preview: beforeReject.preview,
          status: beforeReject.status,
          error: beforeReject.error,
          pageError: beforeReject.pageError,
        },
      )
      assert.deepEqual(renderedAttendance(mounted.host), beforeRendered)
      assert.equal(afterReject.error.includes('Could not load the saved Attendance Register photo.'), false)
      assert.equal(revokedUrls.includes('blob:current-b'), false)
    } finally {
      await mounted.unmount()
    }
  })

  it('revokes a successful retry blob after the viewer unmounts', async () => {
    globalThis.__zlogAttendancePlan = planInitialFailureThenHoldRetry
    const mounted = await mountViewer()
    const unmountWarnings = []
    const originalConsoleError = console.error
    console.error = (...args) => {
      const text = args.map((item) => String(item)).join(' ')
      if (/unmounted|state update/i.test(text)) unmountWarnings.push(text)
      originalConsoleError.apply(console, args)
    }
    try {
      await settle(
        () => attendanceOf(mounted.host).status === 'failed'
          && typeof globalThis.__zlogAttendanceRetry === 'function',
        'report A Attendance retry did not become available',
      )

      await act(async () => {
        globalThis.__zlogAttendanceRetry()
      })
      await mounted.unmount()

      assert.equal(attendanceOf(mounted.host).hasFiber, false)

      await act(async () => {
        globalThis.__zlogReleaseAttendance(taggedBlob('unmounted-a'))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      assert.equal(revokedUrls.includes('blob:unmounted-a'), true)
      assert.deepEqual(unmountWarnings, [])
    } finally {
      console.error = originalConsoleError
      if (mounted.host.parentNode) await mounted.unmount()
    }
  })

  it('keeps a failed retry on the current report', async () => {
    globalThis.__zlogAttendancePlan = planInitialFailureThenHoldRetry
    const mounted = await mountViewer()
    try {
      await settle(
        () => attendanceOf(mounted.host).status === 'failed'
          && attendanceOf(mounted.host).path === PATH_A
          && typeof globalThis.__zlogAttendanceRetry === 'function',
        'current report Attendance retry did not become available',
      )

      await act(async () => {
        globalThis.__zlogAttendanceRetry()
      })
      await act(async () => {
        globalThis.__zlogRejectAttendance(new Error('current attendance failure'))
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      const attendance = attendanceOf(mounted.host)
      assert.equal(attendance.reportId, REPORT_A)
      assert.equal(attendance.path, PATH_A)
      assert.equal(attendance.preview, null)
      assert.equal(attendance.status, 'failed')
      assert.equal(
        attendance.error,
        'Could not load the saved Attendance Register photo. Check your connection, reopen the diary, or tap Re-scan.',
      )
    } finally {
      await mounted.unmount()
    }
  })
})
