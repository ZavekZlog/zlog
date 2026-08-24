/**
 * Runtime resilience — auth getUser network failures must not abort dashboard/setup.
 * Preserves Report Date local-today behaviour.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchDefaultCompanyProfile } from './diary-draft.js'
import { fetchProjectsForSetup, projectsSetupSelectColumns } from './diary-setup-project-dates.js'
import { initialiseNewDiarySetupState } from './diary-setup-blank.js'
import { todayIsoDate } from './report-setup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const dashboardPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const draftSrc = readFileSync(join(root, 'lib/diary-draft.js'), 'utf8')

describe('Failed-to-fetch resilience (auth getUser network errors)', () => {
  it('diary page catches getUser rejections (no unhandled TypeError: Failed to fetch)', () => {
    assert.match(diaryPage, /supabase\.auth\.getUser\(\)\.then\([\s\S]*?\)\.catch\(/)
  })

  it('dashboard project load uses try/finally so Loading cannot stick after fetch failure', () => {
    assert.match(dashboardPage, /try \{/)
    assert.match(dashboardPage, /finally \{/)
    assert.match(dashboardPage, /setLoading\(false\)/)
  })

  it('fetchDefaultCompanyProfile returns null when getUser throws Failed to fetch', async () => {
    const supabase = {
      auth: {
        async getUser() {
          throw new TypeError('Failed to fetch')
        },
      },
      from() {
        throw new Error('from() must not run after getUser failure')
      },
    }
    const profile = await fetchDefaultCompanyProfile(supabase)
    assert.equal(profile, null)
    assert.match(draftSrc, /Network \/ non-Auth errors/)
  })

  it('setup lists projects via fetchProjectsForSetup (resilient to project_reference lag)', () => {
    assert.match(setupPage, /fetchProjectsForSetup/)
    assert.match(projectsSetupSelectColumns(), /project_reference/)
    assert.doesNotMatch(
      projectsSetupSelectColumns({ includeProjectReference: false }),
      /project_reference/,
    )
  })

  it('fetchProjectsForSetup falls back when project_reference column error is returned', async () => {
    let calls = 0
    const supabase = {
      from() {
        return {
          select() {
            return {
              order: async () => {
                calls += 1
                if (calls === 1) {
                  return {
                    data: null,
                    error: { message: 'column projects.project_reference does not exist' },
                  }
                }
                return {
                  data: [{ id: 'p1', name: 'North' }],
                  error: null,
                }
              },
            }
          },
        }
      },
    }
    const rows = await fetchProjectsForSetup(supabase)
    assert.equal(calls, 2)
    assert.equal(rows[0].id, 'p1')
  })

  it('compose Continue landings clear Loading before secondary signed-URL hydration finishes', () => {
    assert.match(diaryPage, /progressiveCompose/)
    assert.match(diaryPage, /applyCoverPathOnly|mapPhotoRowWithoutPreview/)
    const firstPaint = diaryPage.indexOf('First usable paint')
    const hydrateDone = diaryPage.indexOf('setHydrateComplete(true)')
    assert.ok(firstPaint > 0, 'compose path must mark first usable paint')
    assert.ok(hydrateDone > firstPaint, 'hydrateComplete must stay after first paint')
    const firstPaintLoadingOff = diaryPage.indexOf('setLoading(false)', firstPaint)
    assert.ok(
      firstPaintLoadingOff > firstPaint && firstPaintLoadingOff < hydrateDone,
      'Loading must clear on the compose critical path before hydrateComplete',
    )
  })

  it('workbench existing-diary load uses try/finally and cannot stick on Loading after failure', () => {
    assert.match(diaryPage, /setLoading\(false\)/)
    assert.match(diaryPage, /describeDiaryWorkbenchLoadFailure/)
    assert.match(diaryPage, /loadDiagnostic/)
    assert.match(diaryPage, /diary-load-timeout/)
    assert.match(diaryPage, /DIARY_WORKBENCH_LOAD_FAILED_COPY/)
    assert.match(diaryPage, /useMemo\(\(\) => createClient\(\), \[\]\)/)
    assert.match(
      diaryPage,
      /\[projectId, editingReportId, formReloadToken, composeQuery, supabase\]/,
    )
    assert.doesNotMatch(
      diaryPage,
      /\[projectId, editingReportId, formReloadToken, router\]/,
    )
    assert.match(diaryPage, /if \(existingError\)/)
    assert.match(diaryPage, /failLoad\('daily_reports'/)
  })

  it('Report Date local-today behaviour is preserved after resilience fix', () => {
    const state = initialiseNewDiarySetupState({ authorName: 'Alex' })
    assert.equal(state.reportDate, todayIsoDate())
    assert.match(setupPage, /reportDate: todayIsoDate\(\)/)
  })
})
