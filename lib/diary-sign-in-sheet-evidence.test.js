import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearPersistedSignInSheetEvidence,
  replacePersistedSignInSheetEvidence,
  signInSheetSetupFieldsFromSync,
} from './diary-sign-in-sheet-evidence.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = join(
  root,
  'supabase/migrations/20260913120000_daily_reports_sign_in_sheet_url.sql',
)
const diaryPath = join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx')
const evidenceLib = readFileSync(
  join(root, 'lib/diary-sign-in-sheet-evidence.js'),
  'utf8',
)

const tinyJpegDataUrl =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=='

function mockSupabase({ uploadError = null, dbError = null, removeCalls = [] } = {}) {
  const uploadedPaths = []
  return {
    uploadedPaths,
    removeCalls,
    storage: {
      from() {
        return {
          upload: async (path) => {
            if (uploadError) return { error: uploadError }
            uploadedPaths.push(path)
            return { error: null }
          },
          remove: async (paths) => {
            removeCalls.push(...paths)
            return { error: null }
          },
        }
      },
    },
    async updateDiarySetupFields(_supabase, { fields }) {
      if (dbError) throw dbError
      assert.ok(Object.prototype.hasOwnProperty.call(fields, 'signInSheetUrl'))
      assert.equal(Object.prototype.hasOwnProperty.call(fields, 'signInSheetProcessingVersion'), false)
      return { id: 'rep-1' }
    },
  }
}

describe('sign-in sheet migration (repo only)', () => {
  it('12. migration contains sign_in_sheet_url only', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    assert.match(sql, /sign_in_sheet_url/)
    assert.doesNotMatch(sql, /sign_in_sheet_processing_version/)
  })

  it('13. no sign_in_sheet_processing_version runtime dependency', () => {
    assert.doesNotMatch(evidenceLib, /sign_in_sheet_processing_version/)
    assert.doesNotMatch(evidenceLib, /signInSheetProcessingVersion/)
    const diary = readFileSync(diaryPath, 'utf8')
    assert.doesNotMatch(diary, /sign_in_sheet_processing_version/)
    assert.doesNotMatch(diary, /processingVersion: prepared/)
  })
})

