'use client'

/**
 * Compact daily H&S / RFI / Variation sections for Site Diary.
 */

import { GlassSection, labelStyle, inputStyle, textareaStyle } from '@/lib/premium-ui'
import {
  HS_INCIDENT_STATUSES,
  RFI_STATUSES,
  VARIATION_STATUSES,
  emptyHsIncident,
  emptyRfi,
  emptyVariation,
} from '@/lib/diary-daily-records'

const addBtnStyle = {
  width: '100%',
  minHeight: 44,
  marginTop: 4,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px dashed var(--edge)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const removeBtnStyle = {
  display: 'block',
  marginBottom: 10,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'color-mix(in srgb, var(--danger, #E5484D) 75%, var(--text))',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const entryWrapStyle = {
  marginBottom: 14,
  paddingBottom: 14,
  borderBottom: '1px solid color-mix(in srgb, var(--edge) 80%, transparent)',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 10,
  marginBottom: 10,
}

const emptyHintStyle = {
  margin: '0 0 10px',
  fontSize: 13,
  lineHeight: 1.4,
  color: 'var(--text-2)',
}

function FieldLabel({ children }) {
  return <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>{children}</label>
}

function StatusSelect({ value, options, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ ...inputStyle, marginBottom: 0, minHeight: 44 }}
    >
      {options.map((status) => (
        <option key={status} value={status}>{status}</option>
      ))}
    </select>
  )
}

/**
 * @param {{
 *   accent: string,
 *   disabled?: boolean,
 *   hsIncidents: object[],
 *   rfis: object[],
 *   variations: object[],
 *   onHsChange: (rows: object[]) => void,
 *   onRfisChange: (rows: object[]) => void,
 *   onVariationsChange: (rows: object[]) => void,
 * }} props
 */
export function DiaryDailyRecordSections({
  accent,
  disabled = false,
  hsIncidents = [],
  rfis = [],
  variations = [],
  onHsChange,
  onRfisChange,
  onVariationsChange,
}) {
  const patchHs = (key, field, value) => {
    onHsChange(hsIncidents.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }
  const patchRfi = (key, field, value) => {
    onRfisChange(rfis.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }
  const patchVariation = (key, field, value) => {
    onVariationsChange(variations.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  return (
    <>
      <GlassSection title="H&S Incidents / Observations" accent={accent}>
        {hsIncidents.length === 0 ? (
          <p style={emptyHintStyle}>No H&S items recorded today.</p>
        ) : (
          hsIncidents.map((row) => (
            <div key={row.key} style={entryWrapStyle}>
              <button
                type="button"
                style={removeBtnStyle}
                disabled={disabled}
                onClick={() => onHsChange(hsIncidents.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
              <FieldLabel>Description</FieldLabel>
              <textarea
                style={{ ...textareaStyle, marginBottom: 10, minHeight: 64 }}
                value={row.description}
                disabled={disabled}
                onChange={(e) => patchHs(row.key, 'description', e.target.value)}
                placeholder="What happened / what was observed"
                rows={2}
              />
              <div style={gridStyle}>
                <div>
                  <FieldLabel>Action taken (optional)</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.actionTaken}
                    disabled={disabled}
                    onChange={(e) => patchHs(row.key, 'actionTaken', e.target.value)}
                    placeholder="Immediate response"
                  />
                </div>
                <div>
                  <FieldLabel>Assigned to (optional)</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.assignedTo}
                    disabled={disabled}
                    onChange={(e) => patchHs(row.key, 'assignedTo', e.target.value)}
                    placeholder="Responsible party"
                  />
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <StatusSelect
                    value={row.status}
                    options={HS_INCIDENT_STATUSES}
                    disabled={disabled}
                    onChange={(v) => patchHs(row.key, 'status', v)}
                  />
                </div>
              </div>
            </div>
          ))
        )}
        <button
          type="button"
          style={addBtnStyle}
          disabled={disabled}
          onClick={() => onHsChange([...hsIncidents, emptyHsIncident()])}
        >
          + Add H&S item
        </button>
      </GlassSection>

      <GlassSection title="RFIs" accent={accent}>
        {rfis.length === 0 ? (
          <p style={emptyHintStyle}>No RFIs recorded today.</p>
        ) : (
          rfis.map((row) => (
            <div key={row.key} style={entryWrapStyle}>
              <button
                type="button"
                style={removeBtnStyle}
                disabled={disabled}
                onClick={() => onRfisChange(rfis.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
              <div style={gridStyle}>
                <div>
                  <FieldLabel>RFI number / reference</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.reference}
                    disabled={disabled}
                    onChange={(e) => patchRfi(row.key, 'reference', e.target.value)}
                    placeholder="e.g. RFI-014"
                  />
                </div>
                <div>
                  <FieldLabel>Raised to / assigned to</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.raisedTo}
                    disabled={disabled}
                    onChange={(e) => patchRfi(row.key, 'raisedTo', e.target.value)}
                    placeholder="Recipient"
                  />
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <StatusSelect
                    value={row.status}
                    options={RFI_STATUSES}
                    disabled={disabled}
                    onChange={(v) => patchRfi(row.key, 'status', v)}
                  />
                </div>
              </div>
              <FieldLabel>Description / query</FieldLabel>
              <textarea
                style={{ ...textareaStyle, marginBottom: 0, minHeight: 64 }}
                value={row.description}
                disabled={disabled}
                onChange={(e) => patchRfi(row.key, 'description', e.target.value)}
                placeholder="Short query"
                rows={2}
              />
            </div>
          ))
        )}
        <button
          type="button"
          style={addBtnStyle}
          disabled={disabled}
          onClick={() => onRfisChange([...rfis, emptyRfi()])}
        >
          + Add RFI
        </button>
      </GlassSection>

      <GlassSection title="Variations" accent={accent}>
        {variations.length === 0 ? (
          <p style={emptyHintStyle}>No variations recorded today.</p>
        ) : (
          variations.map((row) => (
            <div key={row.key} style={entryWrapStyle}>
              <button
                type="button"
                style={removeBtnStyle}
                disabled={disabled}
                onClick={() => onVariationsChange(variations.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
              <div style={gridStyle}>
                <div>
                  <FieldLabel>Variation number / reference</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.reference}
                    disabled={disabled}
                    onChange={(e) => patchVariation(row.key, 'reference', e.target.value)}
                    placeholder="e.g. VO-003"
                  />
                </div>
                <div>
                  <FieldLabel>Requested / instructed by (optional)</FieldLabel>
                  <input
                    style={{ ...inputStyle, marginBottom: 0 }}
                    value={row.instructedBy}
                    disabled={disabled}
                    onChange={(e) => patchVariation(row.key, 'instructedBy', e.target.value)}
                    placeholder="Client / architect / PM"
                  />
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <StatusSelect
                    value={row.status}
                    options={VARIATION_STATUSES}
                    disabled={disabled}
                    onChange={(v) => patchVariation(row.key, 'status', v)}
                  />
                </div>
              </div>
              <FieldLabel>Short description</FieldLabel>
              <textarea
                style={{ ...textareaStyle, marginBottom: 0, minHeight: 64 }}
                value={row.description}
                disabled={disabled}
                onChange={(e) => patchVariation(row.key, 'description', e.target.value)}
                placeholder="What changed"
                rows={2}
              />
            </div>
          ))
        )}
        <button
          type="button"
          style={addBtnStyle}
          disabled={disabled}
          onClick={() => onVariationsChange([...variations, emptyVariation()])}
        >
          + Add variation
        </button>
      </GlassSection>
    </>
  )
}
