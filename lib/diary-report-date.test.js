/**
 * Report Date — new diary local-today vs edit saved-date (timezone-safe).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  localCalendarIsoDate,
  reportDateInputValue,
  todayIsoDate,
} from './report-setup.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'
import { reusableDiaryFields } from './diary-draft.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportSetupSrc = readFileSync(join(root, 'lib/report-setup.js'), 'utf8')
const draftSrc = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

describe('Report Date — timezone-safe local calendar', () => {
  it('todayIsoDate / localCalendarIsoDate do not use UTC toISOString slicing', () => {
    assert.doesNotMatch(
      reportSetupSrc.slice(
        reportSetupSrc.indexOf('export function todayIsoDate'),
        reportSetupSrc.indexOf('export function todayIsoDate') + 220,
      ),
      /toISOString/,
    )
    assert.match(reportSetupSrc, /getFullYear\(\)/)
    assert.match(reportSetupSrc, /getMonth\(\)/)
    assert.match(reportSetupSrc, /getDate\(\)/)
  })

  it('local calendar date matches local Y-M-D components (not UTC shift)', () => {
    // 00:30 local on 14 Aug — UTC may still be 13 Aug in positive offsets.
    const localMorning = new Date(2026, 7, 14, 0, 30, 0)
    assert.equal(localCalendarIsoDate(localMorning), '2026-08-14')

    // 23:30 local on 14 Aug — UTC may already be 15 Aug in negative offsets.
    const localLate = new Date(2026, 7, 14, 23, 30, 0)
    assert.equal(localCalendarIsoDate(localLate), '2026-08-14')
  })

  it('todayIsoDate equals localCalendarIsoDate(now)', () => {
    assert.equal(todayIsoDate(), localCalendarIsoDate(new Date()))
  })
})

describe('New diary Report Date defaults to today (not previous diary)', () => {
  it('new diary after yesterday’s diary → defaults to today', () => {
    const yesterday = '2026-08-13'
    const today = todayIsoDate()
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      // Explicit omit — factory must use local today, not a prior diary date.
      existingProject: {
        id: 'proj-1',
        name: 'North',
        project_reference: 'X',
        // No report_date on projects — ensure merge cannot invent yesterday.
      },
    })
    assert.equal(state.reportDate, today)
    assert.notEqual(state.reportDate, yesterday)
  })

  it('new diary created after editing an old diary → today, not old diary date', () => {
    const oldDiaryDate = '2026-07-01'
    const afterEdit = initialiseNewDiarySetupState({
      authorName: 'Alex',
      authorRole: 'Site Manager',
      reportDate: todayIsoDate(),
    })
    assert.equal(afterEdit.reportDate, todayIsoDate())
    assert.notEqual(afterEdit.reportDate, oldDiaryDate)
    assert.match(setupPage, /reportDate: todayIsoDate\(\)/)
  })

  it('previous/reused diary data → date still resets to today', () => {
    const source = {
      report_date: '2026-08-01',
      branding_id: 'b1',
      brand_color: '#123',
      brand_logo_url: 'logo.png',
      company_reporting_for: 'Acme',
      creator_name: 'Prior',
    }
    const reusable = reusableDiaryFields(source)
    assert.equal(Object.prototype.hasOwnProperty.call(reusable, 'report_date'), false)
    assert.match(draftSrc, /report_date: todayIso\(\)/)
    assert.doesNotMatch(draftSrc, /report_date: source\.report_date/)
  })

  it('setup + diary pages use todayIsoDate (not toISOString slice) for new defaults', () => {
    assert.match(setupPage, /todayIsoDate/)
    assert.match(diaryPage, /todayIsoDate/)
    assert.doesNotMatch(diaryPage, /toISOString\(\)\.slice\(0,\s*10\)/)
    assert.doesNotMatch(diaryPage, /toISOString\(\)\.split\('T'\)/)
  })
})

describe('Chosen / saved Report Date persistence rules', () => {
  it('user manually changes new diary date → chosen date is what continue/draft write', () => {
    assert.match(setupPage, /reportDate,/)
    assert.match(setupPage, /form:\s*\{[\s\S]*reportDate/)
    // Continue passes form.reportDate into create/update draft.
    const continueSrc = readFileSync(join(root, 'lib/diary-setup-continue.js'), 'utf8')
    assert.match(continueSrc, /reportDate: form\.reportDate/)
    const draft = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')
    assert.match(draft, /report_date: setup\.reportDate \|\| todayIso\(\)/)
    assert.match(draft, /report_date: fields\.reportDate \|\| todayIso\(\)/)
  })

  it('reopen existing diary → saved date remains unchanged (not replaced with today)', () => {
    const saved = '2026-08-05'
    assert.equal(reportDateInputValue(saved), '2026-08-05')
    assert.equal(reportDateInputValue('2026-08-05T12:00:00.000Z'), '2026-08-05')
    assert.match(setupPage, /reportDateInputValue\(report\?\.report_date\)/)
    assert.match(diaryPage, /reportDateInputValue\(existing\.report_date\)/)
    // Edit must not force today over a present saved date.
    assert.doesNotMatch(
      setupPage.slice(
        setupPage.indexOf('loadEditDiarySetupSources'),
        setupPage.indexOf('loadEditDiarySetupSources') + 2500,
      ),
      /setReportDate\(todayIsoDate\(\)\)/,
    )
  })
})
