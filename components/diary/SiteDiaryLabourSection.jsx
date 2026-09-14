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
  removeRowStyle,
  dismissAutosaveSuccessClaim,
  invalidatePreparedSharePdf,
  setLabourRows,
}) {
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
          Scan Sign-In Sheet (Camera/Upload)
        </button>
        <button
          type="button"
          className="zlog-secondary-btn"
          onClick={startManualLabour}
          style={{
            ...addRowButtonStyle,
            textTransform: 'none',
            letterSpacing: '0.02em',
            borderStyle: labourMode === 'manual' ? 'solid' : 'dashed',
            borderColor: labourMode === 'manual' ? `rgba(${accent}, 0.55)` : 'var(--edge)',
            color: 'var(--text)',
            boxShadow: labourMode === 'manual' ? `0 0 0 1px rgba(${accent}, 0.25)` : undefined,
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
            galleryLabel="Upload sheet photo"
            hint="OCR builds a trade hours summary from the sheet. The photo remains the source record."
          />
        </div>
      )}

      {hasSignInSheetEvidenceOnForm && (
        <div style={{ marginBottom: 16 }}>
          {scanSheetPreview && (
            // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
            <img
              src={scanSheetPreview}
              alt="Sign-in sheet preview"
              style={{
                width: '100%',
                maxHeight: 180,
                objectFit: 'contain',
                borderRadius: 10,
                border: '1px solid var(--edge)',
                background: 'var(--ink)',
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
              Reading sign-in sheet…
            </p>
          )}
          {scanError && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#ff6b6b' }}>{scanError}</p>
          )}
          <div key={signInSheetPickerKey} style={{ marginTop: 12 }}>
            <ImageSourceButtons
              onFiles={handleSignInSheetFiles}
              disabled={scanLoading}
              cameraLabel="Replace image"
              galleryLabel="Replace from gallery"
              hint="A new photo replaces this one and clears the previous read. Cancel keeps the current image."
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
                Retry scan
              </SecondaryButton>
            ) : null}
            <DestructiveButton
              type="button"
              disabled={scanLoading}
              onClick={removeSignInSheetEvidence}
            >
              Remove image
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
            Labour summary · {reportDate}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {labourTotals.operatives} {labourTotals.operatives === 1 ? 'worker' : 'workers'} · {labourTotals.hours} hrs
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 360 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600 }}>Trade</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Workers</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text-2)', fontWeight: 600, width: 88 }}>Hours on site</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {labourRows.map((row) => (
                <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      style={{ ...cellInputStyle, marginBottom: 0, width: '100%' }}
                      value={row.trade}
                      onChange={(e) => updateLabour(row.key, 'trade', e.target.value)}
                      placeholder="Carpenter"
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      min="0"
                      style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                      value={row.headcount}
                      onChange={(e) => updateLabour(row.key, 'headcount', e.target.value)}
                      placeholder="4"
                      aria-label="Workers"
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      style={{ ...cellInputStyle, marginBottom: 0, width: '100%', textAlign: 'right' }}
                      value={row.hours}
                      onChange={(e) => updateLabour(row.key, 'hours', e.target.value)}
                      placeholder="8"
                      aria-label="Hours on site"
                    />
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    {labourRows.length > 1 && (
                      <button
                        type="button"
                        style={{ ...removeRowStyle, marginBottom: 0, padding: '4px 6px' }}
                        onClick={() => {
                          dismissAutosaveSuccessClaim()
                          invalidatePreparedSharePdf('committed-diary-change')
                          setLabourRows((rows) => rows.filter((r) => r.key !== row.key))
                        }}
                        aria-label="Remove labour row"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button type="button" style={addRowButtonStyle} onClick={() => {
        dismissAutosaveSuccessClaim()
        invalidatePreparedSharePdf('committed-diary-change')
        setLabourRows((rows) => [...rows, emptyLabour()])
      }}>
        + Add labour row
      </button>
      </>
      )}
    </GlassSection>
  )
}
