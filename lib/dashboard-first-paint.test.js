/**
 * Dashboard Site Control Panel — cards must not wait on latest-project retrieval.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dashboardPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8')

describe('dashboard first paint — latest project is not a gate', () => {
  it('does not use a full-screen Loading gate before cards', () => {
    assert.doesNotMatch(dashboardPage, /if \(loading\)/)
    assert.doesNotMatch(dashboardPage, /Loading\.\.\./)
    assert.doesNotMatch(dashboardPage, /setLoading/)
  })

  it('still loads latest project once on mount for non-diary modules', () => {
    assert.match(dashboardPage, /useEffect\(\(\) => \{/)
    assert.match(dashboardPage, /\.from\('projects'\)/)
    assert.match(dashboardPage, /\.maybeSingle\(\)/)
    const effectBlocks = dashboardPage.match(/useEffect\([\s\S]*?\}, \[\]\)/g) || []
    assert.equal(effectBlocks.length, 1)
    assert.equal((effectBlocks[0].match(/\.from\('projects'\)/g) || []).length, 1)
  })

  it('Site Diary stays enabled without a project row', () => {
    const start = dashboardPage.indexOf('const renderCard')
    const renderCard = dashboardPage.slice(start, dashboardPage.indexOf('\n  }\n\n  return (', start))
    assert.match(renderCard, /const isDiary = card\.path === 'diary'/)
    assert.match(renderCard, /const disabled = isDiary \? false : !project/)
    assert.match(renderCard, /router\.push\('\/dashboard\/diary'\)/)
  })

  it('project-dependent cards stay disabled until project exists', () => {
    const start = dashboardPage.indexOf('const renderCard')
    const renderCard = dashboardPage.slice(start, dashboardPage.indexOf('\n  }\n\n  return (', start))
    assert.match(renderCard, /disabled={disabled}/)
    assert.match(renderCard, /if \(project\?\.id\) router\.push/)
    assert.doesNotMatch(renderCard, /isDiary[\s\S]{0,80}disabled:\s*!project/)
  })

  it('renders DashboardTopBar and all theme cards in the main return', () => {
    const mainReturn = dashboardPage.slice(dashboardPage.lastIndexOf('return ('))
    assert.match(mainReturn, /<DashboardTopBar \/>/)
    assert.match(mainReturn, /REPORT_THEME_LIST\.map/)
  })
})
