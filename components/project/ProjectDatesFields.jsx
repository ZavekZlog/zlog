'use client'

/**
 * Project programme dates — create & edit (project-level).
 * Used by New Project and Project hub. Not part of Site Diary form.
 */

import { useEffect, useState } from 'react'
import { labelStyle, inputStyle, PrimaryCTA } from '@/lib/premium-ui'
import {
  toDateColumnValue,
  toDateInputValue,
  validateProjectDates,
} from '@/lib/project-day'

/**
 * @param {object} props
 * @param {string} [props.startDate]
 * @param {string} [props.plannedCompletionDate]
 * @param {(next: { startDate: string, plannedCompletionDate: string }) => void} props.onChange
 * @param {string} [props.error]
 */
export function ProjectDatesFields({
  startDate = '',
  plannedCompletionDate = '',
  onChange,
  error = '',
}) {
  return (
    <>
      <label style={labelStyle}>Project Start Date</label>
      <input
        type="date"
        value={startDate || ''}
        onChange={(e) => onChange({
          startDate: e.target.value,
          plannedCompletionDate,
        })}
        style={inputStyle}
      />

      <label style={labelStyle}>Planned Completion Date</label>
      <input
        type="date"
        value={plannedCompletionDate || ''}
        onChange={(e) => onChange({
          startDate,
          plannedCompletionDate: e.target.value,
        })}
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
 * Inline editor for an existing project (hub).
 */
export function ProjectDatesEditor({
  projectId,
  initialStartDate = '',
  initialPlannedCompletionDate = '',
  accent,
  supabase,
  onSaved,
}) {
  const [startDate, setStartDate] = useState(() => toDateInputValue(initialStartDate))
  const [plannedCompletionDate, setPlannedCompletionDate] = useState(() =>
    toDateInputValue(initialPlannedCompletionDate),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Re-hydrate when the project row finishes loading or the route id changes.
  useEffect(() => {
    setStartDate(toDateInputValue(initialStartDate))
    setPlannedCompletionDate(toDateInputValue(initialPlannedCompletionDate))
    setError('')
    setSaved(false)
  }, [projectId, initialStartDate, initialPlannedCompletionDate])

  const handleChange = ({ startDate: s, plannedCompletionDate: p }) => {
    setStartDate(s)
    setPlannedCompletionDate(p)
    setSaved(false)
    const v = validateProjectDates(s, p)
    setError(v.ok ? '' : v.message)
  }

  const handleSave = async () => {
    const v = validateProjectDates(startDate, plannedCompletionDate)
    if (!v.ok) {
      setError(v.message)
      return
    }
    setSaving(true)
    setError('')
    const start_date = toDateColumnValue(startDate)
    const planned_completion_date = toDateColumnValue(plannedCompletionDate)
    const { data, error: updError } = await supabase
      .from('projects')
      .update({
        start_date,
        planned_completion_date,
      })
      .eq('id', projectId)
      .select('id, start_date, planned_completion_date')
      .single()

    setSaving(false)
    if (updError) {
      setError(updError.message || 'We couldn’t save the project dates. Check your connection and try again.')
      return
    }
    if (!data) {
      setError('We couldn’t save the project dates. Check your connection and try again.')
      return
    }
    const nextStart = toDateInputValue(data.start_date)
    const nextEnd = toDateInputValue(data.planned_completion_date)
    setStartDate(nextStart)
    setPlannedCompletionDate(nextEnd)
    setSaved(true)
    onSaved?.({ startDate: nextStart, plannedCompletionDate: nextEnd })
  }

  return (
    <div>
      <ProjectDatesFields
        startDate={startDate}
        plannedCompletionDate={plannedCompletionDate}
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
          {saving ? 'Saving…' : 'Save project dates'}
        </PrimaryCTA>
      </div>
      {saved ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#4ade80' }}>
          Project dates saved.
        </p>
      ) : null}
    </div>
  )
}
