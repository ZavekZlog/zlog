import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRegisterVisitorMoveFromSignIn,
  normalizeVisitorsRegisterProvenance,
  visitorsRegisterProvenanceKey,
} from './visitors-register-provenance.js'
import {
  applyOperativeMoveToVisitorsFromReview,
  applyOperativeLabourExclusionToReview,
  initSignInTradeHoursReviewFromOperatives,
} from './sign-in-trade-hours-review.js'

const EVIDENCE_A = 'uid/report-a/sign-in-sheet/1000.jpg'
const EVIDENCE_B = 'uid/report-b/sign-in-sheet/2000.jpg'

function architectOp(overrides = {}) {
  return {
    id: 'arch-16',
    trade: 'Architect',
    source_row: 16,
    time_in: '13:30',
    time_out: '16:00',
    dateStatus: 'match',
    included: true,
    movedToVisitors: false,
    excludedFromLabour: false,
    ...overrides,
  }
}

function reviewKeyForOperative(rows, operativeId) {
  const row = rows.find((r) => (r.rowIds || []).some((id) => String(id) === String(operativeId)))
  return row?.key
}

function labourRow16() {
  return {
    id: 'lab-16',
    trade: 'Labourer',
    source_row: 16,
    time_in: '08:00',
    time_out: '16:00',
    dateStatus: 'match',
    included: true,
    movedToVisitors: false,
    excludedFromLabour: false,
  }
}

