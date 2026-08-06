/**
 * Photo Workspace persistence adapters (P2A).
 *
 * Adapters only — no shared evidence_* database tables yet.
 * Site Diary report finalize remains finalizeSiteDiarySave (unchanged).
 *
 * @typedef {object} PhotoWorkspaceAdapter
 * @property {string} reportType
 * @property {string} persistenceNote — human explanation of what Save Area means today
 * @property {(locationWalk: object[], meta?: object) => object[]} toEvidenceGroups
 * @property {(groups: object[]) => object[]} toLocationWalk
 */

import {
  evidenceGroupsToLocationWalk,
  locationWalkToEvidenceGroups,
} from './model.js'
import { getPhotoWorkspaceContext } from './contexts.js'

/** @type {PhotoWorkspaceAdapter} */
export const diaryPhotoAdapter = {
  reportType: 'diary',
  persistenceNote:
    'Save Area stores the work area on this Site Diary screen. Photos upload and lock in when you tap Save Site Diary. Upload complete is not the same as Area saved or Site Diary saved.',
  toEvidenceGroups(locationWalk, meta = {}) {
    const ctx = getPhotoWorkspaceContext('diary')
    return locationWalkToEvidenceGroups(locationWalk, {
      reportType: 'diary',
      sectionKey: ctx.sectionKey,
      contextType: ctx.contextType,
      ...meta,
    })
  },
  toLocationWalk(groups) {
    return evidenceGroupsToLocationWalk(groups)
  },
}

/** Placeholder adapters — wired when those report types adopt PhotoWorkspace. */
export const surveyPhotoAdapter = {
  reportType: 'survey',
  persistenceNote:
    'Save Area will store survey areas on this screen. Full report save remains separate. (Not wired in P2A.)',
  toEvidenceGroups(locationWalk, meta = {}) {
    const ctx = getPhotoWorkspaceContext('survey')
    return locationWalkToEvidenceGroups(locationWalk, {
      reportType: 'survey',
      sectionKey: ctx.sectionKey,
      contextType: ctx.contextType,
      ...meta,
    })
  },
  toLocationWalk(groups) {
    return evidenceGroupsToLocationWalk(groups)
  },
}

export const progressPhotoAdapter = {
  reportType: 'progress',
  persistenceNote:
    'Save Area will store progress areas on this screen. Full report save remains separate. (Not wired in P2A.)',
  toEvidenceGroups(locationWalk, meta = {}) {
    const ctx = getPhotoWorkspaceContext('progress')
    return locationWalkToEvidenceGroups(locationWalk, {
      reportType: 'progress',
      sectionKey: ctx.sectionKey,
      contextType: ctx.contextType,
      ...meta,
    })
  },
  toLocationWalk(groups) {
    return evidenceGroupsToLocationWalk(groups)
  },
}

export const snagPhotoAdapter = {
  reportType: 'snag',
  persistenceNote:
    'Save Snag Item will store the item on this screen. Snag list persistence remains separate. (Not wired in P2A.)',
  toEvidenceGroups(locationWalk, meta = {}) {
    const ctx = getPhotoWorkspaceContext('snag')
    return locationWalkToEvidenceGroups(locationWalk, {
      reportType: 'snag',
      sectionKey: ctx.sectionKey,
      contextType: ctx.contextType,
      ...meta,
    })
  },
  toLocationWalk(groups) {
    return evidenceGroupsToLocationWalk(groups)
  },
}

export const healthSafetyPhotoAdapter = {
  reportType: 'healthSafety',
  persistenceNote:
    'Save Area will store inspection areas on this screen. H&S report save remains separate. (Not wired in P2A.)',
  toEvidenceGroups(locationWalk, meta = {}) {
    const ctx = getPhotoWorkspaceContext('healthSafety')
    return locationWalkToEvidenceGroups(locationWalk, {
      reportType: 'healthSafety',
      sectionKey: ctx.sectionKey,
      contextType: ctx.contextType,
      ...meta,
    })
  },
  toLocationWalk(groups) {
    return evidenceGroupsToLocationWalk(groups)
  },
}

const ADAPTERS = {
  diary: diaryPhotoAdapter,
  survey: surveyPhotoAdapter,
  progress: progressPhotoAdapter,
  snag: snagPhotoAdapter,
  healthSafety: healthSafetyPhotoAdapter,
}

/** @param {string} [reportType] */
export function getPhotoWorkspaceAdapter(reportType = 'diary') {
  return ADAPTERS[reportType] || diaryPhotoAdapter
}
