/**
 * Checkpoint ab65437 — PDF repeated header + Share-first-tap recovery.
 *
 * Source-string contracts only. Manual Android phone QA remains authoritative.
 * See docs/contracts/SITE_DIARY_PDF_CHECKPOINT_CONTRACT.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Protected restore point — phone-verified 2026-08-22 */
export const CHECKPOINT_BASELINE = 'ab65437'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pdfHeader = readFileSync(join(root, 'components/pdf/PdfHeader.jsx'), 'utf8')
const pdfDocument = readFileSync(join(root, 'components/pdf/DiaryPdfDocument.jsx'), 'utf8')
const pdfLayout = readFileSync(join(root, 'lib/diary-pdf-layout.js'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const savedViewPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'), 'utf8')
const completePage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/complete/page.jsx'),
  'utf8',
)
const diarySave = readFileSync(join(root, 'lib/diary-save.js'), 'utf8')

const ORIENTATION_SYMBOLS =
  /image-orientation|uprightCoverSrcForPdf|flattenCoverBlobForPdf|decodeBrowserDisplayImage|orientedImageToDataUrl/

function pageChromeBlock() {
  const start = pdfDocument.indexOf('function PageChrome(')
  assert.ok(start >= 0, 'PageChrome must exist')
  const end = pdfDocument.indexOf('\nfunction ', start + 1)
  return pdfDocument.slice(start, end > start ? end : start + 1200)
}

describe(`Checkpoint ${CHECKPOINT_BASELINE} — repeated PDF header`, () => {
  it('documents the protected restore point hash', () => {
    assert.equal(CHECKPOINT_BASELINE, 'ab65437')
  })

  it('mounts in-flow PageChrome + PdfHeader on every explicit PDF page', () => {
    assert.match(pdfDocument, /function PageChrome\(/)
    assert.match(pdfHeader, /export const PDF_ACCENT_BANNER_H = PDF_HEADER_BLOCK_H/)
    assert.match(pdfHeader, /headerShell:/)
    assert.match(pdfHeader, /backgroundColor:\s*color/)
    assert.doesNotMatch(pdfHeader, /headerShell:\s*\{[^}]*position:\s*'absolute'/)
    const pages = pdfDocument.match(/<Page\b/g) || []
    const chrome = pdfDocument.match(/<PageChrome\b/g) || []
    assert.ok(pages.length >= 2)
    assert.equal(chrome.length, pages.length, 'every <Page> must mount PageChrome')
  })

  it('reserves content below the header and keeps footer wiring intact', () => {
    assert.match(pdfLayout, /export const PDF_HEADER_BLOCK_H = 48/)
    assert.match(pdfLayout, /export const PDF_CONTENT_TOP = PDF_HEADER_OFFSET \+ 18/)
    assert.match(pageChromeBlock(), /<PdfFooter/)
    assert.match(pdfHeader, /export function PdfFooter/)
    assert.match(pdfHeader, /top:\s*PDF_FOOTER_TOP/)
  })

  it('does not import orientation helpers into the protected header stack', () => {
    assert.doesNotMatch(pdfHeader, ORIENTATION_SYMBOLS)
    assert.doesNotMatch(pdfLayout, ORIENTATION_SYMBOLS)
    assert.doesNotMatch(pageChromeBlock(), ORIENTATION_SYMBOLS)
  })
})

describe(`Checkpoint ${CHECKPOINT_BASELINE} — Share-first-tap recovery`, () => {
  it('workbench Share persists then prepares and shares PDF in the same gesture', () => {
    assert.match(diaryPage, /prepareSiteDiaryPdf/)
    assert.match(diaryPage, /shareSiteDiaryPdfNative/)
    assert.match(diaryPage, /downloadSiteDiaryPdf/)
    assert.doesNotMatch(diaryPage, /postSaveDiaryHref/)

    const saveIdx = diaryPage.indexOf('const handleSave')
    assert.ok(saveIdx > 0)
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 16000)
    assert.match(saveBlock, /await prepareSiteDiaryPdf\(/)
    assert.match(saveBlock, /await shareSiteDiaryPdfNative\(/)
    assert.match(saveBlock, /await downloadSiteDiaryPdf\(/)
    assert.doesNotMatch(saveBlock, /router\.replace\(shareHref\)/)

    const ctaBlock = diaryPage.slice(
      diaryPage.indexOf('ref={saveCtaRef}'),
      diaryPage.indexOf('</PrimaryCTA>', diaryPage.indexOf('ref={saveCtaRef}')) + 14,
    )
    assert.match(ctaBlock, /Preparing…/)
    assert.match(ctaBlock, /'Share'/)
  })

  it('saved view Share Report does not require a second tap after prepare', () => {
    const start = savedViewPage.indexOf('const handleGeneratePdf')
    const end = savedViewPage.indexOf('const confirmDeleteDiary')
    assert.ok(start > 0 && end > start)
    const handler = savedViewPage.slice(start, end)
    assert.match(handler, /prepareSiteDiaryPdf/)
    assert.match(handler, /Fall through to download delivery in this same gesture/)
    assert.doesNotMatch(handler, /Tap Share Report again/)
  })

  it('Report Complete page keeps explicit PDF prepare/share helpers wired', () => {
    assert.match(completePage, /prepareSiteDiaryPdf/)
    assert.match(completePage, /downloadSiteDiaryPdf/)
    assert.match(completePage, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(
      completePage,
      /useEffect\([\s\S]{0,200}(?:downloadSiteDiaryPdf|shareSiteDiaryPdfNative|prepareSiteDiaryPdf)/,
    )
  })

  it('final save still runs before Share — autosave is not a substitute for Save', () => {
    assert.match(diarySave, /finalizeSiteDiarySave/)
    assert.match(diaryPage, /finalizeSiteDiarySave/)
    const saveIdx = diaryPage.indexOf('const handleSave')
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 16000)
    assert.match(saveBlock, /finalizeSiteDiarySave/)
  })
})

describe(`Checkpoint ${CHECKPOINT_BASELINE} — orientation work isolation (source)`, () => {
  it('photo workspace UI is outside the PDF header contract surface', () => {
    const photoWorkspace = readFileSync(
      join(root, 'components/photo-workspace/PhotoWorkspace.jsx'),
      'utf8',
    )
    assert.match(photoWorkspace, /export const PhotoWorkspace = forwardRef/)
    assert.doesNotMatch(pdfHeader, /PhotoWorkspace/)
    assert.doesNotMatch(pageChromeBlock(), /PhotoWorkspace/)
  })
})
