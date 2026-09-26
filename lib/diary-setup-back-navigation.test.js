import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

async function renderSetup({ saving }) {
  globalThis.__zlogSetupSaving = saving
  const result = await build({
    entryPoints: [join(root, 'app/dashboard/diary/setup/page.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    plugins: [{
      name: 'setup-back-test-mocks',
      setup(buildApi) {
        const mocks = new Map([
          ['react', `
            export const Suspense = 'Suspense'
            export const useEffect = () => {}
            export const useMemo = (factory) => factory()
          `],
          ['react/jsx-runtime', `
            export const Fragment = 'Fragment'
            export const jsx = (type, props, key) => ({ type, props: props || {}, key })
            export const jsxs = jsx
          `],
          ['next/navigation', `
            export const useRouter = () => ({})
            export const useSearchParams = () => ({
              get: (key) => key === 'project' ? 'proj-1' : key === 'report' ? 'rep-1' : null
            })
          `],
          ['@/lib/supabase/client', 'export const createClient = () => ({})'],
          ['@/lib/premium-ui', `
            export const PremiumShell = 'PremiumShell'
            export const PrimaryCTA = 'PrimaryCTA'
            export const ZlogBackControl = 'ZlogBackControl'
            export const DIARY_ACCENT = '#f50'
            export const typeTokens = { body: {} }
          `],
          ['@/components/site-diary/SiteDiaryProjectDetailsSection', `
            export const SiteDiaryProjectDetailsSection = 'SiteDiaryProjectDetailsSection'
          `],
          ['@/lib/use-site-diary-project-details', `
            export const useSiteDiaryProjectDetailsController = () => ({
              loading: false,
              commitReady: true,
              saving: globalThis.__zlogSetupSaving,
              error: '',
              handleContinue: () => {},
              sectionProps: {}
            })
          `],
          ['@/lib/diary-routing', `
            export const diaryHubHref = ({ projectId } = {}) =>
              projectId ? '/dashboard/diary?project=' + projectId : '/dashboard/diary'
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, (args) => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'setup-back-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'setup-back-mock' }, (args) => ({
          contents: mocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })

  const compiledModule = { exports: {} }
  const evaluate = new Function('module', 'exports', result.outputFiles[0].text)
  evaluate(compiledModule, compiledModule.exports)
  const routeTree = compiledModule.exports.default()
  const setupElement = routeTree.props.children
  return setupElement.type()
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

function activateBack(props, { header = false } = {}) {
  const href = header ? props.backHref : props.href
  const onClick = header ? props.onBack : props.onClick
  const renderedAsLink = Boolean(href)
  if (!renderedAsLink && props.disabled) return null

  let prevented = false
  onClick?.({
    preventDefault() {
      prevented = true
    },
    stopPropagation() {},
  })
  return !prevented && renderedAsLink ? href : null
}

describe('Defect #5B — Setup Back saving boundary', () => {
  it('prevents pointer and keyboard navigation from both Back surfaces while saving', async () => {
    const page = await renderSetup({ saving: true })
    const footer = findElement(page, 'ZlogBackControl')

    assert.ok(footer, 'footer Back must render')
    assert.deepEqual(
      {
        headerPointer: activateBack(page.props, { header: true }),
        headerKeyboard: activateBack(page.props, { header: true }),
        footerPointer: activateBack(footer.props),
        footerKeyboard: activateBack(footer.props),
      },
      {
        headerPointer: null,
        headerKeyboard: null,
        footerPointer: null,
        footerKeyboard: null,
      },
    )
  })

  it('preserves the exact project-filtered hub destination when not saving', async () => {
    const page = await renderSetup({ saving: false })
    const footer = findElement(page, 'ZlogBackControl')
    const expected = '/dashboard/diary?project=proj-1'

    assert.equal(activateBack(page.props, { header: true }), expected)
    assert.equal(activateBack(footer.props), expected)
  })
})
