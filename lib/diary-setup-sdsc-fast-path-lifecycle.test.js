/**
 * Defect #8C — an SDSC fast path may apply its snapshot only while the
 * effect that started getSession() is still current.
 *
 * Drives the real project-details controller. The first getSession() can be
 * held so a later lifecycle can become authoritative before the old session
 * read resolves.
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
const USER_ID = 'user-8c'

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
  if (typeof globalThis.URL.createObjectURL !== 'function') {
    globalThis.URL.createObjectURL = () => 'blob:generated'
  }
  if (typeof globalThis.URL.revokeObjectURL !== 'function') {
    globalThis.URL.revokeObjectURL = () => {}
  }
  return document.createElement('div')
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

function createSupabase({
  deferFirstSession = false,
  holdReports = null,
  holdCompanyIdentity = null,
  rows,
}) {
  const firstSession = deferred()
  let sessionCalls = 0
  const user = {
    id: USER_ID,
    email: 'site.manager@zlog.app',
    user_metadata: { full_name: 'Site Manager' },
  }
  const sessionResult = { data: { session: { user } }, error: null }
  return {
    firstSession,
    user,
    auth: {
      getSession() {
        sessionCalls += 1
        if (deferFirstSession && sessionCalls === 1) return firstSession.promise
        return Promise.resolve(sessionResult)
      },
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async () => ({ data: { user }, error: null }),
    },
    from(table) {
      return query(async (single, filters) => {
        if (table === 'daily_reports' && single && holdReports) await holdReports.promise
        if (table === 'company_brandings' && single && holdCompanyIdentity) {
          holdCompanyIdentity.entered = true
          await holdCompanyIdentity.promise
        }
        const id = filterValue(filters, 'id')
        if (table === 'daily_reports' && single) {
          return { data: rows.reports[id] || null, error: null }
        }
        if (table === 'projects' && single) {
          return { data: rows.projects[id] || null, error: null }
        }
        if (table === 'projects') {
          return { data: Object.values(rows.projects), error: null }
        }
        if (table === 'company_brandings' && single) {
          const brandId = filterValue(filters, 'id')
          return { data: rows.brands[brandId] || rows.defaultBrand, error: null }
        }
        if (table === 'company_brandings') {
          return { data: [rows.defaultBrand], error: null }
        }
        if (table === 'users' && single) {
          return { data: { id: USER_ID, full_name: 'Site Manager', job_title: 'SM' }, error: null }
        }
        return { data: single ? null : [], error: null }
      })
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

function storeSnapshot({ projectId, reportId, projectName, reportingCompany }) {
  const snapshot = {
    userId: USER_ID,
    projectId,
    reportId,
    projectName,
    reportingCompany,
    logoStoragePath: null,
    coverStoragePath: null,
    brandingId: null,
    brandColor: null,
  }
  for (const key of SITE_DIARY_SHADOW_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) snapshot[key] = ''
  }
  snapshot.shift = 'Day'
  snapshot.reportDate = '2026-09-27'
  setSiteDiarySessionSnapshot(snapshot)
}

function diaryRows({ projectId, reportId, projectName, reportingCompany, brandId }) {
  return {
    report: {
      id: reportId,
      project_id: projectId,
      branding_id: brandId,
      creator_name: 'Site Manager',
      creator_role: 'SM',
      company_reporting_for: reportingCompany,
      report_date: '2026-09-27',
      shift: 'Day',
      current_phase: 'Structure',
      brand_logo_url: null,
      brand_color: null,
      cover_photo_url: null,
    },
    project: {
      id: projectId,
      name: projectName,
      start_date: null,
      planned_completion_date: null,
      site_address: '1 Site Street',
      client_pm: 'Pat',
      working_days_per_week: '5',
      project_reference: 'REF',
    },
    brand: {
      id: brandId,
      company_name: reportingCompany,
      logo_url: null,
      brand_color: '#222222',
      is_default: true,
      user_id: USER_ID,
    },
  }
}

async function loadController() {
  await mkdir(join(root, 'node_modules/.cache'), { recursive: true })
  const dir = await mkdtemp(join(root, 'node_modules/.cache/zlog-8c-'))
  const outfile = join(dir, 'controller.mjs')
  await build({
    entryPoints: [join(root, 'lib/use-site-diary-project-details.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    external: ['react'],
    plugins: [{
      name: 'sdsc-fast-path-lifecycle-doubles',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@\/lib\/site-diary-session-context$/ }, () => ({
          path: 'site-diary-session-context',
          namespace: 'sdsc-bridge',
        }))
        buildApi.onResolve({ filter: /^@\/lib\/(extract-brand-color|prepare-brand-logo-image)$/ }, (args) => ({
          path: args.path,
          namespace: 'logo-double',
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
        buildApi.onLoad({ filter: /.*/, namespace: 'logo-double' }, (args) => {
          if (args.path.endsWith('extract-brand-color')) {
            return {
              contents: 'export async function extractBrandColorFromFile() { return null }',
              loader: 'js',
            }
          }
          return {
            contents: `
              export async function prepareBrandLogoFile() { return null }
              export async function fetchBrandCompanyNameAnalysis() { return null }
              export async function classifyLogoPresentationFromImageUrl() { return null }
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

async function mount(controller, initialOpts) {
  const host = installDom()
  const view = createRoot(host)
  const apiRef = { current: null }
  let opts = initialOpts
  async function render() {
    await act(async () => {
      view.render(createElement(Harness, { controller, opts, apiRef }))
    })
  }
  await render()
  return {
    apiRef,
    async setOpts(next) {
      opts = next
      await render()
    },
    async unmount() {
      await act(async () => {
        view.unmount()
      })
    },
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve))
  })
}

async function untilCommitReady(apiRef) {
  for (let attempt = 0; attempt < 8 && !apiRef.current?.commitReady; attempt += 1) {
    await settle()
  }
}

describe('Defect #8C SDSC fast-path lifecycle', { concurrency: false }, () => {
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

  it('a current lifecycle applies its complete SDSC snapshot', async () => {
    clearAllSiteDiarySessionSnapshotsForTests()
    const projectId = 'project-current'
    const reportId = 'report-current'
    const projectName = 'Current Project'
    const reportingCompany = 'Current Company'
    storeSnapshot({ projectId, reportId, projectName, reportingCompany })
    const rows = diaryRows({
      projectId,
      reportId,
      projectName,
      reportingCompany,
      brandId: 'brand-current',
    })
    const holdReports = deferred()
    const supabase = createSupabase({
      holdReports,
      rows: {
        reports: { [reportId]: rows.report },
        projects: { [projectId]: rows.project },
        brands: { [rows.brand.id]: rows.brand },
        defaultBrand: rows.brand,
      },
    })
    const { apiRef, unmount } = await mount(controller, {
      supabase,
      router: { push() {}, replace() {} },
      editingReportId: reportId,
      editingProjectId: projectId,
      hostMode: 'setup',
    })
    await settle()
    await settle()
    assert.equal(apiRef.current.loading, false)
    assert.equal(apiRef.current.sectionProps.projectName, projectName)
    assert.equal(apiRef.current.sectionProps.reportingCompany, reportingCompany)
    assert.equal(apiRef.current.commitReady, false)
    await act(async () => {
      holdReports.resolve()
    })
    await untilCommitReady(apiRef)
    assert.equal(apiRef.current.commitReady, true)
    assert.equal(apiRef.current.sectionProps.projectName, projectName)
    assert.equal(apiRef.current.sectionProps.reportingCompany, reportingCompany)
    await unmount()
  })

  it('a cancelled lifecycle does not overwrite the current diary snapshot', async () => {
    clearAllSiteDiarySessionSnapshotsForTests()
    const reportA = {
      projectId: 'project-a',
      reportId: 'report-a',
      projectName: 'Report A Project',
      reportingCompany: 'Company A',
      brandId: 'brand-a',
    }
    const reportB = {
      projectId: 'project-b',
      reportId: 'report-b',
      projectName: 'Report B Project',
      reportingCompany: 'Company B',
      brandId: 'brand-b',
    }
    storeSnapshot(reportA)
    storeSnapshot(reportB)
    const rowA = diaryRows(reportA)
    const rowB = diaryRows(reportB)
    const supabase = createSupabase({
      deferFirstSession: true,
      rows: {
        reports: {
          [reportA.reportId]: rowA.report,
          [reportB.reportId]: rowB.report,
        },
        projects: {
          [reportA.projectId]: rowA.project,
          [reportB.projectId]: rowB.project,
        },
        brands: {
          [rowA.brand.id]: rowA.brand,
          [rowB.brand.id]: rowB.brand,
        },
        defaultBrand: rowB.brand,
      },
    })
    const router = { push() {}, replace() {} }
    const { apiRef, setOpts, unmount } = await mount(controller, {
      supabase,
      router,
      editingReportId: reportA.reportId,
      editingProjectId: reportA.projectId,
      hostMode: 'setup',
    })
    await setOpts({
      supabase,
      router,
      editingReportId: reportB.reportId,
      editingProjectId: reportB.projectId,
      hostMode: 'setup',
    })
    await untilCommitReady(apiRef)
    assert.equal(apiRef.current.commitReady, true)
    assert.equal(apiRef.current.sectionProps.projectName, 'Report B Project')
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Company B')

    await act(async () => {
      supabase.firstSession.resolve({
        data: { session: { user: supabase.user } },
        error: null,
      })
    })
    await settle()
    await settle()

    assert.equal(apiRef.current.sectionProps.projectName, 'Report B Project')
    assert.equal(apiRef.current.sectionProps.reportingCompany, 'Company B')
    assert.equal(apiRef.current.commitReady, true)
    await unmount()
  })

  async function untilEntered(hold) {
    for (let attempt = 0; attempt < 20 && !hold.entered; attempt += 1) {
      await settle()
    }
  }

  function coverRaceSetup(savedCover) {
    clearAllSiteDiarySessionSnapshotsForTests()
    const projectId = 'project-cover'
    const reportId = 'report-cover'
    const projectName = 'Cover Project'
    const reportingCompany = 'Cover Company'
    storeSnapshot({ projectId, reportId, projectName, reportingCompany })
    const rows = diaryRows({
      projectId,
      reportId,
      projectName,
      reportingCompany,
      brandId: 'brand-cover',
    })
    rows.report.cover_photo_url = savedCover
    const holdCompanyIdentity = deferred()
    holdCompanyIdentity.entered = false
    const supabase = createSupabase({
      holdCompanyIdentity,
      rows: {
        reports: { [reportId]: rows.report },
        projects: { [projectId]: rows.project },
        brands: { [rows.brand.id]: rows.brand },
        defaultBrand: rows.brand,
      },
    })
    return {
      projectId,
      reportId,
      savedCover,
      holdCompanyIdentity,
      supabase,
    }
  }

  it('user cover replacement during delayed company reconciliation stays', async () => {
    const savedCover = 'user-8c/reports/report-cover/covers/c1.jpg'
    const setup = coverRaceSetup(savedCover)
    const { apiRef, unmount } = await mount(controller, {
      supabase: setup.supabase,
      router: { push() {}, replace() {} },
      editingReportId: setup.reportId,
      editingProjectId: setup.projectId,
      hostMode: 'setup',
    })
    await untilEntered(setup.holdCompanyIdentity)
    assert.equal(setup.holdCompanyIdentity.entered, true)
    assert.equal(apiRef.current.loading, false)
    assert.equal(apiRef.current.commitReady, false)

    const userFile = new File([new Uint8Array([1, 2, 3])], 'c2.jpg', { type: 'image/jpeg' })
    await act(async () => {
      apiRef.current.sectionProps.onCoverDrop([userFile])
    })

    await act(async () => {
      setup.holdCompanyIdentity.resolve()
    })
    await untilCommitReady(apiRef)

    const cover = apiRef.current.sectionProps.coverPhoto
    assert.equal(apiRef.current.commitReady, true)
    assert.equal(cover.file, userFile)
    assert.equal(String(cover.preview).startsWith('blob:'), true)
    assert.equal(cover.storagePath, null)
    assert.equal(apiRef.current.sectionProps.projectManager, 'Pat')
    await unmount()
  })

  it('user cover removal during delayed company reconciliation stays removed', async () => {
    const savedCover = 'user-8c/reports/report-cover/covers/c1.jpg'
    const setup = coverRaceSetup(savedCover)
    const { apiRef, unmount } = await mount(controller, {
      supabase: setup.supabase,
      router: { push() {}, replace() {} },
      editingReportId: setup.reportId,
      editingProjectId: setup.projectId,
      hostMode: 'setup',
    })
    await untilEntered(setup.holdCompanyIdentity)
    assert.equal(setup.holdCompanyIdentity.entered, true)
    assert.equal(apiRef.current.loading, false)
    assert.equal(apiRef.current.commitReady, false)

    await act(async () => {
      apiRef.current.sectionProps.removeCoverPhoto()
    })

    await act(async () => {
      setup.holdCompanyIdentity.resolve()
    })
    await untilCommitReady(apiRef)

    assert.equal(apiRef.current.commitReady, true)
    assert.equal(apiRef.current.sectionProps.coverPhoto, null)
    assert.equal(apiRef.current.sectionProps.projectManager, 'Pat')
    await unmount()
  })
})
