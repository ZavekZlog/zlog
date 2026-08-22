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
  TEMPORARY_WORKS_CHECK_RESULTS,
  TEMPORARY_WORKS_SCAFFOLD_CHECKS,
  TEMPORARY_WORKS_STATUSES,
  TEMPORARY_WORKS_TYPES,
  VARIATION_STATUSES,
  emptyHsIncident,
  emptyRfi,
  emptyTemporaryWork,
  emptyVariation,
  hsIncidentHasData,
  hsIncidentsFromDb,
  hsIncidentsPayload,
  rfiHasData,
  rfisFromDb,
  rfisPayload,
  temporaryWorkHasData,
  temporaryWorkInspectionStatus,
  temporaryWorkNotesDisplay,
  temporaryWorksApplicableFromDb,
  temporaryWorksForPdf,
  temporaryWorksFromDb,
  temporaryWorksPayload,
  variationHasData,
  variationsFromDb,
  variationsPayload,
} from './diary-daily-records.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const diaryPage = readFileSync(join(root, 'app/dashboard/project/[id]/diary/page.jsx'), 'utf8')
const setupPage = readFileSync(join(root, 'app/dashboard/diary/setup/page.jsx'), 'utf8')
const sectionsUi = readFileSync(join(root, 'components/diary/DiaryDailyRecordSections.jsx'), 'utf8')
const temporaryWorksUi = readFileSync(
  join(root, 'components/diary/DiaryTemporaryWorksSection.jsx'),
  'utf8',
)
const liveSchema = readFileSync(join(root, 'lib/live-diary-schema.js'), 'utf8')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260813120000_diary_daily_records.sql'),
  'utf8',
)
const temporaryWorksMigration = readFileSync(
  join(root, 'supabase/migrations/20260816090000_diary_temporary_works.sql'),
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
    assert.deepEqual(temporaryWorksPayload([]), [])
    assert.deepEqual(temporaryWorksFromDb(null), [])
    assert.equal(temporaryWorkHasData(emptyTemporaryWork()), false)
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

    const temporaryWorksSaved = temporaryWorksPayload([
      {
        ...emptyTemporaryWork(),
        type: 'Scaffold',
        location: 'Level 03 east',
        status: 'Inspected',
        reference: 'TWS-014',
        checkResult: 'Satisfactory',
        notes: 'Toe boards secure',
        scaffoldCheck: 'Checked today — satisfactory',
        scaffoldTag: 'Bay A',
      },
      {
        ...emptyTemporaryWork(),
        type: 'Excavation support',
        location: 'North trench',
        status: 'Issue identified',
        checkResult: 'Action required',
      },
    ])
    assert.equal(temporaryWorksSaved.length, 2)
    assert.equal(temporaryWorksSaved[0].type, 'Scaffold')
    assert.equal(temporaryWorksSaved[0].item, 'Scaffold')
    assert.equal(temporaryWorksSaved[0].scaffoldCheck, 'Checked today — satisfactory')
    assert.equal(temporaryWorksSaved[1].scaffoldCheck, null)
    const loaded = temporaryWorksFromDb(temporaryWorksSaved)
    assert.equal(loaded[0].type, 'Scaffold')
    assert.equal(loaded[0].scaffoldTag, 'Bay A')
    assert.equal(loaded[1].type, 'Excavation support')
    assert.equal(
      temporaryWorkInspectionStatus(loaded[0]),
      'Inspected · Satisfactory · Checked today — satisfactory',
    )
    assert.equal(
      temporaryWorkNotesDisplay(loaded[0]),
      'Ref: TWS-014 — Scaffold: Bay A — Toe boards secure',
    )
    assert.deepEqual(temporaryWorksForPdf(temporaryWorksSaved)[0], {
      item: 'Scaffold',
      location: 'Level 03 east',
      status: 'Inspected · Satisfactory · Checked today — satisfactory',
      notes: 'Ref: TWS-014 — Scaffold: Bay A — Toe boards secure',
    })
    // Prior short-lived scaffold options reopen onto the clarified wording.
    assert.equal(
      temporaryWorksFromDb([{
        type: 'Scaffold',
        scaffoldCheck: 'Inspected today',
      }])[0].scaffoldCheck,
      'Checked today — satisfactory',
    )
    assert.equal(
      temporaryWorksFromDb([{
        type: 'Scaffold',
        scaffoldCheck: 'Not inspected today',
      }])[0].scaffoldCheck,
      'Not checked today',
    )
    assert.equal(temporaryWorksApplicableFromDb(false, temporaryWorksSaved), false)
    assert.equal(temporaryWorksApplicableFromDb(null, temporaryWorksSaved), true)
    assert.equal(temporaryWorksApplicableFromDb(null, []), null)

    // Legacy free-text Temporary Works rows reopen without inventing new meaning.
    const legacy = temporaryWorksFromDb([
      {
        id: 'legacy-1',
        item: 'Crane outrigger mats',
        location: 'Loading bay',
        status: 'Checked — satisfactory',
        notes: 'Mats in place',
      },
    ])
    assert.equal(legacy[0].type, 'Other')
    assert.equal(legacy[0].location, 'Loading bay')
    assert.equal(legacy[0].status, '')
    assert.match(legacy[0].notes, /Checked — satisfactory/)
    assert.match(legacy[0].notes, /Mats in place/)
  })

  it('status enums are fixed for future weekly reuse', () => {
    assert.deepEqual(HS_INCIDENT_STATUSES, ['Open', 'Closed'])
    assert.deepEqual(RFI_STATUSES, ['Open', 'Responded', 'Closed'])
    assert.deepEqual(VARIATION_STATUSES, ['Identified', 'Instructed', 'Agreed', 'Closed'])
    assert.deepEqual(TEMPORARY_WORKS_TYPES, [
      'Scaffold',
      'Hoarding',
      'Excavation support',
      'Temporary propping',
      'Edge protection',
      'Access platform',
      'Formwork / falsework',
      'Other',
    ])
    assert.deepEqual(TEMPORARY_WORKS_STATUSES, [
      'In place',
      'Inspected',
      'Modified',
      'Removed',
      'Issue identified',
    ])
    assert.deepEqual(TEMPORARY_WORKS_CHECK_RESULTS, ['Satisfactory', 'Action required'])
    assert.deepEqual(TEMPORARY_WORKS_SCAFFOLD_CHECKS, [
      'Checked today — satisfactory',
      'Formal inspection current',
      'Issue identified',
      'Not checked today',
    ])
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

  it('migration and allowlist persist temporary works applicability and records', () => {
    assert.match(temporaryWorksMigration, /temporary_works_applicable boolean/)
    assert.match(temporaryWorksMigration, /temporary_works jsonb NOT NULL DEFAULT '\[\]'::jsonb/)
    assert.match(liveSchema, /'temporary_works_applicable'/)
    assert.match(liveSchema, /'temporary_works'/)
    assert.match(liveSchema, /temporary_works: src\.temporary_works/)
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
    assert.match(diaryPage, /temporaryWorksPayload\(temporaryWorks\)/)
    assert.match(diaryPage, /temporaryWorksFromDb\(existing\.temporary_works\)/)
    assert.match(diaryPage, /existing\.temporary_works_applicable/)
  })

  it('adds the temporary works section after equipment and before visitors', () => {
    const equipment = diaryPage.indexOf('title="Equipment on hire"')
    const temporaryWorks = diaryPage.indexOf('<DiaryTemporaryWorksSection')
    const visitors = diaryPage.indexOf('title="Visitors"')
    assert.ok(equipment > 0 && temporaryWorks > equipment && visitors > temporaryWorks)
    assert.match(temporaryWorksUi, /Temporary Works & Scaffolding Checks/)
    assert.match(temporaryWorksUi, /Temporary works apply today/)
    assert.match(temporaryWorksUi, /Not applicable today/)
    assert.match(temporaryWorksUi, /\+ Add temporary works item/)
    assert.match(temporaryWorksUi, /Temporary Works Type/)
    assert.match(temporaryWorksUi, /Location \/ Description/)
    assert.match(temporaryWorksUi, /TWC \/ TWS \/ Reference/)
    assert.match(temporaryWorksUi, /Check Result/)
    assert.match(temporaryWorksUi, /Notes \/ Action/)
    assert.match(temporaryWorksUi, /Scaffold check \/ inspection status/)
    assert.match(temporaryWorksUi, /Scaffold tag \/ inspection reference/)
    assert.match(temporaryWorksUi, /isScaffold/)
    assert.match(temporaryWorksUi, /Delete item/)
    assert.match(temporaryWorksUi, /window\.confirm/)
  })

  it('existing Site Diary sections remain intact', () => {
    assert.equal([...setupPage.matchAll(/title="Cover photo"/g)].length, 1)
    assert.equal([...diaryPage.matchAll(/title="Cover photo"/g)].length, 0)
    for (const title of [
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
