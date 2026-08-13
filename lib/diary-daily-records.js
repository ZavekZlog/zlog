/**
 * Site Diary daily shorthand records — H&S / RFIs / Variations.
 * Stored as JSONB on daily_reports for later weekly-report reuse.
 */

export const HS_INCIDENT_STATUSES = ['Open', 'Closed']
export const RFI_STATUSES = ['Open', 'Responded', 'Closed']
export const VARIATION_STATUSES = ['Identified', 'Instructed', 'Agreed', 'Closed']

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyHsIncident() {
  return {
    key: newId(),
    id: null,
    description: '',
    actionTaken: '',
    assignedTo: '',
    status: 'Open',
  }
}

export function emptyRfi() {
  return {
    key: newId(),
    id: null,
    reference: '',
    description: '',
    raisedTo: '',
    status: 'Open',
  }
}

export function emptyVariation() {
  return {
    key: newId(),
    id: null,
    reference: '',
    description: '',
    instructedBy: '',
    status: 'Identified',
  }
}

/** UI rows from DB — empty array means no entries (no placeholder row). */
export function hsIncidentsFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => ({
    key: newId(),
    id: item?.id || null,
    description: item?.description ?? '',
    actionTaken: item?.actionTaken ?? item?.action_taken ?? '',
    assignedTo: item?.assignedTo ?? item?.assigned_to ?? '',
    status: HS_INCIDENT_STATUSES.includes(item?.status) ? item.status : 'Open',
  }))
}

export function rfisFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => ({
    key: newId(),
    id: item?.id || null,
    reference: item?.reference ?? '',
    description: item?.description ?? '',
    raisedTo: item?.raisedTo ?? item?.raised_to ?? '',
    status: RFI_STATUSES.includes(item?.status) ? item.status : 'Open',
  }))
}

export function variationsFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => ({
    key: newId(),
    id: item?.id || null,
    reference: item?.reference ?? '',
    description: item?.description ?? '',
    instructedBy: item?.instructedBy ?? item?.instructed_by ?? '',
    status: VARIATION_STATUSES.includes(item?.status) ? item.status : 'Identified',
  }))
}

function hasText(...parts) {
  return parts.some((p) => String(p || '').trim())
}

export function hsIncidentHasData(row) {
  return hasText(row?.description, row?.actionTaken, row?.assignedTo)
    || (row?.status && row.status !== 'Open')
}

export function rfiHasData(row) {
  return hasText(row?.reference, row?.description, row?.raisedTo)
    || (row?.status && row.status !== 'Open')
}

export function variationHasData(row) {
  return hasText(row?.reference, row?.description, row?.instructedBy)
    || (row?.status && row.status !== 'Identified')
}

/** Persistable JSON for daily_reports.hs_incidents */
export function hsIncidentsPayload(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(hsIncidentHasData)
    .map((row) => ({
      id: row.id || newId(),
      description: String(row.description || '').trim() || null,
      actionTaken: String(row.actionTaken || '').trim() || null,
      assignedTo: String(row.assignedTo || '').trim() || null,
      status: HS_INCIDENT_STATUSES.includes(row.status) ? row.status : 'Open',
      photoUrl: null,
    }))
}

export function rfisPayload(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(rfiHasData)
    .map((row) => ({
      id: row.id || newId(),
      reference: String(row.reference || '').trim() || null,
      description: String(row.description || '').trim() || null,
      raisedTo: String(row.raisedTo || '').trim() || null,
      status: RFI_STATUSES.includes(row.status) ? row.status : 'Open',
    }))
}

export function variationsPayload(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(variationHasData)
    .map((row) => ({
      id: row.id || newId(),
      reference: String(row.reference || '').trim() || null,
      description: String(row.description || '').trim() || null,
      instructedBy: String(row.instructedBy || '').trim() || null,
      status: VARIATION_STATUSES.includes(row.status) ? row.status : 'Identified',
    }))
}

/** Section order contract: these titles appear before Site summary. */
export const DIARY_DAILY_RECORD_SECTION_ORDER = [
  'H&S Incidents / Observations',
  'RFIs',
  'Variations',
  'Site summary',
]
