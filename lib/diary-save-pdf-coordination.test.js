/**
 * Save + PDF coordination — single-flight Save, background cooperate, CTA copy.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coordinateBackgroundPdfOnSaveStart,
  diarySavedPdfPrepareFailureMessage,
  preparedFileMatchesFingerprint,
  SAVE_CTA_IDLE_LABEL,
  SAVE_CTA_PREPARING_LABEL,
  SAVE_CTA_SAVING_LABEL,
  SAVE_CTA_SHARE_READY_LABEL,
  shouldIgnoreDuplicateSaveTap,
  shouldRetainPreparedFileOnSave,
  tryAcquireSaveOperationLock,
} from './diary-save-pdf-coordination.js'
import { bumpPdfPrepareGeneration } from './diary-pdf-background-prepare.js'
import { resolvePostLoginDestination, isStaleVoluntaryLoginNext } from './auth/return-path.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const loginPage = readFileSync(join(root, 'app/(auth)/login/page.jsx'), 'utf8')

function sliceFn(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `missing ${startNeedle}`)
  const from = source.slice(start)
  const end = endNeedle ? from.indexOf(endNeedle) : from.length
  assert.ok(end > 0, `missing ${endNeedle} after ${startNeedle}`)
  return from.slice(0, end)
}

const handleSave = sliceFn(diaryPage, 'const handleSave = async', 'if (loading && !loadDiagnostic)')

describe('diary-save-pdf-coordination helpers', () => {
  it('A — tryAcquireSaveOperationLock is synchronous and exclusive', () => {
    const saveLockRef = { current: false }
    assert.equal(tryAcquireSaveOperationLock(saveLockRef), true)
    assert.equal(saveLockRef.current, true)
    assert.equal(tryAcquireSaveOperationLock(saveLockRef), false)
  })

  it('B — handleSave sets saving UI before first await in save path', () => {
    const savePathStart = handleSave.indexOf('if (!tryAcquireSaveOperationLock(saveLockRef))')
    const firstAwait = handleSave.indexOf('await ', savePathStart)
    const setSaving = handleSave.indexOf('setSaving(true)', savePathStart)
    assert.ok(savePathStart > 0)
    assert.ok(setSaving > savePathStart && setSaving < firstAwait)
    assert.match(handleSave, /emitShareDiag\('save-lock-acquired'/)
  })

  it('C — duplicate taps are ignored while save operation is active', () => {
    assert.equal(
      shouldIgnoreDuplicateSaveTap({
        saveLockRef: { current: true },
        finalSaveInProgressRef: { current: true },
        sharePrepared: false,
        saving: false,
      }),
      true,
    )
    assert.match(handleSave, /duplicate-save-tap-ignored/)
    assert.doesNotMatch(handleSave, /saveLockRef\.current && !saving/)
  })

  it('D — duplicate tap path does not scroll', () => {
    const dupBlock = handleSave.slice(
      handleSave.indexOf('duplicate-save-tap-ignored'),
      handleSave.indexOf('const failSave'),
    )
    assert.doesNotMatch(dupBlock, /scrollIntoView/)
    assert.doesNotMatch(handleSave, /Save is already in progress/)
  })

  it('E — save path does not await background idle before persistence', () => {
    const savePathStart = handleSave.indexOf('if (!tryAcquireSaveOperationLock(saveLockRef))')
    const flushPending = handleSave.indexOf('await flushPendingAutosave()', savePathStart)
    const beforePersist = handleSave.slice(savePathStart, flushPending)
    assert.doesNotMatch(beforePersist, /waitUntilIdle/)
  })

  it('F — stale background generation is bumped when prepared file is not retained', () => {
    const refs = {
      pdfPrepareGenerationRef: { current: 2 },
      pdfPrepareAbortRef: { current: { abort: () => {} } },
      pdfBackgroundPrepareAbortRef: { current: { abort: () => {} } },
      pdfBackgroundPrepareSchedulerRef: { current: { cancel: () => {} } },
    }
    const result = coordinateBackgroundPdfOnSaveStart({
      retainCurrentPreparedFile: false,
      bumpGeneration: bumpPdfPrepareGeneration,
      ...refs,
    })
    assert.equal(result.invalidatedPrepared, true)
    assert.equal(refs.pdfPrepareGenerationRef.current, 3)
  })

  it('G — retains prepared file when diary is clean and fingerprint is known', () => {
    const fp = 'a'.repeat(64)
    assert.equal(
      shouldRetainPreparedFileOnSave({
        diaryPersistedClean: true,
        reportId: 'rep-1',
        preparedEntry: {
          reportId: 'rep-1',
          contentFingerprint: fp,
          file: new File(['x'], 'a.pdf', { type: 'application/pdf' }),
          handoff: 'file-ready',
        },
      }),
      true,
    )
    assert.equal(preparedFileMatchesFingerprint({ contentFingerprint: fp }, fp), true)
  })

  it('H — stale prepared file is not retained when diary is dirty', () => {
    assert.equal(
      shouldRetainPreparedFileOnSave({
        diaryPersistedClean: false,
        reportId: 'rep-1',
        preparedEntry: {
          reportId: 'rep-1',
          contentFingerprint: 'b'.repeat(64),
          file: new File(['x'], 'a.pdf', { type: 'application/pdf' }),
        },
      }),
      false,
    )
    assert.match(handleSave, /prepared-file-invalidated/)
  })

  it('I — export client still dedupes enqueue by fingerprint (unchanged contract)', () => {
    const exportClient = readFileSync(join(root, 'lib/site-diary-pdf-export-client.js'), 'utf8')
    assert.match(exportClient, /enqueueSiteDiaryPdfExportJob/)
    assert.match(exportClient, /Fingerprint \(once\) \+ enqueue \(once\)/)
  })

  it('J — retain path can join in-flight background without invalidating generation', () => {
    let cancelled = false
    const result = coordinateBackgroundPdfOnSaveStart({
      retainCurrentPreparedFile: true,
      bumpGeneration: bumpPdfPrepareGeneration,
      pdfPrepareGenerationRef: { current: 5 },
      pdfPrepareAbortRef: { current: null },
      pdfBackgroundPrepareAbortRef: { current: null },
      pdfBackgroundPrepareSchedulerRef: {
        current: {
          cancel: () => { cancelled = true },
          isInFlight: () => true,
        },
      },
    })
    assert.equal(cancelled, true)
    assert.equal(result.joinBackgroundInFlight, true)
    assert.equal(result.invalidatedPrepared, false)
  })

  it('K — idle CTA label is Save', () => {
    assert.equal(SAVE_CTA_IDLE_LABEL, 'Save')
    assert.match(diaryPage, /SAVE_CTA_IDLE_LABEL/)
    assert.doesNotMatch(diaryPage, /'Save & Share'/)
  })

  it('L — prepared CTA label unchanged', () => {
    assert.equal(SAVE_CTA_SHARE_READY_LABEL, 'Report Ready — Share Now')
    assert.match(diaryPage, /SAVE_CTA_SHARE_READY_LABEL/)
  })

  it('M — PDF failure copy distinguishes diary saved', () => {
    const msg = diarySavedPdfPrepareFailureMessage('PDF export is taking longer than expected.')
    assert.match(msg, /Site Diary is saved/i)
    assert.match(handleSave, /failPdfAfterSave/)
    const failPdfFn = sliceFn(handleSave, 'const failPdfAfterSave = (message) => {', 'const finishAfterSuccessfulShare')
    assert.doesNotMatch(failPdfFn, /scrollIntoView/)
  })

  it('N — warm share path still uses sharePreparedFile / native file', () => {
    assert.match(handleSave, /await sharePreparedFile\(shareReadyPdfRef\.current\)/)
    assert.match(handleSave, /canSharePdfFile\(pdfFile\)/)
    assert.match(handleSave, /shareSiteDiaryPdfNative/)
  })

  it('O+P — background prepare module tests remain wired', () => {
    assert.match(diaryPage, /createDiaryPdfBackgroundPrepareScheduler/)
    assert.match(diaryPage, /runBackgroundPdfPrepare/)
  })

  it('Q — voluntary sign-out login lands on dashboard; recovery next still works', () => {
    const workbench = '/dashboard/project/abc/diary?report=rep-1'
    const setup = '/dashboard/diary/setup?report=rep-1&project=proj-1'
    assert.equal(
      resolvePostLoginDestination({ next: workbench, recovery: '1' }),
      workbench,
    )
    assert.equal(
      resolvePostLoginDestination({ next: setup, signedOut: false }),
      '/dashboard',
    )
    assert.equal(
      resolvePostLoginDestination({ next: setup, signedOut: true }),
      '/dashboard',
    )
    assert.equal(isStaleVoluntaryLoginNext(setup), true)
    assert.match(loginPage, /resolvePostLoginDestination/)
    assert.match(loginPage, /router\.replace\('\/login\?signedOut=1'\)/)
  })

  it('Saving vs Preparing labels are distinct in CTA', () => {
    assert.equal(SAVE_CTA_SAVING_LABEL, 'Saving…')
    assert.equal(SAVE_CTA_PREPARING_LABEL, 'Preparing report…')
    assert.match(diaryPage, /pdfPreparing \? SAVE_CTA_PREPARING_LABEL : SAVE_CTA_SAVING_LABEL/)
  })
})
