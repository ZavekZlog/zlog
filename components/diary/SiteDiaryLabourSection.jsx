'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { GlassSection, SecondaryButton, DestructiveButton } from '@/lib/premium-ui'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { displayLabourSummaryRow } from '@/lib/site-diary-labour-form'
import {
  formatLabourHoursForDisplay,
  formatSignInOperativeLabourLine,
  operativesForSignInTradeReviewRow,
  reviewPanelActionGuardUntil,
  reviewPanelActionIsGuarded,
} from '@/lib/sign-in-trade-hours-review'

const labourSummaryDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function labourSummaryDateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return String(value ?? '')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return labourSummaryDateFormat.format(date)
}

function scanSummaryRowHasPerson(row) {
  if (!row || typeof row !== 'object') return false
  const workers = Number(row.headcount)
  if (Number.isFinite(workers) && workers > 0) return true
  return Array.isArray(row.rowIds) && row.rowIds.length > 0
}

export function SiteDiaryLabourSection({
  accent,
  reportDate,
  labourMode,
  setLabourMode,
  setScanError,
  scanLoading,
  scanRescanning = false,
  scanRescanRevealToken = 0,
  scanError,
  scanApplyError,
  scanApplyNotice,
  scanApplySaving,
  scanApplySaved,
  scanWarnings,
  scanOperatives,
  scanTradeHoursReview,
  scanTradeHoursReviewReady,
  scanOcrProvider,
  scanApplyEnabled,
  scanLastFile,
  scanSheetPreview,
  scanSignInPreviewLoadError,
  scanSignInEvidenceLoading = false,
  retrySignInEvidenceLoad,
  signInSheetPickerKey,
  handleSignInSheetFiles,
  applyScanOperativesToLabour,
  saveScanLabourSummary,
  scanSummaryLocked = false,
  scanSummaryNotice = '',
  scanSummaryError = '',
  scanSummarySaving = false,
  retrySignInScan,
  confirmScanRescan,
  dismissScanRescanWarning,
  scanRescanWarning = false,
  markScanSummaryDirty,
  removeSignInSheetEvidence,
  startManualLabour,
  manualLabourEditing = false,
  resumeManualLabourEdit,
  saveManualLabourChanges,
  cancelManualLabourEdit,
  manualLabourSaveError = '',
  manualLabourSaving = false,
  hasSignInSheetEvidenceOnForm,
  handleScanTradeHoursReviewChange,
  handleOperativeLabourExclusion,
  handleOperativeMoveToVisitors,
  labourRows,
  labourTotals,
  updateLabour,
  emptyLabour,
  addRowButtonStyle,
  cellInputStyle,
  removeRowStyle: _removeRowStyle,
  dismissAutosaveSuccessClaim,
  invalidatePreparedSharePdf,
  setLabourRows,
}) {
  const [manualRowMenuOpenKey, setManualRowMenuOpenKey] = useState(null)
  const [peopleOpenKey, setPeopleOpenKey] = useState(null)
  const panelActionGuardUntilRef = useRef(0)
  const armReviewPanelActionGuard = () => {
    panelActionGuardUntilRef.current = reviewPanelActionGuardUntil(Date.now())
  }
  const reviewPanelActionGuarded = () => (
    reviewPanelActionIsGuarded(panelActionGuardUntilRef.current, Date.now())
  )

  const manualEditFieldStyle = manualLabourEditing
    ? {
        ...cellInputStyle,
        background: 'rgba(255,255,255,0.06)',
        borderColor: `rgba(${accent}, 0.38)`,
        boxShadow: `inset 0 0 0 1px rgba(${accent}, 0.14)`,
      }
    : cellInputStyle

  const handleManualEntryClick = () => {
    if (labourMode === 'manual') {
      if (!manualLabourEditing && typeof resumeManualLabourEdit === 'function') {
        resumeManualLabourEdit()
      }
      return
    }
    startManualLabour()
  }

  const labourInternalHeadingStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: '0 0 8px',
  }

  const labourAttendanceRegisterSubsectionStyle = {
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid var(--edge)',
  }

  const scanDataRows = labourRows.filter(scanSummaryRowHasPerson)
  const scanSummaryColumns = [
    'minmax(0, 1fr)',
    'minmax(0, 1fr)',
    'auto',
    'minmax(72px, 0.75fr)',
  ].join(' ')
  const needsInputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff3cd',
    color: '#1a1a1a',
    border: '1px solid #e6c200',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 14,
    fontWeight: 600,
  }
  const editScanSummaryCell = (rowKey, field) => (event) => {
    const value = event.target.value
    dismissAutosaveSuccessClaim()
    invalidatePreparedSharePdf('committed-diary-change')
    setLabourRows((rows) => rows.map((row) => {
      if (row.key !== rowKey) return row
      const needs = { ...(row.needsManualInput || {}) }
      const flag = field === 'headcount' ? 'operatives' : field
      needs[flag] = String(value).trim() === ''
      return { ...row, [field]: value, needsManualInput: needs }
    }))
    if (typeof markScanSummaryDirty === 'function') markScanSummaryDirty()
  }
  const summaryCellStyle = {
    borderRight: '1px solid #d5d5d5',
    borderBottom: '1px solid #d5d5d5',
    padding: '8px 10px',
    minWidth: 0,
    fontSize: 16,
    lineHeight: 1.3,
    background: '#ffffff',
    color: '#1a1a1a',
  }
  const summaryHeadStyle = {
    ...summaryCellStyle,
    background: '#f4f4f4',
    fontWeight: 700,
    fontSize: 13,
    borderTop: '1px solid #d5d5d5',
  }
  const scanCellStyle = {
    ...summaryCellStyle,
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  }
  const scanTotalCellStyle = {
    ...scanCellStyle,
    background: '#f5f5f5',
    fontWeight: 700,
    borderTop: '2px solid #bdbdbd',
  }
  const summaryAbsentStyle = {
    color: '#6b6b6b',
    fontStyle: 'italic',
    fontWeight: 500,
    fontSize: 16,
  }

  const scanReviewAnchorRef = useRef(null)
  useEffect(() => {
    if (!scanRescanRevealToken) return
    scanReviewAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [scanRescanRevealToken])

  return (
    <GlassSection title="Labour" accent={accent}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="zlog-secondary-btn"
          onClick={() => {
            setLabourMode('scan')
            setScanError('')
          }}
          style={{
            ...addRowButtonStyle,
            textTransform: 'none',
            letterSpacing: '0.02em',
            borderStyle: labourMode === 'scan' ? 'solid' : 'dashed',
            borderColor: labourMode === 'scan' ? `rgba(${accent}, 0.55)` : 'var(--edge)',
            color: 'var(--text)',
            boxShadow: labourMode === 'scan' ? `0 0 0 1px rgba(${accent}, 0.25)` : undefined,
          }}
        >
          Scan Attendance Register
        </button>
        <button
          type="button"
          className="zlog-secondary-btn"
          onClick={handleManualEntryClick}
          style={{
            ...addRowButtonStyle,
            textTransform: 'none',
            letterSpacing: '0.02em',
            borderStyle: labourMode === 'manual' && manualLabourEditing ? 'solid' : labourMode === 'manual' ? 'solid' : 'dashed',
            borderColor: labourMode === 'manual' ? `rgba(${accent}, 0.55)` : 'var(--edge)',
            color: 'var(--text)',
            boxShadow: labourMode === 'manual' && manualLabourEditing
              ? `0 0 0 1px rgba(${accent}, 0.25)`
              : labourMode === 'manual'
                ? `0 0 0 1px rgba(${accent}, 0.15)`
                : undefined,
          }}
        >
          Manual Entry
        </button>
      </div>

      {labourMode === 'scan' && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
            Labour is summarised by trade for this diary date. The photo is the source record.
          </p>
        </div>
      )}

      {labourMode === 'scan' && !hasSignInSheetEvidenceOnForm && (
        <div key={signInSheetPickerKey} style={{ marginBottom: 16 }}>
          <ImageSourceButtons
            onFiles={handleSignInSheetFiles}
            disabled={scanLoading}
            cameraLabel="Scan with camera"
            galleryLabel="Choose from gallery"
            hint="OCR builds trade hours from the register. The photo stays the source record."
          />
        </div>
      )}

      {labourMode === 'manual' && (
      <>
      <div
        style={{
          marginBottom: 12,
          border: manualLabourEditing
            ? `1px solid rgba(${accent}, 0.55)`
            : '1px solid var(--edge)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--plate)',
          boxShadow: manualLabourEditing ? `0 0 0 1px rgba(${accent}, 0.2)` : undefined,
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--edge)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Labour Attendance Summary · {labourSummaryDateLabel(reportDate)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {labourTotals.operatives} {labourTotals.operatives === 1 ? 'operative' : 'operatives'} · {labourTotals.hours} hrs
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: scanSummaryColumns,
            alignItems: 'stretch',
          }}
        >
          <span style={summaryHeadStyle}>Trade</span>
          <span style={summaryHeadStyle}>Company</span>
          <span style={{ ...summaryHeadStyle, textAlign: 'right' }}>Operatives</span>
          <span style={{ ...summaryHeadStyle, textAlign: 'right' }}>Total hrs (all operatives)</span>
        {labourRows.map((row) => {
          const shown = displayLabourSummaryRow(row, labourRows)
          return (
          <Fragment key={row.key}>
            {manualLabourEditing && shown.trade ? (
              <input
                style={{ ...manualEditFieldStyle, ...summaryCellStyle, marginBottom: 0, width: '100%', minWidth: 0 }}
                value={shown.trade}
                onChange={(e) => updateLabour(row.key, 'trade', e.target.value)}
                placeholder="Carpenter"
              />
            ) : (
              <span style={{ ...summaryCellStyle, fontWeight: 700 }}>
                {shown.trade ? (
                  shown.trade
                ) : (
                  <span style={summaryAbsentStyle}>Not on register</span>
                )}
              </span>
            )}
            <span style={{ ...summaryCellStyle, fontWeight: 700 }}>
              {shown.company ? (
                shown.company
              ) : (
                <span style={summaryAbsentStyle}>Not on register</span>
              )}
            </span>
            {manualLabourEditing ? (
              <input
                type="number"
                min="0"
                style={{ ...manualEditFieldStyle, ...summaryCellStyle, marginBottom: 0, width: '100%', minWidth: 0, textAlign: 'right' }}
                value={row.headcount}
                onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)}
                placeholder="4"
                aria-label="Operatives"
              />
            ) : (
              <span style={{ ...summaryCellStyle, fontWeight: 700, textAlign: 'right' }}>
                {row.headcount ?? '—'}
              </span>
            )}
            {manualLabourEditing ? (
              <div style={{ ...summaryCellStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <input
                type="number"
                min="0"
                step="0.5"
                style={{ ...manualEditFieldStyle, marginBottom: 0, width: 'auto', flex: '1 1 auto', minWidth: 0, textAlign: 'right' }}
                value={row.hours}
                onChange={(e) => updateLabour(row.key, 'hours', e.target.value)}
                placeholder="8"
                aria-label="Hours on site"
              />
              {labourRows.length > 1 ? (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Row actions"
                    aria-expanded={manualRowMenuOpenKey === row.key}
                    onClick={() => {
                      setManualRowMenuOpenKey((prev) => (prev === row.key ? null : row.key))
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
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ⋯
                  </button>
                  {manualRowMenuOpenKey === row.key ? (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        zIndex: 4,
                        marginTop: 4,
                        minWidth: 148,
                        borderRadius: 10,
                        border: '1px solid var(--edge)',
                        background: 'var(--plate)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setManualRowMenuOpenKey(null)
                          dismissAutosaveSuccessClaim()
                          invalidatePreparedSharePdf('committed-diary-change')
                          setLabourRows((rows) => rows.filter((r) => r.key !== row.key))
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        Remove row
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            ) : (
              <span style={{ ...summaryCellStyle, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {row.hours ?? '—'}
              </span>
            )}
          </Fragment>
          )
        })}
          <span style={scanTotalCellStyle}>TOTAL</span>
          <span style={scanTotalCellStyle} />
          <span style={{ ...scanTotalCellStyle, justifyContent: 'flex-end', textAlign: 'right' }}>
            {labourTotals?.operatives ?? 0}
          </span>
          <span style={{ ...scanTotalCellStyle, justifyContent: 'flex-end', textAlign: 'right' }}>
            {formatLabourHoursForDisplay(labourTotals?.hours)}
          </span>
        </div>
        <p style={{ margin: 0, padding: '8px 12px 10px', fontSize: 13, lineHeight: 1.4, color: '#6b6b6b' }}>
          Total hours on site are the combined hours of all operatives listed.
        </p>
      </div>

      {manualLabourEditing ? (
        <>
          <button type="button" style={addRowButtonStyle} onClick={() => {
            dismissAutosaveSuccessClaim()
            invalidatePreparedSharePdf('committed-diary-change')
            setLabourRows((rows) => [...rows, emptyLabour()])
          }}>
            + Add attendance row
          </button>
          {manualLabourSaveError ? (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#ff6b6b', lineHeight: 1.4 }}>
              {manualLabourSaveError}
            </p>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <SecondaryButton
              type="button"
              disabled={manualLabourSaving}
              onClick={saveManualLabourChanges}
            >
              {manualLabourSaving ? 'Saving…' : 'Save changes'}
            </SecondaryButton>
            <button
              type="button"
              disabled={manualLabourSaving}
              onClick={cancelManualLabourEdit}
              style={{
                padding: '8px 10px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 600,
                cursor: manualLabourSaving ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}
      </>
      )}

      {labourMode === 'scan' && scanTradeHoursReviewReady && hasSignInSheetEvidenceOnForm && (
        <div ref={scanReviewAnchorRef}>
          {scanRescanning ? (
            <p role="status" style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Scanning attendance register...
            </p>
          ) : null}
          <div
            style={{
              marginBottom: 12,
              border: '1px solid var(--edge)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--plate)',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--edge)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Labour Attendance Summary · {labourSummaryDateLabel(reportDate)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {labourTotals.operatives} {labourTotals.operatives === 1 ? 'operative' : 'operatives'} · {labourTotals.hours} hrs
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: scanSummaryColumns,
                alignItems: 'stretch',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <span style={summaryHeadStyle}>Trade</span>
              <span style={summaryHeadStyle}>Company</span>
              <span style={{ ...summaryHeadStyle, textAlign: 'right' }}>Operatives</span>
              <span style={{ ...summaryHeadStyle, textAlign: 'right' }}>Total hrs (all operatives)</span>
            {scanDataRows.map((row) => {
              const shown = displayLabourSummaryRow(row, scanDataRows)
              const needs = row.needsManualInput || {}
              const bucket = Array.isArray(row.rowIds) && row.rowIds.length > 0
                ? operativesForSignInTradeReviewRow(scanOperatives, row.rowIds).filter(
                    (op) => op && op.movedToVisitors !== true,
                  )
                : []
              const labourPeople = Math.max(0, Math.trunc(Number(row.headcount) || 0))
              const peopleOpen = peopleOpenKey === row.key && bucket.length > 0
              return (
                <Fragment key={row.key}>
                  <span style={{ ...scanCellStyle, fontWeight: 700 }}>
                      {needs.trade && !scanSummaryLocked ? (
                        <input
                          style={needsInputStyle}
                          value={row.trade || ''}
                          placeholder="Needs manual input"
                          aria-label="Trade"
                          onChange={editScanSummaryCell(row.key, 'trade')}
                        />
                      ) : needs.trade ? (
                        <span style={{ ...needsInputStyle, display: 'inline-block' }}>Needs manual input</span>
                      ) : (
                        shown.trade || <span style={summaryAbsentStyle}>Not on register</span>
                      )}
                    </span>
                  <span style={{ ...scanCellStyle, fontWeight: 700 }}>
                    {needs.company && !scanSummaryLocked ? (
                      <input
                        style={needsInputStyle}
                        value={row.company || ''}
                        placeholder="Needs manual input"
                        aria-label="Company"
                        onChange={editScanSummaryCell(row.key, 'company')}
                      />
                    ) : needs.company ? (
                      <span style={{ ...needsInputStyle, display: 'inline-block' }}>Needs manual input</span>
                    ) : (
                      shown.company || <span style={summaryAbsentStyle}>Not on register</span>
                    )}
                  </span>
                  <span style={{ ...scanCellStyle, fontWeight: 700, justifyContent: 'flex-end', gap: 8, textAlign: 'right', minWidth: 'min-content', flexWrap: 'nowrap' }}>
                    {needs.operatives && !scanSummaryLocked ? (
                      <input
                        style={{ ...needsInputStyle, textAlign: 'right' }}
                        value={row.headcount || ''}
                        placeholder="Needs manual input"
                        aria-label="Operatives"
                        inputMode="numeric"
                        onChange={editScanSummaryCell(row.key, 'headcount')}
                      />
                    ) : needs.operatives ? (
                      <span style={{ ...needsInputStyle, display: 'inline-block' }}>Needs manual input</span>
                    ) : (
                      row.headcount ?? '—'
                    )}
                    {labourPeople > 0 ? (
                      <button
                        type="button"
                        aria-label={`${labourPeople} ${labourPeople === 1 ? 'person' : 'people'} · Review`}
                        aria-expanded={peopleOpen}
                        onPointerDown={armReviewPanelActionGuard}
                        onClick={() => {
                          armReviewPanelActionGuard()
                          setPeopleOpenKey((prev) => (prev === row.key ? null : row.key))
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          flex: '0 0 auto',
                          margin: 0,
                          padding: '2px 8px',
                          border: '1px solid #d5d5d5',
                          borderRadius: 8,
                          background: '#f7f7f7',
                          color: '#1a1a1a',
                          fontSize: 13,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {labourPeople} {labourPeople === 1 ? 'person' : 'people'} · Review
                      </button>
                    ) : null}
                  </span>
                  <span style={{ ...scanCellStyle, fontWeight: 700, justifyContent: 'flex-end', textAlign: 'right' }}>
                    {needs.hours && !scanSummaryLocked ? (
                      <input
                        style={{ ...needsInputStyle, textAlign: 'right' }}
                        value={row.hours || ''}
                        placeholder="Needs manual input"
                        aria-label="Hours on site"
                        inputMode="decimal"
                        onChange={editScanSummaryCell(row.key, 'hours')}
                      />
                    ) : needs.hours ? (
                      <span style={{ ...needsInputStyle, display: 'inline-block' }}>Needs manual input</span>
                    ) : (
                      row.hours ?? '—'
                    )}
                  </span>
                {peopleOpen ? (
                  <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#ffffff', borderBottom: '1px solid #d5d5d5' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.4 }}>
                      {shown.trade ? `People on ${shown.trade}` : 'People on this register'}
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4 }}>
                      {shown.trade
                        ? 'These are the people from the register for this trade. Move visitors out of labour, or exclude someone entered in error.'
                        : 'These are the people from the register for this company. Move anyone who was visiting to the Visitors section, or exclude someone entered in error.'}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {bucket.map((op) => {
                        const excluded = op.excludedFromLabour === true
                        const line = formatSignInOperativeLabourLine(op, shown.trade, { includeTradeSuffix: false })
                        return (
                          <li
                            key={String(op.id)}
                            style={{
                              display: 'flex',
                              flexWrap: 'nowrap',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '4px 0',
                              borderTop: '1px solid #d5d5d5',
                            }}
                          >
                            <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 500, color: excluded ? '#6b6b6b' : '#1a1a1a', lineHeight: 1.3 }}>
                              {line}
                              {excluded ? ' · Excluded from labour' : ''}
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'nowrap', flex: '0 0 auto', gap: 6 }}>
                              <button
                                type="button"
                                disabled={excluded}
                                onClick={() => {
                                  if (reviewPanelActionGuarded()) return
                                  if (typeof handleOperativeMoveToVisitors !== 'function') return
                                  handleOperativeMoveToVisitors({
                                    reviewRowKey: row.reviewKey,
                                    operativeId: op.id,
                                    tradeLabel: shown.trade || '',
                                  })
                                }}
                                style={{ padding: '4px 8px', border: '1px solid #d5d5d5', borderRadius: 8, background: '#f7f7f7', color: '#1a1a1a', fontSize: 12, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', cursor: excluded ? 'not-allowed' : 'pointer' }}
                              >
                                Move to Visitors section
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (reviewPanelActionGuarded()) return
                                  if (typeof handleOperativeLabourExclusion !== 'function') return
                                  handleOperativeLabourExclusion({
                                    reviewRowKey: row.reviewKey,
                                    operativeId: op.id,
                                    exclude: !excluded,
                                  })
                                }}
                                style={{ padding: '4px 8px', border: '1px solid #d5d5d5', borderRadius: 8, background: '#f7f7f7', color: '#1a1a1a', fontSize: 12, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', cursor: 'pointer' }}
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
                      onClick={() => setPeopleOpenKey(null)}
                      style={{ marginTop: 8, minHeight: 36, padding: '6px 10px', border: '1px solid #d5d5d5', borderRadius: 8, background: '#f7f7f7', color: '#1a1a1a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Done
                    </button>
                  </div>
                ) : null}
                </Fragment>
              )
            })}
              <span style={scanTotalCellStyle}>TOTAL</span>
              <span style={scanTotalCellStyle} />
              <span style={{ ...scanTotalCellStyle, justifyContent: 'flex-end', textAlign: 'right' }}>
                {labourTotals?.operatives ?? 0}
              </span>
              <span style={{ ...scanTotalCellStyle, justifyContent: 'flex-end', textAlign: 'right' }}>
                {formatLabourHoursForDisplay(labourTotals?.hours)}
              </span>
            </div>
            <p style={{ margin: 0, padding: '8px 12px 10px', fontSize: 13, lineHeight: 1.4, color: '#6b6b6b' }}>
              Total hours on site are the combined hours of all operatives listed.
            </p>
            {scanSummaryLocked ? null : (
              <div style={{ padding: '10px 12px' }}>
                <SecondaryButton
                  type="button"
                  disabled={scanSummarySaving}
                  onClick={saveScanLabourSummary}
                >
                  {scanSummarySaving ? 'Saving…' : 'Save changes'}
                </SecondaryButton>
                {scanSummaryNotice ? (
                  <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
                    {scanSummaryNotice}
                  </p>
                ) : null}
                {scanSummaryError ? (
                  <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#ff6b6b', lineHeight: 1.4 }}>
                    {scanSummaryError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {hasSignInSheetEvidenceOnForm && (
        <div style={labourAttendanceRegisterSubsectionStyle}>
          <p style={labourInternalHeadingStyle}>Attendance Register</p>
          {scanSheetPreview && (
            // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
            <img
              src={scanSheetPreview}
              alt="Attendance register preview"
              style={{
                display: 'block',
                margin: '0 auto',
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: 'min(72vh, 420px)',
                objectFit: 'contain',
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          )}
          {!scanSheetPreview && scanSignInEvidenceLoading && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-2)' }}>
              Loading Attendance Register…
            </p>
          )}
          {!scanSheetPreview && scanSignInPreviewLoadError && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#ff6b6b' }}>
              {scanSignInPreviewLoadError}
            </p>
          )}
          {!scanSheetPreview && scanSignInPreviewLoadError && typeof retrySignInEvidenceLoad === 'function' ? (
            <SecondaryButton
              type="button"
              disabled={scanSignInEvidenceLoading || scanLoading}
              onClick={() => {
                void retrySignInEvidenceLoad()
              }}
              style={{ marginBottom: 8 }}
            >
              Try again
            </SecondaryButton>
          ) : null}
          {scanLoading && !scanRescanning && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
              Reading attendance register…
            </p>
          )}
          {scanError && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#ff6b6b' }}>{scanError}</p>
          )}
          <div key={signInSheetPickerKey} style={{ marginTop: 12 }}>
            <ImageSourceButtons
              onFiles={handleSignInSheetFiles}
              disabled={scanLoading}
              cameraLabel="Take new photo"
              galleryLabel="Choose from gallery"
              hint="Take new photo or Choose from gallery replaces this Attendance Register photo and clears its current scan results. Scan register again reads the current photo again. Delete photo removes the photo; the applied Labour Attendance Summary is unchanged."
            />
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            {scanLastFile ? (
              <SecondaryButton
                type="button"
                disabled={scanLoading || scanApplySaving}
                onClick={retrySignInScan}
              >
                {scanRescanning ? 'Scanning...' : 'Scan register again'}
              </SecondaryButton>
            ) : null}
            {scanRescanWarning ? (
              <div style={{ flexBasis: '100%' }}>
                <p role="status" style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>
                  You have typed figures that are not saved. Scanning again will replace this table.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <SecondaryButton type="button" onClick={confirmScanRescan}>
                    Scan again anyway
                  </SecondaryButton>
                  <button
                    type="button"
                    onClick={dismissScanRescanWarning}
                    style={{ padding: '8px 10px', border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Keep what I typed
                  </button>
                </div>
              </div>
            ) : null}
            <DestructiveButton
              type="button"
              disabled={scanLoading}
              onClick={removeSignInSheetEvidence}
            >
              Delete photo
            </DestructiveButton>
          </div>
        </div>
      )}
    </GlassSection>
  )
}
