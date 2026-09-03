'use client'

/**
 * React Current Area context — reusable across Site Diary, Survey, Progress, Snags, H&S.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  clearCurrentArea as clearStoredArea,
  currentAreaScopeKey,
  readCurrentArea,
  writeCurrentArea,
} from '@/lib/ai-annotation/current-area'

const CurrentAreaContext = createContext(null)

/**
 * @param {object} props
 * @param {string} props.projectId
 * @param {import('@/lib/ai-annotation/contexts').AnnotationContextId} [props.contextId]
 * @param {boolean} [props.shared] — if true, one Current Area for the whole project
 * @param {React.ReactNode} props.children
 */
export function CurrentAreaProvider({
  projectId,
  contextId = 'diary',
  shared = false,
  children,
}) {
  const scopeKey = useMemo(
    () => currentAreaScopeKey({ projectId, contextId, shared }),
    [projectId, contextId, shared],
  )

  const [area, setAreaState] = useState('')
  const [hydrated, setHydrated] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- ESLINT-E9 */
  useEffect(() => {
    if (!scopeKey) {
      setAreaState('')
      setHydrated(true)
      return
    }
    setAreaState(readCurrentArea(scopeKey))
    setHydrated(true)
  }, [scopeKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  const setArea = useCallback((next) => {
    const value = typeof next === 'string' ? next.trim() : ''
    setAreaState(value)
    if (scopeKey) writeCurrentArea(scopeKey, value)
  }, [scopeKey])

  const clearArea = useCallback(() => {
    setAreaState('')
    if (scopeKey) clearStoredArea(scopeKey)
  }, [scopeKey])

  const value = useMemo(() => ({
    area,
    setArea,
    clearArea,
    hasArea: Boolean(area),
    scopeKey,
    hydrated,
    projectId,
    contextId,
  }), [area, setArea, clearArea, scopeKey, hydrated, projectId, contextId])

  return (
    <CurrentAreaContext.Provider value={value}>
      {children}
    </CurrentAreaContext.Provider>
  )
}

/**
 * Access the persistent Current Area. Must be under CurrentAreaProvider
 * (AiLocationWalk provides one automatically when given projectId).
 */
export function useCurrentArea() {
  const ctx = useContext(CurrentAreaContext)
  if (!ctx) {
    throw new Error('useCurrentArea must be used within a CurrentAreaProvider')
  }
  return ctx
}

/** Optional access when provider may be absent. */
export function useCurrentAreaOptional() {
  return useContext(CurrentAreaContext)
}
