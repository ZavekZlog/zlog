/**
 * One document-lifetime import of SiteDiaryWorkbenchSurface.
 * Viewer preload and the shell dynamic loader share this promise.
 * A rejection clears the cache so a later attempt can retry.
 */

export function createWorkbenchModuleLoader(startImport) {
  let workbenchModulePromise = null
  return function loadWorkbenchModule() {
    if (workbenchModulePromise) return workbenchModulePromise
    let started
    try {
      started = startImport()
    } catch (error) {
      return Promise.reject(error)
    }
    const pending = Promise.resolve(started)
    const settled = pending.catch((error) => {
      if (workbenchModulePromise === settled) workbenchModulePromise = null
      throw error
    })
    workbenchModulePromise = settled
    return workbenchModulePromise
  }
}

const loadSharedWorkbenchModule = createWorkbenchModuleLoader(
  () => import('@/components/site-diary/SiteDiaryWorkbenchSurface'),
)

export function loadSiteDiaryWorkbenchSurface() {
  return loadSharedWorkbenchModule()
}
