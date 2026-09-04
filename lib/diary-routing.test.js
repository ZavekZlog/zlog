import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIARY_MISSING_MESSAGE,
  diaryHubHref,
  editExistingDiaryHref,
  existingDiaryHref,
  openExistingDiaryHref,
  projectAndReportDetailsHref,
  savedDiaryViewerHref,
} from './diary-routing.js'
import { savedReportListHref } from './report-deletion.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('existingDiaryHref', () => {
  it('builds project diary URL with report query (no hard-coded ids)', () => {
    assert.equal(
      existingDiaryHref('proj-abc', 'rep-123'),
      '/dashboard/project/proj-abc/diary?report=rep-123',
    )
  })

  it('returns null when project or report id is missing', () => {
    assert.equal(existingDiaryHref(null, 'rep-1'), null)
    assert.equal(existingDiaryHref('proj-1', ''), null)
  })
})

describe('today existing diary — setup-first entry', () => {
  it('opens today’s existing report through populated Project & Report Details', () => {
    assert.equal(
      openExistingDiaryHref({
        projectId: 'proj-abc',
        reportId: 'rep-today',
        reportDate: '2026-08-15',
        today: '2026-08-15',
      }),
      '/dashboard/diary/setup?report=rep-today&project=proj-abc',
    )
  })

  it('keeps historical diaries on the direct read-only workbench route', () => {
    assert.equal(
      openExistingDiaryHref({
        projectId: 'proj-abc',
        reportId: 'rep-old',
        reportDate: '2026-08-14',
        today: '2026-08-15',
      }),
      '/dashboard/project/proj-abc/diary?report=rep-old',
    )
  })

  it('Project & Report Details keeps the exact existing report and project IDs', () => {
    assert.equal(
      projectAndReportDetailsHref('project / one', 'report / one'),
      '/dashboard/diary/setup?report=report%20%2F%20one&project=project%20%2F%20one',
    )
    assert.equal(projectAndReportDetailsHref('', 'rep-1'), null)
  })
})

