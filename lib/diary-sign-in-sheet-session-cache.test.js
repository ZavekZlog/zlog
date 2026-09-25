/**
 * Attendance Register prepared JPEG session cache — single fetch, reuse, eviction.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preparedSignInSheetFileFromBlob } from './diary-sign-in-sheet-evidence.js'
import {
  clearSignInSheetSessionCache,
  evictSignInSheetSessionEvidence,
  fetchSignInSheetEvidenceBlob,
  getSignInSheetSessionCacheStats,
  loadSignInSheetPreparedEvidence,
  peekSignInSheetSessionInflight,
  SIGN_IN_SHEET_EVIDENCE_FETCH_TIMEOUT_MS,
  signInSheetSessionCacheKey,
  storeSignInSheetSessionBlob,
} from './diary-sign-in-sheet-session-cache.js'

const libDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(libDir, '..')
const labourHook = readFileSync(join(repoRoot, 'components/diary/useSiteDiaryLabour.js'), 'utf8')
const diaryPage = readFileSync(
  join(repoRoot, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)

const PATH_A = 'uid/report-a/sign-in-sheet/1000.jpg'
const PATH_B = 'uid/report-b/sign-in-sheet/2000.jpg'

function jpegBlob(label = 'SIGNIN-JPEG') {
  return new Blob([label], { type: 'image/jpeg' })
}

describe('sign-in sheet session cache', () => {
  beforeEach(() => {
    clearSignInSheetSessionCache()
  })

  afterEach(() => {
    clearSignInSheetSessionCache()
  })

  it('keys by stable storage path only, never signed URL', () => {
    assert.equal(signInSheetSessionCacheKey(PATH_A), PATH_A)
    assert.equal(signInSheetSessionCacheKey('https://signed.example/x'), null)
    assert.equal(signInSheetSessionCacheKey('uid/report-a/covers/1.jpg'), null)
  })

  it('full evidence fetch failure ceiling is 15 seconds', () => {
    assert.equal(SIGN_IN_SHEET_EVIDENCE_FETCH_TIMEOUT_MS, 15_000)
  })

  it('evidence fetch before timeout receives signal and is not aborted', async () => {
    let capturedSignal
    const blob = await fetchSignInSheetEvidenceBlob('https://signed.example/register.jpg', {
      timeoutMs: 500,
      fetch: async (_url, init) => {
        capturedSignal = init.signal
        return { ok: true, blob: async () => jpegBlob('within-limit') }
      },
    })
    assert.equal(await blob.text(), 'within-limit')
    assert.ok(capturedSignal)
    assert.equal(capturedSignal.aborted, false)
  })

  it('evidence fetch exceeding timeout aborts transfer with sign-in-sheet-fetch-timeout', async () => {
    let capturedSignal
    let abortListenerFired = false
    await assert.rejects(
      () => fetchSignInSheetEvidenceBlob('https://signed.example/register.jpg', {
        timeoutMs: 50,
        fetch: async (_url, init) => {
          capturedSignal = init.signal
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              abortListenerFired = true
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          })
        },
      }),
      /sign-in-sheet-fetch-timeout/,
    )
    assert.ok(capturedSignal)
    assert.equal(capturedSignal.aborted, true)
    assert.equal(abortListenerFired, true)
  })

  it('timed-out prepared load clears inflight and does not write session cache', async () => {
    const hangUntilAbort = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
    const deps = {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      evidenceFetchTimeoutMs: 50,
      fetch: hangUntilAbort,
    }
    await assert.rejects(
      () => loadSignInSheetPreparedEvidence(PATH_A, deps),
      /sign-in-sheet-fetch-timeout/,
    )
    assert.equal(peekSignInSheetSessionInflight(PATH_A), null)
    assert.equal(getSignInSheetSessionCacheStats().entries, 0)
  })

  it('Try again after timeout performs exactly one fresh GET then caches blob', async () => {
    let fetchCount = 0
    const hangUntilAbort = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
    const deps = {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      evidenceFetchTimeoutMs: 50,
      fetch: async (url, init) => {
        fetchCount += 1
        if (fetchCount === 1) {
          return hangUntilAbort(url, init)
        }
        return { ok: true, blob: async () => jpegBlob('retry-ok') }
      },
    }
    await assert.rejects(
      () => loadSignInSheetPreparedEvidence(PATH_A, deps),
      /sign-in-sheet-fetch-timeout/,
    )
    evictSignInSheetSessionEvidence(PATH_A)
    const recovered = await loadSignInSheetPreparedEvidence(PATH_A, {
      ...deps,
      evidenceFetchTimeoutMs: 500,
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => jpegBlob('retry-ok') }
      },
    })
    assert.equal(recovered.cacheHit, false)
    assert.equal(await recovered.blob.text(), 'retry-ok')
    assert.equal(fetchCount, 2)
    const warm = await loadSignInSheetPreparedEvidence(PATH_A, {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => jpegBlob('should-not-run') }
      },
    })
    assert.equal(warm.cacheHit, true)
    assert.equal(fetchCount, 2)
  })

  it('failed fetch does not cache; evict and retry refetch succeeds', async () => {
    let fetchCount = 0
    const deps = {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        if (fetchCount === 1) {
          return { ok: false, status: 503 }
        }
        return { ok: true, blob: async () => jpegBlob('retry-ok') }
      },
    }
    await assert.rejects(
      () => loadSignInSheetPreparedEvidence(PATH_A, deps),
      /sign-in-sheet-fetch-failed:503/,
    )
    evictSignInSheetSessionEvidence(PATH_A)
    const recovered = await loadSignInSheetPreparedEvidence(PATH_A, deps)
    assert.equal(recovered.cacheHit, false)
    assert.equal(await recovered.blob.text(), 'retry-ok')
    assert.equal(fetchCount, 2)
  })

  it('stale hydrate generation cannot commit evidence UI state', () => {
    assert.match(labourHook, /signInEvidenceHydrateGenRef/)
    assert.match(labourHook, /generation !== signInEvidenceHydrateGenRef\.current/)
    assert.match(labourHook, /retrySignInEvidenceLoad/)
    assert.match(labourHook, /evictSignInSheetSessionEvidence\(path\)/)
  })

  it('cache miss performs exactly ONE image network fetch', async () => {
    let fetchCount = 0
    const body = jpegBlob('evidence-a')
    const result = await loadSignInSheetPreparedEvidence(PATH_A, {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => body }
      },
    })
    assert.equal(fetchCount, 1)
    assert.equal(result.cacheHit, false)
    assert.equal(result.networkFetchCount, 1)
    assert.equal(result.blob?.size, body.size)
  })

  it('display preview and scanLastFile can derive from the same fetched evidence', () => {
    const blob = jpegBlob('shared-bytes')
    const file = preparedSignInSheetFileFromBlob(blob)
    assert.ok(file)
    assert.equal(file.size, blob.size)
    assert.match(labourHook, /applyPersistedSignInEvidenceBlob/)
    assert.match(labourHook, /preparedSignInSheetFileFromBlob\(blob\)/)
    assert.match(labourHook, /URL\.createObjectURL\(blob\)/)
  })

  it('second hydrate of unchanged path is cache hit with ZERO network fetches', async () => {
    let fetchCount = 0
    const deps = {
      signedUrlForPath: async () => 'https://signed.example/register.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => jpegBlob('evidence-a') }
      },
    }
    const first = await loadSignInSheetPreparedEvidence(PATH_A, deps)
    assert.equal(first.cacheHit, false)
    const second = await loadSignInSheetPreparedEvidence(PATH_A, deps)
    assert.equal(second.cacheHit, true)
    assert.equal(fetchCount, 1)
    assert.equal(second.networkFetchCount, 0)
  })

  it('Re-scan path uses scanLastFile without re-downloading stored evidence on cache hit', async () => {
    const blob = jpegBlob('for-rescan')
    storeSignInSheetSessionBlob(PATH_A, blob)
    let fetchCount = 0
    const { blob: loaded, cacheHit } = await loadSignInSheetPreparedEvidence(PATH_A, {
      signedUrlForPath: async () => {
        fetchCount += 1
        return 'https://signed.example/register.jpg'
      },
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => blob }
      },
    })
    assert.equal(cacheHit, true)
    assert.equal(fetchCount, 0)
    assert.ok(preparedSignInSheetFileFromBlob(loaded))
    assert.match(
      labourHook,
      /const retrySignInScan = useCallback\(\(\) => \{\s*if \(scanLastFile\) \{\s*handleSignInSheetFiles\(\[scanLastFile\], \{ persistEvidence: false \}\)/,
    )
  })

  it('replacing image evicts old path evidence', () => {
    storeSignInSheetSessionBlob(PATH_A, jpegBlob('old'))
    assert.ok(storeSignInSheetSessionBlob(PATH_A, jpegBlob('old')))
    evictSignInSheetSessionEvidence(PATH_A)
    assert.equal(signInSheetSessionCacheKey(PATH_A), PATH_A)
    assert.match(labourHook, /evictSignInSheetSessionEvidence\(previousStoragePath\)/)
    assert.match(labourHook, /rememberSignInSheetSessionEvidence\(persistResult\.storagePath, preparedBlob\)/)
  })

  it('deleting image evicts cached evidence', () => {
    storeSignInSheetSessionBlob(PATH_A, jpegBlob('delete-me'))
    evictSignInSheetSessionEvidence(PATH_A)
    assert.match(labourHook, /evictSignInSheetSessionEvidence\(path\)/)
  })

  it('different storage path cannot receive stale previous image blob', async () => {
    storeSignInSheetSessionBlob(PATH_A, jpegBlob('path-a'))
    let fetchCount = 0
    const { blob } = await loadSignInSheetPreparedEvidence(PATH_B, {
      signedUrlForPath: async () => 'https://signed.example/b.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => jpegBlob('path-b') }
      },
    })
    assert.equal(fetchCount, 1)
    const textA = await blob.text()
    assert.equal(textA, 'path-b')
    const hitA = await loadSignInSheetPreparedEvidence(PATH_A, {
      signedUrlForPath: async () => 'https://signed.example/a.jpg',
      supabase: {},
      fetch: async () => {
        fetchCount += 1
        return { ok: true, blob: async () => jpegBlob('path-a') }
      },
    })
    assert.equal(hitA.cacheHit, true)
    assert.equal(fetchCount, 1)
  })

  it('workbench critical loader stays independent of attendance cache', () => {
    assert.match(diaryPage, /hydrateSignInEvidenceInBackground/)
    assert.match(diaryPage, /void labourScan\.hydrateSignInFromReport/)
    assert.doesNotMatch(labourHook, /loadSignInSheetPreparedEvidence[\s\S]*finalizeSiteDiarySave/)
  })

  it('hydrate uses session loader instead of duplicate fetch\(signedUrl\)', () => {
    assert.match(labourHook, /loadPersistedSignInEvidenceForPath\(hydratedSignInPath/)
    const hydrateBlock = labourHook.match(
      /const hydrateSignInFromReport = useCallback\(async \(existing, isCancelled\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(hydrateBlock)
    assert.doesNotMatch(hydrateBlock, /fetch\(signInPreview\)/)
    assert.doesNotMatch(hydrateBlock, /setScanSheetPreview\(signInPreview\)/)
  })

  it('stored path + successful cold hydrate: one fetch, preview/file/Re-scan wiring', () => {
    assert.match(labourHook, /applyPersistedSignInEvidenceBlob/)
    assert.match(labourHook, /setScanLastFile\(file\)/)
    assert.match(labourHook, /URL\.createObjectURL\(blob\)/)
    assert.match(labourHook, /scanSignInEvidenceLoading/)
  })

  it('fetch failure exposes recoverable retry without deleting stored evidence', () => {
    assert.match(labourHook, /retrySignInEvidenceLoad/)
    assert.match(labourHook, /evictSignInSheetSessionEvidence\(path\)/)
    const loadBlock = labourHook.match(
      /const loadPersistedSignInEvidenceForPath = useCallback\(async \(storagePath, isCancelled = \(\) => false\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/,
    )?.[0]
    assert.ok(loadBlock)
    assert.doesNotMatch(loadBlock, /clearPersistedSignInSheetEvidence/)
    assert.doesNotMatch(loadBlock, /setSignInSheetStoragePath\(null\)/)
  })

  it('invalid storage path throws instead of silent null blob', async () => {
    await assert.rejects(
      () => loadSignInSheetPreparedEvidence('not-a-valid-path', {
        signedUrlForPath: async () => 'https://signed.example/x',
        supabase: {},
        fetch: async () => ({ ok: true, blob: async () => jpegBlob() }),
      }),
      /sign-in-sheet-invalid-storage-path/,
    )
  })

  it('Group A labour persistence wiring remains on finalizeLabourOnly path', () => {
    assert.match(labourHook, /persistAppliedLabourRows\(supabase, editingReportId, projectId/)
    assert.doesNotMatch(labourHook, /replaceLabour/)
  })
})
