import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSharePdfFingerprint,
  fingerprintFromSavedDiaryView,
} from './diary-pdf-cache.js'

describe('share PDF durable cache fingerprint', () => {
  it('changes when a photo caption or rotation changes', () => {
    const base = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [
        { url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 },
        { url: 'b.jpg', caption: 'South', rotation_degrees: 90, sequence: 2 },
      ],
    })
    const rotated = buildSharePdfFingerprint({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Pour slab',
      weather: 'Clear',
      shift: 'Day',
      photos: [
        { url: 'a.jpg', caption: 'North', rotation_degrees: 0, sequence: 1 },
        { url: 'b.jpg', caption: 'South', rotation_degrees: 180, sequence: 2 },
      ],
    })
    assert.notEqual(base, rotated)
  })

  it('builds a fingerprint from a saved diary view model', () => {
    const fp = fingerprintFromSavedDiaryView({
      reportId: 'r1',
      reportDate: '2026-08-24',
      coverPhotoPath: 'cover.jpg',
      siteSummary: 'Works',
      weather: 'Rain',
      shift: 'Night',
      photoAreas: [
        {
          photos: [
            { url: 'p1.jpg', caption: 'One', rotation_degrees: 0, sequence: 1 },
          ],
        },
      ],
    })
    assert.ok(fp.includes('r1'))
    assert.ok(fp.includes('p1.jpg'))
  })
})
