'use client'

import { hoursFromSignInOut } from '@/lib/labour-from-register'
import { labelStyle } from '@/lib/premium-ui'

const cell = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 8px',
  borderRadius: 8,
  border: '1px solid var(--edge)',
  background: 'var(--ink)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'inherit',
}

function statusLabel(status) {
  if (status === 'match') return null
  if (status === 'missing') return 'No date'
  if (status === 'other') return 'Other date'
  return null
}

/**
 * Per-operative OCR review — edit times (hours recalculate in app code), include/exclude, add/remove.
 */
export function SignInOperativeReview({
  operatives,
  onChange,
  onApply,
  onRetry,
  warnings = [],
  reportDate,
  applying = false,
  disabled = false,
}) {
  const list = Array.isArray(operatives) ? operatives : []

  const updateRow = (id, patch) => {
    onChange(
      list.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if ('time_in' in patch || 'time_out' in patch) {
          next.hours = hoursFromSignInOut(next.time_in, next.time_out)
        }
        return next
      }),
    )
  }

  const removeRow = (id) => {
    onChange(list.filter((row) => row.id !== id))
  }

  const addRow = () => {
    onChange([
      ...list,
      {
        id: `manual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        person_name: '',
        trade: '',
        company: '',
        work_date: reportDate || null,
        time_in: '',
        time_out: '',
        hours: null,
        dateStatus: 'match',
        included: true,
      },
    ])
  }

  const includedCount = list.filter((r) => r.included !== false).length

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Review extracted operatives
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
        Hours are calculated from sign-in / sign-out only. Edit times to recalculate. Uncheck rows you do not want in the labour summary.
      </p>

      {warnings?.length > 0 && (
        <ul style={{ margin: '0 0 12px', padding: '10px 12px 10px 28px', borderRadius: 10, border: '1px solid rgba(245,166,35,0.45)', background: 'rgba(245,166,35,0.08)', color: '#F5A623', fontSize: 12, lineHeight: 1.45 }}>
          {warnings.map((w) => (
            <li key={w} style={{ marginBottom: 4 }}>{w}</li>
          ))}
        </ul>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--edge)', borderRadius: 10, background: 'var(--plate)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th style={{ padding: '8px 6px', width: 36 }} />
              <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600 }}>Trade</th>
              <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600 }}>Company</th>
              <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>In</th>
              <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Out</th>
              <th style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--text-2)', fontWeight: 600, width: 64 }}>Hrs</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((row) => {
              const badge = statusLabel(row.dateStatus)
              return (
                <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', opacity: row.included === false ? 0.55 : 1 }}>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={row.included !== false}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.id, { included: e.target.checked })}
                      aria-label={`Include ${row.person_name || 'operative'}`}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      style={cell}
                      value={row.person_name || ''}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.id, { person_name: e.target.value })}
                      placeholder="Name"
                    />
                    {badge && (
                      <div style={{ marginTop: 4, fontSize: 10, color: '#F5A623', letterSpacing: '0.04em' }}>
                        {badge}{row.work_date ? ` · ${row.work_date}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input style={cell} value={row.trade || ''} disabled={disabled} onChange={(e) => updateRow(row.id, { trade: e.target.value })} placeholder="Trade" />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input style={cell} value={row.company || ''} disabled={disabled} onChange={(e) => updateRow(row.id, { company: e.target.value })} placeholder="Company" />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input style={cell} value={row.time_in || ''} disabled={disabled} onChange={(e) => updateRow(row.id, { time_in: e.target.value })} placeholder="07:00" />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input style={cell} value={row.time_out || ''} disabled={disabled} onChange={(e) => updateRow(row.id, { time_out: e.target.value })} placeholder="16:00" />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                    {row.hours == null ? '—' : row.hours}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove operative"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                        padding: '4px 6px',
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          style={{
            ...labelStyle,
            margin: 0,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px dashed var(--edge)',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: 'pointer',
            textTransform: 'none',
            letterSpacing: '0.02em',
            fontSize: 12,
          }}
        >
          + Add operative
        </button>
        {typeof onRetry === 'function' && (
          <button
            type="button"
            disabled={disabled || applying}
            onClick={onRetry}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--edge)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Retry scan
          </button>
        )}
        <button
          type="button"
          disabled={disabled || applying || includedCount === 0}
          onClick={onApply}
          style={{
            marginLeft: 'auto',
            padding: '9px 14px',
            borderRadius: 8,
            border: '1px solid color-mix(in srgb, var(--action) 55%, transparent)',
            background: 'color-mix(in srgb, var(--action) 18%, transparent)',
            color: 'var(--text)',
            cursor: includedCount === 0 ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {applying ? 'Applying…' : `Apply ${includedCount} to labour summary`}
        </button>
      </div>
    </div>
  )
}
