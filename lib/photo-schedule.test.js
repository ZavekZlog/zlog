import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assignReportPhotoNumbers,
  buildPhotoSchedule,
  photoReferenceLabel,
  photoTileCaption,
} from './photo-schedule.js'

describe('photoReferenceLabel', () => {
  it('formats Photo N', () => {
    assert.equal(photoReferenceLabel(1), 'Photo 1')
    assert.equal(photoReferenceLabel(12), 'Photo 12')
  })
})

describe('assignReportPhotoNumbers', () => {
  it('numbers continuously across layouts (not per section)', () => {
    const photos = [
      { key: 'a', layout: 'grid4', sequence_number: 1, caption: 'A' },
      { key: 'b', layout: 'full', sequence_number: 2, caption: 'B' },
      { key: 'c', layout: 'grid6', sequence_number: 3, caption: 'C' },
      { key: 'd', layout: 'grid4', sequence_number: 4, caption: 'D' },
    ]
    const numbered = assignReportPhotoNumbers(photos)
    assert.deepEqual(
      numbered.map((p) => [p.key, p.reportPhotoNumber]),
      [
        ['b', 1], // full first
        ['a', 2],
        ['d', 3],
        ['c', 4],
      ],
    )
  })

  it('recalculates after remove', () => {
    const before = assignReportPhotoNumbers([
      { key: '1', layout: 'grid4', sequence_number: 1 },
      { key: '2', layout: 'grid4', sequence_number: 2 },
      { key: '3', layout: 'grid4', sequence_number: 3 },
    ])
    const after = assignReportPhotoNumbers(before.filter((p) => p.key !== '2'))
    assert.deepEqual(
      after.map((p) => [p.key, p.reportPhotoNumber]),
      [
        ['1', 1],
        ['3', 2],
      ],
    )
  })
})

describe('buildPhotoSchedule', () => {
  it('keeps continuous numbers inside layout buckets', () => {
    const schedule = buildPhotoSchedule([
      { key: 'f', layout: 'full', sequence_number: 1 },
      { key: 'g', layout: 'grid4', sequence_number: 2 },
    ])
    assert.equal(schedule.full[0].reportPhotoNumber, 1)
    assert.equal(schedule.grid4[0].reportPhotoNumber, 2)
  })
})

describe('photoTileCaption', () => {
  it('uses caption only — no timestamp field', () => {
    assert.equal(
      photoTileCaption({
        caption: 'East elevation',
        timestamp: '2026-07-28T10:00:00.000Z',
      }),
      'East elevation',
    )
  })
})
