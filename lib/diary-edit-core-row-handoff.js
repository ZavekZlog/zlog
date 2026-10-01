/**
 * Unit 1A — retain the raw project row and daily_reports row the Viewer already fetched.
 * Not labour, plant, photos, signed URLs, or the SDSC shadow.
 */

let activeViewerGeneration = null
let slot = null

export function beginCoreRowHandoff(viewerGeneration) {
  activeViewerGeneration = viewerGeneration
  slot = null
}

function identityMatches(input) {
  return Boolean(
    input
    && input.userId
    && input.projectId
    && input.reportId
    && input.viewerGeneration != null
    && input.project
    && input.report
    && String(input.project.id || '') === String(input.projectId)
    && String(input.report.id || '') === String(input.reportId)
    && (!input.report.project_id || String(input.report.project_id) === String(input.projectId)),
  )
}

export function publishCoreRowHandoff(input) {
  if (!identityMatches(input) || input.viewerGeneration !== activeViewerGeneration) return false
  slot = {
    userId: String(input.userId),
    projectId: String(input.projectId),
    reportId: String(input.reportId),
    viewerGeneration: input.viewerGeneration,
    hydrationSessionId: null,
    project: input.project,
    report: input.report,
  }
  return true
}

export function bindCoreRowHandoffSession({
  hydrationSessionId = '',
  projectId = '',
  reportId = '',
  viewerGeneration = null,
} = {}) {
  if (!slot || !hydrationSessionId || viewerGeneration == null) return false
  if (slot.viewerGeneration !== viewerGeneration) return false
  if (String(slot.projectId) !== String(projectId)) return false
  if (String(slot.reportId) !== String(reportId)) return false
  slot = { ...slot, hydrationSessionId: String(hydrationSessionId) }
  return true
}

export function hasBoundCoreRowHandoff({
  projectId = '',
  reportId = '',
  hydrationSessionId = '',
} = {}) {
  if (!slot?.hydrationSessionId || !hydrationSessionId) return false
  return String(slot.projectId) === String(projectId)
    && String(slot.reportId) === String(reportId)
    && String(slot.hydrationSessionId) === String(hydrationSessionId)
    && Boolean(slot.project)
    && Boolean(slot.report)
}

export function readEligibleCoreRowHandoff({
  userId = '',
  projectId = '',
  reportId = '',
  hydrationSessionId = '',
} = {}) {
  if (!userId || !hasBoundCoreRowHandoff({ projectId, reportId, hydrationSessionId })) return null
  if (String(slot.userId) !== String(userId)) return null
  if (String(slot.report.id) !== String(reportId)) return null
  if (String(slot.project.id) !== String(projectId)) return null
  if (slot.report.project_id && String(slot.report.project_id) !== String(projectId)) return null
  return slot
}
