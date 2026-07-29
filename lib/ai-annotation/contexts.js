/**
 * Report-specific AI annotation contexts.
 * One registry entry per Zlog report module — prompts only differ here.
 */

/** @typedef {'diary' | 'snag' | 'survey' | 'progress' | 'healthSafety'} AnnotationContextId */

/**
 * @typedef {object} AnnotationContext
 * @property {AnnotationContextId} id
 * @property {string} label — human module name for prompts / UI
 * @property {string} sectionTitle — default Location walk section title
 * @property {string} focus — module-specific vision guidance appended to the base system prompt
 * @property {string} descriptionLabel
 * @property {string} descriptionPlaceholder
 */

/** @type {Record<AnnotationContextId, AnnotationContext>} */
export const ANNOTATION_CONTEXTS = {
  diary: {
    id: 'diary',
    label: 'Site Diary',
    sectionTitle: 'Location walk',
    focus:
      'Emphasise daily progress, work underway, labour/plant visible, materials, and site conditions. Suitable as a work-photo caption.',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'AI description appears here — edit if needed',
  },
  snag: {
    id: 'snag',
    label: 'Snag List',
    sectionTitle: 'Location walk',
    focus:
      'Emphasise defects, incomplete work, damage, poor finishes, and what needs rectifying. Phrase as a clear snag description.',
    descriptionLabel: 'Snag description',
    descriptionPlaceholder: 'AI snag description — edit if needed',
  },
  survey: {
    id: 'survey',
    label: 'Site Survey',
    sectionTitle: 'Location walk',
    focus:
      'Emphasise observations, measurements cues, condition, finishes, and survey notes. Neutral and factual.',
    descriptionLabel: 'Observation',
    descriptionPlaceholder: 'AI observation — edit if needed',
  },
  progress: {
    id: 'progress',
    label: 'Site Progress',
    sectionTitle: 'Location walk',
    focus:
      'Emphasise stage of completion, installed works, outstanding areas, and week-to-week progress evidence.',
    descriptionLabel: 'Progress note',
    descriptionPlaceholder: 'AI progress note — edit if needed',
  },
  healthSafety: {
    id: 'healthSafety',
    label: 'Health & Safety',
    sectionTitle: 'Location walk',
    focus:
      'Emphasise hazards, PPE, housekeeping, edge protection, signage, and compliance or unsafe conditions. Be precise and cautionary.',
    descriptionLabel: 'H&S note',
    descriptionPlaceholder: 'AI H&S note — edit if needed',
  },
}

/** @param {string} [id] */
export function getAnnotationContext(id) {
  if (id && ANNOTATION_CONTEXTS[id]) return ANNOTATION_CONTEXTS[id]
  return ANNOTATION_CONTEXTS.diary
}

export const ANNOTATION_CONTEXT_IDS = Object.keys(ANNOTATION_CONTEXTS)
