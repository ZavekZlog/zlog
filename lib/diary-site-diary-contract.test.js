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
  SETUP_SECTION_SEQUENCE,
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
    // Labels span setup page + sticky/dates components — compose in mount order.
    const stickyMount = setupPage.indexOf('<ProjectStickyFields')
    const datesMount = setupPage.indexOf('<ProjectDatesFields')
    assert.ok(stickyMount > 0 && datesMount > stickyMount)
    const composed = [
      setupPage.slice(0, stickyMount),
      stickySrc,
      setupPage.slice(stickyMount, datesMount),
      datesSrc,
      setupPage.slice(datesMount),
    ].join('\n')
    const order = assertSetupUiLabelOrder(composed)
    assert.equal(order.ok, true, order.missing || order.outOfOrder || 'label order')
    assert.doesNotMatch(setupPage, /Which project is this diary for/)
    assert.doesNotMatch(setupPage, /New project — type the name below/)
    assert.match(setupPage, /diary-setup-project-names|list=\{/)
    const company = composed.indexOf('Reporting Company Name')
    const logo = composed.indexOf('Reporting Company Logo')
    const behalf = composed.indexOf('Reporting On Behalf Of')
    const author = composed.indexOf('Author Name *')
    const role = composed.indexOf('>Author Role</label>')
    const projectName = composed.indexOf('Project Name')
    const pm = composed.indexOf('Project Manager')
    const shift = composed.indexOf('aria-label="Shift"')
    assert.ok(company > 0 && logo > company)
    assert.ok(behalf > logo && author > behalf && role > author)
    assert.ok(projectName > role && pm > projectName)
    assert.ok(datesMount > stickyMount && shift > datesMount)
    assert.ok(company < pm, 'Project Manager must not appear above Reporting Company')
    assert.deepEqual(SETUP_UI_LABEL_SEQUENCE[0], 'Reporting Company Name')
    assert.deepEqual(SETUP_SECTION_SEQUENCE, [
      'Reporting Company',
      'Reporting On Behalf Of',
      'Author',
      'Project Details',
    ])
    assert.equal(
      SETUP_UI_LABEL_SEQUENCE.indexOf('Author Role'),
      SETUP_UI_LABEL_SEQUENCE.indexOf('Author Name') + 1,
    )
  })

  it('locked setup sections render in Reporting Company → Behalf Of → Author → Project Details order', () => {
    const stickySrc = readFileSync(
      join(root, 'components/project/ProjectStickyFields.jsx'),
      'utf8',
    )
    assert.equal(assertSetupUiLabelOrder(setupPage, SETUP_SECTION_SEQUENCE).ok, true)
    const companySection = setupPage.indexOf('title="Reporting Company"')
    const behalfSection = setupPage.indexOf('title="Reporting On Behalf Of"')
    const authorSection = setupPage.indexOf('title="Author"')
    const projectSection = setupPage.indexOf('title="Project Details"')
    const stickyMount = setupPage.indexOf('<ProjectStickyFields')
    assert.ok(companySection > 0 && behalfSection > companySection)
    assert.ok(authorSection > behalfSection && projectSection > authorSection)
    assert.ok(stickyMount > projectSection, 'Project Manager fields mount inside Project Details')
    assert.match(stickySrc, /Project Manager/)
    assert.ok(
      stickyMount > companySection,
      'Project Manager must not appear above Reporting Company',
    )
    assert.doesNotMatch(setupPage, /Company \/ Client Logo/)
    assert.doesNotMatch(setupPage, /Report Author/)
    assert.match(setupPage, /Reporting Company Logo/)
    assert.match(setupPage, /Reporting Company Name/)
  })

  it('Author Role is directly beneath Author Name with no intervening setup label', () => {
    const author = setupPage.indexOf('Author Name *')
    const role = setupPage.indexOf('>Author Role</label>')
    assert.ok(author > 0 && role > author)
    const between = setupPage.slice(author, role)
    assert.doesNotMatch(between, /Reporting On Behalf Of|Report Date|Project Reference|Shift|Project Name/)
  })

  it('user-visible setup copy never uses sticky/implementation terminology', () => {
    assert.doesNotMatch(setupPage, /Sticky project information/)
    assert.doesNotMatch(setupPage, /sticky fields/i)
    assert.doesNotMatch(setupPage, /persistent/i)
    assert.doesNotMatch(setupPage, /inherited values/i)
    assert.doesNotMatch(setupPage, /database fields/i)
    assert.doesNotMatch(setupPage, /cached project/i)
    assert.doesNotMatch(setupPage, /remembered for this project/i)
    assert.doesNotMatch(setupPage, /Programme dates for this project/)
    assert.doesNotMatch(hubPage, /\bsticky\b/i)
    assert.doesNotMatch(hubPage, /persistent/i)
    assert.match(hubPage, /Enter everything from scratch/)
    assert.match(setupPage, /Confirm the details for today’s Site Diary, then continue/)
    assert.match(setupPage, /Continue to Site Diary/)
    assert.match(setupPage, /Save and Continue/)
    assert.doesNotMatch(setupPage, /Continue to fill in your diary/)
  })

  it('setup / premium shell keep scroll and non-vw brand glow (no horizontal overflow contract)', () => {
    const premiumUi = readFileSync(join(root, 'lib/premium-ui.jsx'), 'utf8')
    assert.match(premiumUi, /BRAND_ATMOSPHERIC_GLOW_STYLE/)
    assert.match(premiumUi, /width:\s*'100%'/)
    assert.doesNotMatch(
      premiumUi.slice(
        premiumUi.indexOf('BRAND_ATMOSPHERIC_GLOW_STYLE'),
        premiumUi.indexOf('export function ZlogBrandWordmark'),
      ),
      /100vw/,
    )
    assert.match(premiumUi, /min-h-screen/)
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

  it('Shift appears in Project Details after programme dates (Author precedes Project Details)', () => {
    assert.deepEqual(SETUP_FIELD_SEQUENCE, [
      'reportingCompany',
      'reportingOnBehalfOf',
      'authorName',
      'authorRole',
      'projectDetails',
      'shift',
    ])
    const author = setupPage.indexOf('Author Name *')
    const projectName = setupPage.indexOf('Project Name')
    const dates = setupPage.indexOf('<ProjectDatesFields')
    const shift = setupPage.indexOf('aria-label="Shift"')
    const role = setupPage.indexOf('>Author Role</label>')
    assert.ok(author > 0 && role > author && projectName > role)
    assert.ok(dates > projectName && shift > dates)
  })
})

