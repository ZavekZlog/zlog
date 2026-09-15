import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPagePath = join(root, 'app/dashboard/project/[id]/diary/page.jsx')
const dailySectionsPath = join(root, 'components/diary/DiaryDailyRecordSections.jsx')
const narrativePath = join(root, 'components/diary/DiaryNarrativeTextarea.jsx')
const locationWalkPath = join(root, 'components/ai-annotation/AiLocationWalk.jsx')
const tempWorksPath = join(root, 'components/diary/DiaryTemporaryWorksSection.jsx')

describe('Site Diary signature read-only after capture', () => {
  it('fresh capture moves to accepted and shows Replace signature', () => {
    const page = readFileSync(diaryPagePath, 'utf8')
    assert.match(page, /setSignatureMode\('accepted'\)/)
    assert.match(page, /signature\?\.preview && signatureMode !== 'draw'/)
    assert.match(page, /Replace signature/)
    assert.doesNotMatch(page, /Use Existing Signature/)
    assert.doesNotMatch(page, /Re-sign \/ Clear/)
  })

  it('replace signature keeps prior signature until a new stroke is accepted', () => {
    const page = readFileSync(diaryPagePath, 'utf8')
    assert.match(page, /signatureReplaceBackupRef/)
    assert.match(page, /setSignatureReplacing\(true\)/)
    assert.doesNotMatch(
      page.slice(page.indexOf('const replaceSignature'), page.indexOf('const photosRef')),
      /setSignature\([\s\S]*null/,
    )
    assert.match(page, /Cancel replacement/)
    assert.doesNotMatch(
      page.slice(page.indexOf('if \(pad.isEmpty\(\)\)'), page.indexOf('canvas.toBlob')),
      /setSignature\(null\)/,
    )
  })

  it('hydrated carried signature stays read-only until Replace signature', () => {
    const page = readFileSync(diaryPagePath, 'utf8')
    assert.match(page, /setSignatureMode\('carried'\)/)
    assert.match(page, /replaceSignature/)
    assert.match(page, /setSignatureMode\('draw'\)/)
  })
})

describe('DiaryNarrativeTextarea auto-grow', () => {
  it('grows on hydrate and input without internal scroll', () => {
    const src = readFileSync(narrativePath, 'utf8')
    assert.match(src, /overflowY: 'hidden'/)
    assert.match(src, /resize: 'none'/)
    assert.match(src, /useLayoutEffect/)
    assert.match(src, /syncHeight/)
  })

  it('wired on Site Diary narrative fields only', () => {
    const page = readFileSync(diaryPagePath, 'utf8')
    assert.match(page, /DiaryNarrativeTextarea/)
    assert.match(page, /value=\{siteSummary\}/)
    assert.match(page, /value=\{visitors\}/)
    assert.match(page, /value=\{delaysIssues\}/)
    assert.match(page, /value=\{actionsRequired\}/)

    const daily = readFileSync(dailySectionsPath, 'utf8')
    assert.match(daily, /DiaryNarrativeTextarea/)
    assert.match(daily, /patchHs\(row\.key, 'description'/)
    assert.match(daily, /patchHs\(row\.key, 'actionTaken'/)

    const temp = readFileSync(tempWorksPath, 'utf8')
    assert.match(temp, /DiaryNarrativeTextarea/)
    assert.match(temp, /patch\(row\.key, 'notes'/)
  })
})

describe('H&S Action Taken full-width narrative', () => {
  it('action taken still persists through existing hsIncidents path', () => {
    const daily = readFileSync(dailySectionsPath, 'utf8')
    assert.match(daily, /onHsChange/)
    assert.match(daily, /'actionTaken'/)
    const autosave = readFileSync(join(root, 'lib/diary-autosave.js'), 'utf8')
    assert.match(autosave, /hs_incidents|hsIncidents/i)
  })

  it('action taken uses narrative textarea outside compact grid', () => {
    const daily = readFileSync(dailySectionsPath, 'utf8')
    const descIdx = daily.indexOf("patchHs(row.key, 'description'")
    const actionIdx = daily.indexOf("patchHs(row.key, 'actionTaken'")
    const assignedIdx = daily.indexOf("patchHs(row.key, 'assignedTo'")
    assert.ok(descIdx > 0 && actionIdx > descIdx)
    assert.ok(assignedIdx > actionIdx)
    assert.doesNotMatch(
      daily.slice(actionIdx - 120, actionIdx + 80),
      /<input[\s\S]*actionTaken/,
    )
  })
})

describe('Photo Evidence work-area label', () => {
  it('saved area header uses Work Area · prefix', () => {
    const walk = readFileSync(locationWalkPath, 'utf8')
    assert.match(walk, /Work Area · \{group\.areaName\}/)
  })
})
