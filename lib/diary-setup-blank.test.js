import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  blankDiarySetupFormState,
  blankSetupCreatesDatabaseRecords,
  brandingDefaultsFromCompanyProfile,
  clearToNewProjectSelection,
  initialiseNewDiarySetupState,
  isCleanScratchSetupState,
  shouldRestoreSetupFormDraft,
} from './diary-setup-blank.js'
import { NEW_PROJECT_SENTINEL, mergeProjectIntoSetupState } from './diary-setup-project-dates.js'
import { authorNameFromUser, authorRoleFromUser, scratchSetupAuthorFromProfile, scratchSetupAuthorRoleFromProfile, todayIsoDate } from './report-setup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const hubPage = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

const PRIOR = {
  selectedProjectId: 'proj-old',
  projectName: 'Old Site Alpha',
  projectAddress: '99 Legacy Road',
  projectManager: 'Old Manager',
  workingDaysPerWeek: '6',
  currentPhase: 'Snagging',
  projectStartDate: '2025-01-01',
  projectPlannedCompletionDate: '2025-12-31',
  author: 'Prior Author',
  authorRole: 'Site Manager',
  reportingOnBehalfOf: 'Prior Co',
  reportDate: '2025-06-01',
  projectReference: 'REF-OLD',
  brandingId: 'brand-from-old-diary',
  brandColor: '#111111',
  logoStoragePath: 'logos/old.png',
  plant: [{ plant_type: 'Excavator' }],
  siteSummary: 'Old summary',
}

const EXISTING_PROJECT = {
  id: 'proj-sticky',
  name: 'Sticky Site',
  site_address: '12 Sticky Lane',
  client_pm: 'Sticky PM',
  working_days_per_week: 5,
  current_phase: 'Structure',
  start_date: '2026-02-01',
  planned_completion_date: '2026-10-01',
}

