/**
 * Authoritative live Supabase column allowlists for Site Diary writes.
 *
 * Source: PostgREST OpenAPI from project epvkxavaxmzyskteecsv.supabase.co
 * Captured in docs/LIVE_SCHEMA_DAILY_REPORTS.json (do not invent columns).
 *
 * Live `daily_reports` does NOT have: is_draft, shift_type, actions_required, updated_at.
 * Writing unknown columns (e.g. is_draft) → PGRST204 and the entire UPDATE is aborted.
 */

export const LIVE_DAILY_REPORTS = {
  table: 'daily_reports',
  primaryKey: 'id',
  updateFilter: ['id'],
  ownerColumn: 'owner_id',
  required: [
    'id',
    'owner_id',
    'project_id',
    'report_date',
    'created_at',
    'equipment_hire',
    'hs_incidents',
    'rfis',
    'variations',
  ],
  columns: [
    'id',
    'owner_id',
    'project_id',
    'report_number',
    'report_date',
    'weather',
    'shift',
    'site_summary',
    'visitors',
    'delays_issues',
    'actions',
    'created_at',
    'company_reporting_for',
    'creator_name',
    'creator_role',
    'cover_photo_url',
    'signature_url',
    'branding_id',
    'brand_color',
    'brand_logo_url',
    'equipment_hire',
    'hs_incidents',
    'rfis',
    'variations',
  ],
}

export const LIVE_REPORT_LABOUR = {
  table: 'report_labour',
  columns: [
    'id',
    'owner_id',
    'report_id',
    'company',
    'trade',
    'count',
    'hours',
    'notes',
    'sequence',
  ],
  required: ['id', 'owner_id', 'report_id'],
}

export const LIVE_REPORT_PLANT = {
  table: 'report_plant',
  columns: [
    'id',
    'owner_id',
    'report_id',
    'item',
    'ref',
    'status',
    'notes',
    'sequence',
  ],
  required: ['id', 'owner_id', 'report_id'],
}

export const LIVE_REPORT_PHOTOS = {
  table: 'report_photos',
  columns: [
    'id',
    'owner_id',
    'report_id',
    'url',
    'caption',
    'location',
    'category',
    'sequence',
    'created_at',
    'layout',
    'rotation_degrees',
    'assigned_to',
  ],
  required: ['id', 'owner_id', 'report_id', 'url', 'created_at'],
  /** Present in app code / older migrations — NOT on live OpenAPI. */
  absentOnLive: ['annotations', 'overlay_path', 'storage_path', 'sequence_number'],
}

const DAILY_SET = new Set(LIVE_DAILY_REPORTS.columns)

/**
 * Map app field names onto live daily_reports columns and drop anything else.
 * Never emits is_draft / shift_type / actions_required.
 */
export function buildLiveDailyReportUpdatePayload(input) {
  const src = input || {}
  const raw = {
    project_id: src.project_id,
    report_number: src.report_number,
    report_date: src.report_date,
    weather: src.weather,
    shift: src.shift ?? src.shift_type ?? null,
    site_summary: src.site_summary,
    visitors: src.visitors,
    delays_issues: src.delays_issues,
    actions: src.actions ?? src.actions_required ?? null,
    company_reporting_for: src.company_reporting_for,
    creator_name: src.creator_name,
    creator_role: src.creator_role,
    cover_photo_url: src.cover_photo_url,
    signature_url: src.signature_url,
    branding_id: src.branding_id,
    brand_color: src.brand_color,
    brand_logo_url: src.brand_logo_url,
    equipment_hire: src.equipment_hire == null ? [] : src.equipment_hire,
    hs_incidents: src.hs_incidents == null ? [] : src.hs_incidents,
    rfis: src.rfis == null ? [] : src.rfis,
    variations: src.variations == null ? [] : src.variations,
  }

  const payload = {}
  const dropped = []
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (!DAILY_SET.has(key)) {
      dropped.push(key)
      continue
    }
    // Never write identity / ownership on UPDATE unless explicitly allowed later.
    if (key === 'id' || key === 'owner_id' || key === 'created_at') continue
    payload[key] = value
  }

  // equipment_hire is NOT NULL on live — always send an array.
  if (!Object.prototype.hasOwnProperty.call(payload, 'equipment_hire')) {
    payload.equipment_hire = []
  } else if (payload.equipment_hire == null) {
    payload.equipment_hire = []
  }

  for (const key of ['hs_incidents', 'rfis', 'variations']) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = []
    } else if (payload[key] == null) {
      payload[key] = []
    }
  }

  return { payload, dropped, liveColumns: LIVE_DAILY_REPORTS.columns }
}

export function pickLiveColumns(row, columnList) {
  const allow = new Set(columnList)
  const out = {}
  for (const [key, value] of Object.entries(row || {})) {
    if (allow.has(key)) out[key] = value
  }
  return out
}
