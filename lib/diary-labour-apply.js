/**
 * Edit-diary sign-in Apply → durable report_labour write.
 * Uses the same persist mapping as Save/Share. Does not touch autosave columns.
 */

import { replaceLabour } from './diary-save.js'
import { labourFormToPersistRows } from './diary-save-dirty.js'

export const LABOUR_APPLY_SAVE_FAIL_MESSAGE =
  'We couldn’t save the labour summary. The figures are still on this screen. Check your connection and tap Apply again.'

/**
 * @param {{ operatives?: number, hours?: number }} [totals]
 * @returns {string}
 */
export function labourApplySavedNotice(totals = {}) {
  const operatives = Number(totals.operatives) || 0
  const hours = Number(totals.hours) || 0
  const people = operatives === 1 ? 'operative' : 'operatives'
  if (hours > 0) return `${operatives} ${people} · ${hours} hrs saved.`
  return `${operatives} ${people} saved.`
}

/**
 * Replace report_labour for this diary with the applied form rows.
 * @returns {Promise<object[]>} persist-shaped rows (count / hours / sequence)
 */
export async function persistAppliedLabourRows(supabase, reportId, formRows) {
  if (!reportId) {
    throw new Error('missing-report-id')
  }
  const labourPayload = labourFormToPersistRows(formRows, reportId)
  await replaceLabour(supabase, reportId, labourPayload)
  return labourPayload
}
