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
      reportId,
    })
  }

  return (
    <div data-photo-workspace={reportType} data-report-id={reportId || undefined}>
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
    </div>
  )
})
