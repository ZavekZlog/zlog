export async function runDiaryWorkbenchBackNavigation({
  explicitPersistenceActive = false,
  navigationInFlight = false,
  payloadDirty = false,
  beginNavigation = () => {},
  endNavigation = () => {},
  flushPendingAutosave = async () => {},
  isPayloadDirty = () => false,
  isExplicitPersistenceActive = () => false,
  navigate = () => {},
} = {}) {
  if (explicitPersistenceActive) return { status: 'blocked-explicit-persistence' }
  if (navigationInFlight) return { status: 'blocked-navigation-in-flight' }

  beginNavigation()
  let navigationInvoked = false
  try {
    if (payloadDirty) {
      await flushPendingAutosave()
      if (isExplicitPersistenceActive()) {
        return { status: 'blocked-explicit-persistence' }
      }
      if (isPayloadDirty()) return { status: 'blocked-persistence-incomplete' }
    }

    navigate()
    navigationInvoked = true
    return {
      status: payloadDirty
        ? 'navigated-after-persistence'
        : 'navigated-clean',
    }
  } catch (error) {
    return { status: 'blocked-persistence-failed', error }
  } finally {
    if (!navigationInvoked) endNavigation()
  }
}
