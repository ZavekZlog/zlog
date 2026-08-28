/**
 * Reporting Company identity — one coherent source of truth for name + logo + metadata.
 *
 * Root cause of CBRE/Outsource Pro mismatches:
 * - Name was read from company_brandings default (never updated on setup save)
 * - Logo was read/written on daily_reports.brand_logo_url independently
 *
 * Rule: name and logo must always resolve from the same identity snapshot.
 */

/**
 * Pure resolve — never mix a default-profile name with a different report logo.
 *
 * @param {{
 *   report?: { branding_id?: string|null, brand_logo_url?: string|null, brand_color?: string|null }|null,
 *   brandingRow?: { id?: string, company_name?: string, logo_url?: string|null, brand_color?: string|null }|null,
 *   defaultProfile?: { id?: string, company_name?: string, logo_url?: string|null, brand_color?: string|null }|null,
 * }} [opts]
 */
export function resolveReportBrandColor({ report = null, brandingRow = null } = {}) {
  const reportColor = report?.brand_color || null
  const linkedColor = brandingRow?.brand_color || null
  const reportLogo = report?.brand_logo_url || null
  const linkedLogo = brandingRow?.logo_url || null

  // Exact same stored logo asset means both colours describe the same identity.
  // Prefer the linked profile colour so a corrected extraction repairs legacy
  // report snapshots without sampling the logo during PDF generation.
  if (linkedColor && reportLogo && linkedLogo && reportLogo === linkedLogo) {
    return linkedColor
  }

  // The report snapshot remains primary when it points at a historical/different
  // logo. A linked profile is only a deterministic fallback when the snapshot
  // has no colour of its own.
  return reportColor || linkedColor
}

/**
 * Legacy setup uploads used `branding/setup-<timestamp>` and never sampled the
 * selected logo. Their stored colour may belong to the previous company, so it
 * is not a trustworthy PDF accent. Returning null invokes the PDF neutral
 * fallback without mutating the historical report.
 */
export function resolvePdfReportBrandColor({ report = null, brandingRow = null } = {}) {
  const logoPath = String(report?.brand_logo_url || '')
  if (/\/branding\/setup-\d+\.[^/]+$/i.test(logoPath)) return null
  return resolveReportBrandColor({ report, brandingRow })
}

export function resolveReportingCompanyIdentity({
  report = null,
  brandingRow = null,
  defaultProfile = null,
} = {}) {
  const linked = brandingRow || null
  const fallback = defaultProfile || null

  // Prefer the branding row linked to this report when present.
  if (linked?.id) {
    return {
      brandingId: linked.id,
      companyName: String(linked.company_name || '').trim(),
      logoStoragePath: report?.brand_logo_url || linked.logo_url || null,
      brandColor: resolveReportBrandColor({ report, brandingRow: linked }),
    }
  }

  const reportLogo = report?.brand_logo_url || null
  const profileLogo = fallback?.logo_url || null

  // Report has a logo that does not match the default profile → do not use profile name.
  if (reportLogo && profileLogo && reportLogo !== profileLogo) {
    return {
      brandingId: report?.branding_id || fallback?.id || null,
      companyName: '',
      logoStoragePath: reportLogo,
      brandColor: report?.brand_color || fallback?.brand_color || null,
    }
  }

  if (reportLogo && !profileLogo) {
    return {
      brandingId: report?.branding_id || fallback?.id || null,
      companyName: String(fallback?.company_name || '').trim(),
      logoStoragePath: reportLogo,
      brandColor: report?.brand_color || fallback?.brand_color || null,
    }
  }

  if (fallback?.id) {
    return {
      brandingId: fallback.id,
      companyName: String(fallback.company_name || '').trim(),
      logoStoragePath: reportLogo || profileLogo || null,
      brandColor: report?.brand_color || fallback.brand_color || null,
    }
  }

  return {
    brandingId: report?.branding_id || null,
    companyName: '',
    logoStoragePath: reportLogo,
    brandColor: report?.brand_color || null,
  }
}

/**
 * Sticky identity for a brand-new diary — latest saved report branding wins,
 * else the user's default company_brandings profile.
 */
export function stickyReportingCompanyFromLatest({
  latestReport = null,
  latestBrandingRow = null,
  defaultProfile = null,
} = {}) {
  const reportingOnBehalfOf = String(latestReport?.company_reporting_for || '').trim()
  const latestProjectId = latestReport?.project_id || null
  if (latestReport && (latestBrandingRow || latestReport.brand_logo_url || latestReport.branding_id)) {
    return {
      ...resolveReportingCompanyIdentity({
        report: latestReport,
        brandingRow: latestBrandingRow,
        defaultProfile,
      }),
      reportingOnBehalfOf,
      latestProjectId,
    }
  }
  return {
    ...resolveReportingCompanyIdentity({ defaultProfile }),
    reportingOnBehalfOf,
    latestProjectId,
  }
}

