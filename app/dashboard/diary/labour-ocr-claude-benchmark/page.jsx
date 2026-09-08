'use client'

/**
 * TEMPORARY Android Claude vision OCR benchmark page.
 * Isolated from production OpenAI sign-in OCR on the Site Diary labour section.
 * No Apply / no database writes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { PremiumShell, PrimaryCTA, inputStyle, labelStyle, DIARY_ACCENT } from '@/lib/premium-ui'
import {
  CLAUDE_OCR_BENCHMARK_MODEL,
  CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL,
  CLAUDE_BENCHMARK_BREAK_NONE,
  CLAUDE_BENCHMARK_BREAK_OPTIONS,
  applyBulkBreakDeductionToMatchedOperatives,
  applyIndividualBreakDeductionOverride,
  fileToOriginalClaudeBenchmarkImage,
  parseSignInSheetImageClaudeBenchmark,
  sumClaudeBenchmarkMatchedHours,
} from '@/lib/parse-signin-sheet-claude-benchmark'
import { todayIsoDate } from '@/lib/report-setup'

export default function LabourOcrClaudeBenchmarkPage() {
  const [reportDate, setReportDate] = useState(todayIsoDate())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [imageMeta, setImageMeta] = useState(null)
  const [result, setResult] = useState(null)
  const [bulkBreakDeduction, setBulkBreakDeduction] = useState(CLAUDE_BENCHMARK_BREAK_NONE)
  const [breakReviewOperatives, setBreakReviewOperatives] = useState([])

  const safeRows = useMemo(() => {
    const operatives = Array.isArray(result?.operatives) ? result.operatives : []
    return operatives.map((row) => ({
      source_row: row?.source_row ?? null,
      date: row?.work_date ?? null,
      dateStatus: row?.dateStatus ?? null,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      hasName: Boolean(String(row?.person_name || '').trim()),
      hasTrade: Boolean(String(row?.trade || '').trim()),
      hasCompany: Boolean(String(row?.company || '').trim()),
      hours: row?.hours ?? null,
    }))
  }, [result])

  /** Matched included rows with break deduction + net hours (benchmark review only). */
  const matchedBreakRows = useMemo(() => {
    return (Array.isArray(breakReviewOperatives) ? breakReviewOperatives : []).filter(
      (row) => row?.dateStatus === 'match' && row?.included !== false,
    )
  }, [breakReviewOperatives])

  const matchedGrossTotal = useMemo(
    () => sumClaudeBenchmarkMatchedHours(breakReviewOperatives, 'gross'),
    [breakReviewOperatives],
  )
  const matchedNetTotal = useMemo(
    () => sumClaudeBenchmarkMatchedHours(breakReviewOperatives, 'net'),
    [breakReviewOperatives],
  )

  /** Temporary Company/Trade consensus review — matched rows only; on-screen, never logged. */
  const companyTradeConsensusRows = useMemo(() => {
    return matchedBreakRows.map((row) => ({
      source_row: row?.source_row ?? null,
      date: row?.work_date ?? null,
      company_raw: row?.company_raw ?? row?.company ?? null,
      company_reviewed: row?.company_reviewed ?? row?.company ?? null,
      trade_raw: row?.trade_raw ?? row?.trade ?? null,
      trade_reviewed: row?.trade_reviewed ?? row?.trade ?? null,
      trade_normalized: row?.trade_normalized ?? null,
      needs_review: row?.needs_review === true,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      gross_hours: row?.gross_hours ?? row?.hours ?? null,
      break_deduction: row?.break_deduction ?? CLAUDE_BENCHMARK_BREAK_NONE,
      net_hours: row?.net_hours ?? row?.hours ?? null,
    }))
  }, [matchedBreakRows])

  useEffect(() => {
    if (!result || !Array.isArray(result.operatives)) {
      setBreakReviewOperatives([])
      setBulkBreakDeduction(CLAUDE_BENCHMARK_BREAK_NONE)
      return
    }
    setBulkBreakDeduction(CLAUDE_BENCHMARK_BREAK_NONE)
    setBreakReviewOperatives(
      applyBulkBreakDeductionToMatchedOperatives(result.operatives, CLAUDE_BENCHMARK_BREAK_NONE),
    )
  }, [result])

  const handleBulkBreakChange = useCallback((nextValue) => {
    const value = nextValue || CLAUDE_BENCHMARK_BREAK_NONE
    setBulkBreakDeduction(value)
    setBreakReviewOperatives((prev) => applyBulkBreakDeductionToMatchedOperatives(prev, value))
  }, [])

  const handleRowBreakChange = useCallback((sourceRow, nextValue) => {
    setBreakReviewOperatives((prev) =>
      applyIndividualBreakDeductionOverride(prev, sourceRow, nextValue || CLAUDE_BENCHMARK_BREAK_NONE),
    )
  }, [])

  const handleFiles = useCallback(
    async (files) => {
      const file = files?.[0]
      if (!file || !(file instanceof Blob)) return
      if (!reportDate) {
        setError('Set the report date before scanning.')
        return
      }

      setLoading(true)
      setError('')
      setResult(null)
      setPreview(null)
      setImageMeta(null)
      setBreakReviewOperatives([])
      setBulkBreakDeduction(CLAUDE_BENCHMARK_BREAK_NONE)

      try {
        // Step B: original uploaded bytes only — no 1600px / 0.82 resize-reencode.
        const original = await fileToOriginalClaudeBenchmarkImage(file)
        const meta = {
          width: original.width,
          height: original.height,
          byteSize: original.byteSize,
          mediaType: original.mediaType,
          resized: original.resized,
          reencoded: original.reencoded,
          pipeline: original.pipeline,
        }
        setImageMeta(meta)
        setPreview(original.dataUrl)

        const payload = await parseSignInSheetImageClaudeBenchmark({
          dataUrl: original.dataUrl,
          reportDate,
          groupBy: 'trade_company',
          imageMeta: meta,
        })
        setResult(payload)
        if (!Array.isArray(payload.operatives) || payload.operatives.length === 0) {
          setError('Claude returned no attendee rows for this sheet.')
        }
      } catch (err) {
        setResult(null)
        setError(err?.message || 'Claude OCR benchmark failed')
      } finally {
        setLoading(false)
      }
    },
    [reportDate],
  )

  return (
    <PremiumShell
      title="Claude OCR Benchmark"
      backHref="/dashboard/diary"
      accent={DIARY_ACCENT}
      maxWidth={560}
    >
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.45, color: 'var(--text-2)' }}>
        Temporary Claude vision test only. Step B sends the original uploaded image bytes (no
        1600px / 0.82 resize). Does not replace OpenAI. Does not Apply to labour. No database
        writes.
      </p>

      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text)' }}>
        Extract model: <strong>{CLAUDE_OCR_BENCHMARK_MODEL}</strong>
        <br />
        Company/Trade consensus model: <strong>{CLAUDE_OCR_BENCHMARK_CONSENSUS_MODEL}</strong>
      </p>

      <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Report date</label>
      <input
        type="date"
        value={reportDate}
        onChange={(e) => setReportDate(e.target.value)}
        style={{ ...inputStyle, marginBottom: 16, maxWidth: 220 }}
      />

      <ImageSourceButtons
        onFiles={handleFiles}
        disabled={loading}
        cameraLabel="Scan with camera (Claude)"
        galleryLabel="Upload sheet photo (Claude)"
        hint="Benchmark only — review the PII-safe row table. Do not Apply."
      />

      {loading && (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
          Claude is reading the sign-in sheet, then reviewing Company and Trade spellings…
        </p>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
        <img
          src={preview}
          alt="Sign-in sheet preview"
          style={{
            marginTop: 14,
            width: '100%',
            maxHeight: 220,
            objectFit: 'contain',
            borderRadius: 10,
            border: '1px solid var(--edge)',
            background: 'var(--ink)',
          }}
        />
      )}

      {imageMeta && (
        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
          Original image: {imageMeta.width ?? '?'}×{imageMeta.height ?? '?'} ·{' '}
          {imageMeta.byteSize != null ? `${imageMeta.byteSize} bytes` : 'size unknown'} ·{' '}
          {imageMeta.mediaType || 'unknown'} · resized={String(imageMeta.resized)} · reencoded=
          {String(imageMeta.reencoded)}
        </p>
      )}

      {error && (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: '#ff6b6b' }}>{error}</p>
      )}

      {!loading && result && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            border: '1px solid var(--edge)',
            background: 'var(--plate)',
          }}
        >
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            PII-safe Claude result
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-2)' }}>
            Row count: {safeRows.length}
            {result.visibleAttendeeCount != null
              ? ` · claimed visible: ${result.visibleAttendeeCount}`
              : ''}
            {result.rowCountMismatch ? ' · row-count mismatch' : ''}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-2)' }}>
            Matched {result.matchedCount || 0} · other date {result.ignoredCount || 0} · missing
            date {result.missingDateCount || 0}
            {result.consensusPass?.status
              ? ` · consensus: ${result.consensusPass.status}`
              : ''}
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {safeRows.map((row, index) => (
              <div
                key={`${row.source_row ?? 'x'}-${index}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--edge)',
                  background: 'var(--ink)',
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: 'var(--text)',
                }}
              >
                <div>
                  source_row: {row.source_row ?? 'null'} · date: {row.date ?? 'null'} · dateStatus:{' '}
                  {row.dateStatus ?? 'null'}
                </div>
                <div>
                  time_in: {row.time_in ?? 'null'} · time_out: {row.time_out ?? 'null'}
                  {row.hours != null ? ` · hours: ${row.hours}` : ''}
                </div>
                <div>
                  name: {row.hasName ? 'populated' : 'null'} · trade:{' '}
                  {row.hasTrade ? 'populated' : 'null'} · company:{' '}
                  {row.hasCompany ? 'populated' : 'null'}
                </div>
              </div>
            ))}
          </div>

          {companyTradeConsensusRows.length > 0 && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px solid var(--edge)',
              }}
            >
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Break deduction
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Applied to each included operative. Individual rows can be adjusted if required.
              </p>
              <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>
                Break for all matched rows
              </label>
              <select
                value={bulkBreakDeduction}
                onChange={(e) => handleBulkBreakChange(e.target.value)}
                style={{ ...inputStyle, marginBottom: 12, maxWidth: 220 }}
              >
                {CLAUDE_BENCHMARK_BREAK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                Matched labour total: {matchedNetTotal} net hrs
                <span style={{ color: 'var(--text-2)' }}>
                  {' '}
                  (gross {matchedGrossTotal} hrs)
                </span>
              </p>

              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Company / Trade consensus (matched rows)
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Compare raw vs reviewed Company and Trade against the sheet. Not Applied. Not written
                to the database. Not printed to server logs.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {companyTradeConsensusRows.map((row, index) => (
                  <div
                    key={`ct-${row.source_row ?? 'x'}-${index}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--edge)',
                      background: 'var(--ink)',
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      source_row {row.source_row ?? 'null'} · {row.date ?? 'no date'}
                    </div>
                    <div>
                      Time In: {row.time_in ?? 'null'} · Time Out: {row.time_out ?? 'null'}
                    </div>
                    <div>
                      Gross hours: {row.gross_hours ?? 'null'} · Net hours:{' '}
                      {row.net_hours ?? 'null'}
                    </div>
                    <label style={{ display: 'block', marginTop: 8, marginBottom: 4 }}>
                      Break deduction
                    </label>
                    <select
                      value={row.break_deduction}
                      onChange={(e) => handleRowBreakChange(row.source_row, e.target.value)}
                      style={{ ...inputStyle, maxWidth: 180, marginBottom: 8 }}
                    >
                      {CLAUDE_BENCHMARK_BREAK_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div>Raw Company: {row.company_raw ?? 'null'}</div>
                    <div>Reviewed Company: {row.company_reviewed ?? 'null'}</div>
                    <div>Raw Trade: {row.trade_raw ?? 'null'}</div>
                    <div>Reviewed Trade: {row.trade_reviewed ?? 'null'}</div>
                    <div>Normalized Trade: {row.trade_normalized ?? 'null'}</div>
                    <div>Needs review: {row.needs_review ? 'true' : 'false'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PrimaryCTA
            type="button"
            disabled
            style={{ marginTop: 14, opacity: 0.55 }}
          >
            Apply disabled — benchmark only
          </PrimaryCTA>
        </div>
      )}
    </PremiumShell>
  )
}
