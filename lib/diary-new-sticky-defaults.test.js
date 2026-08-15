/**
 * New diary sticky defaults vs edit hydration vs project-level sticky.
 *
 * Journeys A–G — HARD FAIL coverage for release gate / site-diary contract.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  initialiseNewDiarySetupState,
  isCleanScratchSetupState,
} from './diary-setup-blank.js'
import { mergeProjectIntoSetupState } from './diary-setup-project-dates.js'
import { hydrateStickyFromRow } from './project-sticky-fields.js'
import {
  hydrateEditModeCoverAndReference,
  newDiaryInheritsFromProject,
} from './diary-edit-hydrate.js'
import {
  stickyReportingCompanyFromLatest,
} from './diary-reporting-company.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')

const PROJECT_MANAGER = 'Project Manager'
const PROJECT_ROW = {
  id: 'proj-1',
  name: 'North Site',
  site_address: '1 Site Rd',
  client_pm: PROJECT_MANAGER,
  working_days_per_week: 5,
  current_phase: 'Structure',
  project_reference: 'X',
  start_date: '2026-01-01',
  planned_completion_date: '2026-12-31',
}

const COMPANY_PROFILE = {
  id: 'brand-1',
  company_name: 'Acme Construction',
  logo_url: 'user/logos/acme.png',
  brand_color: '#123456',
}

describe('A — New diary carries Reporting Company identity', () => {
  it('initialise + sticky company apply branding id, logo path, and name source', () => {
    const sticky = stickyReportingCompanyFromLatest({
      latestReport: {
        branding_id: 'brand-1',
        brand_logo_url: 'user/logos/acme.png',
        brand_color: '#123456',
      },
      latestBrandingRow: COMPANY_PROFILE,
    })
    assert.equal(sticky.companyName, 'Acme Construction')
    assert.equal(sticky.logoStoragePath, 'user/logos/acme.png')
    assert.equal(sticky.brandingId, 'brand-1')

    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      authorRole: 'Site Manager',
      companyProfile: {
        id: sticky.brandingId,
        company_name: sticky.companyName,
        logo_url: sticky.logoStoragePath,
        brand_color: sticky.brandColor,
      },
    })
    assert.equal(state.brandingId, 'brand-1')
    assert.equal(state.logoStoragePath, 'user/logos/acme.png')
    assert.match(setupPage, /fetchStickyReportingCompany/)
    assert.match(setupPage, /setReportingCompany\(stickyCompany\.companyName/)
  })

  it('setup explains Reporting Company Logo purpose (corporate branding)', () => {
    assert.match(
      setupPage,
      /Your logo helps Zlog create your report’s corporate branding, including colours and report styling\./,
    )
    assert.doesNotMatch(setupPage, /dominant colour|algorithm|AI extraction/i)
    assert.doesNotMatch(setupPage, /CBRE|#00[Aa]651/)
  })
})

describe('B — New diary carries Author name and role', () => {
  it('prefills author + role from profile args (editable defaults)', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex Site',
      authorRole: 'Site Manager',
      reportDate: '2026-08-14',
    })
    assert.equal(state.author, 'Alex Site')
    assert.equal(state.authorRole, 'Site Manager')
    assert.match(setupPage, /setAuthor\(fresh\.author\)/)
    assert.match(setupPage, /setAuthorRole\(fresh\.authorRole\)/)
  })
})

describe('C — Project Manager ownership', () => {
  it('scratch init leaves Project Manager empty', () => {
    const scratch = initialiseNewDiarySetupState({
      authorName: 'Alex',
      authorRole: 'Site Manager',
    })
    assert.equal(scratch.projectManager, '')
    assert.equal(
      isCleanScratchSetupState(scratch, {
        authorName: 'Alex',
        authorRole: 'Site Manager',
      }),
      true,
    )
  })

  it('selecting an existing project hydrates its saved client_pm', () => {
    const merged = mergeProjectIntoSetupState(
      initialiseNewDiarySetupState({ authorName: 'Alex' }),
      PROJECT_ROW,
    )
    assert.equal(merged.projectName, 'North Site')
    assert.equal(merged.projectAddress, '1 Site Rd')
    assert.equal(merged.projectReference, 'X')
    assert.equal(merged.projectManager, PROJECT_MANAGER)
  })
})

describe('D — New diary does NOT inherit previous diary cover photo', () => {
  it('new diary inherit helper rejects prior cover path', () => {
    const inherit = newDiaryInheritsFromProject({
      projectReference: 'X',
      coverStoragePath: 'user/old-rep/cover.jpg',
    })
    assert.equal(inherit.coverStoragePath, null)
    assert.equal(inherit.projectReference, 'X')
  })

  it('setup never mounts a cover control; the workbench is canonical', () => {
    assert.doesNotMatch(setupPage, /Cover photo|coverPhoto|cover_photo_url/)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 1)
    const state = initialiseNewDiarySetupState({ authorName: 'Alex' })
    assert.equal(Object.prototype.hasOwnProperty.call(state, 'coverPhoto'), false)
  })
})

describe('E — Project Reference keeps project-level sticky behaviour', () => {
  it('new diary with existing project prefills Project Reference from project row', () => {
    const state = initialiseNewDiarySetupState({
      authorName: 'Alex',
      existingProject: PROJECT_ROW,
    })
    assert.equal(state.projectReference, 'X')
    assert.equal(state.projectManager, PROJECT_MANAGER)
  })
})

describe('F — Edit existing diary still hydrates saved PM, cover, reference', () => {
  it('edit hydrate uses project client_pm + report cover + project_reference', () => {
    // Edit path uses hydrateStickyFromRow (not mergeProjectIntoSetupState).
    const sticky = hydrateStickyFromRow(PROJECT_ROW)
    assert.equal(sticky.projectManager, PROJECT_MANAGER)

    const hydration = hydrateEditModeCoverAndReference({
      report: {
        id: 'rep-1',
        cover_photo_url: 'user/rep-1/cover.jpg',
      },
      projectRow: PROJECT_ROW,
    })
    assert.equal(hydration.projectReference, 'X')
    assert.equal(hydration.coverStoragePath, 'user/rep-1/cover.jpg')
    assert.match(setupPage, /setProjectManager\(sticky\.projectManager\)/)
    assert.match(setupPage, /loadEditDiarySetupSources/)
  })
})

describe('G — Unrelated edits do not wipe persisted cover / reference', () => {
  it('re-hydrate after unrelated summary change keeps cover + reference', () => {
    const before = hydrateEditModeCoverAndReference({
      report: { cover_photo_url: 'user/rep-1/cover.jpg', site_summary: 'A' },
      projectRow: PROJECT_ROW,
    })
    const after = hydrateEditModeCoverAndReference({
      report: { cover_photo_url: 'user/rep-1/cover.jpg', site_summary: 'B only' },
      projectRow: PROJECT_ROW,
    })
    assert.equal(after.coverStoragePath, before.coverStoragePath)
    assert.equal(after.projectReference, before.projectReference)
  })
})
