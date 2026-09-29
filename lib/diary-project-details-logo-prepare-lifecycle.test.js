/**
 * Defect #8N — a stale logo preparation must revoke its own prepared blob
 * preview. The current generation still publishes that preview into the
 * existing logo owner. Local prepare returns a blob URL or null, so this
 * file does not invent an https/data preview case.
 *
 * Drives the real project-details handleLogoFiles / removeLogo flow.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  clearAllSiteDiarySessionSnapshotsForTests,
  getSiteDiarySessionSnapshot,
  mergeSiteDiarySessionSnapshot,
  runSiteDiaryShadowSetupProof,
  SITE_DIARY_SHADOW_FIELD_KEYS,
} from './site-diary-session-context.js'

globalThis.__zlogSdsc = {
  getSiteDiarySessionSnapshot,
  mergeSiteDiarySessionSnapshot,
  runSiteDiaryShadowSetupProof,
  SITE_DIARY_SHADOW_FIELD_KEYS,
}

const repoRoot = join(import.meta.dirname, '..')
const USER_ID = 'user-8n'
const PROJECT_ID = 'project-8n'
const REPORT_ID = 'report-8n'
const revokedUrls = []

function deferred() {
  let resolve
  const promise = new Promise((settle) => {
    resolve = settle
  })
  return { promise, resolve }
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
      parentNode: null,
      ownerDocument: null,
      textContent: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
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
      contains() { return false },
      getRootNode() { return this.ownerDocument || this },
    }
    return node
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
  globalThis.URL.createObjectURL = () => 'blob:generated'
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrls.push(String(url))
  }
  return document.createElement('div')
}

function logoFile(name) {
  return { name, type: 'image/png', size: 4 }
}

function createPipeline() {
  revokedUrls.length = 0
  const visionCalls = []
  const pending = { prepare: new Map() }
  const pipeline = {
    visionCalls,
    holdPrepare: new Set(),
    extract: async () => '#A1B2C3',
    prepare: (file) => {
      const prepared = {
        file,
        previewUrl: `blob:${file.name}`,
        backgroundRemoved: false,
        presentation: { backdropColor: '#101010' },
      }
      if (!pipeline.holdPrepare.has(file.name)) return Promise.resolve(prepared)
      const gate = deferred()
      pending.prepare.set(file.name, gate)
      return gate.promise.then(() => prepared)
    },
    analyze: (file) => {
      visionCalls.push(file.name)
      const gate = deferred()
      pending.analyze = pending.analyze || new Map()
      pending.analyze.set(file.name, gate)
      return gate.promise
    },
    releasePrepare(name) {
      const gate = pending.prepare.get(name)
      assert.ok(gate, `prepare gate missing for ${name}`)
      gate.resolve()
    },
    releaseAnalysis(name, result) {
      const gate = pending.analyze?.get(name)
      assert.ok(gate, `analysis gate missing for ${name}`)
      gate.resolve(result)
    },
  }
  globalThis.__zlogLogoPipeline = pipeline
  return pipeline
}

function createSupabase() {
  const user = { id: USER_ID, email: 'site.manager@zlog.app', user_metadata: { full_name: 'Alex' } }
  const builder = {
    select() { return builder },
    eq() { return builder },
    order() { return builder },
    limit() { return builder },
    upsert() { return builder },
    update() { return builder },
    insert() { return builder },
    maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    single() { return Promise.resolve({ data: null, error: null }) },
    then(onOk, onErr) { return Promise.resolve({ data: [], error: null }).then(onOk, onErr) },
  }
  return {
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
    },
    from() { return builder },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/logo' }, error: null }),
          upload: async () => ({ data: { path: 'uploaded' }, error: null }),
        }
      },
    },
  }
}

async function loadController() {
  await mkdir(join(repoRoot, 'node_modules/.cache'), { recursive: true })
  const dir = await mkdtemp(join(repoRoot, 'node_modules/.cache/zlog-8n-'))
  const outfile = join(dir, 'controller.mjs')
  await build({
    entryPoints: [join(repoRoot, 'lib/use-site-diary-project-details.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    external: ['react'],
    plugins: [{
      name: 'logo-prepare-test-doubles',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@\/lib\/site-diary-session-context$/ }, () => ({
          path: 'site-diary-session-context',
          namespace: 'sdsc-bridge',
        }))
        buildApi.onResolve({ filter: /^@\/lib\/(extract-brand-color|prepare-brand-logo-image)$/ }, (args) => ({
          path: args.path,
          namespace: 'logo-prepare-double',
        }))
        buildApi.onResolve({ filter: /^@\// }, (args) => ({
          path: join(repoRoot, `${args.path.slice(2)}.js`),
        }))
        buildApi.onLoad({ filter: /.*/, namespace: 'sdsc-bridge' }, () => ({
          contents: `
            export function getSiteDiarySessionSnapshot(id) {
              return globalThis.__zlogSdsc.getSiteDiarySessionSnapshot(id)
            }
            export function mergeSiteDiarySessionSnapshot(partial) {
              return globalThis.__zlogSdsc.mergeSiteDiarySessionSnapshot(partial)
            }
            export function runSiteDiaryShadowSetupProof(authoritative) {
              return globalThis.__zlogSdsc.runSiteDiaryShadowSetupProof(authoritative)
            }
            export const SITE_DIARY_SHADOW_FIELD_KEYS = globalThis.__zlogSdsc.SITE_DIARY_SHADOW_FIELD_KEYS
          `,
          loader: 'js',
        }))
        buildApi.onLoad({ filter: /.*/, namespace: 'logo-prepare-double' }, (args) => {
          if (args.path.endsWith('extract-brand-color')) {
            return {
              contents: `
                export async function extractBrandColorFromFile(file) {
                  return globalThis.__zlogLogoPipeline.extract(file)
                }
              `,
              loader: 'js',
            }
          }
          return {
            contents: `
              export async function prepareBrandLogoFile(file) {
                return globalThis.__zlogLogoPipeline.prepare(file)
              }
              export async function fetchBrandCompanyNameAnalysis(file) {
                return globalThis.__zlogLogoPipeline.analyze(file)
              }
              export async function classifyLogoPresentationFromImageUrl() {
                return null
              }
            `,
            loader: 'js',
          }
        })
      },
    }],
  })
  const loaded = await import(pathToFileURL(outfile).href)
  return { controller: loaded.useSiteDiaryProjectDetailsController, dir }
}