describe('saved diary viewer — read-only artifact', () => {
  it('builds a viewer URL for the exact saved report', () => {
    assert.equal(
      savedDiaryViewerHref('proj-abc', 'rep-123'),
      '/dashboard/project/proj-abc/diary/view?report=rep-123',
    )
    assert.equal(savedDiaryViewerHref('', 'rep-1'), null)
    assert.equal(savedDiaryViewerHref('proj-1', null), null)
  })

  it('viewer route never carries compose or edit flags', () => {
    const href = savedDiaryViewerHref('proj-abc', 'rep-123')
    assert.doesNotMatch(href, /compose=|edit=/)
  })

  it('the viewer route file exists', () => {
    assert.ok(
      existsSync(join(root, 'app/dashboard/project/[id]/diary/view/page.jsx')),
      'expected app/dashboard/project/[id]/diary/view/page.jsx',
    )
  })

  it('DIARY-SAVED-BACK — Zlog Back returns to the Saved Diaries list', () => {
    const viewer = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
      'utf8',
    )
    assert.equal(savedReportListHref(), '/dashboard/diary?view=saved')
    assert.notEqual(savedReportListHref(), '/dashboard/diary')
    const hrefHits = viewer.split('backHref={savedReportListHref()}').length - 1
    assert.equal(hrefHits, 4)
    assert.doesNotMatch(viewer, /diaryHubHref/)
    assert.doesNotMatch(viewer, /backHref="\/dashboard\/diary"/)
    assert.doesNotMatch(viewer, /backHref=\{diaryHubHref/)
    assert.doesNotMatch(viewer, /router\.back\s*\(/)
    assert.doesNotMatch(viewer, /onBack=/)
    assert.doesNotMatch(viewer, /clearSavedDiaryListSnapshot/)
  })

  it('Edit This Diary always opens the same diary in explicit edit mode (full workbench)', () => {
    assert.equal(
      editExistingDiaryHref({
        projectId: 'proj-abc',
        reportId: 'rep-today',
        reportDate: '2026-08-15',
        today: '2026-08-15',
      }),
      '/dashboard/project/proj-abc/diary?report=rep-today&edit=1',
    )
  })

  it('Edit This Diary opens a historical diary in explicit edit mode, same id', () => {
    assert.equal(
      editExistingDiaryHref({
        projectId: 'proj-abc',
        reportId: 'rep-old',
        reportDate: '2026-08-14',
        today: '2026-08-15',
      }),
      '/dashboard/project/proj-abc/diary?report=rep-old&edit=1',
    )
    assert.equal(editExistingDiaryHref({ projectId: 'proj-1' }), null)
  })
})

describe('diary hub recovery', () => {
  const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
  const workbench = readFileSync(
    join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
    'utf8',
  )

  it('builds hub URL with optional project and missing flag', () => {
    assert.equal(diaryHubHref(), '/dashboard/diary')
    assert.equal(diaryHubHref({ projectId: 'proj-1' }), '/dashboard/diary?project=proj-1')
    assert.equal(
      diaryHubHref({ projectId: 'proj-1', missing: true }),
      '/dashboard/diary?project=proj-1&missing=1',
    )
    assert.doesNotMatch(diaryHubHref(), /view=saved/)
    assert.doesNotMatch(diaryHubHref({ projectId: 'proj-1' }), /view=saved/)
  })

  it('Saved Diaries Zlog Back replaces onto diaryHubHref and leaves ?view=saved', () => {
    const leave = hub.slice(
      hub.indexOf('const leaveSavedList'),
      hub.indexOf('const enterSelectionMode'),
    )
    assert.match(hub, /onClick=\{leaveSavedList\}/)
    assert.match(
      leave,
      /router\.replace\(diaryHubHref\(\{\s*projectId:\s*filterProjectId\s*\}\)\)/,
    )
    assert.doesNotMatch(leave, /view=saved/)
    assert.doesNotMatch(leave, /savedReportListHref/)
    assert.doesNotMatch(leave, /router\.push/)
    assert.doesNotMatch(leave, /router\.back\s*\(/)
    assert.doesNotMatch(hub, /router\.back\s*\(/)
    assert.equal(diaryHubHref(), '/dashboard/diary')
    assert.equal(savedReportListHref(), '/dashboard/diary?view=saved')
    assert.equal(
      savedDiaryViewerHref('proj-abc', 'rep-123'),
      '/dashboard/project/proj-abc/diary/view?report=rep-123',
    )
  })

  it('exposes a clear missing-diary message for the hub', () => {
    assert.match(DIARY_MISSING_MESSAGE, /could not be found/i)
    assert.doesNotMatch(DIARY_MISSING_MESSAGE, /404|UPDATE|INSERT|report id/i)
  })

  it('fresh hub mount with missing=1 initialises the missing-diary message', () => {
    assert.match(hub, /searchParams\.get\('missing'\) === '1'/)
    assert.match(
      hub,
      /useState\(\(\) => \(missingReport \? DIARY_MISSING_MESSAGE : ''\)\)/,
    )
    assert.match(hub, /\{error && \(/)
    assert.match(hub, /\{error\}/)
  })

  it('fresh hub mount without missing=1 does not initialise the missing-diary message', () => {
    assert.match(
      hub,
      /useState\(\(\) => \(missingReport \? DIARY_MISSING_MESSAGE : ''\)\)/,
    )
    assert.doesNotMatch(hub, /useState\(\(\) => DIARY_MISSING_MESSAGE\)/)
  })

  it('does not re-set the missing-diary message from a mounted effect', () => {
    assert.doesNotMatch(
      hub,
      /useEffect\(\(\) => \{\s*if \(missingReport\) setError\(DIARY_MISSING_MESSAGE\)/,
    )
    assert.doesNotMatch(hub, /setError\(DIARY_MISSING_MESSAGE\)/)
  })

  it('keeps load/open/select-all/load-more errors on the shared hub error state', () => {
    assert.match(
      hub,
      /setError\('We couldn’t load your diaries\. Check your connection and try again\.'\)/,
    )
    assert.match(
      hub,
      /setError\('That diary can’t be opened\. Try another one, or start a new diary\.'\)/,
    )
    assert.match(
      hub,
      /setError\('We couldn’t select all diaries\. Check your connection and try again\.'\)/,
    )
    assert.match(
      hub,
      /setError\('We couldn’t load more diaries\. Check your connection and try again\.'\)/,
    )
    const preserveMissing = hub.match(
      /setError\(\(prev\) => \(prev === DIARY_MISSING_MESSAGE \? prev : ''\)\)/g,
    )
    assert.ok(
      preserveMissing && preserveMissing.length >= 4,
      'load/open-saved/select-all/load-more must keep the missing-diary message when clearing',
    )
    assert.doesNotMatch(
      hub,
      /const error = missingReport \? DIARY_MISSING_MESSAGE/,
    )
  })

  it('workbench still recovers a missing saved report via cross-route hub href', () => {
    assert.match(
      workbench,
      /routerRef\.current\.replace\(diaryHubHref\(\{\s*projectId,\s*missing:\s*true\s*\}\)\)/,
    )
    assert.equal(
      diaryHubHref({ projectId: 'proj-1', missing: true }),
      '/dashboard/diary?project=proj-1&missing=1',
    )
  })
})

describe('routing regression — existing diary entry points', () => {
  it('project diary page route exists at the supported path', () => {
    assert.ok(
      existsSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx')),
      'expected app/dashboard/project/[id]/diary/page.jsx',
    )
  })

  it('diary hub opens a saved entry in the read-only viewer', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    assert.match(hub, /savedDiaryViewerHref/)
    assert.match(hub, /openExistingReport/)
    assert.doesNotMatch(hub, /daily_reports['"]\)\.insert/)

    const review = hub.slice(
      hub.indexOf('const openExistingReport'),
      hub.indexOf('const openSavedDiaries'),
    )
    // Review must never reach the compose/edit workbench or create a row.
    assert.doesNotMatch(review, /compose=1|edit=1|createTodaysDiaryDraft/)
  })

  it('saved diary row keeps one activation path and the unchanged viewer href', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    assert.match(hub, /openExistingReport\(row\)/)
    assert.match(hub, /if \(selectionMode\) \{/)
    assert.match(hub, /toggleSelected\(row\.id\)/)
    const open = hub.slice(
      hub.indexOf('const openExistingReport'),
      hub.indexOf('const openSavedDiaries'),
    )
    assert.match(open, /if \(selectionMode\) return/)
    assert.match(open, /savedDiaryViewerHref\(row\?\.project_id,\s*row\?\.id\)/)
    assert.match(open, /router\.push\(href\)/)
    assert.doesNotMatch(open, /<Link\b/)
    assert.equal(
      savedDiaryViewerHref('proj-abc', 'rep-123'),
      '/dashboard/project/proj-abc/diary/view?report=rep-123',
    )
  })

  it('reports loading is not retriggered solely by a recreated client identity', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    assert.match(hub, /const supabase = useMemo\(\(\) => createClient\(\), \[\]\)/)
    assert.match(hub, /\[mode, filterProjectId, supabase\]/)
    assert.doesNotMatch(hub, /const supabase = createClient\(\)/)
  })

  it('project-param cleanup cannot override an already-started diary open', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    const cleanupStart = hub.indexOf("if (mode === 'saved' && filterProjectId)")
    assert.ok(cleanupStart > 0, 'saved-list project-param cleanup must remain')
    const cleanup = hub.slice(cleanupStart, cleanupStart + 280)
    assert.match(cleanup, /openingSavedDiaryRef\.current/)
    assert.match(cleanup, /router\.replace\(savedReportListHref\(\)\)/)
    const open = hub.slice(
      hub.indexOf('const openExistingReport'),
      hub.indexOf('const openSavedDiaries'),
    )
    assert.ok(
      open.indexOf('openingSavedDiaryRef.current = true') < open.indexOf('router.push(href)'),
      'open must arm the guard before pushing the viewer',
    )
  })

  it('saved diary list selection mode does not navigate', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    const enter = hub.slice(
      hub.indexOf('const enterSelectionMode'),
      hub.indexOf('const exitSelectionMode'),
    )
    assert.match(enter, /setSelectionMode\(true\)/)
    assert.doesNotMatch(enter, /router\.(push|replace)/)
    const rowClick = hub.slice(
      hub.indexOf('onClick={() => {'),
      hub.indexOf('aria-pressed={selectionMode'),
    )
    assert.match(rowClick, /if \(selectionMode\)/)
    assert.match(rowClick, /toggleSelected\(row\.id\)/)
    assert.match(rowClick, /return/)
    assert.match(rowClick, /openExistingReport\(row\)/)
    const open = hub.slice(
      hub.indexOf('const openExistingReport'),
      hub.indexOf('const openSavedDiaries'),
    )
    assert.match(open, /if \(selectionMode\) return/)
    assert.ok(
      open.indexOf('openingSavedDiaryRef.current = true') < open.indexOf('router.push(href)'),
      'open must arm the guard before pushing the viewer',
    )
  })

  it('Use as Basis for New Diary opens Project & Report Details, not the workbench', () => {
    const viewer = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/view/page.jsx'),
      'utf8',
    )
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    const useAsBasis = viewer.slice(
      viewer.indexOf('const handleUseAsBasisForNewDiary'),
      viewer.indexOf('const actionsBusy'),
    )
    // Today's diary is created from the opened one, then reviewed before the workbench.
    const created = useAsBasis.indexOf('createTodaysDiaryDraft')
    const details = useAsBasis.indexOf('projectAndReportDetailsHref')
    assert.ok(created > 0, 'Use as Basis still creates today’s diary')
    assert.ok(details > created, 'details screen must follow draft creation')
    assert.doesNotMatch(useAsBasis, /diaryFormHref|compose=1/)
    assert.doesNotMatch(viewer, /diaryFormHref/)
    assert.doesNotMatch(hub, /createTodaysDiaryDraft/)
    assert.doesNotMatch(hub, /diaryFormHref/)
  })

  it('Start a New Diary remains an independent blank setup route', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    const startNew = hub.slice(
      hub.indexOf('const startNewReport'),
      hub.indexOf('const startNewReport') + 320,
    )
    assert.match(startNew, /clearSetupFormDraft/)
    assert.match(startNew, /\/dashboard\/diary\/setup/)
    assert.doesNotMatch(startNew, /report=/)
    assert.doesNotMatch(startNew, /openExistingDiaryHref|createTodaysDiaryDraft/)
  })

  it('project diary View and openReportForm use the today-aware open contract', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    assert.match(page, /openExistingDiaryHref/)
    assert.match(page, /openReportForm/)
    assert.match(page, /diaryHubHref/)
  })

  it('project details View also uses the today-aware open contract', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/page.jsx'),
      'utf8',
    )
    assert.match(page, /openExistingDiaryHref/)
    assert.match(page, /reportDate:\s*d\.report_date/)
  })
})