describe('New Site Diary from scratch — clean initial state', () => {
  it('1–2. after prior diary A values, scratch init is a blank setup', () => {
    const afterPrior = { ...PRIOR }
    const scratch = initialiseNewDiarySetupState({
      authorName: 'Signed In User',
      reportDate: '2026-07-31',
      companyProfile: { id: 'co-1', brand_color: '#0a0', logo_url: 'logos/co.png' },
    })
    assert.notEqual(scratch.projectName, afterPrior.projectName)
    assert.equal(isCleanScratchSetupState(scratch, {
      authorName: 'Signed In User',
      reportDate: '2026-07-31',
    }), true)
  })

  it('3. Author Name is the only inherited person field', () => {
    const scratch = blankDiarySetupFormState({ authorName: 'Signed In User', reportDate: '2026-07-31' })
    assert.equal(scratch.author, 'Signed In User')
    assert.equal(scratch.authorRole, '')
    assert.equal(scratch.reportingOnBehalfOf, '')
    assert.equal(scratch.projectManager, '')
  })

  it('4. Author Role is blank', () => {
    const scratch = initialiseNewDiarySetupState({ authorName: 'Alex' })
    assert.equal(scratch.authorRole, '')
  })

  it('5. Report Date defaults to today', () => {
    const scratch = blankDiarySetupFormState({ authorName: 'Alex' })
    assert.equal(scratch.reportDate, todayIsoDate())
  })

  it('6. no project_id is present (New project sentinel only)', () => {
    const scratch = initialiseNewDiarySetupState({ authorName: 'Alex' })
    assert.equal(scratch.selectedProjectId, NEW_PROJECT_SENTINEL)
    assert.notEqual(scratch.selectedProjectId, 'proj-old')
  })

  it('7. no old project name/address/manager/phase/dates remain', () => {
    const scratch = initialiseNewDiarySetupState({
      authorName: 'Alex',
      reportDate: '2026-07-31',
    })
    assert.equal(scratch.projectName, '')
    assert.equal(scratch.projectAddress, '')
    assert.equal(scratch.projectManager, '')
    assert.equal(scratch.currentPhase, '')
    assert.equal(scratch.workingDaysPerWeek, '')
    assert.equal(scratch.projectStartDate, '')
    assert.equal(scratch.projectPlannedCompletionDate, '')
  })

  it('8. no plant/equipment or other diary content remains', () => {
    const scratch = blankDiarySetupFormState({ authorName: 'Alex' })
    assert.equal(scratch.plant, undefined)
    assert.equal(scratch.siteSummary, undefined)
    assert.equal(scratch.permits, undefined)
    assert.equal(isCleanScratchSetupState({ ...PRIOR, ...scratch }), false)
    assert.equal(isCleanScratchSetupState(scratch, { authorName: 'Alex' }), true)
  })

  it('9. selecting an existing project loads that project’s sticky fields', () => {
    const blank = initialiseNewDiarySetupState({ authorName: 'Alex', reportDate: '2026-07-31' })
    const merged = mergeProjectIntoSetupState(blank, EXISTING_PROJECT)
    assert.equal(merged.selectedProjectId, 'proj-sticky')
    assert.equal(merged.projectName, 'Sticky Site')
    assert.equal(merged.projectAddress, '12 Sticky Lane')
    // New diary must not inherit prior/project PM via merge — leave editable blank.
    assert.equal(merged.projectManager, '')
    assert.equal(merged.workingDaysPerWeek, '5')
    assert.equal(merged.currentPhase, 'Structure')
    assert.equal(merged.projectStartDate, '2026-02-01')
    assert.equal(merged.projectPlannedCompletionDate, '2026-10-01')
    assert.equal(merged.author, 'Alex')
  })

  it('10. switching back to New project clears them again', () => {
    const blank = initialiseNewDiarySetupState({ authorName: 'Alex', reportDate: '2026-07-31' })
    const merged = mergeProjectIntoSetupState(blank, EXISTING_PROJECT)
    const cleared = clearToNewProjectSelection({
      ...merged,
      projectReference: 'REF-FROM-LATEST',
      reportingOnBehalfOf: 'From Latest Diary Co',
      authorRole: 'Foreman',
    })
    assert.equal(cleared.selectedProjectId, NEW_PROJECT_SENTINEL)
    assert.equal(cleared.projectName, '')
    assert.equal(cleared.projectAddress, '')
    assert.equal(cleared.projectManager, '')
    assert.equal(cleared.workingDaysPerWeek, '')
    assert.equal(cleared.currentPhase, '')
    assert.equal(cleared.projectStartDate, '')
    assert.equal(cleared.projectPlannedCompletionDate, '')
    assert.equal(cleared.projectReference, '')
    assert.equal(cleared.reportingOnBehalfOf, '')
    // Author Role is profile/report-level — kept when clearing project selection
    assert.equal(cleared.authorRole, 'Foreman')
    assert.equal(cleared.author, 'Alex')
    assert.equal(cleared.reportDate, '2026-07-31')
  })

  it('11. Use as Basis remains a distinct template flow (not blank setup)', () => {
    assert.match(diaryPage, /Use as Basis for New Diary/)
    assert.match(diaryPage, /templateReportId/)
    assert.match(diaryPage, /createTodaysDiaryDraft/)
    assert.doesNotMatch(
      initialiseNewDiarySetupState({ authorName: 'Alex' }).projectName,
      /./,
    )
  })

  it('12. editing an existing diary still hydrates via report+project query (not blank factory)', () => {
    assert.match(setupPage, /editingReportId/)
    assert.match(setupPage, /loadEditDiarySetupSources/)
    assert.equal(shouldRestoreSetupFormDraft({ editingReportId: 'rep-1' }), true)
    assert.equal(shouldRestoreSetupFormDraft({ editingReportId: null }), false)
  })

  it('13. opening blank setup does not create diary or project records', () => {
    assert.equal(blankSetupCreatesDatabaseRecords(), false)
    assert.match(setupPage, /initialiseNewDiarySetupState/)
    assert.match(setupPage, /runDiarySetupContinue/)
    const loadStart = setupPage.indexOf('const load = async')
    const loadEnd = setupPage.indexOf('// Intentionally load once')
    assert.ok(loadStart > 0 && loadEnd > loadStart)
    const loadBlock = setupPage.slice(loadStart, loadEnd)
    assert.doesNotMatch(loadBlock, /createDiaryDraftFromSetup\(/)
    assert.doesNotMatch(loadBlock, /persistSetupProject\(/)
    assert.doesNotMatch(loadBlock, /runDiarySetupContinue\(/)
  })
})

describe('scratch setup wiring — no session / prior diary bleed', () => {
  it('hub Start New clears setup form draft before navigate', () => {
    assert.match(hubPage, /clearSetupFormDraft/)
    assert.match(hubPage, /startNewReport/)
  })

  it('dashboard Site Diary opens hub; Start a new diary goes to setup', () => {
    const dash = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
    assert.match(dash, /clearSetupFormDraft|\/dashboard\/diary/)
    assert.match(dash, /router\.push\('\/dashboard\/diary'\)/)
    assert.doesNotMatch(
      dash.slice(dash.indexOf('if (isDiary)'), dash.indexOf('if (isDiary)') + 280),
      /router\.push\('\/dashboard\/diary\/setup'\)/,
    )
    assert.match(hubPage, /Start a New Diary/)
    assert.match(hubPage, /\/dashboard\/diary\/setup/)
  })

  it('setup never restores session draft for brand-new diary', () => {
    assert.match(setupPage, /shouldRestoreSetupFormDraft/)
    assert.match(setupPage, /clearSetupFormDraft/)
    assert.match(setupPage, /blankDiarySetupFormState|initialiseNewDiarySetupState/)
  })

  it('Reporting On Behalf Of is not prefilled from company profile on scratch', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      companyProfile: { id: 'co-1', company_name: 'Acme Construction', brand_color: '#0a0' },
    })
    assert.equal(state.reportingOnBehalfOf, '')
  })

  it('company branding may default from saved profile only', () => {
    const branding = brandingDefaultsFromCompanyProfile({
      id: 'co-1',
      brand_color: '#abcabc',
      logo_url: 'logos/co.png',
    })
    assert.deepEqual(branding, {
      brandingId: 'co-1',
      brandColor: '#abcabc',
      logoStoragePath: 'logos/co.png',
    })
    assert.deepEqual(brandingDefaultsFromCompanyProfile(null), {
      brandingId: null,
      brandColor: null,
      logoStoragePath: null,
    })
  })

  it('hub does not pass a prior diary id into setup', () => {
    assert.doesNotMatch(hubPage, /setup\?report=/)
    assert.match(hubPage, /\/dashboard\/diary\/setup/)
  })

  it('factory module exists for clean init', () => {
    assert.equal(existsSync(join(root, 'lib/diary-setup-blank.js')), true)
  })
})

