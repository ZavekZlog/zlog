import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')

const CLIENT_DIARY_PDF_PROP_KEYS = [
  'projectName',
  'projectAddress',
  'projectReference',
  'clientName',
  'reportingOnBehalfOf',
  'reportReference',
  'reportDate',
  'projectManager',
  'commencementDate',
  'plannedCompletionDate',
  'shift',
  'weather',
  'siteSummary',
  'brandColor',
  'logoUrl',
  'companyName',
  'coverPhotoUrl',
  'photos',
  'labour',
  'equipmentHire',
  'temporaryWorks',
  'authorName',
  'authorRole',
  'signatureSrc',
]

const REMOVED_SERVER_ONLY_PROP_KEYS = [
  'attendanceRegisterImageSrc',
  'plant',
  'hsIncidents',
  'rfis',
  'variations',
  'visitorsRegisterProvenance',
  'delaysIssues',
  'actions',
  'visitors',
]

function readAssemblerSource() {
  return readFileSync(join(root, 'lib/server/assemble-site-diary-pdf-props.js'), 'utf8')
}

function readClientShareSource() {
  return readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
}

function propsObjectBlock(source) {
  const start = source.indexOf('const props = {')
  assert.ok(start >= 0, 'props object not found')
  const end = source.indexOf('\n  }', start)
  assert.ok(end > start, 'props object end not found')
  return source.slice(start, end)
}

/** Object literal property: explicit `key:` or ES shorthand `key,`. */
function objectLiteralDeclaresProperty(block, key) {
  const ident = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const explicit = new RegExp(`\\b${ident}\\s*:`)
  const shorthand = new RegExp(`(?:^|[,{]\\s*)${ident}\\s*,`, 'm')
  return explicit.test(block) || shorthand.test(block)
}

describe('assembleSiteDiaryPdfDocumentProps — client PDF prop parity', () => {
  it('does not perform sign-in sheet image bake assembly', () => {
    const source = readAssemblerSource()
    assert.doesNotMatch(source, /attendanceRegisterImageSrc/)
    assert.doesNotMatch(source, /signInSheetPathFromReport/)
    assert.doesNotMatch(source, /isSafeSignInSheetCleanupPath/)
    assert.doesNotMatch(source, /diary-sign-in-sheet-evidence/)
    assert.doesNotMatch(source, /attendanceMs/)
  })

  it('does not query report_plant for PDF assembly', () => {
    const source = readAssemblerSource()
    assert.doesNotMatch(source, /report_plant/)
    assert.doesNotMatch(source, /plantRows/)
  })

  it('does not pass server-only ignored DiaryPdfDocument props', () => {
    const block = propsObjectBlock(readAssemblerSource())
    for (const key of REMOVED_SERVER_ONLY_PROP_KEYS) {
      assert.equal(
        objectLiteralDeclaresProperty(block, key),
        false,
        `server props must not declare ${key}`,
      )
    }
  })

  it('passes the same effective prop keys as prepareSiteDiaryPdf', () => {
    const block = propsObjectBlock(readAssemblerSource())
    for (const key of CLIENT_DIARY_PDF_PROP_KEYS) {
      assert.equal(
        objectLiteralDeclaresProperty(block, key),
        true,
        `missing server prop ${key}`,
      )
    }
    const share = readClientShareSource()
    const shareMarker = 'const doc = createElement(DiaryPdfDocument, {'
    const shareStart = share.indexOf(shareMarker)
    const shareEnd = share.indexOf('\n    })', shareStart)
    const shareCreate = share.slice(shareStart, shareEnd)
    for (const key of CLIENT_DIARY_PDF_PROP_KEYS) {
      assert.equal(
        objectLiteralDeclaresProperty(shareCreate, key),
        true,
        `client reference missing ${key}`,
      )
    }
  })

  it('keeps photo completeness pipeline intact', () => {
    const source = readAssemblerSource()
    assert.match(source, /buildDiaryPdfPhotos/)
    assert.match(source, /preloadPhaseCWorkPhotoSources/)
    assert.match(source, /return \{ ok: true, props, report, photoRows, timings \}/)
    const route = readFileSync(join(root, 'app/api/site-diary/[reportId]/pdf/route.js'), 'utf8')
    assert.match(route, /assertDiaryPdfPhotosComplete/)
    assert.match(route, /assembled\.photoRows/)
  })

  it('leaves accepted client Share PDF path untouched', () => {
    const share = readClientShareSource()
    assert.match(share, /export async function prepareSiteDiaryPdf/)
    assert.doesNotMatch(share, /assembleSiteDiaryPdfDocumentProps/)
    assert.doesNotMatch(share, /attendanceRegisterImageSrc/)
  })

  it('leaves DiaryPdfDocument untouched', () => {
    const doc = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')
    assert.match(doc, /export function DiaryPdfDocument/)
    assert.doesNotMatch(doc, /attendanceRegisterImageSrc/)
  })
})
