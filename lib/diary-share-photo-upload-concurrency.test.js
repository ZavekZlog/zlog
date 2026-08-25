/**
 * Live Save & Share — bounded work-photo upload concurrency (source contract).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(
  join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
  'utf8',
)
const photosLib = readFileSync(join(root, 'lib/diary-pdf-photos.js'), 'utf8')

describe('Live Save & Share — bounded photo upload concurrency', () => {
  it('uses mapWithConcurrency with SHARE_PHOTO_UPLOAD_CONCURRENCY = 2', () => {
    assert.match(diaryPage, /SHARE_PHOTO_UPLOAD_CONCURRENCY = 2/)
    assert.match(diaryPage, /mapWithConcurrency/)
    assert.match(diaryPage, /mapWithConcurrency\(\s*sequenced,\s*SHARE_PHOTO_UPLOAD_CONCURRENCY/)
    assert.doesNotMatch(
      diaryPage,
      /for \(const photo of sequenced\)[\s\S]{0,400}await supabase\.storage[\s\S]{0,400}\.upload/,
      'must not sequentially await each storage upload in a for-loop',
    )
  })

  it('mapWithConcurrency enforces a fixed worker pool (never unbounded all-at-once)', () => {
    assert.match(photosLib, /export async function mapWithConcurrency/)
    assert.match(photosLib, /for \(let i = 0; i < limit; i \+= 1\)/)
    assert.match(photosLib, /Math\.min\(concurrency, list\.length/)
    assert.doesNotMatch(
      photosLib,
      /Promise\.all\(list\.map/,
      'mapWithConcurrency must not fan out one promise per item',
    )
  })

  it('preserves photo record ordering via ordered results iteration', () => {
    const handleSaveStart = diaryPage.indexOf('const handleSave = async')
    assert.ok(handleSaveStart > 0)
    const saveBlock = diaryPage.slice(handleSaveStart, handleSaveStart + 28000)
    assert.match(saveBlock, /photoPersistResults = await mapWithConcurrency/)
    assert.match(saveBlock, /for \(const result of photoPersistResults\)/)
    assert.match(saveBlock, /photoRecords\.push\(result\.record\)/)
    assert.match(saveBlock, /updateExistingPhotos\.push\(result\.patch\)/)
  })

  it('waits for all uploads before finalizeSiteDiarySave and PDF prepare', () => {
    const handleSaveStart = diaryPage.indexOf('const handleSave = async')
    const saveBlock = diaryPage.slice(handleSaveStart, handleSaveStart + 28000)
    const persistIdx = saveBlock.indexOf('photoPersistResults = await mapWithConcurrency')
    const finalizeIdx = saveBlock.indexOf('await finalizeSiteDiarySave')
    const prepareIdx = saveBlock.indexOf('await prepareSiteDiaryPdf')
    assert.ok(persistIdx > 0 && finalizeIdx > persistIdx, 'finalize follows bounded upload')
    assert.ok(prepareIdx > finalizeIdx, 'PDF prepare follows finalize')
  })

  it('upload failure still blocks progression with existing failSave messages', () => {
    const handleSaveStart = diaryPage.indexOf('const handleSave = async')
    const saveBlock = diaryPage.slice(handleSaveStart, handleSaveStart + 28000)
    assert.match(saveBlock, /persistStage = 'photo'/)
    assert.match(saveBlock, /persistStage = 'overlay'/)
    assert.match(saveBlock, /We couldn’t upload a photo\. Check your connection and try Share again\./)
    assert.match(saveBlock, /We couldn’t upload photo mark-ups\. Check your connection and try Share again\./)
    assert.doesNotMatch(
      saveBlock.slice(saveBlock.indexOf('photoPersistResults'), saveBlock.indexOf('await finalizeSiteDiarySave')),
      /prepareSiteDiaryPdf/,
      'must not prepare PDF inside the upload worker',
    )
  })
})
