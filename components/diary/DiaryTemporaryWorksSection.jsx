'use client'

import { GlassSection, inputStyle, labelStyle, textareaStyle } from '@/lib/premium-ui'
import {
  TEMPORARY_WORKS_CHECK_RESULTS,
  TEMPORARY_WORKS_SCAFFOLD_CHECKS,
  TEMPORARY_WORKS_SCAFFOLD_TYPE,
  TEMPORARY_WORKS_STATUSES,
  TEMPORARY_WORKS_TYPES,
  emptyTemporaryWork,
} from '@/lib/diary-daily-records'

const choiceGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 10,
  marginBottom: 14,
}

const choiceStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  padding: '10px 12px',
  border: '1px solid var(--edge)',
  borderRadius: 10,
  color: 'var(--text)',
  cursor: 'pointer',
}

const recordStyle = {
  marginBottom: 14,
  paddingBottom: 14,
  borderBottom: '1px solid color-mix(in srgb, var(--edge) 80%, transparent)',
}

const fieldGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
}

const addButtonStyle = {
  width: '100%',
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px dashed var(--edge)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const deleteButtonStyle = {
  minHeight: 44,
  marginBottom: 10,
  padding: '8px 0',
  border: 'none',
  background: 'transparent',
  color: 'color-mix(in srgb, var(--danger, #E5484D) 75%, var(--text))',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

export function DiaryTemporaryWorksSection({
  accent,
  disabled = false,
  applicable = null,
  rows = [],
  onApplicableChange,
  onRowsChange,
}) {
  const chooseApplicability = (next) => {
    if (next === false && rows.length > 0) {
      const confirmed = window.confirm(
        'Marking this section as not applicable will remove the temporary works items entered here. Continue?',
      )
      if (!confirmed) return
      onRowsChange([])
    }
    onApplicableChange(next)
  }

  const patch = (key, field, value) => {
    onRowsChange(rows.map((row) => {
      if (row.key !== key) return row
      if (field === 'type') {
        const nextType = value
        const clearingScaffold = nextType !== TEMPORARY_WORKS_SCAFFOLD_TYPE
        return {
          ...row,
          type: nextType,
          scaffoldCheck: clearingScaffold ? '' : row.scaffoldCheck,
          scaffoldTag: clearingScaffold ? '' : row.scaffoldTag,
        }
      }
      return { ...row, [field]: value }
    }))
  }

  return (
    <GlassSection title="Temporary Works & Scaffolding Checks" accent={accent}>
      <p style={{ margin: '0 0 12px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.45 }}>
        Record today&apos;s temporary works and scaffolding checks, or mark this section as not applicable.
      </p>

      <div style={choiceGridStyle} role="radiogroup" aria-label="Temporary works today">
        <label
          style={{
            ...choiceStyle,
            borderColor: applicable === true ? `rgba(${accent}, 0.7)` : 'var(--edge)',
          }}
        >
          <input
            type="radio"
            name="temporary-works-applicable"
            checked={applicable === true}
            disabled={disabled}
            onChange={() => chooseApplicability(true)}
          />
          <span>Temporary works apply today</span>
        </label>
        <label
          style={{
            ...choiceStyle,
            borderColor: applicable === false ? `rgba(${accent}, 0.7)` : 'var(--edge)',
          }}
        >
          <input
            type="radio"
            name="temporary-works-applicable"
            checked={applicable === false}
            disabled={disabled}
            onChange={() => chooseApplicability(false)}
          />
          <span>Not applicable today</span>
        </label>
      </div>

      {applicable === true ? (
        <>
          {rows.length === 0 ? (
            <p style={{ margin: '0 0 10px', color: 'var(--text-2)', fontSize: 13 }}>
              No items added yet. Add the first temporary works item below.
            </p>
          ) : (
            rows.map((row, index) => {
              const isScaffold = row.type === TEMPORARY_WORKS_SCAFFOLD_TYPE
              return (
                <div key={row.key} style={recordStyle}>
                  <button
                    type="button"
                    style={deleteButtonStyle}
                    disabled={disabled}
                    onClick={() => onRowsChange(rows.filter((entry) => entry.key !== row.key))}
                    aria-label={`Delete temporary works item ${index + 1}`}
                  >
                    Delete item
                  </button>
                  <div style={fieldGridStyle}>
                    <Field label="Temporary Works Type">
                      <select
                        style={{ ...inputStyle, marginBottom: 0, minHeight: 44 }}
                        value={row.type}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'type', event.target.value)}
                      >
                        <option value="">Select type</option>
                        {TEMPORARY_WORKS_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Location / Description">
                      <input
                        style={{ ...inputStyle, marginBottom: 0 }}
                        value={row.location}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'location', event.target.value)}
                        placeholder="e.g. Level 03 east elevation"
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        style={{ ...inputStyle, marginBottom: 0, minHeight: 44 }}
                        value={row.status}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'status', event.target.value)}
                      >
                        <option value="">Select status</option>
                        {TEMPORARY_WORKS_STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="TWC / TWS / Reference">
                      <input
                        style={{ ...inputStyle, marginBottom: 0 }}
                        value={row.reference}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'reference', event.target.value)}
                        placeholder="Optional"
                      />
                    </Field>
                    <Field label="Check Result">
                      <select
                        style={{ ...inputStyle, marginBottom: 0, minHeight: 44 }}
                        value={row.checkResult}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'checkResult', event.target.value)}
                      >
                        <option value="">Select result</option>
                        {TEMPORARY_WORKS_CHECK_RESULTS.map((result) => (
                          <option key={result} value={result}>{result}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {isScaffold ? (
                    <div style={{ ...fieldGridStyle, marginTop: 10 }}>
                      <Field label="Scaffold check / inspection status">
                        <select
                          style={{ ...inputStyle, marginBottom: 0, minHeight: 44 }}
                          value={row.scaffoldCheck}
                          disabled={disabled}
                          onChange={(event) => patch(row.key, 'scaffoldCheck', event.target.value)}
                        >
                          <option value="">Select status</option>
                          {TEMPORARY_WORKS_SCAFFOLD_CHECKS.map((check) => (
                            <option key={check} value={check}>{check}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Scaffold tag / inspection reference">
                        <input
                          style={{ ...inputStyle, marginBottom: 0 }}
                          value={row.scaffoldTag}
                          disabled={disabled}
                          onChange={(event) => patch(row.key, 'scaffoldTag', event.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    <Field label="Notes / Action">
                      <textarea
                        style={{ ...textareaStyle, marginBottom: 0, minHeight: 64 }}
                        value={row.notes}
                        disabled={disabled}
                        onChange={(event) => patch(row.key, 'notes', event.target.value)}
                        placeholder="Condition, action taken, or follow-up needed"
                        rows={2}
                      />
                    </Field>
                  </div>
                </div>
              )
            })
          )}
          <button
            type="button"
            style={addButtonStyle}
            disabled={disabled}
            onClick={() => onRowsChange([...rows, emptyTemporaryWork()])}
          >
            + Add temporary works item
          </button>
        </>
      ) : applicable === false ? (
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
          Not applicable today — no further temporary works information is required.
        </p>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
          Choose an option above to continue this section.
        </p>
      )}
    </GlassSection>
  )
}