describe('PROTECTED — scratch Author Name from signed-in profile', () => {
  it('prefills Author Name from profile helper into blank factory (not prior diary)', () => {
    const fromProfile = scratchSetupAuthorFromProfile(
      { user_metadata: { name: 'Meta Name' } },
      { full_name: 'Profile Author' },
    )
    assert.equal(fromProfile, 'Profile Author')
    const scratch = initialiseNewDiarySetupState({ authorName: fromProfile })
    assert.equal(scratch.author, 'Profile Author')
    assert.equal(
      isCleanScratchSetupState(scratch, { authorName: 'Profile Author' }),
      true,
    )
  })

  it('falls back to auth metadata when users.full_name is empty', () => {
    assert.equal(
      scratchSetupAuthorFromProfile({ user_metadata: { full_name: 'Meta Author' } }, null),
      'Meta Author',
    )
    assert.equal(
      authorNameFromUser({ user_metadata: { fullName: 'Camel Author' } }, { full_name: '  ' }),
      'Camel Author',
    )
  })

  it('never uses email local-part, username, or identity aliases as Author Name', () => {
    assert.equal(
      authorNameFromUser(
        { email: 'spaceclampit9@example.com', user_metadata: {}, identities: [{ identity_data: { name: 'spaceclampit9' } }] },
        null,
      ),
      '',
    )
    assert.equal(
      authorNameFromUser(
        { user_metadata: { name: 'not-a-real-author-field', display_name: 'Display' } },
        null,
      ),
      '',
    )
    assert.equal(
      authorNameFromUser(
        { identities: [{ identity_data: { full_name: 'Identity Author' } }] },
        null,
      ),
      '',
    )
    assert.doesNotMatch(
      String(authorNameFromUser({ email: 'sam.taylor@example.com', user_metadata: {} }, null) || ''),
      /sam|taylor/i,
    )
  })

  it('spaceclampit9@example.com never yields Author Name = spaceclampit9 (even if full_name polluted)', () => {
    const user = {
      email: 'spaceclampit9@example.com',
      user_metadata: {
        full_name: 'spaceclampit9',
        name: 'spaceclampit9',
        preferred_username: 'spaceclampit9',
      },
      identities: [{ identity_data: { name: 'spaceclampit9', email: 'spaceclampit9@example.com' } }],
    }
    assert.equal(authorNameFromUser(user, { full_name: 'spaceclampit9' }), '')
    assert.equal(scratchSetupAuthorFromProfile(user, { full_name: 'spaceclampit9' }), '')
    assert.equal(
      authorNameFromUser(
        { ...user, user_metadata: { full_name: 'Colin Walker' } },
        { full_name: 'spaceclampit9' },
      ),
      'Colin Walker',
    )
  })

  it('Author Role prefills from profile job title only (never invents admin)', () => {
    assert.equal(
      authorRoleFromUser({ user_metadata: { role: 'admin' } }, { role: 'admin' }),
      '',
    )
    assert.equal(
      scratchSetupAuthorRoleFromProfile(
        { user_metadata: {} },
        { full_name: 'Alex', job_title: 'Site Manager' },
      ),
      'Site Manager',
    )
  })

  it('never inherits prior diary author into scratch factory', () => {
    const priorDiaryAuthor = 'Prior Diary Creator'
    const profileAuthor = scratchSetupAuthorFromProfile(
      { user_metadata: { full_name: 'Signed In' } },
      null,
    )
    const scratch = initialiseNewDiarySetupState({ authorName: profileAuthor })
    assert.equal(scratch.author, 'Signed In')
    assert.notEqual(scratch.author, priorDiaryAuthor)
    assert.equal(scratch.projectName, '')
    assert.equal(scratch.projectAddress, '')
    assert.equal(scratch.projectManager, '')
  })

  it('setup page wires profile → blank factory → setAuthor (fails if hydration removed)', () => {
    assert.match(setupPage, /resolveSignedInAuthorProfile\(/)
    assert.match(setupPage, /authorName:\s*profileName/)
    assert.match(setupPage, /authorRole:\s*profileRole/)
    assert.match(setupPage, /setAuthor\(fresh\.author\)/)
    assert.match(setupPage, /setAuthorRole\(fresh\.authorRole\)/)
    assert.match(setupPage, /initialiseNewDiarySetupState/)
    const loadStart = setupPage.indexOf('const load = async')
    const loadEnd = setupPage.indexOf('// Intentionally load once')
    assert.ok(loadStart > 0 && loadEnd > loadStart)
    const loadBlock = setupPage.slice(loadStart, loadEnd)
    assert.match(loadBlock, /resolveSignedInAuthorProfile/)
    assert.match(loadBlock, /authorName:\s*profileName/)
    assert.match(loadBlock, /setAuthor\(fresh\.author\)/)
    assert.match(loadBlock, /if \(cancelled\) return/)
    assert.doesNotMatch(loadBlock, /readSetupFormDraft/)
    assert.doesNotMatch(loadBlock, /latest\?\.creator_name/)
  })

  it('selecting an existing project does not copy prior diary creator_name into Author Name', () => {
    assert.doesNotMatch(setupPage, /latest\?\.creator_name/)
    assert.match(setupPage, /Project fields only/)
    assert.match(setupPage, /mergeProjectIntoSetupState/)
  })

  it('Edit Report Details still hydrates Author Name from saved diary', () => {
    assert.match(setupPage, /loadEditDiarySetupSources/)
    assert.match(setupPage, /setAuthor\(safeSavedAuthor \|\| profileName/)
    assert.match(setupPage, /isAccountDerivedAuthorName/)
  })

  it('regression: removing profile author wiring fails this gate', () => {
    // Intentionally brittle: these exact call sites are the protected hydration path.
    const required = [
      'resolveSignedInAuthorProfile',
      'authorName: profileName',
      'setAuthor(fresh.author)',
      'initialiseNewDiarySetupState',
    ]
    for (const needle of required) {
      assert.ok(
        setupPage.includes(needle),
        `Protected Author Name hydration missing: ${needle}`,
      )
    }
  })
})
