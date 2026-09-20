/**
 * Deterministic Site Diary PDF content snapshot + fingerprint (v1 normalization, v2 hash namespace).
 * Does not generate or alter PDF output — identity only for future durable PDF jobs/cache.
 */

import { createHash } from 'node:crypto'
import { normalizeRotationDegrees } from './diary-pdf-layout.js'

export const SITE_DIARY_PDF_FINGERPRINT_NAMESPACE = 'zlog-site-diary-pdf:v2:'

const VOLATILE_URL_RE = /^(blob:|data:|https?:\/\/)/i

function trimString(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

function normalizeFiniteNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeExplicitBoolean(value) {
  if (value === true || value === false) return value
  return null
}

function isVolatileUrl(value) {
  const s = trimString(value)
  if (!s) return true
  return VOLATILE_URL_RE.test(s)
}

/** @param {unknown} value */
function normalizeDurableStoragePath(value) {
  const s = trimString(value)
  if (!s || isVolatileUrl(s)) return null
  return s
}

function pickFirstDurablePath(...candidates) {
  for (const candidate of candidates) {
    const path = normalizeDurableStoragePath(candidate)
    if (path) return path
  }
  return null
}

function compareLex(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'en')
}

function compareNumberNullLast(a, b) {
  const na = a == null ? Number.POSITIVE_INFINITY : Number(a)
  const nb = b == null ? Number.POSITIVE_INFINITY : Number(b)
  if (na !== nb) return na - nb
  return 0
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeWorkPhotoRow(row) {
  if (!row || typeof row !== 'object') return null
  const storagePath = pickFirstDurablePath(
    row.storage_path,
    row.storagePath,
    row.url,
    row.path,
  )
  if (!storagePath) return null

  return {
    storage_path: storagePath,
    processing_version: trimString(row.processing_version ?? row.processingVersion),
    report_byte_size: normalizeFiniteNumber(row.report_byte_size ?? row.reportByteSize),
    sequence: normalizeFiniteNumber(row.sequence ?? row.sequence_number ?? row.sequenceNumber),
    caption: trimString(row.caption ?? row.acceptedDescription),
    location: trimString(row.location ?? row.area),
    layout: trimString(row.layout),
    rotation: normalizeRotationDegrees(
      row.rotation_degrees ?? row.rotationDegrees ?? row.rotation ?? 0,
    ),
    assigned_to: trimString(row.assigned_to ?? row.assignedTo),
  }
}

/**
 * @param {unknown} raw
 * @returns {ReturnType<typeof normalizeWorkPhotoRow>[]}
 */
function collectWorkPhotos(raw) {
  const out = []
  const seen = new Set()

  const pushPhoto = (photo) => {
    const normalized = normalizeWorkPhotoRow(photo)
    if (!normalized) return
    const key = `${normalized.sequence ?? ''}|${normalized.storage_path}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(normalized)
  }

  if (Array.isArray(raw?.photos)) {
    for (const photo of raw.photos) pushPhoto(photo)
  }
  if (Array.isArray(raw?.workPhotos)) {
    for (const photo of raw.workPhotos) pushPhoto(photo)
  }
  if (Array.isArray(raw?.report_photos)) {
    for (const photo of raw.report_photos) pushPhoto(photo)
  }
  if (Array.isArray(raw?.photoAreas)) {
    for (const area of raw.photoAreas) {
      if (!area || typeof area !== 'object') continue
      if (area.persisted === false) continue
      for (const photo of area.photos || []) pushPhoto(photo)
    }
  }

  out.sort((a, b) => {
    const bySeq = compareNumberNullLast(a.sequence, b.sequence)
    if (bySeq !== 0) return bySeq
    return compareLex(a.storage_path, b.storage_path)
  })

  return out
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeLabourRow(row) {
  if (!row || typeof row !== 'object') return null
  const trade = trimString(row.trade)
  const company = trimString(row.company)
  const hours = normalizeFiniteNumber(row.hours)
  const count = normalizeFiniteNumber(row.count ?? row.headcount)
  const sequence = normalizeFiniteNumber(row.sequence)
  if (!trade && !company && hours == null && count == null) return null
  return {
    sequence,
    trade,
    company,
    count,
    hours,
    notes: trimString(row.notes),
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizePlantRow(row) {
  if (!row || typeof row !== 'object') return null
  const item = trimString(row.item)
  const ref = trimString(row.ref ?? row.reference)
  const status = trimString(row.status)
  const sequence = normalizeFiniteNumber(row.sequence)
  if (!item && !ref && !status) return null
  return {
    sequence,
    item,
    ref,
    status,
    notes: trimString(row.notes),
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeEquipmentRow(row) {
  if (!row || typeof row !== 'object') return null
  const description = trimString(row.description)
  const supplier = trimString(row.supplier)
  const quantity = normalizeFiniteNumber(row.quantity)
  const status = trimString(row.status)
  if (!description && !supplier && quantity == null && !status) return null
  return {
    description,
    supplier,
    quantity,
    status,
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeTemporaryWorkRow(row) {
  if (!row || typeof row !== 'object') return null
  const type = trimString(row.type)
  const location = trimString(row.location)
  const status = trimString(row.status)
  const reference = trimString(row.reference ?? row.ref)
  const checkResult = trimString(row.checkResult ?? row.check_result)
  const notes = trimString(row.notes)
  const scaffoldCheck = trimString(row.scaffoldCheck ?? row.scaffold_check)
  const scaffoldTag = trimString(row.scaffoldTag ?? row.scaffold_tag)
  const stableId = trimString(row.id ?? row.key)
  const sequence = normalizeFiniteNumber(row.sequence)
  if (!type && !location && !status && !reference && !scaffoldCheck && !scaffoldTag) return null
  return {
    stable_id: stableId,
    sequence,
    type,
    location,
    status,
    reference,
    check_result: checkResult,
    notes,
    scaffold_check: scaffoldCheck,
    scaffold_tag: scaffoldTag,
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizePermitRow(row) {
  if (!row || typeof row !== 'object') return null
  const stableId = trimString(row.id ?? row.key)
  const sequence = normalizeFiniteNumber(row.sequence ?? row.order)
  const permitType = trimString(row.permitType ?? row.permit_type ?? row.type)
  const reference = trimString(row.reference)
  const issuedTo = trimString(row.issuedTo ?? row.issued_to)
  const status = trimString(row.status)
  const formPhotoPath = pickFirstDurablePath(
    row.formPhotoPath,
    row.form_photo_path,
  )
  if (!stableId && !permitType && !reference && !status && !formPhotoPath) return null
  return {
    stable_id: stableId,
    sequence,
    permit_type: permitType,
    reference,
    issued_to: issuedTo,
    status,
    form_photo_path: formPhotoPath,
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function normalizeProvenanceRow(row) {
  if (!row || typeof row !== 'object') return null
  const evidencePath = pickFirstDurablePath(row.evidencePath, row.evidence_path)
  const sourceRow = normalizeFiniteNumber(row.sourceRow ?? row.source_row)
  if (!evidencePath || sourceRow == null) return null
  return {
    evidence_path: evidencePath,
    source_row: Math.trunc(sourceRow),
    trade: trimString(row.trade) ?? 'Visitor',
    time_in: trimString(row.timeIn ?? row.time_in) ?? '—',
    time_out: trimString(row.timeOut ?? row.time_out) ?? '—',
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} fields
 */
function normalizeJsonRecordRow(row, fields) {
  if (!row || typeof row !== 'object') return null
  /** @type {Record<string, unknown>} */
  const out = { stable_id: trimString(row.id ?? row.key) }
  let hasData = out.stable_id != null
  for (const field of fields) {
    const snake = field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
    const raw = row[field] ?? row[snake]
    let value = null
    if (typeof raw === 'boolean') value = raw
    else if (typeof raw === 'number') value = normalizeFiniteNumber(raw)
    else value = trimString(raw)
    out[snake] = value
    if (value != null) hasData = true
  }
  return hasData ? out : null
}

function sortLabour(rows) {
  return [...rows].sort((a, b) => {
    const bySeq = compareNumberNullLast(a.sequence, b.sequence)
    if (bySeq !== 0) return bySeq
    const byTrade = compareLex(a.trade, b.trade)
    if (byTrade !== 0) return byTrade
    return compareLex(a.company, b.company)
  })
}

function sortPlant(rows) {
  return [...rows].sort((a, b) => {
    const bySeq = compareNumberNullLast(a.sequence, b.sequence)
    if (bySeq !== 0) return bySeq
    const byItem = compareLex(a.item, b.item)
    if (byItem !== 0) return byItem
    return compareLex(a.ref, b.ref)
  })
}

function sortEquipment(rows) {
  return [...rows].sort((a, b) => {
    const byDesc = compareLex(a.description, b.description)
    if (byDesc !== 0) return byDesc
    const bySup = compareLex(a.supplier, b.supplier)
    if (bySup !== 0) return bySup
    const byQty = compareNumberNullLast(a.quantity, b.quantity)
    if (byQty !== 0) return byQty
    return compareLex(a.status, b.status)
  })
}

function sortTemporaryWorks(rows) {
  return [...rows].sort((a, b) => {
    const bySeq = compareNumberNullLast(a.sequence, b.sequence)
    if (bySeq !== 0) return bySeq
    const byId = compareLex(a.stable_id, b.stable_id)
    if (byId !== 0) return byId
    return compareLex(a.reference, b.reference)
  })
}

function sortPermits(rows) {
  return [...rows].sort((a, b) => {
    const bySeq = compareNumberNullLast(a.sequence, b.sequence)
    if (bySeq !== 0) return bySeq
    const byId = compareLex(a.stable_id, b.stable_id)
    if (byId !== 0) return byId
    return compareLex(a.reference, b.reference)
  })
}

function sortProvenance(rows) {
  return [...rows].sort((a, b) => {
    const byPath = compareLex(a.evidence_path, b.evidence_path)
    if (byPath !== 0) return byPath
    return (a.source_row ?? 0) - (b.source_row ?? 0)
  })
}

function sortJsonRows(rows) {
  return [...rows].sort((a, b) => {
    const byId = compareLex(a.stable_id, b.stable_id)
    if (byId !== 0) return byId
    return compareLex(JSON.stringify(a), JSON.stringify(b))
  })
}

function normalizeRecordList(raw, mapper, sorter) {
  const list = Array.isArray(raw) ? raw : []
  const mapped = []
  for (const item of list) {
    const row = mapper(item)
    if (row) mapped.push(row)
  }
  return sorter(mapped)
}

function readNested(source, ...keys) {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

/**
 * Pure normalization of PDF-relevant persisted Site Diary state.
 * Does not mutate the input object.
 *
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function normalizeSiteDiaryPdfSnapshot(raw) {
  const report = raw?.report && typeof raw.report === 'object' ? raw.report : raw
  const project = raw?.project && typeof raw.project === 'object' ? raw.project : raw

  const labourSource = readNested(raw, 'labour', 'labourRows', 'report_labour') ?? []
  const plantSource = readNested(raw, 'plant', 'plantRows', 'report_plant') ?? []

  const equipmentSource =
    readNested(raw, 'equipment_hire', 'equipmentHire', 'equipmentHireRows') ?? []

  const temporaryWorksSource =
    readNested(raw, 'temporary_works', 'temporaryWorks') ?? []

  const permitsSource = readNested(raw, 'permits') ?? []

  const hsSource = readNested(raw, 'hs_incidents', 'hsIncidents') ?? []
  const rfiSource = readNested(raw, 'rfis') ?? []
  const variationSource = readNested(raw, 'variations') ?? []

  const provenanceSource =
    readNested(raw, 'visitors_register_provenance', 'visitorsRegisterProvenance') ?? []

  const reportingCompanyName = trimString(
    readNested(raw, 'reportingCompany', 'reporting_company')
      ?? readNested(report, 'reporting_company_name', 'reportingCompanyName')
      ?? readNested(project, 'reporting_company_name'),
  )

  const logoPath = pickFirstDurablePath(
    readNested(report, 'brand_logo_url', 'brandLogoUrl'),
    readNested(raw, 'logoStoragePath', 'logo_storage_path', 'brand_logo_url'),
  )

  const coverPath = pickFirstDurablePath(
    readNested(report, 'cover_photo_url', 'coverPhotoUrl'),
    readNested(raw, 'coverStoragePath', 'cover_storage_path', 'coverPhotoPath'),
  )

  const signaturePath = pickFirstDurablePath(
    readNested(report, 'signature_url', 'signatureUrl'),
    readNested(raw, 'signatureStoragePath', 'signature_storage_path'),
  )

  const signInPath = pickFirstDurablePath(
    readNested(report, 'sign_in_sheet_url', 'signInSheetUrl'),
    readNested(raw, 'signInSheetUrl', 'sign_in_sheet_url', 'attendanceRegisterPath'),
  )

  const reportNumber = trimString(
    readNested(report, 'report_number', 'reportNumber'),
  )

  const includeReportIdInContent = raw?.includeReportIdInPdf === true
    || report?.includeReportIdInPdf === true

  const includeProjectIdInContent = raw?.includeProjectIdInPdf === true
    || project?.includeProjectIdInPdf === true

  return {
    report: {
      report_id: includeReportIdInContent
        ? trimString(readNested(report, 'id', 'reportId', 'report_id'))
        : null,
      report_number: reportNumber,
      report_date: trimString(readNested(report, 'report_date', 'reportDate')),
      weather: trimString(readNested(report, 'weather') ?? readNested(raw, 'weather')),
      shift: trimString(readNested(report, 'shift') ?? readNested(raw, 'shift')),
      site_summary: trimString(
        readNested(report, 'site_summary', 'siteSummary') ?? readNested(raw, 'siteSummary'),
      ),
      current_phase: trimString(
        readNested(report, 'current_phase', 'currentPhase') ?? readNested(raw, 'currentPhase'),
      ),
    },
    project: {
      project_id: includeProjectIdInContent
        ? trimString(readNested(project, 'id', 'projectId', 'project_id'))
        : null,
      name: trimString(readNested(project, 'name', 'projectName')),
      project_reference: trimString(
        readNested(project, 'project_reference', 'projectReference'),
      ),
      site_address: trimString(
        readNested(project, 'site_address', 'siteAddress', 'projectAddress'),
      ),
      client_pm: trimString(
        readNested(project, 'client_pm', 'clientPm', 'projectManager'),
      ),
      start_date: trimString(
        readNested(project, 'start_date', 'startDate', 'projectStartDate'),
      ),
      planned_completion_date: trimString(
        readNested(project, 'planned_completion_date', 'plannedCompletionDate', 'projectPlannedCompletionDate'),
      ),
      working_days_per_week: normalizeFiniteNumber(
        readNested(project, 'working_days_per_week', 'workingDaysPerWeek'),
      ),
    },
    reporting: {
      company_name: reportingCompanyName,
      reporting_on_behalf_of: trimString(
        readNested(report, 'company_reporting_for', 'companyReportingFor')
          ?? readNested(raw, 'reportingOnBehalfOf', 'reporting_on_behalf_of'),
      ),
      creator_name: trimString(
        readNested(report, 'creator_name', 'creatorName') ?? readNested(raw, 'author'),
      ),
      creator_role: trimString(
        readNested(report, 'creator_role', 'creatorRole') ?? readNested(raw, 'authorRole'),
      ),
      brand_color: trimString(
        readNested(report, 'brand_color', 'brandColor') ?? readNested(raw, 'brandColor'),
      ),
      logo_storage_path: logoPath,
    },
    cover: {
      storage_path: coverPath,
      processing_version: trimString(
        readNested(report, 'cover_processing_version', 'coverProcessingVersion')
          ?? readNested(raw, 'coverProcessingVersion'),
      ),
    },
    signature: {
      storage_path: signaturePath,
    },
    sign_in_sheet: {
      storage_path: signInPath,
    },
    visitors: trimString(readNested(report, 'visitors') ?? readNested(raw, 'visitors')),
    visitors_register_provenance: sortProvenance(
      normalizeRecordList(provenanceSource, normalizeProvenanceRow, (rows) => rows),
    ),
    delays_issues: trimString(
      readNested(report, 'delays_issues', 'delaysIssues') ?? readNested(raw, 'delaysIssues'),
    ),
    actions: trimString(readNested(report, 'actions') ?? readNested(raw, 'actions')),
    labour: sortLabour(normalizeRecordList(labourSource, normalizeLabourRow, (rows) => rows)),
    plant: sortPlant(normalizeRecordList(plantSource, normalizePlantRow, (rows) => rows)),
    equipment_hire: sortEquipment(
      normalizeRecordList(equipmentSource, normalizeEquipmentRow, (rows) => rows),
    ),
    temporary_works_applicable: normalizeExplicitBoolean(
      readNested(report, 'temporary_works_applicable', 'temporaryWorksApplicable')
        ?? readNested(raw, 'temporaryWorksApplicable'),
    ),
    temporary_works: sortTemporaryWorks(
      normalizeRecordList(temporaryWorksSource, normalizeTemporaryWorkRow, (rows) => rows),
    ),
    hs_incidents: sortJsonRows(
      normalizeRecordList(
        hsSource,
        (row) => normalizeJsonRecordRow(row, [
          'description',
          'actionTaken',
          'assignedTo',
          'status',
        ]),
        (rows) => rows,
      ),
    ),
    rfis: sortJsonRows(
      normalizeRecordList(
        rfiSource,
        (row) => normalizeJsonRecordRow(row, [
          'reference',
          'description',
          'raisedTo',
          'status',
        ]),
        (rows) => rows,
      ),
    ),
    variations: sortJsonRows(
      normalizeRecordList(
        variationSource,
        (row) => normalizeJsonRecordRow(row, [
          'reference',
          'description',
          'instructedBy',
          'status',
        ]),
        (rows) => rows,
      ),
    ),
    permits: sortPermits(
      normalizeRecordList(permitsSource, normalizePermitRow, (rows) => rows),
    ),
    photos: collectWorkPhotos(raw),
  }
}

/**
 * Recursively serialize with lexicographically sorted object keys (compact JSON).
 * @param {unknown} value
 */
export function canonicalSerializeSiteDiaryPdfSnapshot(value) {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'string' || t === 'boolean') return JSON.stringify(value)
  if (t === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerializeSiteDiaryPdfSnapshot(item)).join(',')}]`
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort()
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalSerializeSiteDiaryPdfSnapshot(value[key])}`)
      .join(',')
    return `{${body}}`
  }
  return 'null'
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function siteDiaryPdfSnapshotCanonicalJson(raw) {
  return canonicalSerializeSiteDiaryPdfSnapshot(normalizeSiteDiaryPdfSnapshot(raw))
}

/**
 * @param {ReturnType<typeof normalizeSiteDiaryPdfSnapshot>} normalized
 */
export function siteDiaryPdfFingerprintFromNormalized(normalized) {
  const canonical = canonicalSerializeSiteDiaryPdfSnapshot(normalized)
  return createHash('sha256')
    .update(`${SITE_DIARY_PDF_FINGERPRINT_NAMESPACE}${canonical}`, 'utf8')
    .digest('hex')
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function buildSiteDiaryPdfFingerprint(raw) {
  return siteDiaryPdfFingerprintFromNormalized(normalizeSiteDiaryPdfSnapshot(raw))
}

export const SITE_DIARY_PDF_SNAPSHOT_V1 = {
  version: 1,
  fingerprintNamespace: SITE_DIARY_PDF_FINGERPRINT_NAMESPACE,
  normalize: normalizeSiteDiaryPdfSnapshot,
  canonicalJson: siteDiaryPdfSnapshotCanonicalJson,
  canonicalSerialize: canonicalSerializeSiteDiaryPdfSnapshot,
  fingerprint: buildSiteDiaryPdfFingerprint,
  fingerprintFromNormalized: siteDiaryPdfFingerprintFromNormalized,
}
