/**
 * Report branding snapshot fields for daily_reports (and sibling report tables).
 * Never invent wipe-all-nulls when selection is missing — callers must omit branding keys.
 * Logo may be persisted even when brandingId is temporarily unset.
 */
export function brandingPayload(selection) {
  if (!selection) {
    return {}
  }
  const hasAny =
    selection.brandingId ||
    selection.brandColor ||
    selection.brandLogoUrl ||
    selection.companyName
  if (!hasAny) {
    return {}
  }
  return {
    branding_id: selection.brandingId || null,
    brand_color: selection.brandColor || null,
    brand_logo_url: selection.brandLogoUrl || null,
  }
}
