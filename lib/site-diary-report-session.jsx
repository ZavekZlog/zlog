'use client'

/**
 * Site Diary report-session boundary (structural S1+).
 * Persistent across /dashboard/project/[id]/diary/* routes via diary layout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

/** @typedef {'idle' | 'stale' | 'validating'} SiteDiaryRevalidationState */

const EMPTY_READ_SNAPSHOTS = Object.freeze({
  report: null,
  project: null,
  labour: null,
  plant: null,
  photoMetadata: null,
  coverStoragePath: null,
  signatureStoragePath: null,
  branding: null,
})

function emptyRevalidationMeta() {
  return {
    loadedAt: null,
    version: null,
    revalidationState: 'idle',
  }
}

function normId(value) {
  const id = value == null ? '' : String(value).trim()
  return id || null
}

function photoMetadataWithoutSignedUrls(photoAreas) {
  if (!Array.isArray(photoAreas)) return []
  return photoAreas.map((area) => ({
    id: area.id,
    areaName: area.areaName,
    notes: area.notes,
    perPage: area.perPage,
    photos: Array.isArray(area.photos)
      ? area.photos.map((photo) => ({
          id: photo.id ?? photo.key ?? null,
          storagePath: photo.storagePath ?? photo.url ?? null,
          thumbnailPath: photo.thumbnailPath ?? null,
          caption: photo.acceptedDescription ?? photo.caption ?? '',
          rotationDegrees: photo.rotationDegrees ?? 0,
          assignedTo: photo.assignedTo ?? '',
          sequence: photo.sequence,
        }))
      : [],
  }))
}

/**
 * Map verified Saved Diary Viewer state into bounded read snapshots (no media blobs/URLs).
 *
 * @param {Record<string, unknown> | null | undefined} view
 * @param {Record<string, unknown> | null | undefined} sdscSeed
 */
export function readSnapshotsFromSavedDiaryView(view, sdscSeed = null) {
  if (!view?.reportId || !view?.projectId) return null
  const seed = sdscSeed && typeof sdscSeed === 'object' ? sdscSeed : null

  return {
    report: {
      reportId: view.reportId,
      projectId: view.projectId,
      reportDate: view.reportDate || seed?.reportDate || null,
      shift: seed?.shift || '',
      currentPhase: seed?.currentPhase || '',
      siteSummary: view.siteSummary || '',
      weather: view.weather || '',
    },
    project: {
      projectId: view.projectId,
      projectName: view.projectName || seed?.projectName || '',
      projectReference: seed?.projectReference || '',
      projectAddress: seed?.projectAddress || '',
      projectManager: seed?.projectManager || '',
      workingDaysPerWeek: seed?.workingDaysPerWeek || '',
      projectStartDate: seed?.projectStartDate || '',
      projectPlannedCompletionDate: seed?.projectPlannedCompletionDate || '',
    },
    labour: Array.isArray(view.labour) ? view.labour : [],
    plant: Array.isArray(view.plant) ? view.plant : [],
    photoMetadata: photoMetadataWithoutSignedUrls(view.photoAreas),
    coverStoragePath: view.coverPhotoPath || seed?.coverStoragePath || null,
    signatureStoragePath: view.signaturePath || null,
    branding: seed
      ? {
          brandingId: seed.brandingId ?? null,
          brandColor: seed.brandColor ?? null,
          logoStoragePath: seed.logoStoragePath ?? null,
          reportingCompany: seed.reportingCompany ?? '',
        }
      : null,
  }
}

/**
 * @param {number} incomingGeneration
 * @param {number} acceptedGeneration
 */
export function isStaleReadSnapshotPublication(incomingGeneration, acceptedGeneration) {
  if (typeof incomingGeneration !== 'number' || Number.isNaN(incomingGeneration)) {
    return false
  }
  return incomingGeneration < acceptedGeneration
}

function mergeReadSnapshotFields(incoming) {
  if (!incoming || typeof incoming !== 'object') {
    return { ...EMPTY_READ_SNAPSHOTS }
  }
  return {
    report: incoming.report ?? null,
    project: incoming.project ?? null,
    labour: incoming.labour ?? null,
    plant: incoming.plant ?? null,
    photoMetadata: incoming.photoMetadata ?? null,
    coverStoragePath: incoming.coverStoragePath ?? null,
    signatureStoragePath: incoming.signatureStoragePath ?? null,
    branding: incoming.branding ?? null,
  }
}