/**
 * Most recently *used* Reporting On Behalf Of for this signed-in user.
 * Skips null/blank rows so empty Use-as-Basis drafts do not erase a prior value.
 */
export async function fetchLatestReportingOnBehalfOf(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ''

  const { data, error } = await supabase
    .from('daily_reports')
    .select('company_reporting_for, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25)
  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  for (const row of rows) {
    const value = String(row?.company_reporting_for || '').trim()
    if (value) return value
  }
  return ''
}

/**
 * Assert name/logo pair coherence for tests and guards.
 * Mismatch = name from company A with logo path known to belong to company B.
 */
export function reportingCompanyIdentityIsCoherent({ companyName, logoStoragePath, expectedName, expectedLogoPath }) {
  const name = String(companyName || '').trim()
  const logo = logoStoragePath || null
  if (expectedName != null && name !== String(expectedName).trim()) return false
  if (expectedLogoPath !== undefined && logo !== expectedLogoPath) return false
  return true
}

/**
 * Upsert the user's default company_brandings so name + logo stay paired.
 * Returns the snapshot to write onto daily_reports.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function persistReportingCompanyIdentity(supabase, {
  companyName = '',
  logoUrl = null,
  brandingId = null,
  brandColor = null,
} = {}) {
  const name = String(companyName || '').trim()
  const color = brandColor || '#FF5000'
  const logo = logoUrl || null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('You must be signed in')
  }

  if (!name && !logo && !brandingId) {
    return {
      brandingId: null,
      brandColor: null,
      brandLogoUrl: null,
      companyName: '',
    }
  }

  let rowId = brandingId || null

  // Clear other defaults first — unique partial index allows only one is_default per user.
  if (rowId || name) {
    await supabase
      .from('company_brandings')
      .update({ is_default: false })
      .eq('user_id', user.id)
  }

  if (rowId) {
    const { error: updateError } = await supabase
      .from('company_brandings')
      .update({
        ...(name ? { company_name: name } : {}),
        logo_url: logo,
        brand_color: color,
        is_default: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId)
      .eq('user_id', user.id)
    if (updateError) throw updateError
  } else if (name) {
    const { data: created, error: insertError } = await supabase
      .from('company_brandings')
      .insert({
        user_id: user.id,
        company_name: name,
        logo_url: logo,
        brand_color: color,
        is_default: true,
      })
      .select('id, company_name, logo_url, brand_color')
      .single()
    if (insertError) throw insertError
    rowId = created.id
  } else {
    // Logo-only update against current default, if any.
    const { data: def } = await supabase
      .from('company_brandings')
      .select('id, company_name, logo_url, brand_color')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (def?.id) {
      rowId = def.id
      const { error: updateError } = await supabase
        .from('company_brandings')
        .update({
          logo_url: logo,
          brand_color: color,
          is_default: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rowId)
      if (updateError) throw updateError
    }
  }

  return {
    brandingId: rowId,
    brandColor: color,
    brandLogoUrl: logo,
    companyName: name,
  }
}

/**
 * Load sticky Reporting Company for a new Site Diary setup.
 */
export async function fetchStickyReportingCompany(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return resolveReportingCompanyIdentity({})
  }

  const { data: defaultProfile } = await supabase
    .from('company_brandings')
    .select('id, company_name, logo_url, brand_color, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: latestReport } = await supabase
    .from('daily_reports')
    .select('project_id, branding_id, brand_logo_url, brand_color, company_reporting_for, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let latestBrandingRow = null
  if (latestReport?.branding_id) {
    const { data } = await supabase
      .from('company_brandings')
      .select('id, company_name, logo_url, brand_color')
      .eq('id', latestReport.branding_id)
      .maybeSingle()
    latestBrandingRow = data
  }

  const sticky = stickyReportingCompanyFromLatest({
    latestReport,
    latestBrandingRow,
    defaultProfile,
  })

  // New Site Diary ROB: newest non-empty value across recent reports (9fff9ac).
  // The latest row alone can be blank; skip empty rows rather than hiding older values.
  const reportingOnBehalfOf = await fetchLatestReportingOnBehalfOf(supabase)

  return {
    ...sticky,
    reportingOnBehalfOf,
  }
}

/**
 * Load Reporting Company for Project & Report Details of an existing diary.
 */
export async function fetchReportingCompanyForReport(supabase, report) {
  let brandingRow = null
  if (report?.branding_id) {
    const { data } = await supabase
      .from('company_brandings')
      .select('id, company_name, logo_url, brand_color')
      .eq('id', report.branding_id)
      .maybeSingle()
    brandingRow = data
  }

  const { data: { user } } = await supabase.auth.getUser()
  let defaultProfile = null
  if (user) {
    const { data } = await supabase
      .from('company_brandings')
      .select('id, company_name, logo_url, brand_color, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()
    defaultProfile = data
  }

  return resolveReportingCompanyIdentity({
    report,
    brandingRow,
    defaultProfile,
  })
}
