import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIARY_MISSING_MESSAGE,
  diaryHubHref,
  existingDiaryHref,
} from './diary-routing.js'

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

describe('diary hub recovery', () => {
  it('builds hub URL with optional project and missing flag', () => {
    assert.equal(diaryHubHref(), '/dashboard/diary')
    assert.equal(diaryHubHref({ projectId: 'proj-1' }), '/dashboard/diary?project=proj-1')
    assert.equal(
      diaryHubHref({ projectId: 'proj-1', missing: true }),
      '/dashboard/diary?project=proj-1&missing=1',
    )
  })

  it('exposes a clear missing-diary message for the hub', () => {
    assert.match(DIARY_MISSING_MESSAGE, /could not be found/i)
    assert.doesNotMatch(DIARY_MISSING_MESSAGE, /404|UPDATE|INSERT|report id/i)
  })
})

describe('routing regression — existing diary entry points', () => {
  it('project diary page route exists at the supported path', () => {
    assert.ok(
      existsSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx')),
      'expected app/dashboard/project/[id]/diary/page.jsx',
    )
  })

  it('Open Latest Diary hub navigates via existingDiaryHref contract', () => {
    const hub = readFileSync(join(root, 'app/dashboard/diary/page.jsx'), 'utf8')
    assert.match(hub, /existingDiaryHref/)
    assert.match(hub, /openExistingReport/)
    assert.doesNotMatch(hub, /daily_reports['"]\)\.insert/)
  })

  it('project diary View/Edit and openReportForm use ?report= on the diary page', () => {
    const page = readFileSync(
      join(root, 'app/dashboard/project/[id]/diary/page.jsx'),
      'utf8',
    )
    assert.match(page, /existingDiaryHref|\/diary\?report=/)
    assert.match(page, /openReportForm/)
    assert.match(page, /diaryHubHref/)
  })
})
