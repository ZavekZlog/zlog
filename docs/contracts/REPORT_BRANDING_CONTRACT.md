# Report Branding Contract

**Layer:** C — Feature  
**Version:** 1.1.0  
**Date Updated:** 2026-09-06  
**Reason Updated:** Site Diary audit — reporting-company brand_color / logo remain authoritative for redesigned app/PDF  
**User Decision:** APPROVED — do not replace company branding with diary violet or Zlog orange  
**Previous Version:** 1.0.0  

**Status:** Binding for implemented Site Diary branding  

Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Screen: `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`

---

## Ownership

Branding association is **report-level** on `daily_reports`:

- `branding_id`
- `brand_color`
- `brand_logo_url`

Company profiles live in `company_brandings` (user-owned). A profile may be marked default for **new** setup defaults only.

---

## Rules

1. **Existing diary branding remains attached** when opening View/Edit.
2. **Normal Edit mode must not force branding reconfirmation** — no full `BrandingSelector` unless the user takes an explicit change action (`shouldShowBrandingSelector({ hasReportId: true, allowChangeBranding: false })` → false).
3. **Start from scratch** may load an explicit **default** company profile for logo/colour — not branding copied from the last opened diary.
4. **Use as Basis** may carry approved reusable branding fields from the source diary into the **new** diary ID only.
5. Changing branding requires a **separate explicit** user action.

---

## Setup

Setup exposes **Reporting Organisation** name and logo (upload / replace / remove) and stores paths/ids onto the draft on Continue — not onto `public.projects`. Live setup copy may still say Reporting Company until the authorised implementation phase.

## Colour authority (2026-09-06)

Reporting-company colour comes from `company_brandings.brand_color` snapshotted onto `daily_reports.brand_color` (with `brand_logo_url` / `branding_id`). PDF uses `resolvePdfReportBrandColor` then `resolvePdfAccent`.

That company colour remains **authoritative** for the redesigned app compact IA and PDF chrome.

Do **not**:

- invent a replacement palette
- paint report chrome with diary module violet (`REPORT_THEMES.diary` / `#8B5CF6`)
- paint report chrome with Zlog orange (`#FF5000` / `--action`)

Zlog identity stays secondary (compact workbench wordmark; PDF footer **Produced with Zlog**). Dashboard branding may remain stronger.

Later presentation work must apply the reporting-company colour to the compact redesigned structure without inflating it.
