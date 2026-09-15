'use client'

import { useState } from 'react'
import { GlassSection, SecondaryButton, DestructiveButton } from '@/lib/premium-ui'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { SignInOperativeReview } from '@/components/diary/SignInOperativeReview'

export function SiteDiaryLabourSection({
  accent,
  reportDate,
  labourMode,
  setLabourMode,
  setScanError,
  scanLoading,
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
  signInSheetPickerKey,
  handleSignInSheetFiles,
  applyScanOperativesToLabour,
  retrySignInScan,
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

      {hasSignInSheetEvidenceOnForm && (
        <div style={{ marginBottom: 16 }}>
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
          {!scanSheetPreview && scanSignInPreviewLoadError && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#ff6b6b' }}>
              {scanSignInPreviewLoadError}
            </p>
          )}
          {scanLoading && (
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
              hint="Take new photo or Choose from gallery replaces this Attendance Register photo and clears its current scan results. Re-scan reads the current photo again. Delete photo removes the photo; the applied Labour Attendance Summary is unchanged."
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
                Re-scan
              </SecondaryButton>
            ) : null}
            <DestructiveButton
              type="button"
              disabled={scanLoading}
              onClick={removeSignInSheetEvidence}
            >
              Delete photo
            </DestructiveButton>
          </div>
          {labourMode === 'scan' && !scanLoading && scanTradeHoursReviewReady && (
            <SignInOperativeReview
              key={`signin-review-${signInSheetPickerKey}`}
              reviewRows={scanTradeHoursReview}
              scanOperatives={scanOperatives}
              onReviewRowsChange={handleScanTradeHoursReviewChange}
              onOperativeLabourExclusion={handleOperativeLabourExclusion}
              onOperativeMoveToVisitors={handleOperativeMoveToVisitors}
              onApply={applyScanOperativesToLabour}
              warnings={scanWarnings}
              reportDate={reportDate}
              applying={scanApplySaving}
              appliedSaved={scanApplySaved}
              disabled={scanLoading || scanApplySaving}
              applyError={scanApplyError}
              applyNotice={scanApplyNotice}
              ocrProvider={scanOcrProvider}
              applyEnabled={scanApplyEnabled}
            />
          )}
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
            Labour Attendance Summary · {reportDate}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {labourTotals.operatives} {labourTotals.operatives === 1 ? 'worker' : 'workers'} · {labourTotals.hours} hrs
          </div>
        </div>
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
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <span>Trade</span>
          <span style={{ textAlign: 'right' }}>Workers</span>
          <span style={{ textAlign: 'right' }}>Hours on site</span>
          <span aria-hidden="true" />
        </div>
        {labourRows.map((row) => (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(72px, 88px) 36px',
              gap: 8,
              padding: '6px 12px',
              alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {manualLabourEditing ? (
              <input
                style={{ ...manualEditFieldStyle, marginBottom: 0, width: '100%', minWidth: 0 }}
                value={row.trade}
                onChange={(e) => updateLabour(row.key, 'trade', e.target.value)}
                placeholder="Carpenter"
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
                {row.trade || '—'}
              </span>
            )}
            {manualLabourEditing ? (
              <input
                type="number"
                min="0"
                style={{ ...manualEditFieldStyle, marginBottom: 0, width: '100%', minWidth: 0, textAlign: 'right' }}
                value={row.headcount}
                onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)}
                placeholder="4"
                aria-label="Workers"
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                {row.headcount ?? '—'}
              </span>
            )}
            {manualLabourEditing ? (
              <input
                type="number"
                min="0"
                step="0.5"
                style={{ ...manualEditFieldStyle, marginBottom: 0, width: '100%', minWidth: 0, textAlign: 'right' }}
                value={row.hours}
                onChange={(e) => updateLabour(row.key, 'hours', e.target.value)}
                placeholder="8"
                aria-label="Hours on site"
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                {row.hours ?? '—'}
              </span>
            )}
            <div style={{ position: 'relative', justifySelf: 'center' }}>
              {manualLabourEditing && labourRows.length > 1 ? (
                <>
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
                </>
              ) : null}
            </div>
          </div>
        ))}
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
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
          Tap Manual Entry to edit attendance figures.
        </p>
      )}
      </>
      )}
    </GlassSection>
  )
}
