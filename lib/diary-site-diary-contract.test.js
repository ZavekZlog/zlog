/**
 * Protected Site Diary regression gate.
 * Prefer rendered page labels / ordering over helper-only presence.
 *
 * Run: npm run test:site-diary-contract
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_SITE_DIARY_SHIFT,
  SETUP_FIELD_SEQUENCE,
  SETUP_UI_LABEL_SEQUENCE,
  SITE_DIARY_SHIFT_OPTIONS,
  assertSetupUiLabelOrder,
  hydrateShift,
  setupSourceHasProtectedShiftUi,
  shiftSelectOptions,
} from './diary-setup-shift.js'
import {
  initialiseNewDiarySetupState,
  isCleanScratchSetupState,
  clearToNewProjectSelection,
} from './diary-setup-blank.js'
import { mergeProjectIntoSetupState, NEW_PROJECT_SENTINEL } from './diary-setup-project-dates.js'
import {
  resolveDiaryInteractionMode,
  diaryViewHref,
  diaryEditHref,
  basisCreatesNewDiaryId,
} from './diary-view-mode.js'
import {
  shouldShowBrandingSelector,
  shouldShowRecentDiariesOnReportPage,
  hydratePlantFormRows,
  emptyPlantFormRows,
  linkedProjectForSavedDiary,
  postSaveDiaryHref,
  saveKeepsSameDiaryId,
} from './diary-form-hydrate.js'
import { validateDiarySetupContinue } from './diary-setup-continue.js'
import { computeProjectDay } from './project-day.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const contractDoc = readFileSync(join(root, 'docs/PROTECTED_SITE_DIARY_CONTRACT.md'), 'utf8')
const cursorRule = readFileSync(
  join(root, '.cursor/rules/protected-site-diary-contract.mdc'),
  'utf8',
)

describe('protected contract docs / rule', () => {
  it('authoritative contract hierarchy and Cursor rules exist', () => {
    assert.equal(existsSync(join(root, 'docs/PROTECTED_SITE_DIARY_CONTRACT.md')), true)
    assert.equal(existsSync(join(root, 'docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md')), true)
    assert.equal(existsSync(join(root, 'docs/contracts/PROJECT_MODEL_CONTRACT.md')), true)
    assert.equal(existsSync(join(root, 'docs/contracts/REPORT_BRANDING_CONTRACT.md')), true)
    assert.equal(existsSync(join(root, 'docs/contracts/PHOTO_WORKSPACE_CONTRACT.md')), true)
    assert.equal(existsSync(join(root, 'docs/contracts/PENDING_APPROVAL_GAPS.md')), true)
    assert.equal(existsSync(join(root, '.cursor/rules/protected-site-diary-contract.mdc')), true)
    assert.equal(existsSync(join(root, '.cursor/rules/commercial-product-governance.mdc')), true)
    assert.match(contractDoc, /Shift/)
    assert.match(cursorRule, /SITE_DIARY_SCREEN_CONTRACT/)
    assert.match(cursorRule, /test:site-diary-contract/)
    const gov = readFileSync(join(root, '.cursor/rules/commercial-product-governance.mdc'), 'utf8')
    assert.match(gov, /no silent removal/i)
    assert.match(gov, /[Ii]mpact [Aa]ssessment|[Ii]mpact [Rr]eport/)
    assert.match(gov, /PRESERVE/)
    assert.match(gov, /Minimum-diff|minimum-diff/)
  })
})

describe('setup UI — full approved label order (not helper-only)', () => {
  it('critical setup controls appear in contract order in page source', () => {
    const stickySrc = readFileSync(
      join(root, 'components/project/ProjectStickyFields.jsx'),
      'utf8',
    )
    const datesSrc = readFileSync(
      join(root, 'components/project/ProjectDatesFields.jsx'),
      'utf8',
    )
    assert.equal(
      assertSetupUiLabelOrder(stickySrc, [
        'Project Address',
        'Project Manager',
        'Working Days per Week',
        'Current Phase',
      ]).ok,
      true,
    )
    assert.equal(
      assertSetupUiLabelOrder(datesSrc, [
        'Project Start Date',
        'Planned Completion Date',
      ]).ok,
      true,
    )
    assert.equal(
      assertSetupUiLabelOrder(setupPage, [
        'Project Name',
        'Shift',
        'Author Name',
        'Author Role',
        'Reporting On Behalf Of',
        'Report Date',
        'Company / Client Logo',
        'Project Reference',
      ]).ok,
      true,
    )
    assert.doesNotMatch(setupPage, /Which project is this diary for/)
    assert.doesNotMatch(setupPage, /New project — type the name below/)
    assert.match(setupPage, /diary-setup-project-names|list=\{/)
    const stickyMount = setupPage.indexOf('<ProjectStickyFields')
    const datesMount = setupPage.indexOf('<ProjectDatesFields')
    const shift = setupPage.indexOf('aria-label="Shift"')
    const author = setupPage.indexOf('Author Name')
    assert.ok(stickyMount > 0 && datesMount > stickyMount && shift > datesMount && author > shift)
    assert.deepEqual(SETUP_UI_LABEL_SEQUENCE[0], 'Project Name')
    assert.ok(SETUP_UI_LABEL_SEQUENCE.indexOf('Shift') < SETUP_UI_LABEL_SEQUENCE.indexOf('Author Name'))
    assert.equal(
      SETUP_UI_LABEL_SEQUENCE.indexOf('Author Role'),
      SETUP_UI_LABEL_SEQUENCE.indexOf('Author Name') + 1,
    )
  })

  it('Author Role is directly beneath Author Name with no intervening setup label', () => {
    const author = setupPage.indexOf('Author Name')
    const role = setupPage.indexOf('Author Role')
    assert.ok(author > 0 && role > author)
    const between = setupPage.slice(author, role)
    assert.doesNotMatch(between, /Reporting On Behalf Of|Report Date|Project Reference|Shift/)
  })
})

describe('1–2. Shift selector on setup UI (labels + order)', () => {
  it('Shift selector exists with Day, Back and Night in the setup page source', () => {
    assert.deepEqual(SITE_DIARY_SHIFT_OPTIONS, ['Day', 'Back', 'Night'])
    assert.equal(setupSourceHasProtectedShiftUi(setupPage), true)
    assert.match(setupPage, /aria-label="Shift"/)
    assert.match(setupPage, /<option value="Day">Day<\/option>/)
    assert.match(setupPage, /<option value="Back">Back<\/option>/)
    assert.match(setupPage, /<option value="Night">Night<\/option>/)
    const shiftIdx = setupPage.indexOf('aria-label="Shift"')
    const selectBefore = setupPage.lastIndexOf('<select', shiftIdx)
    assert.ok(selectBefore > 0 && selectBefore < shiftIdx)
  })

  it('Shift appears after programme dates and before Author Name / Author Role', () => {
    assert.deepEqual(SETUP_FIELD_SEQUENCE, [
      'projectInformation',
      'shift',
      'authorName',
      'authorRole',
    ])
    const dates = setupPage.indexOf('ProjectDatesFields')
    const shift = setupPage.indexOf('aria-label="Shift"')
    const author = setupPage.indexOf('Author Name')
    const role = setupPage.indexOf('Author Role')
    assert.ok(dates > 0 && shift > dates && author > shift && role > author)
  })
})

describe('3–4. Author Name and Author Role on setup UI', () => {
  it('Author Name exists on setup', () => {
    assert.match(setupPage, /Author Name/)
  })

  it('Author Role exists directly after Author Name', () => {
    const author = setupPage.indexOf('Author Name')
    const role = setupPage.indexOf('Author Role')
    const behalf = setupPage.indexOf('Reporting On Behalf Of')
    assert.ok(author > 0 && role > author && behalf > role)
    const between = setupPage.slice(author, role)
    assert.doesNotMatch(between, /Reporting On Behalf Of/)
  })
})

describe('5. Summary is optional', () => {
  it('setup continue does not require Summary', () => {
    const ok = validateDiarySetupContinue({
      projectName: 'Site',
      author: 'Alex',
      reportingOnBehalfOf: 'Acme',
      reportDate: '2026-08-07',
    })
    assert.equal(ok.ok, true)
  })

  it('diary form does not mark Summary as HTML-required', () => {
    assert.match(diaryPage, /<label[^>]*>Summary<\/label>|<label style=\{labelStyle\}>Summary<\/label>/)
    assert.doesNotMatch(diaryPage, /Summary \*/)
    const summaryBlock = diaryPage.slice(
      diaryPage.indexOf('Site summary'),
      diaryPage.indexOf('Labour'),
    )
    assert.doesNotMatch(summaryBlock, /\srequired\s*\/>/)
    assert.doesNotMatch(summaryBlock, /required\n/)
    assert.doesNotMatch(diaryPage, /Add a short site summary, then tap Save/)
  })
})

