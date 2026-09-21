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
    assert.match(read('process-site-diary-pdf-export.js'), /@\/lib\/server\/assemble-site-diary-pdf-props/)
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

  it('F — build entry imports the SAME assembler file', () => {
    assert.match(read('process-site-diary-pdf-export.js'), /@\/lib\/server\/assemble-site-diary-pdf-props\.js/)
    assert.match(
      readRoot('lib/server/assemble-site-diary-pdf-props.js'),
      /export async function assembleSiteDiaryPdfDocumentProps/,
    )
  })

  it('G — build entry imports the SAME completeness helper', () => {
    assert.match(read('process-site-diary-pdf-export.js'), /@\/lib\/diary-pdf-photos\.js/)
    assert.match(readRoot('lib/diary-pdf-photos.js'), /export function assertDiaryPdfPhotosComplete/)
  })

  it('H — build entry imports the SAME renderer file', () => {
    assert.match(read('process-site-diary-pdf-export.js'), /@\/lib\/server\/render-site-diary-pdf\.js/)
    assert.match(readRoot('lib/server/render-site-diary-pdf.js'), /export async function renderSiteDiaryPdfBuffer/)
  })

  it('I — no duplicate DiaryPdfDocument exists under worker/', () => {
    assert.equal(existsSync(join(here, 'DiaryPdfDocument.jsx')), false)
    assert.equal(existsSync(join(here, 'components', 'pdf', 'DiaryPdfDocument.jsx')), false)
    assert.doesNotMatch(read('process-site-diary-pdf-export.js'), /@\/components\/pdf\/DiaryPdfDocument/)
  })

  it('J — build entry does not invoke assembler at module load', () => {
    const wrapper = read('process-site-diary-pdf-export.js')
    assert.doesNotMatch(wrapper, /assembleSiteDiaryPdfDocumentProps\s*\(/)
    assert.doesNotMatch(read('pdf-pipeline-build-entry.mjs'), /assembleSiteDiaryPdfDocumentProps\s*\(/)
  })

  it('K — build entry does not invoke renderer at module load', () => {
    const wrapper = read('process-site-diary-pdf-export.js')
    assert.doesNotMatch(wrapper, /renderSiteDiaryPdfBuffer\s*\(/)
  })

  it('L — build/processor contains no Supabase RPC', () => {
    const combined = [
      read('process-site-diary-pdf-export.js'),
      read('process-site-diary-pdf-export-core.js'),
      read('build-pdf-pipeline.mjs'),
    ].join('\n')
    assert.doesNotMatch(combined, /\.rpc\s*\(/)
  })

  it('M — build/processor contains no claim', () => {
    const combined = [read('process-site-diary-pdf-export-core.js'), read('build-pdf-pipeline.mjs')].join('\n')
    assert.doesNotMatch(combined, /claim_next_site_diary_pdf_export/)
  })

  it('N — build/processor contains no upload', () => {
    const combined = [read('process-site-diary-pdf-export-core.js'), read('build-pdf-pipeline.mjs')].join('\n')
    assert.doesNotMatch(combined, /\.storage\./)
    assert.doesNotMatch(combined, /\.upload\s*\(/)
  })

  it('O — run.mjs is unchanged from 2C-2B shell contract', () => {
    const runSrc = read('run.mjs')
    assert.match(runSrc, /runClaimLoop/)
    assert.doesNotMatch(runSrc, /build-pdf-pipeline/)
    assert.doesNotMatch(runSrc, /processSiteDiaryPdfExport/)
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
