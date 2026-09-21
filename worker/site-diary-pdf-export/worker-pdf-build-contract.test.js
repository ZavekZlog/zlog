import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function read(relFromWorker) {
  return readFileSync(join(here, relFromWorker), 'utf8')
}

function readRoot(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const serverOnlyImport = /import\s+['"]server-only['"]/

describe('Worker Site Diary PDF build boundary (2C-2C-1A)', () => {
  it('A — esbuild is a direct devDependency', () => {
    assert.ok(pkg.devDependencies?.esbuild, 'esbuild must be in devDependencies')
    assert.equal(pkg.dependencies?.esbuild, undefined)
  })

  it('B — worker build targets Node 20', () => {
    assert.match(read('build-pdf-pipeline.mjs'), /target:\s*'node20'/)
  })

  it('C — @/ alias resolves to repo root', () => {
    const buildSrc = read('build-pdf-pipeline.mjs')
    assert.match(buildSrc, /alias:\s*\{/)
    assert.match(buildSrc, /'@':\s*repoRoot/)
    assert.match(read('pdf-pipeline-probe.mjs'), /@\/lib\/server\/assemble-site-diary-pdf-props/)
  })

  it('D — server-only is shimmed only by worker build', () => {
    const buildSrc = read('build-pdf-pipeline.mjs')
    assert.match(buildSrc, /server-only/)
    assert.match(buildSrc, /zlog-server-only-empty/)
    assert.match(buildSrc, /serverOnlyShimPlugin/)
    assert.doesNotMatch(buildSrc, /from\s+['"]server-only['"]/)
  })

  it('E — existing source files retain server-only imports', () => {
    assert.match(readRoot('lib/server/assemble-site-diary-pdf-props.js'), serverOnlyImport)
    assert.match(readRoot('lib/server/render-site-diary-pdf.js'), serverOnlyImport)
  })

  it('F — probe imports the SAME assembler file', () => {
    assert.match(
      read('pdf-pipeline-probe.mjs'),
      /@\/lib\/server\/assemble-site-diary-pdf-props\.js/,
    )
    assert.match(
      readRoot('lib/server/assemble-site-diary-pdf-props.js'),
      /export async function assembleSiteDiaryPdfDocumentProps/,
    )
  })

  it('G — probe imports the SAME completeness helper', () => {
    assert.match(read('pdf-pipeline-probe.mjs'), /@\/lib\/diary-pdf-photos\.js/)
    assert.match(readRoot('lib/diary-pdf-photos.js'), /export function assertDiaryPdfPhotosComplete/)
  })

  it('H — probe imports the SAME renderer file', () => {
    assert.match(read('pdf-pipeline-probe.mjs'), /@\/lib\/server\/render-site-diary-pdf\.js/)
    assert.match(readRoot('lib/server/render-site-diary-pdf.js'), /export async function renderSiteDiaryPdfBuffer/)
  })

  it('I — no duplicate DiaryPdfDocument exists under worker/', () => {
    assert.equal(existsSync(join(here, 'DiaryPdfDocument.jsx')), false)
    assert.equal(existsSync(join(here, 'components', 'pdf', 'DiaryPdfDocument.jsx')), false)
    assert.doesNotMatch(read('pdf-pipeline-probe.mjs'), /@\/components\/pdf\/DiaryPdfDocument/)
  })

  it('J — build/probe does not call assembler', () => {
    const probe = read('pdf-pipeline-probe.mjs')
    assert.doesNotMatch(probe, /assembleSiteDiaryPdfDocumentProps\s*\(/)
  })

  it('K — build/probe does not call renderer', () => {
    const probe = read('pdf-pipeline-probe.mjs')
    assert.doesNotMatch(probe, /renderSiteDiaryPdfBuffer\s*\(/)
  })

  it('L — build/probe contains no Supabase RPC', () => {
    const combined = [read('pdf-pipeline-probe.mjs'), read('build-pdf-pipeline.mjs')].join('\n')
    assert.doesNotMatch(combined, /\.rpc\s*\(/)
  })

  it('M — build/probe contains no claim', () => {
    const combined = [read('pdf-pipeline-probe.mjs'), read('build-pdf-pipeline.mjs')].join('\n')
    assert.doesNotMatch(combined, /claim_next_site_diary_pdf_export/)
  })

  it('N — build/probe contains no upload', () => {
    const combined = [read('pdf-pipeline-probe.mjs'), read('build-pdf-pipeline.mjs')].join('\n')
    assert.doesNotMatch(combined, /\.storage\./)
    assert.doesNotMatch(combined, /\.upload\s*\(/)
  })

  it('O — run.mjs is unchanged from 2C-2B shell contract', () => {
    const runSrc = read('run.mjs')
    assert.match(runSrc, /runClaimLoop/)
    assert.doesNotMatch(runSrc, /build-pdf-pipeline/)
    assert.doesNotMatch(runSrc, /pdf-pipeline-probe/)
    assert.doesNotMatch(runSrc, /assembleSiteDiaryPdfDocumentProps/)
  })

  it('P — generated dist is ignored', () => {
    assert.match(read('.gitignore'), /^dist\/\s*$/m)
  })

  it('Q — existing worker-shell contract remains valid', () => {
    const shellPath = join(here, 'worker-shell.test.js')
    assert.equal(existsSync(shellPath), true)
    const shellTest = readFileSync(shellPath, 'utf8')
    assert.match(shellTest, /Site Diary PDF export worker shell \(2C-2B\)/)
    assert.match(shellTest, /claim disabled by default/)
  })
})