describe('6–8. Scratch / existing project / New project', () => {
  it('Start from scratch clears prior project and diary state', () => {
    const scratch = initialiseNewDiarySetupState({
      authorName: 'Signed In',
      reportDate: '2026-08-07',
    })
    assert.equal(
      isCleanScratchSetupState(scratch, {
        authorName: 'Signed In',
        reportDate: '2026-08-07',
      }),
      true,
    )
    assert.equal(scratch.selectedProjectId, NEW_PROJECT_SENTINEL)
    assert.match(hubPage, /clearSetupFormDraft/)
    assert.match(setupPage, /initialiseNewDiarySetupState/)
    const dash = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
    assert.match(dash, /\/dashboard\/diary\/setup/)
  })

  it('Start from scratch prefills Author Name from signed-in profile only', () => {
    assert.match(setupPage, /scratchSetupAuthorFromProfile\(/)
    assert.match(setupPage, /authorName:\s*profileName/)
    assert.match(setupPage, /setAuthor\(fresh\.author\)/)
    assert.doesNotMatch(setupPage, /latest\?\.creator_name/)
    const loadStart = setupPage.indexOf('const load = async')
    const loadEnd = setupPage.indexOf('// Intentionally load once')
    const loadBlock = setupPage.slice(loadStart, loadEnd)
    assert.doesNotMatch(loadBlock, /readSetupFormDraft/)
  })

  it('Existing project selection loads sticky project fields', () => {
    const blank = initialiseNewDiarySetupState({ authorName: 'Alex', reportDate: '2026-08-07' })
    const merged = mergeProjectIntoSetupState(blank, {
      id: 'p1',
      name: 'North',
      site_address: '1 Road',
      client_pm: 'Pat',
      working_days_per_week: 5,
      current_phase: 'Fit-out',
      start_date: '2026-01-01',
      planned_completion_date: '2026-12-01',
    })
    assert.equal(merged.projectName, 'North')
    assert.equal(merged.projectAddress, '1 Road')
    assert.equal(merged.projectManager, 'Pat')
    assert.equal(merged.currentPhase, 'Fit-out')
    assert.equal(merged.projectStartDate, '2026-01-01')
  })

  it('Switching to New Project clears sticky project fields', () => {
    const merged = mergeProjectIntoSetupState(
      initialiseNewDiarySetupState({ authorName: 'Alex', reportDate: '2026-08-07' }),
      {
        id: 'p1',
        name: 'North',
        site_address: '1 Road',
        client_pm: 'Pat',
        working_days_per_week: 5,
        current_phase: 'Fit-out',
        start_date: '2026-01-01',
        planned_completion_date: '2026-12-01',
      },
    )
    const cleared = clearToNewProjectSelection(merged)
    assert.equal(cleared.selectedProjectId, NEW_PROJECT_SENTINEL)
    assert.equal(cleared.projectName, '')
    assert.equal(cleared.projectAddress, '')
    assert.equal(cleared.projectManager, '')
    assert.equal(cleared.currentPhase, '')
    assert.match(setupPage, /clearToNewProjectSelection/)
  })
})

describe('9–11. View / Edit / Use as Basis', () => {
  it('Saved diary opens in View mode', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'r1', editQuery: null, isDraft: false }),
      'view',
    )
    assert.equal(diaryViewHref('p1', 'r1'), '/dashboard/project/p1/diary?report=r1')
  })

  it('Edit preserves the same diary ID', () => {
    assert.equal(
      resolveDiaryInteractionMode({ reportId: 'r1', editQuery: '1', isDraft: false }),
      'edit',
    )
    assert.equal(diaryEditHref('p1', 'r1'), '/dashboard/project/p1/diary?report=r1&edit=1')
    assert.equal(saveKeepsSameDiaryId('r1', 'r1'), true)
    assert.match(diaryPage, /Edit This Diary/)
  })

  it('Use as Basis creates a different diary ID', () => {
    assert.equal(basisCreatesNewDiaryId('r-old', 'r-new'), true)
    assert.match(diaryPage, /Use as Basis for New Diary/)
    assert.match(diaryPage, /templateReportId/)
  })
})

