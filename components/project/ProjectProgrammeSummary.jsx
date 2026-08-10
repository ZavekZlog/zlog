'use client'

/**
 * Reusable Project Programme Information block (Progress Report).
 * Mount when Site Progress Report is shown. Not used on Site Diary (this milestone).
 */

import {
  computeProjectDay,
  formatProjectDateDisplay,
} from '@/lib/project-day'
import { GlassSection, SecondaryButton, labelStyle } from '@/lib/premium-ui'

/**
 * @param {object} props
 * @param {string|null|undefined} props.startDate
 * @param {string|null|undefined} props.plannedCompletionDate
 * @param {string|null|undefined} [props.asOfDate]
 * @param {string} [props.accent]
 * @param {string|null} [props.editProjectHref]
 * @param {string} [props.title]
 */
export function ProjectProgrammeSummary({
  startDate = null,
  plannedCompletionDate = null,
  asOfDate = null,
  accent,
  editProjectHref = null,
  title = 'Project Programme Information',
}) {
  const day = computeProjectDay({
    startDate,
    plannedCompletionDate,
    asOfDate,
  })

  return (
    <GlassSection title={title} accent={accent}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Project Start Date</div>
          <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.4 }}>
            {formatProjectDateDisplay(day.startDate)}
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Planned Completion Date</div>
          <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.4 }}>
            {formatProjectDateDisplay(day.plannedCompletionDate)}
          </div>
        </div>

        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Project Day</div>
          <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)', lineHeight: 1.4 }}>
            {day.headline}
          </div>
          {day.detail ? (
            <div style={{ marginTop: 4, fontSize: 14, color: 'color-mix(in srgb, var(--text) 85%, var(--text-2))' }}>
              {day.detail}
            </div>
          ) : null}
        </div>

        {day.status === 'in_progress' || day.status === 'before_start' ? (
          <div>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Planned Days Remaining</div>
            <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.4 }}>
              {day.plannedDaysRemaining == null
                ? '—'
                : day.plannedDaysRemaining === 1
                  ? '1 day'
                  : `${day.plannedDaysRemaining} days`}
            </div>
          </div>
        ) : null}

        {day.status === 'missing' && editProjectHref ? (
          <SecondaryButton type="button" href={editProjectHref} style={{ minHeight: 48, width: '100%' }}>
            Set project dates
          </SecondaryButton>
        ) : null}
      </div>
    </GlassSection>
  )
}