describe('workbench contextual Back → same-diary Project Details', () => {
  const diaryPage = readFileSync(
    join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
    'utf8',
  )

  it('valid projectId + reportId → setup?report=&project= (ids preserved)', () => {
    const href = projectAndReportDetailsHref('proj-1', 'rep-1')
    assert.equal(href, '/dashboard/diary/setup?report=rep-1&project=proj-1')
    assert.match(href, /report=rep-1/)
    assert.match(href, /project=proj-1/)
  })

  it('missing reportId falls back to diary hub (safe Exit), not a blank project diary start', () => {
    assert.equal(projectAndReportDetailsHref('proj-1', null), null)
    assert.equal(projectAndReportDetailsHref('proj-1', ''), null)
    assert.equal(diaryHubHref({ projectId: 'proj-1' }), '/dashboard/diary?project=proj-1')
  })

  it('workbench PremiumShell Back uses projectAndReportDetailsHref then diaryHubHref', () => {
    const start = diaryPage.indexOf('const workbenchBackHref')
    assert.ok(start > 0, 'workbenchBackHref must be defined')
    const block = diaryPage.slice(start, start + 420)
    assert.match(block, /projectAndReportDetailsHref\(projectId,\s*editingReportId\)/)
    assert.match(block, /diaryHubHref\(\{\s*projectId\s*\}\)/)
    assert.match(block, /backHref=\{workbenchBackHref\}/)
    // Must not send Back to the report-less project diary URL that redirects to hub.
    assert.doesNotMatch(block, /backHref=\{`\/dashboard\/project\/\$\{projectId\}\/diary`\}/)
  })

  it('Back destination does not create a diary (setup hydrate / hub only)', () => {
    const href = projectAndReportDetailsHref('proj-1', 'rep-1')
    assert.match(href, /^\/dashboard\/diary\/setup\?/)
    assert.doesNotMatch(href, /compose=1|edit=1/)
    const start = diaryPage.indexOf('const workbenchBackHref')
    const block = diaryPage.slice(start, start + 420)
    assert.doesNotMatch(block, /createTodaysDiaryDraft|createBlankDiaryDraft|createDiaryDraftFromSetup/)
  })
})

