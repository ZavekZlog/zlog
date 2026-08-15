/**
 * Site Diary daily H&S / RFI / Variation records — model + page wiring.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIARY_DAILY_RECORD_SECTION_ORDER,
  HS_INCIDENT_STATUSES,
  RFI_STATUSES,
  VARIATION_STATUSES,
  emptyHsIncident,
  emptyRfi,
  emptyVariation,
  hsIncidentHasData,
  hsIncidentsFromDb,
  hsIncidentsPayload,
  rfiHasData,
  rfisFromDb,
  rfisPayload,
  variationHasData,
  variationsFromDb,
  variationsPayload,
} from './diary-daily-records.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const sectionsUi = readFileSync(join(root, 'components/diary/DiaryDailyRecordSections.jsx'), 'utf8')
const liveSchema = readFileSync(join(root, 'lib/live-diary-schema.js'), 'utf8')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260813120000_diary_daily_records.sql'),
  'utf8',
)

describe('daily records — zero / multiple entries', () => {
  it('allows zero entries (empty payload arrays)', () => {
    assert.deepEqual(hsIncidentsPayload([]), [])
    assert.deepEqual(rfisPayload([]), [])
    assert.deepEqual(variationsPayload([]), [])
    assert.deepEqual(hsIncidentsFromDb([]), [])
    assert.deepEqual(hsIncidentsFromDb(null), [])
    assert.equal(hsIncidentHasData(emptyHsIncident()), false)
    assert.equal(rfiHasData(emptyRfi()), false)
    assert.equal(variationHasData(emptyVariation()), false)
  })

  it('supports multiple entries with status persistence round-trip', () => {
    const hsRows = [
      { ...emptyHsIncident(), description: 'Near miss on scaffold', status: 'Open' },
      { ...emptyHsIncident(), description: 'Spill cleared', actionTaken: 'Absorbed', status: 'Closed' },
    ]
    const hsSaved = hsIncidentsPayload(hsRows)
    assert.equal(hsSaved.length, 2)
    assert.equal(hsSaved[0].status, 'Open')
    assert.equal(hsSaved[1].status, 'Closed')
    const hsLoaded = hsIncidentsFromDb(hsSaved)
    assert.equal(hsLoaded.length, 2)
    assert.equal(hsLoaded[1].status, 'Closed')
    assert.equal(hsLoaded[1].actionTaken, 'Absorbed')

    const rfiSaved = rfisPayload([
      { ...emptyRfi(), reference: 'RFI-1', description: 'Door schedule', raisedTo: 'Architect', status: 'Responded' },
      { ...emptyRfi(), reference: 'RFI-2', description: 'Fire stopping', status: 'Closed' },
    ])
    assert.equal(rfiSaved.length, 2)
    assert.equal(rfiSaved[0].status, 'Responded')
    assert.equal(rfisFromDb(rfiSaved)[0].raisedTo, 'Architect')

    const varSaved = variationsPayload([
      { ...emptyVariation(), reference: 'VO-1', description: 'Extra socket', status: 'Instructed' },
      { ...emptyVariation(), reference: 'VO-2', description: 'Wall move', instructedBy: 'Client', status: 'Agreed' },
    ])
    assert.equal(varSaved.length, 2)
    assert.equal(variationsFromDb(varSaved)[1].status, 'Agreed')
    assert.equal(variationsFromDb(varSaved)[1].instructedBy, 'Client')
  })

  it('status enums are fixed for future weekly reuse', () => {
    assert.deepEqual(HS_INCIDENT_STATUSES, ['Open', 'Closed'])
    assert.deepEqual(RFI_STATUSES, ['Open', 'Responded', 'Closed'])
    assert.deepEqual(VARIATION_STATUSES, ['Identified', 'Instructed', 'Agreed', 'Closed'])
  })
})

describe('daily records — schema + save allowlist', () => {
  it('migration adds hs_incidents, rfis, variations jsonb columns', () => {
    assert.ok(existsSync(join(root, 'supabase/migrations/20260813120000_diary_daily_records.sql')))
    assert.match(migration, /hs_incidents jsonb/)
    assert.match(migration, /rfis jsonb/)
    assert.match(migration, /variations jsonb/)
  })

  it('live diary save allowlist includes the three columns', () => {
    assert.match(liveSchema, /'hs_incidents'/)
    assert.match(liveSchema, /'rfis'/)
    assert.match(liveSchema, /'variations'/)
    assert.match(liveSchema, /hs_incidents: src\.hs_incidents/)
  })
})

describe('daily records — Site Diary page wiring + order', () => {
  it('sections appear before Site summary in the form', () => {
    assert.deepEqual(DIARY_DAILY_RECORD_SECTION_ORDER, [
      'H&S Incidents / Observations',
      'RFIs',
      'Variations',
      'Site summary',
    ])
    assert.match(diaryPage, /DiaryDailyRecordSections/)
    const weather = diaryPage.indexOf('title="Weather"')
    const daily = diaryPage.indexOf('<DiaryDailyRecordSections')
    const summary = diaryPage.indexOf('title="Site summary"')
    assert.ok(weather > 0 && daily > weather && summary > daily)

    assert.match(sectionsUi, /H&S Incidents \/ Observations/)
    assert.match(sectionsUi, /title="RFIs"/)
    assert.match(sectionsUi, /title="Variations"/)
    assert.match(sectionsUi, /placeholder="Brief description of the variation"/)
    assert.doesNotMatch(sectionsUi, /placeholder="What changed"/)
    const hs = sectionsUi.indexOf('H&S Incidents / Observations')
    const rfi = sectionsUi.indexOf('title="RFIs"')
    const vo = sectionsUi.indexOf('title="Variations"')
    assert.ok(hs >= 0 && rfi > hs && vo > rfi)
  })

  it('save/load uses payload helpers and DB fields', () => {
    assert.match(diaryPage, /hsIncidentsPayload\(hsIncidents\)/)
    assert.match(diaryPage, /rfisPayload\(rfis\)/)
    assert.match(diaryPage, /variationsPayload\(variations\)/)
    assert.match(diaryPage, /hsIncidentsFromDb\(existing\.hs_incidents\)/)
    assert.match(diaryPage, /rfisFromDb\(existing\.rfis\)/)
    assert.match(diaryPage, /variationsFromDb\(existing\.variations\)/)
  })

  it('existing Site Diary sections remain intact', () => {
    for (const title of [
      'Cover photo',
      'Weather',
      'Site summary',
      'Labour',
      'Plant',
      'Equipment on hire',
      'Visitors',
      'Delays & issues',
      'Actions required',
      'Signature',
    ]) {
      assert.match(diaryPage, new RegExp(`title="${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    }
    assert.match(diaryPage, /PhotoWorkspace/)
    assert.match(diaryPage, /Save \/ Share/)
  })

  it('empty state + add controls — no default placeholder rows', () => {
    assert.match(sectionsUi, /No H&S items recorded today/)
    assert.match(sectionsUi, /No RFIs recorded today/)
    assert.match(sectionsUi, /No variations recorded today/)
    assert.match(sectionsUi, /\+ Add H&S item/)
    assert.match(sectionsUi, /\+ Add RFI/)
    assert.match(sectionsUi, /\+ Add variation/)
  })
})
