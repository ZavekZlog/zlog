import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function sameDeps(left, right) {
  return Boolean(
    left
    && right
    && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index])),
  )
}

function createHookRuntime() {
  const slots = []
  let cursor = 0
  let pendingEffects = []

  return {
    beginRender() {
      cursor = 0
      pendingEffects = []
    },
    useState(initial) {
      const index = cursor++
      if (!slots[index]) {
        slots[index] = {
          type: 'state',
          value: typeof initial === 'function' ? initial() : initial,
        }
      }
      return [
        slots[index].value,
        (value) => {
          slots[index].value =
            typeof value === 'function' ? value(slots[index].value) : value
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { type: 'ref', value: { current: initial } }
      return slots[index].value
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        slots[index] = { type: 'memo', value: factory(), deps }
      }
      return slots[index].value
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || !sameDeps(previous.deps, deps)) {
        pendingEffects.push({ index, effect, deps, previous })
      }
    },
    flushEffects() {
      for (const pending of pendingEffects) {
        pending.previous?.cleanup?.()
        const cleanup = pending.effect()
        slots[pending.index] = {
          type: 'effect',
          deps: pending.deps,
          cleanup: typeof cleanup === 'function' ? cleanup : null,
        }
      }
      pendingEffects = []
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.()
    },
  }
}

function createQueryRequest(columns) {
  const completion = deferred()
  const request = {
    columns,
    count: null,
    from: null,
    to: null,
    projectId: null,
    signal: null,
    completion,
    started: false,
    urlAtStart: null,
  }

  const builder = {
    select() {
      return builder
    },
    order() {
      return builder
    },
    range(from, to) {
      request.from = from
      request.to = to
      return builder
    },
    eq(column, value) {
      if (column === 'project_id') request.projectId = value
      return builder
    },
    abortSignal(signal) {
      request.signal = signal
      if (signal.aborted) {
        completion.resolve({
          data: null,
          error: { message: 'AbortError', hint: 'Request was aborted', status: 0 },
          count: null,
        })
      } else {
        signal.addEventListener('abort', () => {
          completion.resolve({
            data: null,
            error: { message: 'AbortError', hint: 'Request was aborted', status: 0 },
            count: null,
          })
        }, { once: true })
      }
      return builder
    },
    then(resolve, reject) {
      request.started = true
      request.urlAtStart = globalThis.__zlogHubQuery
      globalThis.__zlogHubRequests.push(request)
      return completion.promise.then(resolve, reject)
    },
  }
  return builder
}

