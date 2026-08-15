/**
 * Shared Photo Workspace — per-report-type labels and section copy (P2A).
 * Architecture stays shared; users only see construction language.
 */

/** @typedef {import('./model.js').PhotoReportType} PhotoReportType */

/**
 * @typedef {object} PhotoWorkspaceContext
 * @property {PhotoReportType} id
 * @property {string} reportLabel
 * @property {string} sectionTitle
 * @property {string} sectionIntro
 * @property {import('./model.js').EvidenceContextType} contextType
 * @property {string} sectionKey
 * @property {string} addGroup
 * @property {string} createGroup
 * @property {string} groupNameLabel
 * @property {string} groupNamePlaceholder
 * @property {string} groupDescriptionLabel
 * @property {string} groupDescriptionPlaceholder
 * @property {string} saveGroup
 * @property {string} areaSavedTitle
 * @property {string} areaSavedHint
 * @property {string} addAnother
 * @property {string} continueReport
 * @property {string} enterNameError
 * @property {string} cancelGroup
 */

/** @type {Record<PhotoReportType, PhotoWorkspaceContext>} */
export const PHOTO_WORKSPACE_CONTEXTS = {
  diary: {
    id: 'diary',
    reportLabel: 'Site Diary',
    sectionTitle: 'Photo Evidence',
    sectionIntro:
      'Add work areas and photos as evidence of work undertaken. Save each area before continuing.',
    contextType: 'work_area',
    sectionKey: 'work_photos',
    addGroup: 'Add Work Area',
    createGroup: 'Add Work Area',
    groupNameLabel: 'Work area name',
    groupNamePlaceholder: 'e.g. Ground Floor Reception',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Work carried out, materials used, or other site notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'Continue',
    enterNameError: 'Enter a work area name',
    cancelGroup: 'Cancel',
  },
  survey: {
    id: 'survey',
    reportLabel: 'Site Survey',
    sectionTitle: 'Photo Evidence',
    sectionIntro:
      'Add survey areas and photos as condition evidence. Save each area before continuing.',
    contextType: 'survey_area',
    sectionKey: 'survey_evidence',
    addGroup: 'Add Survey Area',
    createGroup: 'Add Survey Area',
    groupNameLabel: 'Survey area name',
    groupNamePlaceholder: 'e.g. North elevation',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Condition observed, access issues, or other survey notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another survey area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'No More Areas — Continue',
    enterNameError: 'Enter a survey area name',
    cancelGroup: 'Cancel',
  },
  progress: {
    id: 'progress',
    reportLabel: 'Site Progress',
    sectionTitle: 'Photo Evidence',
    sectionIntro:
      'Add progress areas and photos as stage evidence. Save each area before continuing.',
    contextType: 'progress_area',
    sectionKey: 'progress_evidence',
    addGroup: 'Add Progress Area',
    createGroup: 'Add Progress Area',
    groupNameLabel: 'Progress area name',
    groupNamePlaceholder: 'e.g. Block A frame',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Stage of works reached, or other progress notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another progress area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'No More Areas — Continue',
    enterNameError: 'Enter a progress area name',
    cancelGroup: 'Cancel',
  },
  snag: {
    id: 'snag',
    reportLabel: 'Site Snag List',
    sectionTitle: 'Photo Evidence',
    sectionIntro:
      'Add snag items and photos as defect evidence. Save each item before continuing.',
    contextType: 'snag_item',
    sectionKey: 'snag_evidence',
    addGroup: 'Add Snag Item',
    createGroup: 'Add Snag Item',
    groupNameLabel: 'Snag item',
    groupNamePlaceholder: 'e.g. Flat 12 — bathroom tile',
    groupDescriptionLabel: 'Notes for this item',
    groupDescriptionPlaceholder: 'Defect details and what needs rectifying',
    saveGroup: 'Save Snag Item',
    areaSavedTitle: '✓ Snag item saved.',
    areaSavedHint: 'Add another snag item or continue your report.',
    addAnother: 'Add Another Snag Item',
    continueReport: 'No More Items — Continue',
    enterNameError: 'Enter a snag item name',
    cancelGroup: 'Cancel',
  },
  healthSafety: {
    id: 'healthSafety',
    reportLabel: 'Site H&S Report',
    sectionTitle: 'Photo Evidence',
    sectionIntro:
      'Add inspection areas or hazards and photos as safety evidence. Save each area before continuing.',
    contextType: 'inspection_area',
    sectionKey: 'hs_evidence',
    addGroup: 'Add Inspection Area',
    createGroup: 'Add Inspection Area',
    groupNameLabel: 'Inspection area / hazard',
    groupNamePlaceholder: 'e.g. Scaffold ladder access',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Hazard, finding, or inspection notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'No More Areas — Continue',
    enterNameError: 'Enter an inspection area or hazard name',
    cancelGroup: 'Cancel',
  },
}

/** @param {string} [id] */
export function getPhotoWorkspaceContext(id) {
  if (id && PHOTO_WORKSPACE_CONTEXTS[id]) return PHOTO_WORKSPACE_CONTEXTS[id]
  return PHOTO_WORKSPACE_CONTEXTS.diary
}

/**
 * Labels object consumed by AiLocationWalk / PhotoWorkspace UI.
 * @param {PhotoReportType | string} [reportType]
 */
export function getPhotoWorkspaceLabels(reportType = 'diary') {
  const ctx = getPhotoWorkspaceContext(reportType)
  return {
    sectionTitle: ctx.sectionTitle,
    sectionIntro: ctx.sectionIntro,
    addGroup: ctx.addGroup,
    createGroup: ctx.createGroup,
    groupNameLabel: ctx.groupNameLabel,
    groupNamePlaceholder: ctx.groupNamePlaceholder,
    groupDescriptionLabel: ctx.groupDescriptionLabel,
    groupDescriptionPlaceholder: ctx.groupDescriptionPlaceholder,
    saveGroup: ctx.saveGroup,
    areaSavedTitle: ctx.areaSavedTitle,
    areaSavedHint: ctx.areaSavedHint,
    addAnother: ctx.addAnother,
    continueReport: ctx.continueReport,
    enterNameError: ctx.enterNameError,
    cancelGroup: ctx.cancelGroup,
  }
}
