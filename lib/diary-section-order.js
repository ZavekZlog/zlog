/**
 * Locked in-app Site Diary core section order.
 *
 * Same logical sequence for compose/edit, saved read-only review, and
 * "Use as basis for New Diary" (same workbench renderer).
 * PDF order is separate and is not changed here.
 */

export const DIARY_IN_APP_CORE_SECTION_ORDER = [
  'Weather',
  'Labour',
  'Visitors',
  'H&S Incidents / Observations',
  'RFIs',
  'Variations',
  'Site Summary',
]

/** Accepted compose/edit DOM markers. H&S/RFIs/Variations live in DiaryDailyRecordSections. */
export const DIARY_EDIT_CORE_DOM_MARKERS = {
  weather: 'title="Weather"',
  labour: 'title="Labour"',
  visitors: 'title="Visitors"',
  hsHost: '<DiaryDailyRecordSections',
  siteSummary: 'title="Site summary"',
}

/** Accepted saved/read-only review DOM markers (view/page.jsx). */
export const DIARY_SAVED_REVIEW_CORE_DOM_MARKERS = {
  weather: 'title="Weather"',
  labour: 'title="Labour on Site"',
  hs: 'title="H&S Incidents / Observations"',
  rfis: 'title="RFIs"',
  variations: 'title="Variations"',
  siteSummary: 'title="Site Summary"',
}
