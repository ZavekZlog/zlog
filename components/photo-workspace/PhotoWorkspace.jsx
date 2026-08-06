'use client'

/**
 * Shared Photo Workspace host (P2A).
 *
 * Wraps the proven Location Walk UI with report-type labels and adapter metadata.
 * Site Diary still passes locationWalk ↔ onChange; finalizeSiteDiarySave is unchanged.
 *
 * P2B+ will deepen capture, upload queue, and viewer behaviour inside this host.
 */

import { forwardRef } from 'react'
import { AiLocationWalk } from '@/components/ai-annotation/AiLocationWalk'
import {
  getPhotoWorkspaceAdapter,
  getPhotoWorkspaceLabels,
  PHOTO_WORKSPACE_MESSAGES,
} from '@/lib/photo-workspace'

export const PhotoWorkspace = forwardRef(function PhotoWorkspace({
  reportType = 'diary',
  reportId = null,
  accent,
  projectId,
  value = [],
  onChange,
  onContinue,
  onAreaSaved,
  title = null,
}, ref) {
  const labels = getPhotoWorkspaceLabels(reportType)
  const adapter = getPhotoWorkspaceAdapter(reportType)

  const handleAreaSaved = (group) => {
    onAreaSaved?.(group, {
      adapter: adapter.reportType,
      persistenceNote: adapter.persistenceNote,
      reportId,
    })
  }

  return (
    <div data-photo-workspace={reportType} data-report-id={reportId || undefined}>
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 13,
          lineHeight: 1.45,
          color: 'color-mix(in srgb, var(--text) 82%, var(--text-2))',
        }}
      >
        {adapter.persistenceNote}
      </p>
      <AiLocationWalk
        ref={ref}
        accent={accent}
        projectId={projectId}
        value={value}
        onChange={onChange}
        title={title || labels.sectionTitle}
        labels={labels}
        onContinueToSignature={onContinue}
        onAreaSaved={handleAreaSaved}
      />
      <p
        style={{
          margin: '10px 0 0',
          fontSize: 12,
          lineHeight: 1.4,
          color: 'color-mix(in srgb, var(--text) 75%, var(--text-2))',
        }}
      >
        {PHOTO_WORKSPACE_MESSAGES.reportSaveReminder}
      </p>
    </div>
  )
})
