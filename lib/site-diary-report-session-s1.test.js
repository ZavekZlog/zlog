/**
 * Structural S1 — persistent diary layout + report session provider.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const layoutPath = join(
  root,
  'app/dashboard/project/[id]/diary/layout.jsx',
)
const providerPath = join(root, 'lib/site-diary-report-session.jsx')
const diaryPagePath = join(
  root,
  'app/dashboard/project/[id]/diary/page.jsx',
)
const viewPagePath = join(
  root,
  'app/dashboard/project/[id]/diary/view/page.jsx',
)

const layoutSrc = readFileSync(layoutPath, 'utf8')
const providerSrc = readFileSync(providerPath, 'utf8')
const diaryPageBefore = readFileSync(diaryPagePath, 'utf8')
const viewPageBefore = readFileSync(viewPagePath, 'utf8')

describe('Site Diary structural S1 — layout', () => {
  it('diary layout exists and wraps children with SiteDiarySessionProvider', () => {
    assert.match(layoutSrc, /export default function SiteDiaryLayout/)
    assert.match(layoutSrc, /SiteDiarySessionProvider/)
    assert.match(layoutSrc, /\{children\}/)
    assert.doesNotMatch(layoutSrc, /from '@\/app\//)
    assert.doesNotMatch(layoutSrc, /diary\/page/)
    assert.doesNotMatch(layoutSrc, /diary\/view/)
  })

  it('layout does not import Workbench, Viewer, or heavy domains', () => {
    assert.doesNotMatch(layoutSrc, /PhotoWorkspace/)
    assert.doesNotMatch(layoutSrc, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(layoutSrc, /report_labour/)
    assert.doesNotMatch(layoutSrc, /dynamic\s*\(/)
  })
})

describe('Site Diary structural S1 — session provider', () => {
  it('exports provider and future hook without Workbench or Viewer imports', () => {
    assert.match(providerSrc, /export function SiteDiarySessionProvider/)
    assert.match(providerSrc, /export function useSiteDiaryReportSession/)
    assert.match(providerSrc, /createContext/)
    assert.doesNotMatch(providerSrc, /diary\/page/)
    assert.doesNotMatch(providerSrc, /diary\/view/)
    assert.doesNotMatch(providerSrc, /SiteDiaryWorkbench/)
    assert.doesNotMatch(providerSrc, /loadSavedDiaryView/)
    assert.doesNotMatch(providerSrc, /PhotoWorkspace/)
    assert.doesNotMatch(providerSrc, /prepareSiteDiaryPdf/)
    assert.doesNotMatch(providerSrc, /report_labour/)
    assert.doesNotMatch(providerSrc, /SignaturePad/)
    assert.doesNotMatch(providerSrc, /from\('daily_reports'\)/)
  })

  it('prepares identity and read-snapshot contract without DB population', () => {
    assert.match(providerSrc, /setReportIdentity/)
    assert.match(providerSrc, /clearSession/)
    assert.match(providerSrc, /readSnapshots/)
    assert.match(providerSrc, /revalidationMeta/)
    assert.match(providerSrc, /photoMetadata/)
    assert.match(providerSrc, /coverStoragePath/)
    assert.doesNotMatch(providerSrc, /createClient/)
    assert.doesNotMatch(providerSrc, /supabase/)
  })

  it('does not introduce dual-mount or Workbench preload', () => {
    assert.doesNotMatch(providerSrc, /import\s*\(/)
    assert.doesNotMatch(layoutSrc, /import\s*\(/)
    assert.doesNotMatch(providerSrc, /display:\s*none|hidden.*Workbench|both.*mounted/i)
  })
})

describe('Site Diary structural S1 — protected pages unchanged', () => {
  it('viewer Edit routing and acknowledgement unchanged', () => {
    assert.match(viewPageBefore, /editExistingDiaryHref/)
    assert.match(viewPageBefore, /router\.push\(editHref\)/)
    assert.match(viewPageBefore, /Opening diary for editing…/)
    assert.doesNotMatch(viewPageBefore, /SiteDiarySessionProvider/)
  })

  it('workbench page has no S1 session consumer', () => {
    assert.doesNotMatch(diaryPageBefore, /useSiteDiaryReportSession/)
    assert.doesNotMatch(diaryPageBefore, /SiteDiarySessionProvider/)
  })
})