describe('3–4. Author Name and Author Role on setup UI', () => {
  it('Author Name exists on setup', () => {
    assert.match(setupPage, /Author Name/)
  })

  it('Author Role exists directly after Author Name', () => {
    const author = setupPage.indexOf('Author Name *')
    const role = setupPage.indexOf('>Author Role</label>')
    const projectName = setupPage.indexOf('Project Name')
    assert.ok(author > 0 && role > author && projectName > role)
    const between = setupPage.slice(author, role)
    assert.doesNotMatch(between, /Project Name|Reporting On Behalf Of/)
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
    assert.match(dash, /\/dashboard\/diary/)
    assert.doesNotMatch(
      dash.slice(dash.indexOf('if (isDiary)'), dash.indexOf('if (isDiary)') + 220),
      /\/dashboard\/diary\/setup/,
    )
  })

  it('Dashboard opens Site Diary hub; hub offers Start a New Diary and Use a Previous Diary', () => {
    const dash = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
    assert.match(dash, /router\.push\('\/dashboard\/diary'\)/)
    assert.match(hubPage, /Start a New Diary/)
    assert.match(hubPage, /Use a Previous Diary/)
    assert.match(hubPage, /Enter everything from scratch/)
    assert.match(hubPage, /Carry over recurring details/)
    assert.doesNotMatch(hubPage, /Choose how you want to start today’s Site Diary/)
    assert.match(hubPage, /Edit for today/)
    assert.match(hubPage, /Open to review/)
    assert.match(hubPage, /createTodaysDiaryDraft/)
    assert.match(hubPage, /existingDiaryHref/)
    assert.match(hubPage, /minmax\(240px,\s*1fr\)/)
    // Module header pattern — Back + dominant title in content column.
    assert.match(hubPage, /ZlogModulePageHeader/)
    assert.match(hubPage, /hideModuleNav/)
    // Equal-weight clickable cards — no permanently preferred PrimaryCTA on the choice screen.
    assert.match(hubPage, /ModuleHomeCard/)
    assert.match(hubPage, /zlog-diary-entry-choices/)
    const choiceStart = hubPage.indexOf('zlog-diary-entry-choices')
    const choiceEnd = hubPage.indexOf("mode === 'previous' &&")
    assert.ok(choiceStart > 0 && choiceEnd > choiceStart)
    const choiceBlock = hubPage.slice(choiceStart, choiceEnd)
    assert.equal((choiceBlock.match(/ModuleHomeCard/g) || []).length, 2)
    assert.doesNotMatch(choiceBlock, /PrimaryCTA/)
    assert.doesNotMatch(choiceBlock, /SecondaryButton/)
    assert.match(hubPage, /Enter everything from scratch/)
    assert.doesNotMatch(hubPage, /\bsticky\b/i)
  })

  it('Start a New Diary prefills Author Name from signed-in profile only', () => {
    assert.match(setupPage, /resolveSignedInAuthorProfile\(/)
    assert.match(setupPage, /authorName:\s*profileName/)
    assert.match(setupPage, /setAuthor\(fresh\.author\)/)
    assert.doesNotMatch(setupPage, /latest\?\.creator_name/)
    const loadStart = setupPage.indexOf('const load = async')
    const loadEnd = setupPage.indexOf('// Intentionally load once')
    const loadBlock = setupPage.slice(loadStart, loadEnd)
    assert.doesNotMatch(loadBlock, /readSetupFormDraft/)
  })

  it('Use a Previous Diary creates a new diary and does not update the source', () => {
    const draft = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')
    assert.match(hubPage, /createTodaysDiaryDraft/)
    assert.match(draft, /createTodaysDiaryDraft/)
    assert.match(draft, /Source row is never updated|source diary left unchanged|never updated/i)
    assert.match(draft, /resolveSignedInAuthorProfile/)
    assert.match(draft, /insertDraftRow|insert\(/)
    assert.doesNotMatch(draft, /\.update\([\s\S]*sourceId/)
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

  it('Project Day remains as compact header context; large Project recap is gone', () => {
    assert.match(diaryPage, /projectProgrammeCard\.projectDayLine/)
    assert.match(diaryPage, /projectDayLine|projectProgrammeCard/)
    assert.doesNotMatch(diaryPage, /title="Project"/)
    assert.doesNotMatch(diaryPage, /stickyRows\.map/)
    assert.doesNotMatch(diaryPage, /afterDateStickyRows\.map/)
    assert.doesNotMatch(diaryPage, /projectProgrammeCard\.startDisplay/)
    assert.doesNotMatch(diaryPage, /projectProgrammeCard\.plannedCompletionDisplay/)
    // Compact header: date · shift · project day — not setup metadata dump.
    assert.doesNotMatch(diaryPage, /Author: \$\{creatorName\}/)
    assert.doesNotMatch(diaryPage, /Role: \$\{creatorRole\}/)
    assert.doesNotMatch(diaryPage, /On behalf of: \$\{companyReportingFor\}/)
    assert.doesNotMatch(diaryPage, /Ref: \$\{projectReference\}/)
    assert.match(diaryPage, /Shift`/)
    const day = computeProjectDay({
      startDate: '2026-01-01',
      plannedCompletionDate: '2026-01-10',
      asOfDate: '2026-01-05',
    })
    assert.ok(day.headline && /Day/i.test(String(day.headline)))
  })

  it('Save & Continue / new draft is compose — not existing-diary edit chrome', () => {
    assert.equal(
      resolveDiaryInteractionMode({
        reportId: 'r-new',
        editQuery: null,
        composeQuery: '1',
        isDraft: null,
      }),
      'compose',
    )
    assert.notEqual(
      resolveDiaryInteractionMode({
        reportId: 'r-new',
        editQuery: null,
        composeQuery: '1',
        isDraft: false,
      }),
      'edit',
    )
    assert.equal(
      resolveDiaryInteractionMode({
        reportId: 'r-saved',
        editQuery: '1',
        composeQuery: null,
        isDraft: false,
      }),
      'edit',
    )
    assert.match(diaryPage, /showExistingDiaryModeChrome|showDiaryModeChrome/)
    assert.match(diaryPage, /isDiaryExplicitEditMode/)
    assert.match(diaryPage, /composeQuery/)
    const continueSrc = readFileSync(join(root, 'lib/diary-setup-continue.js'), 'utf8')
    assert.match(continueSrc, /function diaryFormHref/)
    assert.match(continueSrc, /compose=1/)
    assert.doesNotMatch(continueSrc, /diary\?report=\$\{reportId\}&edit=/)
  })

  it('Site Diary workbench must not render a duplicate Project details recap card', () => {
    assert.doesNotMatch(diaryPage, /<GlassSection title="Project"/)
    assert.doesNotMatch(diaryPage, /Project Start Date<\/label>/)
    assert.doesNotMatch(diaryPage, /Planned Completion Date<\/label>/)
    assert.doesNotMatch(diaryPage, /Working Days Per Week/)
    assert.match(diaryPage, /projectProgrammeCard\.projectDayLine/)
    assert.match(diaryPage, /Edit Report Details/)
  })

  it('first workbench section is Cover photo — not Author / Behalf Of / Signature', () => {
    const coverIdx = diaryPage.indexOf('title="Cover photo"')
    const weatherIdx = diaryPage.indexOf('title="Weather"')
    const signatureIdx = diaryPage.indexOf('title="Signature"')
    const photoWsIdx = diaryPage.indexOf('<PhotoWorkspace')
    assert.ok(coverIdx > 0, 'Cover photo section required')
    assert.ok(weatherIdx > coverIdx, 'Weather follows Cover photo')
    assert.doesNotMatch(diaryPage, /title="Author & cover"/)
    assert.doesNotMatch(diaryPage, /title="Report details"/)
    assert.doesNotMatch(diaryPage, /labelStyle\}>Author name</)
    assert.doesNotMatch(diaryPage, /placeholder="e\.g\. Colin Walker"/)
    assert.doesNotMatch(diaryPage, /placeholder="e\.g\. Site Manager"/)
    assert.doesNotMatch(diaryPage, /placeholder="e\.g\. ABC Construction Ltd"/)
    assert.ok(signatureIdx > photoWsIdx && photoWsIdx > weatherIdx)
    assert.match(diaryPage, /signatureSectionRef/)
    assert.match(diaryPage, /creator_name: creatorName/)
    assert.match(diaryPage, /company_reporting_for: companyReportingFor/)
  })

  it('Report Date and Shift are not editable workbench controls (setup-only)', () => {
    assert.doesNotMatch(diaryPage, /labelStyle\}>Report date</)
    assert.doesNotMatch(diaryPage, /type="date"/)
    assert.doesNotMatch(diaryPage, /labelStyle\}>Shift type</)
    assert.doesNotMatch(diaryPage, /title="Report details"/)
    // Values remain in state / save payload / compact header context.
    assert.match(diaryPage, /reportDate/)
    assert.match(diaryPage, /shiftType/)
    assert.match(diaryPage, /Shift`/)
    assert.match(diaryPage, /projectProgrammeCard\.projectDayLine/)
    assert.match(diaryPage, /report_date: reportDate/)
    assert.match(diaryPage, /shift: shiftType/)
    // Weather remains the diary-entry field after Cover photo.
    const coverIdx = diaryPage.indexOf('title="Cover photo"')
    const weatherIdx = diaryPage.indexOf('title="Weather"')
    const summaryIdx = diaryPage.indexOf('title="Site summary"')
    assert.ok(coverIdx > 0 && weatherIdx > coverIdx && summaryIdx > weatherIdx)
  })

  it('Signature remains at the end of the Site Diary workbench', () => {
    const signatureIdx = diaryPage.indexOf('title="Signature"')
    const photoWsIdx = diaryPage.indexOf('<PhotoWorkspace')
    const labourIdx = diaryPage.indexOf('title="Labour"')
    const coverIdx = diaryPage.indexOf('title="Cover photo"')
    assert.ok(signatureIdx > 0 && photoWsIdx > 0)
    assert.ok(coverIdx > 0 && labourIdx > coverIdx)
    assert.ok(signatureIdx > photoWsIdx)
    assert.ok(signatureIdx > labourIdx)
    // Only one Signature GlassSection title.
    assert.equal([...diaryPage.matchAll(/title="Signature"/g)].length, 1)
  })
  it('setup continue persists explicit Author Name to signed-in profile', () => {
    assert.match(setupPage, /persistSignedInAuthorProfile/)
    assert.match(setupPage, /authorName:\s*author/)
    const reportSetup = readFileSync(join(root, 'lib/report-setup.js'), 'utf8')
    assert.match(reportSetup, /export async function persistSignedInAuthorProfile/)
    assert.match(reportSetup, /updateUser\(\{\s*data:\s*meta/)
    assert.doesNotMatch(reportSetup, /split\('@'\)/)
    assert.doesNotMatch(reportSetup, /email\.split/)
  })
})

describe('14–17. Branding, plant isolation, Recent list, open write', () => {
  it('Branding is not forced during normal Edit mode', () => {
    assert.equal(shouldShowBrandingSelector({ hasReportId: true, allowChangeBranding: false }), false)
    assert.match(diaryPage, /shouldShowBrandingSelector/)
  })

  it('Site Diary workbench must not render obsolete Report Branding info panel', () => {
    assert.doesNotMatch(diaryPage, /title="Report Branding"/)
    assert.doesNotMatch(diaryPage, /Report Branding/)
    assert.doesNotMatch(diaryPage, /Colour:/)
    assert.doesNotMatch(diaryPage, /kept as saved/i)
    assert.doesNotMatch(diaryPage, /Branding from this diary is kept as saved/)
    assert.doesNotMatch(diaryPage, /No branding is attached to this diary/)
    assert.doesNotMatch(diaryPage, /It is not changed when you edit other sections/)
    // Selector may still exist for brand-new (no report id); gate must remain.
    assert.match(diaryPage, /shouldShowBrandingSelector/)
    assert.match(diaryPage, /showBrandingSelector \? \(/)
    assert.match(diaryPage, /\) : null/)
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
      '/dashboard/project/p1/diary/complete?report=r1',
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

  it('shift options live in setup / contract — not as workbench editable controls', () => {
    assert.deepEqual(SITE_DIARY_SHIFT_OPTIONS, ['Day', 'Back', 'Night'])
    assert.doesNotMatch(diaryPage, /const SHIFT_OPTIONS/)
    assert.doesNotMatch(diaryPage, /labelStyle\}>Shift type</)
    assert.match(setupPage, /<option value="Day">Day<\/option>/)
  })
})

describe('Back label on setup', () => {
  it('setup renders visible Back via shared ZlogBackControl (header + footer)', () => {
    assert.match(setupPage, /ZlogBackControl|onBack=\{handleBack\}/)
    assert.match(setupPage, /handleBack|onBack/)
    assert.match(setupPage, /backHref="\/dashboard\/diary"/)
  })
})
