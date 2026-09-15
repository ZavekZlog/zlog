import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanReviewEvidencePathForCommittedGeneration } from './scan-review-evidence-path.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const labourHookPath = join(root, 'components/diary/useSiteDiaryLabour.js')

const PATH_A = 'uid/report-a/sign-in-sheet/1000.jpg'
const PATH_B = 'uid/report-a/sign-in-sheet/2000.jpg'
const PATH_C = 'uid/report-a/sign-in-sheet/3000.jpg'

describe('scanReviewEvidencePathForCommittedGeneration', () => {
  it('A — re-scan persisted A without re-persist binds review to A', () => {
    const path = scanReviewEvidencePathForCommittedGeneration({
      persistEvidence: false,
      editingReportId: 'rep-1',
      projectId: 'proj-1',
      sessionPersistedPath: PATH_A,
    })
    assert.equal(path, PATH_A)
  })

  it('B — replace with persist commits review to new path B', () => {
    const path = scanReviewEvidencePathForCommittedGeneration({
      persistEvidence: true,
      editingReportId: 'rep-1',
      projectId: 'proj-1',
      persistedStoragePathForGeneration: PATH_B,
      sessionPersistedPath: PATH_A,
    })
    assert.equal(path, PATH_B)
  })

  it('C — move provenance uses committed B (helper returns B for replace generation)', () => {
    assert.equal(
      scanReviewEvidencePathForCommittedGeneration({
        persistEvidence: true,
        editingReportId: 'rep-1',
        projectId: 'proj-1',
        persistedStoragePathForGeneration: PATH_B,
      }),
      PATH_B,
    )
  })

  it('D — new persisted generation C does not use session path A when persist applies', () => {
    const path = scanReviewEvidencePathForCommittedGeneration({
      persistEvidence: true,
      editingReportId: 'rep-1',
      projectId: 'proj-1',
      persistedStoragePathForGeneration: PATH_C,
      sessionPersistedPath: PATH_B,
    })
    assert.equal(path, PATH_C)
  })

  it('E — in-memory scan without persist does not inherit hydrated session path', () => {
    const path = scanReviewEvidencePathForCommittedGeneration({
      persistEvidence: true,
      editingReportId: null,
      projectId: 'proj-1',
      sessionPersistedPath: PATH_A,
    })
    assert.equal(path, null)
  })

  it('E — persist required but path missing yields null (failed persist generation)', () => {
    const path = scanReviewEvidencePathForCommittedGeneration({
      persistEvidence: true,
      editingReportId: 'rep-1',
      projectId: 'proj-1',
      persistedStoragePathForGeneration: null,
      sessionPersistedPath: PATH_A,
    })
    assert.equal(path, null)
  })
})

describe('useSiteDiaryLabour scanReviewEvidencePath wiring', () => {
  const hook = readFileSync(labourHookPath, 'utf8')

  it('binds review evidence path on OCR commit and clears with review reset', () => {
    assert.match(hook, /scanReviewEvidencePathForCommittedGeneration/)
    assert.match(hook, /setScanReviewEvidencePath/)
    assert.match(hook, /const \[scanReviewEvidencePath, setScanReviewEvidencePath\]/)
    const handleScan = hook.match(
      /const handleSignInSheetFiles = useCallback\(async \(files, \{ persistEvidence = true \} = \{\}\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(handleScan)
    assert.match(handleScan, /setScanReviewEvidencePath\(null\)/)
    assert.match(handleScan, /setScanReviewEvidencePath\(committedPath\)/)
  })

  it('Move to Visitors uses scanReviewEvidencePath only', () => {
    const moveStart = hook.indexOf('const handleOperativeMoveToVisitors = useCallback(')
    assert.ok(moveStart >= 0)
    const moveBlock = hook.slice(moveStart, moveStart + 1200)
    assert.match(moveBlock, /scanReviewEvidencePath/)
    assert.match(moveBlock, /const evidencePath = String\(scanReviewEvidencePath/)
    assert.doesNotMatch(moveBlock, /loadedSignInSheetPathRef/)
    assert.doesNotMatch(moveBlock, /signInSheetStoragePath/)
  })

  it('hydrate does not set scanReviewEvidencePath before OCR commit', () => {
    const hydrate = hook.match(
      /const hydrateSignInFromReport = useCallback\(async \(existing, isCancelled\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(hydrate)
    assert.doesNotMatch(hydrate, /setScanReviewEvidencePath/)
  })
})
