import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  labourFormToPersistRows,
  plantFormToPersistRows,
  labourPersistRowsEqual,
  plantPersistRowsEqual,
  reportPersistNeedsWrite,
  photoRowsToBaseline,
  durablePhotosToBaseline,
  mergeAutosaveAckIntoReportRow,
} from './diary-save-dirty.js'
import { photoReconcileCanSkip } from './diary-save.js'

const REPORT_ID = 'rep-1'

describe('labour persist equality', () => {
  it('unchanged form rows match the hydrated persist snapshot', () => {
    const persisted = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A Ltd', count: 2, hours: 8, notes: 'North' },
    ], REPORT_ID)
    const fromForm = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A Ltd', headcount: '2', hours: '8', notes: 'North' },
    ], REPORT_ID)
    assert.equal(labourPersistRowsEqual(persisted, fromForm), true)
  })

  it('row added is dirty', () => {
    const left = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
      { trade: 'Electrician', company: 'B', headcount: '2', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(labourPersistRowsEqual(left, right), false)
  })

  it('row removed is dirty', () => {
    const left = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
      { trade: 'Electrician', company: 'B', headcount: '2', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(labourPersistRowsEqual(left, right), false)
  })

  it('field edited is dirty', () => {
    const left = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '3', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(labourPersistRowsEqual(left, right), false)
  })

  it('reordered rows are dirty because sequence is persisted', () => {
    const left = labourFormToPersistRows([
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
      { trade: 'Electrician', company: 'B', headcount: '2', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = labourFormToPersistRows([
      { trade: 'Electrician', company: 'B', headcount: '2', hours: '8', notes: '' },
      { trade: 'Carpenter', company: 'A', headcount: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(labourPersistRowsEqual(left, right), false)
  })

  it('blank placeholder rows are not persisted', () => {
    const rows = labourFormToPersistRows([
      { trade: '', company: '', headcount: '', hours: '', notes: '' },
    ], REPORT_ID)
    assert.deepEqual(rows, [])
  })
})

describe('plant persist equality', () => {
  it('unchanged form rows match hydrated persist snapshot', () => {
    const persisted = plantFormToPersistRows([
      { item: 'Excavator', ref: 1, status: 8, notes: 'East' },
    ], REPORT_ID)
    const fromForm = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: 'East' },
    ], REPORT_ID)
    assert.equal(plantPersistRowsEqual(persisted, fromForm), true)
  })

  it('row added is dirty', () => {
    const left = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
      { plant_type: 'Dumper', quantity: '2', hours: '4', notes: '' },
    ], REPORT_ID)
    assert.equal(plantPersistRowsEqual(left, right), false)
  })

  it('row removed is dirty', () => {
    const left = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
      { plant_type: 'Dumper', quantity: '2', hours: '4', notes: '' },
    ], REPORT_ID)
    const right = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(plantPersistRowsEqual(left, right), false)
  })

  it('field edited is dirty', () => {
    const left = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    const right = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '10', notes: '' },
    ], REPORT_ID)
    assert.equal(plantPersistRowsEqual(left, right), false)
  })

  it('reordered rows are dirty because sequence is persisted', () => {
    const left = plantFormToPersistRows([
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
      { plant_type: 'Dumper', quantity: '2', hours: '4', notes: '' },
    ], REPORT_ID)
    const right = plantFormToPersistRows([
      { plant_type: 'Dumper', quantity: '2', hours: '4', notes: '' },
      { plant_type: 'Excavator', quantity: '1', hours: '8', notes: '' },
    ], REPORT_ID)
    assert.equal(plantPersistRowsEqual(left, right), false)
  })
})

