import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyStickyFormFields,
  hydrateStickyFromRow,
  preserveSavedStickyFields,
  stickyFieldsMatchRow,
  stickyPayloadHasValues,
  stickyWritePayload,
  validateStickyProjectFields,
  validateWorkingDaysPerWeek,
} from './project-sticky-fields.js'

describe('sticky project fields — validation', () => {
  it('working days accepts blank and 1–7 whole numbers', () => {
    assert.deepEqual(validateWorkingDaysPerWeek(''), { ok: true, value: null })
    assert.deepEqual(validateWorkingDaysPerWeek('5'), { ok: true, value: 5 })
    assert.equal(validateWorkingDaysPerWeek('0').ok, false)
    assert.equal(validateWorkingDaysPerWeek('8').ok, false)
    assert.equal(validateWorkingDaysPerWeek('3.5').ok, false)
    assert.equal(validateWorkingDaysPerWeek('abc').ok, false)
  })

  it('sticky validation only rejects bad working days', () => {
    assert.equal(validateStickyProjectFields({ workingDaysPerWeek: '' }).ok, true)
    assert.equal(validateStickyProjectFields({ workingDaysPerWeek: '7' }).ok, true)
    const bad = validateStickyProjectFields({ workingDaysPerWeek: '9' })
    assert.equal(bad.ok, false)
    assert.equal(bad.field, 'workingDays')
  })
})

describe('sticky project fields — hydrate / write / clear', () => {
  it('hydrates from a projects row', () => {
    assert.deepEqual(
      hydrateStickyFromRow({
        site_address: '  14 High St  ',
        client_pm: 'Jordan Lee',
        working_days_per_week: 5,
        project_reference: ' JOB-42 ',
      }),
      {
        projectAddress: '14 High St',
        projectManager: 'Jordan Lee',
        workingDaysPerWeek: '5',
        projectReference: 'JOB-42',
      },
    )
  })

  it('write payload maps form fields to project columns', () => {
    assert.deepEqual(
      stickyWritePayload({
        projectAddress: '14 High St',
        projectManager: 'Jordan Lee',
        workingDaysPerWeek: '5',
        projectReference: 'JOB-42',
      }),
      {
        site_address: '14 High St',
        client_pm: 'Jordan Lee',
        working_days_per_week: 5,
        project_reference: 'JOB-42',
      },
    )
  })

  it('empty sticky form clears to blanks', () => {
    assert.deepEqual(emptyStickyFormFields(), {
      projectAddress: '',
      projectManager: '',
      workingDaysPerWeek: '',
      projectReference: '',
    })
  })

  it('write payload omits project_reference when field not supplied (anti-wipe)', () => {
    const payload = stickyWritePayload({
      projectAddress: '14 High St',
      projectManager: 'Jordan Lee',
      workingDaysPerWeek: '5',
    })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'project_reference'), false)
  })
  it('match / has-values helpers support reuse detection', () => {
    const payload = stickyWritePayload({
      projectAddress: 'A',
      projectManager: '',
      workingDaysPerWeek: '5',
    })
    assert.equal(stickyPayloadHasValues(payload), true)
    assert.equal(
      stickyFieldsMatchRow(payload, {
        site_address: 'A',
        client_pm: null,
        working_days_per_week: 5,
      }),
      true,
    )
    assert.equal(
      stickyFieldsMatchRow(payload, {
        site_address: 'B',
        client_pm: null,
        working_days_per_week: 5,
      }),
      false,
    )
  })

  it('blank diary fields preserve saved project-owned values', () => {
    const payload = preserveSavedStickyFields(
      stickyWritePayload({
        projectAddress: '',
        projectManager: '',
        workingDaysPerWeek: '',
        projectReference: '',
      }),
      {
        site_address: '14 High St',
        client_pm: 'Jordan Lee',
        working_days_per_week: 6,
        project_reference: 'JOB-42',
      },
    )
    assert.deepEqual(payload, {
      site_address: '14 High St',
      client_pm: 'Jordan Lee',
      working_days_per_week: 6,
      project_reference: 'JOB-42',
    })
  })

  it('Current Phase is never read from or written to projects', () => {
    const hydrated = hydrateStickyFromRow({ current_phase: 'Groundworks' })
    const payload = stickyWritePayload({ currentPhase: 'Fit-out' })
    assert.equal(Object.prototype.hasOwnProperty.call(hydrated, 'currentPhase'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'current_phase'), false)
  })
})
