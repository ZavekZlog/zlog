/**
 * Golden Journey C — Use a Previous Diary (contract layer).
 * Authenticated browser pick→clone requires future E2E; this locks immutability rules.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { basisCreatesNewDiaryId } from '../diary-view-mode.js'
import { authorNameFromUser } from '../report-setup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')

describe('Golden Journey C — Previous Diary (contract)', () => {
  it('hub offers Use a Previous Diary and states source stays unchanged', () => {
    assert.match(hubPage, /Use a Previous Diary/)
    assert.match(hubPage, /earlier diary stays unchanged|stays unchanged/i)
  })

  it('basis/previous flow creates a new diary id (source not overwritten)', () => {
    assert.equal(basisCreatesNewDiaryId('source-diary-abc', 'new-diary-xyz'), true)
    assert.equal(basisCreatesNewDiaryId('same-id', 'same-id'), false)
  })

  it('author still follows profile-author rules (never email local-part)', () => {
    const name = authorNameFromUser(
      { email: 'crew.lead@example.com', user_metadata: { full_name: 'Crew Lead' } },
      { full_name: 'Crew Lead' },
    )
    assert.equal(name, 'Crew Lead')
    assert.notEqual(
      authorNameFromUser({ email: 'crew.lead@example.com', user_metadata: {} }, null),
      'crew.lead',
    )
  })
})