describe('visitors register provenance', () => {
  it('A — same evidence / same row: one entry; replay does not duplicate', () => {
    const op = architectOp()
    const { rows } = initSignInTradeHoursReviewFromOperatives([
      op,
      {
        id: 'e1',
        trade: 'Electrician',
        source_row: 1,
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'match',
        included: true,
      },
    ])
    const key = reviewKeyForOperative(rows, 'arch-16')
    assert.ok(key)
    const electrician = {
      id: 'e1',
      trade: 'Electrician',
      source_row: 1,
      time_in: '08:00',
      time_out: '16:00',
      dateStatus: 'match',
      included: true,
    }
    const first = applyOperativeMoveToVisitorsFromReview({
      operatives: [op, electrician],
      reviewRows: rows,
      reviewRowKey: key,
      operativeId: 'arch-16',
      existingVisitorsText: '',
      evidencePath: EVIDENCE_A,
      tradeLabel: 'Architect',
    })
    assert.equal(first.ok, true)
    assert.equal(first.visitorsRegisterProvenance.length, 1)
    assert.equal(first.visitorsText, 'Architect · 13:30–16:00 · Register row 16')

    const replay = applyOperativeMoveToVisitorsFromReview({
      operatives: first.operatives,
      reviewRows: first.reviewRows,
      reviewRowKey: key,
      operativeId: 'arch-16',
      existingVisitorsText: first.visitorsText,
      existingVisitorsRegisterProvenance: first.visitorsRegisterProvenance,
      evidencePath: EVIDENCE_A,
      tradeLabel: 'Architect',
    })
    assert.equal(replay.reason, 'already-moved')
    assert.equal(replay.visitorsRegisterProvenance.length, 1)
    assert.equal(replay.visitorsText.split('\n').length, 1)
  })

  it('B — legacy Sign-in row normalised when fields align on current evidence', () => {
    const op = architectOp()
    const legacy = 'Architect · 13:30–16:00 · Sign-in row 16'
    const out = applyRegisterVisitorMoveFromSignIn({
      visitorsText: legacy,
      visitorsRegisterProvenance: [],
      operative: op,
      tradeLabel: 'Architect',
      evidencePath: EVIDENCE_A,
    })
    assert.equal(out.visitorsRegisterProvenance.length, 1)
    assert.equal(out.visitorsText, 'Architect · 13:30–16:00 · Register row 16')
    assert.equal(
      visitorsRegisterProvenanceKey(out.visitorsRegisterProvenance[0].evidencePath, 16),
      `${EVIDENCE_A}|16`,
    )
  })

  it('C — different evidence / same row: two provenance entries and two visible lines', () => {
    let visitorsText = ''
    let provenance = []
    const arch = applyRegisterVisitorMoveFromSignIn({
      visitorsText,
      visitorsRegisterProvenance: provenance,
      operative: architectOp(),
      tradeLabel: 'Architect',
      evidencePath: EVIDENCE_A,
    })
    visitorsText = arch.visitorsText
    provenance = arch.visitorsRegisterProvenance

    const labour = applyRegisterVisitorMoveFromSignIn({
      visitorsText,
      visitorsRegisterProvenance: provenance,
      operative: labourRow16(),
      tradeLabel: 'Labour',
      evidencePath: EVIDENCE_B,
    })
    assert.equal(labour.visitorsRegisterProvenance.length, 2)
    assert.equal(labour.visitorsText.split('\n').length, 2)
    assert.match(labour.visitorsText, /Architect · 13:30–16:00 · Register row 16/)
    assert.match(labour.visitorsText, /Labour · 08:00–16:00 · Register row 16/)

    const replayB = applyRegisterVisitorMoveFromSignIn({
      visitorsText: labour.visitorsText,
      visitorsRegisterProvenance: labour.visitorsRegisterProvenance,
      operative: labourRow16(),
      tradeLabel: 'Labour',
      evidencePath: EVIDENCE_B,
    })
    assert.equal(replayB.visitorsRegisterProvenance.length, 2)
    assert.equal(replayB.visitorsText.split('\n').length, 2)
  })

  it('D — identical display across different evidence stays two provenance entries', () => {
    let visitorsText = ''
    let provenance = []
    const a = applyRegisterVisitorMoveFromSignIn({
      visitorsText,
      visitorsRegisterProvenance: provenance,
      operative: architectOp(),
      tradeLabel: 'Architect',
      evidencePath: EVIDENCE_A,
    })
    const b = applyRegisterVisitorMoveFromSignIn({
      visitorsText: a.visitorsText,
      visitorsRegisterProvenance: a.visitorsRegisterProvenance,
      operative: architectOp({ id: 'arch-16-b' }),
      tradeLabel: 'Architect',
      evidencePath: EVIDENCE_B,
    })
    assert.equal(b.visitorsRegisterProvenance.length, 2)
    assert.equal(
      b.visitorsText.split('\n').filter((l) => l === 'Architect · 13:30–16:00 · Register row 16').length,
      2,
    )
  })

  it('E — legacy collision: row-only match does not claim Architect as Labour', () => {
    const legacy = 'Architect · 13:30–16:00 · Register row 16'
    const out = applyRegisterVisitorMoveFromSignIn({
      visitorsText: legacy,
      visitorsRegisterProvenance: [],
      operative: labourRow16(),
      tradeLabel: 'Labour',
      evidencePath: EVIDENCE_B,
    })
    assert.equal(out.visitorsRegisterProvenance.length, 1)
    assert.match(out.visitorsText, /Architect · 13:30–16:00 · Register row 16/)
    assert.match(out.visitorsText, /Labour · 08:00–16:00 · Register row 16/)
    assert.equal(out.visitorsText.split('\n').length, 2)
  })

  it('F — manual visitor line preserved', () => {
    const manual = 'Electrical subcontractor pm,'
    const out = applyRegisterVisitorMoveFromSignIn({
      visitorsText: manual,
      visitorsRegisterProvenance: [],
      operative: architectOp(),
      tradeLabel: 'Architect',
      evidencePath: EVIDENCE_A,
    })
    assert.match(out.visitorsText, /Electrical subcontractor pm,/)
    assert.match(out.visitorsText, /Architect · 13:30–16:00 · Register row 16/)
  })

  it('G — exclude from labour does not add provenance or visitor line', () => {
    const operatives = [
      architectOp(),
      {
        id: 'e1',
        trade: 'Electrician',
        source_row: 1,
        time_in: '08:00',
        time_out: '16:00',
        dateStatus: 'match',
        included: true,
      },
    ]
    const { rows } = initSignInTradeHoursReviewFromOperatives(operatives)
    const key = reviewKeyForOperative(rows, 'arch-16')
    assert.ok(key)
    const result = applyOperativeLabourExclusionToReview({
      operatives,
      reviewRows: rows,
      reviewRowKey: key,
      operativeId: 'arch-16',
      exclude: true,
    })
    assert.equal(result.ok, true)
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'visitorsRegisterProvenance'), false)
  })

  it('normalizeVisitorsRegisterProvenance defaults invalid/null to []', () => {
    assert.deepEqual(normalizeVisitorsRegisterProvenance(null), [])
    assert.deepEqual(normalizeVisitorsRegisterProvenance(undefined), [])
    assert.deepEqual(normalizeVisitorsRegisterProvenance([{ evidencePath: '', sourceRow: 1 }]), [])
  })
})