const SiteDiaryReportSessionContext = createContext(null)

export function SiteDiarySessionProvider({ children }) {
  const [projectId, setProjectId] = useState(null)
  const [reportId, setReportId] = useState(null)
  const [readSnapshots, setReadSnapshots] = useState(() => ({
    ...EMPTY_READ_SNAPSHOTS,
  }))
  const [revalidationMeta, setRevalidationMeta] = useState(emptyRevalidationMeta)
  const acceptedPublicationGenerationRef = useRef(0)

  const resetReadSnapshots = useCallback(() => {
    setReadSnapshots({ ...EMPTY_READ_SNAPSHOTS })
    setRevalidationMeta(emptyRevalidationMeta())
  }, [])

  const setReportIdentity = useCallback(
    (nextProjectId, nextReportId) => {
      const nextProject = normId(nextProjectId)
      const nextReport = normId(nextReportId)
      if (nextProject === projectId && nextReport === reportId) return
      setProjectId(nextProject)
      setReportId(nextReport)
      resetReadSnapshots()
    },
    [projectId, reportId, resetReadSnapshots],
  )

  const clearSession = useCallback(() => {
    setProjectId(null)
    setReportId(null)
    acceptedPublicationGenerationRef.current = 0
    resetReadSnapshots()
  }, [resetReadSnapshots])

  /** Reset accepted generation when a new Saved Viewer instance mounts (layout provider persists). */
  const registerViewerPublicationLifecycle = useCallback(() => {
    acceptedPublicationGenerationRef.current = 0
  }, [])

  const publishReadSnapshot = useCallback(
    (input) => {
      const pid = normId(input?.projectId)
      const rid = normId(input?.reportId)
      if (!pid || !rid) return false

      const generation = input?.generation
      if (
        typeof generation === 'number'
        && isStaleReadSnapshotPublication(
          generation,
          acceptedPublicationGenerationRef.current,
        )
      ) {
        return false
      }
      if (typeof generation === 'number' && generation > acceptedPublicationGenerationRef.current) {
        acceptedPublicationGenerationRef.current = generation
      }

      const nextSnapshots = mergeReadSnapshotFields(input?.readSnapshots)
      const identityChanged = pid !== projectId || rid !== reportId

      setProjectId(pid)
      setReportId(rid)
      setReadSnapshots((previous) => {
        if (identityChanged) {
          return nextSnapshots
        }
        return {
          report: nextSnapshots.report ?? previous.report,
          project: nextSnapshots.project ?? previous.project,
          labour: nextSnapshots.labour ?? previous.labour,
          plant: nextSnapshots.plant ?? previous.plant,
          photoMetadata: nextSnapshots.photoMetadata ?? previous.photoMetadata,
          coverStoragePath:
            nextSnapshots.coverStoragePath ?? previous.coverStoragePath,
          signatureStoragePath:
            nextSnapshots.signatureStoragePath ?? previous.signatureStoragePath,
          branding: nextSnapshots.branding ?? previous.branding,
        }
      })
      setRevalidationMeta((previous) => ({
        loadedAt: Date.now(),
        version: (previous.version ?? 0) + 1,
        revalidationState: 'idle',
      }))
      return true
    },
    [projectId, reportId],
  )

  const value = useMemo(
    () => ({
      projectId,
      reportId,
      readSnapshots,
      revalidationMeta,
      setReportIdentity,
      clearSession,
      registerViewerPublicationLifecycle,
      publishReadSnapshot,
    }),
    [
      projectId,
      reportId,
      readSnapshots,
      revalidationMeta,
      setReportIdentity,
      clearSession,
      registerViewerPublicationLifecycle,
      publishReadSnapshot,
    ],
  )

  return (
    <SiteDiaryReportSessionContext.Provider value={value}>
      {children}
    </SiteDiaryReportSessionContext.Provider>
  )
}

export function useSiteDiaryReportSession() {
  const ctx = useContext(SiteDiaryReportSessionContext)
  if (!ctx) {
    throw new Error(
      'useSiteDiaryReportSession must be used within SiteDiarySessionProvider',
    )
  }
  return ctx
}
