'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { countSignInTradeHoursReviewRows } from '@/lib/labour-from-register'
import {
  addSignInTradeHoursRow,
  formatSignInOperativeLabourLine,
  formatSignInTradeHoursReviewStatus,
  operativesForSignInTradeReviewRow,
  parseSignInTradeHoursInput,
  parseSignInTradeWorkersInput,
  renameSignInTradeHoursRow,
  removeManualSignInTradeHoursRow,
  setSignInTradeHoursRowHours,
  setSignInTradeHoursRowWorkers,
  formatLabourHoursForDisplay,
  scanDerivedSignInTradeHoursReviewRow,
  signInAddTradeClickShouldAddRow,
  signInAddTradePeakMovementPx,
  signInAddTradeShouldActivateAfterPointerUp,
  signInAddTradeUsesTapUpActivation,
  totalSignInTradeHoursReview,
  signInTradeReviewRowPeoplePanelAnchor,
  resolveOpenAdjustPeopleRowKey,
  signInTradeReviewRowsPresenceKey,
  shouldClearPeoplePanelAnchor,
} from '@/lib/sign-in-trade-hours-review'

/** User-facing Labour review must not surface other-date exclusion as a warning. */
function isOtherDateLabourScanWarning(message) {
  return /dated differently from/i.test(String(message ?? ''))
}

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
  scanOperatives = [],
  onReviewRowsChange,
  onOperativeLabourExclusion,
  onOperativeMoveToVisitors,
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
  const rowsRef = useRef(rows)
  const suppressAddTradeClickRef = useRef(false)
  const addTradeTouchGestureActiveRef = useRef(false)
  const addTradePendingPointerRef = useRef(null)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  const visibleWarnings = (Array.isArray(warnings) ? warnings : []).filter(
    (w) => !isOtherDateLabourScanWarning(w),
  )
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
  const [workersDraftByKey, setWorkersDraftByKey] = useState({})
  const [adjustPeopleRowKey, setAdjustPeopleRowKey] = useState(null)
  const [peoplePanelAnchor, setPeoplePanelAnchor] = useState(null)
  const operatives = Array.isArray(scanOperatives) ? scanOperatives : []
  const rowsPresenceKey = signInTradeReviewRowsPresenceKey(rows)
  if (shouldClearPeoplePanelAnchor(peoplePanelAnchor, rowsPresenceKey)) {
    setPeoplePanelAnchor(null)
  }
  const openAdjustPeopleRowKey = resolveOpenAdjustPeopleRowKey(
    adjustPeopleRowKey,
    rows,
    peoplePanelAnchor,
    rowsPresenceKey,
  )

  const emit = (nextRows) => {
    if (typeof onReviewRowsChange === 'function') onReviewRowsChange(nextRows)
  }

  const handleTradeBlur = (rowKey, value) => {
    emit(renameSignInTradeHoursRow(rows, rowKey, value))
  }

  const handleRemoveManualRow = (rowKey) => {
    const row = rows.find((r) => r.key === rowKey)
    if (!row || scanDerivedSignInTradeHoursReviewRow(row)) return
    emit(removeManualSignInTradeHoursRow(rows, rowKey))
    setWorkersDraftByKey((prev) => {
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
    setHoursDraftByKey((prev) => {
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
    if (adjustPeopleRowKey === rowKey || openAdjustPeopleRowKey === rowKey) {
      setAdjustPeopleRowKey(null)
      setPeoplePanelAnchor(null)
    }
  }

  const handleWorkersCommit = (rowKey, raw) => {
    const row = rows.find((r) => r.key === rowKey)
    if (scanDerivedSignInTradeHoursReviewRow(row)) return
    const parsed = parseSignInTradeWorkersInput(raw)
    if (!parsed.ok && String(raw ?? '').trim() && String(raw).trim() !== '—') {
      setWorkersDraftByKey((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })
      return
    }
    emit(setSignInTradeHoursRowWorkers(rows, rowKey, raw))
    setWorkersDraftByKey((prev) => {
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
  }

  const handleHoursCommit = (rowKey, raw) => {
    const row = rows.find((r) => r.key === rowKey)
    if (scanDerivedSignInTradeHoursReviewRow(row)) return
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

  const clearAddTradePendingPointer = useCallback(() => {
    const pending = addTradePendingPointerRef.current
    if (!pending) return
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerup', pending.onUp)
      window.removeEventListener('pointercancel', pending.onCancel)
      window.removeEventListener('pointermove', pending.onMove)
    }
    addTradePendingPointerRef.current = null
  }, [])

  useEffect(() => () => clearAddTradePendingPointer(), [clearAddTradePendingPointer])

  const appendAddTradeRow = useCallback(() => {
    if (disabled) return
    if (typeof onReviewRowsChange === 'function') {
      onReviewRowsChange(addSignInTradeHoursRow(rowsRef.current))
    }
  }, [disabled, onReviewRowsChange])

  const handleAddTradeClick = (event) => {
    if (disabled) return
    const suppress = suppressAddTradeClickRef.current
    if (suppress) {
      suppressAddTradeClickRef.current = false
      event.preventDefault()
      return
    }
    const pointerType = event.nativeEvent?.pointerType
    if (
      !signInAddTradeClickShouldAddRow({
        pointerType,
        suppressSyntheticClick: false,
        touchGestureActive: addTradeTouchGestureActiveRef.current,
      })
    ) {
      event.preventDefault()
      return
    }
    appendAddTradeRow()
  }

  const handleAddTradePointerDown = (event) => {
    if (!signInAddTradeUsesTapUpActivation(event.pointerType, disabled)) return
    if (typeof window === 'undefined') return
    clearAddTradePendingPointer()
    addTradeTouchGestureActiveRef.current = true
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    let maxMovementPx = 0
    const finish = (ev, cancelled) => {
      if (ev.pointerId !== pointerId) return
      clearAddTradePendingPointer()
      addTradeTouchGestureActiveRef.current = false
      if (!signInAddTradeUsesTapUpActivation(ev.pointerType, disabled)) return
      if (
        !cancelled
        && signInAddTradeShouldActivateAfterPointerUp({
          startX,
          startY,
          endX: ev.clientX,
          endY: ev.clientY,
          cancelled: false,
          maxMovementPx,
        })
      ) {
        suppressAddTradeClickRef.current = true
        appendAddTradeRow()
      } else {
        suppressAddTradeClickRef.current = true
      }
    }
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      maxMovementPx = signInAddTradePeakMovementPx(
        startX,
        startY,
        ev.clientX,
        ev.clientY,
        maxMovementPx,
      )
    }
    const onUp = (ev) => finish(ev, false)
    const onCancel = (ev) => finish(ev, true)
    addTradePendingPointerRef.current = { onUp, onCancel, onMove }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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
        Labour from Attendance Register
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
        Use ⋯ to correct scan errors or separate visitors from production workers.
      </p>

      {visibleWarnings.length > 0 && (
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
          {visibleWarnings.map((w) => (
            <li key={w} style={{ marginBottom: 4 }}>
              {w}
            </li>
          ))}
        </ul>
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
            gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px) 36px',
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
          <span aria-hidden="true" />
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, padding: '12px', fontSize: 13, color: 'var(--text-2)' }}>
            No labour for this diary date was read from the register. Add a trade if needed.
          </p>
        ) : (
          rows.map((t) => {
            const workersDraft =
              workersDraftByKey[t.key] !== undefined
                ? workersDraftByKey[t.key]
                : Number.isFinite(Number(t.workers))
                  ? String(Math.trunc(Number(t.workers)))
                  : '0'
            const hoursDraft =
              hoursDraftByKey[t.key] !== undefined
                ? hoursDraftByKey[t.key]
                : t.hoursComplete && t.hours != null
                  ? String(t.hours)
                  : ''
            const rowIds = Array.isArray(t.rowIds) ? t.rowIds : []
            const scanDerived = scanDerivedSignInTradeHoursReviewRow(t)
            const canAdjustPeople = rowIds.length > 0
            const canRemoveManualRow = !scanDerived
            const bucketOperatives = canAdjustPeople
              ? operativesForSignInTradeReviewRow(operatives, rowIds).filter(
                  (row) => row && row.movedToVisitors !== true,
                )
              : []
            const adjustOpen = openAdjustPeopleRowKey === t.key
            return (
              <div key={t.key}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px) 36px',
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
                <div>
                  <input
                    style={{ ...cell, marginBottom: 0, textAlign: 'right', fontWeight: 600 }}
                    value={workersDraft}
                    disabled={disabled}
                    readOnly={scanDerived}
                    tabIndex={scanDerived ? -1 : undefined}
                    inputMode="numeric"
                    aria-label={`Workers for ${t.trade || 'trade'}`}
                    aria-readonly={scanDerived ? true : undefined}
                    onChange={
                      scanDerived
                        ? undefined
                        : (e) => {
                            const next = e.target.value
                            setWorkersDraftByKey((prev) => ({ ...prev, [t.key]: next }))
                          }
                    }
                    onBlur={
                      scanDerived
                        ? undefined
                        : (e) => handleWorkersCommit(t.key, e.target.value)
                    }
                    onKeyDown={
                      scanDerived
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }
                    }
                  />
                </div>
                <div>
                  <input
                    style={{ ...cell, marginBottom: 0, textAlign: 'right', fontWeight: 600 }}
                    value={
                      scanDerived && t.hoursComplete && t.hours != null
                        ? formatLabourHoursForDisplay(t.hours)
                        : hoursDraft
                    }
                    disabled={disabled}
                    readOnly={scanDerived}
                    tabIndex={scanDerived ? -1 : undefined}
                    inputMode="decimal"
                    aria-label={`Hours on site for ${t.trade || 'trade'}`}
                    aria-readonly={scanDerived ? true : undefined}
                    placeholder="—"
                    onChange={
                      scanDerived
                        ? undefined
                        : (e) => {
                            const next = e.target.value
                            setHoursDraftByKey((prev) => ({ ...prev, [t.key]: next }))
                          }
                    }
                    onBlur={
                      scanDerived
                        ? undefined
                        : (e) => handleHoursCommit(t.key, e.target.value)
                    }
                    onKeyDown={
                      scanDerived
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }
                    }
                  />
                </div>
                <div style={{ position: 'relative', paddingTop: 4 }}>
                  {canAdjustPeople ? (
                    <>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`People on ${t.trade || 'this trade'}`}
                        aria-expanded={adjustOpen}
                        onClick={() => {
                          setAdjustPeopleRowKey((prev) => {
                            if (prev === t.key) {
                              setPeoplePanelAnchor(null)
                              return null
                            }
                            setPeoplePanelAnchor({
                              rowKey: t.key,
                              anchor: signInTradeReviewRowPeoplePanelAnchor(t),
                              rowsPresenceKey,
                            })
                            return t.key
                          })
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid var(--edge)',
                          background: 'var(--ink)',
                          color: 'var(--text-2)',
                          fontSize: 18,
                          lineHeight: 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          padding: 0,
                        }}
                      >
                        ⋯
                      </button>
                    </>
                  ) : canRemoveManualRow ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label="Remove trade row"
                      onClick={() => handleRemoveManualRow(t.key)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid var(--edge)',
                        background: 'var(--ink)',
                        color: 'var(--text-2)',
                        fontSize: 11,
                        fontWeight: 600,
                        lineHeight: 1.1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        padding: '2px 4px',
                        touchAction: 'manipulation',
                      }}
                    >
                      Del
                    </button>
                  ) : null}
                </div>
              </div>
              {adjustOpen && bucketOperatives.length > 0 ? (
                <div
                  style={{
                    margin: '0 12px 10px',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--edge)',
                    background: 'var(--ink)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text)',
                    }}
                  >
                    People on {t.trade || 'this trade'}
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {bucketOperatives.map((op) => {
                      const excluded = op.excludedFromLabour === true
                      const line = formatSignInOperativeLabourLine(op, t.trade, {
                        includeTradeSuffix: false,
                      })
                      return (
                        <li
                          key={String(op.id)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            padding: '8px 0',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: excluded ? 'var(--text-2)' : 'var(--text)',
                              lineHeight: 1.45,
                            }}
                          >
                            {line}
                            {excluded ? ' · Excluded from labour' : ''}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 8,
                              alignItems: 'stretch',
                              width: '100%',
                            }}
                          >
                            <button
                              type="button"
                              disabled={disabled || excluded}
                              onClick={() => {
                                if (typeof onOperativeMoveToVisitors !== 'function') return
                                onOperativeMoveToVisitors({
                                  reviewRowKey: t.key,
                                  operativeId: op.id,
                                  tradeLabel: t.trade || '',
                                })
                                const remainingAfterMove = bucketOperatives.filter(
                                  (row) => String(row.id) !== String(op.id),
                                )
                                if (remainingAfterMove.length <= 1) {
                                  setPeoplePanelAnchor(null)
                                  setAdjustPeopleRowKey(null)
                                }
                              }}
                              style={{
                                flex: '1 1 140px',
                                minHeight: 44,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--edge)',
                                background: 'var(--plate)',
                                color: 'var(--text)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: disabled || excluded ? 'not-allowed' : 'pointer',
                                touchAction: 'manipulation',
                              }}
                            >
                              Move to Visitors
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                if (typeof onOperativeLabourExclusion !== 'function') return
                                onOperativeLabourExclusion({
                                  reviewRowKey: t.key,
                                  operativeId: op.id,
                                  exclude: !excluded,
                                })
                                if (excluded) return
                                const remaining = bucketOperatives.filter(
                                  (row) =>
                                    String(row.id) !== String(op.id)
                                    && row.excludedFromLabour !== true,
                                )
                                if (remaining.length <= 1) {
                                  setPeoplePanelAnchor(null)
                                  setAdjustPeopleRowKey(null)
                                }
                              }}
                              style={{
                                flex: '1 1 140px',
                                minHeight: 44,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--edge)',
                                background: 'var(--plate)',
                                color: 'var(--text)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                touchAction: 'manipulation',
                              }}
                            >
                              {excluded ? 'Include in labour' : 'Exclude from labour'}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setPeoplePanelAnchor(null)
                      setAdjustPeopleRowKey(null)
                    }}
                    style={{
                      marginTop: 4,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-2)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Close
                  </button>
                </div>
              ) : null}
              </div>
            )
          })
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px) 36px',
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              textAlign: 'right',
              lineHeight: 1.35,
            }}
          >
            {totalsWorkers}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              textAlign: 'right',
              lineHeight: 1.35,
            }}
          >
            {formatLabourHoursForDisplay(totalsHours)} hrs
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onPointerDown={handleAddTradePointerDown}
        onClick={handleAddTradeClick}
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
          touchAction: 'pan-y',
          WebkitTapHighlightColor: 'transparent',
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
                  : `Apply ${resolvedTradeCount} trade${resolvedTradeCount === 1 ? '' : 's'} to Labour Attendance Summary`}
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
