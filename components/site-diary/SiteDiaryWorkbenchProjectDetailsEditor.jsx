'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { diaryAutosaveOperationOwner, diaryAutosaveOwnersEqual } from '@/lib/diary-autosave'
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
  reportWriteLocked = false,
  reportWriteLockedRef,
  projectDetailsPersistRef,
  reportLifecycleOwnerRef = null,
}) {
  const router = useRouter()
  const detailsWriterOwnerRef = useRef(null)
  const detailsStartOwnerQueueRef = useRef([])
  const detailsStatusEpochRef = useRef(0)
  const [suppressStaleDetailsStatus, setSuppressStaleDetailsStatus] = useState(false)

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
    let startOwner = detailsWriterOwnerRef.current
    if (
      typeof detailsStartOwnerQueueRef !== 'undefined'
      && detailsStartOwnerQueueRef?.current?.length
    ) {
      const queued = detailsStartOwnerQueueRef.current.find((item) => item && item.consumed !== true)
      if (queued?.owner) {
        queued.consumed = true
        startOwner = queued.owner
        const queuedIndex = detailsStartOwnerQueueRef.current.indexOf(queued)
        if (queuedIndex >= 0) detailsStartOwnerQueueRef.current.splice(queuedIndex, 1)
      }
    }
    onWorkbenchPersistSync(sync, startOwner)
    const currentOwner = (
      typeof reportLifecycleOwnerRef !== 'undefined'
      && reportLifecycleOwnerRef?.current
    ) ? diaryAutosaveOperationOwner(reportLifecycleOwnerRef.current) : null
    const stillCurrent = (
      typeof diaryAutosaveOwnersEqual !== 'function'
      || (
        startOwner
        && currentOwner
        && diaryAutosaveOwnersEqual(startOwner, currentOwner)
      )
    )
    if (stillCurrent) onCollapse()
  }, [onWorkbenchPersistSync, onCollapse, reportLifecycleOwnerRef])

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
    reportLifecycleOwnerRef,
  })

  const saveProjectDetails = useCallback(() => {
    if (reportWriteLockedRef?.current) return
    const startOwner = (
      typeof reportLifecycleOwnerRef !== 'undefined'
      && reportLifecycleOwnerRef?.current
    ) ? diaryAutosaveOperationOwner(reportLifecycleOwnerRef.current) : null
    detailsWriterOwnerRef.current = startOwner
    const queuedOwner = { owner: startOwner, consumed: false }
    if (typeof detailsStartOwnerQueueRef !== 'undefined' && detailsStartOwnerQueueRef) {
      detailsStartOwnerQueueRef.current.push(queuedOwner)
    }
    let epoch = 0
    if (typeof detailsStatusEpochRef !== 'undefined' && detailsStatusEpochRef) {
      epoch = (detailsStatusEpochRef.current || 0) + 1
      detailsStatusEpochRef.current = epoch
    }
    if (typeof setSuppressStaleDetailsStatus === 'function') {
      setSuppressStaleDetailsStatus(false)
    }
    const persistPromise = Promise.resolve(persistProjectDetails())
    const operation = { owner: startOwner, promise: persistPromise }
    if (projectDetailsPersistRef) projectDetailsPersistRef.current = operation
    void persistPromise.finally(() => {
      if (projectDetailsPersistRef?.current === operation) {
        projectDetailsPersistRef.current = null
      }
      if (
        typeof detailsStartOwnerQueueRef !== 'undefined'
        && detailsStartOwnerQueueRef
        && !queuedOwner.consumed
      ) {
        const queuedIndex = detailsStartOwnerQueueRef.current.indexOf(queuedOwner)
        if (queuedIndex >= 0) detailsStartOwnerQueueRef.current.splice(queuedIndex, 1)
      }
      if (typeof detailsStatusEpochRef === 'undefined' || !detailsStatusEpochRef) return
      if (detailsStatusEpochRef.current !== epoch) return
      const currentOwner = (
        typeof reportLifecycleOwnerRef !== 'undefined'
        && reportLifecycleOwnerRef?.current
      ) ? diaryAutosaveOperationOwner(reportLifecycleOwnerRef.current) : null
      const stillCurrent = (
        typeof diaryAutosaveOwnersEqual === 'function'
        && startOwner
        && currentOwner
        && diaryAutosaveOwnersEqual(startOwner, currentOwner)
      )
      if (!stillCurrent && typeof setSuppressStaleDetailsStatus === 'function') {
        setSuppressStaleDetailsStatus(true)
      }
    })
  }, [persistProjectDetails, projectDetailsPersistRef, reportLifecycleOwnerRef, reportWriteLockedRef])

  const reportDateDisplay = reportDate
    ? new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : ''

  return (
    <fieldset disabled={reportWriteLocked} className="m-0 min-w-0 border-0 p-0">
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
      onSaveProjectDetails={saveProjectDetails}
      saving={(!suppressStaleDetailsStatus && inlineProjectDetailsSaving) || reportWriteLocked}
      loading={inlineProjectDetailsLoading}
      error={suppressStaleDetailsStatus ? '' : inlineProjectDetailsError}
      detailsTouchedRef={inlineProjectDetailsTouchedRef}
      editingReportId={editingReportId}
    />
    </fieldset>
  )
}