describe('report persist skip', () => {
  const row = {
    id: REPORT_ID,
    project_id: 'proj-1',
    site_summary: 'Work done',
    weather: 'Fine',
    shift: 'Day',
    cover_photo_url: 'user/cover.jpg',
    signature_url: 'user/sig.png',
    equipment_hire: [],
    hs_incidents: [],
    rfis: [],
    variations: [],
    temporary_works: [],
  }

  it('matching payload does not need a report UPDATE', () => {
    assert.equal(reportPersistNeedsWrite({
      project_id: 'proj-1',
      site_summary: 'Work done',
      weather: 'Fine',
      shift: 'Day',
      signature_url: 'user/sig.png',
    }, row), false)
  })

  it('omitted cover does not count as a cover change (anti-wipe omit)', () => {
    assert.equal(reportPersistNeedsWrite({
      project_id: 'proj-1',
      site_summary: 'Work done',
      weather: 'Fine',
      shift: 'Day',
      signature_url: 'user/sig.png',
    }, row), false)
  })

  it('edited summary needs a report UPDATE', () => {
    assert.equal(reportPersistNeedsWrite({
      project_id: 'proj-1',
      site_summary: 'Changed',
      weather: 'Fine',
      shift: 'Day',
      signature_url: 'user/sig.png',
    }, row), true)
  })

  it('missing baseline needs a report UPDATE', () => {
    assert.equal(reportPersistNeedsWrite({ site_summary: 'Work done' }, null), true)
  })

  it('autosave ack merge then matching payload does not need UPDATE', () => {
    const merged = mergeAutosaveAckIntoReportRow(row, {
      weather: 'Rain',
      site_summary: 'Work done',
      visitors: null,
      delays_issues: null,
      actions: null,
      equipment_hire: [],
      hs_incidents: [],
      rfis: [],
      variations: [],
      cover_photo_url: 'user/cover.jpg',
    })
    assert.equal(reportPersistNeedsWrite({
      project_id: 'proj-1',
      site_summary: 'Work done',
      weather: 'Rain',
      shift: 'Day',
      signature_url: 'user/sig.png',
    }, merged), false)
  })
})

describe('photo reconcile skip', () => {
  const row = {
    url: 'user/p1/report.jpg',
    caption: 'South',
    sequence: 1,
    layout: 'grid4',
    location: 'Area A',
    category: null,
    rotation_degrees: 0,
    assigned_to: null,
    thumbnail_path: 'user/p1/thumb.jpg',
  }

  it('unchanged durable photos skip LIST/reconcile', () => {
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: photoRowsToBaseline([row]),
      keptStoragePaths: [row.url],
      photoRecords: [],
      updateExistingPhotos: [{
        url: row.url,
        fields: {
          caption: 'South',
          sequence: 1,
          layout: 'grid4',
          location: 'Area A',
          category: null,
          rotation_degrees: 0,
          assigned_to: null,
          thumbnail_path: row.thumbnail_path,
        },
      }],
    }), true)
  })

  it('missing baseline does not skip', () => {
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: null,
      keptStoragePaths: [row.url],
      photoRecords: [],
      updateExistingPhotos: [],
    }), false)
  })

  it('new insert does not skip', () => {
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: photoRowsToBaseline([row]),
      keptStoragePaths: [row.url, 'user/p2/report.jpg'],
      photoRecords: [{ url: 'user/p2/report.jpg' }],
      updateExistingPhotos: [],
    }), false)
  })

  it('deleted photo does not skip', () => {
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: photoRowsToBaseline([row, { ...row, url: 'user/p2/report.jpg' }]),
      keptStoragePaths: [row.url],
      photoRecords: [],
      updateExistingPhotos: [],
    }), false)
  })

  it('caption change does not skip', () => {
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: photoRowsToBaseline([row]),
      keptStoragePaths: [row.url],
      photoRecords: [],
      updateExistingPhotos: [{
        url: row.url,
        fields: { ...row, caption: 'North' },
      }],
    }), false)
  })

  it('walk snapshot matches hydrated photo rows', () => {
    const fromWalk = durablePhotosToBaseline([{
      storagePath: row.url,
      caption: 'South',
      sequence_number: 1,
      layout: 'grid4',
      location: 'Area A',
      category: null,
      rotationDegrees: 0,
      assignedTo: '',
      thumbnailPath: row.thumbnail_path,
    }])
    assert.deepEqual(fromWalk[0].url, row.url)
    assert.equal(photoReconcileCanSkip({
      baselinePhotos: fromWalk,
      keptStoragePaths: [row.url],
      photoRecords: [],
      updateExistingPhotos: [{
        url: row.url,
        fields: {
          caption: 'South',
          sequence: 1,
          layout: 'grid4',
          location: 'Area A',
          category: null,
          rotation_degrees: 0,
          assigned_to: null,
          thumbnail_path: row.thumbnail_path,
        },
      }],
    }), true)
  })
})
