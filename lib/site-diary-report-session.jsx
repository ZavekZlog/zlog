'use client'

/**
 * Site Diary report-session boundary (structural S1+).
 * Persistent across /dashboard/project/[id]/diary/* routes via diary layout.
 *
 * S1: provider mount only — no DB hydrate, no Viewer/Workbench consumers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

const SiteDiaryReportSessionContext = createContext(null)

export function SiteDiarySessionProvider({ children }) {
  const [projectId, setProjectId] = useState(null)
  const [reportId, setReportId] = useState(null)
  const [readSnapshots, setReadSnapshots] = useState(() => ({
    ...EMPTY_READ_SNAPSHOTS,
  }))
  const [revalidationMeta, setRevalidationMeta] = useState(emptyRevalidationMeta)

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
    resetReadSnapshots()
  }, [resetReadSnapshots])

  const value = useMemo(
    () => ({
      projectId,
      reportId,
      readSnapshots,
      revalidationMeta,
      setReportIdentity,
      clearSession,
    }),
    [
      projectId,
      reportId,
      readSnapshots,
      revalidationMeta,
      setReportIdentity,
      clearSession,
    ],
  )

  return (
    <SiteDiaryReportSessionContext.Provider value={value}>
      {children}
    </SiteDiaryReportSessionContext.Provider>
  )
}

/**
 * Future Viewer / Workbench / shell surfaces only (not used in S1).
 */
export function useSiteDiaryReportSession() {
  const ctx = useContext(SiteDiaryReportSessionContext)
  if (!ctx) {
    throw new Error(
      'useSiteDiaryReportSession must be used within SiteDiarySessionProvider',
    )
  }
  return ctx
}
