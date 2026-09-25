'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SiteDiaryWorkbenchProjectDetails } from '@/components/site-diary/SiteDiaryProjectDetailsSection'
import {
  applyProjectDetailsPersistToWorkbench,
  buildWorkbenchProjectDetailsSeed,
  useSiteDiaryProjectDetailsController,
} from '@/lib/use-site-diary-project-details'

/**
 * Lazy-loaded inline Project & Report Details editor for the Site Diary workbench.
 * Imported only after the user expands Project Details — keeps setup-scale deps off initial workbench entry.
 */
export default function SiteDiaryWorkbenchProjectDetailsEditor({
  supabase,
  projectId,
  editingReportId,
  hydrateComplete,
  project,
  getPersistedReportRow,
  projectReference,
  creatorName,
  creatorRole,
  companyReportingFor,
  shiftType,
  reportDate,
  coverPhoto,
  setupLogoPreview,
  brandingSelection,
  linkedProjectName,
  isDiaryEditMode,
  onWorkbenchPersistSync,
  onCollapse,
}) {
  const router = useRouter()

  const workbenchProjectDetailsSeed = useMemo(() => {
    if (!hydrateComplete || !project || !editingReportId) return null
    const reportRow = typeof getPersistedReportRow === 'function'
      ? getPersistedReportRow()
      : null
    if (!reportRow) return null
    return buildWorkbenchProjectDetailsSeed({
      projectRow: project,
      reportRow,
      projectReference,
      creatorName,
      creatorRole,
      companyReportingFor,
      shiftType,
      reportDate,
      coverPhoto,
      logoPreview: setupLogoPreview,
      brandingSelection,
      projectId,
      reportId: editingReportId,
    })
  }, [
    hydrateComplete,
    project,
    editingReportId,
    projectId,
    projectReference,
    creatorName,
    creatorRole,
    companyReportingFor,
    shiftType,
    reportDate,
    coverPhoto,
    setupLogoPreview,
    brandingSelection,
    getPersistedReportRow,
  ])

  const handlePersistSuccess = useCallback((payload) => {
    const sync = applyProjectDetailsPersistToWorkbench(payload)
    onWorkbenchPersistSync(sync)
    onCollapse()
  }, [onWorkbenchPersistSync, onCollapse])

  const hydrateEnabled = Boolean(
    isDiaryEditMode && hydrateComplete && editingReportId,
  )

  const {
    loading: inlineProjectDetailsLoading,
    saving: inlineProjectDetailsSaving,
    error: inlineProjectDetailsError,
    persistProjectDetails,
    detailsTouchedRef: inlineProjectDetailsTouchedRef,
    sectionProps: inlineProjectDetailsSectionProps,
  } = useSiteDiaryProjectDetailsController({
    supabase,
    router,
    editingReportId,
    editingProjectId: projectId,
    hostMode: 'workbench',
    hydrateEnabled,
    workbenchSeed: workbenchProjectDetailsSeed,
    onPersistSuccess: handlePersistSuccess,
  })

  const reportDateDisplay = reportDate
    ? new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : ''

  return (
    <SiteDiaryWorkbenchProjectDetails
      summary={{
        projectName: linkedProjectName || project?.name || 'Project',
        projectReference,
        reportDateDisplay,
        shiftLabel: shiftType ? `${shiftType} Shift` : '',
        reportingCompany: !inlineProjectDetailsLoading
          ? (inlineProjectDetailsSectionProps?.reportingCompany || '')
          : '',
        logoPreview: setupLogoPreview,
      }}
      expanded={true}
      onToggleExpanded={onCollapse}
      sectionProps={inlineProjectDetailsSectionProps}
      onSaveProjectDetails={persistProjectDetails}
      saving={inlineProjectDetailsSaving}
      loading={inlineProjectDetailsLoading}
      error={inlineProjectDetailsError}
      detailsTouchedRef={inlineProjectDetailsTouchedRef}
      editingReportId={editingReportId}
    />
  )
}