function Harness({ controller, opts, apiRef }) {
  const api = controller(opts)
  apiRef.current = api
  return null
}

async function mount(controller) {
  const host = installDom()
  const root = createRoot(host)
  const apiRef = { current: null }
  await act(async () => {
    root.render(createElement(Harness, {
      controller,
      apiRef,
      opts: {
        supabase: createSupabase(),
        router: { push() {}, replace() {} },
        editingReportId: REPORT_ID,
        editingProjectId: PROJECT_ID,
        hostMode: 'workbench',
        hydrateEnabled: true,
        workbenchSeed: {
          projectId: PROJECT_ID,
          reportId: REPORT_ID,
          projectName: 'Tower',
          reportingCompany: 'Seed Co',
          reportingOnBehalfOf: 'Seed Behalf',
          brandColor: '#222222',
          logoStoragePath: null,
        },
      },
    }))
  })
  return {
    apiRef,
    async unmount() {
      await act(async () => {
        root.unmount()
      })
    },
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })
}

describe('Defect #8N — superseded prepared logo blob lifecycle', { concurrency: false }, () => {
  let controller
  let bundleDir

  before(async () => {
    const loaded = await loadController()
    controller = loaded.controller
    bundleDir = loaded.dir
  })

  after(async () => {
    clearAllSiteDiarySessionSnapshotsForTests()
    if (bundleDir) await rm(bundleDir, { recursive: true, force: true })
  })

  it('does not revoke logo A when logo B supersedes a pending preparation', async () => {
    const pipeline = createPipeline()
    pipeline.holdPrepare.add('logo-a.png')
    const { apiRef, unmount } = await mount(controller)
    await settle()
    assert.equal(apiRef.current.loading, false)

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-a.png')])
    })
    await settle()
    assert.equal(pipeline.visionCalls.includes('logo-a.png'), false)

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-b.png')])
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.logoPreview, 'blob:logo-b.png')
    assert.equal(revokeCount('blob:logo-a.png'), 0)
    assert.equal(revokeCount('blob:logo-b.png'), 0)

    await act(async () => {
      pipeline.releasePrepare('logo-a.png')
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.logoPreview, 'blob:logo-b.png')
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Seed Co')
    assert.equal(apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, false)
    assert.equal(pipeline.visionCalls.includes('logo-a.png'), false)
    assert.equal(revokeCount('blob:logo-b.png'), 0, 'logo B must stay owned by the current logo state')
    assert.equal(
      revokeCount('blob:logo-a.png'),
      1,
      'stale prepared blob:logo-a must be revoked once',
    )

    await unmount()
    assert.equal(revokeCount('blob:logo-a.png'), 1, 'later logo cleanup must not revoke the stale blob again')
    assert.equal(revokeCount('blob:logo-b.png'), 1, 'accepted logo B is revoked once by existing logo cleanup')
  })

  it('does not revoke logo A when Remove supersedes a pending preparation', async () => {
    const pipeline = createPipeline()
    pipeline.holdPrepare.add('logo-a.png')
    const { apiRef, unmount } = await mount(controller)
    await settle()
    assert.equal(apiRef.current.loading, false)

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-a.png')])
    })
    await settle()

    await act(async () => {
      apiRef.current.sectionProps.removeLogo()
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.logoPreview, null)
    assert.equal(revokeCount('blob:logo-a.png'), 0)

    await act(async () => {
      pipeline.releasePrepare('logo-a.png')
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.logoPreview, null)
    assert.equal(apiRef.current.sectionProps.logoPreviewBackdrop, null)
    assert.equal(pipeline.visionCalls.includes('logo-a.png'), false)
    assert.equal(
      revokeCount('blob:logo-a.png'),
      1,
      'stale prepared blob:logo-a must be revoked once after Remove',
    )

    await unmount()
    assert.equal(revokeCount('blob:logo-a.png'), 1, 'unmount must not revoke the already disposed stale blob')
  })

  it('publishes a current logo preparation without revoking it early', async () => {
    const pipeline = createPipeline()
    pipeline.holdPrepare.add('logo-a.png')
    const { apiRef, unmount } = await mount(controller)
    await settle()
    assert.equal(apiRef.current.loading, false)

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-a.png')])
    })
    await settle()

    await act(async () => {
      pipeline.releasePrepare('logo-a.png')
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.logoPreview, 'blob:logo-a.png')
    assert.equal(revokeCount('blob:logo-a.png'), 0, 'the accepted preview must not be revoked at publication')
    assert.deepEqual(pipeline.visionCalls, ['logo-a.png'])

    await act(async () => {
      pipeline.releaseAnalysis('logo-a.png', {
        company_name: 'Company A',
        confidence: 'high',
      })
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Company A')
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, true)
    assert.equal(revokeCount('blob:logo-a.png'), 0)

    await unmount()
    assert.equal(revokeCount('blob:logo-a.png'), 1, 'existing logo cleanup revokes the accepted preview once')
  })
})
