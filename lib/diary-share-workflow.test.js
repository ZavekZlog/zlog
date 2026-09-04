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
const shareAssetsLib = readFileSync(join(root, 'lib/diary-share-pdf-assets.js'), 'utf8')
const hydrate = readFileSync(join(root, 'lib/diary-form-hydrate.js'), 'utf8')

describe('Share CTA prepares PDF on first tap', () => {
  it('live diary Save & Share prepares on first tap and shares from the prepared file on second tap', () => {
    assert.match(diaryPage, /'Save & Share'/)
    assert.match(diaryPage, /Preparing report…/)
    assert.match(diaryPage, /Report Ready — Share Now/)
    assert.doesNotMatch(diaryPage, /setShowSaveBanner\(true\)/)
    assert.doesNotMatch(diaryPage, /Save \/ Share/)
    assert.doesNotMatch(diaryPage, /postSaveDiaryHref/)
    assert.match(hydrate, /diary\/complete\?report=/)
    const saveIdx = diaryPage.indexOf('const handleSave')
    assert.ok(saveIdx > 0)
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 28000)
    assert.match(saveBlock, /prepareSiteDiaryPdf/)
    assert.match(saveBlock, /shareSiteDiaryPdfNative/)
    assert.match(saveBlock, /canNativeShare/)
    assert.match(saveBlock, /snapshotUserActivation/)
    assert.match(saveBlock, /\[zlog:share-diag\]/)
    assert.match(saveBlock, /shareReadyPdfRef/)
    assert.match(saveBlock, /Second tap — native share from the already-prepared file only/)
    assert.match(saveBlock, /setShareReady\(true\)/)
    assert.doesNotMatch(saveBlock, /await shareSiteDiaryPdfNative\([\s\S]*prepareSiteDiaryPdf[\s\S]*shareSiteDiaryPdfNative/)
    assert.match(saveBlock, /downloadSiteDiaryPdf/)
    assert.match(saveBlock, /Do NOT silent-download/)
    assert.doesNotMatch(saveBlock, /router\.replace\(shareHref\)/)
    assert.doesNotMatch(saveBlock, /anchor\.download/)
    assert.match(saveBlock, /startShareTimingRun/)
    assert.match(saveBlock, /fromPdfCache: false/)
    assert.match(diaryPage, /SAVE & SHARE DIAGNOSTIC — TEMPORARY/)
    assert.match(
      diaryPage,
      /\{process\.env\.NODE_ENV !== 'production' \? <ShareTimingDiagPanel \/> : null\}/,
    )
  })

  it('bakes cover EXIF orientation into upright pixels for PDF embed', () => {
    assert.match(shareLib, /flattenCoverBlobForPdf/)
    assert.match(shareLib, /orientedImageToDataUrlForPdf/)
    assert.match(shareLib, /export async function uprightCoverSrcForPdf/)
    assert.match(shareLib, /signPdfReportAssets/)
    assert.match(shareAssetsLib, /const coverPhotoUrl = await uprightCoverFn\(coverSignedUrl\)/)
    assert.doesNotMatch(shareLib, /orientedImageToDataUrl\(/)
    assert.doesNotMatch(shareLib, /zlog-pdf-trace/)
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
    const end = shareLib.indexOf('export function snapshotUserActivation')
    assert.ok(start >= 0 && end > start)
    const block = shareLib.slice(start, end)
    assert.doesNotMatch(block, /createElement\('a'\)|anchor\.download|URL\.createObjectURL/)
    assert.doesNotMatch(block, /navigator\.share/)
  })

  it('passes saved Temporary Works checks to the existing PDF schedule', () => {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export function snapshotUserActivation')
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
    assert.doesNotMatch(completePage, /Native sharing isn.t available/)
    assert.doesNotMatch(sharePanel, /Native sharing isn.t available/)
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
    assert.match(diaryWhatsAppUnavailableMessage(), /can.t send the PDF through WhatsApp automatically/i)
    assert.match(diaryEmailFallbackMessage(), /can.t attach the PDF to email automatically/i)
    const moreMsg = diaryNativeShareUnavailableMessage()
    assert.match(moreMsg, /More options aren.t available/i)
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

  it('native share sends the File and treats sheet cancel as success', () => {
    const start = shareLib.indexOf('export async function shareSiteDiaryPdfNative')
    const end = shareLib.indexOf('function downloadPdfViaBrowser')
    assert.ok(start > 0 && end > start)
    const block = shareLib.slice(start, end)
    assert.match(block, /navigator\.share\(\{/)
    assert.match(block, /files:\s*\[file\]/)
    assert.match(block, /err\?\.name === 'AbortError'/)
    assert.match(block, /aborted:\s*true/)
    assert.match(block, /ok:\s*true/)
  })

  it('prepareSiteDiaryPdf already wraps the generated blob as a PDF File', () => {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export function snapshotUserActivation')
    assert.ok(start > 0 && end > start)
    const block = shareLib.slice(start, end)
    assert.match(block, /const blob = await pdf\(doc\)\.toBlob\(\)/)
    assert.match(block, /new File\(\[blob\], fileName, \{ type: 'application\/pdf' \}\)/)
    assert.doesNotMatch(block, /navigator\.share|anchor\.download/)
  })

  it('shareSiteDiaryPdfNative records userActivation and canShare diagnostics', () => {
    const start = shareLib.indexOf('export async function shareSiteDiaryPdfNative')
    const end = shareLib.indexOf('function downloadPdfViaBrowser')
    assert.ok(start > 0 && end > start)
    const block = shareLib.slice(start, end)
    assert.match(block, /snapshotUserActivation/)
    assert.match(block, /canShareFiles/)
    assert.match(block, /\[zlog:share-diag\]/)
    assert.match(block, /NotAllowedError/)
  })

  it('legacy shareSiteDiaryReport no longer silent-downloads when share is unavailable', () => {
    const start = shareLib.indexOf('export async function shareSiteDiaryReport')
    const block = shareLib.slice(start)
    assert.match(block, /diaryNativeShareUnavailableMessage/)
    assert.doesNotMatch(block, /anchor\.download/)
  })

  it('PDF work photos batch-sign storage paths; cover/logo/signature stay single-path', () => {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export function snapshotUserActivation')
    const prepare = shareLib.slice(start, end)
    assert.match(prepare, /batchSignedUrlsForStoragePaths/)
    assert.match(prepare, /batchSignStoragePaths/)
    assert.match(prepare, /localPreparedPhotoSources/)
    assert.match(shareAssetsLib, /createSignedUrls/)
    const assetsFn = shareAssetsLib.slice(shareAssetsLib.indexOf('export async function signPdfReportAssets'))
    assert.doesNotMatch(assetsFn, /createSignedUrls/)
    assert.match(assetsFn, /signedUrlForPath\(supabase, report\.cover_photo_url\)/)
  })

  it('live Save & Share collects local Blobs only after finalize succeeds', () => {
    const saveIdx = diaryPage.indexOf('const handleSave')
    const saveBlock = diaryPage.slice(saveIdx, saveIdx + 32000)
    const finalizeIdx = saveBlock.indexOf('finalizeSiteDiarySave')
    const savedIdIdx = saveBlock.indexOf("if (!saved?.id || saved.id !== editingReportId)")
    const collectIdx = saveBlock.indexOf('collectLocalPreparedPdfPhotoSources')
    const prepareIdx = saveBlock.indexOf('prepareSiteDiaryPdf')
    assert.ok(finalizeIdx > 0)
    assert.ok(savedIdIdx > finalizeIdx)
    assert.ok(collectIdx > savedIdIdx)
    assert.ok(prepareIdx > collectIdx)
    const failBeforePrepare = saveBlock.slice(savedIdIdx, collectIdx)
    assert.match(failBeforePrepare, /failSave\(/)
    assert.doesNotMatch(failBeforePrepare, /prepareSiteDiaryPdf/)
  })
})

describe('Phase 4A — overlap branding + PDF assets with remaining PDF work', () => {
  function prepareBlock() {
    const start = shareLib.indexOf('export async function prepareSiteDiaryPdf')
    const end = shareLib.indexOf('export function snapshotUserActivation')
    assert.ok(start >= 0 && end > start)
    return shareLib.slice(start, end)
  }

  function mustIndex(src, needle, label = needle) {
    const i = src.indexOf(needle)
    assert.ok(i >= 0, `missing ${label}`)
    return i
  }

  it('starts branding and asset prep only after daily_reports resolves and validates', () => {
    const block = prepareBlock()
    const reportFail = mustIndex(block, "We couldn't load this Site Diary for PDF export. Try again.")
    const projectFail = mustIndex(block, 'This Site Diary does not match the selected project.')
    const reportDone = mustIndex(block, "markShareTiming('pdf_report_query_done')")
    const brandingStart = mustIndex(block, "markShareTiming('pdf_branding_start')")
    const brandingPromise = mustIndex(block, 'const brandingPromise =')
    const assetStart = mustIndex(block, "markShareTiming('pdf_asset_prep_start')")
    const assetPromise = mustIndex(block, 'const pdfAssetPromise = signPdfReportAssets')
    assert.ok(reportFail < brandingStart)
    assert.ok(projectFail < brandingStart)
    assert.ok(reportDone < brandingStart)
    assert.ok(reportDone < assetStart)
    assert.ok(brandingStart < brandingPromise)
    assert.ok(assetStart < assetPromise)
    assert.ok(brandingPromise < assetPromise)
  })

  it('starts branding and signPdfReportAssets before buildDiaryPdfPhotos and awaits both after', () => {
    const block = prepareBlock()
    const brandingPromise = mustIndex(block, 'const brandingPromise =')
    const assetPromise = mustIndex(block, 'const pdfAssetPromise = signPdfReportAssets')
    const photosQuery = mustIndex(block, ".from('report_photos')")
    const labourQuery = mustIndex(block, ".from('report_labour')")
    const photoBake = mustIndex(block, 'const photos = await buildDiaryPdfPhotos')
    const awaitBranding = mustIndex(block, 'const { companyName, brandingRow } = await brandingPromise')
    const awaitAssets = mustIndex(block, 'const { logoUrl, coverPhotoUrl, signatureSrc } = await pdfAssetPromise')
    assert.ok(brandingPromise < photosQuery)
    assert.ok(assetPromise < photosQuery)
    assert.ok(photosQuery < labourQuery)
    assert.ok(labourQuery < photoBake)
    assert.ok(brandingPromise < photoBake)
    assert.ok(assetPromise < photoBake)
    assert.ok(photoBake < awaitBranding)
    assert.ok(photoBake < awaitAssets)
    assert.ok(awaitBranding < awaitAssets)
  })

  it('does not parallelise the three top-level PDF SELECTs', () => {
    const block = prepareBlock()
    const photosQuery = mustIndex(block, ".from('report_photos')")
    const labourQuery = mustIndex(block, ".from('report_labour')")
    const reportSelect = mustIndex(block, ".from('daily_reports')")
    assert.ok(reportSelect < photosQuery)
    assert.ok(photosQuery < labourQuery)
    assert.doesNotMatch(
      block,
      /Promise\.all\(\[[\s\S]{0,400}from\('report_photos'\)[\s\S]{0,400}from\('report_labour'\)/,
    )
    assert.doesNotMatch(
      block,
      /Promise\.all\(\[[\s\S]{0,400}from\('daily_reports'\)[\s\S]{0,400}from\('report_photos'\)/,
    )
  })

  it('keeps existing report_photos query semantics including column fallbacks', () => {
    const block = prepareBlock()
    assert.match(
      block,
      /\.from\('report_photos'\)\s*\n\s*\.select\('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version, report_byte_size'\)/,
    )
    assert.match(block, /\/report_byte_size\/i\.test\(primary\.error\.message/)
    assert.match(
      block,
      /\.select\('url, caption, sequence, layout, location, rotation_degrees, assigned_to, processing_version'\)/,
    )
    assert.match(block, /\/processing_version\/i\.test\(primary\.error\.message/)
    assert.match(
      block,
      /\.select\('url, caption, sequence, layout, location, rotation_degrees, assigned_to'\)/,
    )
    assert.match(block, /\/assigned_to\/i\.test\(primary\.error\.message/)
    assert.match(
      block,
      /\.select\('url, caption, sequence, layout, location, rotation_degrees'\)/,
    )
    assert.match(block, /\/rotation_degrees\/i\.test\(primary\.error\.message/)
    assert.match(
      block,
      /\.select\('url, caption, sequence, layout, location, assigned_to'\)/,
    )
    assert.match(block, /We couldn't load the diary photos for PDF export/)
    assert.match(block, /\.eq\('report_id', reportId\)/)
    assert.match(block, /\.order\('sequence'\)/)
  })

  it('keeps existing report_labour query semantics', () => {
    const block = prepareBlock()
    assert.match(
      block,
      /\.from\('report_labour'\)\s*\n\s*\.select\('trade, company, count, hours'\)\s*\n\s*\.eq\('report_id', reportId\)\s*\n\s*\.order\('sequence'\)/,
    )
    const labour = block.indexOf(".from('report_labour')")
    const photosDone = block.indexOf("markShareTiming('pdf_photos_query_done')")
    const labourDone = block.indexOf("markShareTiming('pdf_labour_query_done')")
    assert.ok(photosDone > 0 && labour > photosDone)
    assert.ok(labourDone > labour)
  })

  it('keeps project_reference after the asset/branding barrier and before pdf().toBlob()', () => {
    const block = prepareBlock()
    const awaitAssets = mustIndex(block, 'await pdfAssetPromise')
    const projectRef = mustIndex(block, ".select('project_reference')")
    const projectRefDone = mustIndex(block, "markShareTiming('pdf_project_reference_done')")
    const toBlobStart = mustIndex(block, "markShareTiming('pdf_toBlob_start')")
    const toBlob = mustIndex(block, 'const blob = await pdf(doc).toBlob()')
    assert.ok(awaitAssets < projectRef)
    assert.ok(projectRef < projectRefDone)
    assert.ok(projectRefDone < toBlobStart)
    assert.ok(toBlobStart < toBlob)
  })

  it('pdf().toBlob() waits for branding, assets/cover, and work-photo preparation', () => {
    const block = prepareBlock()
    const photoBake = mustIndex(block, 'const photos = await buildDiaryPdfPhotos')
    const photoBakeDone = mustIndex(block, "markShareTiming('pdf_photo_sign_fetch_bake_done')")
    const awaitBranding = mustIndex(block, 'await brandingPromise')
    const awaitAssets = mustIndex(block, 'await pdfAssetPromise')
    const toBlob = mustIndex(block, 'await pdf(doc).toBlob()')
    assert.ok(photoBake < photoBakeDone)
    assert.ok(photoBakeDone < awaitBranding)
    assert.ok(awaitBranding < awaitAssets)
    assert.ok(awaitAssets < toBlob)
    assert.match(block, /createElement\(DiaryPdfDocument, \{[\s\S]*logoUrl,[\s\S]*coverPhotoUrl,[\s\S]*photos,[\s\S]*labour: labourRows/)
    assert.match(block, /signatureSrc,/)
  })

  it('asset failure remains fail-closed on the original promise and does not swallow errors', () => {
    const block = prepareBlock()
    assert.match(block, /void pdfAssetPromise\.catch\(\(\) => \{\}\)/)
    assert.match(block, /void brandingPromise\.catch\(\(\) => \{\}\)/)
    assert.doesNotMatch(block, /const pdfAssetPromise = signPdfReportAssets\([\s\S]*?\)\.catch\(/)
    assert.match(block, /const \{ logoUrl, coverPhotoUrl, signatureSrc \} = await pdfAssetPromise/)
    const catchStart = shareLib.indexOf('} catch (err) {', shareLib.indexOf('export async function prepareSiteDiaryPdf'))
    const catchBlock = shareLib.slice(catchStart, shareLib.indexOf('export function snapshotUserActivation'))
    assert.match(catchBlock, /err\?\.message/)
    assert.match(catchBlock, /We couldn't generate the Site Diary PDF/)
  })

  it('does not introduce an unhandled Promise rejection when photo query fails closed', () => {
    const block = prepareBlock()
    const photoFail = mustIndex(block, "We couldn't load the diary photos for PDF export.")
    const settled = mustIndex(block, 'await Promise.allSettled([brandingPromise, pdfAssetPromise])')
    assert.ok(settled < photoFail)
    assert.match(block, /void brandingPromise\.catch\(\(\) => \{\}\)/)
    assert.match(block, /void pdfAssetPromise\.catch\(\(\) => \{\}\)/)
  })
})
