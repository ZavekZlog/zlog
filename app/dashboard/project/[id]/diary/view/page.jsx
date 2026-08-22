'use client'

/**
 * Saved Site Diary viewer — one continuous read-only document.
 *
 * Reached from View Saved Diaries. This is a finished historical record, so
 * the page renders text and images only: no inputs, no capture controls, no
 * multi-stage workflow, and no button that hides the rest of the diary.
 *
 * Composition and editing stay in the workbench
 * (app/dashboard/project/[id]/diary/page.jsx) and are unchanged.
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { CopyPlus, Pencil, Share2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  DestructiveButton,
} from '@/lib/premium-ui'
import { ReportDeletionDialog } from '@/components/report-management/ReportDeletionDialog'
import { REPORT_THEMES } from '@/lib/report-theme'
import { NOT_RECORDED, loadSavedDiaryView } from '@/lib/diary-saved-view'
import {
  temporaryWorkInspectionStatus,
  temporaryWorkNotesDisplay,
} from '@/lib/diary-daily-records'
import { diaryHubHref, editExistingDiaryHref, projectAndReportDetailsHref } from '@/lib/diary-routing'
import { createTodaysDiaryDraft } from '@/lib/diary-draft'
import { deleteSiteDiaries, savedReportListHref } from '@/lib/report-deletion'
import {
  canSharePdfFile,
  downloadSiteDiaryPdf,
  prepareSiteDiaryPdf,
  shareSiteDiaryPdfNative,
} from '@/lib/diary-share'

const DIARY_ACCENT = REPORT_THEMES.diary.accent

const reviewActionStyle = {
  width: '100%',
  minHeight: 48,
  padding: '7px 14px',
  fontSize: 14,
  fontWeight: 500,
}

const deleteActionStyle = {
  width: '100%',
  minHeight: 44,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 500,
}

const hideRedundantShellTitleCss = `
  .zlog-report-module-nav { display: none; }

  @media (max-width: 639px) {
    .zlog-saved-diary-review__title {
      margin-bottom: 2px !important;
    }

    .zlog-saved-diary-review__intro {
      margin-bottom: 6px !important;
      line-height: 1.35 !important;
    }

    .zlog-saved-diary-review__actions {
      margin-bottom: 8px !important;
    }

    .zlog-saved-diary-review__actions-grid {
      gap: 6px !important;
    }

    .zlog-saved-diary-review__action-btn {
      min-height: 44px !important;
      padding: 6px 12px !important;
    }

    .zlog-saved-diary-review__delete-btn {
      min-height: 42px !important;
      padding: 6px 12px !important;
    }

    .zlog-saved-diary-review__status {
      margin-top: 4px !important;
    }

    .zlog-saved-diary-review__delete-divider {
      margin-top: 8px !important;
      padding-top: 6px !important;
    }

    .zlog-saved-diary-review__identity .premium-glass-panel {
      padding: 14px 16px;
      margin-bottom: 10px;
    }

    .zlog-saved-diary-review__identity .premium-section-title {
      margin-top: 2px;
      margin-bottom: 10px;
    }

    .zlog-saved-diary-review__identity-grid {
      column-gap: 12px;
      row-gap: 0;
    }

    .zlog-saved-diary-review__identity-row {
      margin-bottom: 5px !important;
    }

    .zlog-saved-diary-review__identity-row .zlog-saved-diary-review__identity-value {
      margin-top: 2px !important;
    }
  }
`

const labelStyle = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-2)',
}

const valueStyle = {
  margin: '3px 0 0',
  fontSize: 15,
  lineHeight: 1.45,
  color: 'var(--text)',
  overflowWrap: 'anywhere',
}

const emptyValueStyle = { ...valueStyle, color: 'var(--text-2)', fontStyle: 'italic' }

const bodyTextStyle = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.55,
  color: 'var(--text)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

const groupTitleStyle = {
  margin: '0 0 10px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
}

const compactIdentityGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: 14,
  rowGap: 2,
}

function DetailRow({ label, value, recorded, compact = false }) {
  return (
    <div
      className={compact ? 'zlog-saved-diary-review__identity-row' : undefined}
      style={{ marginBottom: compact ? 8 : 12, minWidth: 0 }}
    >
      <p style={labelStyle}>{label}</p>
      <p
        className={compact ? 'zlog-saved-diary-review__identity-value' : undefined}
        style={recorded ? valueStyle : emptyValueStyle}
      >
        {value}
      </p>
    </div>
  )
}

function EmptySection({ children }) {
  return <p style={{ ...emptyValueStyle, margin: 0 }}>{children}</p>
}

function TextSection({ title, value, emptyText }) {
  return (
    <GlassSection title={title} accent={DIARY_ACCENT}>
      {value ? <p style={bodyTextStyle}>{value}</p> : <EmptySection>{emptyText}</EmptySection>}
    </GlassSection>
  )
}

function RecordList({ rows, columns }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            border: '1px solid var(--edge)',
            borderRadius: 12,
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--plate) 92%, var(--bg))',
          }}
        >
          {columns.map((column) => {
            const value = row[column.key]
            if (!value) return null
            return (
              <div key={column.key} style={{ marginBottom: 6 }}>
                <p style={labelStyle}>{column.label}</p>
                <p style={valueStyle}>{value}</p>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Saved photos for one work area — always visible, never clickable.
 * Density follows the area's own saved 1 / 4 / 6 per-page value.
 */