async function loadHubComponent() {
  const result = await build({
    entryPoints: [join(root, 'app/dashboard/diary/page.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    plugins: [{
      name: 'diary-hub-request-cancellation-mocks',
      setup(buildApi) {
        const mocks = new Map([
          ['react', `
            export const Suspense = 'Suspense'
            export const useEffect = (...args) => globalThis.__zlogHubRuntime.useEffect(...args)
            export const useLayoutEffect = (...args) => globalThis.__zlogHubRuntime.useEffect(...args)
            export const useMemo = (...args) => globalThis.__zlogHubRuntime.useMemo(...args)
            export const useRef = (...args) => globalThis.__zlogHubRuntime.useRef(...args)
            export const useState = (...args) => globalThis.__zlogHubRuntime.useState(...args)
          `],
          ['react/jsx-runtime', `
            export const Fragment = 'Fragment'
            export const jsx = (type, props, key) => ({ type, props: props || {}, key })
            export const jsxs = jsx
          `],
          ['next/navigation', `
            export const useRouter = () => globalThis.__zlogHubRouter
            export const useSearchParams = () => ({
              get: (name) => new URLSearchParams(globalThis.__zlogHubQuery).get(name)
            })
          `],
          ['lucide-react', `export const Eye = 'Eye'`],
          ['@/lib/supabase/client', `
            export const createClient = () => ({
              from: () => ({
                select: (columns) => globalThis.__zlogCreateHubQuery(columns)
              })
            })
          `],
          ['@/lib/premium-ui', `
            export const PremiumShell = 'PremiumShell'
            export const ZlogModulePageHeader = 'ZlogModulePageHeader'
            export const ZlogBackControl = 'ZlogBackControl'
            export const ModuleHomeCard = 'ModuleHomeCard'
            export const SecondaryButton = 'SecondaryButton'
            export const DestructiveButton = 'DestructiveButton'
            export const dashboardCardInteractionCss = ''
          `],
          ['@/components/report-management/ReportDeletionDialog', `
            export const ReportDeletionDialog = 'ReportDeletionDialog'
          `],
          ['@/lib/report-theme', `
            export const REPORT_THEMES = { diary: { accent: '#f50' } }
          `],
          ['@/lib/diary-routing', `
            export const DIARY_MISSING_MESSAGE = 'missing'
            export const diaryHubHref = ({ projectId } = {}) =>
              projectId ? '/dashboard/diary?project=' + projectId : '/dashboard/diary'
            export const savedDiaryViewerHref = () => '/viewer'
          `],
          ['@/lib/diary-saved-list-navigation', `
            export const navigateToSavedDiaryViewer = () => {}
            export const prefetchSavedDiaryViewerRoutes = () => {}
            export const shouldIgnoreSavedDiaryRowOpen = () => false
            export const tryBeginSavedDiaryOpen = () => true
          `],
          ['@/lib/report-setup', `export const clearSetupFormDraft = () => {}`],
          ['@/lib/report-deletion', `
            export const BULK_SAVED_DIARY_DELETE_LABELS = {}
            export const deleteSiteDiariesInSafeBatches = (...args) => {
              globalThis.__zlogDeleteCalls.push(args)
              return globalThis.__zlogDelete.promise
            }
            export const savedReportListHref = () => '/dashboard/diary?view=saved'
            export const selectedReportsCountLabel = (count) => count + ' selected'
            export const toggleReportSelection = (selected, id) => {
              const next = new Set(selected)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            }
          `],
          ['@/lib/diary-saved-list-cache', `
            export const readSavedDiaryListSnapshot = () => globalThis.__zlogHubSnapshot
            export const savedDiaryListPaintState = (snapshot) => snapshot || ({
              reports: [],
              totalCount: 0,
              initialLoading: true,
              fromSnapshot: false
            })
            export const savedDiaryListRefreshRange = (length, pageSize) => ({
              from: 0,
              to: Math.max(length, pageSize) - 1
            })
            export const writeSavedDiaryListSnapshot = (...args) => {
              globalThis.__zlogHubCacheWrites.push(args)
            }
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, (args) => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'hub-test-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'hub-test-mock' }, (args) => ({
          contents: mocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })

  const compiledModule = { exports: {} }
  const evaluate = new Function('module', 'exports', result.outputFiles[0].text)
  evaluate(compiledModule, compiledModule.exports)
  const route = compiledModule.exports.default()
  return route.props.children.type
}

function report(id, projectName = id) {
  return {
    id,
    project_id: `project-${id}`,
    report_date: '2026-09-27',
    shift: 'Day',
    site_summary: '',
    projects: { id: `project-${id}`, name: projectName },
  }
}

function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  const children = node.props?.children
  for (const child of Array.isArray(children) ? children : [children]) {
    findAll(child, predicate, found)
  }
  return found
}

function buttonByText(page, text) {
  return findAll(
    page,
    (node) => (
      (node.type === 'SecondaryButton' || node.type === 'DestructiveButton')
      && node.props?.children === text
    ),
  )[0]
}

function savedRows(page) {
  return findAll(page, (node) => node.props?.['data-saved-diary-row'])
}

function selectedCount(page) {
  const count = findAll(
    page,
    (node) => (
      node.type === 'p'
      && node.props?.className === 'zlog-saved-diary-count'
      && typeof node.props?.children === 'string'
      && node.props.children.endsWith(' selected')
    ),
  )[0]
  return count?.props.children || null
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

let HubComponent

function setupHarness(snapshot = null) {
  globalThis.__zlogHubRuntime = createHookRuntime()
  globalThis.__zlogHubRequests = []
  globalThis.__zlogHubCacheWrites = []
  globalThis.__zlogHubSnapshot = snapshot
  globalThis.__zlogDelete = deferred()
  globalThis.__zlogDeleteCalls = []
  globalThis.__zlogCreateHubQuery = createQueryRequest
  globalThis.__zlogHubRouter = { push() {}, replace() {}, prefetch() {} }

  return {
    render(query) {
      globalThis.__zlogHubQuery = query
      globalThis.__zlogHubRuntime.beginRender()
      const page = HubComponent()
      globalThis.__zlogHubRuntime.flushEffects()
      return page
    },
    unmount() {
      globalThis.__zlogHubRuntime.unmount()
    },
  }
}

before(async () => {
  HubComponent = await loadHubComponent()
})

after(() => {
  delete globalThis.__zlogHubRuntime
  delete globalThis.__zlogHubRequests
  delete globalThis.__zlogHubCacheWrites
  delete globalThis.__zlogHubSnapshot
  delete globalThis.__zlogDelete
  delete globalThis.__zlogDeleteCalls
  delete globalThis.__zlogCreateHubQuery
  delete globalThis.__zlogHubRouter
  delete globalThis.__zlogHubQuery
})

describe('Defect #8A — Site Diary hub read lifecycle', () => {
  it('aborts obsolete primary transport and keeps replacement transport live', async () => {
    const hub = setupHarness()
    hub.render('view=saved&project=proj-a')
    await settle()
    const a1 = globalThis.__zlogHubRequests[0]

    hub.render('view=saved&project=proj-b')
    await settle()
    const b1 = globalThis.__zlogHubRequests[1]

    assert.equal(a1.signal?.aborted, true)
    assert.equal(b1.signal?.aborted, false)
    await settle()
    const page = hub.render('view=saved&project=proj-b')
    assert.equal(findAll(page, (node) => String(node.props?.children || '').includes('couldn’t')).length, 0)
  })

  it('aborts obsolete Select All and prevents selection commit into replacement lifecycle', async () => {
    const hub = setupHarness({
      reports: [report('a', 'Project A')],
      totalCount: 2,
      initialLoading: false,
      fromSnapshot: true,
    })
    let page = hub.render('view=saved&project=proj-a')
    await settle()
    buttonByText(page, 'Select').props.onClick()
    page = hub.render('view=saved&project=proj-a')
    buttonByText(page, 'Select All').props.onClick()
    await settle()
    const selectAll = globalThis.__zlogHubRequests.find((request) => request.columns === 'id')

    hub.render('view=saved&project=proj-b')
    await settle()
    selectAll.completion.resolve({ data: [{ id: 'a' }], error: null, count: 1 })
    await settle()
    page = hub.render('view=saved&project=proj-b')
    assert.equal(selectedCount(page), '0 selected')
    assert.equal(selectAll.signal?.aborted, true)
  })

  it('aborts obsolete Load More and prevents row/count commit into replacement lifecycle', async () => {
    const hub = setupHarness({
      reports: [report('a', 'Project A')],
      totalCount: 2,
      initialLoading: false,
      fromSnapshot: true,
    })
    let page = hub.render('view=saved&project=proj-a')
    await settle()
    buttonByText(page, 'Load more diaries').props.onClick()
    await settle()
    const loadMore = globalThis.__zlogHubRequests.find((request) => request.from === 1)

    hub.render('view=saved&project=proj-b')
    await settle()
    const replacement = globalThis.__zlogHubRequests.at(-1)
    replacement.completion.resolve({
      data: [report('b', 'Project B')],
      error: null,
      count: 1,
    })
    await settle()
    hub.render('view=saved&project=proj-b')

    loadMore.completion.resolve({
      data: [report('a2', 'Project A2')],
      error: null,
      count: 2,
    })
    await settle()
    page = hub.render('view=saved&project=proj-b')
    assert.deepEqual(
      savedRows(page).map((row) => row.props.children.props['aria-label']),
      ['Project B, 27 September 2026, shift Day. Tap to open and review.'],
    )
    assert.equal(loadMore.signal?.aborted, true)
  })

  it('does not cancel DELETE and lifecycle-binds only its follow-up refill read', async () => {
    const hub = setupHarness({
      reports: [report('a', 'Project A')],
      totalCount: 1,
      initialLoading: false,
      fromSnapshot: true,
    })
    let page = hub.render('view=saved&project=proj-a')
    await settle()
    buttonByText(page, 'Select').props.onClick()
    page = hub.render('view=saved&project=proj-a')
    savedRows(page)[0].props.children.props.onClick()
    page = hub.render('view=saved&project=proj-a')
    buttonByText(page, 'Delete Selected').props.onClick()
    page = hub.render('view=saved&project=proj-a')
    findAll(page, (node) => node.type === 'ReportDeletionDialog')[0].props.onConfirm()

    assert.equal(globalThis.__zlogDeleteCalls.length, 1)
    assert.equal(globalThis.__zlogDeleteCalls[0].length, 2)
    hub.render('view=saved&project=proj-b')
    await settle()
    assert.equal(globalThis.__zlogDeleteCalls.length, 1)

    const requestsBeforeDeleteResolution = globalThis.__zlogHubRequests.length
    globalThis.__zlogDelete.resolve({ ok: true, deletedIds: ['a'], remainingIds: [] })
    await settle()
    assert.equal(globalThis.__zlogHubRequests.length, requestsBeforeDeleteResolution + 1)
    const refill = globalThis.__zlogHubRequests.at(-1)
    assert.equal(refill.signal?.aborted, false)

    hub.render('view=saved&project=proj-c')
    assert.equal(refill.signal?.aborted, true)
  })

  it('uses the current B lifecycle context when DELETE started in A resolves', async () => {
    const hub = setupHarness({
      reports: [report('a', 'Project A')],
      totalCount: 1,
      initialLoading: false,
      fromSnapshot: true,
    })
    let page = hub.render('view=saved&project=proj-a')
    await settle()
    const aPrimary = globalThis.__zlogHubRequests[0]

    buttonByText(page, 'Select').props.onClick()
    page = hub.render('view=saved&project=proj-a')
    savedRows(page)[0].props.children.props.onClick()
    page = hub.render('view=saved&project=proj-a')
    buttonByText(page, 'Delete Selected').props.onClick()
    page = hub.render('view=saved&project=proj-a')
    findAll(page, (node) => node.type === 'ReportDeletionDialog')[0].props.onConfirm()

    assert.equal(globalThis.__zlogDeleteCalls.length, 1)
    assert.equal(globalThis.__zlogDeleteCalls[0].length, 2)

    hub.render('view=saved&project=proj-b')
    await settle()
    const bPrimary = globalThis.__zlogHubRequests.at(-1)
    assert.equal(aPrimary.signal?.aborted, true)
    assert.equal(bPrimary.signal?.aborted, false)

    globalThis.__zlogDelete.resolve({ ok: true, deletedIds: ['a'], remainingIds: [] })
    await settle()
    const refill = globalThis.__zlogHubRequests.at(-1)

    assert.notEqual(refill, bPrimary)
    assert.equal(refill.urlAtStart, 'view=saved&project=proj-b')
    assert.notEqual(refill.projectId, 'proj-a')
    assert.equal(refill.projectId, null)
    assert.equal(bPrimary.signal?.aborted, false)
    assert.equal(refill.signal?.aborted, false)

    bPrimary.completion.resolve({
      data: [report('b', 'Project B')],
      error: null,
      count: 1,
    })
    aPrimary.completion.resolve({
      data: [report('a-late', 'Project A Late')],
      error: null,
      count: 1,
    })
    await settle()
    page = hub.render('view=saved&project=proj-b')
    const renderedRowLabels = savedRows(page)
      .map((row) => row.props.children.props['aria-label'])
      .join('\n')
    assert.match(renderedRowLabels, /Project B/)
    assert.doesNotMatch(renderedRowLabels, /Project A/)

    hub.render('view=saved&project=proj-c')
    assert.equal(refill.signal?.aborted, true)
  })

  it('aborts active reads on unmount without surfacing an error', async () => {
    const hub = setupHarness()
    hub.render('view=saved')
    await settle()
    const request = globalThis.__zlogHubRequests[0]
    hub.unmount()

    assert.equal(request.signal?.aborted, true)
    await settle()
  })

  it('preserves the existing visible error for a genuine non-abort failure', async () => {
    const hub = setupHarness()
    hub.render('view=saved')
    await settle()
    globalThis.__zlogHubRequests[0].completion.resolve({
      data: null,
      error: { message: 'network failed', status: 500 },
      count: null,
    })
    await settle()
    const page = hub.render('view=saved')
    assert.equal(
      findAll(
        page,
        (node) => node.props?.children === 'We couldn’t load your diaries. Check your connection and try again.',
      ).length,
      1,
    )
  })
})
