'use client'

/**
 * Sticky project information — create & edit (project-level).
 * Used by diary setup, New Project, and project hub. Not diary daily fields.
 */

import { useState } from 'react'
import { labelStyle, inputStyle, PrimaryCTA } from '@/lib/premium-ui'
import {
  hydrateStickyFromRow,
  stickyWritePayload,
  validateStickyProjectFields,
} from '@/lib/project-sticky-fields'

/**
 * @param {object} props
 * @param {string} [props.projectAddress]
 * @param {string} [props.projectManager]
 * @param {string} [props.workingDaysPerWeek]
 * @param {(next: {
 *   projectAddress: string,
 *   projectManager: string,
 *   workingDaysPerWeek: string,
 * }) => void} props.onChange
 * @param {string} [props.error]
 */
export function ProjectStickyFields({
  projectAddress = '',
  projectManager = '',
  workingDaysPerWeek = '',
  onChange,
  error = '',
}) {
  const emit = (patch) => {
    onChange({
      projectAddress,
      projectManager,
      workingDaysPerWeek,
      ...patch,
    })
  }

  return (
    <>
      <label style={labelStyle}>Project Address</label>
      <input
        type="text"
        value={projectAddress || ''}
        onChange={(e) => emit({ projectAddress: e.target.value })}
        placeholder="e.g. 14 High Street, Manchester"
        autoComplete="street-address"
        style={inputStyle}
      />

      <label style={labelStyle}>Project Manager</label>
      <input
        type="text"
        value={projectManager || ''}
        onChange={(e) => emit({ projectManager: e.target.value })}
        placeholder="Enter Project Manager"
        autoComplete="name"
        style={inputStyle}
      />

      <label style={labelStyle}>Working Days per Week</label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={7}
        step={1}
        value={workingDaysPerWeek || ''}
        onChange={(e) => emit({ workingDaysPerWeek: e.target.value })}
        placeholder="1–7"
        style={{ ...inputStyle, marginBottom: error ? 0 : undefined }}
      />
      {error ? (
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: '#ff6b6b', lineHeight: 1.35 }}>
          {error}
        </p>
      ) : null}

    </>
  )
}

/**
 * Inline sticky-field editor for an existing project (hub).
 */
export function ProjectStickyEditor({
  projectId,
  initialProjectAddress = '',
  initialProjectManager = '',
  initialWorkingDaysPerWeek = '',
  accent,
  supabase,
  onSaved,
}) {
  const [fields, setFields] = useState(() => ({
    projectAddress: initialProjectAddress || '',
    projectManager: initialProjectManager || '',
    workingDaysPerWeek: initialWorkingDaysPerWeek || '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleChange = (next) => {
    setFields(next)
    setSaved(false)
    const v = validateStickyProjectFields(next)
    setError(v.ok ? '' : v.message)
  }

  const handleSave = async () => {
    const v = validateStickyProjectFields(fields)
    if (!v.ok) {
      setError(v.message)
      return
    }
    setSaving(true)
    setError('')
    const payload = stickyWritePayload(fields)
    const { data, error: updError } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .select('id, site_address, client_pm, working_days_per_week')
      .single()

    setSaving(false)
    if (updError) {
      setError(updError.message || 'We couldn’t save the project details. Check your connection and try again.')
      return
    }
    if (!data) {
      setError('We couldn’t save the project details. Check your connection and try again.')
      return
    }
    const hydrated = hydrateStickyFromRow(data)
    const next = {
      projectAddress: hydrated.projectAddress,
      projectManager: hydrated.projectManager,
      workingDaysPerWeek: hydrated.workingDaysPerWeek,
    }
    setFields(next)
    setSaved(true)
    onSaved?.(next)
  }

  return (
    <div>
      <ProjectStickyFields
        projectAddress={fields.projectAddress}
        projectManager={fields.projectManager}
        workingDaysPerWeek={fields.workingDaysPerWeek}
        onChange={handleChange}
        error={error}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        <PrimaryCTA
          type="button"
          accent={accent}
          disabled={saving || Boolean(error)}
          onClick={handleSave}
          style={{ minHeight: 48, flex: '1 1 160px' }}
        >
          {saving ? 'Saving…' : 'Save project details'}
        </PrimaryCTA>
      </div>
      {saved ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#4ade80' }}>
          Project details saved.
        </p>
      ) : null}
    </div>
  )
}
