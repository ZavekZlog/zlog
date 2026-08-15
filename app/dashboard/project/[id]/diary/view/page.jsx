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

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PremiumShell, GlassSection, SecondaryButton } from '@/lib/premium-ui'
import { REPORT_THEMES } from '@/lib/report-theme'
import { NOT_RECORDED, loadSavedDiaryView } from '@/lib/diary-saved-view'
import { diaryHubHref, editExistingDiaryHref } from '@/lib/diary-routing'

const DIARY_ACCENT = REPORT_THEMES.diary.accent

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

function DetailRow({ label, value, recorded }) {
  return (
    <div style={{ marginBottom: 12, minWidth: 0 }}>
      <p style={labelStyle}>{label}</p>
      <p style={recorded ? valueStyle : emptyValueStyle}>{value}</p>
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
        title="Saved Site Diary"
        backHref={diaryHubHref()}
        accent={DIARY_ACCENT}
        maxWidth={640}
      >
        <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading your saved diary…</p>
      </PremiumShell>
    )
  }

  if (error || !view) {
    return (
      <PremiumShell
        title="Saved Site Diary"
        backHref={diaryHubHref()}
        accent={DIARY_ACCENT}
        maxWidth={640}
      >
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

  return (
    <PremiumShell
      title="Saved Site Diary"
      backHref={diaryHubHref()}
      accent={DIARY_ACCENT}
      maxWidth={640}
    >
      <p
        style={{
          margin: '0 0 6px',
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.3,
          color: 'var(--text)',
        }}
      >
        {view.projectName || 'Site Diary'} — {view.reportDateDisplay}
      </p>
      <p
        style={{
          margin: '0 0 20px',
          fontSize: 15,
          lineHeight: 1.5,
          color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
        }}
      >
        This is your saved diary exactly as it was recorded. Scroll down to review the whole
        report.
      </p>

      <GlassSection title="Project & Report Details" accent={DIARY_ACCENT}>
        {view.detailGroups.map((group, groupIndex) => (
          <div key={group.key} style={{ marginTop: groupIndex === 0 ? 0 : 18 }}>
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

      <GlassSection title="Cover Photo" accent={DIARY_ACCENT}>
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
          <EmptySection>No cover photo was saved on this diary.</EmptySection>
        )}
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

      {editHref ? (
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--edge)' }}>
          <SecondaryButton
            type="button"
            onClick={() => router.push(editHref)}
            style={{ width: '100%', minHeight: 48 }}
          >
            <Pencil size={17} strokeWidth={2.25} aria-hidden className="zlog-secondary-cta__icon" />
            <span className="zlog-secondary-cta__label">Edit This Diary</span>
          </SecondaryButton>
          <p
            style={{
              margin: '8px 4px 0',
              color: 'var(--text-2)',
              fontSize: 13,
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            Reviewing does not change anything. Choose Edit This Diary to make changes.
          </p>
        </div>
      ) : null}
    </PremiumShell>
  )
}

export default function SavedDiaryViewerRoute() {
  return (
    <Suspense
      fallback={
        <PremiumShell
          title="Saved Site Diary"
          backHref="/dashboard/diary"
          accent={DIARY_ACCENT}
          maxWidth={640}
        >
          <p style={{ color: 'var(--text-2)' }}>Loading…</p>
        </PremiumShell>
      }
    >
      <SavedDiaryViewer />
    </Suspense>
  )
}