describe('Project Details Back → Site Diary hub (no workbench hop)', () => {
  const setupPage = readFileSync(
    join(root, 'app/dashboard/diary/setup/page.jsx'),
    'utf8',
  )

  it('setupBackHref uses diaryHubHref when project context exists', () => {
    const block = setupPage.slice(
      setupPage.indexOf('const setupBackHref = useMemo'),
      setupPage.indexOf('const [loading, setLoading]'),
    )
    assert.match(block, /diaryHubHref\(\{\s*projectId:\s*editingProjectId\s*\}\)/)
    assert.match(block, /:\s*'\/dashboard\/diary'/)
    assert.equal(
      diaryHubHref({ projectId: 'proj-1' }),
      '/dashboard/diary?project=proj-1',
    )
  })

  it('PremiumShell and footer Back share setupBackHref only (no onBack / workbench push)', () => {
    assert.match(setupPage, /backHref=\{setupBackHref\}/)
    assert.match(setupPage, /href=\{setupBackHref\}/)
    assert.doesNotMatch(setupPage, /onBack=\{handleBack\}/)
    assert.doesNotMatch(setupPage, /onClick=\{handleBack\}/)
    assert.doesNotMatch(
      setupPage,
      /router\.push\(`\/dashboard\/project\/\$\{editingProjectId\}\/diary\?report=/,
    )
    assert.doesNotMatch(setupPage, /const handleBack =/)
  })

  it('Back wiring does not create or mutate diaries', () => {
    const backBlock = setupPage.slice(
      setupPage.indexOf('const setupBackHref = useMemo'),
      setupPage.indexOf('const [loading, setLoading]'),
    )
    assert.doesNotMatch(backBlock, /createTodaysDiaryDraft|createBlankDiaryDraft|createDiaryDraftFromSetup/)
    assert.doesNotMatch(backBlock, /router\.push/)
  })
})
