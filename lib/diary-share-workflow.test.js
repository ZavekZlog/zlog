/**
 * Site Diary final Save / Share workflow — completion UI + explicit PDF delivery.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDiaryEmailMailto,
  canNativeShare,
  canSharePdfFile,
  canUseSaveFilePicker,
  diaryEmailFallbackMessage,
  diaryNativeShareUnavailableMessage,
  diaryWhatsAppUnavailableMessage,
  resolveDiaryShareCapabilities,
} from './diary-share-capabilities.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const completePage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/complete/page.jsx'),
  'utf8',
)
const sharePanel = readFileSync(
  join(root, 'components/reports/ReportCompleteSharePanel.jsx'),
  'utf8',
)
const shareLib = readFileSync(join(root, 'lib/diary-share.js'), 'utf8')
const hydrate = readFileSync(join(root, 'lib/diary-form-hydrate.js'), 'utf8')

describe('Save / Share does not force download on click', () => {
  it('diary Save / Share navigates to complete — does not call download/share on save', () => {
    assert.match(diaryPage, /Save \/ Share/)
    assert.match(diaryPage, /postSaveDiaryHref/)
    assert.match(hydrate, /diary\/complete\?report=/)
    const saveIdx = diaryPage.indexOf('const handleSave')
    assert.ok(saveIdx > 0)
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 12000)
    assert.doesNotMatch(saveBlock, /downloadSiteDiaryPdf|prepareSiteDiaryPdf|shareSiteDiaryPdfNative|shareSiteDiaryReport/)
    assert.doesNotMatch(saveBlock, /anchor\.download/)
    assert.match(saveBlock, /router\.replace\(shareHref\)/)
  })

  it('complete page does not download or share on mount', () => {
    assert.doesNotMatch(completePage, /useEffect\([\s\S]{0,200}(?:downloadSiteDiaryPdf|shareSiteDiaryPdfNative|prepareSiteDiaryPdf)/)
    assert.match(completePage, /prepareSiteDiaryPdf/)
    assert.match(completePage, /downloadSiteDiaryPdf/)
    // Status starts empty — no permanent fallback box.
    assert.match(completePage, /useState\(''\)/)
  })

  it('prepareSiteDiaryPdf never triggers a download', () => {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export async function shareSiteDiaryPdfNative')
    assert.ok(start >= 0 && end > start)
    const block = shareLib.slice(start, end)
    assert.doesNotMatch(block, /createElement\('a'\)|anchor\.download|URL\.createObjectURL/)
    assert.doesNotMatch(block, /navigator\.share/)
  })

  it('passes saved Temporary Works checks to the existing PDF schedule', () => {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export async function shareSiteDiaryPdfNative')
    const block = shareLib.slice(start, end)
    assert.match(block, /temporary_works_applicable/)
    assert.match(block, /temporary_works/)
    assert.match(block, /temporaryWorksForPdf\(report\.temporary_works\)/)
    assert.match(block, /temporaryWorks,/)
    assert.match(block, /report\.temporary_works_applicable === false/)
  })
})

describe('completion / share UI hierarchy', () => {
  it('keeps the Site Diary module accent on the completion state', () => {
    assert.match(completePage, /import \{ PremiumShell, DIARY_ACCENT \} from '@\/lib\/premium-ui'/)
    assert.match(completePage, /accent=\{DIARY_ACCENT\}/)
    assert.doesNotMatch(completePage, /\bBRAND_ACCENT\b|59,130,246|#3B82F6/i)
  })

  it('uses reusable ReportCompleteSharePanel with Save before Share Report', () => {
    assert.ok(existsSync(join(root, 'components/reports/ReportCompleteSharePanel.jsx')))
    assert.match(completePage, /ReportCompleteSharePanel/)
    assert.match(sharePanel, /Save your report/)
    assert.match(sharePanel, /Share report/)
    assert.match(sharePanel, /Save PDF/)
    assert.match(sharePanel, /Email/)
    assert.match(sharePanel, /WhatsApp/)
    assert.match(sharePanel, /'More'|"More"|: 'More'/)
    assert.match(sharePanel, /Return to Dashboard/)

    const saveHeading = sharePanel.indexOf('Save your report')
    const shareHeading = sharePanel.indexOf('Share report')
    const moreLabel = sharePanel.indexOf("'More'")
    assert.ok(saveHeading >= 0 && shareHeading > saveHeading)
    assert.ok(moreLabel > shareHeading)

    // Share is a section heading — not a large standalone Share CTA.
    assert.doesNotMatch(sharePanel, /busyLabel\('share',\s*'Share'\)/)
    assert.match(sharePanel, /id="zlog-share-report-heading"/)
    assert.doesNotMatch(sharePanel, /aria-label="Share"/)
  })

  it('Save PDF is PrimaryCTA; share destinations are equal icon tiles (not orange peers)', () => {
    assert.match(sharePanel, /<PrimaryCTA\b/)
    assert.match(sharePanel, /FileDown/)
    assert.match(sharePanel, /savePdfLabel|Save PDF/)
    assert.match(sharePanel, /zlog-report-share-row/)
    assert.ok((sharePanel.match(/zlog-report-share-tile/g) || []).length >= 3)
    assert.doesNotMatch(sharePanel, /EqualChoiceButton/)
    assert.equal((sharePanel.match(/<PrimaryCTA\b/g) || []).length, 1)
  })

  it('wires Save PDF to download; More to native share', () => {
    assert.match(completePage, /handleSavePdf/)
    assert.match(completePage, /downloadSiteDiaryPdf/)
    assert.match(completePage, /handleMore/)
    assert.match(completePage, /onMore=\{handleMore\}/)
    assert.match(completePage, /shareSiteDiaryPdfNative/)

    const savePdfStart = completePage.indexOf('const handleSavePdf')
    const block = completePage.slice(savePdfStart, savePdfStart + 900)
    assert.match(block, /downloadSiteDiaryPdf/)
    assert.doesNotMatch(block, /navigator\.share|shareSiteDiaryPdfNative/)

    const moreStart = completePage.indexOf('const handleMore')
    const moreBlock = completePage.slice(moreStart, completePage.indexOf('const handleEmail'))
    assert.match(moreBlock, /shareSiteDiaryPdfNative/)
    assert.doesNotMatch(moreBlock, /downloadSiteDiaryPdf/)
  })

  it('does not permanently show a native-sharing fallback on the completion screen', () => {
    assert.doesNotMatch(completePage, /Native sharing isn’t available/)
    assert.doesNotMatch(sharePanel, /Native sharing isn’t available/)
    assert.doesNotMatch(sharePanel, /Web Share API|navigator\.canShare|browser capacit/i)
    // Status area is conditional only — empty by default.
    assert.match(completePage, /useState\(''\)/)
    assert.match(sharePanel, /statusMessage \? \(/)
    assert.match(completePage, /handleMore/)
    assert.match(completePage, /diaryNativeShareUnavailableMessage/)
  })

  it('icons come from lucide-react plus a WhatsApp glyph (no emoji)', () => {
    assert.match(sharePanel, /from 'lucide-react'/)
    assert.match(sharePanel, /\bMail\b/)
    assert.match(sharePanel, /\bShare2\b/)
    assert.match(sharePanel, /\bFileDown\b/)
    assert.match(sharePanel, /WhatsAppGlyph|#25D366/)
    assert.doesNotMatch(sharePanel, /[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('Save PDF lets the user choose filename and folder', () => {
  it('canUseSaveFilePicker detects the File System Access API', () => {
    assert.equal(canUseSaveFilePicker(undefined), false)
    assert.equal(canUseSaveFilePicker({}), false)
    assert.equal(canUseSaveFilePicker({ showSaveFilePicker: 'nope' }), false)
    assert.equal(canUseSaveFilePicker({ showSaveFilePicker: () => {} }), true)
  })

  it('Save PDF asks the picker first, with the Zlog filename as an editable default', () => {
    const start = shareLib.indexOf('export async function downloadSiteDiaryPdf')
    assert.ok(start > 0, 'downloadSiteDiaryPdf is async')
    const block = shareLib.slice(start)
    assert.match(block, /canUseSaveFilePicker\(\)/)
    assert.match(block, /window\.showSaveFilePicker\(/)
    assert.match(block, /suggestedName/)
    assert.match(block, /application\/pdf/)
    assert.match(block, /createWritable\(\)/)
    assert.match(block, /writable\.write\(blob\)/)
    assert.match(block, /writable\.close\(\)/)
    // Picker is attempted before any automatic download.
    assert.ok(block.indexOf('showSaveFilePicker') < block.indexOf('downloadPdfViaBrowser'))
  })

  it('cancelling the Save As dialog is not an error and not a silent download', () => {
    const start = shareLib.indexOf('export async function downloadSiteDiaryPdf')
    const block = shareLib.slice(start)
    const abortIdx = block.indexOf("err?.name === 'AbortError'")
    assert.ok(abortIdx > 0)
    assert.match(block.slice(abortIdx, abortIdx + 120), /ok: true, cancelled: true/)
    assert.match(completePage, /if \(result\.cancelled\) return/)
  })

  it('keeps the plain download only as the unsupported-browser fallback', () => {
    assert.match(shareLib, /function downloadPdfViaBrowser/)
    assert.match(shareLib, /anchor\.download = fileName/)
    const fallback = shareLib.slice(shareLib.indexOf('function downloadPdfViaBrowser'))
    assert.match(fallback, /createElement\('a'\)/)
    // The completion page must await the now-async save.
    assert.match(completePage, /await downloadSiteDiaryPdf\(/)
  })
})

describe('capability helpers + graceful fallback', () => {
  it('resolveDiaryShareCapabilities marks native vs fallback paths', () => {
    const supported = resolveDiaryShareCapabilities({ canShareFiles: true, canShare: true })
    assert.equal(supported.nativeShareAvailable, true)
    assert.equal(supported.emailMailtoFallback, false)
    assert.equal(supported.whatsAppManualFallback, false)
    assert.equal(supported.savePdfAlwaysAvailable, true)

    const desktop = resolveDiaryShareCapabilities({ canShareFiles: false, canShare: false })
    assert.equal(desktop.nativeShareAvailable, false)
    assert.equal(desktop.emailMailtoFallback, true)
    assert.equal(desktop.whatsAppManualFallback, true)
  })

  it('mailto fallback never claims a PDF attachment', () => {
    const href = buildDiaryEmailMailto({
      projectName: 'North Site',
      reportDate: '2026-08-13',
      fileName: 'Zlog-Site-Diary-2026-08-13.pdf',
    })
    assert.match(href, /^mailto:\?subject=/)
    const decoded = decodeURIComponent(href)
    assert.match(decoded, /cannot attach/i)
    assert.doesNotMatch(decoded, /attach=|attachment=/i)
  })

  it('More fallback copy is short and non-technical', () => {
    assert.match(diaryWhatsAppUnavailableMessage(), /can’t send the PDF through WhatsApp automatically/i)
    assert.match(diaryEmailFallbackMessage(), /can’t attach the PDF to email automatically/i)
    const moreMsg = diaryNativeShareUnavailableMessage()
    assert.match(moreMsg, /More options aren’t available/i)
    assert.doesNotMatch(moreMsg, /Native sharing|Web Share|API|browser/i)
  })

  it('canSharePdfFile / canNativeShare are safe without navigator APIs', () => {
    assert.equal(canSharePdfFile(undefined), false)
    assert.equal(canNativeShare(undefined), false)
    assert.equal(canNativeShare({}), false)

    const fakeFile = { name: 'x.pdf', type: 'application/pdf' }
    assert.equal(
      canSharePdfFile(fakeFile, {
        share: async () => {},
        canShare: ({ files }) => Array.isArray(files) && files.length === 1,
      }),
      true,
    )
    assert.equal(
      canSharePdfFile(fakeFile, {
        share: async () => {},
        canShare: () => false,
      }),
      false,
    )
  })

  it('legacy shareSiteDiaryReport no longer silent-downloads when share is unavailable', () => {
    const start = shareLib.indexOf('export async function shareSiteDiaryReport')
    const block = shareLib.slice(start)
    assert.match(block, /diaryNativeShareUnavailableMessage/)
    assert.doesNotMatch(block, /anchor\.download/)
  })
})