function SavedPhotoGrid({ photos, perPage, numberOffset }) {
  const columns = perPage === 1 ? 1 : perPage === 6 ? 3 : 2
  return (
    <div
      role="list"
      aria-label="Saved photos in this area"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 10,
        marginTop: 12,
      }}
    >
      {photos.map((photo, index) => {
        const caption = photo.acceptedDescription || photo.caption || ''
        const assignedTo = photo.assignedTo || ''
        const degrees = Number(photo.rotationDegrees) || 0
        return (
          <div
            key={photo.id}
            role="listitem"
            style={{
              border: '1px solid var(--edge)',
              borderRadius: 12,
              padding: 6,
              background: 'color-mix(in srgb, var(--plate) 92%, var(--bg))',
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: 8,
                background: '#0b0d12',
              }}
            >
              {photo.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.preview}
                  alt={caption || `Photo ${numberOffset + index + 1}`}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    transform: degrees ? `rotate(${degrees}deg)` : undefined,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'center',
              }}
            >
              Photo {numberOffset + index + 1}
            </div>
            {caption ? (
              <p
                style={{
                  margin: '6px 2px 0',
                  fontSize: 12,
                  lineHeight: 1.35,
                  color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
                  overflowWrap: 'anywhere',
                }}
              >
                {caption}
              </p>
            ) : null}
            {assignedTo ? (
              <p
                style={{
                  margin: '4px 2px 0',
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: 'var(--text-2)',
                  overflowWrap: 'anywhere',
                }}
              >
                Assigned to: {assignedTo}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function SavedDiaryViewer() {
  const { id: routeProjectId } = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const reportId = searchParams.get('report') || null
  const projectId = String(routeProjectId || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfStatus, setPdfStatus] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [basisBusy, setBasisBusy] = useState(false)
  const [basisError, setBasisError] = useState('')
  const pdfReadyRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const result = await loadSavedDiaryView(supabase, { projectId, reportId })
        if (cancelled) return
        if (!result.ok) {
          setError(result.message)
          return
        }
        setView(result.view)
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'We couldn’t open that saved Site Diary.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId, reportId])

  if (loading) {
    return (
      <PremiumShell
        backHref={diaryHubHref()}
        accent={DIARY_ACCENT}
        maxWidth={640}
        stickyBack
      >
        <style>{hideRedundantShellTitleCss}</style>
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading your saved diary…</p>
      </PremiumShell>
    )
  }

  if (error || !view) {
    return (
      <PremiumShell
        backHref={diaryHubHref()}
        accent={DIARY_ACCENT}
        maxWidth={640}
        stickyBack
      >
        <style>{hideRedundantShellTitleCss}</style>
        <div
          style={{
            background: 'rgba(220,50,50,0.1)',
            border: '1px solid rgba(220,50,50,0.3)',
            color: '#ff6b6b',
            padding: '14px 16px',
            fontSize: 15,
            borderRadius: 10,
            lineHeight: 1.45,
          }}
        >
          {error || 'We couldn’t open that saved Site Diary.'}
        </div>
      </PremiumShell>
    )
  }

  const editHref = editExistingDiaryHref({
    projectId: view.projectId,
    reportId: view.reportId,
    reportDate: view.reportDate,
  })

  const handleGeneratePdf = async () => {
    if (generatingPdf) return
    setGeneratingPdf(true)
    setPdfStatus('')
    try {
      const cached = pdfReadyRef.current
      const fromCache = Boolean(
        cached?.ok
          && cached.file
          && cached.blob
          && cached.projectId === view.projectId
          && cached.reportId === view.reportId,
      )
      let prepared = fromCache ? cached : null
      if (!prepared) {
        prepared = await prepareSiteDiaryPdf({
          projectId: view.projectId,
          reportId: view.reportId,
        })
        if (!prepared.ok) {
          pdfReadyRef.current = null
          setPdfStatus(prepared.message || 'We couldn’t prepare the PDF.')
          return
        }
        pdfReadyRef.current = {
          ...prepared,
          projectId: view.projectId,
          reportId: view.reportId,
        }
      }

      const pdfFile = prepared.file instanceof File
        ? prepared.file
        : new File(
          [prepared.blob],
          prepared.fileName || 'Zlog-Site-Diary.pdf',
          { type: 'application/pdf' },
        )

      if (canSharePdfFile(pdfFile)) {
        const shareResult = await shareSiteDiaryPdfNative({
          file: pdfFile,
          title: prepared.title || 'Site Diary',
          text: prepared.text,
        })
        if (shareResult.ok) {
          setPdfStatus('')
          return
        }
        if (!fromCache) {
          setPdfStatus('PDF is ready. Tap Share Report again to share it.')
          return
        }
      }

      const result = await downloadSiteDiaryPdf({
        blob: prepared.blob,
        fileName: prepared.fileName,
      })
      if (!result.ok) {
        setPdfStatus(result.message || 'Could not save the PDF.')
        return
      }
      if (result.cancelled) return
      const insecure = typeof window !== 'undefined' && window.isSecureContext === false
      setPdfStatus(
        insecure
          ? 'Sharing needs a secure connection. The PDF has been saved instead.'
          : (result.message || 'PDF saved.'),
      )
    } catch (err) {
      setPdfStatus(err?.message || 'We couldn’t generate the PDF. Try again.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const confirmDeleteDiary = async () => {
    if (deleting || !view?.reportId) return
    setDeleting(true)
    setDeleteError('')
    try {
      const supabase = createClient()
      await deleteSiteDiaries(supabase, [view.reportId])
      router.push(savedReportListHref())
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure?.message || 'We couldn’t delete this diary. Try again.',
      )
      setDeleting(false)
    }
  }

  const handleUseAsBasisForNewDiary = async () => {
    if (basisBusy || deleting || generatingPdf || !view?.projectId || !view?.reportId) return
    setBasisBusy(true)
    setBasisError('')
    try {
      const supabase = createClient()
      const id = await createTodaysDiaryDraft(supabase, view.projectId, view.reportId)
      const href = projectAndReportDetailsHref(view.projectId, id)
      if (!href) throw new Error('Missing diary link')
      router.push(href)
    } catch (err) {
      setBasisError(
        err?.message || 'We couldn’t start a new diary from this one. Try again.',
      )
      setBasisBusy(false)
    }
  }

  const actionsBusy = generatingPdf || deleting || basisBusy
  const reportGroup = view.detailGroups.find((group) => group.key === 'report') || null

  return (
    <PremiumShell
      backHref={diaryHubHref()}
      accent={DIARY_ACCENT}
      maxWidth={640}
      stickyBack
    >
      <style>{hideRedundantShellTitleCss}</style>
      <div className="zlog-saved-diary-review">
      <p
        className="zlog-saved-diary-review__title"
        style={{
          margin: '0 0 4px',
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.25,
          color: 'var(--text)',
        }}
      >
        {view.projectName || 'Site Diary'} — {view.reportDateDisplay}
      </p>
      <p
        className="zlog-saved-diary-review__intro"
        style={{
          margin: '0 0 10px',
          fontSize: 14,
          lineHeight: 1.4,
          color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
        }}
      >
        This is your saved diary exactly as it was recorded.
      </p>

      <div className="zlog-saved-diary-review__actions" style={{ margin: '0 0 14px' }}>
        <div className="zlog-saved-diary-review__actions-grid" style={{ display: 'grid', gap: 8 }}>
          <PrimaryCTA
            type="button"
            surface="workbench"
            onClick={handleGeneratePdf}
            disabled={actionsBusy}
            loading={generatingPdf}
            className="zlog-saved-diary-review__action-btn"
            style={reviewActionStyle}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Share2 size={15} strokeWidth={2.25} aria-hidden color="var(--rust)" />
              {generatingPdf ? 'Sharing…' : 'Share Report'}
            </span>
          </PrimaryCTA>
          {editHref ? (
            <SecondaryButton
              type="button"
              disabled={actionsBusy}
              onClick={() => router.push(editHref)}
              className="zlog-saved-diary-review__action-btn"
              style={reviewActionStyle}
            >
              <Pencil size={15} strokeWidth={2.25} aria-hidden className="zlog-secondary-cta__icon" />
              <span className="zlog-secondary-cta__label">Edit This Diary</span>
            </SecondaryButton>
          ) : null}
          <SecondaryButton
            type="button"
            disabled={actionsBusy}
            onClick={handleUseAsBasisForNewDiary}
            className="zlog-saved-diary-review__action-btn"
            style={reviewActionStyle}
          >
            <CopyPlus size={15} strokeWidth={2.25} aria-hidden className="zlog-secondary-cta__icon" />
            <span className="zlog-secondary-cta__label">
              {basisBusy ? 'Starting…' : 'Use as Basis for New Diary'}
            </span>
          </SecondaryButton>
        </div>
        {pdfStatus ? (
          <p
            role="status"
            aria-live="polite"
            className="zlog-saved-diary-review__status"
            style={{
              margin: '6px 2px 0',
              color: 'var(--text-2)',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {pdfStatus}
          </p>
        ) : null}
        {basisError ? (
          <p
            role="status"
            className="zlog-saved-diary-review__status"
            style={{
              margin: '6px 2px 0',
              color: '#ff6b6b',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {basisError}
          </p>
        ) : null}
        <div
          className="zlog-saved-diary-review__delete-divider"
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--edge)',
          }}
        >
          <DestructiveButton
            type="button"
            disabled={actionsBusy}
            onClick={() => {
              setDeleteError('')
              setDeleteOpen(true)
            }}
            className="zlog-saved-diary-review__delete-btn"
            style={deleteActionStyle}
          >
            <Trash2 size={15} strokeWidth={2.25} aria-hidden />
            <span>Delete Diary</span>
          </DestructiveButton>
        </div>
      </div>

      <div className="zlog-saved-diary-review__identity">
        <GlassSection title="This Saved Diary" accent={DIARY_ACCENT}>
          <div className="zlog-saved-diary-review__identity-grid" style={compactIdentityGridStyle}>
          <DetailRow
            compact
            label="Project"
            value={view.projectName}
            recorded={Boolean(view.projectName)}
          />
          <DetailRow
            compact
            label="Report Date"
            value={view.reportDateDisplay}
            recorded={view.reportDateDisplay !== NOT_RECORDED}
          />
          {(reportGroup?.rows || [])
            .filter((row) => row.key !== 'reportDate')
            .filter((row) => row.key !== 'currentPhase' || row.recorded)
            .map((row) => (
              <DetailRow
                compact
                key={row.key}
                label={row.label}
                value={row.value}
                recorded={row.recorded}
              />
            ))}
          </div>
        </GlassSection>
      </div>

      <GlassSection title="Project & Report Details" accent={DIARY_ACCENT}>
        <div style={{ marginTop: 0 }}>
          <p style={groupTitleStyle}>Cover Photo</p>
          {view.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.coverPhotoUrl}
              alt="Site Diary cover photo"
              style={{
                display: 'block',
                width: '100%',
                borderRadius: 12,
                border: '1px solid var(--edge)',
                background: '#0b0d12',
              }}
            />
          ) : (
            <EmptySection>
              {view.coverPhotoPath
                ? 'Cover photo is saved on this diary but could not be loaded. Open Edit This Diary or try again.'
                : 'No cover photo was saved on this diary.'}
            </EmptySection>
          )}
        </div>
        {view.detailGroups.map((group, groupIndex) => (
          <div key={group.key} style={{ marginTop: 18 }}>
            <p style={groupTitleStyle}>{group.title}</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                columnGap: 14,
              }}
            >
              {group.rows.map((row) => (
                <DetailRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  recorded={row.recorded}
                />
              ))}
            </div>
          </div>
        ))}
      </GlassSection>

      <TextSection
        title="Weather"
        value={view.weather}
        emptyText="No weather was recorded."
      />

      <GlassSection title="H&S Incidents / Observations" accent={DIARY_ACCENT}>
        {view.hsIncidents.length ? (
          <RecordList
            rows={view.hsIncidents.map((row, index) => ({ ...row, key: row.key || `hs-${index}` }))}
            columns={[
              { key: 'description', label: 'Description' },
              { key: 'actionTaken', label: 'Action Taken' },
              { key: 'assignedTo', label: 'Assigned To' },
              { key: 'status', label: 'Status' },
            ]}
          />
        ) : (
          <EmptySection>No H&S incidents or observations were recorded.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="RFIs" accent={DIARY_ACCENT}>
        {view.rfis.length ? (
          <RecordList
            rows={view.rfis.map((row, index) => ({ ...row, key: row.key || `rfi-${index}` }))}
            columns={[
              { key: 'reference', label: 'Reference' },
              { key: 'description', label: 'Description' },
              { key: 'raisedTo', label: 'Raised To' },
              { key: 'status', label: 'Status' },
            ]}
          />
        ) : (
          <EmptySection>No RFIs were recorded.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="Variations" accent={DIARY_ACCENT}>
        {view.variations.length ? (
          <RecordList
            rows={view.variations.map((row, index) => ({
              ...row,
              key: row.key || `variation-${index}`,
            }))}
            columns={[
              { key: 'reference', label: 'Reference' },
              { key: 'description', label: 'Description' },
              { key: 'instructedBy', label: 'Instructed By' },
              { key: 'status', label: 'Status' },
            ]}
          />
        ) : (
          <EmptySection>No variations were recorded.</EmptySection>
        )}
      </GlassSection>

      <TextSection
        title="Site Summary"
        value={view.siteSummary}
        emptyText="No site summary was recorded."
      />

      <GlassSection title="Labour on Site" accent={DIARY_ACCENT}>
        {view.labour.length ? (
          <>
            <p style={{ ...valueStyle, margin: '0 0 10px', fontWeight: 600 }}>
              {view.labourTotal} on site
            </p>
            <RecordList
              rows={view.labour}
              columns={[
                { key: 'trade', label: 'Trade' },
                { key: 'company', label: 'Company' },
                { key: 'headcount', label: 'Number on Site' },
                { key: 'hours', label: 'Hours' },
                { key: 'notes', label: 'Notes' },
              ]}
            />
          </>
        ) : (
          <EmptySection>No labour was recorded.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="Plant" accent={DIARY_ACCENT}>
        {view.plant.length ? (
          <RecordList
            rows={view.plant}
            columns={[
              { key: 'item', label: 'Item' },
              { key: 'ref', label: 'Reference' },
              { key: 'status', label: 'Status' },
              { key: 'notes', label: 'Notes' },
            ]}
          />
        ) : (
          <EmptySection>No plant was recorded.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="Equipment on Hire" accent={DIARY_ACCENT}>
        {view.equipmentHire.length ? (
          <RecordList
            rows={view.equipmentHire}
            columns={[
              { key: 'description', label: 'Description' },
              { key: 'supplier', label: 'Supplier' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'status', label: 'Status' },
            ]}
          />
        ) : (
          <EmptySection>No equipment on hire was recorded.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="Temporary Works & Scaffolding Checks" accent={DIARY_ACCENT}>
        {view.temporaryWorksApplicable === false ? (
          <EmptySection>Not applicable today.</EmptySection>
        ) : view.temporaryWorks.length ? (
          <RecordList
            rows={view.temporaryWorks.map((row) => ({
              ...row,
              item: row.type || '',
              inspectionStatus: temporaryWorkInspectionStatus(row),
              notesDisplay: temporaryWorkNotesDisplay(row),
            }))}
            columns={[
              { key: 'item', label: 'Temporary Works Type' },
              { key: 'location', label: 'Location / Description' },
              { key: 'inspectionStatus', label: 'Status / Check Result' },
              { key: 'notesDisplay', label: 'Notes / Action' },
            ]}
          />
        ) : (
          <EmptySection>No temporary works items were recorded.</EmptySection>
        )}
      </GlassSection>

      <TextSection
        title="Visitors"
        value={view.visitors}
        emptyText="No visitors were recorded."
      />

      <TextSection
        title="Delays & Issues"
        value={view.delaysIssues}
        emptyText="No delays or issues were recorded."
      />

      <TextSection
        title="Actions Required"
        value={view.actionsRequired}
        emptyText="No actions were recorded."
      />

      <GlassSection title="Photo Evidence" accent={DIARY_ACCENT}>
        {view.photoAreas.length ? (
          <>
            <p style={{ ...labelStyle, margin: '0 0 12px' }}>
              {view.photoCount} photo{view.photoCount === 1 ? '' : 's'} across{' '}
              {view.photoAreas.length} work area{view.photoAreas.length === 1 ? '' : 's'}
            </p>
            {view.photoAreas.map((area) => (
              <div
                key={area.id}
                style={{
                  marginBottom: 18,
                  paddingTop: 14,
                  borderTop: '1px solid var(--edge)',
                }}
              >
                <p style={{ ...valueStyle, margin: 0, fontWeight: 700 }}>{area.areaName}</p>
                <p style={{ ...labelStyle, marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
                  {area.photos.length} photo{area.photos.length === 1 ? '' : 's'} · {area.perPage}{' '}
                  per page
                </p>
                {area.notes ? (
                  <p style={{ ...bodyTextStyle, marginTop: 8, fontSize: 14 }}>{area.notes}</p>
                ) : null}
                <SavedPhotoGrid
                  photos={area.photos}
                  perPage={area.perPage}
                  numberOffset={area.numberOffset}
                />
              </div>
            ))}
          </>
        ) : (
          <EmptySection>No photo evidence was saved on this diary.</EmptySection>
        )}
      </GlassSection>

      <GlassSection title="Signature" accent={DIARY_ACCENT}>
        {view.signatureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.signatureUrl}
            alt="Saved signature"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 160,
              objectFit: 'contain',
              borderRadius: 12,
              border: '1px solid var(--edge)',
              background: 'color-mix(in srgb, var(--plate) 92%, var(--bg))',
              padding: 10,
            }}
          />
        ) : (
          <EmptySection>No signature was saved on this diary.</EmptySection>
        )}
        <p style={{ ...labelStyle, marginTop: 10, textTransform: 'none', letterSpacing: 0 }}>
          Signed by {view.authorName || NOT_RECORDED}
          {view.authorRole ? ` · ${view.authorRole}` : ''}
        </p>
      </GlassSection>

      <ReportDeletionDialog
        open={deleteOpen}
        count={1}
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (deleting) return
          setDeleteOpen(false)
          setDeleteError('')
        }}
        onConfirm={confirmDeleteDiary}
      />
      </div>
    </PremiumShell>
  )
}

export default function SavedDiaryViewerRoute() {
  return (
    <Suspense
      fallback={
        <PremiumShell
          backHref="/dashboard/diary"
          accent={DIARY_ACCENT}
          maxWidth={640}
          stickyBack
        >
          <style>{hideRedundantShellTitleCss}</style>
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SavedDiaryViewer />
    </Suspense>
  )
}
