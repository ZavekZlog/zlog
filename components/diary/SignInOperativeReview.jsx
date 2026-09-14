'use client'

import { useState } from 'react'
import { countSignInTradeHoursReviewRows } from '@/lib/labour-from-register'
import {
  addSignInTradeHoursRow,
  formatSignInTradeHoursReviewStatus,
  parseSignInTradeHoursInput,
  renameSignInTradeHoursRow,
  setSignInTradeHoursRowHours,
  totalSignInTradeHoursReview,
} from '@/lib/sign-in-trade-hours-review'

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

/**
 * Editable Trade + Hours review of Sign-in OCR.
 * Underlying OCR operatives stay in parent state; this edits the reviewed summary only.
 */
export function SignInOperativeReview({
  reviewRows = [],
  otherDateCount = 0,
  onReviewRowsChange,
  onApply,
  warnings = [],
  reportDate: _reportDate,
  applying = false,
  appliedSaved = false,
  disabled = false,
  applyError = '',
  applyNotice = '',
  /** 'claude' | 'openai' | null — Apply is no longer provider-gated. */
  ocrProvider: _ocrProvider = null,
  applyEnabled = true,
}) {
  const rows = Array.isArray(reviewRows) ? reviewRows : []
  const { resolvedTradeCount, needsReviewCount } = countSignInTradeHoursReviewRows(rows)
  const applyBlocked = applyEnabled === false
  const applyNeedsReviewBlocked = needsReviewCount > 0
  const showApplyControl = !applyBlocked
  const applyStatusLine = formatSignInTradeHoursReviewStatus(resolvedTradeCount, needsReviewCount)
  const totalsHours = totalSignInTradeHoursReview(rows)
  const totalsWorkers = rows.reduce(
    (sum, row) => sum + (Number.isFinite(Number(row?.workers)) ? Math.trunc(Number(row.workers)) : 0),
    0,
  )
  const [hoursDraftByKey, setHoursDraftByKey] = useState({})

  const emit = (nextRows) => {
    if (typeof onReviewRowsChange === 'function') onReviewRowsChange(nextRows)
  }

  const handleTradeBlur = (rowKey, value) => {
    emit(renameSignInTradeHoursRow(rows, rowKey, value))
  }

  const handleHoursCommit = (rowKey, raw) => {
    const parsed = parseSignInTradeHoursInput(raw)
    if (!parsed.ok && String(raw ?? '').trim() && String(raw).trim() !== '—') {
      // Invalid entry: revert draft to current reviewed value; do not accept.
      setHoursDraftByKey((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })
      return
    }
    emit(setSignInTradeHoursRowHours(rows, rowKey, raw))
    setHoursDraftByKey((prev) => {
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
  }

  const handleApply = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.nativeEvent?.stopImmediatePropagation === 'function') {
      event.nativeEvent.stopImmediatePropagation()
    }
    if (
      applyBlocked
      || applyNeedsReviewBlocked
      || disabled
      || applying
      || appliedSaved
      || rows.length === 0
      || resolvedTradeCount === 0
    ) {
      return
    }
    if (typeof onApply === 'function') onApply(event)
  }

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
        Labour from sign-in sheet
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
        Labour is summarised by trade for this diary date. Correct any trade or hours if needed.
        The sign-in sheet photo is the source record.
      </p>

      {warnings?.length > 0 && (
        <ul
          style={{
            margin: '0 0 12px',
            padding: '10px 12px 10px 28px',
            borderRadius: 10,
            border: '1px solid rgba(245,166,35,0.45)',
            background: 'rgba(245,166,35,0.08)',
            color: '#F5A623',
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {warnings.map((w) => (
            <li key={w} style={{ marginBottom: 4 }}>
              {w}
            </li>
          ))}
        </ul>
      )}

      {otherDateCount > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
          {otherDateCount} row{otherDateCount === 1 ? '' : 's'} from another date are not included
          in these totals.
        </p>
      )}

      <div
        style={{
          border: '1px solid var(--edge)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--plate)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px)',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--edge)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-2)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span>Trade</span>
          <span style={{ textAlign: 'right' }}>Workers</span>
          <span style={{ textAlign: 'right' }}>Hours on site</span>
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, padding: '12px', fontSize: 13, color: 'var(--text-2)' }}>
            No labour for this diary date was read from the sheet. Add a trade if needed.
          </p>
        ) : (
          rows.map((t) => {
            const hoursDraft =
              hoursDraftByKey[t.key] !== undefined
                ? hoursDraftByKey[t.key]
                : t.hoursComplete && t.hours != null
                  ? String(t.hours)
                  : ''
            return (
              <div
                key={t.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px)',
                  gap: 8,
                  padding: '10px 12px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  alignItems: 'start',
                }}
              >
                <div>
                  <input
                    style={{ ...cell, marginBottom: 0, fontWeight: 600 }}
                    value={t.trade || ''}
                    disabled={disabled}
                    aria-label="Trade"
                    onChange={(e) => {
                      const next = e.target.value
                      emit(
                        rows.map((r) =>
                          r.key === t.key ? { ...r, trade: next } : r,
                        ),
                      )
                    }}
                    onBlur={(e) => handleTradeBlur(t.key, e.target.value)}
                    placeholder="Trade"
                  />
                  {t.needsReview && !t.hoursComplete ? (
                    <p
                      role="status"
                      style={{ margin: '4px 0 0', fontSize: 12, color: '#F5A623', lineHeight: 1.4 }}
                    >
                      Needs review
                    </p>
                  ) : null}
                </div>
                <div
                  aria-label={`Workers for ${t.trade || 'trade'}`}
                  style={{
                    paddingTop: 8,
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  {Number.isFinite(Number(t.workers)) ? Math.trunc(Number(t.workers)) : 0}
                </div>
                <div>
                  <input
                    style={{ ...cell, marginBottom: 0, textAlign: 'right', fontWeight: 600 }}
                    value={hoursDraft}
                    disabled={disabled}
                    inputMode="decimal"
                    aria-label={`Hours on site for ${t.trade || 'trade'}`}
                    placeholder="—"
                    onChange={(e) => {
                      const next = e.target.value
                      setHoursDraftByKey((prev) => ({ ...prev, [t.key]: next }))
                    }}
                    onBlur={(e) => handleHoursCommit(t.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                  />
                </div>
              </div>
            )
          })
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px)',
            gap: 8,
            padding: '10px 12px',
            borderTop: '1px solid var(--edge)',
            background: 'var(--ink)',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Total
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
            {totalsWorkers}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {totalsHours.toFixed(1)} hrs
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => emit(addSignInTradeHoursRow(rows))}
        style={{
          marginTop: 10,
          width: '100%',
          minHeight: 44,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px dashed var(--edge)',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        + Add trade
      </button>

      {showApplyControl ? (
        <div style={{ marginTop: 12 }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              lineHeight: 1.45,
            }}
          >
            {applyStatusLine}
          </p>
          {applyNeedsReviewBlocked ? (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Resolve the item marked for review before applying.
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              form="zlog-labour-ocr-apply-disconnected"
              disabled={
                disabled
                || applying
                || appliedSaved
                || rows.length === 0
                || resolvedTradeCount === 0
                || applyNeedsReviewBlocked
              }
              onClick={handleApply}
              style={{
                marginLeft: 'auto',
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid color-mix(in srgb, var(--action) 55%, transparent)',
                background: 'color-mix(in srgb, var(--action) 18%, transparent)',
                color: 'var(--text)',
                cursor:
                  disabled
                  || applying
                  || appliedSaved
                  || rows.length === 0
                  || resolvedTradeCount === 0
                  || applyNeedsReviewBlocked
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {applying
                ? 'Applying…'
                : appliedSaved
                  ? '✓ Applied and saved'
                  : `Apply ${resolvedTradeCount} trade${resolvedTradeCount === 1 ? '' : 's'} to labour summary`}
            </button>
          </div>
        </div>
      ) : null}
      {applyError ? (
        <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#ff6b6b', lineHeight: 1.45 }}>
          {applyError}
        </p>
      ) : null}
      {applyNotice && !applyError && showApplyControl ? (
        <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
          {applyNotice}
        </p>
      ) : null}
    </div>
  )
}
