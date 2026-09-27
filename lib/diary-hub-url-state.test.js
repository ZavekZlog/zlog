import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

async function loadHubComponent() {
  const result = await build({
    entryPoints: [join(root, 'app/dashboard/diary/page.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    plugins: [{
      name: 'diary-hub-url-state-test-mocks',
      setup(buildApi) {
        const mocks = new Map([
          ['react', `
            export const Suspense = 'Suspense'
            export const useEffect = () => {}
            export const useMemo = (factory) => factory()
            export const useRef = (initial) => {
              const index = globalThis.__zlogHubRefCursor++
              if (!globalThis.__zlogHubRefs[index]) {
                globalThis.__zlogHubRefs[index] = { current: initial }
              }
              return globalThis.__zlogHubRefs[index]
            }
            export const useState = (initial) => {
              const index = globalThis.__zlogHubStateCursor++
              if (!(index in globalThis.__zlogHubStates)) {
                globalThis.__zlogHubStates[index] =
                  typeof initial === 'function' ? initial() : initial
              }
              return [
                globalThis.__zlogHubStates[index],
                (value) => {
                  const current = globalThis.__zlogHubStates[index]
                  globalThis.__zlogHubStates[index] =
                    typeof value === 'function' ? value(current) : value
                },
              ]
            }
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
            export const createClient = () => ({ from: () => ({}) })
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
            export const deleteSiteDiariesInSafeBatches = async () => ({ ok: true })
            export const savedReportListHref = () => '/dashboard/diary?view=saved'
            export const selectedReportsCountLabel = () => ''
            export const toggleReportSelection = (selected) => selected
          `],
          ['@/lib/diary-saved-list-cache', `
            export const readSavedDiaryListSnapshot = () => null
            export const savedDiaryListPaintState = () => ({
              reports: [],
              totalCount: 0,
              initialLoading: false,
              fromSnapshot: false
            })
            export const savedDiaryListRefreshRange = () => ({ from: 0, to: 49 })
            export const writeSavedDiaryListSnapshot = () => {}
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

function renderHub(HubComponent, query) {
  globalThis.__zlogHubQuery = query
  globalThis.__zlogHubStateCursor = 0
  globalThis.__zlogHubRefCursor = 0
  return HubComponent()
}

function findElement(node, type) {
  if (!node || typeof node !== 'object') return null
  if (node.type === type) return node
  const children = node.props?.children
  const entries = Array.isArray(children) ? children : [children]
  for (const child of entries) {
    const found = findElement(child, type)
    if (found) return found
  }
  return null
}

function visibleTitle(page) {
  return findElement(page, 'ZlogModulePageHeader')?.props.title
}

function findCard(page, title) {
  if (!page || typeof page !== 'object') return null
  if (page.type === 'ModuleHomeCard' && page.props.title === title) return page
  const children = page.props?.children
  const entries = Array.isArray(children) ? children : [children]
  for (const child of entries) {
    const found = findCard(child, title)
    if (found) return found
  }
  return null
}

describe('Defect #7 — Site Diary hub follows current URL', () => {
  it('follows saved/default URL changes while the same hub remains mounted', async () => {
    const pushes = []
    globalThis.__zlogHubStates = []
    globalThis.__zlogHubRefs = []
    globalThis.__zlogHubRouter = {
      push(href) {
        pushes.push(href)
      },
      replace() {},
      prefetch() {},
    }
    const HubComponent = await loadHubComponent()

    assert.equal(visibleTitle(renderHub(HubComponent, 'project=proj-1')), 'Site Diary')
    assert.equal(
      visibleTitle(renderHub(HubComponent, 'project=proj-1&view=saved')),
      'View Saved Diaries',
    )
    assert.equal(visibleTitle(renderHub(HubComponent, 'project=proj-1')), 'Site Diary')
    assert.equal(
      visibleTitle(renderHub(HubComponent, 'project=proj-1&view=saved')),
      'View Saved Diaries',
    )

    const backAtProjectHub = renderHub(HubComponent, 'project=proj-1')
    findCard(backAtProjectHub, 'Start a New Diary').props.onClick()
    assert.deepEqual(pushes, ['/dashboard/diary/setup?project=proj-1'])
  })

  it('preserves direct-load defaults for missing and invalid view values', async () => {
    globalThis.__zlogHubStates = []
    globalThis.__zlogHubRefs = []
    globalThis.__zlogHubRouter = { push() {}, replace() {}, prefetch() {} }
    const HubComponent = await loadHubComponent()

    assert.equal(visibleTitle(renderHub(HubComponent, 'view=saved')), 'View Saved Diaries')
    assert.equal(visibleTitle(renderHub(HubComponent, '')), 'Site Diary')
    assert.equal(visibleTitle(renderHub(HubComponent, 'view=previous')), 'Site Diary')
    assert.equal(visibleTitle(renderHub(HubComponent, 'view=unknown')), 'Site Diary')
  })
})
