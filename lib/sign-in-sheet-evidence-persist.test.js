import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dataUrlToJpegBlob,
  hasPersistedSignInSheetPath,
  isSafeSignInSheetCleanupPath,
  signInSheetPathFromReport,
  signInSheetSetupFieldsFromSync,
  signInSheetStoragePath,
} from './diary-sign-in-sheet-evidence.js'
import { hasSignInSheetEvidence } from './sign-in-sheet-working-state.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')
const labourHookPath = join(root, 'components/diary/useSiteDiaryLabour.js')
const labourSectionPath = join(root, 'components/diary/SiteDiaryLabourSection.jsx')
const applyPath = join(root, 'lib/diary-labour-apply.js')
const migrationPath = join(
  root,
  'supabase/migrations/20260913120000_daily_reports_sign_in_sheet_url.sql',
)

function readDiary() {
  return readFileSync(diaryPath, 'utf8')
}

function readLabourHook() {
  return readFileSync(labourHookPath, 'utf8')
}

function readLabourSection() {
  return readFileSync(labourSectionPath, 'utf8')
}

describe('Sign-in sheet evidence persistence (Unit 1)', () => {
  it('1. Apply path does not clear source evidence', () => {
    const hook = readLabourHook()
    const applyBlock = hook.slice(
      hook.indexOf('const applyScanOperativesToLabour'),
      hook.indexOf('const retrySignInScan'),
    )
    assert.doesNotMatch(applyBlock, /clearScanPreview/)
    assert.doesNotMatch(applyBlock, /setScanLastFile\(null\)/)
    assert.doesNotMatch(applyBlock, /setSignInSheetStoragePath\(null\)/)
    assert.doesNotMatch(applyBlock, /clearPersistedSignInSheetEvidence/)
    assert.match(readFileSync(applyPath, 'utf8'), /persistAppliedLabourRows/)
  })

  it('2. manual Labour mode does not clear source evidence', () => {
    const manualBlock = readLabourHook().match(
      /const startManualLabour = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(manualBlock)
    assert.doesNotMatch(manualBlock, /setScanLastFile\(null\)/)
    assert.doesNotMatch(manualBlock, /clearScanPreview/)
    assert.doesNotMatch(manualBlock, /setSignInSheetStoragePath/)
    assert.doesNotMatch(manualBlock, /loadedSignInSheetPathRef/)
  })

  it('3. persisted evidence hydrates on reopen', () => {
    const diary = readDiary()
    const hook = readLabourHook()
    assert.match(diary, /hydrateSignInFromReport\(existing/)
    assert.match(hook, /signInSheetPathFromReport\(existing\)/)
    assert.match(hook, /setSignInSheetStoragePath\(hydratedSignInPath\)/)
    assert.match(hook, /signedUrlForPath\(supabase, hydratedSignInPath\)/)
    assert.match(hook, /SIGN_IN_SHEET_EVIDENCE_PREVIEW_LOAD_FAIL_MESSAGE/)
    assert.match(hook, /preparedSignInSheetFileFromBlob/)
  })

  it('4. source controls render when evidence exists regardless of labourMode', () => {
    const section = readLabourSection()
    const hook = readLabourHook()
    assert.match(section, /hasSignInSheetEvidenceOnForm/)
    assert.match(hook, /hasSignInSheetEvidence\(/)
    const evidenceBlock = section.slice(
      section.indexOf('{hasSignInSheetEvidenceOnForm &&'),
      section.indexOf('{labourMode === \'manual\''),
    )
    assert.match(evidenceBlock, /Replace image/)
    assert.match(evidenceBlock, /Retry scan/)
    assert.match(evidenceBlock, /removeSignInSheetEvidence/)
  })

  it('5. Replace changes evidence but not Labour summary until Apply', () => {
    const hook = readLabourHook()
    assert.match(hook, /replacePersistedSignInSheetEvidence/)
    assert.match(hook, /previousStoragePath: loadedSignInSheetPathRef\.current/)
    assert.match(hook, /SIGN_IN_SHEET_EVIDENCE_SAVE_FAIL_MESSAGE/)
    assert.match(hook, /applyTradeHoursReviewToLabourSummary/)
    assert.doesNotMatch(
      hook.match(
        /const handleSignInSheetFiles = useCallback\(async \(files, \{ persistEvidence = true \} = \{\}\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
      )?.[0] || '',
      /setLabourRows/,
    )
  })

  it('6. Retry uses existing evidence image without re-persist', () => {
    const hook = readLabourHook()
    assert.match(
      hook,
      /const retrySignInScan = useCallback\(\(\) => \{\s*if \(scanLastFile\) \{\s*handleSignInSheetFiles\(\[scanLastFile\], \{ persistEvidence: false \}\)/,
    )
    assert.match(hook, /preparedSignInSheetFileFromBlob/)
  })

  it('7. Remove clears evidence only, not applied Labour summary', () => {
    const section = readLabourSection()
    const hook = readLabourHook()
    assert.match(section, /removeSignInSheetEvidence/)
    assert.match(hook, /clearPersistedSignInSheetEvidence/)
    assert.match(hook, /Your labour summary will stay as it is/)
    const removeBlock = hook.match(
      /const removeSignInSheetEvidence = useCallback\(async \(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(removeBlock)
    assert.doesNotMatch(removeBlock, /setLabourRows/)
    assert.match(removeBlock, /await clearPersistedSignInSheetEvidence/)
  })

  it('8. orientation-prepared image is the persisted/displayed source', () => {
    const hook = readLabourHook()
    assert.match(hook, /prepareSignInSheetImageForProvider/)
    assert.match(hook, /dataUrl: prepared\.dataUrl/)
    assert.match(hook, /preparedSignInSheetFileFromBlob/)
    const fields = signInSheetSetupFieldsFromSync({
      storagePath: 'user/rep/sign-in-sheet/1.jpg',
    })
    assert.equal(fields.signInSheetUrl, 'user/rep/sign-in-sheet/1.jpg')
    assert.equal(Object.keys(fields).length, 1)
    const tiny =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=='
    const blob = dataUrlToJpegBlob(tiny)
    assert.ok(blob && blob.size > 0)
  })

  it('9. preview uses contain (no crop)', () => {
    const section = readLabourSection()
    assert.match(section, /objectFit: 'contain'/)
    assert.match(section, /alt="Sign-in sheet preview"/)
  })

  it('10. Trade / Workers / Hours Apply behaviour remains on reviewed draft', () => {
    const hook = readLabourHook()
    assert.match(hook, /applyTradeHoursReviewToLabourSummary\(scanTradeHoursReviewRef\.current/)
    assert.match(hook, /initSignInTradeHoursReviewFromOperatives/)
    assert.doesNotMatch(hook, /aggregateSignInOperativesByCompany/)
  })
})

describe('Sign-in sheet evidence helpers', () => {
  it('storage path is report-scoped under sign-in-sheet', () => {
    const path = signInSheetStoragePath('uid', 'rid', 123)
    assert.equal(path, 'uid/rid/sign-in-sheet/123.jpg')
    assert.ok(isSafeSignInSheetCleanupPath(path))
  })

  it('hasSignInSheetEvidence prefers persisted path', () => {
    assert.equal(
      hasSignInSheetEvidence({
        signInSheetStoragePath: 'u/r/sign-in-sheet/9.jpg',
        scanSheetPreview: null,
        scanLastFile: null,
      }),
      true,
    )
    assert.equal(hasPersistedSignInSheetPath(signInSheetPathFromReport({ sign_in_sheet_url: 'a/b.jpg' })), true)
  })

  it('migration SQL is single-column', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    assert.match(sql, /sign_in_sheet_url/)
    assert.doesNotMatch(sql, /sign_in_sheet_processing_version/)
  })
})
