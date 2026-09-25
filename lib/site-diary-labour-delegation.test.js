/**
 * Labour Isolation Unit 2 — diary page delegates Labour/sign-in to hook + section.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'), 'utf8')
const labourSection = readFileSync(join(root, 'components/diary/SiteDiaryLabourSection.jsx'), 'utf8')
const labourHook = readFileSync(join(root, 'components/diary/useSiteDiaryLabour.js'), 'utf8')

describe('Site Diary labour delegation (Unit 2)', () => {
  it('page imports SiteDiaryLabourSection and useSiteDiaryLabour', () => {
    assert.match(diaryPage, /import \{ useSiteDiaryLabour \} from '@\/components\/diary\/useSiteDiaryLabour'/)
    assert.match(diaryPage, /import \{ SiteDiaryLabourSection \} from '@\/components\/diary\/SiteDiaryLabourSection'/)
    assert.match(diaryPage, /<SiteDiaryLabourSection/)
    assert.match(diaryPage, /useSiteDiaryLabour\(/)
  })

  it('page does not define sign-in scan handlers inline', () => {
    assert.doesNotMatch(diaryPage, /const handleSignInSheetFiles = useCallback/)
    assert.doesNotMatch(diaryPage, /const applyScanOperativesToLabour = useCallback/)
  })

  it('hook owns sign-in scan handlers', () => {
    assert.match(labourHook, /const handleSignInSheetFiles = useCallback/)
    assert.match(labourHook, /const applyScanOperativesToLabour = useCallback/)
  })

  it('reportDate is passed to SiteDiaryLabourSection', () => {
    assert.match(diaryPage, /reportDate=\{reportDate\}/)
    assert.match(labourSection, /reportDate=\{reportDate\}/)
  })
})