describe('replacePersistedSignInSheetEvidence safety', () => {
  it('1. upload failure preserves old evidence (no DB write, no delete)', async () => {
    const mock = mockSupabase({ uploadError: { message: 'upload-fail' } })
    const result = await replacePersistedSignInSheetEvidence(
      { storage: mock.storage },
      mock.updateDiarySetupFields,
      {
        userId: 'u1',
        reportId: 'r1',
        projectId: 'p1',
        dataUrl: tinyJpegDataUrl,
        previousStoragePath: 'u1/r1/sign-in-sheet/1.jpg',
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.stage, 'upload')
    assert.equal(mock.uploadedPaths.length, 0)
    assert.equal(mock.removeCalls.length, 0)
  })

  it('2. DB failure preserves old evidence (no path commit)', async () => {
    const mock = mockSupabase({ dbError: new Error('db-fail') })
    const result = await replacePersistedSignInSheetEvidence(
      { storage: mock.storage },
      mock.updateDiarySetupFields,
      {
        userId: 'u1',
        reportId: 'r1',
        projectId: 'p1',
        dataUrl: tinyJpegDataUrl,
        previousStoragePath: 'u1/r1/sign-in-sheet/1.jpg',
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.stage, 'db')
    assert.equal(mock.uploadedPaths.length, 1)
    assert.equal(mock.removeCalls.length, 1)
    assert.equal(mock.removeCalls[0], mock.uploadedPaths[0])
    assert.doesNotMatch(mock.removeCalls.join(','), /sign-in-sheet\/1\.jpg/)
  })

  it('3. DB failure cleans new orphan best-effort', async () => {
    const mock = mockSupabase({ dbError: new Error('db-fail') })
    await replacePersistedSignInSheetEvidence(
      { storage: mock.storage },
      mock.updateDiarySetupFields,
      {
        userId: 'u1',
        reportId: 'r1',
        projectId: 'p1',
        dataUrl: tinyJpegDataUrl,
        previousStoragePath: 'u1/r1/sign-in-sheet/99.jpg',
      },
    )
    assert.equal(mock.removeCalls.length, 1)
    assert.match(mock.removeCalls[0], /sign-in-sheet\/\d+\.jpg/)
  })

  it('4. old-object delete failure does not invalidate successful replace', async () => {
    const removeCalls = []
    const supabase = {
      storage: {
        from() {
          return {
            upload: async (path) => ({ error: null, path }),
            remove: async (paths) => {
              removeCalls.push(...paths)
              throw new Error('delete-fail')
            },
          }
        },
      },
    }
    let dbPath = 'u1/r1/sign-in-sheet/1.jpg'
    const updateDiarySetupFields = async (_s, { fields }) => {
      dbPath = fields.signInSheetUrl
      return { id: 'r1' }
    }
    const result = await replacePersistedSignInSheetEvidence(supabase, updateDiarySetupFields, {
      userId: 'u1',
      reportId: 'r1',
      projectId: 'p1',
      dataUrl: tinyJpegDataUrl,
      previousStoragePath: 'u1/r1/sign-in-sheet/1.jpg',
      generation: 2,
    })
    assert.equal(result.ok, true)
    assert.equal(dbPath, 'u1/r1/sign-in-sheet/2.jpg')
    assert.ok(removeCalls.includes('u1/r1/sign-in-sheet/1.jpg'))
  })
})

describe('clearPersistedSignInSheetEvidence safety', () => {
  it('6. DB failure preserves evidence (ok false)', async () => {
    const mock = mockSupabase({ dbError: new Error('db-fail') })
    const result = await clearPersistedSignInSheetEvidence(
      { storage: mock.storage },
      mock.updateDiarySetupFields,
      {
        reportId: 'r1',
        projectId: 'p1',
        storagePath: 'u1/r1/sign-in-sheet/5.jpg',
      },
    )
    assert.equal(result.ok, false)
    assert.equal(mock.removeCalls.length, 0)
  })

  it('7–8. DB success clears reference; storage delete failure is non-destructive', async () => {
    const removeCalls = []
    const supabase = {
      storage: {
        from() {
          return {
            remove: async (paths) => {
              removeCalls.push(...paths)
              throw new Error('storage-fail')
            },
          }
        },
      },
    }
    const fieldsWritten = []
    const updateDiarySetupFields = async (_s, { fields }) => {
      fieldsWritten.push(fields)
      return { id: 'r1' }
    }
    const result = await clearPersistedSignInSheetEvidence(supabase, updateDiarySetupFields, {
      reportId: 'r1',
      projectId: 'p1',
      storagePath: 'u1/r1/sign-in-sheet/5.jpg',
    })
    assert.equal(result.ok, true)
    assert.deepEqual(fieldsWritten[0], signInSheetSetupFieldsFromSync({ removed: true }))
    assert.equal(removeCalls.length, 1)
  })
})

describe('diary page wiring (safety repair)', () => {
  const labourHook = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'components/diary/useSiteDiaryLabour.js'),
    'utf8',
  )

  it('5. UI only updates path refs after persist success', () => {
    const block = labourHook.match(
      /const handleSignInSheetFiles = useCallback\(async \(files, \{ persistEvidence = true \} = \{\}\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(block)
    assert.match(block, /replacePersistedSignInSheetEvidence/)
    assert.match(block, /if \(!persistResult\.ok \|\| !persistResult\.storagePath\)/)
    assert.match(block, /loadedSignInSheetPathRef\.current = persistResult\.storagePath/)
    const persistIdx = block.indexOf('replacePersistedSignInSheetEvidence')
    const previewIdx = block.indexOf('setScanSheetPreview(prepared.dataUrl)')
    assert.ok(persistIdx > 0 && previewIdx > persistIdx)
  })

  it('9–10. Labour summary not cleared on replace/remove handlers', () => {
    assert.doesNotMatch(
      labourHook.match(
        /const handleSignInSheetFiles = useCallback\(async \(files, \{ persistEvidence = true \} = \{\}\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
      )?.[0] || '',
      /setLabourRows/,
    )
    const removeBlock = labourHook.match(
      /const removeSignInSheetEvidence = useCallback\(async \(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(removeBlock)
    assert.doesNotMatch(removeBlock, /setLabourRows/)
    assert.match(removeBlock, /await clearPersistedSignInSheetEvidence/)
    assert.doesNotMatch(removeBlock, /void clearPersisted/)
  })

  it('11. Retry skips persistence', () => {
    assert.match(labourHook, /persistEvidence: false/)
    assert.match(labourHook, /retrySignInScan/)
  })
})
