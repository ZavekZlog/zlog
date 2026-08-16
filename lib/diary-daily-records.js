/**
 * Site Diary daily shorthand records — H&S / RFIs / Variations / Temporary Works.
 * Stored as JSONB on daily_reports for later weekly-report reuse.
 */

export const HS_INCIDENT_STATUSES = ['Open', 'Closed']
export const RFI_STATUSES = ['Open', 'Responded', 'Closed']
export const VARIATION_STATUSES = ['Identified', 'Instructed', 'Agreed', 'Closed']

export const TEMPORARY_WORKS_TYPES = [
  'Scaffold',
  'Hoarding',
  'Excavation support',
  'Temporary propping',
  'Edge protection',
  'Access platform',
  'Formwork / falsework',
  'Other',
]

export const TEMPORARY_WORKS_STATUSES = [
  'In place',
  'Inspected',
  'Modified',
  'Removed',
  'Issue identified',
]

export const TEMPORARY_WORKS_CHECK_RESULTS = [
  'Satisfactory',
  'Action required',
]

export const TEMPORARY_WORKS_SCAFFOLD_CHECKS = [
  'Checked today — satisfactory',
  'Formal inspection current',
  'Issue identified',
  'Not checked today',
]

/** Short-lived prior scaffold options → current wording on reopen. */
const LEGACY_SCAFFOLD_CHECK = {
  'Inspected today': 'Checked today — satisfactory',
  'Not inspected today': 'Not checked today',
}

export const TEMPORARY_WORKS_SCAFFOLD_TYPE = 'Scaffold'

function resolveScaffoldCheck(value) {
  const raw = textValue(value)
  if (TEMPORARY_WORKS_SCAFFOLD_CHECKS.includes(raw)) return raw
  return LEGACY_SCAFFOLD_CHECK[raw] || ''
}

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

export function emptyTemporaryWork() {
  return {
    key: newId(),
    id: null,
    type: '',
    location: '',
    status: '',
    reference: '',
    checkResult: '',
    notes: '',
    scaffoldCheck: '',
    scaffoldTag: '',
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

function textValue(value) {
  return value == null ? '' : String(value).trim()
}

function resolveTemporaryWorksType(item) {
  const typed = textValue(item?.type)
  if (TEMPORARY_WORKS_TYPES.includes(typed)) return typed
  const legacy = textValue(item?.item)
  if (TEMPORARY_WORKS_TYPES.includes(legacy)) return legacy
  return legacy ? 'Other' : ''
}

/**
 * Hydrate Temporary Works rows.
 * Structured fields are preferred. Legacy free-text Item / Inspection rows are
 * mapped into the closest structured fields without inventing new values.
 */
export function temporaryWorksFromDb(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => {
    const type = resolveTemporaryWorksType(item)
    const legacyItem = textValue(item?.item)
    const location = textValue(item?.location)
      || (type === 'Other' && legacyItem && !TEMPORARY_WORKS_TYPES.includes(legacyItem) ? legacyItem : '')
    const rawStatus = textValue(item?.status ?? item?.inspectionStatus ?? item?.inspection_status)
    const status = TEMPORARY_WORKS_STATUSES.includes(rawStatus) ? rawStatus : ''
    const checkResult = TEMPORARY_WORKS_CHECK_RESULTS.includes(textValue(item?.checkResult))
      ? textValue(item.checkResult)
      : TEMPORARY_WORKS_CHECK_RESULTS.includes(rawStatus)
        ? rawStatus
        : ''
    const notesParts = [
      textValue(item?.notes),
      !status && !checkResult && rawStatus ? rawStatus : '',
    ].filter(Boolean)

    const isScaffold = type === TEMPORARY_WORKS_SCAFFOLD_TYPE
    return {
      key: newId(),
      id: item?.id || null,
      type,
      location,
      status,
      reference: textValue(item?.reference),
      checkResult,
      notes: notesParts.join(' — '),
      scaffoldCheck: isScaffold ? resolveScaffoldCheck(item?.scaffoldCheck) : '',
      scaffoldTag: isScaffold ? textValue(item?.scaffoldTag) : '',
    }
  })
}

/**
 * Old rows predate the applicability flag. If records exist, treating that
 * legacy diary as applicable preserves its information on reopen.
 */
export function temporaryWorksApplicableFromDb(value, items) {
  if (value === true || value === false) return value
  return Array.isArray(items) && items.length > 0 ? true : null
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

export function temporaryWorkHasData(row) {
  return hasText(
    row?.type,
    row?.location,
    row?.status,
    row?.reference,
    row?.checkResult,
    row?.notes,
    row?.scaffoldCheck,
    row?.scaffoldTag,
    row?.item,
  )
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

/** Persistable JSON for daily_reports.temporary_works */
export function temporaryWorksPayload(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(temporaryWorkHasData)
    .map((row) => {
      const type = TEMPORARY_WORKS_TYPES.includes(row.type) ? row.type : ''
      const isScaffold = type === TEMPORARY_WORKS_SCAFFOLD_TYPE
      return {
        id: row.id || newId(),
        type: type || null,
        // Keep legacy `item` mirrored to type so older PDF/test consumers still
        // read a usable Item column without inventing content.
        item: type || null,
        location: textValue(row.location) || null,
        status: TEMPORARY_WORKS_STATUSES.includes(row.status) ? row.status : null,
        reference: textValue(row.reference) || null,
        checkResult: TEMPORARY_WORKS_CHECK_RESULTS.includes(row.checkResult)
          ? row.checkResult
          : null,
        notes: textValue(row.notes) || null,
        scaffoldCheck: isScaffold ? (resolveScaffoldCheck(row.scaffoldCheck) || null) : null,
        scaffoldTag: isScaffold ? (textValue(row.scaffoldTag) || null) : null,
      }
    })
}

/** Compact Inspection / Status cell for saved review and the established PDF table. */
export function temporaryWorkInspectionStatus(row) {
  return [
    textValue(row?.status),
    textValue(row?.checkResult),
    row?.type === TEMPORARY_WORKS_SCAFFOLD_TYPE ? textValue(row?.scaffoldCheck) : '',
  ].filter(Boolean).join(' · ')
}

/** Compact Notes cell including optional reference / scaffold tag. */
export function temporaryWorkNotesDisplay(row) {
  const refs = [
    textValue(row?.reference) ? `Ref: ${textValue(row.reference)}` : '',
    row?.type === TEMPORARY_WORKS_SCAFFOLD_TYPE && textValue(row?.scaffoldTag)
      ? `Scaffold: ${textValue(row.scaffoldTag)}`
      : '',
  ].filter(Boolean)
  const notes = textValue(row?.notes)
  return [...refs, notes].filter(Boolean).join(' — ')
}

/**
 * Flatten Temporary Works into the established PDF schedule columns:
 * Item | Location | Inspection / Status | Notes
 */
export function temporaryWorksForPdf(items) {
  const rows = temporaryWorksFromDb(items)
  return rows.map((row) => ({
    item: textValue(row.type),
    location: textValue(row.location),
    status: temporaryWorkInspectionStatus(row),
    notes: temporaryWorkNotesDisplay(row),
  })).filter((row) => hasText(row.item, row.location, row.status, row.notes))
}

/** Section order contract: these titles appear before Site summary. */
export const DIARY_DAILY_RECORD_SECTION_ORDER = [
  'H&S Incidents / Observations',
  'RFIs',
  'Variations',
  'Site summary',
]
