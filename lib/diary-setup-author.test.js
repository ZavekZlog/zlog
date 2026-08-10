import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETUP_PROJECT_INFORMATION_ORDER,
  SETUP_REPORT_AUTHOR_ORDER,
  authorRoleColumn,
  authorRoleWriteValue,
  diaryAuthorWriteFields,
  projectsPayloadExcludesAuthorRole,
} from './diary-setup-author.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')

describe('diary setup — Report Author order', () => {
  it('Author Name appears after project dates (Shift sits between)', () => {
    assert.deepEqual(SETUP_REPORT_AUTHOR_ORDER[0], 'authorName')
    const stickyIdx = setupPage.indexOf('<ProjectStickyFields')
    const datesIdx = setupPage.indexOf('<ProjectDatesFields')
    const shiftIdx = setupPage.indexOf('aria-label="Shift"')
    const authorIdx = setupPage.indexOf('Author Name')
    const roleIdx = setupPage.indexOf('Author Role')
    const behalfIdx = setupPage.indexOf('Reporting On Behalf Of')
    assert.ok(stickyIdx > 0 && datesIdx > stickyIdx)
    assert.ok(shiftIdx > datesIdx, 'Shift after project dates')
    assert.ok(authorIdx > shiftIdx, 'Author Name after Shift')
    assert.ok(roleIdx > authorIdx, 'Author Role beneath Author Name')
    assert.ok(behalfIdx > roleIdx, 'Reporting On Behalf Of after Author Role')
  })

  it('Author Role appears directly beneath Author Name as free-text input', () => {
    assert.deepEqual(SETUP_REPORT_AUTHOR_ORDER, ['authorName', 'authorRole'])
    assert.match(setupPage, /Author Role/)
    assert.match(setupPage, /e\.g\. Site Manager/)
    const roleBlock = setupPage.slice(
      setupPage.indexOf('Author Role'),
      setupPage.indexOf('Reporting On Behalf Of'),
    )
    assert.match(roleBlock, /type="text"/)
    assert.doesNotMatch(roleBlock, /<select/)
  })

  it('project information order keeps sticky fields before dates', () => {
    assert.deepEqual(SETUP_PROJECT_INFORMATION_ORDER, [
      'projectAddress',
      'projectManager',
      'workingDaysPerWeek',
      'currentPhase',
      'projectStartDate',
      'plannedCompletionDate',
    ])
  })
})

describe('diary setup — Author Role persistence target', () => {
  it('Author Role saves on the diary (creator_role), not public.projects', () => {
    assert.equal(authorRoleColumn(), 'daily_reports.creator_role')
    assert.deepEqual(
      diaryAuthorWriteFields({ authorName: 'Alex', authorRole: 'Site Manager' }),
      { creatorName: 'Alex', creatorRole: 'Site Manager' },
    )
    assert.equal(
      projectsPayloadExcludesAuthorRole({
        site_address: 'A',
        client_pm: 'B',
        start_date: '2026-08-01',
      }),
      true,
    )
    assert.equal(
      projectsPayloadExcludesAuthorRole({ creator_role: 'Nope' }),
      false,
    )
  })

  it('blank Author Role does not invent Site Manager and stays null for save', () => {
    assert.equal(authorRoleWriteValue(''), null)
    assert.equal(authorRoleWriteValue(null), null)
    assert.deepEqual(
      diaryAuthorWriteFields({ authorName: 'Alex', authorRole: '' }),
      { creatorName: 'Alex', creatorRole: null },
    )
  })
})