describe('12–13. Project link and Project Day', () => {
  it('Project name remains linked on saved diaries', () => {
    const linked = linkedProjectForSavedDiary({
      reportProjectId: 'p1',
      routeProjectId: 'p1',
      projectName: 'North Site',
    })
    assert.equal(linked.linked, true)
    assert.equal(linked.projectName, 'North Site')
    assert.match(diaryPage, /linkedProjectForSavedDiary|projectName/)
  })

  it('Project dates and Project Day remain visible on diary page', () => {
    assert.match(diaryPage, /Project Day/)
    assert.match(diaryPage, /projectDayLine|projectProgrammeCard/)
    const day = computeProjectDay({
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-01-10',
      asOfDate: '2026-01-05',
    })
    assert.ok(day.headline && /Day/i.test(String(day.headline)))
  })
})

describe('14–17. Branding, plant isolation, Recent list, open write', () => {
  it('Branding is not forced during normal Edit mode', () => {
    assert.equal(shouldShowBrandingSelector({ hasReportId: true, allowChangeBranding: false }), false)
    assert.match(diaryPage, /shouldShowBrandingSelector/)
  })

  it('Plant/equipment data does not leak between diary IDs', () => {
    let k = 0
    const makeKey = () => `k${++k}`
    const plantA = hydratePlantFormRows([{ item: 'Excavator', ref: '1' }], makeKey)
    const plantB = emptyPlantFormRows(makeKey)
    assert.equal(plantA[0].plant_type, 'Excavator')
    assert.equal(plantB[0].plant_type, '')
    assert.notEqual(plantA[0].key, plantB[0].key)
  })

  it('Saving an edited diary does not render the Recent Diaries list on the report page', () => {
    assert.equal(shouldShowRecentDiariesOnReportPage({ hasOpenReport: true }), false)
    assert.equal(shouldShowRecentDiariesOnReportPage({ hasOpenReport: false }), true)
    assert.equal(
      postSaveDiaryHref('p1', 'r1'),
      '/dashboard/project/p1/diary?report=r1',
    )
    assert.match(diaryPage, /shouldShowRecentDiariesOnReportPage/)
  })

  it('Opening a saved diary does not write to the database', () => {
    assert.match(diaryPage, /resolveDiaryInteractionMode/)
    // View bootstrap must not call finalizeSiteDiarySave / insert draft for ?report=
    const openBlockHints = [
      /finalizeSiteDiarySave/,
      /createTodaysDiaryDraft/,
    ]
    // Opening path uses existing load; template create is gated on templateReportId not report=
    assert.match(diaryPage, /templateReportId/)
    assert.doesNotMatch(
      diaryPage.slice(
        diaryPage.indexOf('editingReportId'),
        diaryPage.indexOf('editingReportId') + 800,
      ),
      /finalizeSiteDiarySave\(/,
    )
    void openBlockHints
  })
})

describe('Shift hydrate / defaults', () => {
  it('defaults to Day; preserves saved Night/Back; keeps legacy in select options', () => {
    assert.equal(hydrateShift(null), DEFAULT_SITE_DIARY_SHIFT)
    assert.equal(hydrateShift('Night'), 'Night')
    assert.equal(hydrateShift('Back'), 'Back')
    assert.deepEqual(shiftSelectOptions('Weekend'), ['Day', 'Back', 'Night', 'Weekend'])
  })

  it('setup wires shift into continue form and draft create/update', () => {
    assert.match(setupPage, /shift,/)
    assert.match(setupPage, /<option value="Day">Day<\/option>/)
    assert.match(setupPage, /hydrateShift/)
    const continueSrc = readFileSync(join(root, 'lib/diary-setup-continue.js'), 'utf8')
    assert.match(continueSrc, /shift: form\.shift/)
    const draftSrc = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')
    assert.match(draftSrc, /shift: setup\.shift/)
    assert.match(draftSrc, /patch\.shift/)
  })

  it('diary form SHIFT_OPTIONS are Day / Back / Night', () => {
    assert.match(diaryPage, /const SHIFT_OPTIONS = \['Day', 'Back', 'Night'\]/)
  })
})

describe('Back label on setup', () => {
  it('setup renders a visible Back control', () => {
    assert.match(setupPage, />\s*Back\s*</)
    assert.match(setupPage, /handleBack|onBack/)
  })
})
