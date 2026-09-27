/**
 * Defect #8B — logo/company analysis may commit only for the current
 * logo generation and company-authority revision.
 *
 * Drives the real project-details controller. Colour extraction, logo
 * preparation, and vision analysis are deferred so stale completions can
 * be ordered exactly.
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
  setSiteDiarySessionSnapshot,
  SITE_DIARY_SHADOW_FIELD_KEYS,
} from './site-diary-session-context.js'

globalThis.__zlogSdsc = {
  getSiteDiarySessionSnapshot,
  mergeSiteDiarySessionSnapshot,
  runSiteDiaryShadowSetupProof,
  SITE_DIARY_SHADOW_FIELD_KEYS,
}

const root = join(import.meta.dirname, '..')
const USER_ID = 'user-8b'
const PROJECT_ID = 'project-8b'
const REPORT_ID = 'report-8b'

function deferred() {
  let resolve
  const promise = new Promise((settle) => {
    resolve = settle
  })
  return { promise, resolve }
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
      contains() {
        return false
      },
      getRootNode() {
        return this.ownerDocument || this
      },
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
  if (typeof globalThis.URL.createObjectURL !== 'function') {
    globalThis.URL.createObjectURL = () => 'blob:generated'
  }
  if (typeof globalThis.URL.revokeObjectURL !== 'function') {
    globalThis.URL.revokeObjectURL = () => {}
  }
  return document.createElement('div')
}

function logoFile(name) {
  return { name, type: 'image/png', size: 4 }
}

function createPipeline() {
  const visionCalls = []
  const pending = {
    prepare: new Map(),
    analyze: new Map(),
  }
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
      pending.prepare.set(file.name, { ...gate, prepared })
      return gate.promise.then(() => prepared)
    },
    analyze: (file) => {
      visionCalls.push(file.name)
      const gate = deferred()
      pending.analyze.set(file.name, gate)
      return gate.promise
    },
    releasePrepare(name) {
      const gate = pending.prepare.get(name)
      assert.ok(gate, `prepare gate missing for ${name}`)
      gate.resolve()
    },
    releaseAnalysis(name, result) {
      const gate = pending.analyze.get(name)
      assert.ok(gate, `analysis gate missing for ${name}`)
      gate.resolve(result)
    },
  }
  globalThis.__zlogLogoPipeline = pipeline
  return pipeline
}

function query(table, handlers) {
  const builder = {
    select() { return builder },
    eq() { return builder },
    order() { return builder },
    limit() { return builder },
    upsert() { return builder },
    update() { return builder },
    insert() { return builder },
    maybeSingle() { return handlers.run(table, true) },
    single() { return handlers.run(table, true) },
    then(onOk, onErr) {
      return handlers.run(table, false).then(onOk, onErr)
    },
  }
  return builder
}

function createSupabase(handlers) {
  const user = { id: USER_ID, email: 'site.manager@zlog.app', user_metadata: { full_name: 'Alex' } }
  return {
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
    },
    from(table) {
      return query(table, handlers)
    },
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

function installCanonicalGate() {
  const gate = deferred()
  let armed = false
  return {
    gate,
    arm() { armed = true },
    async run(table, single) {
      if (table === 'company_brandings' && single && armed) {
        await gate.promise
        return {
          data: {
            id: 'brand-canonical',
            company_name: 'Canonical Co',
            logo_url: null,
            brand_color: '#010101',
            is_default: true,
          },
          error: null,
        }
      }
      if (table === 'daily_reports' && single) {
        return {
          data: {
            id: REPORT_ID,
            project_id: PROJECT_ID,
            branding_id: 'brand-canonical',
            creator_name: 'Alex',
            creator_role: 'SM',
            company_reporting_for: 'Canonical Behalf',
            report_date: '2026-09-27',
            shift: 'Day',
            current_phase: 'Structure',
            brand_logo_url: null,
            brand_color: null,
            cover_photo_url: null,
          },
          error: null,
        }
      }
      if (table === 'projects' && single) {
        return {
          data: {
            id: PROJECT_ID,
            name: 'Tower',
            start_date: null,
            planned_completion_date: null,
            site_address: '1 Site Street',
            client_pm: 'Pat',
            working_days_per_week: '5',
            project_reference: 'REF-8B',
          },
          error: null,
        }
      }
      if (table === 'users' && single) {
        return { data: { id: USER_ID, full_name: 'Alex', job_title: 'SM' }, error: null }
      }
      return { data: single ? null : [], error: null }
    },
  }
}

function fastPathSnapshot(company, onBehalf) {
  const snapshot = {
    userId: USER_ID,
    projectId: PROJECT_ID,
    reportId: REPORT_ID,
    reportingCompany: company,
    reportingOnBehalfOf: onBehalf,
    projectName: 'Tower',
    brandColor: '#222222',
    logoStoragePath: null,
    coverStoragePath: null,
    brandingId: null,
  }
  for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) snapshot[key] = ''
  }
  setSiteDiarySessionSnapshot(snapshot)
}

async function loadController() {
  await mkdir(join(root, 'node_modules/.cache'), { recursive: true })
  const dir = await mkdtemp(join(root, 'node_modules/.cache/zlog-8b-'))
  const outfile = join(dir, 'controller.mjs')
  await build({
    entryPoints: [join(root, 'lib/use-site-diary-project-details.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    external: ['react'],
    plugins: [{
      name: 'logo-analysis-test-doubles',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@\/lib\/site-diary-session-context$/ }, () => ({
          path: 'site-diary-session-context',
          namespace: 'sdsc-bridge',
        }))
        buildApi.onResolve({ filter: /^@\/lib\/(extract-brand-color|prepare-brand-logo-image)$/ }, (args) => ({
          path: args.path,
          namespace: 'logo-analysis-double',
        }))
        buildApi.onResolve({ filter: /^@\// }, (args) => ({
          path: join(root, `${args.path.slice(2)}.js`),
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
        buildApi.onLoad({ filter: /.*/, namespace: 'logo-analysis-double' }, (args) => {
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

async function mount(controller, opts) {
  const host = installDom()
  const root = createRoot(host)
  const apiRef = { current: null }
  await act(async () => {
    root.render(createElement(Harness, { controller, opts, apiRef }))
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

describe('Defect #8B logo/company analysis lifecycle', { concurrency: false }, () => {
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

  it('TEST 1 — late logo A cannot replace logo B company result', async () => {
    createPipeline()
    const { apiRef, unmount } = await mount(controller, {
      supabase: createSupabase({ run: async () => ({ data: null, error: null }) }),
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
    })
    await settle()
    assert.equal(apiRef.current.loading, false)

    const logoA = logoFile('logo-a.png')
    const logoB = logoFile('logo-b.png')
    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoA])
    })
    await settle()
    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoB])
    })
    await settle()

    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('logo-b.png', {
        company_name: 'Company B',
        confidence: 'high',
      })
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Company B')
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, true)

    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('logo-a.png', {
        company_name: 'Company A',
        confidence: 'high',
      })
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Company B')
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, true)
    assert.equal(apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(apiRef.current.sectionProps.showLogoCompanyManualHint, false)
    assert.equal(apiRef.current.sectionProps.logoPreview, 'blob:logo-b.png')
    await unmount()
  })

  it('TEST 2 — canonical company during vision is not replaced', async () => {
    const canonical = installCanonicalGate()
    createPipeline()
    clearAllSiteDiarySessionSnapshotsForTests()
    fastPathSnapshot('Fast Co', 'Fast Behalf')
    canonical.arm()
    const { apiRef, unmount } = await mount(controller, {
      supabase: createSupabase(canonical),
      router: { push() {}, replace() {} },
      editingReportId: REPORT_ID,
      editingProjectId: PROJECT_ID,
      hostMode: 'setup',
    })
    await settle()
    await settle()
    assert.equal(apiRef.current.loading, false)
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Fast Co')

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-vision.png')])
    })
    await settle()
    assert.equal(globalThis.__zlogLogoPipeline.visionCalls.length, 1)

    canonical.gate.resolve()
    await settle()
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Canonical Co')

    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('logo-vision.png', {
        company_name: 'Logo Co',
        confidence: 'high',
      })
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Canonical Co')
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, false)
    assert.equal(apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(apiRef.current.sectionProps.showLogoCompanyManualHint, false)
    await unmount()
  })

  it('TEST 3 — Workbench shares ownership and still accepts a settled logo', async () => {
    const seed = {
      projectId: PROJECT_ID,
      reportId: REPORT_ID,
      projectName: 'Tower',
      reportingCompany: 'Seed Co',
      reportingOnBehalfOf: 'Seed Behalf',
      brandColor: '#222222',
      logoStoragePath: null,
    }
    const opts = {
      supabase: createSupabase({ run: async () => ({ data: null, error: null }) }),
      router: { push() {}, replace() {} },
      editingReportId: REPORT_ID,
      editingProjectId: PROJECT_ID,
      hostMode: 'workbench',
      hydrateEnabled: true,
      workbenchSeed: seed,
    }
    createPipeline()
    const settled = await mount(controller, opts)
    await settle()
    assert.equal(settled.apiRef.current.loading, false)
    await act(async () => {
      void settled.apiRef.current.sectionProps.handleLogoFiles([logoFile('wb-settled.png')])
    })
    await settle()
    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('wb-settled.png', {
        company_name: 'Settled Co',
        confidence: 'high',
      })
    })
    await settle()
    assert.equal(settled.apiRef.current.sectionProps.reportingCompany, 'Settled Co')
    assert.equal(settled.apiRef.current.sectionProps.namePrefilledFromLogo, true)
    await settled.unmount()

    createPipeline()
    const replaced = await mount(controller, opts)
    await settle()
    assert.equal(replaced.apiRef.current.loading, false)

    await act(async () => {
      void replaced.apiRef.current.sectionProps.handleLogoFiles([logoFile('wb-a.png')])
    })
    await settle()
    await act(async () => {
      void replaced.apiRef.current.sectionProps.handleLogoFiles([logoFile('wb-b.png')])
    })
    await settle()
    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('wb-b.png', {
        company_name: 'Company B',
        confidence: 'high',
      })
    })
    await settle()
    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('wb-a.png', {
        company_name: 'Company A',
        confidence: 'high',
      })
    })
    await settle()
    assert.equal(replaced.apiRef.current.sectionProps.reportingCompany, 'Company B')
    assert.equal(replaced.apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(replaced.apiRef.current.sectionProps.showLogoCompanyManualHint, false)
    await replaced.unmount()
  })

  it('TEST 4 — manual Reporting on behalf of survives a late detection', async () => {
    createPipeline()
    const { apiRef, unmount } = await mount(controller, {
      supabase: createSupabase({ run: async () => ({ data: null, error: null }) }),
      router: { push() {}, replace() {} },
      editingReportId: REPORT_ID,
      editingProjectId: PROJECT_ID,
      hostMode: 'workbench',
      hydrateEnabled: true,
      workbenchSeed: {
        projectId: PROJECT_ID,
        reportId: REPORT_ID,
        projectName: 'Tower',
        reportingCompany: 'Acme',
        reportingOnBehalfOf: 'Acme',
        brandColor: '#222222',
        logoStoragePath: null,
      },
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Acme')
    assert.equal(apiRef.current.sectionProps.reportingOnBehalfOf, 'Acme')

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-behalf.png')])
    })
    await settle()
    await act(async () => {
      apiRef.current.sectionProps.setReportingOnBehalfOf('Client Ltd')
    })
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingOnBehalfOf, 'Client Ltd')

    await act(async () => {
      globalThis.__zlogLogoPipeline.releaseAnalysis('logo-behalf.png', {
        company_name: 'Other Co',
        confidence: 'high',
      })
    })
    await settle()

    assert.equal(apiRef.current.sectionProps.reportingOnBehalfOf, 'Client Ltd')
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Acme')
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, false)
    assert.equal(apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(apiRef.current.sectionProps.showLogoCompanyManualHint, false)
    await unmount()
  })

  it('TEST 5 — canonical company during preparation skips vision and keeps the logo', async () => {
    const canonical = installCanonicalGate()
    const pipeline = createPipeline()
    pipeline.holdPrepare.add('logo-prep.png')
    clearAllSiteDiarySessionSnapshotsForTests()
    fastPathSnapshot('Fast Co', 'Fast Behalf')
    canonical.arm()
    const { apiRef, unmount } = await mount(controller, {
      supabase: createSupabase(canonical),
      router: { push() {}, replace() {} },
      editingReportId: REPORT_ID,
      editingProjectId: PROJECT_ID,
      hostMode: 'setup',
    })
    await settle()
    await settle()
    assert.equal(apiRef.current.loading, false)
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Fast Co')

    await act(async () => {
      void apiRef.current.sectionProps.handleLogoFiles([logoFile('logo-prep.png')])
    })
    await settle()
    assert.equal(pipeline.visionCalls.length, 0)

    canonical.gate.resolve()
    await settle()
    await settle()
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Canonical Co')

    await act(async () => {
      pipeline.releasePrepare('logo-prep.png')
    })
    await settle()
    await settle()

    assert.equal(apiRef.current.sectionProps.logoPreview, 'blob:logo-prep.png')
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Canonical Co')
    assert.equal(pipeline.visionCalls.length, 0)
    assert.equal(apiRef.current.sectionProps.namePrefilledFromLogo, false)
    assert.equal(apiRef.current.sectionProps.logoSuggestedCompanyName, null)
    assert.equal(apiRef.current.sectionProps.showLogoCompanyManualHint, false)
    await unmount()
  })
})
